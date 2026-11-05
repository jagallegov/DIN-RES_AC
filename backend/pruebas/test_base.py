import unittest
from datetime import date

import pandas as pd
import psycopg

from apoyo import LECTOR, SEDE_MEDELLIN, BaseTemporal, base, cargar_filas, fila, requiere_base
from tablero.basedatos.migraciones import ErrorMigracion, migraciones, migrar
from tablero.etl.carga import COLUMNAS, filas_para_copia, valor_para_copia

ESQUEMAS = ['fuentes', 'gobierno', 'indicadores']


class PruebaValoresParaCopia(unittest.TestCase):
    def test_convierte_nulos_fechas_y_escalares(self):
        self.assertIsNone(valor_para_copia(None))
        self.assertIsNone(valor_para_copia(pd.NA))
        self.assertIsNone(valor_para_copia(float('nan')))
        self.assertEqual(valor_para_copia(pd.Timestamp(2024, 2, 5)), date(2024, 2, 5))
        entero = valor_para_copia(pd.array([7], dtype='Int64')[0])
        self.assertEqual((entero, type(entero)), (7, int))
        self.assertEqual(valor_para_copia('Sede Bogotá'), 'Sede Bogotá')

    def test_filas_siguen_el_orden_de_las_columnas_de_carga(self):
        filas = list(filas_para_copia(base(fila(promedio_calificaciones=None))))
        self.assertEqual(len(filas), 1)
        self.assertEqual(len(filas[0]), len(COLUMNAS))
        registro = dict(zip(COLUMNAS, filas[0]))
        self.assertEqual(registro['cod_asignatura'], '1000004-B')
        self.assertEqual(registro['cupos_ofertados'], 40)
        self.assertEqual(registro['fecha_apertura_acta'], date(2024, 2, 5))
        self.assertIsNone(registro['promedio_calificaciones'])


@requiere_base
class PruebaMigraciones(unittest.TestCase):
    def setUp(self):
        self.base = BaseTemporal()

    def tearDown(self):
        self.base.eliminar()

    def migrar(self):
        with psycopg.connect(self.base.url) as conexion:
            return migrar(conexion, LECTOR)

    def test_crea_los_tres_esquemas_y_se_aplica_una_sola_vez(self):
        self.assertEqual(self.migrar(), [nombre for nombre, _ in migraciones()])
        self.assertEqual(self.migrar(), [])
        esquemas = self.base.consultar(
            "select schema_name from information_schema.schemata where schema_name = any(%s) order by 1", [ESQUEMAS])
        self.assertEqual([esquema for (esquema,) in esquemas], ESQUEMAS)

    def test_rechaza_una_migracion_que_cambio_despues_de_aplicarse(self):
        self.migrar()
        self.base.ejecutar("update gobierno.migraciones set huella = 'otra' where nombre = '001_gobierno.sql'")
        with self.assertRaisesRegex(ErrorMigracion, '001_gobierno.sql cambió'):
            self.migrar()

    def test_sin_rol_de_lectura_migra_igual(self):
        with psycopg.connect(self.base.url) as conexion:
            self.assertEqual(len(migrar(conexion, 'rol_que_no_existe')), len(migraciones()))


