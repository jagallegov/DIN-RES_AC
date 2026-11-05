import { conPlural, formatearEntero, listarEnEspanol } from './formato';

export const BASE_MINIMA = 10;

export const TIPOS_PERIODO: Record<string, string> = {
  S: 'Semestral',
  A: 'Anual',
  I: 'Intersemestral'
};

export type Nivel = 'sede' | 'facultad' | 'uab' | 'asignatura';
export type CampoFiltro = 'sedes' | 'facultades' | 'uabs' | 'asignaturas';

export const JERARQUIA: { nivel: Nivel; campo: CampoFiltro; nombre: string }[] = [
  { nivel: 'sede', campo: 'sedes', nombre: 'sede' },
  { nivel: 'facultad', campo: 'facultades', nombre: 'facultad' },
  { nivel: 'uab', campo: 'uabs', nombre: 'unidad académica básica' },
  { nivel: 'asignatura', campo: 'asignaturas', nombre: 'asignatura' }
];

export const NIVELES = Object.fromEntries(JERARQUIA.map(({ nivel, nombre }) => [nivel, nombre])) as Record<Nivel, string>;

export type TipoIndicador = 'producto' | 'resultado';

export const TIPOS_INDICADOR: Record<TipoIndicador, { nombre: string; descripcion: string }> = {
  producto: { nombre: 'Producto', descripcion: 'conteo de asignaturas, cupos, inscripciones o estudiantes en una etapa del periodo.' },
  resultado: { nombre: 'Resultado', descripcion: 'porcentaje o promedio que relaciona dos conteos.' }
};

export type IdIndicador =
  | 'asignaturas' | 'cupos' | 'inscritos' | 'tasaOcupacion' | 'cupoCompleto'
  | 'inscritosCerrados' | 'cancelaciones' | 'matriculaFinal' | 'tasaCancelacion' | 'sinCancelaciones'
  | 'matriculaConResultado' | 'aprobados' | 'reprobados' | 'tasaAprobacion' | 'promedio';

export interface DefinicionIndicador {
  nombre: string;
  tipo: TipoIndicador;
  descripcion: string;
}

export const DEFINICIONES_INDICADORES: Record<IdIndicador, DefinicionIndicador> = {
  asignaturas: {
    nombre: 'Asignaturas ofertadas', tipo: 'producto', descripcion: 'Con cupos e inscripciones'
  },
  cupos: {
    nombre: 'Cupos ofertados', tipo: 'producto', descripcion: 'Cupos ofertados en la actividad principal'
  },
  inscritos: {
    nombre: 'Inscripciones', tipo: 'producto', descripcion: 'Máximo de inscritos durante el semestre'
  },
  tasaOcupacion: {
    nombre: 'Tasa de ocupación', tipo: 'resultado', descripcion: 'Inscripciones sobre cupos'
  },
  cupoCompleto: {
    nombre: 'Asignaturas con cupo completo', tipo: 'resultado', descripcion: 'Inscripciones iguales o mayores a los cupos'
  },
  inscritosCerrados: {
    nombre: 'Inscripciones en periodos cerrados', tipo: 'producto', descripcion: 'Periodos con actas cerradas'
  },
  cancelaciones: {
    nombre: 'Cancelaciones', tipo: 'producto', descripcion: 'Después de la apertura del acta'
  },
  matriculaFinal: {
    nombre: 'Matrícula final', tipo: 'producto', descripcion: 'Estudiantes en el acta al cierre'
  },
  tasaCancelacion: {
    nombre: 'Tasa de cancelación', tipo: 'resultado', descripcion: 'Cancelaciones sobre inscripciones'
  },
  sinCancelaciones: {
    nombre: 'Asignaturas sin cancelaciones', tipo: 'resultado', descripcion: 'Con inscripciones y sin cancelaciones'
  },
  matriculaConResultado: {
    nombre: 'Matrícula con resultado', tipo: 'producto', descripcion: 'Con nota o resultado en el acta'
  },
  aprobados: {
    nombre: 'Aprobados', tipo: 'producto', descripcion: 'Incluye homologaciones'
  },
  reprobados: {
    nombre: 'Reprobados', tipo: 'producto', descripcion: 'Con resultado y sin aprobar'
  },
  tasaAprobacion: {
    nombre: 'Tasa de aprobación', tipo: 'resultado', descripcion: 'Aprobados sobre matrícula con resultado'
  },
  promedio: {
    nombre: 'Promedio de calificaciones', tipo: 'resultado', descripcion: 'Escala de 0,0 a 5,0'
  }
};

export interface Dispersion {
  titulo: string;
  x: IdIndicador;
  y: IdIndicador;
  tamano: IdIndicador;
  base: 'cuposOfertados' | 'inscritosCerrados' | 'conNota';
  criterio: string;
  significadoTamano: string;
  ejeLogaritmico: boolean;
}

export interface Seccion {
  id: string;
  nombre: string;
  descripcion: string;
  nota?: string;
  kpis: IdIndicador[];
  principal: IdIndicador;
  base: IdIndicador;
  dispersion: Dispersion;
  tabla: IdIndicador[];
}

