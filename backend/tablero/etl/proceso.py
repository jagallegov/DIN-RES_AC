import argparse
import hashlib
import re
import sys
from collections import namedtuple
from datetime import date
from pathlib import Path

import pandas as pd

from tablero import configuracion
from tablero.etl.carga import ErrorCarga, cargar

REPORTE = 'RE_ASI_CUP_INS_CAN'
HOJA_DESCRIPCION = 'Sheet1'
HOJA_DATOS = 'Sheet2'
FILA_ENCABEZADO = 1
ETIQUETA_EMISION = 'FECHA DE EMISIÓN DEL REPORTE'
PATRON_PERIODO = re.compile(r'^(\d{4})-([12])([A-Z])$')

SEDES = {
    '1101': 'Sede Bogotá',
    '1102': 'Sede Medellín',
    '1103': 'Sede Manizales',
    '1104': 'Sede Palmira',
    '1124': 'Sede Orinoquía',
    '1125': 'Sede Amazonía',
    '1126': 'Sede Caribe',
    '9920': 'Sede Tumaco',
    '9933': 'Sede De La Paz',
}

ENCABEZADOS = {
    'PERIODO': 'periodo',
    'COD_SEDE_ASIGNATURA': 'cod_sede_asignatura',
    'SEDE_ASIGNATURA': 'sede_asignatura',
    'COD_FAC_ASIGNATURA': 'cod_fac_asignatura',
    'FACULTAD_ASI': 'facultad_asignatura',
    'COD_UAB': 'cod_uab',
    'UAB': 'nombre_uab',
    'COD_ASIGNATURA': 'cod_asignatura',
    'ASIGNATURA': 'asignatura',
    'CUPOS_OFERTADOS': 'cupos_ofertados',
    'NRO_INSCRITOS_INICIALES': 'nro_inscritos_iniciales',
    'FECHA_APERTURA_ACTA': 'fecha_apertura_acta',
    'INS_FEC_APERTURA_ACTA': 'nro_inscritos_apertura_acta',
    'CAN_DES_APERTURA': 'nro_cupos_cancelados',
    'NRO_MAT_ACTA_FINAL': 'nro_mat_acta_final',
    'PORCENTAJE_APROBACION': 'porcentaje_aprobacion',
    'PROMEDIO_CALIFICACIONES': 'promedio_calificaciones',
    'NRO_APROBADOS_ACTA_FINAL': 'nro_aprobados_acta_final',
    'NRO_HOMOLOGADOS_APROBADOS': 'nro_homologados_aprobados',
    'NRO_SIN_RESULTADO_ACTA_FINAL': 'nro_sin_resultado_acta_final',
}

COLUMNAS_TEXTO = [
    'periodo', 'cod_sede_asignatura', 'sede_asignatura', 'cod_fac_asignatura', 'facultad_asignatura',
    'cod_uab', 'nombre_uab', 'cod_asignatura', 'asignatura',
]
COLUMNAS_ENTERAS = [
    'cupos_ofertados', 'nro_inscritos_iniciales', 'nro_inscritos_apertura_acta', 'nro_cupos_cancelados',
    'nro_mat_acta_final', 'nro_aprobados_acta_final', 'nro_homologados_aprobados', 'nro_sin_resultado_acta_final',
]
COLUMNAS_DECIMALES = ['porcentaje_aprobacion', 'promedio_calificaciones']
COLUMNAS_OPCIONALES = {'fecha_apertura_acta', 'nro_inscritos_apertura_acta', *COLUMNAS_DECIMALES}
LLAVE = ['periodo', 'cod_sede_asignatura', 'cod_fac_asignatura', 'cod_uab', 'cod_asignatura']
ORDEN_BASE = ['cod_sede_asignatura', 'periodo', 'cod_fac_asignatura', 'cod_uab', 'cod_asignatura']

ArchivoLeido = namedtuple('ArchivoLeido', 'nombre sha256 fecha_emision filas')


class ErrorDatos(Exception):
    pass


def fecha_iso(texto):
    return date.fromisoformat(texto)


