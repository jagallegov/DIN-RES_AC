import asyncio
import gzip
import json
import logging
from contextlib import asynccontextmanager
from dataclasses import dataclass
from pathlib import Path

import psycopg
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse, Response
from fastapi.staticfiles import StaticFiles
from psycopg_pool import AsyncConnectionPool, PoolTimeout
from starlette.exceptions import HTTPException

from tablero import configuracion
from tablero.api.datos import leer_datos, leer_estado, leer_resultados

ESPERA_CONEXION_SEGUNDOS = 5
DETALLE_SIN_BASE = 'No fue posible consultar la base de datos.'
SIN_CACHE = 'no-cache'
CACHE_PERMANENTE = 'public, max-age=31536000, immutable'
ENCABEZADOS_SEGURIDAD = {
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'X-Frame-Options': 'SAMEORIGIN',
}

registro = logging.getLogger('tablero.api')


@dataclass(frozen=True)
class Instantanea:
    version: int
    cuerpo: bytes
    comprimido: bytes

    @property
    def etiqueta(self):
        return f'"{self.version}"'


def serializar(datos):
    cuerpo = json.dumps(datos, ensure_ascii=False, separators=(',', ':')).encode('utf-8')
    return Instantanea(datos['meta']['version'], cuerpo, gzip.compress(cuerpo, compresslevel=6))


class AlmacenDatos:
    def __init__(self, conexiones):
        self.conexiones = conexiones
        self.instantanea = None
        self.candado = asyncio.Lock()

    async def estado(self):
        async with self.conexiones.connection() as conexion:
            return await leer_estado(conexion)

    def vigente(self, version):
        return self.instantanea is not None and self.instantanea.version >= version

    async def obtener(self):
        try:
            version, _ = await self.estado()
        except (psycopg.Error, PoolTimeout):
            if self.instantanea is None:
                raise
            registro.warning('La base no responde; se entrega la versión %s de los datos', self.instantanea.version)
            return self.instantanea
        if not self.vigente(version):
            async with self.candado:
                if not self.vigente(version):
                    async with self.conexiones.connection() as conexion:
                        datos = await leer_datos(conexion)
                    self.instantanea = await asyncio.to_thread(serializar, datos)
        return self.instantanea


class ArchivosTablero(StaticFiles):
    def file_response(self, full_path, stat_result, scope, status_code=200):
        respuesta = super().file_response(full_path, stat_result, scope, status_code)
        respuesta.headers['Cache-Control'] = CACHE_PERMANENTE if Path(full_path).parent.name == 'assets' else SIN_CACHE
        return respuesta


def crear_aplicacion(url=None, espera=ESPERA_CONEXION_SEGUNDOS, carpeta_web=None):
    url = configuracion.url_lectura() if url is None else url
    carpeta_web = Path(configuracion.carpeta_web() if carpeta_web is None else carpeta_web)
    conexiones = AsyncConnectionPool(
        url, min_size=1, max_size=4, open=False, timeout=espera, check=AsyncConnectionPool.check_connection,
        kwargs={'autocommit': True, 'connect_timeout': espera})
    almacen = AlmacenDatos(conexiones)

    @asynccontextmanager
    async def ciclo(_):
        await conexiones.open(wait=False)
        yield
        await conexiones.close()

    app = FastAPI(title='Tablero de oferta y resultados de asignaturas', lifespan=ciclo,
                  docs_url='/api/docs', redoc_url=None, openapi_url='/api/openapi.json')

    @app.middleware('http')
    async def encabezados_seguridad(request, siguiente):
        respuesta = await siguiente(request)
        for nombre, valor in ENCABEZADOS_SEGURIDAD.items():
            respuesta.headers.setdefault(nombre, valor)
        return respuesta

    @app.exception_handler(HTTPException)
    async def error_http(_, error):
        return JSONResponse({'detalle': error.detail}, status_code=error.status_code, headers=error.headers)

    @app.exception_handler(psycopg.Error)
    @app.exception_handler(PoolTimeout)
    async def base_no_disponible(_, error):
        registro.warning('Consulta fallida: %s', error)
        return JSONResponse({'detalle': DETALLE_SIN_BASE}, status_code=503)

    @app.get('/api/datos', summary='Registros y catálogos del tablero')
    async def datos(request: Request):
        instantanea = await almacen.obtener()
        encabezados = {'ETag': instantanea.etiqueta, 'Cache-Control': SIN_CACHE, 'Vary': 'Accept-Encoding'}
        if request.headers.get('if-none-match') == instantanea.etiqueta:
            return Response(status_code=304, headers=encabezados)
        if 'gzip' in request.headers.get('accept-encoding', ''):
            return Response(instantanea.comprimido, media_type='application/json',
                            headers={**encabezados, 'Content-Encoding': 'gzip'})
        return Response(instantanea.cuerpo, media_type='application/json', headers=encabezados)

    @app.get('/api/estado', summary='Versión vigente de los datos')
    async def estado():
        version, actualizado = await almacen.estado()
        return JSONResponse({'version': version, 'actualizado': actualizado.isoformat()},
                            headers={'Cache-Control': 'no-store'})

    @app.get('/api/resultados', summary='Indicadores por periodo y sede')
    async def resultados(periodo: str | None = None, sede: str | None = None):
        async with conexiones.connection() as conexion:
            return await leer_resultados(conexion, periodo, sede)

    @app.get('/salud', include_in_schema=False)
    async def salud():
        return {'estado': 'activo'}

    if (carpeta_web / 'index.html').is_file():
        app.mount('/', ArchivosTablero(directory=carpeta_web, html=True), name='tablero')
    else:
        registro.warning('No se encontró el tablero compilado en %s; solo se sirve la API', carpeta_web)
    app.state.almacen = almacen
    app.state.conexiones = conexiones
    return app
