import type { Dispersion } from './definiciones';
import type { Escala } from './escalas';
import { ESPACIO_FIJO, escaparHtml, formatearCompacto, formatearDecimal } from './formato';
import { formatearCeldaIndicador, formatearIndicador, indicadoresDeDispersion, type Indicador } from './indicadores';
import type { Celda, Elemento, Puntos, ValorPeriodo } from './series';

export type OpcionGrafico = Record<string, any>;

interface Extremos {
  min: number;
  max: number;
}

interface EventoGrafico {
  dataIndex: number;
  seriesIndex?: number;
  value?: any;
}

// Saturación de los colores de los gráficos respecto a los tonos 80 del kit de diseño UNAL (1 = igual al kit).
const SATURACION = 1;

function conSaturacion(color: string, factor: number): string {
  const [rojo, verde, azul] = [1, 3, 5].map(inicio => parseInt(color.slice(inicio, inicio + 2), 16) / 255);
  const maximo = Math.max(rojo, verde, azul);
  const minimo = Math.min(rojo, verde, azul);
  const luz = (maximo + minimo) / 2;
  const delta = maximo - minimo;
  if (!delta) return color;
  const saturacion = Math.min(1, (delta / (1 - Math.abs(2 * luz - 1))) * factor);
  let tono = 0;
  if (maximo === rojo) tono = ((verde - azul) / delta + 6) % 6;
  else if (maximo === verde) tono = (azul - rojo) / delta + 2;
  else tono = (rojo - verde) / delta + 4;
  const grados = tono * 60;
  const amplitud = saturacion * Math.min(luz, 1 - luz);
  const canal = (n: number) => {
    const k = (n + grados / 30) % 12;
    return Math.round((luz - amplitud * Math.max(-1, Math.min(k - 3, 9 - k, 1))) * 255);
  };
  return '#' + [0, 8, 4].map(n => canal(n).toString(16).padStart(2, '0')).join('');
}

// Cada gráfico lleva un solo color, siempre sólido (danger, warning, tertiary-purple e info del kit).
export const COLORES_GRAFICOS = {
  periodo: conSaturacion('#ff796f', SATURACION),
  nivel: conSaturacion('#ffd76a', SATURACION),
  dispersion: conSaturacion('#7b68ff', SATURACION)
};

export const PALETA = {
  primario: '#a2a3a4',
  tinta: '#242627',
  tintaSecundaria: '#4e5254',
  linea: '#dcdcdc',
  borde: '#8a8d8f',
  panel: '#f4f4f4',
  fondo: '#ffffff'
};

// Escala del mapa de calor: tonos sólidos del azul info del kit, del más claro al más oscuro.
export const TONOS_MAPA = ['#e3f9ff', '#90e6ff', '#4fc5e9', '#0082a9', '#00566f'].map(color => conSaturacion(color, SATURACION));

const CATEGORIAS_VISIBLES = 14;
const TAMANO_TEXTO = 12;
const PRIMER_TONO_OSCURO = 3;
const MAXIMO_PUNTOS_ROTULADOS = 15;
const ANCHO_DESPLAZADOR = 12;
const TRANSICION_TOOLTIP = 0.4;
const ANCHO_ETIQUETAS = { estrecho: 120, amplio: 220 };
const ANCHO_GRAFICO_ESTRECHO = 520;
const MARGEN_ETIQUETAS = 10;
const MARGEN_IZQUIERDO = 16;
const ANCHO_COLUMNA_ROTULADA = 56;
const ANCHO_CARACTER = 7.5;

const ESTILO_TEXTO = { fontSize: TAMANO_TEXTO, color: PALETA.tintaSecundaria };
const TOOLTIP = {
  confine: true,
  transitionDuration: TRANSICION_TOOLTIP,
  backgroundColor: PALETA.fondo,
  borderColor: PALETA.linea,
  borderWidth: 1,
  padding: [8, 12],
  textStyle: { fontSize: TAMANO_TEXTO, color: PALETA.tinta, lineHeight: 18 },
  extraCssText: 'box-shadow:none;border-radius:6px;'
};
const EJE_CATEGORIAS = { type: 'category', axisTick: { show: false }, axisLine: { show: false }, splitLine: { show: false } };
const LINEA_EJE = { show: true, lineStyle: { color: PALETA.linea } };
const EJE_SOBRIO = { axisLine: LINEA_EJE, axisTick: { show: false }, splitLine: { show: false } };
const ROTULO = { show: true, fontSize: TAMANO_TEXTO, color: PALETA.tinta };
const resaltado = (color: string) => ({ itemStyle: { color } });
const BLOQUE_TOOLTIP = 'margin-bottom:4px;max-width:340px;white-space:normal';