def leer_argumentos(argv=None):
    parser = argparse.ArgumentParser(
        description='Unifica los reportes RE_ASI_CUP_INS_CAN de las sedes y los carga en la base de datos del tablero.')
    parser.add_argument('--reportes', type=Path, default=configuracion.carpeta_reportes(),
                        help='carpeta con los archivos .xlsx descargados (por defecto, TABLERO_REPORTES o reportes/)')
    parser.add_argument('--salida', type=Path, default=configuracion.carpeta_salida(),
                        help='carpeta de las bases unificadas (por defecto, TABLERO_SALIDA o salida/)')
    parser.add_argument('--base', default=configuracion.url_base(),
                        help='conexión de PostgreSQL con permisos de escritura (por defecto, TABLERO_BASE_DATOS o la base local)')
    parser.add_argument('--fecha-corte', type=fecha_iso,
                        help='fecha de corte en formato AAAA-MM-DD; por defecto, la fecha de emisión de los reportes')
    parser.add_argument('--responsable', default=configuracion.responsable(),
                        help='quién hace la carga (por defecto, TABLERO_RESPONSABLE o el usuario del sistema)')
    parser.add_argument('--sin-bases', action='store_true',
                        help='omite la exportación de las bases unificadas en Excel y CSV')
    return parser.parse_args(argv)


def fecha_emision(descripcion):
    valores = descripcion.iloc[:, 0].tolist()
    for i, valor in enumerate(valores):
        if isinstance(valor, str) and valor.strip().upper() == ETIQUETA_EMISION:
            siguiente = next((v for v in valores[i + 1:] if pd.notna(v)), None)
            dia_primero = isinstance(siguiente, str) and not re.match(r'^\d{4}-', siguiente.strip())
            fecha = pd.to_datetime(siguiente, errors='coerce', dayfirst=dia_primero)
            return None if pd.isna(fecha) else fecha.date()
    return None


def leer_reporte(ruta):
    with pd.ExcelFile(ruta) as libro:
        if HOJA_DATOS not in libro.sheet_names:
            raise ErrorDatos(f'{ruta.name}: no tiene la hoja {HOJA_DATOS}')
        datos = libro.parse(HOJA_DATOS, header=FILA_ENCABEZADO, dtype=str)
        emision = None
        if HOJA_DESCRIPCION in libro.sheet_names:
            emision = fecha_emision(libro.parse(HOJA_DESCRIPCION, header=None))
    faltan = sorted(set(ENCABEZADOS) - set(datos.columns))
    if faltan:
        raise ErrorDatos(f'{ruta.name}: faltan las columnas {", ".join(faltan)}')
    datos = datos.loc[:, list(ENCABEZADOS)].rename(columns=ENCABEZADOS).dropna(how='all')
    datos['archivo_origen'] = ruta.name
    return datos, emision


def a_numero(serie, columna):
    numeros = pd.to_numeric(serie, errors='coerce')
    invalidos = serie[numeros.isna() & serie.notna()]
    if len(invalidos):
        raise ErrorDatos(f'La columna {columna} tiene {len(invalidos)} valores no numéricos, por ejemplo {invalidos.iloc[0]!r}')
    return numeros


def normalizar(bruta):
    df = bruta.copy()
    for c in COLUMNAS_TEXTO:
        texto = df[c].str.replace(r'\s+', ' ', regex=True).str.strip()
        df[c] = texto.mask(texto == '')
    for c in COLUMNAS_ENTERAS:
        numeros = a_numero(df[c], c)
        if (numeros.dropna() % 1 != 0).any():
            raise ErrorDatos(f'La columna {c} tiene valores con decimales')
        df[c] = numeros.astype('Int64')
    for c in COLUMNAS_DECIMALES:
        df[c] = a_numero(df[c], c)
    fechas = pd.to_datetime(df['fecha_apertura_acta'], format='%Y/%m/%d', errors='coerce')
    invalidas = df.loc[fechas.isna() & df['fecha_apertura_acta'].notna(), 'fecha_apertura_acta']
    if len(invalidas):
        raise ErrorDatos(f'La columna fecha_apertura_acta tiene {len(invalidas)} fechas no válidas, por ejemplo {invalidas.iloc[0]!r}')
    df['fecha_apertura_acta'] = fechas
    return df.sort_values(ORDEN_BASE, kind='stable').reset_index(drop=True)


def contar(mascara):
    return int(mascara.fillna(False).sum())


