import argparse
import logging

import uvicorn


def main(argv=None):
    parser = argparse.ArgumentParser(description='Sirve la API REST autenticada del tablero.')
    parser.add_argument('--anfitrion', default='127.0.0.1', help='interfaz de red (por defecto, 127.0.0.1)')
    parser.add_argument('--puerto', type=int, default=8000, help='puerto HTTP (por defecto, 8000)')
    args = parser.parse_args(argv)
    logging.basicConfig(level=logging.INFO, format='%(asctime)s %(levelname)s %(name)s: %(message)s')
    uvicorn.run('tablero.api.aplicacion:crear_aplicacion', factory=True, host=args.anfitrion, port=args.puerto,
                timeout_graceful_shutdown=3)


if __name__ == '__main__':
    main()
