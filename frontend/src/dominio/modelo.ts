import { TIPOS_PERIODO, type Nivel } from './definiciones';
import { COMPARADOR_ESPANOL, nombrePropio, nombreUnidad, normalizarBusqueda } from './formato';

const COLUMNAS_ENTERAS = ['periodo', 'uab', 'asignatura', 'cupos', 'inscritos', 'cancelaciones', 'matricula', 'sinResultado', 'aprobados'] as const;
const COLUMNAS_REGISTROS = [...COLUMNAS_ENTERAS, 'promedio'] as const;
const ORDEN_TIPOS = Object.keys(TIPOS_PERIODO);

type ColumnaEntera = typeof COLUMNAS_ENTERAS[number];

export interface Meta {
  version?: number;
  actualizado?: string;
  fechaCorte: string;
  fechaCorteMinima?: string | null;
  fuente: string;
  filas: number;
  excluidos: number;
  umbralEnCurso?: number;
  periodos: string[];
  periodosEnCurso: string[];
  sedes: [string, string][];
  facultades: [string, string, number][];
  uabs: [string, string, number][];
  asignaturas: [string, string, number][];
}

export type RegistrosCrudos = Record<ColumnaEntera, number[]> & { promedio: (number | null)[] };

export interface DatosTablero {
  meta: Meta;
  registros: RegistrosCrudos;
}

export type Columnas = Record<ColumnaEntera, Int32Array> & {
  facultad: Int32Array;
  sede: Int32Array;
  conNota: Int32Array;
  notasEnCentesimas: Int32Array;
};

export interface TipoPeriodo {
  clave: string;
  etiqueta: string;
  periodos: number[];
}

export interface Modelo {
  cantidadRegistros: number;
  registros: Columnas;
  periodos: string[];
  periodoEnCurso: Uint8Array;
  tiposPeriodo: TipoPeriodo[];
  tipoPorDefecto: string;
  facultadDeUab: Int32Array;
  sedeDeFacultad: Int32Array;
  sedeDeUab: Int32Array;
  sedeDeAsignatura: Int32Array;
  nombres: Record<Nivel, string[]>;
  nombresCortos: Record<Nivel, string[]>;
  ordenAlfabetico: Record<Nivel, number[]>;
  codigos: Record<Nivel, string[]>;
  busquedaAsignatura: string[];
  version: number | undefined;
  actualizado: string | undefined;
  fuente: string;
  fechaCorte: string;
  fechaCorteMinima: string;
  excluidos: number;
}

export function columnasInconsistentes(meta: { filas?: number } | null | undefined, registros: Record<string, unknown> | null | undefined): string[] {
  return COLUMNAS_REGISTROS.filter(columna => {
    const valores = registros?.[columna];
    return !Array.isArray(valores) || valores.length !== meta?.filas;
  });
}

function posicionesRepetidas(etiquetas: string[]): number[] {
  const conteo = new Map<string, number>();
  etiquetas.forEach(etiqueta => conteo.set(etiqueta, (conteo.get(etiqueta) ?? 0) + 1));
  return etiquetas.flatMap((etiqueta, posicion) => ((conteo.get(etiqueta) as number) > 1 ? [posicion] : []));
}

export type Ampliacion = (etiqueta: string, posicion: number) => string;

export function desambiguarNombres(nombres: string[], ampliaciones: Ampliacion[]): string[] {
  const etiquetas = nombres.slice();
  for (const ampliar of ampliaciones) {
    const repetidas = posicionesRepetidas(etiquetas);
    if (!repetidas.length) break;
    repetidas.forEach(posicion => { etiquetas[posicion] = ampliar(etiquetas[posicion], posicion); });
  }
  return etiquetas;
}

function ordenarPorNombre(nombres: string[]): number[] {
  return nombres.map((_, indice) => indice).sort((primero, segundo) => COMPARADOR_ESPANOL.compare(nombres[primero], nombres[segundo]));
}

function posicionDeTipo(clave: string): number {
  const posicion = ORDEN_TIPOS.indexOf(clave);
  return posicion < 0 ? ORDEN_TIPOS.length : posicion;
}

function agruparPorTipo(codigosPeriodo: string[], enCurso: Set<string>): TipoPeriodo[] {
  const periodosPorTipo = new Map<string, number[]>();
  codigosPeriodo.forEach((codigo, indice) => {
    if (enCurso.has(codigo)) return;
    const clave = codigo.slice(-1);
    if (!periodosPorTipo.has(clave)) periodosPorTipo.set(clave, []);
    (periodosPorTipo.get(clave) as number[]).push(indice);
  });
  return [...periodosPorTipo.entries()]
    .sort(([claveA], [claveB]) => posicionDeTipo(claveA) - posicionDeTipo(claveB) || claveA.localeCompare(claveB))
    .map(([clave, periodos]) => ({ clave, etiqueta: TIPOS_PERIODO[clave] ?? `Tipo ${clave}`, periodos }));
}

