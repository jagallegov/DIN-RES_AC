import secrets
from urllib.parse import quote

import psycopg
from psycopg import sql
from psycopg.conninfo import conninfo_to_dict

BASE = 'tablero_oferta'
DUENO = 'tablero'
LECTOR = 'tablero_lectura'


def url_de(admin, usuario, clave):
    datos = conninfo_to_dict(admin)
    anfitrion = datos.get('host') or 'localhost'
    puerto = datos.get('port') or '5432'
    return f'postgresql://{quote(usuario, safe="")}:{quote(clave, safe="")}@{anfitrion}:{puerto}/{BASE}'


def crear_base(admin):
    claves = {DUENO: secrets.token_urlsafe(24), LECTOR: secrets.token_urlsafe(24)}
    with psycopg.connect(admin, autocommit=True) as conexion:
        for rol, clave in claves.items():
            existe = conexion.execute('select 1 from pg_roles where rolname = %s', [rol]).fetchone()
            orden = 'alter role {} login password {}' if existe else 'create role {} login password {}'
            conexion.execute(sql.SQL(orden).format(sql.Identifier(rol), sql.Literal(clave)))
        if not conexion.execute('select 1 from pg_database where datname = %s', [BASE]).fetchone():
            conexion.execute(sql.SQL('create database {} owner {}').format(sql.Identifier(BASE), sql.Identifier(DUENO)))
    return url_de(admin, DUENO, claves[DUENO]), url_de(admin, LECTOR, claves[LECTOR])


def escribir_entorno(ruta, url_dueno, url_lectura):
    ruta.write_text(
        '# Conexión del usuario dueño de los esquemas. La usan las migraciones y el ETL.\n'
        f'TABLERO_BASE_DATOS={url_dueno}\n\n'
        '# Conexión del usuario de solo lectura. La usa la API.\n'
        f'TABLERO_BASE_DATOS_LECTURA={url_lectura}\n\n'
        '# Nombre que queda registrado en gobierno.cargas cuando se corre el ETL. Opcional.\n'
        'TABLERO_RESPONSABLE=\n',
        encoding='utf-8')
    ruta.chmod(0o600)
