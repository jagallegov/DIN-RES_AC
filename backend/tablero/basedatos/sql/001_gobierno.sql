create schema if not exists gobierno;
comment on schema gobierno is 'Gobierno y catálogo: parámetros, versión de los datos, trazabilidad de las cargas y catálogos de reportes, sedes, facultades, unidades académicas básicas, asignaturas y periodos.';

create table gobierno.parametros (
  id boolean primary key default true check (id),
  umbral_en_curso numeric not null default 0.5 check (umbral_en_curso > 0 and umbral_en_curso < 1)
);
comment on table gobierno.parametros is 'Parámetros de cálculo. Tiene una sola fila.';
comment on column gobierno.parametros.umbral_en_curso is 'Proporción de la matrícula final sin resultado en el acta por encima de la cual un periodo se considera en curso.';
insert into gobierno.parametros default values;

create table gobierno.estado (
  id boolean primary key default true check (id),
  version bigint not null default 0,
  actualizado timestamptz not null default now()
);
comment on table gobierno.estado is 'Versión de los datos. Sube con cada cambio en los esquemas gobierno y fuentes; el tablero la consulta para saber cuándo recargar.';
insert into gobierno.estado default values;

create table gobierno.reportes (
  codigo text primary key,
  nombre text not null,
  entidad text not null
);
comment on table gobierno.reportes is 'Catálogo de los reportes de origen y de la entidad que los emite.';
insert into gobierno.reportes (codigo, nombre, entidad) values (
  'RE_ASI_CUP_INS_CAN',
  'Conteo por asignatura en los periodos seleccionados de cupos ofertados, inscripciones y cancelaciones',
  'Dirección Nacional de Información Académica, Registro y Matrícula (DINARA)'
);

create table gobierno.cargas (
  id integer generated always as identity primary key,
  reporte text not null references gobierno.reportes,
  fecha_corte date not null,
  filas integer not null check (filas >= 0),
  responsable text not null,
  cargada_en timestamptz not null default now()
);
comment on table gobierno.cargas is 'Cada ejecución del ETL que cargó datos: fecha de corte, filas leídas y responsable.';

create table gobierno.cargas_archivos (
  carga_id integer not null references gobierno.cargas on delete cascade,
  archivo text not null,
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  fecha_emision date,
  filas integer not null check (filas >= 0),
  primary key (carga_id, archivo)
);
comment on table gobierno.cargas_archivos is 'Archivos leídos en cada carga, con su huella SHA-256, la fecha de emisión del reporte y las filas que aportó.';

create table gobierno.sedes (
  id integer generated always as identity primary key,
  codigo text not null unique,
  nombre text not null
);

create table gobierno.facultades (
  id integer generated always as identity primary key,
  sede_id integer not null references gobierno.sedes,
  codigo text not null,
  nombre text not null,
  unique (sede_id, codigo)
);

create table gobierno.uabs (
  id integer generated always as identity primary key,
  facultad_id integer not null references gobierno.facultades,
  codigo text not null,
  nombre text not null,
  unique (facultad_id, codigo)
);
comment on table gobierno.uabs is 'Unidades académicas básicas.';

create table gobierno.asignaturas (
  id integer generated always as identity primary key,
  sede_id integer not null references gobierno.sedes,
  codigo text not null,
  nombre text not null,
  unique (sede_id, codigo)
);

create table gobierno.periodos (
  codigo text primary key check (codigo ~ '^[0-9]{4}-[12][A-Z]$'),
  anio smallint generated always as (substr(codigo, 1, 4)::smallint) stored,
  semestre smallint generated always as (substr(codigo, 6, 1)::smallint) stored,
  tipo text generated always as (substr(codigo, 7, 1)) stored
);
comment on table gobierno.periodos is 'Periodos académicos: año, semestre y tipo (S semestral, A anual, I intersemestral).';

create function gobierno.registrar_cambio() returns trigger
language plpgsql as $$
begin
  update gobierno.estado set version = version + 1, actualizado = now();
  return null;
end;
$$;

do $$
declare
  tabla text;
begin
  foreach tabla in array array['parametros', 'reportes', 'cargas', 'sedes', 'facultades', 'uabs', 'asignaturas', 'periodos'] loop
    execute format(
      'create trigger %I after insert or update or delete or truncate on gobierno.%I '
      'for each statement execute function gobierno.registrar_cambio()',
      tabla || '_cambio', tabla
    );
  end loop;
end;
$$;