export const SECCIONES: Seccion[] = [
  {
    id: 'oferta',
    nombre: 'Oferta y ocupación de cupos',
    descripcion: 'Asignaturas y cupos ofertados frente a las inscripciones. Incluye todos los periodos seleccionados, también los que están en curso.',
    kpis: ['asignaturas', 'cupos', 'inscritos', 'tasaOcupacion', 'cupoCompleto'],
    principal: 'tasaOcupacion',
    base: 'cupos',
    dispersion: {
      titulo: 'Cupos y ocupación por asignatura',
      x: 'cupos', y: 'tasaOcupacion', tamano: 'inscritos',
      base: 'cuposOfertados', criterio: 'cupos ofertados', significadoTamano: 'las inscripciones', ejeLogaritmico: true
    },
    tabla: ['cupos', 'inscritos', 'tasaOcupacion']
  },
  {
    id: 'cancelaciones',
    nombre: 'Cancelaciones y matrícula final',
    descripcion: 'Inscripciones, cancelaciones y matrícula final en los periodos con actas de calificación cerradas.',
    nota: 'Las inscripciones corresponden al máximo de inscritos en cualquier momento del periodo y las cancelaciones solo cuentan las registradas después de la apertura del acta; por eso las inscripciones menos las cancelaciones no coinciden con la matrícula final.',
    kpis: ['inscritosCerrados', 'cancelaciones', 'matriculaFinal', 'tasaCancelacion', 'sinCancelaciones'],
    principal: 'tasaCancelacion',
    base: 'inscritosCerrados',
    dispersion: {
      titulo: 'Inscripciones y cancelación por asignatura',
      x: 'inscritosCerrados', y: 'tasaCancelacion', tamano: 'cancelaciones',
      base: 'inscritosCerrados', criterio: 'inscripciones en periodos cerrados', significadoTamano: 'las cancelaciones', ejeLogaritmico: true
    },
    tabla: ['inscritosCerrados', 'cancelaciones', 'matriculaFinal', 'tasaCancelacion']
  },
  {
    id: 'aprobacion',
    nombre: 'Aprobación y calificaciones',
    descripcion: 'Resultados registrados al cierre de las actas de calificación: aprobación, reprobación y promedio, en los periodos con actas cerradas.',
    kpis: ['matriculaConResultado', 'aprobados', 'reprobados', 'tasaAprobacion', 'promedio'],
    principal: 'tasaAprobacion',
    base: 'matriculaConResultado',
    dispersion: {
      titulo: 'Aprobación y promedio por asignatura',
      x: 'tasaAprobacion', y: 'promedio', tamano: 'matriculaConResultado',
      base: 'conNota', criterio: 'estudiantes con calificación numérica', significadoTamano: 'la matrícula con resultado', ejeLogaritmico: false
    },
    tabla: ['matriculaConResultado', 'aprobados', 'reprobados', 'tasaAprobacion', 'promedio']
  }
];

const tiposEnGlosario = Object.entries(TIPOS_PERIODO).map(([clave, nombre]) => `${clave} ${nombre.toLowerCase()}`).join(', ');
const asignaturasMostradas = (mostradas: number, total: number) => `Se ${conPlural(mostradas, 'muestra', 'muestran')} ${formatearEntero(mostradas)} de ${formatearEntero(total)} ${conPlural(total, 'asignatura', 'asignaturas')}`;

function resaltadoDispersion(visibles: number): string | null {
  if (!visibles) return null;
  return conPlural(
    visibles,
    'la asignatura seleccionada se resalta en ámbar y se muestra aunque no alcance el mínimo',
    `las ${formatearEntero(visibles)} asignaturas seleccionadas se resaltan en ámbar y se muestran aunque no alcancen el mínimo`
  );
}

function ausentesDispersion(ausentes: number): string | null {
  if (!ausentes) return null;
  return `${formatearEntero(ausentes)} ${conPlural(
    ausentes,
    'asignatura seleccionada no aparece porque no tiene datos para ubicarla',
    'asignaturas seleccionadas no aparecen porque no tienen datos para ubicarlas'
  )} en el gráfico`;
}

export interface ConteoDispersion {
  mostradas: number;
  total: number;
  visibles: number;
  ausentes: number;
}

