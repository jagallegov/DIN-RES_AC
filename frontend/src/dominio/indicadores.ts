import { DEFINICIONES_INDICADORES, JERARQUIA, type DefinicionIndicador, type Dispersion, type IdIndicador, type Nivel } from './definiciones';
import { SIN_DATO, formatearCompacto, formatearDecimal, formatearEntero, formatearPorcentaje, ordenarNumeros } from './formato';
import { marcarPeriodos, type Modelo } from './modelo';

export type Formato = 'conteo' | 'tasa' | 'promedio';

const FORMATOS: Record<Formato, { completo: (valor: number) => string; celda: (valor: number) => string; unidad: string | null }> = {
  conteo: { completo: formatearEntero, celda: formatearCompacto, unidad: null },
  tasa: { completo: formatearPorcentaje, celda: formatearPorcentaje, unidad: null },
  promedio: { completo: valor => formatearDecimal(valor, 2), celda: valor => formatearDecimal(valor, 2), unidad: '0,0 a 5,0' }
};

const ORDEN_NIVELES = JERARQUIA.map(({ nivel }) => nivel);

export interface Acumulado {
  registros: number;
  cupos: number;
  inscritos: number;
  cuposOfertados: number;
  inscritosEnCupo: number;
  registrosConCupo: number;
  registrosConCupoCompleto: number;
  registrosCerrados: number;
  inscritosCerrados: number;
  cancelaciones: number;
  matriculaFinal: number;
  registrosConInscritos: number;
  registrosSinCancelacion: number;
  matriculaConResultado: number;
  aprobados: number;
  notasEnCentesimas: number;
  conNota: number;
}

export type Valor = (acumulado: Acumulado) => number | null;

interface Calculo {
  formato: Formato;
  excluyeEnCurso: boolean;
  valor?: Valor;
}

export interface Indicador extends DefinicionIndicador, Calculo {
  id: IdIndicador;
  valor: Valor;
}

const conteo = (campo: keyof Acumulado, base: keyof Acumulado): Valor => acumulado => (acumulado[base] ? acumulado[campo] : null);
const tasa = (numerador: keyof Acumulado, denominador: keyof Acumulado): Valor => acumulado => (
  acumulado[denominador] ? acumulado[numerador] / acumulado[denominador] * 100 : null
);

const CALCULOS: Record<IdIndicador, Calculo> = {
  asignaturas: { formato: 'conteo', excluyeEnCurso: false },
  cupos: { formato: 'conteo', excluyeEnCurso: false, valor: conteo('cupos', 'registros') },
  inscritos: { formato: 'conteo', excluyeEnCurso: false, valor: conteo('inscritos', 'registros') },
  tasaOcupacion: { formato: 'tasa', excluyeEnCurso: false, valor: tasa('inscritosEnCupo', 'cuposOfertados') },
  cupoCompleto: { formato: 'tasa', excluyeEnCurso: false, valor: tasa('registrosConCupoCompleto', 'registrosConCupo') },
  inscritosCerrados: { formato: 'conteo', excluyeEnCurso: true, valor: conteo('inscritosCerrados', 'registrosCerrados') },
  cancelaciones: { formato: 'conteo', excluyeEnCurso: true, valor: conteo('cancelaciones', 'registrosCerrados') },
  matriculaFinal: { formato: 'conteo', excluyeEnCurso: true, valor: conteo('matriculaFinal', 'registrosCerrados') },
  tasaCancelacion: { formato: 'tasa', excluyeEnCurso: true, valor: tasa('cancelaciones', 'inscritosCerrados') },
  sinCancelaciones: { formato: 'tasa', excluyeEnCurso: true, valor: tasa('registrosSinCancelacion', 'registrosConInscritos') },
  matriculaConResultado: { formato: 'conteo', excluyeEnCurso: true, valor: conteo('matriculaConResultado', 'registrosCerrados') },
  aprobados: { formato: 'conteo', excluyeEnCurso: true, valor: conteo('aprobados', 'registrosCerrados') },
  reprobados: {
    formato: 'conteo', excluyeEnCurso: true,
    valor: acumulado => (acumulado.registrosCerrados ? acumulado.matriculaConResultado - acumulado.aprobados : null)
  },
  tasaAprobacion: { formato: 'tasa', excluyeEnCurso: true, valor: tasa('aprobados', 'matriculaConResultado') },
  promedio: {
    formato: 'promedio', excluyeEnCurso: true,
    valor: acumulado => (acumulado.conNota ? acumulado.notasEnCentesimas / acumulado.conNota / 100 : null)
  }
};

export const INDICADORES = Object.fromEntries(Object.entries(CALCULOS).map(([id, calculo]) => [
  id, { id, ...DEFINICIONES_INDICADORES[id as IdIndicador], ...calculo }
])) as Record<IdIndicador, Indicador>;

export function indicadoresDeDispersion(dispersion: Dispersion): { x: Indicador; y: Indicador; tamano: Indicador } {
  return { x: INDICADORES[dispersion.x], y: INDICADORES[dispersion.y], tamano: INDICADORES[dispersion.tamano] };
}

