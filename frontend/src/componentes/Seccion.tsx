import { useMemo } from 'react';
import { NIVELES, TEXTOS, type Dispersion, type Nivel, type Seccion as DefinicionSeccion } from '../dominio/definiciones';
import { escalaDeTonos } from '../dominio/escalas';
import { opcionDispersion, opcionMapaCalor, opcionPorNivel, opcionPorPeriodo } from '../dominio/graficos';
import { INDICADORES, valorTotal, valorUltimoPeriodo, type Indicador, type Resultado, type ResultadoPorAsignatura } from '../dominio/indicadores';
import type { Modelo } from '../dominio/modelo';
import type { Filtros } from '../dominio/seleccion';
import {
  celdasPorNivelYPeriodo, elementosPorNivel, filasPorAsignatura, periodosDelGrafico, puntosDispersion,
  resumenesAccesibles, tablasDeDatos, valoresPorPeriodo, type Elemento, type Mapa, type Puntos, type ValorPeriodo
} from '../dominio/series';
import { Kpi, LeyendaMapa, TarjetaGrafico, type Descarga, type EventoGrafico } from './Componentes';
import { TablaAsignaturas } from './Tabla';

interface Series {
  indicador: Indicador;
  base: Indicador;
  codigos: string[];
  valores: ValorPeriodo[];
  elementos: Elemento[];
  mapa: Mapa | null;
  puntos: Puntos;
  tabla: ReturnType<typeof filasPorAsignatura>;
}

function construirMapa(modelo: Modelo, resultado: Resultado, elementos: Elemento[], periodos: number[], indicador: Indicador, base: Indicador): Mapa | null {
  if (!elementos.length || !periodos.length) return null;
  const celdas = celdasPorNivelYPeriodo(modelo, resultado, elementos, periodos, indicador, base);
  const escala = escalaDeTonos(celdas.flat().filter(Boolean).map(celda => (celda as NonNullable<typeof celda>).valor));
  return escala ? { celdas, escala } : null;
}

function useSeries({ modelo, seccion, resultado, asignaturas, seleccionadas }: {
  modelo: Modelo;
  seccion: DefinicionSeccion;
  resultado: Resultado;
  asignaturas: ResultadoPorAsignatura;
  seleccionadas: Set<number>;
}): Series {
  const indicador = INDICADORES[seccion.principal];
  const base = INDICADORES[seccion.base];
  const periodos = useMemo(() => periodosDelGrafico(modelo, resultado, indicador), [modelo, resultado, indicador]);
  const codigos = useMemo(() => periodos.map(periodo => modelo.periodos[periodo]), [modelo, periodos]);
  const valores = useMemo(() => valoresPorPeriodo(resultado, periodos, indicador, base), [resultado, periodos, indicador, base]);
  const elementos = useMemo(() => elementosPorNivel(modelo, resultado, indicador, base), [modelo, resultado, indicador, base]);
  const mapa = useMemo(
    () => construirMapa(modelo, resultado, elementos, periodos, indicador, base),
    [modelo, resultado, elementos, periodos, indicador, base]
  );
  const puntos = useMemo(
    () => puntosDispersion(modelo, asignaturas.porAsignatura, seccion.dispersion, seleccionadas),
    [modelo, asignaturas, seccion, seleccionadas]
  );
  const tabla = useMemo(
    () => filasPorAsignatura(modelo, asignaturas, seccion.tabla, indicador.excluyeEnCurso),
    [modelo, asignaturas, seccion, indicador]
  );
  return { indicador, base, codigos, valores, elementos, mapa, puntos, tabla };
}

function useGraficos({ indicador, base, codigos, valores, elementos, mapa, puntos }: Series, dispersion: Dispersion) {
  const periodo = useMemo(
    () => (codigos.length ? opcionPorPeriodo({ codigos, valores, indicador, base }) : null),
    [codigos, valores, indicador, base]
  );
  const nivel = useMemo(() => (elementos.length ? opcionPorNivel({ elementos, indicador, base }) : null), [elementos, indicador, base]);
  const nube = useMemo(
    () => (puntos.contexto.length + puntos.seleccionadas.length ? opcionDispersion({ puntos, dispersion }) : null),
    [puntos, dispersion]
  );
  const calor = useMemo(
    () => (mapa ? opcionMapaCalor({ elementos, codigos, celdas: mapa.celdas, indicador, base, escala: mapa.escala }) : null),
    [mapa, elementos, codigos, indicador, base]
  );
  return { periodo, nivel, dispersion: nube, mapa: calor };
}

