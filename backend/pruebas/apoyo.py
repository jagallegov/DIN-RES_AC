import os
import secrets
import sys
import unittest
import uuid
from datetime import date
from pathlib import Path

import pandas as pd
import psycopg
from openpyxl import Workbook
from psycopg import sql
from psycopg.conninfo import conninfo_to_dict, make_conninfo

BACKEND = Path(__file__).resolve().parent.parent
RAIZ = BACKEND.parent
sys.path.insert(0, str(BACKEND))

from tablero.etl import proceso as etl  # noqa: E402
from tablero.etl.carga import cargar  # noqa: E402

URL_ADMINISTRACION = os.environ.get('TABLERO_BASE_PRUEBAS', 'postgresql://postgres@localhost:5432/postgres')
LECTOR = 'tablero_lectura_pruebas'
CLAVE_LECTOR = secrets.token_urlsafe(24)
os.environ['TABLERO_ROL_LECTURA'] = LECTOR

COLUMNAS_BRUTAS = [*etl.ENCABEZADOS.values(), 'archivo_origen']

FILA_BASE = {
    'periodo': '2024-1S',
    'cod_sede_asignatura': '1101',
    'sede_asignatura': 'Sede Bogotá',
    'cod_fac_asignatura': '2050',
    'facultad_asignatura': 'FACULTAD DE CIENCIAS',
    'cod_uab': '2469',
    'nombre_uab': 'Departamento de Matemáticas',
    'cod_asignatura': '1000004-B',
    'asignatura': 'CÁLCULO DIFERENCIAL',
    'cupos_ofertados': '40',
    'nro_inscritos_iniciales': '35',
    'fecha_apertura_acta': '2024/02/05',
    'nro_inscritos_apertura_acta': '34',
    'nro_cupos_cancelados': '3',
    'nro_mat_acta_final': '32',
    'porcentaje_aprobacion': '75.0',
    'promedio_calificaciones': '3.6',
    'nro_aprobados_acta_final': '24',
    'nro_homologados_aprobados': '0',
    'nro_sin_resultado_acta_final': '0',
    'archivo_origen': 'reporte_1101.xlsx',
}

SEDE_MEDELLIN = {
    'cod_sede_asignatura': '1102', 'sede_asignatura': 'Sede Medellín', 'cod_fac_asignatura': '3064',
    'facultad_asignatura': 'FACULTAD DE ARQUITECTURA', 'cod_uab': '3100',
    'nombre_uab': 'Escuela de Arquitectura', 'archivo_origen': 'reporte_1102.xlsx',
}


def fila(**cambios):
    return {**FILA_BASE, **cambios}


def bruta(*filas):
    return pd.DataFrame(list(filas), columns=COLUMNAS_BRUTAS, dtype=object)


def base(*filas):
    return etl.normalizar(bruta(*filas))


def filas_de_todas_las_sedes():
    return [fila(cod_sede_asignatura=codigo, sede_asignatura=nombre, archivo_origen=f'reporte_{codigo}.xlsx')
            for codigo, nombre in etl.SEDES.items()]


def cargar_filas(url, *filas, fecha_corte=date(2026, 10, 6)):
    normalizada = base(*filas)
    archivos = [etl.ArchivoLeido('reporte.xlsx', '0' * 64, fecha_corte, len(normalizada))]
    return cargar(normalizada, fecha_corte, etl.REPORTE, archivos, 'pruebas', url, LECTOR)


def valor_para_excel(columna, valor):
    if valor is None:
        return None
    if columna in etl.COLUMNAS_ENTERAS:
        return int(valor)
    if columna in etl.COLUMNAS_DECIMALES:
        return float(valor)
    return valor


def escribir_reporte(ruta, filas, emision=None, hoja_datos=etl.HOJA_DATOS, encabezados=None):
    encabezados = list(etl.ENCABEZADOS) if encabezados is None else encabezados
    libro = Workbook()
    descripcion = libro.active
    descripcion.title = etl.HOJA_DESCRIPCION
    descripcion.append(['REPORTE RE_ASI_CUP_INS_CAN'])
    descripcion.append([None])
    descripcion.append([etl.ETIQUETA_EMISION])
    descripcion.append([None])
    descripcion.append([emision])
    datos = libro.create_sheet(hoja_datos)
    datos.append(['Oferta y resultados por asignatura'])
    datos.append(encabezados)
    for registro in filas:
        datos.append([valor_para_excel(etl.ENCABEZADOS[e], registro[etl.ENCABEZADOS[e]]) for e in encabezados])
    libro.save(ruta)


def base_disponible():
    try:
        with psycopg.connect(URL_ADMINISTRACION, connect_timeout=2):
            return True
    except psycopg.Error:
        return False


requiere_base = unittest.skipUnless(
    base_disponible(), 'PostgreSQL de pruebas no disponible; se indica con TABLERO_BASE_PRUEBAS')


def url_de(nombre, usuario=None, clave=None):
    datos = conninfo_to_dict(URL_ADMINISTRACION)
    datos['dbname'] = nombre
    if usuario:
        datos['user'] = usuario
        datos['password'] = clave
    return make_conninfo(**datos)


class BaseTemporal:
    def __init__(self):
        self.nombre = f'tablero_prueba_{uuid.uuid4().hex[:12]}'
        with psycopg.connect(URL_ADMINISTRACION, autocommit=True) as conexion:
            existe = conexion.execute('select 1 from pg_roles where rolname = %s', [LECTOR]).fetchone()
            orden = 'alter role {} login password {}' if existe else 'create role {} login password {}'
            conexion.execute(sql.SQL(orden).format(sql.Identifier(LECTOR), sql.Literal(CLAVE_LECTOR)))
            conexion.execute(sql.SQL('create database {}').format(sql.Identifier(self.nombre)))
        self.url = url_de(self.nombre)
        self.url_lectura = url_de(self.nombre, LECTOR, CLAVE_LECTOR)

    def consultar(self, consulta, parametros=None):
        with psycopg.connect(self.url, autocommit=True) as conexion:
            return conexion.execute(consulta, parametros).fetchall()

    def ejecutar(self, sentencia, parametros=None):
        with psycopg.connect(self.url, autocommit=True) as conexion:
            conexion.execute(sentencia, parametros)

    def eliminar(self):
        with psycopg.connect(URL_ADMINISTRACION, autocommit=True) as conexion:
            conexion.execute(sql.SQL('drop database if exists {} with (force)').format(sql.Identifier(self.nombre)))