export function formatearIndicador(id: IdIndicador, valor: number | null | undefined): string {
  return valor == null ? SIN_DATO : FORMATOS[INDICADORES[id].formato].completo(valor);
}

export function formatearCeldaIndicador(id: IdIndicador, valor: number | null | undefined): string {
  return valor == null ? SIN_DATO : FORMATOS[INDICADORES[id].formato].celda(valor);
}

export function tituloConUnidad(id: IdIndicador): string {
  const { unidad } = FORMATOS[INDICADORES[id].formato];
  return unidad ? `${INDICADORES[id].nombre} (${unidad})` : INDICADORES[id].nombre;
}

function crearAcumulado(): Acumulado {
  return {
    registros: 0,
    cupos: 0,
    inscritos: 0,
    cuposOfertados: 0,
    inscritosEnCupo: 0,
    registrosConCupo: 0,
    registrosConCupoCompleto: 0,
    registrosCerrados: 0,
    inscritosCerrados: 0,
    cancelaciones: 0,
    matriculaFinal: 0,
    registrosConInscritos: 0,
    registrosSinCancelacion: 0,
    matriculaConResultado: 0,
    aprobados: 0,
    notasEnCentesimas: 0,
    conNota: 0
  };
}

function acumular(acumulado: Acumulado, modelo: Modelo, indice: number): void {
  const columnas = modelo.registros;
  const cupos = columnas.cupos[indice];
  const inscritos = columnas.inscritos[indice];
  acumulado.registros++;
  acumulado.cupos += cupos;
  acumulado.inscritos += inscritos;
  if (cupos > 0) {
    acumulado.cuposOfertados += cupos;
    acumulado.inscritosEnCupo += Math.min(inscritos, cupos);
    acumulado.registrosConCupo++;
    if (inscritos >= cupos) acumulado.registrosConCupoCompleto++;
  }
  if (modelo.periodoEnCurso[columnas.periodo[indice]]) return;
  const cancelaciones = columnas.cancelaciones[indice];
  const matriculaConResultado = columnas.matricula[indice] - columnas.sinResultado[indice];
  acumulado.registrosCerrados++;
  acumulado.inscritosCerrados += inscritos;
  acumulado.cancelaciones += cancelaciones;
  acumulado.matriculaFinal += columnas.matricula[indice];
  if (inscritos > 0) {
    acumulado.registrosConInscritos++;
    if (cancelaciones === 0) acumulado.registrosSinCancelacion++;
  }
  if (matriculaConResultado > 0) {
    acumulado.matriculaConResultado += matriculaConResultado;
    acumulado.aprobados += columnas.aprobados[indice];
  }
  acumulado.notasEnCentesimas += columnas.notasEnCentesimas[indice];
  acumulado.conNota += columnas.conNota[indice];
}

function acumularEnGrupo(grupos: Map<number, Acumulado>, clave: number, modelo: Modelo, indice: number): void {
  let acumulado = grupos.get(clave);
  if (!acumulado) {
    acumulado = crearAcumulado();
    grupos.set(clave, acumulado);
  }
  acumular(acumulado, modelo, indice);
}

export interface FiltrosJerarquia {
  sedes: number[];
  facultades: number[];
  uabs: number[];
  asignaturas: number[];
}

export interface FiltrosCalculo extends FiltrosJerarquia {
  periodos: number[];
}

export function nivelDe(filtros: FiltrosJerarquia): Nivel {
  if (filtros.asignaturas.length) return 'asignatura';
  if (filtros.uabs.length) return filtros.uabs.length === 1 ? 'asignatura' : 'uab';
  if (filtros.facultades.length) return filtros.facultades.length === 1 ? 'uab' : 'facultad';
  if (filtros.sedes.length) return filtros.sedes.length === 1 ? 'facultad' : 'sede';
  return 'sede';
}

function filtrarRegistros(modelo: Modelo, filtros: FiltrosCalculo): number[] {
  const columnas = modelo.registros;
  const periodoElegido = marcarPeriodos(modelo, filtros.periodos);
  const restricciones = JERARQUIA
    .map(({ nivel, campo }): [Int32Array, Set<number>] => [columnas[nivel], new Set(filtros[campo])])
    .filter(([, admitidos]) => admitidos.size);
  const elegidos: number[] = [];
  for (let indice = 0; indice < modelo.cantidadRegistros; indice++) {
    if (periodoElegido[columnas.periodo[indice]] === 1
      && restricciones.every(([columna, admitidos]) => admitidos.has(columna[indice]))) elegidos.push(indice);
  }
  return elegidos;
}

function categoriasConDato(modelo: Modelo, nivel: Nivel, indices: number[], indicador: Indicador): number {
  const columna = modelo.registros[nivel];
  const grupos = new Map<number, Acumulado>();
  indices.forEach(indice => acumularEnGrupo(grupos, columna[indice], modelo, indice));
  return [...grupos.values()].filter(acumulado => indicador.valor(acumulado) != null).length;
}