function opcionBase(opcion: OpcionGrafico): OpcionGrafico {
  return {
    textStyle: ESTILO_TEXTO,
    animationDuration: 600,
    animationDurationUpdate: 400,
    animationEasing: 'cubicOut',
    ...opcion,
    tooltip: { ...TOOLTIP, ...opcion.tooltip }
  };
}

const encabezadoTooltip = (texto: string) => `<div style="font-weight:600;${BLOQUE_TOOLTIP}">${escaparHtml(texto)}</div>`;
const lineaTooltip = (texto: string) => `<div style="color:${PALETA.tintaSecundaria};${BLOQUE_TOOLTIP}">${escaparHtml(texto)}</div>`;
const filaTooltip = (etiqueta: string, valor: string) => [
  '<div style="display:flex;justify-content:space-between;gap:24px">',
  `<span style="color:${PALETA.tintaSecundaria}">${escaparHtml(etiqueta)}</span><b>${escaparHtml(valor)}</b>`,
  '</div>'
].join('');
const filaIndicador = (indicador: Indicador, valor: number | null | undefined) => filaTooltip(indicador.nombre, formatearIndicador(indicador.id, valor));
const tooltipElemento = (elemento: Elemento) => encabezadoTooltip(elemento.titulo) + (elemento.contexto ? lineaTooltip(elemento.contexto) : '');
const etiquetasCategoria = (ancho: number) => ({ ...ESTILO_TEXTO, width: ancho, overflow: 'truncate', ellipsis: '…', margin: MARGEN_ETIQUETAS });
const ejeCategoriasVertical = (elementos: Elemento[]) => ({
  ...EJE_CATEGORIAS,
  inverse: true,
  data: elementos.map(elemento => elemento.etiqueta),
  axisLabel: etiquetasCategoria(ANCHO_ETIQUETAS.amplio)
});
const esTasa = (indicador: Indicador) => indicador.formato === 'tasa';
const marcaEje = (indicador: Indicador) => (valor: number) => (esTasa(indicador) ? `${valor}${ESPACIO_FIJO}%` : formatearDecimal(valor, 1));
const maximoPresente = (valores: (number | null)[]) => Math.max(0, ...valores.filter((valor): valor is number => valor != null));
const minimoDecena = (extremos: Extremos) => Math.max(0, Math.floor(extremos.min / 10) * 10);

function desplazamientoVertical(cantidad: number): OpcionGrafico[] {
  if (cantidad <= CATEGORIAS_VISIBLES) return [];
  const ventana = { yAxisIndex: 0, startValue: 0, endValue: CATEGORIAS_VISIBLES - 1, filterMode: 'filter' };
  return [
    {
      type: 'slider',
      ...ventana,
      zoomLock: true,
      right: 4,
      top: 8,
      bottom: 8,
      width: ANCHO_DESPLAZADOR,
      showDetail: false,
      showDataShadow: false,
      brushSelect: false,
      moveHandleSize: 0,
      handleSize: 0,
      borderColor: PALETA.borde,
      backgroundColor: PALETA.panel,
      fillerColor: PALETA.primario
    },
    { type: 'inside', ...ventana, zoomOnMouseWheel: false, moveOnMouseWheel: true, moveOnMouseMove: false }
  ];
}

const margenDerecho = (cantidad: number, base: number) => base + (cantidad > CATEGORIAS_VISIBLES ? ANCHO_DESPLAZADOR + 12 : 0);

interface Tramo {
  hasta: number;
  option: OpcionGrafico;
}

function segunAncho(baseOption: OpcionGrafico, tramos: Tramo[]): OpcionGrafico {
  let desde = 0;
  const media: OpcionGrafico[] = [];
  tramos.forEach(({ hasta, option }) => {
    if (hasta <= desde) return;
    if (hasta === Infinity) media.push({ option });
    else media.push({ query: desde ? { minWidth: desde, maxWidth: hasta - 1 } : { maxWidth: hasta - 1 }, option });
    desde = hasta;
  });
  return { baseOption, media };
}

