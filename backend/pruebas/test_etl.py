import contextlib
import hashlib
import io
import tempfile
import unittest
from datetime import date, datetime
from pathlib import Path

import pandas as pd

from apoyo import (COLUMNAS_BRUTAS, SEDE_MEDELLIN, BaseTemporal, base, bruta, escribir_reporte, etl, fila,
                   filas_de_todas_las_sedes, requiere_base)


class PruebaOrdenPeriodo(unittest.TestCase):
    def test_descompone_anio_semestre_y_tipo(self):
        self.assertEqual(etl.orden_periodo('2024-1S'), (2024, 1, 'S'))
        self.assertEqual(etl.orden_periodo('2026-2A'), (2026, 2, 'A'))

    def test_ordena_por_anio_semestre_y_tipo(self):
        periodos = ['2025-1S', '2024-2S', '2024-1S', '2026-1A', '2024-1I', '2024-1A', '2023-2A']
        self.assertEqual(sorted(periodos, key=etl.orden_periodo),
                         ['2023-2A', '2024-1A', '2024-1I', '2024-1S', '2024-2S', '2025-1S', '2026-1A'])

    def test_rechaza_periodos_mal_formados(self):
        for periodo in ['2024-3S', '24-1S', '2024-1s', '2024-1', '2024 1S']:
            with self.subTest(periodo=periodo), self.assertRaises(Exception):
                etl.orden_periodo(periodo)


class PruebaDepuracion(unittest.TestCase):
    def setUp(self):
        self.bruta = base(
            fila(cod_asignatura='A1'),
            fila(cod_asignatura='A2', cupos_ofertados='0', nro_inscritos_iniciales='0'),
            fila(cod_asignatura='A3', cupos_ofertados='0', nro_inscritos_iniciales='5'),
            fila(cod_asignatura='A4', cupos_ofertados='30', nro_inscritos_iniciales='0'),
            fila(cod_sede_asignatura='1102', sede_asignatura='Sede Medellín', archivo_origen='reporte_1102.xlsx',
                 cod_asignatura='B1', cupos_ofertados='0', nro_inscritos_iniciales='0'),
            fila(cod_sede_asignatura='1102', sede_asignatura='Sede Medellín', archivo_origen='reporte_1102.xlsx',
                 cod_asignatura='B2', cupos_ofertados='0', nro_inscritos_iniciales='0'),
        )

    def test_elimina_solo_filas_sin_cupos_ni_inscritos(self):
        depurada, _ = etl.depurar(self.bruta)
        self.assertEqual(depurada['cod_asignatura'].tolist(), ['A1', 'A3', 'A4'])
        self.assertEqual(depurada.index.tolist(), [0, 1, 2])

    def test_la_mascara_queda_alineada_con_la_base_bruta(self):
        _, sin_oferta = etl.depurar(self.bruta)
        self.assertEqual(len(sin_oferta), len(self.bruta))
        self.assertEqual(self.bruta.loc[sin_oferta.astype(bool), 'cod_asignatura'].tolist(), ['A2', 'B1', 'B2'])
        self.assertEqual(int(sin_oferta.sum()), 3)

    def test_control_por_sede_y_archivo(self):
        depurada, sin_oferta = etl.depurar(self.bruta)
        control = etl.control_depuracion(self.bruta, sin_oferta)
        self.assertEqual(control.columns.tolist(), [
            'cod_sede_asignatura', 'sede_asignatura', 'archivo_origen',
            'filas_brutas', 'filas_eliminadas', 'filas_depuradas', 'matricula_excluida', 'homologados_excluidos',
        ])
        self.assertEqual(control.to_dict('records'), [
            {'cod_sede_asignatura': '1101', 'sede_asignatura': 'Sede Bogotá', 'archivo_origen': 'reporte_1101.xlsx',
             'filas_brutas': 4, 'filas_eliminadas': 1, 'filas_depuradas': 3,
             'matricula_excluida': 32, 'homologados_excluidos': 0},
            {'cod_sede_asignatura': '1102', 'sede_asignatura': 'Sede Medellín', 'archivo_origen': 'reporte_1102.xlsx',
             'filas_brutas': 2, 'filas_eliminadas': 2, 'filas_depuradas': 0,
             'matricula_excluida': 64, 'homologados_excluidos': 0},
        ])
        self.assertEqual(int(control['filas_depuradas'].sum()), len(depurada))


