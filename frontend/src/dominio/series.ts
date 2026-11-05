import { BASE_MINIMA, NIVELES, TEXTOS, type Dispersion, type IdIndicador, type Nivel, type Seccion } from './definiciones';
import type { Escala } from './escalas';
import { conPlural, formatearEntero } from './formato';
import {
  INDICADORES, formatearCeldaIndicador, formatearIndicador, indicadoresDeDispersion, tituloConUnidad,
  type Acumulado, type Indicador, type Resultado, type ResultadoPorAsignatura
} from './indicadores';
import { desambiguarNombres, rotuloAsignatura, type Modelo } from './modelo';
import type { Filtros } from './seleccion';

const VALORES_EN_RESUMEN = 5;

type AmpliacionNivel = (modelo: Modelo, etiqueta: string, id: number) => string;

export interface ValorPeriodo {
  valor: number | null;
  base: number | null;
}

export interface Elemento {
  id: number;
  valor: number;
  base: number | null;
  baseInsuficiente: boolean;
  titulo: string;
  contexto: string | null;
  etiqueta: string;
}

export interface Celda {
  valor: number;
  base: number | null;
}

export interface Punto {
  id: number;
  nombre: string;
  rotulo: string;
  sede: string;
  x: number;
  y: number;
  tamano: number;
}

export interface Puntos {
  contexto: Punto[];
  seleccionadas: Punto[];
}

export interface FilaAsignatura {
  id: number;
  codigo: string;
  nombre: string;
  sede: string;
  uab: string;
  [indicador: string]: number | string | null;
}

export interface Mapa {
  celdas: (Celda | null)[][];
  escala: Escala;
}

export interface TablaDatos {
  columnas: string[];
  filas: string[][];
}

const nombreSede = (modelo: Modelo, sede: number) => modelo.nombres.sede[sede];
const facultadCorta = (modelo: Modelo, facultad: number) => modelo.nombresCortos.facultad[facultad];
const conMayuscula = (texto: string) => texto.charAt(0).toUpperCase() + texto.slice(1);

const AMPLIACIONES_NIVEL: Record<Nivel, AmpliacionNivel[]> = {
  sede: [],
  facultad: [(modelo, etiqueta, id) => `${etiqueta} · ${nombreSede(modelo, modelo.sedeDeFacultad[id])}`],
  uab: [
    (modelo, etiqueta, id) => `${etiqueta} · ${facultadCorta(modelo, modelo.facultadDeUab[id])}`,
    (modelo, etiqueta, id) => `${etiqueta} · ${nombreSede(modelo, modelo.sedeDeUab[id])}`
  ],
  asignatura: [(modelo, etiqueta, id) => rotuloAsignatura(modelo, id)]
};

const DESCRIPCIONES_NIVEL: Record<Nivel, (modelo: Modelo, id: number) => { titulo: string; contexto: string | null }> = {
  sede: (modelo, id) => ({ titulo: nombreSede(modelo, id), contexto: null }),
  facultad: (modelo, id) => ({ titulo: facultadCorta(modelo, id), contexto: nombreSede(modelo, modelo.sedeDeFacultad[id]) }),
  uab: (modelo, id) => ({
    titulo: modelo.nombresCortos.uab[id],
    contexto: `${facultadCorta(modelo, modelo.facultadDeUab[id])} · ${nombreSede(modelo, modelo.sedeDeUab[id])}`
  }),
  asignatura: (modelo, id) => ({ titulo: rotuloAsignatura(modelo, id), contexto: nombreSede(modelo, modelo.sedeDeAsignatura[id]) })
};

function etiquetasDeNivel(modelo: Modelo, nivel: Nivel, ids: number[]): string[] {
  return desambiguarNombres(
    ids.map(id => modelo.nombresCortos[nivel][id]),
    AMPLIACIONES_NIVEL[nivel].map(ampliar => (etiqueta: string, posicion: number) => ampliar(modelo, etiqueta, ids[posicion]))
  );
}

export function mensajeSinContenido(modelo: Modelo, seccion: Seccion, filtros: Filtros, resultado: Resultado): string | null {
  if (!filtros.periodos.length || !resultado.total.registros) return TEXTOS.sinRegistros;
  if (!INDICADORES[seccion.principal].excluyeEnCurso || resultado.total.registrosCerrados) return null;
  return filtros.periodos.every(periodo => modelo.periodoEnCurso[periodo]) ? TEXTOS.soloEnCurso : TEXTOS.soloRegistrosEnCurso;
}