def validar(df):
    errores, advertencias = [], []
    nulas = [c for c in [*COLUMNAS_TEXTO, *COLUMNAS_ENTERAS] if c not in COLUMNAS_OPCIONALES and df[c].isna().any()]
    if nulas:
        errores.append('Hay valores vacíos en ' + ', '.join(nulas))
    repetidos = df.duplicated(LLAVE)
    if repetidos.any():
        ejemplo = df.loc[repetidos, [*LLAVE, 'archivo_origen']].iloc[0]
        errores.append(f'Hay {int(repetidos.sum())} registros duplicados por la llave {", ".join(LLAVE)}, '
                       f'por ejemplo {" | ".join(map(str, ejemplo))}')
    periodos = sorted(p for p in df['periodo'].dropna().unique() if not PATRON_PERIODO.match(p))
    if periodos:
        errores.append('Hay periodos con formato no reconocido: ' + ', '.join(periodos))
    negativos = [c for c in COLUMNAS_ENTERAS if contar(df[c] < 0)]
    if negativos:
        errores.append('Hay valores negativos en ' + ', '.join(negativos))
    rangos = [('porcentaje_aprobacion', 0, 100), ('promedio_calificaciones', 0, 5)]
    fuera = [f'{c} (entre {minimo} y {maximo})' for c, minimo, maximo in rangos
             if contar((df[c] < minimo) | (df[c] > maximo))]
    if fuera:
        errores.append('Hay valores fuera de rango en ' + ', '.join(fuera))

    codigos = set(df['cod_sede_asignatura'].dropna())
    faltantes = sorted(set(SEDES) - codigos)
    if faltantes:
        advertencias.append('Faltan reportes de ' + ', '.join(f'{c} ({SEDES[c]})' for c in faltantes))
    imprevistas = sorted(codigos - set(SEDES))
    if imprevistas:
        advertencias.append('Aparecen sedes no previstas: ' + ', '.join(imprevistas))
    return errores, advertencias


def revisar_coherencia(df):
    con_resultado = df['nro_mat_acta_final'] - df['nro_sin_resultado_acta_final']
    revisiones = [
        (df['nro_sin_resultado_acta_final'] > df['nro_mat_acta_final'], 'con más estudiantes sin resultado que matrícula final'),
        (df['nro_aprobados_acta_final'] > con_resultado, 'con más aprobados que estudiantes con resultado'),
        (df['nro_mat_acta_final'] > df['nro_inscritos_iniciales'], 'con matrícula final mayor que los inscritos iniciales'),
    ]
    return [f'{miles(contar(m))} registros depurados {texto}' for m, texto in revisiones if contar(m)]


def depurar(bruta):
    sin_oferta = (bruta['cupos_ofertados'] == 0) & (bruta['nro_inscritos_iniciales'] == 0)
    return bruta.loc[~sin_oferta].reset_index(drop=True), sin_oferta


def control_depuracion(bruta, sin_oferta):
    control = (bruta.assign(eliminada=sin_oferta,
                            matricula_excluida=bruta['nro_mat_acta_final'].where(sin_oferta, 0),
                            homologados_excluidos=bruta['nro_homologados_aprobados'].where(sin_oferta, 0))
               .groupby(['cod_sede_asignatura', 'sede_asignatura', 'archivo_origen'])
               .agg(filas_brutas=('periodo', 'size'), filas_eliminadas=('eliminada', 'sum'),
                    matricula_excluida=('matricula_excluida', 'sum'),
                    homologados_excluidos=('homologados_excluidos', 'sum'))
               .reset_index())
    control.insert(5, 'filas_depuradas', control['filas_brutas'] - control['filas_eliminadas'])
    return control


def diccionario_columnas():
    return pd.DataFrame({
        'encabezado_original': [*ENCABEZADOS, '(agregada)'],
        'encabezado_normalizado': [*ENCABEZADOS.values(), 'archivo_origen'],
    })


def exportar_base(df, carpeta, nombre, hojas_extra):
    carpeta.mkdir(parents=True, exist_ok=True)
    with pd.ExcelWriter(carpeta / f'{nombre}.xlsx', engine='openpyxl', datetime_format='yyyy-mm-dd') as libro:
        df.to_excel(libro, sheet_name='datos', index=False)
        for hoja, tabla in hojas_extra.items():
            tabla.to_excel(libro, sheet_name=hoja, index=False)
        for hoja in libro.book.worksheets:
            hoja.freeze_panes = 'A2'
    df.to_csv(carpeta / f'{nombre}.csv', index=False, encoding='utf-8-sig', date_format='%Y-%m-%d')