class PruebaValidar(unittest.TestCase):
    def test_base_completa_sin_errores_ni_advertencias(self):
        self.assertEqual(etl.validar(base(*filas_de_todas_las_sedes())), ([], []))

    def test_detecta_duplicados_por_llave(self):
        errores, _ = etl.validar(base(fila(), fila(nro_mat_acta_final='30'), fila(asignatura='OTRO NOMBRE')))
        self.assertEqual(errores, [
            'Hay 2 registros duplicados por la llave periodo, cod_sede_asignatura, cod_fac_asignatura, cod_uab, '
            'cod_asignatura, por ejemplo 2024-1S | 1101 | 2050 | 2469 | 1000004-B | reporte_1101.xlsx'])

    def test_sede_vacia_es_error_y_no_rompe_la_revision_de_sedes(self):
        errores, _ = etl.validar(base(fila(), fila(cod_asignatura='A2', cod_sede_asignatura=None),
                                      fila(cod_asignatura='A3', cod_sede_asignatura='   ')))
        self.assertEqual(errores, ['Hay valores vacíos en cod_sede_asignatura'])

    def test_la_misma_asignatura_en_otra_uab_no_es_duplicado(self):
        errores, _ = etl.validar(base(fila(), fila(cod_uab='2470'), fila(periodo='2024-2S')))
        self.assertEqual(errores, [])

    def test_detecta_periodos_mal_formados(self):
        errores, _ = etl.validar(base(fila(periodo='2024-3S'), fila(periodo='2024-1s'), fila(periodo='2024-1'),
                                      fila(periodo='2024-1S'), fila(periodo='2024-1I')))
        self.assertEqual(errores, ['Hay periodos con formato no reconocido: 2024-1, 2024-1s, 2024-3S'])

    def test_detecta_valores_vacios_obligatorios(self):
        errores, _ = etl.validar(base(fila(asignatura=None), fila(cod_asignatura='A2', cupos_ofertados=None),
                                      fila(cod_asignatura='A3', nro_mat_acta_final=None)))
        self.assertEqual(errores, ['Hay valores vacíos en asignatura, cupos_ofertados, nro_mat_acta_final'])

    def test_admite_vacios_en_columnas_opcionales(self):
        filas = filas_de_todas_las_sedes()
        filas[0].update(fecha_apertura_acta=None, nro_inscritos_apertura_acta=None,
                        porcentaje_aprobacion=None, promedio_calificaciones=None)
        self.assertEqual(etl.validar(base(*filas)), ([], []))

    def test_detecta_valores_negativos(self):
        errores, _ = etl.validar(base(fila(cupos_ofertados='-1'),
                                      fila(cod_asignatura='A2', nro_aprobados_acta_final='-2')))
        self.assertEqual(errores, ['Hay valores negativos en cupos_ofertados, nro_aprobados_acta_final'])

    def test_acumula_varios_errores(self):
        errores, _ = etl.validar(base(fila(), fila(), fila(cod_asignatura='A2', periodo='2024-9S', cupos_ofertados='-5')))
        self.assertEqual(len(errores), 3)
        self.assertTrue(errores[0].startswith('Hay 1 registros duplicados'))
        self.assertEqual(errores[1], 'Hay periodos con formato no reconocido: 2024-9S')
        self.assertEqual(errores[2], 'Hay valores negativos en cupos_ofertados')

    def test_advierte_sedes_faltantes(self):
        errores, advertencias = etl.validar(base(fila(), fila(cod_sede_asignatura='9933', sede_asignatura='Sede De La Paz')))
        self.assertEqual(errores, [])
        self.assertEqual(advertencias, [
            'Faltan reportes de 1102 (Sede Medellín), 1103 (Sede Manizales), 1104 (Sede Palmira), '
            '1124 (Sede Orinoquía), 1125 (Sede Amazonía), 1126 (Sede Caribe), 9920 (Sede Tumaco)'])

    def test_advierte_sedes_no_previstas(self):
        filas = [*filas_de_todas_las_sedes(), fila(cod_sede_asignatura='9999', sede_asignatura='Sede Nueva')]
        self.assertEqual(etl.validar(base(*filas)), ([], ['Aparecen sedes no previstas: 9999']))