export const TEXTOS = {
  conteosSuman: 'Los conteos suman todos los periodos seleccionados.',
  glosarioPeriodos: `Los periodos se identifican como año, semestre y tipo: ${tiposEnGlosario}.`,
  sinRegistros: 'No hay registros para la selección.',
  soloEnCurso: 'Los periodos seleccionados están en curso y todavía no tienen actas de calificación cerradas.',
  soloRegistrosEnCurso: 'Los registros de la selección corresponden a periodos en curso, que todavía no tienen actas de calificación cerradas.',
  sinPeriodos: 'Sin periodos con datos para la selección.',
  sinDatos: 'Sin datos para la selección.',
  sinCoincidencias: 'Sin coincidencias.',
  tablaSinCoincidencias: 'Ninguna asignatura coincide con la búsqueda.',
  barrasClaras: `Las barras claras tienen una base menor que ${BASE_MINIMA}.`,
  escalaMapa: {
    quintiles: 'Tonos por quintiles de los valores mostrados.',
    lineal: 'Tonos en cinco tramos iguales entre el mínimo y el máximo, porque hay menos de cinco valores distintos.',
    unico: 'Todas las celdas mostradas tienen el mismo valor.'
  },
  errorDatos: 'No fue posible cargar los datos del tablero.',
  ayudaServicio: 'El tablero toma los datos del servicio del proyecto, que consulta la base de datos. Desde la carpeta backend el servicio se inicia con python -m tablero.api y el tablero queda en la dirección localhost:8000.',
  errorBase: 'No fue posible consultar la base de datos.',
  ayudaBase: 'El servicio está activo pero la base de datos no responde. Conviene revisar que PostgreSQL esté encendido y que la conexión TABLERO_BASE_DATOS_LECTURA sea correcta; el tablero se carga solo cuando la base vuelva a responder.',
  sinCarga: 'La base de datos todavía no tiene registros.',
  ayudaSinCarga: 'Los registros se cargan con el ETL del proyecto (python -m tablero.etl desde la carpeta backend). El tablero se actualiza solo cuando termina la carga.',
  errorConsistencia: 'Los datos del tablero están incompletos o son inconsistentes.',
  ayudaConsistencia: 'Cada columna de registros debe tener tantas posiciones como indica meta.filas. Conviene revisar la última carga de la base de datos.',
  columnasInconsistentes: (filas: number, columnas: string[]) => `Columnas con una longitud distinta de ${formatearEntero(filas)}: ${columnas.join(', ')}.`,
  errorInicio: 'No fue posible iniciar el tablero.',
  ayudaInicio: 'El detalle técnico indica la causa. Si se relaciona con los datos, conviene revisar la última carga del ETL.',
  errorVista: 'No fue posible mostrar el tablero.',
  ayudaVista: 'Ocurrió un error al dibujar la vista. Al recargar la página sin el estado guardado en la dirección (la parte que sigue a #) se restablecen los filtros.',
  procedencia: (fuente: string, fechaCorte: string, actualizado: string) => `Fuente: ${fuente} · Fecha de corte: ${fechaCorte} · Actualizado: ${actualizado}`,
  fuente: (fuente: string) => `Fuente: ${fuente}`,
  rangoFechas: (desde: string, hasta: string) => `${desde} a ${hasta}`,
  conexion: {
    conectado: '',
    reconectando: 'Sin conexión con el servicio de datos; se reintenta automáticamente.',
    sinBase: 'El servicio no tiene conexión con la base de datos; se reintenta automáticamente y el tablero se actualiza cuando vuelva.',
    actualizado: (hora: string) => `Datos actualizados a las ${hora}.`,
    sinActualizar: 'No fue posible traer la versión nueva de los datos; se mantienen los anteriores.'
  },
  excluidos: (cantidad: number) => `Se excluyen ${formatearEntero(cantidad)} registros con cupos e inscripciones en cero.`,
  periodosEnCurso: (codigos: string[]) => {
    const segun = (singular: string, plural: string) => conPlural(codigos.length, singular, plural);
    return `${segun('Periodo en curso', 'Periodos en curso')}: ${listarEnEspanol(codigos)}. ${segun('Se incluye', 'Se incluyen')} en la sección de oferta y ${segun('se excluye', 'se excluyen')} de las de cancelaciones y aprobación porque sus actas de calificación no están cerradas.`;
  },
  omitidasEnCurso: (cantidad: number) => `${conPlural(cantidad, 'Se omite', 'Se omiten')} ${formatearEntero(cantidad)} ${conPlural(cantidad, 'asignatura que solo tiene', 'asignaturas que solo tienen')} registros en periodos en curso.`,
  coincidencias: (cantidad: number, limite: number): string => {
    if (!cantidad) return TEXTOS.sinCoincidencias;
    if (cantidad > limite) return `Se muestran ${formatearEntero(limite)} de ${formatearEntero(cantidad)} coincidencias; la búsqueda se puede precisar.`;
    return `${formatearEntero(cantidad)} ${conPlural(cantidad, 'coincidencia', 'coincidencias')}.`;
  },
  filasMostradas: (mostradas: number, total: number) => `${asignaturasMostradas(mostradas, total)}.`,
  categoriasVisibles: (primera: number, ultima: number, total: number) => `Se muestran las categorías ${formatearEntero(primera)} a ${formatearEntero(ultima)} de ${formatearEntero(total)}.`,
  notaDispersion: (_dispersion: Dispersion, { mostradas, total, visibles, ausentes }: ConteoDispersion) => {
    const partes = [asignaturasMostradas(mostradas, total), resaltadoDispersion(visibles), ausentesDispersion(ausentes)].filter(Boolean);
    return `${partes.join('; ')}.`;
  },
  dispersionVacia: `Ninguna asignatura alcanza el mínimo de ${BASE_MINIMA} en la selección.`
};
