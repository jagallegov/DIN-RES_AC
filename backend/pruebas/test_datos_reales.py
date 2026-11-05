import contextlib
import io
import json
import unittest

import psycopg
from fastapi.testclient import TestClient

from apoyo import RAIZ, BaseTemporal, base_disponible, etl
from tablero.api.aplicacion import crear_aplicacion

REPORTES = RAIZ / 'reportes'
DATOS_REFERENCIA = RAIZ / 'frontend' / 'pruebas' / 'datos'

CIFRAS_PUBLICADAS = {
    'S': {
        'asignaturas': 11019, 'cupos': 1963977, 'inscritos': 1432821, 'tasa_ocupacion': 72.90732019774163,
        'cupo_completo': 15.44965775325075, 'inscritos_cerrados': 1192241, 'cancelaciones': 71368,
        'matricula_final': 1186351, 'tasa_cancelacion': 5.986038057741681, 'sin_cancelaciones': 58.06508458646616,
        'matricula_con_resultado': 1186053, 'aprobados': 1087981, 'reprobados': 98072,
        'tasa_aprobacion': 91.73122954876384, 'promedio': 3.982110324525388,
    },
    'A': {
        'asignaturas': 734, 'cupos': 35858, 'inscritos': 10057, 'tasa_ocupacion': 28.03558480673769,
        'cupo_completo': 5.244252873563219, 'inscritos_cerrados': 6642, 'cancelaciones': 74, 'matricula_final': 6586,
        'tasa_cancelacion': 1.1141222523336345, 'sin_cancelaciones': 96.50499286733239,
        'matricula_con_resultado': 6575, 'aprobados': 6547, 'reprobados': 28, 'tasa_aprobacion': 99.57414448669202,
        'promedio': 4.5598786324786325,
    },
}

TOTALES_POR_TIPO = '''
select
  count(distinct c.asignatura_id) as asignaturas,
  sum(c.cupos) as cupos,
  sum(c.inscritos) as inscritos,
  100.0 * sum(c.inscritos_en_cupo) / nullif(sum(c.cupos_ofertados), 0) as tasa_ocupacion,
  100.0 * sum(c.registros_con_cupo_completo) / nullif(sum(c.registros_con_cupo), 0) as cupo_completo,
  sum(c.inscritos_cerrados) as inscritos_cerrados,
  sum(c.cancelaciones) as cancelaciones,
  sum(c.matricula_final) as matricula_final,
  100.0 * sum(c.cancelaciones) / nullif(sum(c.inscritos_cerrados), 0) as tasa_cancelacion,
  100.0 * sum(c.registros_sin_cancelacion) / nullif(sum(c.registros_con_inscritos), 0) as sin_cancelaciones,
  sum(c.matricula_con_resultado) as matricula_con_resultado,
  sum(c.aprobados) as aprobados,
  sum(c.matricula_con_resultado) - sum(c.aprobados) as reprobados,
  100.0 * sum(c.aprobados) / nullif(sum(c.matricula_con_resultado), 0) as tasa_aprobacion,
  sum(c.notas_en_centesimas)::numeric / nullif(sum(c.con_nota), 0) / 100 as promedio
from indicadores.componentes c
join gobierno.periodos p on p.codigo = c.periodo
where p.tipo = %s
'''

hay_reportes = len(list(REPORTES.glob('*.xlsx'))) == len(etl.SEDES) and (DATOS_REFERENCIA / 'meta.json').is_file()


@unittest.skipUnless(hay_reportes and base_disponible(),
                     'requiere los nueve reportes en reportes/, los datos de frontend/pruebas/datos y la base de pruebas')
class PruebaDatosReales(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.base = BaseTemporal()
        with contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()):
            etl.main(['--reportes', str(REPORTES), '--sin-bases', '--base', cls.base.url])

    @classmethod
    def tearDownClass(cls):
        cls.base.eliminar()

    def test_la_api_entrega_los_datos_de_referencia(self):
        referencia = {
            'meta': json.loads((DATOS_REFERENCIA / 'meta.json').read_text(encoding='utf-8')),
            'registros': json.loads((DATOS_REFERENCIA / 'registros.json').read_text(encoding='utf-8')),
        }
        with TestClient(crear_aplicacion(self.base.url_lectura)) as cliente:
            actuales = cliente.get('/api/datos').json()
        self.assertEqual(actuales['registros'], referencia['registros'])
        for clave, valor in referencia['meta'].items():
            if clave != 'generado':
                with self.subTest(clave=clave):
                    self.assertEqual(actuales['meta'][clave], valor)

    def test_los_resultados_coinciden_con_las_cifras_publicadas(self):
        with psycopg.connect(self.base.url_lectura, row_factory=psycopg.rows.dict_row) as lector:
            for tipo, cifras in CIFRAS_PUBLICADAS.items():
                totales = lector.execute(TOTALES_POR_TIPO, [tipo]).fetchone()
                for indicador, valor in cifras.items():
                    with self.subTest(tipo=tipo, indicador=indicador):
                        self.assertAlmostEqual(float(totales[indicador]), valor, places=9)


if __name__ == '__main__':
    unittest.main()