class PruebaRevisarCoherencia(unittest.TestCase):
    def test_registros_coherentes_sin_advertencias(self):
        self.assertEqual(etl.revisar_coherencia(base(fila(), fila(cod_asignatura='A2', nro_sin_resultado_acta_final='8'))), [])

    def test_cuenta_cada_incoherencia(self):
        depurada = base(
            fila(cod_asignatura='A1'),
            fila(cod_asignatura='A2', nro_inscritos_iniciales='10', nro_mat_acta_final='8',
                 nro_sin_resultado_acta_final='2', nro_aprobados_acta_final='7'),
            fila(cod_asignatura='A3', nro_inscritos_iniciales='5', nro_mat_acta_final='6',
                 nro_sin_resultado_acta_final='0', nro_aprobados_acta_final='6'),
            fila(cod_asignatura='A4', nro_inscritos_iniciales='10', nro_mat_acta_final='3',
                 nro_sin_resultado_acta_final='4', nro_aprobados_acta_final='0'),
        )
        self.assertEqual(etl.revisar_coherencia(depurada), [
            '1 registros depurados con más estudiantes sin resultado que matrícula final',
            '2 registros depurados con más aprobados que estudiantes con resultado',
            '1 registros depurados con matrícula final mayor que los inscritos iniciales',
        ])

    def test_usa_punto_como_separador_de_miles(self):
        depurada = base(*[fila(cod_asignatura=f'A{i}', nro_mat_acta_final='40') for i in range(1000)])
        self.assertEqual(etl.revisar_coherencia(depurada),
                         ['1.000 registros depurados con matrícula final mayor que los inscritos iniciales'])
        self.assertEqual(etl.miles(1234567), '1.234.567')


