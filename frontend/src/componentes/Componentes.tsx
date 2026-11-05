import * as echarts from 'echarts';
import React, { useCallback, useEffect, useId, useRef, useState, useSyncExternalStore, type MutableRefObject, type ReactNode } from 'react';
import { TEXTOS, TIPOS_INDICADOR, type TipoIndicador } from '../dominio/definiciones';
import type { Escala, Tono } from '../dominio/escalas';
import { ESPACIO_FIJO, formatearDecimal, partirEnLineas } from '../dominio/formato';
import { PALETA, TONOS_MAPA, aplicarEntorno, type OpcionGrafico } from '../dominio/graficos';
import { formatearCeldaIndicador, formatearIndicador, type Indicador, type ValorUltimoPeriodo } from '../dominio/indicadores';
import { ICONOS, ICONOS_INDICADOR } from '../dominio/iconos';
import type { TablaDatos } from '../dominio/series';

export type EventoGrafico = any;
export type ManejadorClic = (evento: EventoGrafico) => void;
export type InstanciaGrafico = MutableRefObject<echarts.ECharts | null>;

export interface Descarga {
  filtros: string;
  procedencia: string;
}

const CLASE_TIPO: Record<TipoIndicador, string> = { producto: 'tipo-producto', resultado: 'tipo-resultado' };
const ESCALA_IMAGEN = 2;
const IMAGEN = {
  margen: 20,
  tamanoTitulo: 16,
  altoTitulo: 22,
  tamanoTexto: 12,
  altoTexto: 18,
  separacion: 12
};
const MEDIDAS_IMAGEN = Object.fromEntries(Object.entries(IMAGEN).map(([clave, valor]) => [clave, valor * ESCALA_IMAGEN])) as typeof IMAGEN;

function useConsultaMedios(consulta: string): boolean {
  const suscribir = useCallback((avisar: () => void) => {
    const lista = window.matchMedia(consulta);
    lista.addEventListener('change', avisar);
    return () => lista.removeEventListener('change', avisar);
  }, [consulta]);
  return useSyncExternalStore(suscribir, () => window.matchMedia(consulta).matches);
}

export function Icono({ trazado, lado = 16 }: { trazado: string; lado?: number }) {
  return <svg viewBox={`0 0 ${lado} ${lado}`} aria-hidden="true" focusable="false"><path d={trazado} /></svg>;
}

export function Kpi({ indicador, valor, ultimo }: { indicador: Indicador; valor: number | null; ultimo: ValorUltimoPeriodo | null }) {
  const tipo = TIPOS_INDICADOR[indicador.tipo];
  return (
    <article className="kpi">
      <div className="kpi-encabezado">
        <span className={`kpi-icono ${CLASE_TIPO[indicador.tipo]}`} role="img" aria-label={`Indicador de ${tipo.nombre.toLowerCase()}`}>
          <Icono trazado={ICONOS_INDICADOR[indicador.id]} lado={24} />
        </span>
        <p className="kpi-nombre">{indicador.nombre}</p>
      </div>
      <p className="kpi-valor">{formatearIndicador(indicador.id, ultimo ? ultimo.valor : valor)}</p>
      <p className="kpi-descripcion">{indicador.descripcion}</p>
      {ultimo
        ? (
          <p className="kpi-ultimo">
            <span className="kpi-ultimo-etiqueta">Último periodo</span>
            <strong className="kpi-ultimo-valor">{ultimo.periodo}</strong>
          </p>
        )
        : null}
    </article>
  );
}

export function Tarjeta({ titulo, indicador, nota, acciones, pie, children }: {
  titulo: string;
  indicador?: Indicador;
  nota?: string | null;
  acciones?: ReactNode;
  pie?: ReactNode;
  children?: ReactNode;
}) {
  const idTitulo = useId();
  return (
    <section className="tarjeta" aria-labelledby={idTitulo}>
      <div className="tarjeta-encabezado">
        <div className="tarjeta-titulo"><h3 id={idTitulo}>{titulo}</h3></div>
        {acciones ? <div className="tarjeta-acciones">{acciones}</div> : null}
      </div>
      {nota ? <p className="tarjeta-nota">{nota}</p> : null}
      <div className="tarjeta-cuerpo">{children}</div>
      {pie}
    </section>
  );
}

