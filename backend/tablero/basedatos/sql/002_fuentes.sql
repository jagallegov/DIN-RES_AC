create schema if not exists fuentes;
comment on schema fuentes is 'Datos de las fuentes: registros del reporte RE_ASI_CUP_INS_CAN de la DINARA tal como llegan, una fila por asignatura, periodo y unidad académica básica.';

create table fuentes.registros (
  periodo text not null references gobierno.periodos,
  uab_id integer not null references gobierno.uabs,
  asignatura_id integer not null references gobierno.asignaturas,
  carga_id integer not null references gobierno.cargas,
  cupos integer not null check (cupos >= 0),
  inscritos integer not null check (inscritos >= 0),
  fecha_apertura_acta date,
  inscritos_apertura_acta integer check (inscritos_apertura_acta >= 0),
  cancelaciones integer not null check (cancelaciones >= 0),
  matricula integer not null check (matricula >= 0),
  porcentaje_aprobacion numeric check (porcentaje_aprobacion between 0 and 100),
  promedio numeric check (promedio between 0 and 5),
  aprobados integer not null check (aprobados >= 0),
  homologados integer not null check (homologados >= 0),
  sin_resultado integer not null check (sin_resultado >= 0),
  archivo_origen text not null,
  primary key (periodo, uab_id, asignatura_id)
);
comment on table fuentes.registros is 'Una fila del reporte RE_ASI_CUP_INS_CAN por asignatura, periodo y unidad académica básica. Cada carga reemplaza las combinaciones de sede y periodo que trae.';
comment on column fuentes.registros.cupos is 'CUPOS_OFERTADOS: cupos de todos los grupos de la actividad principal de la asignatura.';
comment on column fuentes.registros.inscritos is 'NRO_INSCRITOS_INICIALES: número máximo de inscritos en cualquier momento del periodo, antes o después de la apertura del acta.';
comment on column fuentes.registros.fecha_apertura_acta is 'FECHA_APERTURA_ACTA.';
comment on column fuentes.registros.inscritos_apertura_acta is 'INS_FEC_APERTURA_ACTA: inscritos vinculados al acta de calificación al momento de su apertura.';
comment on column fuentes.registros.cancelaciones is 'CAN_DES_APERTURA: cupos cancelados, con o sin pérdida de créditos, después de la apertura del acta.';
comment on column fuentes.registros.matricula is 'NRO_MAT_ACTA_FINAL: inscritos en el acta al momento de su cierre.';
comment on column fuentes.registros.porcentaje_aprobacion is 'PORCENTAJE_APROBACION.';
comment on column fuentes.registros.promedio is 'PROMEDIO_CALIFICACIONES: vacío cuando las calificaciones no son numéricas.';
comment on column fuentes.registros.aprobados is 'NRO_APROBADOS_ACTA_FINAL: incluye los aprobados por homologación.';
comment on column fuentes.registros.homologados is 'NRO_HOMOLOGADOS_APROBADOS.';
comment on column fuentes.registros.sin_resultado is 'NRO_SIN_RESULTADO_ACTA_FINAL: estudiantes del acta sin calificación ni resultado.';

create index registros_uab on fuentes.registros (uab_id);
create index registros_asignatura on fuentes.registros (asignatura_id);
create index registros_carga on fuentes.registros (carga_id);

create trigger registros_cambio after insert or update or delete or truncate on fuentes.registros
for each statement execute function gobierno.registrar_cambio();