class PruebaNormalizar(unittest.TestCase):
    def test_colapsa_espacios_en_textos(self):
        normalizada = base(fila(sede_asignatura='  Sede   Bogotá ', asignatura='\tCÁLCULO\n  DIFERENCIAL ',
                                cod_asignatura=' 1000004-B ', periodo=' 2024-1S'))
        registro = normalizada.iloc[0]
        self.assertEqual(registro['sede_asignatura'], 'Sede Bogotá')
        self.assertEqual(registro['asignatura'], 'CÁLCULO DIFERENCIAL')
        self.assertEqual(registro['cod_asignatura'], '1000004-B')
        self.assertEqual(registro['periodo'], '2024-1S')

    def test_convierte_enteros_escritos_con_decimales_cero(self):
        normalizada = base(fila(cupos_ofertados='40.0', nro_inscritos_iniciales=' 35 ', nro_inscritos_apertura_acta=None))
        for columna in etl.COLUMNAS_ENTERAS:
            self.assertEqual(str(normalizada[columna].dtype), 'Int64')
        self.assertEqual(normalizada.loc[0, 'cupos_ofertados'], 40)
        self.assertEqual(normalizada.loc[0, 'nro_inscritos_iniciales'], 35)
        self.assertTrue(pd.isna(normalizada.loc[0, 'nro_inscritos_apertura_acta']))

    def test_rechaza_enteros_con_parte_decimal(self):
        with self.assertRaises(etl.ErrorDatos) as contexto:
            base(fila(), fila(cod_asignatura='A2', cupos_ofertados='40.5'))
        self.assertEqual(str(contexto.exception), 'La columna cupos_ofertados tiene valores con decimales')

    def test_rechaza_texto_no_numerico_en_enteros(self):
        with self.assertRaises(etl.ErrorDatos) as contexto:
            base(fila(nro_mat_acta_final='treinta'))
        self.assertEqual(str(contexto.exception),
                         "La columna nro_mat_acta_final tiene 1 valores no numéricos, por ejemplo 'treinta'")

    def test_rechaza_texto_no_numerico_en_decimales(self):
        with self.assertRaises(etl.ErrorDatos) as contexto:
            base(fila(promedio_calificaciones='3,6'))
        self.assertIn('promedio_calificaciones', str(contexto.exception))
        self.assertIn("'3,6'", str(contexto.exception))

    def test_convierte_decimales(self):
        normalizada = base(fila(promedio_calificaciones='4.25', porcentaje_aprobacion=None))
        self.assertEqual(normalizada.loc[0, 'promedio_calificaciones'], 4.25)
        self.assertTrue(pd.isna(normalizada.loc[0, 'porcentaje_aprobacion']))

    def test_convierte_fechas_validas_y_conserva_vacias(self):
        normalizada = base(fila(cod_asignatura='A1'), fila(cod_asignatura='A2', fecha_apertura_acta=None))
        self.assertEqual(normalizada.loc[0, 'fecha_apertura_acta'], pd.Timestamp(2024, 2, 5))
        self.assertTrue(pd.isna(normalizada.loc[1, 'fecha_apertura_acta']))

    def test_rechaza_fechas_invalidas(self):
        for texto in ['2024-02-05', '05/02/2024', '2024/02/30', 'sin fecha']:
            with self.subTest(fecha=texto):
                with self.assertRaises(etl.ErrorDatos) as contexto:
                    base(fila(cod_asignatura='A1'), fila(cod_asignatura='A2', fecha_apertura_acta=texto))
                self.assertEqual(str(contexto.exception),
                                 f'La columna fecha_apertura_acta tiene 1 fechas no válidas, por ejemplo {texto!r}')

    def test_ordena_por_sede_periodo_y_codigos(self):
        normalizada = base(
            fila(cod_sede_asignatura='1102', periodo='2024-1S', cod_asignatura='A1'),
            fila(periodo='2024-2S', cod_asignatura='A1'),
            fila(periodo='2024-1S', cod_uab='2470', cod_asignatura='A1'),
            fila(periodo='2024-1S', cod_asignatura='A2'),
            fila(periodo='2024-1S', cod_asignatura='A1'),
        )
        self.assertEqual(
            list(zip(normalizada['cod_sede_asignatura'], normalizada['periodo'], normalizada['cod_uab'], normalizada['cod_asignatura'])),
            [('1101', '2024-1S', '2469', 'A1'), ('1101', '2024-1S', '2469', 'A2'), ('1101', '2024-1S', '2470', 'A1'),
             ('1101', '2024-2S', '2469', 'A1'), ('1102', '2024-1S', '2469', 'A1')])
        self.assertEqual(normalizada.index.tolist(), [0, 1, 2, 3, 4])

    def test_no_modifica_la_base_recibida(self):
        original = bruta(fila(sede_asignatura='  Sede  Bogotá'), fila(cod_asignatura='A2'))
        copia = original.copy()
        etl.normalizar(original)
        pd.testing.assert_frame_equal(original, copia)