export function periodosDelGrafico(modelo: Modelo, resultado: Resultado, indicador: Indicador): number[] {
  return resultado.periodos.filter(periodo => !(indicador.excluyeEnCurso && modelo.periodoEnCurso[periodo]));
}

export function valoresPorPeriodo(resultado: Resultado, periodos: number[], indicador: Indicador, base: Indicador): ValorPeriodo[] {
  return periodos.map(periodo => ({
    valor: indicador.valor(resultado.porPeriodo[periodo]),
    base: base.valor(resultado.porPeriodo[periodo])
  }));
}

export function elementosPorNivel(modelo: Modelo, resultado: Resultado, indicador: Indicador, base: Indicador): Elemento[] {
  const elementos: { id: number; valor: number; base: number | null; baseInsuficiente: boolean }[] = [];
  resultado.porNivel.forEach((acumulado, id) => {
    const valor = indicador.valor(acumulado);
    if (valor == null) return;
    const valorBase = base.valor(acumulado);
    elementos.push({ id, valor, base: valorBase, baseInsuficiente: valorBase != null && valorBase < BASE_MINIMA });
  });
  elementos.sort((primero, segundo) => segundo.valor - primero.valor);
  const etiquetas = etiquetasDeNivel(modelo, resultado.nivel, elementos.map(elemento => elemento.id));
  return elementos.map((elemento, posicion) => ({
    ...elemento,
    ...DESCRIPCIONES_NIVEL[resultado.nivel](modelo, elemento.id),
    etiqueta: etiquetas[posicion]
  }));
}

export function celdasPorNivelYPeriodo(
  modelo: Modelo, resultado: Resultado, elementos: Elemento[], periodos: number[], indicador: Indicador, base: Indicador
): (Celda | null)[][] {
  const cantidadPeriodos = modelo.periodos.length;
  return elementos.map(elemento => periodos.map(periodo => {
    const acumulado = resultado.porNivelPeriodo.get(elemento.id * cantidadPeriodos + periodo);
    const valor = acumulado ? indicador.valor(acumulado) : null;
    return valor == null ? null : { valor, base: base.valor(acumulado as Acumulado) };
  }));
}

export function puntosDispersion(modelo: Modelo, porAsignatura: Map<number, Acumulado>, dispersion: Dispersion, seleccionadas: Set<number>): Puntos {
  const indicadores = indicadoresDeDispersion(dispersion);
  const puntos: Puntos = { contexto: [], seleccionadas: [] };
  porAsignatura.forEach((acumulado, id) => {
    const seleccionada = seleccionadas.has(id);
    if (seleccionadas.size && !seleccionada) return;
    if (acumulado[dispersion.base] < BASE_MINIMA && !seleccionada) return;
    const x = indicadores.x.valor(acumulado);
    const y = indicadores.y.valor(acumulado);
    const tamano = indicadores.tamano.valor(acumulado);
    if (x == null || y == null || tamano == null || (dispersion.ejeLogaritmico && x <= 0)) return;
    (seleccionada ? puntos.seleccionadas : puntos.contexto).push({
      id,
      nombre: modelo.nombres.asignatura[id],
      rotulo: rotuloAsignatura(modelo, id),
      sede: nombreSede(modelo, modelo.sedeDeAsignatura[id]),
      x,
      y,
      tamano
    });
  });
  // Los círculos grandes van al fondo para que los pequeños no queden tapados.
  puntos.contexto.sort((primero, segundo) => segundo.tamano - primero.tamano);
  puntos.seleccionadas.sort((primero, segundo) => segundo.tamano - primero.tamano);
  return puntos;
}

export function filasPorAsignatura(
  modelo: Modelo, asignaturas: ResultadoPorAsignatura, indicadores: IdIndicador[], excluyeEnCurso: boolean
): { filas: FilaAsignatura[]; omitidas: number } {
  const filas: FilaAsignatura[] = [];
  let omitidas = 0;
  asignaturas.porAsignatura.forEach((acumulado, id) => {
    if (excluyeEnCurso && !acumulado.registrosCerrados) {
      omitidas++;
      return;
    }
    const fila: FilaAsignatura = {
      id,
      codigo: modelo.codigos.asignatura[id],
      nombre: modelo.nombres.asignatura[id],
      sede: nombreSede(modelo, modelo.sedeDeAsignatura[id]),
      uab: modelo.nombres.uab[asignaturas.uabMasReciente[id]]
    };
    indicadores.forEach(indicador => { fila[indicador] = INDICADORES[indicador].valor(acumulado); });
    filas.push(fila);
  });
  return { filas, omitidas };
}

