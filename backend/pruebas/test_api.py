import gzip
import json
import logging
import tempfile
import unittest
from datetime import date, datetime, timezone
from decimal import Decimal
from pathlib import Path

from fastapi.testclient import TestClient

from apoyo import SEDE_MEDELLIN, BaseTemporal, cargar_filas, fila, requiere_base
from tablero.api.aplicacion import AlmacenDatos, Instantanea, crear_aplicacion
from tablero.api.datos import armar_datos

MOMENTO = datetime(2026, 10, 7, 14, 30, tzinfo=timezone.utc)
SIN_BASE = 'postgresql://tablero@localhost:1/no_existe'


def datos_vacios():
    return armar_datos(1, MOMENTO, Decimal('0.5'), 0, [], [], [], [], [], [], [])


class PruebaArmarDatos(unittest.TestCase):
    def setUp(self):
        sedes = [(20, '1102', 'Sede Medellín'), (10, '1101', 'Sede Bogotá')]
        facultades = [(1, '2050', 'FACULTAD DE CIENCIAS', 10), (2, '2049', 'FACULTAD DE ARTES', 10),
                      (3, '3064', 'FACULTAD DE ARQUITECTURA', 20)]
        uabs = [(5, '2469', 'Matemáticas', 1), (6, '2102', 'Conservatorio', 2), (7, '3100', 'Arquitectura', 3),
                (8, '9999', 'Sin registros', 1)]
        asignaturas = [(30, '3007000', 'TALLER', 20), (31, '1000004-B', 'CÁLCULO', 10), (32, '2015000', 'ARMONÍA', 10)]
        cargas = [(1, date(2026, 10, 1), 'DINARA'), (2, date(2026, 10, 6), 'DINARA')]
        filas = [
            ('2024-1S', 7, 30, 1, 10, 9, 1, 8, 0, 8, Decimal('4.1')),
            ('2024-1A', 6, 32, 2, 20, 18, 2, 16, 16, 0, None),
            ('2023-2S', 5, 31, 2, 40, 35, 3, 32, 0, 24, Decimal('3.6')),
        ]
        self.datos = armar_datos(9, MOMENTO, Decimal('0.5'), 4, ['2024-1A'], cargas, sedes, facultades, uabs,
                                 asignaturas, filas)
        self.meta, self.registros = self.datos['meta'], self.datos['registros']

    def test_metadatos(self):
        self.assertEqual(self.meta['version'], 9)
        self.assertEqual(self.meta['actualizado'], '2026-10-07T14:30:00+00:00')
        self.assertEqual((self.meta['fechaCorteMinima'], self.meta['fechaCorte']), ('2026-10-01', '2026-10-06'))
        self.assertEqual(self.meta['fuente'], 'DINARA')
        self.assertEqual((self.meta['filas'], self.meta['excluidos'], self.meta['umbralEnCurso']), (3, 4, 0.5))
        self.assertEqual(self.meta['periodos'], ['2023-2S', '2024-1A', '2024-1S'])
        self.assertEqual(self.meta['periodosEnCurso'], ['2024-1A'])

    def test_catalogos_solo_con_elementos_usados_y_ordenados(self):
        self.assertEqual(self.meta['sedes'], [['1101', 'Sede Bogotá'], ['1102', 'Sede Medellín']])
        self.assertEqual(self.meta['facultades'], [['2049', 'FACULTAD DE ARTES', 0], ['2050', 'FACULTAD DE CIENCIAS', 0],
                                                   ['3064', 'FACULTAD DE ARQUITECTURA', 1]])
        self.assertEqual(self.meta['uabs'], [['2102', 'Conservatorio', 0], ['2469', 'Matemáticas', 1],
                                             ['3100', 'Arquitectura', 2]])
        self.assertEqual(self.meta['asignaturas'], [['1000004-B', 'CÁLCULO', 0], ['2015000', 'ARMONÍA', 0],
                                                    ['3007000', 'TALLER', 1]])

    def test_registros_en_columnas_con_indices_de_los_catalogos(self):
        self.assertEqual(self.registros, {
            'periodo': [2, 1, 0], 'uab': [2, 0, 1], 'asignatura': [2, 1, 0],
            'cupos': [10, 20, 40], 'inscritos': [9, 18, 35], 'cancelaciones': [1, 2, 3], 'matricula': [8, 16, 32],
            'sinResultado': [0, 16, 0], 'aprobados': [8, 0, 24], 'promedio': [4.1, None, 3.6],
        })
        json.dumps(self.datos, allow_nan=False)

    def test_base_sin_registros(self):
        meta = datos_vacios()['meta']
        self.assertEqual((meta['filas'], meta['periodos'], meta['fechaCorte'], meta['fuente']), (0, [], None, None))


