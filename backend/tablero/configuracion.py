import getpass
import os
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[2]

BASE_LOCAL = 'postgresql://tablero@localhost:5432/tablero_oferta'
BASE_LOCAL_LECTURA = 'postgresql://tablero_lectura@localhost:5432/tablero_oferta'


def cargar_entorno(ruta=RAIZ / '.env'):
    if not ruta.is_file():
        return
    for linea in ruta.read_text(encoding='utf-8').splitlines():
        linea = linea.strip()
        if not linea or linea.startswith('#') or '=' not in linea:
            continue
        nombre, valor = (parte.strip() for parte in linea.split('=', 1))
        if valor:
            os.environ.setdefault(nombre, valor)


def url_base():
    return os.environ.get('TABLERO_BASE_DATOS', BASE_LOCAL)


def url_lectura():
    return os.environ.get('TABLERO_BASE_DATOS_LECTURA', BASE_LOCAL_LECTURA)


def rol_lectura():
    return os.environ.get('TABLERO_ROL_LECTURA', 'tablero_lectura')


def carpeta_reportes():
    return Path(os.environ.get('TABLERO_REPORTES', RAIZ / 'reportes'))


def carpeta_salida():
    return Path(os.environ.get('TABLERO_SALIDA', RAIZ / 'salida'))


def carpeta_web():
    return Path(os.environ.get('TABLERO_CARPETA_WEB', RAIZ / 'frontend' / 'dist'))


def responsable():
    return os.environ.get('TABLERO_RESPONSABLE') or getpass.getuser()


cargar_entorno()
