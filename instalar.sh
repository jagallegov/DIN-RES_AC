#!/usr/bin/env bash
# Instala el tablero: entorno de Python, tablero compilado, base de datos y datos.
# Se puede correr varias veces; cada paso deja lo que ya está bien.
set -euo pipefail

RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND="$RAIZ/backend"
FRONTEND="$RAIZ/frontend"
PYTHON="$BACKEND/.venv/bin/python"
ADMINISTRADOR=""
INICIAR=0

uso() {
  cat <<'TEXTO'
Uso: ./instalar.sh [--admin CONEXION] [--iniciar]

  --admin CONEXION  conexión de un administrador de PostgreSQL, por ejemplo
                    postgresql://postgres@localhost:5432/postgres. Si no existe .env,
                    crea la base tablero_oferta, los usuarios tablero y tablero_lectura
                    y el archivo .env con sus conexiones.
  --iniciar         al terminar, enciende el tablero en http://localhost:8000.
TEXTO
}

paso() { printf '\n==> %s\n' "$1"; }
falla() { printf '\nError: %s\n' "$1" >&2; exit 1; }

while [ $# -gt 0 ]; do
  case "$1" in
    --admin) [ $# -ge 2 ] || falla "a --admin le falta la conexión"; ADMINISTRADOR="$2"; shift 2 ;;
    --iniciar) INICIAR=1; shift ;;
    -h|--help) uso; exit 0 ;;
    *) uso >&2; falla "opción desconocida: $1" ;;
  esac
done

python_compatible() {
  "$1" -c 'import sys; sys.exit(sys.version_info < (3, 11))' 2>/dev/null
}

paso "Entorno de Python (backend/.venv)"
cd "$BACKEND"
if command -v uv >/dev/null 2>&1; then
  uv venv --quiet --allow-existing --python 3.13 .venv
  uv pip install --quiet --python "$PYTHON" -r requirements.txt
else
  SISTEMA=""
  for candidato in python3.13 python3.12 python3.11 python3; do
    if command -v "$candidato" >/dev/null 2>&1 && python_compatible "$candidato"; then SISTEMA="$candidato"; break; fi
  done
  [ -n "$SISTEMA" ] || falla "se necesita Python 3.11 o posterior, o uv (https://docs.astral.sh/uv/)"
  [ -x "$PYTHON" ] || "$SISTEMA" -m venv .venv
  "$PYTHON" -m pip install --quiet --disable-pip-version-check -r requirements.txt
fi

paso "Tablero (frontend/dist)"
command -v npm >/dev/null 2>&1 || falla "se necesita Node.js 20.19 o posterior"
node -e 'const [a, b] = process.versions.node.split(".").map(Number); process.exit((a === 20 && b >= 19) || (a === 22 && b >= 12) || a > 22 ? 0 : 1)' \
  || falla "se necesita Node.js 20.19 o posterior (o 22.12 o posterior); está instalado $(node --version)"
cd "$FRONTEND"
npm ci --no-audit --no-fund --loglevel=error
npm run build --silent

paso "Base de datos"
cd "$BACKEND"
if [ ! -f "$RAIZ/.env" ]; then
  if [ -z "$ADMINISTRADOR" ]; then
    falla "falta el archivo .env. Se puede volver a correr con --admin postgresql://postgres@localhost:5432/postgres para que el script cree la base, los usuarios y el .env, o copiar .env.example como .env y escribir las dos conexiones."
  fi
  "$PYTHON" -m tablero.basedatos --crear-base "$ADMINISTRADOR"
else
  "$PYTHON" -m tablero.basedatos
fi

paso "Datos"
REGISTROS="$("$PYTHON" - <<'CODIGO'
import psycopg
from tablero import configuracion
with psycopg.connect(configuracion.url_base()) as conexion:
    print(conexion.execute('select count(*) from fuentes.registros').fetchone()[0])
CODIGO
)" || falla "no fue posible consultar la base con la conexión TABLERO_BASE_DATOS de .env"
if [ "$REGISTROS" -gt 0 ]; then
  echo "La base ya tiene $REGISTROS registros. Para cargar reportes nuevos: cd backend && .venv/bin/python -m tablero.etl"
elif compgen -G "$RAIZ/reportes/*.xlsx" >/dev/null; then
  "$PYTHON" -m tablero.etl --sin-bases
else
  echo "No hay reportes en reportes/. Cuando estén: cd backend && .venv/bin/python -m tablero.etl"
fi

paso "Listo"
echo "El tablero se enciende con: cd backend && .venv/bin/python -m tablero.api"
echo "y queda en http://localhost:8000"
if [ "$INICIAR" -eq 1 ]; then
  exec "$PYTHON" -m tablero.api
fi