function Grafico({ opcion, etiqueta, alHacerClic, instancia }: {
  opcion: OpcionGrafico;
  etiqueta: string;
  alHacerClic?: ManejadorClic;
  instancia: InstanciaGrafico;
}) {
  const contenedor = useRef<HTMLDivElement>(null);
  const manejadorClic = useRef(alHacerClic);
  const reducirMovimiento = useConsultaMedios('(prefers-reduced-motion: reduce)');
  useEffect(() => {
    manejadorClic.current = alHacerClic;
  });
  useEffect(() => {
    const elemento = contenedor.current as HTMLDivElement;
    const grafico = echarts.init(elemento, null, { renderer: 'canvas' });
    instancia.current = grafico;
    grafico.on('click', evento => manejadorClic.current?.(evento));
    const observador = new ResizeObserver(() => grafico.resize());
    observador.observe(elemento);
    return () => {
      observador.disconnect();
      grafico.dispose();
      instancia.current = null;
    };
  }, [instancia]);
  useEffect(() => {
    const fuente = getComputedStyle(contenedor.current as HTMLDivElement).fontFamily;
    (instancia.current as echarts.ECharts).setOption(aplicarEntorno(opcion, { fuente, animar: !reducirMovimiento }), true);
  }, [opcion, reducirMovimiento, instancia]);
  return <div ref={contenedor} className="grafico" role="img" aria-label={etiqueta} />;
}

function cargarImagen(url: string): Promise<HTMLImageElement> {
  return new Promise((resolver, rechazar) => {
    const imagen = new Image();
    imagen.onload = () => resolver(imagen);
    imagen.onerror = rechazar;
    imagen.src = url;
  });
}

interface TextosImagen {
  titulo: string;
  filtros: string;
  procedencia: string;
}

interface Bloque {
  lineas: string[];
  tipo: string;
  color: string;
  alto: number;
}

function prepararBloques(contexto: CanvasRenderingContext2D, { titulo, filtros, procedencia }: TextosImagen, anchoTexto: number) {
  const fuente = getComputedStyle(document.body).fontFamily;
  const tipoTitulo = `600 ${MEDIDAS_IMAGEN.tamanoTitulo}px ${fuente}`;
  const tipoTexto = `${MEDIDAS_IMAGEN.tamanoTexto}px ${fuente}`;
  const bloque = (texto: string, tipo: string, color: string, alto: number): Bloque => {
    contexto.font = tipo;
    return { lineas: partirEnLineas(texto, anchoTexto, linea => contexto.measureText(linea).width), tipo, color, alto };
  };
  return {
    titulo: bloque(titulo, tipoTitulo, PALETA.tinta, MEDIDAS_IMAGEN.altoTitulo),
    filtros: bloque(filtros, tipoTexto, PALETA.tintaSecundaria, MEDIDAS_IMAGEN.altoTexto),
    pie: bloque(procedencia, tipoTexto, PALETA.tintaSecundaria, MEDIDAS_IMAGEN.altoTexto)
  };
}

async function componerImagen(urlGrafico: string, textos: TextosImagen): Promise<string> {
  const imagen = await cargarImagen(urlGrafico);
  const lienzo = document.createElement('canvas');
  const contexto = lienzo.getContext('2d') as CanvasRenderingContext2D;
  const { margen, separacion } = MEDIDAS_IMAGEN;
  const bloques = prepararBloques(contexto, textos, imagen.width);
  const altoTextos = Object.values(bloques).reduce((suma, bloque) => suma + bloque.lineas.length * bloque.alto, 0);
  lienzo.width = imagen.width + 2 * margen;
  lienzo.height = 2 * margen + 2 * separacion + imagen.height + altoTextos;
  contexto.fillStyle = PALETA.fondo;
  contexto.fillRect(0, 0, lienzo.width, lienzo.height);
  contexto.textBaseline = 'top';
  let altura = margen;
  const escribir = (bloque: Bloque) => {
    contexto.font = bloque.tipo;
    contexto.fillStyle = bloque.color;
    bloque.lineas.forEach(linea => {
      contexto.fillText(linea, margen, altura);
      altura += bloque.alto;
    });
  };
  escribir(bloques.titulo);
  escribir(bloques.filtros);
  altura += separacion;
  contexto.drawImage(imagen, margen, altura);
  altura += imagen.height + separacion;
  escribir(bloques.pie);
  return lienzo.toDataURL('image/png');
}

function ventanaVisible(grafico: echarts.ECharts): string | null {
  const { dataZoom, yAxis } = grafico.getOption() as any;
  const ventana = dataZoom?.[0];
  if (ventana?.startValue == null) return null;
  return TEXTOS.categoriasVisibles(ventana.startValue + 1, ventana.endValue + 1, yAxis[0].data.length);
}

function DatosGrafico({ titulo, datos }: { titulo: string; datos: TablaDatos }) {
  const [abierto, fijarAbierto] = useState(false);
  const [primera, ...resto] = datos.columnas;
  return (
    <details className="datos-grafico" onToggle={evento => fijarAbierto(evento.currentTarget.open)}>
      <summary>Ver datos</summary>
      {abierto
        ? (
          <div className="datos-grafico-contenedor" tabIndex={0} role="region" aria-label={`Datos: ${titulo}`}>
            <table className="tabla-datos">
              <thead><tr>
                <th scope="col">{primera}</th>
                {resto.map(columna => <th key={columna} scope="col" className="celda-numero">{columna}</th>)}
              </tr></thead>
              <tbody>{datos.filas.map(([rotulo, ...valores]) => (
                <tr key={rotulo}>
                  <th scope="row">{rotulo}</th>
                  {valores.map((valor, posicion) => <td key={resto[posicion]} className="celda-numero">{valor}</td>)}
                </tr>
              ))}</tbody>
            </table>
          </div>
        )
        : null}
    </details>
  );
}