@requiere_base
class PruebaBaseDatos(unittest.TestCase):
    def setUp(self):
        self.base = BaseTemporal()

    def tearDown(self):
        self.base.eliminar()

    def cargar(self, *filas):
        return cargar_filas(self.base.url, *filas)

    def en_curso(self):
        return [p for (p,) in self.base.consultar('select periodo from indicadores.estado_periodos where en_curso order by 1')]

    def version(self):
        return self.base.consultar('select version from gobierno.estado')[0][0]

    def test_una_segunda_carga_no_repite_las_migraciones(self):
        self.cargar(fila())
        self.cargar(fila())
        self.assertEqual(self.base.consultar('select count(*) from fuentes.registros'), [(1,)])
        self.assertEqual(self.base.consultar('select count(*) from gobierno.cargas'), [(2,)])
        self.assertEqual(self.base.consultar('select count(*) from gobierno.migraciones'), [(len(migraciones()),)])

    def test_registros_ofertados_excluye_los_que_no_tienen_cupos_ni_inscritos(self):
        self.cargar(fila(), fila(cod_asignatura='A2', cupos_ofertados='0', nro_inscritos_iniciales='0'),
                    fila(cod_asignatura='A3', cupos_ofertados='0', nro_inscritos_iniciales='4'))
        self.assertEqual(self.base.consultar('select count(*) from indicadores.registros_ofertados'), [(2,)])

    def test_periodo_en_curso_con_mayoria_de_matricula_sin_resultado(self):
        self.cargar(fila(nro_mat_acta_final='100', nro_sin_resultado_acta_final='10', nro_aprobados_acta_final='50'),
                    fila(periodo='2024-2S', nro_mat_acta_final='100', nro_sin_resultado_acta_final='51',
                         nro_aprobados_acta_final='40'),
                    fila(periodo='2025-1S', nro_mat_acta_final='100', nro_sin_resultado_acta_final='50',
                         nro_aprobados_acta_final='40'))
        self.assertEqual(self.en_curso(), ['2024-2S'])

    def test_periodo_en_curso_suma_todos_sus_registros_y_admite_matricula_cero(self):
        self.cargar(fila(nro_mat_acta_final='10', nro_sin_resultado_acta_final='10', nro_aprobados_acta_final='0'),
                    fila(cod_asignatura='A2', nro_mat_acta_final='90', nro_sin_resultado_acta_final='0'),
                    fila(periodo='2026-1A', nro_mat_acta_final='0', nro_sin_resultado_acta_final='0',
                         nro_aprobados_acta_final='0'))
        self.assertEqual(self.en_curso(), ['2026-1A'])

    def test_el_umbral_de_periodos_en_curso_es_configurable(self):
        self.cargar(fila(nro_mat_acta_final='100', nro_sin_resultado_acta_final='30', nro_aprobados_acta_final='50'))
        self.assertEqual(self.en_curso(), [])
        self.base.ejecutar('update gobierno.parametros set umbral_en_curso = 0.2')
        self.assertEqual(self.en_curso(), ['2024-1S'])

    def test_los_catalogos_toman_el_nombre_del_periodo_mas_reciente(self):
        self.cargar(fila(nombre_uab='DEPARTAMENTO DE MATEMATICAS', asignatura='CALCULO'),
                    fila(periodo='2025-1S'))
        self.assertEqual(self.base.consultar('select nombre from gobierno.uabs'), [('Departamento de Matemáticas',)])
        self.assertEqual(self.base.consultar('select nombre from gobierno.asignaturas'), [('CÁLCULO DIFERENCIAL',)])

    def test_las_restricciones_rechazan_valores_invalidos(self):
        self.cargar(fila())
        with self.assertRaises(psycopg.errors.CheckViolation):
            self.base.ejecutar('update fuentes.registros set cupos = -1')
        with self.assertRaises(psycopg.errors.CheckViolation):
            self.base.ejecutar('update fuentes.registros set promedio = 5.5')

    def test_cada_cambio_aumenta_la_version(self):
        self.cargar(fila())
        version_inicial = self.version()
        with psycopg.connect(self.base.url) as cambio:
            with cambio.transaction():
                cambio.execute('update fuentes.registros set cupos = cupos + 1')
                cambio.execute('update fuentes.registros set inscritos = inscritos + 1')
        self.assertEqual(self.version(), version_inicial + 2)
        self.base.ejecutar('update gobierno.parametros set umbral_en_curso = 0.4')
        self.assertEqual(self.version(), version_inicial + 3)

    def test_una_carga_sube_la_version(self):
        primera = self.cargar(fila())
        segunda = self.cargar(fila(cupos_ofertados='60'))
        self.assertGreater(segunda.version, primera.version)
        self.assertEqual(self.version(), segunda.version)

    def test_el_rol_de_lectura_solo_puede_consultar(self):
        self.cargar(fila())
        with psycopg.connect(self.base.url_lectura, autocommit=True) as lector:
            self.assertEqual(lector.execute('select count(*) from indicadores.registros_ofertados').fetchone(), (1,))
            self.assertEqual(lector.execute('select count(*) from gobierno.cargas').fetchone(), (1,))
            with self.assertRaises(psycopg.errors.InsufficientPrivilege):
                lector.execute('delete from fuentes.registros')
            with self.assertRaises(psycopg.errors.InsufficientPrivilege):
                lector.execute('update gobierno.parametros set umbral_en_curso = 0.9')


