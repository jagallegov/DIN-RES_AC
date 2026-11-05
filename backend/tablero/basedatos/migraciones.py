import hashlib
from importlib import resources

from psycopg import sql

ESQUEMAS = ('gobierno', 'fuentes', 'indicadores')
LLAVE_BLOQUEO = 7413001

REGISTRO = '''
create table if not exists gobierno.migraciones (
  nombre text primary key,
  huella text not null,
  aplicada_en timestamptz not null default now()
)
'''


class ErrorMigracion(Exception):
    pass


def migraciones():
    carpeta = resources.files('tablero.basedatos') / 'sql'
    archivos = sorted(archivo for archivo in carpeta.iterdir() if archivo.name.endswith('.sql'))
    return [(archivo.name, archivo.read_text(encoding='utf-8')) for archivo in archivos]


def huella(texto):
    return hashlib.sha256(texto.encode('utf-8')).hexdigest()


def otorgar_lectura(conexion, rol):
    if not rol or not conexion.execute('select 1 from pg_roles where rolname = %s', [rol]).fetchone():
        return False
    for esquema in ESQUEMAS:
        conexion.execute(sql.SQL('grant usage on schema {} to {}').format(sql.Identifier(esquema), sql.Identifier(rol)))
        conexion.execute(sql.SQL('grant select on all tables in schema {} to {}').format(
            sql.Identifier(esquema), sql.Identifier(rol)))
    return True


def migrar(conexion, rol_lectura=None):
    aplicadas = []
    with conexion.transaction():
        conexion.execute('select pg_advisory_xact_lock(%s)', [LLAVE_BLOQUEO])
        conexion.execute('create schema if not exists gobierno')
        conexion.execute(REGISTRO)
        previas = dict(conexion.execute('select nombre, huella from gobierno.migraciones').fetchall())
        for nombre, texto in migraciones():
            if nombre in previas:
                if previas[nombre] != huella(texto):
                    raise ErrorMigracion(f'la migración {nombre} cambió después de aplicarse; los cambios van en una migración nueva')
                continue
            conexion.execute(texto)
            conexion.execute('insert into gobierno.migraciones (nombre, huella) values (%s, %s)', [nombre, huella(texto)])
            aplicadas.append(nombre)
        otorgar_lectura(conexion, rol_lectura)
    return aplicadas
