import re

from psycopg.rows import dict_row, tuple_row

PATRON_PERIODO = re.compile(r'^(\d{4})-([12])([A-Z])$')

CONSULTA_ESTADO = 'select version, actualizado from gobierno.estado'

CONSULTA_REGISTROS = '''
select
  r.periodo, r.uab_id, r.asignatura_id, r.carga_id, r.cupos, r.inscritos, r.cancelaciones,
  r.matricula, r.sin_resultado, r.aprobados, r.promedio
from indicadores.registros_ofertados r
join gobierno.uabs u on u.id = r.uab_id
join gobierno.facultades f on f.id = u.facultad_id
join gobierno.sedes s on s.id = f.sede_id
join gobierno.asignaturas a on a.id = r.asignatura_id
order by s.codigo collate "C", r.periodo collate "C", f.codigo collate "C", u.codigo collate "C", a.codigo collate "C"
'''

CONSULTAS_COMPLEMENTARIAS = {
    'umbral': 'select umbral_en_curso from gobierno.parametros',
    'excluidos': 'select count(*) from fuentes.registros where not (cupos > 0 or inscritos > 0)',
    'en_curso': 'select periodo from indicadores.estado_periodos where en_curso',
    'cargas': 'select c.id, c.fecha_corte, r.entidad from gobierno.cargas c join gobierno.reportes r on r.codigo = c.reporte',
    'sedes': 'select id, codigo, nombre from gobierno.sedes',
    'facultades': 'select id, codigo, nombre, sede_id from gobierno.facultades',
    'uabs': 'select id, codigo, nombre, facultad_id from gobierno.uabs',
    'asignaturas': 'select id, codigo, nombre, sede_id from gobierno.asignaturas',
}

CONSULTA_RESULTADOS = '''
select r.*
from indicadores.resultados_periodo_sede r
join gobierno.periodos p on p.codigo = r.periodo
where (%(periodo)s::text is null or r.periodo = %(periodo)s)
  and (%(sede)s::text is null or r.sede = %(sede)s)
order by p.anio, p.semestre, p.tipo, r.sede nulls first
'''

COLUMNAS_NUMERICAS = ['cupos', 'inscritos', 'cancelaciones', 'matricula', 'sinResultado', 'aprobados']


def orden_periodo(codigo):
    anio, semestre, tipo = PATRON_PERIODO.match(codigo).groups()
    return int(anio), int(semestre), tipo


def posiciones(identificadores):
    return {identificador: posicion for posicion, identificador in enumerate(identificadores)}