export interface Entorno {
  fuente: string;
  animar: boolean;
}

function ajustarEntorno(opcion: OpcionGrafico, { fuente, animar }: Entorno): OpcionGrafico {
  return {
    ...opcion,
    animation: animar,
    textStyle: { ...opcion.textStyle, fontFamily: fuente },
    tooltip: {
      ...opcion.tooltip,
      transitionDuration: animar ? TRANSICION_TOOLTIP : 0,
      textStyle: { ...opcion.tooltip.textStyle, fontFamily: fuente }
    }
  };
}

export function aplicarEntorno(opcion: OpcionGrafico, entorno: Entorno): OpcionGrafico {
  return opcion.baseOption ? { ...opcion, baseOption: ajustarEntorno(opcion.baseOption, entorno) } : ajustarEntorno(opcion, entorno);
}

export function opcionPorPeriodo({ codigos, valores, indicador, base }: {
  codigos: string[];
  valores: ValorPeriodo[];
  indicador: Indicador;
  base: Indicador;
}): OpcionGrafico {
  return opcionBase({
    grid: { left: 8, right: 8, top: 28, bottom: 26 },
    tooltip: {
      trigger: 'item',
      formatter: (punto: EventoGrafico) => encabezadoTooltip(`Periodo ${codigos[punto.dataIndex]}`)
        + filaIndicador(indicador, valores[punto.dataIndex].valor) + filaIndicador(base, valores[punto.dataIndex].base)
    },
    xAxis: { ...EJE_CATEGORIAS, data: codigos, axisLabel: { ...ESTILO_TEXTO, margin: 10, interval: 0 }, axisLine: LINEA_EJE },
    yAxis: { type: 'value', show: false, min: 0, max: maximoPresente(valores.map(celda => celda.valor)) * 1.08 || 1 },
    series: [{
      type: 'bar',
      barCategoryGap: '28%',
      data: valores.map(celda => celda.valor),
      itemStyle: { color: COLORES_GRAFICOS.periodo, borderRadius: [4, 4, 0, 0] },
      label: { ...ROTULO, position: 'top', distance: 6, formatter: (punto: EventoGrafico) => formatearCeldaIndicador(indicador.id, punto.value) },
      emphasis: resaltado(COLORES_GRAFICOS.periodo)
    }]
  });
}

export function opcionPorNivel({ elementos, indicador, base }: { elementos: Elemento[]; indicador: Indicador; base: Indicador }): OpcionGrafico {
  const etiquetas = (ancho: number) => ({ yAxis: { axisLabel: { width: ancho } } });
  return segunAncho(opcionBase({
    grid: { left: MARGEN_IZQUIERDO, right: margenDerecho(elementos.length, 56), top: 4, bottom: 4, containLabel: true },
    tooltip: {
      trigger: 'item',
      formatter: (punto: EventoGrafico) => {
        const elemento = elementos[punto.dataIndex];
        return tooltipElemento(elemento) + filaIndicador(indicador, elemento.valor) + filaIndicador(base, elemento.base);
      }
    },
    xAxis: { type: 'value', show: false, min: 0, max: maximoPresente(elementos.map(elemento => elemento.valor)) * 1.02 || 1 },
    yAxis: ejeCategoriasVertical(elementos),
    dataZoom: desplazamientoVertical(elementos.length),
    series: [{
      type: 'bar',
      barMaxWidth: 22,
      barCategoryGap: '36%',
      cursor: 'pointer',
      data: elementos.map(elemento => elemento.valor),
      itemStyle: { color: COLORES_GRAFICOS.nivel, borderRadius: [0, 4, 4, 0] },
      label: { ...ROTULO, position: 'right', distance: 8, formatter: (punto: EventoGrafico) => formatearCeldaIndicador(indicador.id, punto.value) },
      emphasis: resaltado(COLORES_GRAFICOS.nivel)
    }]
  }), [
    { hasta: ANCHO_GRAFICO_ESTRECHO, option: etiquetas(ANCHO_ETIQUETAS.estrecho) },
    { hasta: Infinity, option: etiquetas(ANCHO_ETIQUETAS.amplio) }
  ]);
}