@requiere_base
class PruebaResultados(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.base = BaseTemporal()
        cargar_filas(
            cls.base.url,
            fila(),
            fila(cod_asignatura='A2', cupos_ofertados='10', nro_inscritos_iniciales='12', nro_cupos_cancelados='0',
                 nro_mat_acta_final='12', nro_sin_resultado_acta_final='2', nro_aprobados_acta_final='9',
                 promedio_calificaciones=None),
            fila(cod_asignatura='B1', cupos_ofertados='0', nro_inscritos_iniciales='5', nro_cupos_cancelados='1',
                 nro_mat_acta_final='4', nro_aprobados_acta_final='4', promedio_calificaciones='4.5', **SEDE_MEDELLIN),
            fila(periodo='2024-2S', cupos_ofertados='20', nro_inscritos_iniciales='15', nro_cupos_cancelados='2',
                 nro_mat_acta_final='10', nro_sin_resultado_acta_final='10', nro_aprobados_acta_final='0',
                 promedio_calificaciones=None),
            fila(cod_asignatura='A3', cupos_ofertados='0', nro_inscritos_iniciales='0'),
        )

    @classmethod
    def tearDownClass(cls):
        cls.base.eliminar()

    def resultado(self, periodo, sede):
        with psycopg.connect(self.base.url_lectura, autocommit=True, row_factory=psycopg.rows.dict_row) as lector:
            fila_resultado = lector.execute(
                'select * from indicadores.resultados_periodo_sede where periodo = %s and sede is not distinct from %s',
                [periodo, sede]).fetchone()
        return {clave: float(valor) if valor is not None and not isinstance(valor, str) else valor
                for clave, valor in fila_resultado.items()}

    def comparar(self, obtenido, esperado):
        for clave, valor in esperado.items():
            with self.subTest(indicador=clave):
                if valor is None:
                    self.assertIsNone(obtenido[clave])
                else:
                    self.assertAlmostEqual(obtenido[clave], valor, places=9)

    def test_periodo_cerrado_de_todas_las_sedes(self):
        self.comparar(self.resultado('2024-1S', None), {
            'asignaturas': 3, 'cupos': 50, 'inscritos': 52, 'tasa_ocupacion': 90, 'cupo_completo': 50,
            'inscritos_cerrados': 52, 'cancelaciones': 4, 'matricula_final': 48, 'tasa_cancelacion': 4 / 52 * 100,
            'sin_cancelaciones': 100 / 3, 'matricula_con_resultado': 46, 'aprobados': 37, 'reprobados': 9,
            'tasa_aprobacion': 37 / 46 * 100, 'promedio': 3.7,
        })

    def test_periodo_cerrado_de_una_sede(self):
        resultado = self.resultado('2024-1S', '1101')
        self.assertEqual(resultado['nombre_sede'], 'Sede Bogotá')
        self.comparar(resultado, {
            'asignaturas': 2, 'cupos': 50, 'inscritos': 47, 'tasa_ocupacion': 90, 'cupo_completo': 50,
            'inscritos_cerrados': 47, 'cancelaciones': 3, 'matricula_final': 44, 'tasa_cancelacion': 3 / 47 * 100,
            'sin_cancelaciones': 50, 'matricula_con_resultado': 42, 'aprobados': 33, 'reprobados': 9,
            'tasa_aprobacion': 33 / 42 * 100, 'promedio': 3.6,
        })

    def test_periodo_en_curso_solo_tiene_indicadores_de_oferta(self):
        self.comparar(self.resultado('2024-2S', None), {
            'asignaturas': 1, 'cupos': 20, 'inscritos': 15, 'tasa_ocupacion': 75, 'cupo_completo': 0,
            'inscritos_cerrados': None, 'cancelaciones': None, 'matricula_final': None, 'tasa_cancelacion': None,
            'sin_cancelaciones': None, 'matricula_con_resultado': None, 'aprobados': None, 'reprobados': None,
            'tasa_aprobacion': None, 'promedio': None,
        })


if __name__ == '__main__':
    unittest.main()