def armar_datos(version, actualizado, umbral, excluidos, en_curso, cargas, sedes, facultades, uabs, asignaturas, filas):
    sedes = {fila[0]: fila[1:] for fila in sedes}
    facultades = {fila[0]: fila[1:] for fila in facultades}
    uabs = {fila[0]: fila[1:] for fila in uabs}
    asignaturas = {fila[0]: fila[1:] for fila in asignaturas}
    cargas = {fila[0]: fila[1:] for fila in cargas}

    ids_uab = {fila[1] for fila in filas}
    ids_asignatura = {fila[2] for fila in filas}
    ids_facultad = {uabs[uab][2] for uab in ids_uab}
    ids_sede = {facultades[facultad][2] for facultad in ids_facultad} | {asignaturas[a][2] for a in ids_asignatura}

    orden_sedes = sorted(ids_sede, key=lambda sede: sedes[sede][0])
    posicion_sede = posiciones(orden_sedes)
    orden_facultades = sorted(ids_facultad, key=lambda f: (posicion_sede[facultades[f][2]], facultades[f][1], facultades[f][0]))
    posicion_facultad = posiciones(orden_facultades)
    orden_uabs = sorted(ids_uab, key=lambda u: (posicion_facultad[uabs[u][2]], uabs[u][1], uabs[u][0]))
    posicion_uab = posiciones(orden_uabs)
    orden_asignaturas = sorted(ids_asignatura, key=lambda a: (posicion_sede[asignaturas[a][2]], asignaturas[a][0]))
    posicion_asignatura = posiciones(orden_asignaturas)

    periodos = sorted({fila[0] for fila in filas}, key=orden_periodo)
    posicion_periodo = posiciones(periodos)
    cargas_usadas = sorted({fila[3] for fila in filas}, key=lambda carga: (cargas[carga][0], carga))
    fechas_corte = [cargas[carga][0].isoformat() for carga in cargas_usadas]

    registros = {
        'periodo': [posicion_periodo[fila[0]] for fila in filas],
        'uab': [posicion_uab[fila[1]] for fila in filas],
        'asignatura': [posicion_asignatura[fila[2]] for fila in filas],
    }
    for desplazamiento, columna in enumerate(COLUMNAS_NUMERICAS, start=4):
        registros[columna] = [fila[desplazamiento] for fila in filas]
    registros['promedio'] = [None if fila[10] is None else float(fila[10]) for fila in filas]

    meta = {
        'version': version,
        'actualizado': actualizado.isoformat(),
        'fechaCorte': fechas_corte[-1] if fechas_corte else None,
        'fechaCorteMinima': fechas_corte[0] if fechas_corte else None,
        'fuente': cargas[cargas_usadas[-1]][1] if cargas_usadas else None,
        'filas': len(filas),
        'excluidos': excluidos,
        'umbralEnCurso': float(umbral),
        'periodos': periodos,
        'periodosEnCurso': sorted((p for p in en_curso if p in posicion_periodo), key=orden_periodo),
        'sedes': [[sedes[s][0], sedes[s][1]] for s in orden_sedes],
        'facultades': [[facultades[f][0], facultades[f][1], posicion_sede[facultades[f][2]]] for f in orden_facultades],
        'uabs': [[uabs[u][0], uabs[u][1], posicion_facultad[uabs[u][2]]] for u in orden_uabs],
        'asignaturas': [[asignaturas[a][0], asignaturas[a][1], posicion_sede[asignaturas[a][2]]] for a in orden_asignaturas],
    }
    return {'meta': meta, 'registros': registros}


async def leer_estado(conexion):
    async with conexion.cursor(row_factory=tuple_row) as cursor:
        await cursor.execute(CONSULTA_ESTADO)
        return await cursor.fetchone()


async def leer_datos(conexion):
    async with conexion.transaction():
        async with conexion.cursor(row_factory=tuple_row) as cursor:
            await cursor.execute('set transaction isolation level repeatable read, read only')
            await cursor.execute(CONSULTA_ESTADO)
            version, actualizado = await cursor.fetchone()
            resultados = {}
            for clave, consulta in CONSULTAS_COMPLEMENTARIAS.items():
                await cursor.execute(consulta)
                resultados[clave] = await cursor.fetchall()
            await cursor.execute(CONSULTA_REGISTROS)
            filas = await cursor.fetchall()
    return armar_datos(
        version, actualizado,
        umbral=resultados['umbral'][0][0],
        excluidos=resultados['excluidos'][0][0],
        en_curso=[fila[0] for fila in resultados['en_curso']],
        cargas=resultados['cargas'],
        sedes=resultados['sedes'],
        facultades=resultados['facultades'],
        uabs=resultados['uabs'],
        asignaturas=resultados['asignaturas'],
        filas=filas,
    )


def numero(valor):
    return None if valor is None else float(valor) if not isinstance(valor, int) else valor


async def leer_resultados(conexion, periodo=None, sede=None):
    async with conexion.cursor(row_factory=dict_row) as cursor:
        await cursor.execute(CONSULTA_RESULTADOS, {'periodo': periodo, 'sede': sede})
        filas = await cursor.fetchall()
    return [{clave: valor if isinstance(valor, str) else numero(valor) for clave, valor in fila.items()} for fila in filas]