class PruebaVigenciaDeLaInstantanea(unittest.TestCase):
    def almacen(self, version_instantanea):
        almacen = AlmacenDatos(None)
        if version_instantanea is not None:
            almacen.instantanea = Instantanea(version_instantanea, b'{}', b'')
        return almacen

    def test_sin_instantanea_hay_que_leer_la_base(self):
        self.assertFalse(self.almacen(None).vigente(3))

    def test_se_renueva_cuando_la_base_tiene_una_version_mayor(self):
        self.assertFalse(self.almacen(3).vigente(4))
        self.assertTrue(self.almacen(3).vigente(3))


@requiere_base
class PruebaApi(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.base = BaseTemporal()
        cargar_filas(
            cls.base.url,
            fila(periodo='2025-1S', nro_mat_acta_final='30', nro_sin_resultado_acta_final='20',
                 nro_aprobados_acta_final='8', promedio_calificaciones='3.9'),
            fila(cod_uab='2470', nombre_uab='Departamento de Física', asignatura='CALCULO',
                 promedio_calificaciones=None),
            fila(periodo='2024-2S', cod_fac_asignatura='2060', facultad_asignatura='FACULTAD DE ARTES',
                 cod_uab='2480', nombre_uab='Escuela de Música', cod_asignatura='2015000', asignatura='ARMONÍA'),
            fila(periodo='2024-1A', cod_asignatura='3007000', asignatura='TALLER DE PROYECTOS', **SEDE_MEDELLIN),
            fila(nombre_uab='DEPARTAMENTO DE MATEMÁTICAS', cod_asignatura='1000003-B', asignatura='ÁLGEBRA LINEAL'),
            fila(cod_asignatura='1000005-B', cupos_ofertados='0', nro_inscritos_iniciales='0'),
        )
        cls.cliente = TestClient(crear_aplicacion(cls.base.url_lectura))
        cls.cliente.__enter__()

    @classmethod
    def tearDownClass(cls):
        cls.cliente.__exit__(None, None, None)
        cls.base.eliminar()

    def get(self, ruta, encabezados=None):
        return self.cliente.get(ruta, headers=encabezados)

    def datos(self):
        respuesta = self.get('/api/datos')
        self.assertEqual(respuesta.status_code, 200)
        return respuesta.json()

    def test_datos_desde_la_base(self):
        meta, registros = self.datos()['meta'], self.datos()['registros']
        self.assertEqual((meta['filas'], meta['excluidos'], meta['fechaCorte']), (5, 1, '2026-10-06'))
        self.assertEqual(meta['fuente'], 'Dirección Nacional de Información Académica, Registro y Matrícula (DINARA)')
        self.assertEqual(meta['periodos'], ['2024-1A', '2024-1S', '2024-2S', '2025-1S'])
        self.assertEqual(meta['periodosEnCurso'], ['2025-1S'])
        self.assertEqual(meta['facultades'], [['2060', 'FACULTAD DE ARTES', 0], ['2050', 'FACULTAD DE CIENCIAS', 0],
                                              ['3064', 'FACULTAD DE ARQUITECTURA', 1]])
        self.assertEqual(meta['uabs'], [['2480', 'Escuela de Música', 0], ['2470', 'Departamento de Física', 1],
                                        ['2469', 'Departamento de Matemáticas', 1], ['3100', 'Escuela de Arquitectura', 2]])
        self.assertEqual(meta['asignaturas'], [['1000003-B', 'ÁLGEBRA LINEAL', 0], ['1000004-B', 'CÁLCULO DIFERENCIAL', 0],
                                               ['2015000', 'ARMONÍA', 0], ['3007000', 'TALLER DE PROYECTOS', 1]])
        self.assertTrue(all(len(valores) == 5 for valores in registros.values()))
        self.assertEqual(sum(valor is None for valor in registros['promedio']), 1)

    def test_una_asignatura_que_cambia_de_uab_conserva_su_indice(self):
        meta, registros = self.datos()['meta'], self.datos()['registros']
        posiciones = [i for i, a in enumerate(registros['asignatura']) if meta['asignaturas'][a][0] == '1000004-B']
        self.assertEqual(len(posiciones), 2)
        self.assertEqual({meta['uabs'][registros['uab'][i]][0] for i in posiciones}, {'2469', '2470'})

    def test_respuesta_comprimida_con_etiqueta_de_version(self):
        respuesta = self.get('/api/datos', {'Accept-Encoding': 'gzip'})
        self.assertEqual(respuesta.headers['content-encoding'], 'gzip')
        self.assertEqual(respuesta.headers['cache-control'], 'no-cache')
        etiqueta = respuesta.headers['etag']
        self.assertEqual(etiqueta, f'"{respuesta.json()["meta"]["version"]}"')
        sin_cambios = self.get('/api/datos', {'If-None-Match': etiqueta})
        self.assertEqual(sin_cambios.status_code, 304)
        plano = self.get('/api/datos', {'Accept-Encoding': 'identity'})
        self.assertNotIn('content-encoding', plano.headers)
        self.assertEqual(gzip.decompress(gzip.compress(plano.content)), plano.content)

    def test_estado_informa_la_version(self):
        respuesta = self.get('/api/estado')
        self.assertEqual(respuesta.headers['cache-control'], 'no-store')
        estado = respuesta.json()
        self.assertEqual(set(estado), {'version', 'actualizado'})
        self.assertEqual(estado['version'], self.datos()['meta']['version'])

    def test_un_cambio_en_la_base_sube_la_version_y_renueva_los_datos(self):
        antes = self.get('/api/estado').json()['version']
        self.base.ejecutar("update fuentes.registros set cupos = cupos + 5 where periodo = '2024-2S'")
        despues = self.get('/api/estado').json()['version']
        self.assertGreater(despues, antes)
        datos = self.datos()
        self.assertEqual(datos['meta']['version'], despues)
        self.assertIn(45, datos['registros']['cupos'])

    def test_resultados_por_periodo_y_sede(self):
        respuesta = self.get('/api/resultados')
        self.assertEqual(respuesta.status_code, 200)
        filas = respuesta.json()
        self.assertEqual([(f['periodo'], f['sede']) for f in filas][:3],
                         [('2024-1A', None), ('2024-1A', '1102'), ('2024-1S', None)])
        filtradas = self.get('/api/resultados?periodo=2024-1S&sede=1101').json()
        self.assertEqual(len(filtradas), 1)
        self.assertEqual((filtradas[0]['asignaturas'], filtradas[0]['cupos'], filtradas[0]['inscritos']), (2, 80, 70))
        self.assertAlmostEqual(filtradas[0]['tasa_ocupacion'], 87.5)

    def test_ruta_inexistente_responde_404_en_espanol(self):
        respuesta = self.get('/api/no-existe')
        self.assertEqual(respuesta.status_code, 404)
        self.assertEqual(set(respuesta.json()), {'detalle'})

    def test_salud(self):
        self.assertEqual(self.get('/salud').json(), {'estado': 'activo'})


class PruebaTableroServido(unittest.TestCase):
    def setUp(self):
        logging.disable(logging.CRITICAL)

    def tearDown(self):
        logging.disable(logging.NOTSET)

    def test_sirve_el_tablero_compilado_junto_con_la_api(self):
        with tempfile.TemporaryDirectory() as carpeta:
            (Path(carpeta) / 'index.html').write_text('<div id="raiz"></div>', encoding='utf-8')
            (Path(carpeta) / 'assets').mkdir()
            (Path(carpeta) / 'assets' / 'index-abc123.js').write_text('console.log(1)', encoding='utf-8')
            with TestClient(crear_aplicacion(SIN_BASE, espera=1, carpeta_web=carpeta)) as cliente:
                inicio = cliente.get('/')
                codigo = cliente.get('/assets/index-abc123.js')
                salud = cliente.get('/salud')
        self.assertEqual(inicio.status_code, 200)
        self.assertIn('id="raiz"', inicio.text)
        self.assertEqual(inicio.headers['cache-control'], 'no-cache')
        self.assertEqual(codigo.headers['cache-control'], 'public, max-age=31536000, immutable')
        self.assertEqual(inicio.headers['x-content-type-options'], 'nosniff')
        self.assertEqual(salud.json(), {'estado': 'activo'})

    def test_sin_tablero_compilado_solo_responde_la_api(self):
        with tempfile.TemporaryDirectory() as carpeta:
            with TestClient(crear_aplicacion(SIN_BASE, espera=1, carpeta_web=carpeta)) as cliente:
                self.assertEqual(cliente.get('/').status_code, 404)
                self.assertEqual(cliente.get('/salud').status_code, 200)


class PruebaSinBase(unittest.TestCase):
    def setUp(self):
        logging.disable(logging.CRITICAL)

    def tearDown(self):
        logging.disable(logging.NOTSET)

    def test_sin_base_disponible_responde_503(self):
        aplicacion = crear_aplicacion(SIN_BASE, espera=1)
        with TestClient(aplicacion) as cliente:
            for ruta in ['/api/datos', '/api/estado']:
                with self.subTest(ruta=ruta):
                    respuesta = cliente.get(ruta)
                    self.assertEqual(respuesta.status_code, 503)
                    self.assertEqual(respuesta.json(), {'detalle': 'No fue posible consultar la base de datos.'})

    def test_sin_base_se_entrega_la_ultima_version(self):
        aplicacion = crear_aplicacion(SIN_BASE, espera=1)
        aplicacion.state.almacen.instantanea = Instantanea(7, b'{"meta":{"version":7}}', gzip.compress(b'{}'))
        with TestClient(aplicacion) as cliente:
            respuesta = cliente.get('/api/datos', headers={'Accept-Encoding': 'identity'})
        self.assertEqual(respuesta.status_code, 200)
        self.assertEqual(respuesta.headers['etag'], '"7"')


if __name__ == '__main__':
    unittest.main()
