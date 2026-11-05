# Tablero de oferta y resultados de asignaturas

Tablero web de la Universidad Nacional de Colombia sobre la oferta de asignaturas por periodo académico: cupos, inscripciones, cancelaciones, matrícula final y calificaciones, con detalle por sede, facultad, unidad académica básica (UAB) y asignatura. Los datos salen del reporte RE_ASI_CUP_INS_CAN de la Dirección Nacional de Información Académica, Registro y Matrícula (DINARA).

El tablero tiene tres secciones: oferta y ocupación de cupos, cancelaciones y matrícula final, y aprobación y calificaciones. Cada una muestra cinco indicadores, la evolución por periodo, la comparación por nivel, la relación entre dos indicadores por asignatura y una tabla descargable.

Quien llega por primera vez puede seguir el tutorial de principio a fin. Las secciones que vienen después sirven de referencia.

## Tutorial

### 1. Requisitos

| Programa | Versión | Para qué |
|---|---|---|
| [uv](https://docs.astral.sh/uv/) o [Python](https://www.python.org/downloads/) | Python 3.11 o posterior | ETL y API. Con uv no hace falta instalar Python: uv descarga la versión que pide el proyecto |
| [Node.js](https://nodejs.org/) | 20.19 o posterior | Compilar el tablero |
| [PostgreSQL](https://www.postgresql.org/download/) | 14 o posterior | Base de datos |
| bash | — | Correr el instalador. Viene en Linux y macOS; en Windows se usa WSL |

Para revisar las versiones instaladas:

```bash
uv --version; python3 --version; node --version; psql --version
```

El instalador necesita además, una sola vez, una conexión de PostgreSQL con un usuario que pueda crear bases y usuarios, por lo general `postgres`:

```
postgresql://USUARIO:CLAVE@SERVIDOR:5432/postgres
```

### 2. Instalar el tablero

1. Copiar la carpeta del proyecto y abrir una terminal dentro de ella.
2. Copiar en `reportes/` los Excel de la DINARA, uno por sede. La forma de descargarlos está en el paso 4.
3. Correr el instalador con la conexión de administrador:

   ```bash
   ./instalar.sh --admin postgresql://postgres:CLAVE@localhost:5432/postgres --iniciar
   ```

4. Cuando la terminal muestre `Uvicorn running on http://127.0.0.1:8000`, abrir `http://localhost:8000` en el navegador.

El instalador hace esto:
1. crea `backend/.venv` e instala las dependencias de Python;
2. instala las dependencias del tablero y lo compila en `frontend/dist`;
3. crea la base `tablero_oferta` y los usuarios `tablero` (dueño) y `tablero_lectura` (solo consulta), con claves nuevas, y guarda sus conexiones en `.env`;
4. aplica las migraciones;
5. carga los reportes si la base está vacía;
6. con `--iniciar`, enciende el tablero.

Se puede volver a correr cuando se quiera, por ejemplo después de copiar el proyecto actualizado: no recrea la base ni repite la carga, y `--admin` solo hace falta la primera vez.

Si no se tiene un usuario administrador, quien administre la base crea la base y los usuarios así:

```sql
create role tablero login password 'clave del dueño';
create role tablero_lectura login password 'clave de lectura';
create database tablero_oferta owner tablero;
```

Después se copia `.env.example` como `.env`, se escriben en él las dos conexiones con sus claves y se corre `./instalar.sh --iniciar`, sin `--admin`.

### 3. Recorrer el tablero

**Encabezado.** Bajo el título hay dos líneas:
- la primera indica el estado de la conexión. «En línea con la base de datos» significa que el tablero se actualizará solo cuando cambien los datos;
- la segunda dice la fuente, la fecha de corte de los reportes y el momento de la última actualización.

**Secciones.** Las tres pestañas cambian de tema: oferta y ocupación de cupos, cancelaciones y matrícula final, y aprobación y calificaciones. Cada sección explica qué periodos incluye. Los periodos en curso, que todavía no tienen actas cerradas, solo cuentan en la primera.

**Filtros.** En el panel gris se eligen:
- el tipo de periodo: semestral, anual o intersemestral;
- los periodos;
- las sedes, las facultades y las unidades académicas básicas;
- las asignaturas, que se buscan por código o por nombre.

Lo elegido aparece en «Selección activa». Cada filtro se quita con su ×, y «Limpiar selección» vuelve al estado inicial.

**Indicadores.** Cada sección muestra cinco. El ícono gris marca un conteo (producto) y el verde, un porcentaje o promedio (resultado). El botón (i) junto al nombre muestra la definición. Los conteos suman todos los periodos seleccionados.

**Gráficos.**
- **Por periodo:** muestra la evolución del indicador principal.
- **Por nivel:** compara sedes, facultades, UAB o asignaturas, según lo filtrado. Un clic en una barra baja al siguiente nivel.
- **Dispersión por asignatura:** relaciona dos indicadores. Un clic en un punto agrega esa asignatura a los filtros.
- **Mapa de calor:** cruza el nivel con los periodos. Un clic en una fila baja de nivel.

Cada gráfico tiene «Ver datos», con sus cifras en una tabla, y un botón para descargar la imagen con el título, los filtros y la fuente.

**Tabla de asignaturas.**
- Un clic en un encabezado ordena la tabla.
- «Filtrar la tabla» busca por código o por nombre.
- Un clic en una fila agrega la asignatura a los filtros, y «Solo seleccionadas» deja solo esas.
- El botón de descarga la guarda en CSV separado por punto y coma, listo para abrir en Excel.

**Compartir una vista.** La dirección de la página guarda la sección y los filtros. Basta con copiarla y enviarla para que otra persona vea lo mismo.

### 4. Actualizar los datos

Cada vez que haya un corte nuevo:

1. En el módulo de reportes de la DINARA se abre el reporte RE_ASI_CUP_INS_CAN, «Conteo por asignatura en los periodos seleccionados de cupos ofertados, inscripciones y cancelaciones», y se descarga un archivo por sede con estos filtros:
   - sede: una por descarga;
   - facultad y UAB: todas las de la sede;
   - código de asignatura: vacío;
   - periodo: todos los del rango de análisis, semestrales, anuales e intersemestrales.

   Cada archivo se guarda en Excel tal como sale del sistema, sin abrirlo ni editarlo. La hoja Sheet1 trae la fecha de emisión, que se toma como fecha de corte; la hoja Sheet2 trae los datos.

2. Los archivos nuevos reemplazan a los anteriores en `reportes/`. El nombre es libre; por orden se usa el código de la sede (`1101.xlsx`, `1102.xlsx`, ...). Las sedes esperadas son 1101 Bogotá, 1102 Medellín, 1103 Manizales, 1104 Palmira, 1124 Orinoquía, 1125 Amazonía, 1126 Caribe, 9920 Tumaco y 9933 De La Paz.

3. Se corre el ETL desde la carpeta `backend`:

   ```bash
   cd backend && .venv/bin/python -m tablero.etl --responsable "Nombre de quien carga"
   ```

4. Se revisa lo que imprime:
   - archivos leídos y fecha de corte;
   - filas brutas, depuradas y excluidas;
   - proporción de matrícula sin resultado de cada periodo y periodos en curso;
   - número de la carga y un control por sede.

   Si algún reporte trae columnas faltantes, valores vacíos o no numéricos, negativos, fuera de rango, registros duplicados o periodos con formato desconocido, el ETL se detiene y la base queda como estaba. Lo que no impide la carga, como una sede sin reporte, sale como advertencia.

5. Los tableros que estén abiertos se actualizan solos en menos de 15 segundos y conservan la sección y los filtros.

Opciones del ETL:
- **Cargas parciales.** Cada carga reemplaza solo las combinaciones de sede y periodo que trae. Para actualizar una sede basta con poner su archivo en una carpeta aparte e indicarla con `--reportes`.
- **Fecha de corte.** `--fecha-corte AAAA-MM-DD` reemplaza la fecha de emisión que traen los reportes.
- **Bases unificadas.** Por defecto se generan en `salida/`, en Excel y CSV; `--sin-bases` las omite.

Cada carga queda registrada en la base con su fecha de corte, sus archivos y su responsable. Las últimas se consultan así:

```sql
select id, fecha_corte, filas, responsable, cargada_en from gobierno.cargas order by id desc;
```

### 5. Encender y apagar el tablero

El tablero se enciende desde la carpeta `backend`:

```bash
cd backend && .venv/bin/python -m tablero.api
```

Queda en `http://localhost:8000` mientras esa terminal siga abierta, y se apaga con Ctrl+C. Si el puerto 8000 está ocupado, se usa otro con `--puerto 8001`. PostgreSQL debe estar encendido.

### 6. Si algo falla

| Lo que se ve | Qué pasa | Qué hacer |
|---|---|---|
| «Sin conexión con el servicio de datos; se reintenta automáticamente.» | El servicio está apagado o no responde | Encender el servicio (paso 5). El tablero se reconecta solo |
| «El servicio no tiene conexión con la base de datos…» o «No fue posible consultar la base de datos.» | PostgreSQL está apagado o la conexión de `.env` no es correcta | Encender PostgreSQL y revisar `TABLERO_BASE_DATOS_LECTURA` en `.env` |
| «La base de datos todavía no tiene registros.» | Todavía no se ha cargado ningún reporte | Correr el ETL (paso 4) |
| «El tablero no puede abrirse como archivo local.» | Se abrió `index.html` con doble clic | Encender el servicio y abrir `http://localhost:8000` |
| ETL: «Error: la validación de los reportes no pasó.» | Un reporte trae datos que no cumplen las reglas | Leer el detalle, que dice la columna, el archivo y un ejemplo, y descargar de nuevo ese reporte |
| ETL: «Error: los reportes no traen fecha de emisión…» | La hoja Sheet1 no trae la fecha | Indicarla con `--fecha-corte AAAA-MM-DD` |
| ETL: «Advertencia: Faltan reportes de…» | Falta el archivo de alguna sede | La carga sigue con las demás; se puede cargar esa sede después |
| Instalador: «falta el archivo .env» | Es una instalación nueva sin `--admin` | Volver a correr con `--admin`, o escribir `.env` a mano (paso 2) |
| Instalador: «se necesita Python 3.11 o posterior, o uv» | No hay uv ni un Python reciente | Instalar uv o Python 3.11 o posterior (paso 1) |
| `address already in use` al encender | Otro programa, o el mismo tablero abierto en otra terminal, usa el puerto 8000 | Apagar el otro proceso o usar `--puerto 8001` |

## Arquitectura

```
reportes .xlsx de la DINARA (uno por sede)
        │  python -m tablero.etl
        ▼
ETL · Python (pandas, openpyxl): valida, depura y carga en una sola transacción
        ▼
PostgreSQL · esquemas gobierno, fuentes e indicadores
        │  usuario de solo lectura
        ▼
API · Python (FastAPI): entrega los datos y sirve el tablero compilado
        ▼
Tablero · React 18 + TypeScript + ECharts 5.5
```

| Pieza | Carpeta | Tecnología | Cómo se ejecuta |
|---|---|---|---|
| ETL | `backend/tablero/etl/` | Python 3.13, pandas, openpyxl, psycopg | `python -m tablero.etl`, cuando llegan reportes nuevos |
| Migraciones | `backend/tablero/basedatos/` | SQL versionado | `python -m tablero.basedatos`; el ETL también las aplica |
| API | `backend/tablero/api/` | FastAPI, uvicorn | `python -m tablero.api`, como servicio |
| Tablero | `frontend/` | React 18, TypeScript, ECharts 5.5.1, Vite | se compila con `npm run build` y lo sirve la API |
| Base de datos | — | PostgreSQL 14 o posterior | la de la Sede, o la local en desarrollo |

El tablero calcula los indicadores en el navegador: la API le entrega la base depurada en columnas (unos 45.000 registros) y cada cambio de filtro se resuelve sin volver al servidor. Cada 15 segundos el tablero consulta la versión de los datos y, si cambió, los vuelve a pedir y se redibuja sin perder la sección ni los filtros, que viven en la dirección de la página.

## Estructura

```
backend/                     ETL, API y migraciones (un solo paquete de Python)
  tablero/etl/               lectura, validación, depuración y carga de los reportes
  tablero/api/               API de solo lectura; sirve también el tablero compilado
  tablero/basedatos/         migraciones de los tres esquemas y creación de la base
  pruebas/                   pruebas del ETL, de la base y de la API
frontend/                    tablero
  src/dominio/               cálculos, formatos y textos (sin React)
  src/componentes/           componentes de la interfaz
  pruebas/                   pruebas de los cálculos y del arranque
instalar.sh                  instala el proyecto y, con --iniciar, lo enciende
.env.example                 variables que se definen en .env
reportes/                    reportes descargados de la DINARA (no se versiona)
salida/                      bases unificadas que genera el ETL (no se versiona)
```

## Base de datos

La base se organiza en tres esquemas:

- **`gobierno`, gobierno y catálogo.**
  - `parametros`: umbral de periodo en curso.
  - `estado`: versión de los datos, que sube con cada cambio.
  - `reportes`: catálogo de reportes de origen y entidad que los emite.
  - `cargas` y `cargas_archivos`: cada ejecución del ETL con su fecha de corte, responsable, archivos, huella SHA-256 y fecha de emisión.
  - Catálogos `sedes`, `facultades`, `uabs`, `asignaturas` y `periodos`.
  - `migraciones`: migraciones aplicadas.
- **`fuentes`, datos de las fuentes.** `registros` guarda una fila del reporte por asignatura, periodo y UAB, con todas sus columnas.
- **`indicadores`, resultados de indicadores.** Son vistas, de modo que las reglas quedan en un solo lugar y siempre al día:
  - `registros_ofertados`: base depurada.
  - `estado_periodos`: proporción de matrícula sin resultado y marca de periodo en curso.
  - `componentes`: componentes sumables de cada registro.
  - `resultados_periodo_sede`: los quince indicadores por periodo y sede. La fila sin sede reúne todas las sedes.

Hay dos usuarios. `tablero` es el dueño de los esquemas y lo usan las migraciones y el ETL. `tablero_lectura` solo puede consultar y lo usa la API. Las migraciones están en `backend/tablero/basedatos/sql/`, se aplican en orden y quedan registradas con su huella: una migración ya aplicada no se edita, los cambios van en una nueva.

## API

| Ruta | Respuesta |
|---|---|
| `GET /` | el tablero compilado (`frontend/dist`) |
| `GET /api/datos` | registros de la base depurada en columnas y sus catálogos, comprimidos y con etiqueta de versión (`ETag`) |
| `GET /api/estado` | versión vigente de los datos y momento de la última actualización |
| `GET /api/resultados?periodo=2026-1S&sede=1101` | los quince indicadores por periodo y sede; los dos filtros son opcionales |
| `GET /salud` | estado del servicio, para el monitoreo |

La API es de solo lectura y su documentación está en `http://localhost:8000/api/docs`. Si la base deja de responder, `/api/datos` sigue entregando la última versión leída y `/api/estado` responde 503; el tablero lo indica bajo el título y se recupera solo.

## Despliegue

En el servidor de la Sede:

1. Se copia el proyecto y se corre `./instalar.sh`, con `--admin` y una conexión de administrador del PostgreSQL de la Sede, o con un `.env` escrito a mano si el administrador de la base crea la base y los usuarios (paso 2 del tutorial).
2. Se revisa que `.env` quede solo con permisos para el usuario del servicio.
3. El servicio se deja como servicio del sistema (systemd o equivalente) con `.venv/bin/python -m tablero.api --anfitrion 127.0.0.1 --puerto 8000` desde `backend/`, detrás del servidor web de la Sede (Apache o nginx), que publica el sitio con HTTPS.
4. El ETL se corre en el mismo servidor, o en cualquier equipo que llegue a la base con el usuario dueño, cada vez que haya reportes nuevos.

Variables de configuración (en `.env` o en el entorno del servicio):

| Variable | Uso |
|---|---|
| `TABLERO_BASE_DATOS` | conexión del usuario dueño, para el ETL y las migraciones |
| `TABLERO_BASE_DATOS_LECTURA` | conexión del usuario de solo lectura, para la API |
| `TABLERO_ROL_LECTURA` | usuario que recibe el permiso de consulta; por defecto `tablero_lectura` |
| `TABLERO_RESPONSABLE` | quién hace la carga; por defecto, el usuario del sistema |
| `TABLERO_REPORTES`, `TABLERO_SALIDA` | carpetas de reportes y de bases unificadas; por defecto `reportes/` y `salida/` |
| `TABLERO_CARPETA_WEB` | carpeta del tablero compilado; por defecto `frontend/dist` |

## Criterios de cálculo

- Cada registro es una asignatura en un periodo dentro de una UAB. Los conteos suman los periodos seleccionados: un estudiante cuenta una vez por cada asignatura y periodo en que aparece.
- Se excluyen los registros con cupos e inscritos en cero. En el corte del 6 de octubre de 2026 son 4.180; casi todos corresponden a homologaciones y reconocimientos registrados como asignatura aparte, y suman 16.144 estudiantes en la matrícula final. Siguen guardados en `fuentes.registros`, y la tabla de control de la base depurada los informa por sede.
- Un periodo está en curso cuando más de la mitad de su matrícula final no tiene resultado en el acta. El umbral está en `gobierno.parametros.umbral_en_curso`. Los periodos en curso cuentan en la sección de oferta y quedan fuera de las de cancelaciones y aprobación.
- Las tasas se calculan sobre los totales de la selección, no como promedio de tasas. La ocupación no suma sobrecupos. El promedio de calificaciones se pondera por estudiantes calificados y deja fuera las asignaturas con notas no numéricas.
- En la dispersión y en las barras por asignatura se distinguen las asignaturas con una base menor que 10 (cupos, inscripciones o estudiantes con resultado, según la sección).

| Indicador | Tipo | Cálculo |
|---|---|---|
| Asignaturas ofertadas | Producto | asignaturas distintas con cupos o inscripciones |
| Cupos ofertados | Producto | suma de cupos de la actividad principal |
| Inscripciones | Producto | suma del máximo de inscritos por asignatura y periodo |
| Tasa de ocupación | Resultado | mínimo entre inscripciones y cupos / cupos, en asignaturas con cupos |
| Asignaturas con cupo completo | Resultado | registros con inscripciones iguales o mayores a los cupos / registros con cupos |
| Inscripciones en periodos cerrados | Producto | inscripciones de los periodos con actas cerradas |
| Cancelaciones | Producto | cancelaciones posteriores a la apertura del acta |
| Matrícula final | Producto | estudiantes en el acta al cierre |
| Tasa de cancelación | Resultado | cancelaciones / inscripciones en periodos cerrados |
| Asignaturas sin cancelaciones | Resultado | registros con inscripciones y sin cancelaciones / registros con inscripciones |
| Matrícula con resultado | Producto | matrícula final menos estudiantes sin resultado |
| Aprobados | Producto | aprobados en el acta, con homologaciones |
| Reprobados | Producto | matrícula con resultado menos aprobados |
| Tasa de aprobación | Resultado | aprobados / matrícula con resultado |
| Promedio de calificaciones | Resultado | promedio ponderado por estudiantes con nota numérica |

## Desarrollo y pruebas

Las pruebas del backend que usan la base crean una base temporal por caso y la borran al terminar. Necesitan una conexión de administrador en `TABLERO_BASE_PRUEBAS`; sin ella se omiten.

```bash
cd backend && uv pip install --python .venv/bin/python -r requirements-pruebas.txt
```

```bash
cd backend && TABLERO_BASE_PRUEBAS="postgresql://postgres:CLAVE@localhost:5432/postgres" .venv/bin/python -m unittest discover -s pruebas -p "test_*.py"
```

`test_datos_reales.py` carga los nueve reportes de `reportes/` y comprueba dos cosas:
- que la API entregue exactamente los registros y catálogos de referencia del corte del 6 de octubre de 2026, guardados en `frontend/pruebas/datos/`;
- que las vistas de `indicadores` den las cifras publicadas.

Tablero:

```bash
cd frontend && npm test
```

`npm run dev` levanta el tablero en `http://localhost:5173` con recarga en caliente y reenvía `/api` a la API en `http://localhost:8000`. Las pruebas del tablero calculan los indicadores sobre una copia de los datos del corte del 6 de octubre de 2026, guardada en `frontend/pruebas/datos/`.

## Software libre

Todos los componentes son libres y sin costo de licenciamiento:

| Componente | Licencia |
|---|---|
| Python, pandas, openpyxl, FastAPI, uvicorn | PSF, BSD-3, MIT, MIT, BSD-3 |
| psycopg y psycopg-pool | LGPL-3.0 |
| PostgreSQL | PostgreSQL License |
| React, TypeScript, Vite | MIT, Apache-2.0, MIT |
| ECharts | Apache-2.0 |
