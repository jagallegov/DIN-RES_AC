create schema if not exists indicadores;
comment on schema indicadores is 'Resultados de indicadores: base depurada, estado de los periodos, componentes sumables por registro y resultados por periodo y sede.';

create view indicadores.registros_ofertados as
select
  periodo, uab_id, asignatura_id, carga_id, cupos, inscritos, fecha_apertura_acta, inscritos_apertura_acta,
  cancelaciones, matricula, porcentaje_aprobacion, promedio, aprobados, homologados, sin_resultado, archivo_origen
from fuentes.registros
where cupos > 0 or inscritos > 0;
comment on view indicadores.registros_ofertados is 'Base depurada: deja fuera los registros con cupos e inscripciones en cero, que casi siempre son homologaciones y reconocimientos registrados como asignatura aparte.';

create view indicadores.estado_periodos as
select
  r.periodo,
  p.anio,
  p.semestre,
  p.tipo,
  count(*) as registros,
  sum(r.matricula) as matricula,
  sum(r.sin_resultado) as sin_resultado,
  coalesce(sum(r.sin_resultado)::numeric / nullif(sum(r.matricula), 0), 1) as proporcion_sin_resultado,
  coalesce(sum(r.sin_resultado)::numeric / nullif(sum(r.matricula), 0), 1)
    > (select umbral_en_curso from gobierno.parametros) as en_curso
from indicadores.registros_ofertados r
join gobierno.periodos p on p.codigo = r.periodo
group by r.periodo, p.anio, p.semestre, p.tipo;
comment on view indicadores.estado_periodos is 'Periodos de la base depurada. Un periodo está en curso cuando la proporción de su matrícula final sin resultado supera gobierno.parametros.umbral_en_curso; cuenta en la sección de oferta y queda fuera de las de cancelaciones y aprobación.';

create view indicadores.componentes as
select
  r.periodo,
  f.sede_id,
  u.facultad_id,
  r.uab_id,
  r.asignatura_id,
  e.en_curso,
  r.cupos,
  r.inscritos,
  case when r.cupos > 0 then r.cupos else 0 end as cupos_ofertados,
  case when r.cupos > 0 then least(r.inscritos, r.cupos) else 0 end as inscritos_en_cupo,
  (r.cupos > 0)::integer as registros_con_cupo,
  (r.cupos > 0 and r.inscritos >= r.cupos)::integer as registros_con_cupo_completo,
  (not e.en_curso)::integer as registros_cerrados,
  case when e.en_curso then 0 else r.inscritos end as inscritos_cerrados,
  case when e.en_curso then 0 else r.cancelaciones end as cancelaciones,
  case when e.en_curso then 0 else r.matricula end as matricula_final,
  (not e.en_curso and r.inscritos > 0)::integer as registros_con_inscritos,
  (not e.en_curso and r.inscritos > 0 and r.cancelaciones = 0)::integer as registros_sin_cancelacion,
  case when not e.en_curso and r.matricula > r.sin_resultado then r.matricula - r.sin_resultado else 0 end
    as matricula_con_resultado,
  case when not e.en_curso and r.matricula > r.sin_resultado then r.aprobados else 0 end as aprobados,
  case when not e.en_curso and r.promedio is not null then r.matricula - r.sin_resultado else 0 end as con_nota,
  case when not e.en_curso and r.promedio is not null
    then round(r.promedio * 100 * (r.matricula - r.sin_resultado)) else 0 end as notas_en_centesimas
from indicadores.registros_ofertados r
join indicadores.estado_periodos e on e.periodo = r.periodo
join gobierno.uabs u on u.id = r.uab_id
join gobierno.facultades f on f.id = u.facultad_id;
comment on view indicadores.componentes is 'Componentes sumables de los indicadores, uno por registro de la base depurada. Los indicadores de cualquier agrupación son sumas o razones de sumas de estas columnas; el tablero hace el mismo cálculo en el navegador.';