function ejeHorizontalDispersion(indicador: Indicador, logaritmico: boolean): OpcionGrafico {
  const comun = { ...EJE_SOBRIO, name: indicador.nombre, nameLocation: 'middle', nameGap: 26, nameTextStyle: ESTILO_TEXTO };
  if (logaritmico) {
    return {
      ...comun,
      type: 'log',
      logBase: 10,
      min: (extremos: Extremos) => 10 ** Math.floor(Math.log10(extremos.min)),
      max: (extremos: Extremos) => extremos.max * 1.25,
      axisLabel: { ...ESTILO_TEXTO, showMaxLabel: false, formatter: (valor: number) => formatearCompacto(valor) }
    };
  }
  return {
    ...comun,
    type: 'value',
    min: minimoDecena,
    max: esTasa(indicador) ? 100 : null,
    axisLabel: { ...ESTILO_TEXTO, formatter: marcaEje(indicador) }
  };
}

function ejeVerticalDispersion(indicador: Indicador): OpcionGrafico {
  return {
    ...EJE_SOBRIO,
    type: 'value',
    name: indicador.nombre,
    nameTextStyle: { ...ESTILO_TEXTO, align: 'left' },
    min: (extremos: Extremos) => (esTasa(indicador) ? minimoDecena(extremos) : Math.max(0, Math.floor(extremos.min * 2) / 2)),
    max: (extremos: Extremos) => (esTasa(indicador) ? Math.max(100, Math.ceil(extremos.max / 10) * 10) : 5),
    axisLabel: { ...ESTILO_TEXTO, formatter: marcaEje(indicador) }
  };
}

export function opcionDispersion({ puntos, dispersion }: { puntos: Puntos; dispersion: Dispersion }): OpcionGrafico {
  const indicadores = indicadoresDeDispersion(dispersion);
  const { contexto, seleccionadas } = puntos;
  const tamanoMaximo = Math.max(1, ...contexto.map(punto => punto.tamano), ...seleccionadas.map(punto => punto.tamano));
  const pocosPuntos = contexto.length + seleccionadas.length <= MAXIMO_PUNTOS_ROTULADOS;
  const rotularSeleccionadas = seleccionadas.length > 0 && seleccionadas.length <= MAXIMO_PUNTOS_ROTULADOS;
  const tamanoSimbolo = (valor: number[]) => 4 + Math.sqrt(valor[2] / tamanoMaximo) * (pocosPuntos ? 30 : 20);
  const datos = (lista: Puntos['contexto']) => lista.map(punto => [punto.x, punto.y, punto.tamano]);
  const rotuloNombre = (lista: Puntos['contexto']) => ({ ...ROTULO, position: 'right', formatter: (evento: EventoGrafico) => lista[evento.dataIndex].nombre });
  return opcionBase({
    grid: { left: 8, right: pocosPuntos || rotularSeleccionadas ? 140 : 16, top: 30, bottom: 24, containLabel: true },
    tooltip: {
      trigger: 'item',
      formatter: (evento: EventoGrafico) => {
        const punto = (evento.seriesIndex === 1 ? seleccionadas : contexto)[evento.dataIndex];
        return encabezadoTooltip(punto.rotulo) + lineaTooltip(punto.sede)
          + filaIndicador(indicadores.x, punto.x) + filaIndicador(indicadores.y, punto.y) + filaIndicador(indicadores.tamano, punto.tamano);
      }
    },
    xAxis: ejeHorizontalDispersion(indicadores.x, dispersion.ejeLogaritmico),
    yAxis: ejeVerticalDispersion(indicadores.y),
    series: [
      {
        type: 'scatter',
        progressive: 4000,
        cursor: 'pointer',
        data: datos(contexto),
        symbolSize: tamanoSimbolo,
        itemStyle: {
          color: COLORES_GRAFICOS.dispersion,
          borderColor: PALETA.fondo,
          borderWidth: 1
        },
        label: { ...rotuloNombre(contexto), show: pocosPuntos },
        emphasis: { scale: 1.25, itemStyle: { color: COLORES_GRAFICOS.dispersion } }
      },
      {
        type: 'scatter',
        cursor: 'pointer',
        z: 3,
        data: datos(seleccionadas),
        symbolSize: tamanoSimbolo,
        itemStyle: { color: COLORES_GRAFICOS.dispersion, borderColor: PALETA.tinta, borderWidth: 2 },
        label: { ...rotuloNombre(seleccionadas), show: rotularSeleccionadas, fontWeight: 600 },
        emphasis: { scale: 1.25 }
      }
    ]
  });
}

