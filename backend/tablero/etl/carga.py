from collections import namedtuple

import pandas as pd
import psycopg

from tablero.basedatos.migraciones import ErrorMigracion, migrar

COLUMNAS = [
    'periodo', 'cod_sede_asignatura', 'sede_asignatura', 'cod_fac_asignatura', 'facultad_asignatura',
    'cod_uab', 'nombre_uab', 'cod_asignatura', 'asignatura', 'cupos_ofertados', 'nro_inscritos_iniciales',
    'fecha_apertura_acta', 'nro_inscritos_apertura_acta', 'nro_cupos_cancelados', 'nro_mat_acta_final',
    'porcentaje_aprobacion', 'promedio_calificaciones', 'nro_aprobados_acta_final', 'nro_homologados_aprobados',
    'nro_sin_resultado_acta_final', 'archivo_origen',
]

LLAVE_BLOQUEO = 7413002

TABLA_TEMPORAL = '''
create temporary table carga_registros (
  periodo text not null,
  cod_sede_asignatura text not null,
  sede_asignatura text not null,
  cod_fac_asignatura text not null,
  facultad_asignatura text not null,
  cod_uab text not null,
  nombre_uab text not null,
  cod_asignatura text not null,
  asignatura text not null,
  cupos_ofertados integer not null,
  nro_inscritos_iniciales integer not null,
  fecha_apertura_acta date,
  nro_inscritos_apertura_acta integer,
  nro_cupos_cancelados integer not null,
  nro_mat_acta_final integer not null,
  porcentaje_aprobacion numeric,
  promedio_calificaciones numeric,
  nro_aprobados_acta_final integer not null,
  nro_homologados_aprobados integer not null,
  nro_sin_resultado_acta_final integer not null,
  archivo_origen text not null
) on commit drop
'''

MAS_RECIENTE = 'p.anio desc, p.semestre desc, p.tipo desc'

ACTUALIZAR_CATALOGOS = [
    '''
    insert into gobierno.periodos (codigo)
    select distinct periodo from carga_registros
    on conflict do nothing
    ''',
    f'''
    insert into gobierno.sedes (codigo, nombre)
    select distinct on (c.cod_sede_asignatura) c.cod_sede_asignatura, c.sede_asignatura
    from carga_registros c
    join gobierno.periodos p on p.codigo = c.periodo
    order by c.cod_sede_asignatura, {MAS_RECIENTE}
    on conflict (codigo) do update set nombre = excluded.nombre
    where gobierno.sedes.nombre is distinct from excluded.nombre
    ''',
    f'''
    insert into gobierno.facultades (sede_id, codigo, nombre)
    select distinct on (s.id, c.cod_fac_asignatura) s.id, c.cod_fac_asignatura, c.facultad_asignatura
    from carga_registros c
    join gobierno.periodos p on p.codigo = c.periodo
    join gobierno.sedes s on s.codigo = c.cod_sede_asignatura
    order by s.id, c.cod_fac_asignatura, {MAS_RECIENTE}
    on conflict (sede_id, codigo) do update set nombre = excluded.nombre
    where gobierno.facultades.nombre is distinct from excluded.nombre
    ''',
    f'''
    insert into gobierno.uabs (facultad_id, codigo, nombre)
    select distinct on (f.id, c.cod_uab) f.id, c.cod_uab, c.nombre_uab
    from carga_registros c
    join gobierno.periodos p on p.codigo = c.periodo
    join gobierno.sedes s on s.codigo = c.cod_sede_asignatura
    join gobierno.facultades f on f.sede_id = s.id and f.codigo = c.cod_fac_asignatura
    order by f.id, c.cod_uab, {MAS_RECIENTE}
    on conflict (facultad_id, codigo) do update set nombre = excluded.nombre
    where gobierno.uabs.nombre is distinct from excluded.nombre
    ''',
    f'''
    insert into gobierno.asignaturas (sede_id, codigo, nombre)
    select distinct on (s.id, c.cod_asignatura) s.id, c.cod_asignatura, c.asignatura
    from carga_registros c
    join gobierno.periodos p on p.codigo = c.periodo
    join gobierno.sedes s on s.codigo = c.cod_sede_asignatura
    order by s.id, c.cod_asignatura, {MAS_RECIENTE}
    on conflict (sede_id, codigo) do update set nombre = excluded.nombre
    where gobierno.asignaturas.nombre is distinct from excluded.nombre
    ''',
]

REGISTRAR_CARGA = '''
insert into gobierno.cargas (reporte, fecha_corte, filas, responsable)
values (%(reporte)s, %(fecha_corte)s, %(filas)s, %(responsable)s)
returning id
'''