function nivelConDetalle(modelo: Modelo, nivel: Nivel, indices: number[], indicador: Indicador): Nivel {
  let posicion = ORDEN_NIVELES.indexOf(nivel);
  while (posicion < ORDEN_NIVELES.length - 1 && categoriasConDato(modelo, ORDEN_NIVELES[posicion], indices, indicador) === 1) posicion++;
  return ORDEN_NIVELES[posicion];
}

export interface Resultado {
  nivel: Nivel;
  periodos: number[];
  total: Acumulado;
  porPeriodo: Acumulado[];
  porNivel: Map<number, Acumulado>;
  porNivelPeriodo: Map<number, Acumulado>;
  asignaturasDistintas: number;
  asignaturasPorPeriodo: Int32Array;
}

export function calcular(modelo: Modelo, filtros: FiltrosCalculo, indicadorPrincipal: Indicador): Resultado {
  const indices = filtrarRegistros(modelo, filtros);
  const nivel = nivelConDetalle(modelo, nivelDe(filtros), indices, indicadorPrincipal);
  const columnas = modelo.registros;
  const cantidadPeriodos = modelo.periodos.length;
  const asignaturaVista = new Uint8Array(modelo.nombres.asignatura.length);
  const resultado: Resultado = {
    nivel,
    periodos: ordenarNumeros(new Set(filtros.periodos)),
    total: crearAcumulado(),
    porPeriodo: modelo.periodos.map(() => crearAcumulado()),
    porNivel: new Map(),
    porNivelPeriodo: new Map(),
    asignaturasDistintas: 0,
    asignaturasPorPeriodo: new Int32Array(cantidadPeriodos)
  };
  const cantidadAsignaturas = modelo.nombres.asignatura.length;
  const asignaturaVistaPeriodo = new Uint8Array(cantidadPeriodos * cantidadAsignaturas);
  for (const indice of indices) {
    const periodo = columnas.periodo[indice];
    const asignatura = columnas.asignatura[indice];
    const clave = columnas[nivel][indice];
    acumular(resultado.total, modelo, indice);
    acumular(resultado.porPeriodo[periodo], modelo, indice);
    acumularEnGrupo(resultado.porNivel, clave, modelo, indice);
    acumularEnGrupo(resultado.porNivelPeriodo, clave * cantidadPeriodos + periodo, modelo, indice);
    if (!asignaturaVistaPeriodo[periodo * cantidadAsignaturas + asignatura]) {
      asignaturaVistaPeriodo[periodo * cantidadAsignaturas + asignatura] = 1;
      resultado.asignaturasPorPeriodo[periodo]++;
    }
    if (!asignaturaVista[asignatura]) {
      asignaturaVista[asignatura] = 1;
      resultado.asignaturasDistintas++;
    }
  }
  return resultado;
}

export interface ResultadoPorAsignatura {
  porAsignatura: Map<number, Acumulado>;
  uabMasReciente: Int32Array;
}

export function calcularPorAsignatura(modelo: Modelo, filtros: FiltrosCalculo | (Omit<FiltrosCalculo, 'asignaturas'> & { asignaturas?: number[] })): ResultadoPorAsignatura {
  const columnas = modelo.registros;
  const cantidadAsignaturas = modelo.nombres.asignatura.length;
  const periodoMasReciente = new Int32Array(cantidadAsignaturas).fill(-1);
  const resultado: ResultadoPorAsignatura = { porAsignatura: new Map(), uabMasReciente: new Int32Array(cantidadAsignaturas).fill(-1) };
  for (const indice of filtrarRegistros(modelo, { ...filtros, asignaturas: [] })) {
    const periodo = columnas.periodo[indice];
    const asignatura = columnas.asignatura[indice];
    acumularEnGrupo(resultado.porAsignatura, asignatura, modelo, indice);
    if (periodo >= periodoMasReciente[asignatura]) {
      periodoMasReciente[asignatura] = periodo;
      resultado.uabMasReciente[asignatura] = columnas.uab[indice];
    }
  }
  return resultado;
}

export interface ValorUltimoPeriodo {
  periodo: string;
  valor: number | null;
}

export function valorUltimoPeriodo(modelo: Modelo, resultado: Resultado, id: IdIndicador): ValorUltimoPeriodo | null {
  const indicador = INDICADORES[id];
  const periodos = resultado.periodos.filter(periodo => !(indicador.excluyeEnCurso && modelo.periodoEnCurso[periodo]));
  const ultimo = periodos[periodos.length - 1];
  if (ultimo == null) return null;
  const valor = id === 'asignaturas' ? resultado.asignaturasPorPeriodo[ultimo] || null : indicador.valor(resultado.porPeriodo[ultimo]);
  return { periodo: modelo.periodos[ultimo], valor };
}

export function valorTotal(resultado: Resultado, id: IdIndicador): number | null {
  return id === 'asignaturas' ? resultado.asignaturasDistintas || null : INDICADORES[id].valor(resultado.total);
}