class PruebaFechaEmision(unittest.TestCase):
    def hoja(self, *valores):
        return pd.DataFrame({0: list(valores), 1: [None] * len(valores)})

    def test_toma_el_primer_valor_despues_de_la_etiqueta(self):
        hoja = self.hoja('REPORTE RE_ASI_CUP_INS_CAN', None, etl.ETIQUETA_EMISION, None, datetime(2026, 10, 6, 8, 30),
                         datetime(2020, 1, 1))
        self.assertEqual(etl.fecha_emision(hoja), date(2026, 10, 6))

    def test_ignora_mayusculas_y_espacios_en_la_etiqueta(self):
        hoja = self.hoja('  Fecha de emisión del reporte ', pd.Timestamp('2026-09-30 17:00'))
        self.assertEqual(etl.fecha_emision(hoja), date(2026, 9, 30))

    def test_acepta_fecha_en_texto_iso(self):
        self.assertEqual(etl.fecha_emision(self.hoja(etl.ETIQUETA_EMISION, '2026-10-06 07:15:00')), date(2026, 10, 6))

    def test_lee_fecha_en_texto_con_dia_primero(self):
        self.assertEqual(etl.fecha_emision(self.hoja(etl.ETIQUETA_EMISION, '06/10/2026 10:03')), date(2026, 10, 6))

    def test_sin_etiqueta_devuelve_none(self):
        self.assertIsNone(etl.fecha_emision(self.hoja('REPORTE', datetime(2026, 10, 6))))

    def test_valor_que_no_es_fecha_devuelve_none(self):
        self.assertIsNone(etl.fecha_emision(self.hoja(etl.ETIQUETA_EMISION, 'sin información')))

    def test_etiqueta_sin_valor_devuelve_none(self):
        self.assertIsNone(etl.fecha_emision(self.hoja('REPORTE', etl.ETIQUETA_EMISION, None)))

    def test_lee_la_hoja_de_descripcion_de_un_libro(self):
        with tempfile.TemporaryDirectory() as carpeta:
            ruta = Path(carpeta) / 'reporte_1101.xlsx'
            escribir_reporte(ruta, [fila()], emision=datetime(2026, 10, 6, 7, 45))
            descripcion = pd.read_excel(ruta, sheet_name=etl.HOJA_DESCRIPCION, header=None)
            self.assertEqual(etl.fecha_emision(descripcion), date(2026, 10, 6))
            _, emision = etl.leer_reporte(ruta)
        self.assertEqual(emision, date(2026, 10, 6))


class PruebaLeerReporte(unittest.TestCase):
    def test_renombra_columnas_y_agrega_archivo_de_origen(self):
        with tempfile.TemporaryDirectory() as carpeta:
            ruta = Path(carpeta) / 'reporte_1101.xlsx'
            escribir_reporte(ruta, [fila(), fila(cod_asignatura='A2', promedio_calificaciones=None)],
                             emision=datetime(2026, 10, 6))
            datos, _ = etl.leer_reporte(ruta)
        self.assertEqual(datos.columns.tolist(), COLUMNAS_BRUTAS)
        self.assertEqual(len(datos), 2)
        self.assertEqual(datos.loc[0, 'cupos_ofertados'], '40')
        self.assertEqual(datos['archivo_origen'].unique().tolist(), ['reporte_1101.xlsx'])
        self.assertTrue(pd.isna(datos.loc[1, 'promedio_calificaciones']))

    def test_rechaza_libro_sin_hoja_de_datos(self):
        with tempfile.TemporaryDirectory() as carpeta:
            ruta = Path(carpeta) / 'reporte.xlsx'
            escribir_reporte(ruta, [fila()], hoja_datos='Otra')
            with self.assertRaisesRegex(etl.ErrorDatos, 'no tiene la hoja Sheet2'):
                etl.leer_reporte(ruta)

    def test_rechaza_columnas_faltantes(self):
        with tempfile.TemporaryDirectory() as carpeta:
            ruta = Path(carpeta) / 'reporte.xlsx'
            encabezados = [e for e in etl.ENCABEZADOS if e not in ('UAB', 'ASIGNATURA')]
            escribir_reporte(ruta, [fila()], encabezados=encabezados)
            with self.assertRaisesRegex(etl.ErrorDatos, 'faltan las columnas ASIGNATURA, UAB'):
                etl.leer_reporte(ruta)