REGISTRAR_ARCHIVO = '''
insert into gobierno.cargas_archivos (carga_id, archivo, sha256, fecha_emision, filas)
values (%s, %s, %s, %s, %s)
'''

BORRAR_REEMPLAZADOS = '''
delete from fuentes.registros r
using gobierno.uabs u, gobierno.facultades f, gobierno.sedes s
where u.id = r.uab_id
  and f.id = u.facultad_id
  and s.id = f.sede_id
  and (s.codigo, r.periodo) in (select distinct cod_sede_asignatura, periodo from carga_registros)
'''

INSERTAR_REGISTROS = '''
insert into fuentes.registros (
  periodo, uab_id, asignatura_id, carga_id, cupos, inscritos, fecha_apertura_acta, inscritos_apertura_acta,
  cancelaciones, matricula, porcentaje_aprobacion, promedio, aprobados, homologados, sin_resultado, archivo_origen
)
select
  c.periodo, u.id, a.id, %(carga)s, c.cupos_ofertados, c.nro_inscritos_iniciales, c.fecha_apertura_acta,
  c.nro_inscritos_apertura_acta, c.nro_cupos_cancelados, c.nro_mat_acta_final, c.porcentaje_aprobacion,
  c.promedio_calificaciones, c.nro_aprobados_acta_final, c.nro_homologados_aprobados,
  c.nro_sin_resultado_acta_final, c.archivo_origen
from carga_registros c
join gobierno.sedes s on s.codigo = c.cod_sede_asignatura
join gobierno.facultades f on f.sede_id = s.id and f.codigo = c.cod_fac_asignatura
join gobierno.uabs u on u.facultad_id = f.id and u.codigo = c.cod_uab
join gobierno.asignaturas a on a.sede_id = s.id and a.codigo = c.cod_asignatura
'''

CONSULTAR_EN_CURSO = '''
select periodo
from indicadores.estado_periodos
where en_curso
order by anio, semestre, tipo
'''

ResultadoCarga = namedtuple('ResultadoCarga', 'carga reemplazados insertados version periodos_en_curso umbral')


class ErrorCarga(Exception):
    pass


def valor_para_copia(valor):
    if valor is None or (not isinstance(valor, str) and pd.isna(valor)):
        return None
    if isinstance(valor, pd.Timestamp):
        return valor.date()
    if hasattr(valor, 'item'):
        return valor.item()
    return valor


def filas_para_copia(bruta):
    for fila in bruta[COLUMNAS].itertuples(index=False, name=None):
        yield tuple(valor_para_copia(valor) for valor in fila)


def cargar(bruta, fecha_corte, reporte, archivos, responsable, url, rol_lectura=None):
    try:
        with psycopg.connect(url) as conexion:
            migrar(conexion, rol_lectura)
            with conexion.transaction():
                conexion.execute('select pg_advisory_xact_lock(%s)', [LLAVE_BLOQUEO])
                conexion.execute(TABLA_TEMPORAL)
                with conexion.cursor().copy(f'copy carga_registros ({", ".join(COLUMNAS)}) from stdin') as copia:
                    for fila in filas_para_copia(bruta):
                        copia.write_row(fila)
                for sentencia in ACTUALIZAR_CATALOGOS:
                    conexion.execute(sentencia)
                carga = conexion.execute(REGISTRAR_CARGA, {
                    'reporte': reporte, 'fecha_corte': fecha_corte, 'filas': len(bruta), 'responsable': responsable,
                }).fetchone()[0]
                with conexion.cursor() as cursor:
                    cursor.executemany(REGISTRAR_ARCHIVO, [
                        (carga, archivo.nombre, archivo.sha256, archivo.fecha_emision, archivo.filas) for archivo in archivos
                    ])
                reemplazados = conexion.execute(BORRAR_REEMPLAZADOS).rowcount
                insertados = conexion.execute(INSERTAR_REGISTROS, {'carga': carga}).rowcount
                if insertados != len(bruta):
                    raise ErrorCarga(f'se insertaron {insertados} de {len(bruta)} registros; la carga se revirtió')
                version = conexion.execute('select version from gobierno.estado').fetchone()[0]
                umbral = float(conexion.execute('select umbral_en_curso from gobierno.parametros').fetchone()[0])
                en_curso = [fila[0] for fila in conexion.execute(CONSULTAR_EN_CURSO)]
    except psycopg.OperationalError as error:
        raise ErrorCarga(f'no fue posible conectar con la base de datos: {error}'.strip()) from error
    except (psycopg.Error, ErrorMigracion) as error:
        raise ErrorCarga(f'la base de datos rechazó la carga: {error}'.strip()) from error
    return ResultadoCarga(carga, reemplazados, insertados, version, en_curso, umbral)