function estadoMapa(anchoEtiquetas: number, compacto: boolean): OpcionGrafico {
  return {
    xAxis: { axisLabel: { rotate: compacto ? 90 : 0 } },
    yAxis: { axisLabel: { width: anchoEtiquetas } },
    series: [{ label: { show: !compacto } }]
  };
}

function tramosMapa(elementos: Elemento[], cantidadPeriodos: number, derecho: number): Tramo[] {
  const anchoTexto = Math.max(0, ...elementos.map(elemento => elemento.etiqueta.length)) * ANCHO_CARACTER;
  const anchoMinimo = (anchoEtiquetas: number) => cantidadPeriodos * ANCHO_COLUMNA_ROTULADA + MARGEN_IZQUIERDO + derecho
    + Math.min(anchoEtiquetas, anchoTexto) + MARGEN_ETIQUETAS;
  const minimoEstrecho = Math.min(anchoMinimo(ANCHO_ETIQUETAS.estrecho), ANCHO_GRAFICO_ESTRECHO);
  const minimoAmplio = Math.max(anchoMinimo(ANCHO_ETIQUETAS.amplio), ANCHO_GRAFICO_ESTRECHO);
  return [
    { hasta: minimoEstrecho, option: estadoMapa(ANCHO_ETIQUETAS.estrecho, true) },
    { hasta: ANCHO_GRAFICO_ESTRECHO, option: estadoMapa(ANCHO_ETIQUETAS.estrecho, false) },
    { hasta: minimoAmplio, option: estadoMapa(ANCHO_ETIQUETAS.amplio, true) },
    { hasta: Infinity, option: estadoMapa(ANCHO_ETIQUETAS.amplio, false) }
  ];
}

export function opcionMapaCalor({ elementos, codigos, celdas, indicador, base, escala }: {
  elementos: Elemento[];
  codigos: string[];
  celdas: (Celda | null)[][];
  indicador: Indicador;
  base: Indicador;
  escala: Escala;
}): OpcionGrafico {
  const datos: OpcionGrafico[] = [];
  celdas.forEach((fila, posicionY) => fila.forEach((celda, posicionX) => {
    if (!celda) return;
    const tono = escala.tonoDe(celda.valor);
    datos.push({
      value: [posicionX, posicionY, celda.valor],
      itemStyle: { color: TONOS_MAPA[tono] },
      label: { color: tono >= PRIMER_TONO_OSCURO ? PALETA.fondo : PALETA.tinta }
    });
  }));
  const derecho = margenDerecho(elementos.length, 8);
  return segunAncho(opcionBase({
    tooltip: {
      trigger: 'item',
      formatter: (punto: EventoGrafico) => {
        const [posicionX, posicionY, valor] = punto.value;
        return tooltipElemento(elementos[posicionY]) + filaTooltip('Periodo', codigos[posicionX])
          + filaIndicador(indicador, valor) + filaIndicador(base, celdas[posicionY][posicionX]?.base);
      }
    },
    grid: { left: MARGEN_IZQUIERDO, right: derecho, top: 26, bottom: 4, containLabel: true },
    xAxis: { ...EJE_CATEGORIAS, position: 'top', data: codigos, axisLabel: { ...ESTILO_TEXTO, margin: 8, interval: 0 } },
    yAxis: ejeCategoriasVertical(elementos),
    dataZoom: desplazamientoVertical(elementos.length),
    series: [{
      type: 'heatmap',
      data: datos,
      cursor: 'pointer',
      itemStyle: { borderColor: PALETA.fondo, borderWidth: 2, borderRadius: 4 },
      label: { show: true, fontSize: TAMANO_TEXTO, formatter: (punto: EventoGrafico) => formatearCeldaIndicador(indicador.id, punto.value[2]) },
      emphasis: { itemStyle: { borderColor: PALETA.tinta, borderWidth: 2 } }
    }]
  }), tramosMapa(elementos, codigos.length, derecho));
}