function derivarColumnas(registros: RegistrosCrudos, cantidad: number, facultadDeUab: Int32Array, sedeDeFacultad: Int32Array): Columnas {
  const columnas = Object.fromEntries(COLUMNAS_ENTERAS.map(columna => [columna, Int32Array.from(registros[columna])])) as Record<ColumnaEntera, Int32Array>;
  const facultad = new Int32Array(cantidad);
  const sede = new Int32Array(cantidad);
  const conNota = new Int32Array(cantidad);
  const notasEnCentesimas = new Int32Array(cantidad);
  for (let indice = 0; indice < cantidad; indice++) {
    facultad[indice] = facultadDeUab[columnas.uab[indice]];
    sede[indice] = sedeDeFacultad[facultad[indice]];
    const promedio = registros.promedio[indice];
    if (promedio != null) {
      conNota[indice] = columnas.matricula[indice] - columnas.sinResultado[indice];
      notasEnCentesimas[indice] = Math.round(promedio * 100 * conNota[indice]);
    }
  }
  return { ...columnas, facultad, sede, conNota, notasEnCentesimas };
}

function construirNombres(meta: Meta, facultadDeUab: Int32Array, sedeDeFacultad: Int32Array) {
  const sede = meta.sedes.map(([, nombre]) => nombre);
  const facultadCorta = meta.facultades.map(([, nombre]) => nombreUnidad(nombre));
  const uabCorta = meta.uabs.map(([, nombre]) => nombreUnidad(nombre));
  const asignatura = meta.asignaturas.map(([, nombre]) => nombrePropio(nombre));
  const conContexto = (contexto: (posicion: number) => string): Ampliacion => (etiqueta, posicion) => `${etiqueta} · ${contexto(posicion)}`;
  return {
    cortos: { sede, facultad: facultadCorta, uab: uabCorta, asignatura },
    completos: {
      sede,
      facultad: desambiguarNombres(facultadCorta, [conContexto(facultad => sede[sedeDeFacultad[facultad]])]),
      uab: desambiguarNombres(uabCorta, [
        conContexto(uab => facultadCorta[facultadDeUab[uab]]),
        conContexto(uab => sede[sedeDeFacultad[facultadDeUab[uab]]]),
        conContexto(uab => meta.uabs[uab][0])
      ]),
      asignatura
    }
  };
}

export function crearModelo(meta: Meta, registros: RegistrosCrudos): Modelo {
  const cantidadRegistros = meta.filas;
  const facultadDeUab = Int32Array.from(meta.uabs, uab => uab[2]);
  const sedeDeFacultad = Int32Array.from(meta.facultades, facultad => facultad[2]);
  const periodosEnCurso = new Set(meta.periodosEnCurso);
  const tiposPeriodo = agruparPorTipo(meta.periodos, periodosEnCurso);
  const { cortos, completos } = construirNombres(meta, facultadDeUab, sedeDeFacultad);
  return {
    cantidadRegistros,
    registros: derivarColumnas(registros, cantidadRegistros, facultadDeUab, sedeDeFacultad),
    periodos: meta.periodos,
    periodoEnCurso: Uint8Array.from(meta.periodos, codigo => (periodosEnCurso.has(codigo) ? 1 : 0)),
    tiposPeriodo,
    tipoPorDefecto: (tiposPeriodo.some(tipo => tipo.clave === 'S') ? 'S' : tiposPeriodo[0]?.clave) as string,
    facultadDeUab,
    sedeDeFacultad,
    sedeDeUab: facultadDeUab.map(facultad => sedeDeFacultad[facultad]),
    sedeDeAsignatura: Int32Array.from(meta.asignaturas, asignatura => asignatura[2]),
    nombres: completos,
    nombresCortos: cortos,
    ordenAlfabetico: {
      sede: ordenarPorNombre(completos.sede),
      facultad: ordenarPorNombre(completos.facultad),
      uab: ordenarPorNombre(completos.uab),
      asignatura: ordenarPorNombre(completos.asignatura)
    },
    codigos: {
      sede: meta.sedes.map(([codigo]) => codigo),
      facultad: meta.facultades.map(([codigo]) => codigo),
      uab: meta.uabs.map(([codigo]) => codigo),
      asignatura: meta.asignaturas.map(([codigo]) => codigo)
    },
    busquedaAsignatura: meta.asignaturas.map(([codigo, nombre]) => normalizarBusqueda(codigo + ' ' + nombre)),
    version: meta.version,
    actualizado: meta.actualizado,
    fuente: meta.fuente,
    fechaCorte: meta.fechaCorte,
    fechaCorteMinima: meta.fechaCorteMinima ?? meta.fechaCorte,
    excluidos: meta.excluidos
  };
}

export function periodosDeTipo(modelo: Modelo, clave: string): number[] {
  return modelo.tiposPeriodo.find(tipo => tipo.clave === clave)?.periodos ?? [];
}

export function codigosEnCursoDeTipo(modelo: Modelo, clave: string): string[] {
  return periodosDeTipo(modelo, clave).filter(periodo => modelo.periodoEnCurso[periodo]).map(periodo => modelo.periodos[periodo]);
}

export function marcarPeriodos(modelo: Modelo, periodos: number[]): Uint8Array {
  const marcas = new Uint8Array(modelo.periodos.length);
  periodos.forEach(periodo => { marcas[periodo] = 1; });
  return marcas;
}

export function rotuloAsignatura(modelo: Modelo, asignatura: number): string {
  return `${modelo.codigos.asignatura[asignatura]} · ${modelo.nombres.asignatura[asignatura]}`;
}