export function resumenAccesible(titulo: string, pares: [string, string][]): string {
  if (!pares.length) return `${titulo}.`;
  const primeros = pares.slice(0, VALORES_EN_RESUMEN).map(([etiqueta, valor]) => `${etiqueta} ${valor}`).join(', ');
  const restantes = pares.length - VALORES_EN_RESUMEN;
  return `${titulo}: ${primeros}${restantes > 0 ? ` y ${formatearEntero(restantes)} más` : ''}.`;
}

function resumenDispersion(puntos: Puntos, dispersion: Dispersion): string {
  const mostradas = puntos.contexto.length + puntos.seleccionadas.length;
  const encabezado = `${dispersion.titulo}, ${formatearEntero(mostradas)} ${conPlural(mostradas, 'asignatura', 'asignaturas')}`;
  const par = (punto: Punto): [string, string] => [punto.rotulo, formatearCeldaIndicador(dispersion.y, punto.y)];
  if (puntos.seleccionadas.length) return resumenAccesible(`${encabezado}; seleccionadas`, puntos.seleccionadas.map(par));
  const ordenados = [...puntos.contexto].sort((primero, segundo) => segundo.tamano - primero.tamano);
  return resumenAccesible(`${encabezado} ordenadas por ${INDICADORES[dispersion.tamano].nombre.toLowerCase()}`, ordenados.map(par));
}

export interface Titulos {
  periodo: string;
  nivel: string;
  mapa: string;
}

export function resumenesAccesibles({ titulos, codigos, valores, elementos, puntos, mapa, indicador, dispersion }: {
  titulos: Titulos;
  codigos: string[];
  valores: ValorPeriodo[];
  elementos: Elemento[];
  puntos: Puntos;
  mapa: { celdas: (Celda | null)[][] } | null;
  indicador: Indicador;
  dispersion: Dispersion;
}): Titulos & { dispersion: string } {
  const formatear = (valor: number | null) => formatearCeldaIndicador(indicador.id, valor);
  const primeraFila = mapa ? mapa.celdas[0].flatMap((celda, posicion): [string, string][] => (celda ? [[codigos[posicion], formatear(celda.valor)]] : [])) : [];
  const dimensiones = `${formatearEntero(elementos.length)} categorías y ${formatearEntero(codigos.length)} periodos`;
  const encabezadoMapa = mapa ? `${titulos.mapa}, ${dimensiones}. Primera fila, ${elementos[0].etiqueta}` : titulos.mapa;
  return {
    periodo: resumenAccesible(titulos.periodo, codigos.map((codigo, posicion) => [codigo, formatear(valores[posicion].valor)])),
    nivel: resumenAccesible(titulos.nivel, elementos.map(elemento => [elemento.etiqueta, formatear(elemento.valor)])),
    dispersion: resumenDispersion(puntos, dispersion),
    mapa: resumenAccesible(encabezadoMapa, primeraFila)
  };
}

export function tablasDeDatos({ nivel, codigos, valores, elementos, mapa, indicador, base }: {
  nivel: Nivel;
  codigos: string[];
  valores: ValorPeriodo[];
  elementos: Elemento[];
  mapa: { celdas: (Celda | null)[][] } | null;
  indicador: Indicador;
  base: Indicador;
}): { periodo: TablaDatos; nivel: TablaDatos; mapa: TablaDatos | null } {
  const columnaIndicador = tituloConUnidad(indicador.id);
  const columnaBase = tituloConUnidad(base.id);
  const columnaNivel = conMayuscula(NIVELES[nivel]);
  return {
    periodo: {
      columnas: ['Periodo', columnaIndicador, columnaBase],
      filas: codigos.map((codigo, posicion) => [
        codigo, formatearIndicador(indicador.id, valores[posicion].valor), formatearIndicador(base.id, valores[posicion].base)
      ])
    },
    nivel: {
      columnas: [columnaNivel, columnaIndicador, columnaBase],
      filas: elementos.map(elemento => [
        elemento.etiqueta, formatearIndicador(indicador.id, elemento.valor), formatearIndicador(base.id, elemento.base)
      ])
    },
    mapa: mapa && {
      columnas: [columnaNivel, ...codigos],
      filas: elementos.map((elemento, posicion) => [
        elemento.etiqueta, ...mapa.celdas[posicion].map(celda => formatearIndicador(indicador.id, celda?.valor))
      ])
    }
  };
}
