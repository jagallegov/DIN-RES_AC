import argparse
import sys

import psycopg

from tablero import configuracion
from tablero.basedatos.creacion import crear_base, escribir_entorno
from tablero.basedatos.migraciones import ErrorMigracion, migrar

ENTORNO = configuracion.RAIZ / '.env'


def leer_argumentos(argv=None):
    parser = argparse.ArgumentParser(
        description='Crea o actualiza los esquemas gobierno, fuentes e indicadores de la base del tablero.')
    parser.add_argument('--base',
                        help='conexión de PostgreSQL con permisos de dueño (por defecto, TABLERO_BASE_DATOS o la base local)')
    parser.add_argument('--crear-base', metavar='ADMINISTRADOR',
                        help='conexión de un administrador de PostgreSQL; crea la base tablero_oferta, los usuarios tablero '
                             'y tablero_lectura con claves nuevas y el archivo .env (solo si .env no existe)')
    return parser.parse_args(argv)


def preparar_base(administrador):
    if ENTORNO.exists():
        sys.exit(f'Error: ya existe {ENTORNO}; la base se crea solo en una instalación nueva')
    try:
        url_dueno, url_lectura = crear_base(administrador)
    except psycopg.Error as error:
        sys.exit(f'Error: no fue posible crear la base con la conexión de administrador: {error}'.strip())
    escribir_entorno(ENTORNO, url_dueno, url_lectura)
    configuracion.cargar_entorno()
    print(f'Base tablero_oferta y usuarios tablero y tablero_lectura listos; conexiones guardadas en {ENTORNO}')


def main(argv=None):
    args = leer_argumentos(argv)
    if args.crear_base:
        preparar_base(args.crear_base)
    rol = configuracion.rol_lectura()
    try:
        with psycopg.connect(args.base or configuracion.url_base()) as conexion:
            aplicadas = migrar(conexion, rol)
            rol_existe = conexion.execute('select 1 from pg_roles where rolname = %s', [rol]).fetchone()
    except psycopg.OperationalError as error:
        sys.exit(f'Error: no fue posible conectar con la base de datos: {error}'.strip())
    except (psycopg.Error, ErrorMigracion) as error:
        sys.exit(f'Error: la base de datos rechazó la migración: {error}'.strip())
    print('Migraciones aplicadas: ' + (', '.join(aplicadas) if aplicadas else 'ninguna, la base ya estaba al día'))
    if not rol_existe:
        print(f'Advertencia: no existe el rol {rol}; el servicio no podrá consultar la base hasta que se cree '
              'y se vuelvan a aplicar las migraciones', file=sys.stderr)


if __name__ == '__main__':
    main()