function useTextos({ indicador, base, codigos, valores, elementos, mapa, puntos }: Series, dispersion: Dispersion, nivel: Nivel) {
  const titulos = useMemo(() => ({
    periodo: `${indicador.nombre} por periodo`,
    nivel: `${indicador.nombre} por ${NIVELES[nivel]}`,
    mapa: `${indicador.nombre} por ${NIVELES[nivel]} y periodo`
  }), [indicador, nivel]);
  const resumenes = useMemo(
    () => resumenesAccesibles({ titulos, codigos, valores, elementos, puntos, mapa, indicador, dispersion }),
    [titulos, codigos, valores, elementos, puntos, mapa, indicador, dispersion]
  );
  const datos = useMemo(
    () => tablasDeDatos({ nivel, codigos, valores, elementos, mapa, indicador, base }),
    [nivel, codigos, valores, elementos, mapa, indicador, base]
  );
  return { titulos, resumenes, datos };
}

export function Seccion({ modelo, seccion, resultado, asignaturas, filtros, descarga, alBajarNivel, alAlternarAsignatura }: {
  modelo: Modelo;
  seccion: DefinicionSeccion;
  resultado: Resultado;
  asignaturas: ResultadoPorAsignatura;
  filtros: Filtros;
  descarga: Descarga;
  alBajarNivel: (nivel: Nivel, id: number) => void;
  alAlternarAsignatura: (asignatura: number) => void;
}) {
  const seleccionadas = useMemo(() => new Set(filtros.asignaturas), [filtros.asignaturas]);
  const series = useSeries({ modelo, seccion, resultado, asignaturas, seleccionadas });
  const opciones = useGraficos(series, seccion.dispersion);
  const { titulos, resumenes, datos } = useTextos(series, seccion.dispersion, resultado.nivel);
  const { indicador, elementos, mapa, puntos, tabla } = series;
  const { dispersion } = seccion;
  const archivo = (sufijo: string) => `${seccion.id}_${sufijo}_${modelo.fechaCorte}`;
  const notaDispersion = TEXTOS.notaDispersion(dispersion, {
    mostradas: puntos.contexto.length + puntos.seleccionadas.length,
    total: tabla.filas.length,
    visibles: puntos.seleccionadas.length,
    ausentes: seleccionadas.size - puntos.seleccionadas.length
  });

  const elegirElemento = (posicion: number) => {
    const elemento = elementos[posicion];
    if (!elemento) return;
    if (resultado.nivel === 'asignatura') alAlternarAsignatura(elemento.id);
    else alBajarNivel(resultado.nivel, elemento.id);
  };
  const elegirPunto = (evento: EventoGrafico) => {
    const punto = (evento.seriesIndex === 1 ? puntos.seleccionadas : puntos.contexto)[evento.dataIndex];
    if (punto) alAlternarAsignatura(punto.id);
  };

  return (
    <>
      <div className="rejilla-kpi">
        {seccion.kpis.map(id => <Kpi key={id} indicador={INDICADORES[id]} valor={valorTotal(resultado, id)} ultimo={valorUltimoPeriodo(modelo, resultado, id)} />)}
      </div>
      <div className="mosaico">
        <TarjetaGrafico
          titulo={titulos.periodo}
          indicador={indicador}
          opcion={opciones.periodo}
          resumen={resumenes.periodo}
          datos={datos.periodo}
          nombreArchivo={archivo('periodo')}
          descarga={descarga}
          mensajeVacio={TEXTOS.sinPeriodos}
        />
        <TarjetaGrafico
          titulo={titulos.nivel}
          indicador={indicador}
          opcion={opciones.nivel}
          resumen={resumenes.nivel}
          datos={datos.nivel}
          alHacerClic={evento => elegirElemento(evento.dataIndex)}
          nombreArchivo={archivo(resultado.nivel)}
          descarga={descarga}
          mensajeVacio={TEXTOS.sinDatos}
        />
        <TarjetaGrafico
          titulo={dispersion.titulo}
          indicador={INDICADORES[dispersion.y]}
          nota={notaDispersion}
          opcion={opciones.dispersion}
          resumen={resumenes.dispersion}
          alHacerClic={elegirPunto}
          nombreArchivo={archivo('dispersion')}
          descarga={descarga}
          mensajeVacio={TEXTOS.dispersionVacia}
        />
        <TarjetaGrafico
          titulo={titulos.mapa}
          indicador={indicador}
          opcion={opciones.mapa}
          resumen={resumenes.mapa}
          datos={datos.mapa}
          alHacerClic={evento => elegirElemento(evento.value?.[1])}
          nombreArchivo={archivo('mapa_calor')}
          descarga={descarga}
          mensajeVacio={TEXTOS.sinDatos}
          pie={mapa ? <LeyendaMapa escala={mapa.escala} indicador={indicador} /> : null}
        />
      </div>
      <TablaAsignaturas
        modelo={modelo}
        seccion={seccion}
        filas={tabla.filas}
        seleccionadas={seleccionadas}
        nombreArchivo={archivo('asignaturas')}
        alAlternar={alAlternarAsignatura}
      />
    </>
  );
}