def orden_periodo(periodo):
    anio, semestre, tipo = PATRON_PERIODO.match(periodo).groups()
    return int(anio), int(semestre), tipo


def proporcion_sin_resultado(df):
    totales = df.groupby('periodo')[['nro_mat_acta_final', 'nro_sin_resultado_acta_final']].sum()
    matricula = totales['nro_mat_acta_final'].astype(float)
    return (totales['nro_sin_resultado_acta_final'] / matricula.where(matricula > 0)).fillna(1.0)


def miles(n):
    return f'{n:,}'.replace(',', '.')


def huella_archivo(ruta):
    return hashlib.sha256(ruta.read_bytes()).hexdigest()


def leer_reportes(carpeta):
    rutas = sorted(r for r in carpeta.glob('*.xlsx') if not r.name.startswith(('~$', '.')))
    if not rutas:
        raise ErrorDatos(f'No hay archivos .xlsx en {carpeta}')
    lecturas = [leer_reporte(r) for r in rutas]
    bruta = pd.concat([datos for datos, _ in lecturas], ignore_index=True)
    archivos = [ArchivoLeido(ruta.name, huella_archivo(ruta), emision, len(datos))
                for ruta, (datos, emision) in zip(rutas, lecturas)]
    emisiones = sorted({e for _, e in lecturas if e})
    return archivos, bruta, emisiones


def ejecutar(args):
    archivos, bruta, emisiones = leer_reportes(args.reportes)
    bruta = normalizar(bruta)
    errores, advertencias = validar(bruta)
    if errores:
        raise ErrorDatos('la validación de los reportes no pasó.\n  ' + '\n  '.join(errores))

    if args.fecha_corte:
        fecha_corte = args.fecha_corte
    elif emisiones:
        fecha_corte = emisiones[-1]
    else:
        raise ErrorDatos('los reportes no traen fecha de emisión; se debe indicar con --fecha-corte AAAA-MM-DD')
    if len(emisiones) > 1:
        advertencias.append(f'Los reportes tienen fechas de emisión distintas ({emisiones[0]} a {emisiones[-1]})')

    depurada, sin_oferta = depurar(bruta)
    advertencias.extend(revisar_coherencia(depurada))
    control = control_depuracion(bruta, sin_oferta)
    excluidos = int(sin_oferta.sum())

    if not args.sin_bases:
        diccionario = diccionario_columnas()
        exportar_base(bruta, args.salida, 'BASE_UNIFICADA_BRUTA', {'diccionario_columnas': diccionario})
        exportar_base(depurada, args.salida, 'BASE_UNIFICADA_DEPURADA',
                      {'diccionario_columnas': diccionario, 'control_depuracion': control})

    resultado = cargar(bruta, fecha_corte, REPORTE, archivos, args.responsable, args.base, configuracion.rol_lectura())
    periodos = sorted(depurada['periodo'].unique(), key=orden_periodo)

    print(f'Archivos leídos: {len(archivos)}')
    print(f'Fecha de corte: {fecha_corte.isoformat()}')
    print(f'Filas brutas: {miles(len(bruta))} | depuradas: {miles(len(depurada))} | '
          f'excluidas por cupos e inscritos en cero: {miles(excluidos)}')
    proporcion = proporcion_sin_resultado(depurada)
    print('Periodos y proporción de matrícula sin resultado: ' +
          ', '.join(f'{p} {proporcion[p]:.1%}'.replace('.', ',') for p in periodos))
    print(f'Periodos en curso (más de {resultado.umbral:.0%} sin resultado): ' +
          (', '.join(resultado.periodos_en_curso) or 'ninguno'))
    if not args.sin_bases:
        print(f'Bases unificadas: {args.salida.resolve()}')
    print(f'Carga {resultado.carga} registrada: {miles(resultado.insertados)} registros insertados, '
          f'{miles(resultado.reemplazados)} reemplazados (versión {resultado.version} de los datos)')
    print()
    print(control.to_string(index=False))
    for texto in advertencias:
        print(f'Advertencia: {texto}', file=sys.stderr)


def main(argv=None):
    args = leer_argumentos(argv)
    try:
        ejecutar(args)
    except (ErrorDatos, ErrorCarga) as error:
        sys.exit(f'Error: {error}')