export function TarjetaGrafico(propiedades: {
  titulo: string;
  indicador?: Indicador;
  nota?: string | null;
  opcion: OpcionGrafico | null;
  resumen: string;
  datos?: TablaDatos | null;
  alHacerClic?: ManejadorClic;
  nombreArchivo: string;
  descarga: Descarga;
  mensajeVacio: string;
  pie?: ReactNode;
}) {
  const { titulo, indicador, nota, opcion, resumen, datos, alHacerClic, nombreArchivo, descarga, mensajeVacio, pie } = propiedades;
  const instancia = useRef<echarts.ECharts | null>(null);
  const descargar = async () => {
    try {
      const grafico = instancia.current as echarts.ECharts;
      const ventana = ventanaVisible(grafico);
      const urlGrafico = grafico.getDataURL({
        type: 'png', pixelRatio: ESCALA_IMAGEN, backgroundColor: PALETA.fondo, excludeComponents: ['toolbox', 'dataZoom']
      });
      const enlace = document.createElement('a');
      enlace.href = await componerImagen(urlGrafico, {
        titulo,
        filtros: ventana ? `${descarga.filtros} ${ventana}` : descarga.filtros,
        procedencia: descarga.procedencia
      });
      enlace.download = `${nombreArchivo}.png`;
      enlace.click();
    } catch (error) {
      console.error(error);
    }
  };
  const accion = opcion
    ? (
      <button type="button" className="boton-icono" title="Descargar imagen" aria-label={`Descargar imagen: ${titulo}`} onClick={descargar}>
        <Icono trazado={ICONOS.descargaImagen} />
      </button>
    )
    : null;
  const piezasPie = opcion ? <>{pie}{datos ? <DatosGrafico titulo={titulo} datos={datos} /> : null}</> : null;
  return (
    <Tarjeta titulo={titulo} indicador={indicador} nota={nota} acciones={accion} pie={piezasPie}>
      {opcion
        ? <Grafico opcion={opcion} etiqueta={resumen} alHacerClic={alHacerClic} instancia={instancia} />
        : <p className="estado estado-grafico">{mensajeVacio}</p>}
    </Tarjeta>
  );
}

export function LeyendaMapa({ escala, indicador }: { escala: Escala; indicador: Indicador }) {
  const formatear = (valor: number) => (indicador.formato === 'tasa'
    ? `${formatearDecimal(valor, 0)}${ESPACIO_FIJO}%`
    : formatearCeldaIndicador(indicador.id, valor));
  const rango = (tono: Tono) => {
    const desde = formatear(tono.desde);
    const hasta = formatear(tono.hasta);
    return desde === hasta ? desde : `${desde} a ${hasta}`;
  };
  return (
    <div className="leyenda-mapa">
      <ul className="leyenda-mapa-tonos" aria-label="Rangos de color del mapa de calor">
        {escala.tonos.map(tono => (
          <li key={tono.indice}>
            <span className="leyenda-muestra" style={{ background: TONOS_MAPA[tono.indice] }} aria-hidden="true" />
            {rango(tono)}
          </li>
        ))}
      </ul>
      <p className="leyenda-mapa-nota">{TEXTOS.escalaMapa[escala.modo]}</p>
    </div>
  );
}

export function LeyendaTipos() {
  return (
    <>
      {(Object.entries(TIPOS_INDICADOR) as [TipoIndicador, { nombre: string; descripcion: string }][]).map(([clave, tipo]) => (
        <span key={clave} className={`leyenda-tipo ${CLASE_TIPO[clave]}`}>
          <b>{`${tipo.nombre}:`}</b>
          {` ${tipo.descripcion}`}
        </span>
      ))}
      <span className="leyenda-nota">{TEXTOS.conteosSuman}</span>
    </>
  );
}

interface PropiedadesLimite {
  alFallar: (error: unknown) => void;
  children?: ReactNode;
}

export class LimiteError extends React.Component<PropiedadesLimite, { error: any }> {
  constructor(propiedades: PropiedadesLimite) {
    super(propiedades);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error: unknown) {
    return { error };
  }

  componentDidCatch(error: unknown) {
    this.props.alFallar(error);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="aviso-error" role="alert">
        <h2>{TEXTOS.errorVista}</h2>
        <p>{TEXTOS.ayudaVista}</p>
        <code>{String(this.state.error.message ?? this.state.error)}</code>
      </div>
    );
  }
}