create view indicadores.resultados_periodo_sede as
select
  c.periodo,
  s.codigo as sede,
  s.nombre as nombre_sede,
  count(distinct c.asignatura_id) as asignaturas,
  sum(c.cupos) as cupos,
  sum(c.inscritos) as inscritos,
  100.0 * sum(c.inscritos_en_cupo) / nullif(sum(c.cupos_ofertados), 0) as tasa_ocupacion,
  100.0 * sum(c.registros_con_cupo_completo) / nullif(sum(c.registros_con_cupo), 0) as cupo_completo,
  case when sum(c.registros_cerrados) > 0 then sum(c.inscritos_cerrados) end as inscritos_cerrados,
  case when sum(c.registros_cerrados) > 0 then sum(c.cancelaciones) end as cancelaciones,
  case when sum(c.registros_cerrados) > 0 then sum(c.matricula_final) end as matricula_final,
  100.0 * sum(c.cancelaciones) / nullif(sum(c.inscritos_cerrados), 0) as tasa_cancelacion,
  100.0 * sum(c.registros_sin_cancelacion) / nullif(sum(c.registros_con_inscritos), 0) as sin_cancelaciones,
  case when sum(c.registros_cerrados) > 0 then sum(c.matricula_con_resultado) end as matricula_con_resultado,
  case when sum(c.registros_cerrados) > 0 then sum(c.aprobados) end as aprobados,
  case when sum(c.registros_cerrados) > 0 then sum(c.matricula_con_resultado) - sum(c.aprobados) end as reprobados,
  100.0 * sum(c.aprobados) / nullif(sum(c.matricula_con_resultado), 0) as tasa_aprobacion,
  sum(c.notas_en_centesimas)::numeric / nullif(sum(c.con_nota), 0) / 100 as promedio
from indicadores.componentes c
join gobierno.sedes s on s.id = c.sede_id
group by grouping sets ((c.periodo, s.codigo, s.nombre), (c.periodo));
comment on view indicadores.resultados_periodo_sede is 'Los quince indicadores del tablero por periodo y sede. La fila con sede vacía reúne todas las sedes del periodo. Las tasas son razones de sumas, no promedios de tasas.';
comment on column indicadores.resultados_periodo_sede.asignaturas is 'Asignaturas ofertadas: asignaturas distintas con cupos ofertados o inscripciones.';
comment on column indicadores.resultados_periodo_sede.cupos is 'Cupos ofertados: suma de los cupos de la actividad principal de cada asignatura.';
comment on column indicadores.resultados_periodo_sede.inscritos is 'Inscripciones: suma, por asignatura y periodo, del máximo de inscritos.';
comment on column indicadores.resultados_periodo_sede.tasa_ocupacion is 'Tasa de ocupación (%): inscripciones sin sobrecupos sobre cupos ofertados, en asignaturas con cupos.';
comment on column indicadores.resultados_periodo_sede.cupo_completo is 'Asignaturas con cupo completo (%): registros con inscripciones iguales o mayores a los cupos sobre registros con cupos.';
comment on column indicadores.resultados_periodo_sede.inscritos_cerrados is 'Inscripciones en periodos cerrados.';
comment on column indicadores.resultados_periodo_sede.cancelaciones is 'Cancelaciones registradas después de la apertura del acta.';
comment on column indicadores.resultados_periodo_sede.matricula_final is 'Matrícula final: estudiantes en el acta al cierre.';
comment on column indicadores.resultados_periodo_sede.tasa_cancelacion is 'Tasa de cancelación (%): cancelaciones sobre inscripciones en periodos cerrados.';
comment on column indicadores.resultados_periodo_sede.sin_cancelaciones is 'Asignaturas sin cancelaciones (%): registros con inscripciones y sin cancelaciones sobre registros con inscripciones.';
comment on column indicadores.resultados_periodo_sede.matricula_con_resultado is 'Matrícula con resultado: matrícula final menos estudiantes sin resultado.';
comment on column indicadores.resultados_periodo_sede.aprobados is 'Aprobados: incluye los aprobados por homologación.';
comment on column indicadores.resultados_periodo_sede.reprobados is 'Reprobados: matrícula con resultado menos aprobados.';
comment on column indicadores.resultados_periodo_sede.tasa_aprobacion is 'Tasa de aprobación (%): aprobados sobre matrícula con resultado.';
comment on column indicadores.resultados_periodo_sede.promedio is 'Promedio de calificaciones (0,0 a 5,0) ponderado por estudiantes con nota numérica.';