@requiere_base
class PruebaEjecucionCompleta(unittest.TestCase):
    def setUp(self):
        self.temporal = tempfile.TemporaryDirectory()
        raiz = Path(self.temporal.name)
        self.reportes = raiz / 'reportes'
        self.salida = raiz / 'salida'
        self.reportes.mkdir()
        self.base = BaseTemporal()

    def tearDown(self):
        self.base.eliminar()
        self.temporal.cleanup()

    def escribir_reportes_validos(self, emision_1101=datetime(2026, 10, 5, 9), emision_1102=datetime(2026, 10, 6, 9)):
        escribir_reporte(self.reportes / 'reporte_1101.xlsx', [
            fila(cod_asignatura='A1'),
            fila(cod_asignatura='A2', cupos_ofertados='0', nro_inscritos_iniciales='0', nro_mat_acta_final='0',
                 nro_aprobados_acta_final='0', nro_cupos_cancelados='0', promedio_calificaciones=None),
            fila(periodo='2024-2S', cod_asignatura='A1', nro_sin_resultado_acta_final='30'),
        ], emision=emision_1101)
        escribir_reporte(self.reportes / 'reporte_1102.xlsx', [
            fila(cod_asignatura='B1', **SEDE_MEDELLIN),
            fila(periodo='2024-1A', cod_asignatura='B2', promedio_calificaciones=None, **SEDE_MEDELLIN),
        ], emision=emision_1102)
        (self.reportes / '~$reporte_1101.xlsx').write_bytes(b'')
        (self.reportes / '._reporte_1101.xlsx').write_bytes(b'')

    def ejecutar(self, *argumentos):
        salida_estandar, salida_errores = io.StringIO(), io.StringIO()
        with contextlib.redirect_stdout(salida_estandar), contextlib.redirect_stderr(salida_errores):
            etl.main(['--reportes', str(self.reportes), '--salida', str(self.salida),
                      '--base', self.base.url, '--responsable', 'equipo de pruebas', *argumentos])
        return salida_estandar.getvalue(), salida_errores.getvalue()

    def cargas(self):
        return self.base.consultar('''
            select c.fecha_corte, array_agg(a.archivo order by a.archivo), c.filas
            from gobierno.cargas c
            join gobierno.cargas_archivos a on a.carga_id = c.id
            group by c.id
            order by c.id
        ''')

    def test_carga_la_base_y_genera_las_bases_unificadas(self):
        self.escribir_reportes_validos()
        salida_estandar, salida_errores = self.ejecutar()
        self.assertEqual(self.cargas(), [(date(2026, 10, 6), ['reporte_1101.xlsx', 'reporte_1102.xlsx'], 5)])
        self.assertEqual(self.base.consultar('select count(*) from fuentes.registros'), [(5,)])
        self.assertEqual(self.base.consultar('select count(*) from indicadores.registros_ofertados'), [(4,)])
        self.assertEqual(self.base.consultar('select periodo from indicadores.estado_periodos where en_curso'),
                         [('2024-2S',)])
        self.assertEqual(self.base.consultar('select reporte, responsable from gobierno.cargas'),
                         [('RE_ASI_CUP_INS_CAN', 'equipo de pruebas')])
        archivos = self.base.consultar(
            'select archivo, fecha_emision, filas, sha256 from gobierno.cargas_archivos order by archivo')
        self.assertEqual([fila[:3] for fila in archivos], [('reporte_1101.xlsx', date(2026, 10, 5), 3),
                                                            ('reporte_1102.xlsx', date(2026, 10, 6), 2)])
        self.assertEqual(archivos[0][3], hashlib.sha256((self.reportes / 'reporte_1101.xlsx').read_bytes()).hexdigest())
        self.assertIn('Archivos leídos: 2', salida_estandar)
        self.assertIn('excluidas por cupos e inscritos en cero: 1', salida_estandar)
        self.assertIn('Periodos en curso (más de 50% sin resultado): 2024-2S', salida_estandar)
        self.assertIn('Carga 1 registrada: 5 registros insertados, 0 reemplazados', salida_estandar)
        self.assertIn('Advertencia: Faltan reportes de 1103 (Sede Manizales)', salida_errores)
        self.assertIn('Advertencia: Los reportes tienen fechas de emisión distintas (2026-10-05 a 2026-10-06)',
                      salida_errores)
        for nombre in ['BASE_UNIFICADA_BRUTA', 'BASE_UNIFICADA_DEPURADA']:
            with self.subTest(base=nombre):
                self.assertTrue((self.salida / f'{nombre}.xlsx').is_file())
                self.assertTrue((self.salida / f'{nombre}.csv').is_file())
        with pd.ExcelFile(self.salida / 'BASE_UNIFICADA_DEPURADA.xlsx') as libro:
            self.assertEqual(libro.sheet_names, ['datos', 'diccionario_columnas', 'control_depuracion'])
            self.assertEqual(len(libro.parse('datos')), 4)
        bruta_csv = pd.read_csv(self.salida / 'BASE_UNIFICADA_BRUTA.csv', encoding='utf-8-sig', dtype=str)
        self.assertEqual(bruta_csv.columns.tolist(), COLUMNAS_BRUTAS)
        self.assertEqual(len(bruta_csv), 5)

    def test_fecha_de_corte_explicita_y_sin_bases(self):
        self.escribir_reportes_validos()
        self.ejecutar('--fecha-corte', '2026-09-30', '--sin-bases')
        self.assertEqual(self.cargas()[0][0], date(2026, 9, 30))
        self.assertFalse(self.salida.exists())

    def test_una_segunda_carga_reemplaza_los_registros_de_sus_sedes_y_periodos(self):
        self.escribir_reportes_validos()
        self.ejecutar('--sin-bases')
        (self.reportes / 'reporte_1102.xlsx').unlink()
        escribir_reporte(self.reportes / 'reporte_1101.xlsx', [fila(cod_asignatura='A9')],
                         emision=datetime(2026, 10, 7, 9))
        salida_estandar, _ = self.ejecutar('--sin-bases')
        self.assertIn('Carga 2 registrada: 1 registros insertados, 2 reemplazados', salida_estandar)
        filas = self.base.consultar('''
            select s.codigo, r.periodo, a.codigo, r.carga_id
            from fuentes.registros r
            join gobierno.asignaturas a on a.id = r.asignatura_id
            join gobierno.sedes s on s.id = a.sede_id
            order by 1, 2, 3
        ''')
        self.assertEqual(filas, [
            ('1101', '2024-1S', 'A9', 2),
            ('1101', '2024-2S', 'A1', 1),
            ('1102', '2024-1A', 'B2', 1),
            ('1102', '2024-1S', 'B1', 1),
        ])

    def test_sin_reportes_termina_con_error(self):
        with self.assertRaises(SystemExit) as contexto:
            self.ejecutar()
        self.assertTrue(str(contexto.exception.code).startswith('Error: No hay archivos .xlsx'))

    def test_sin_fecha_de_emision_exige_fecha_de_corte(self):
        self.escribir_reportes_validos(emision_1101=None, emision_1102=None)
        with self.assertRaises(SystemExit) as contexto:
            self.ejecutar('--sin-bases')
        self.assertIn('--fecha-corte', str(contexto.exception.code))

    def test_validacion_fallida_no_toca_la_base(self):
        escribir_reporte(self.reportes / 'reporte_a.xlsx', [fila()], emision=datetime(2026, 10, 6))
        escribir_reporte(self.reportes / 'reporte_b.xlsx', [fila()], emision=datetime(2026, 10, 6))
        with self.assertRaises(SystemExit) as contexto:
            self.ejecutar('--sin-bases')
        mensaje = str(contexto.exception.code)
        self.assertTrue(mensaje.startswith('Error: la validación de los reportes no pasó.'))
        self.assertIn('Hay 1 registros duplicados', mensaje)
        self.assertEqual(self.base.consultar(
            "select count(*) from information_schema.tables where table_schema in ('gobierno', 'fuentes', 'indicadores')"),
            [(0,)])

    def test_base_inaccesible_termina_con_error_claro(self):
        self.escribir_reportes_validos()
        with self.assertRaises(SystemExit) as contexto:
            salida_errores = io.StringIO()
            with contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(salida_errores):
                etl.main(['--reportes', str(self.reportes), '--sin-bases',
                          '--base', 'postgresql://tablero@localhost:1/no_existe'])
        self.assertTrue(str(contexto.exception.code).startswith('Error: no fue posible conectar con la base de datos'))


if __name__ == '__main__':
    unittest.main()
