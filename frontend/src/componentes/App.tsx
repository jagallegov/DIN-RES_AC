import { useEffect, useId, useMemo, useRef, useState, type Dispatch, type KeyboardEvent, type SetStateAction } from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { JERARQUIA, SECCIONES, TEXTOS, type Nivel } from '../dominio/definiciones';
import { leerEstado, serializarEstado, tieneEstado, type EstadoVista } from '../dominio/estadoUrl';
import { formatearFechaLarga, formatearMomento } from '../dominio/formato';
import { INDICADORES, calcular, calcularPorAsignatura } from '../dominio/indicadores';
import { periodosDeTipo, rotuloAsignatura, type Modelo } from '../dominio/modelo';
import { alternar, calcularOpciones, cambiarTipo, depurarFiltros, describirFiltros, estadoInicial, filtrosParaBajar, type Filtros } from '../dominio/seleccion';
import { mensajeSinContenido } from '../dominio/series';
import { LimiteError } from './Componentes';
import { PanelFiltros } from './Filtros';
import { Seccion } from './Seccion';

const MAXIMO_CHIPS_ASIGNATURA = 6;
const DESPLAZAMIENTO_PESTANA: Record<string, number> = { ArrowRight: 1, ArrowLeft: -1 };
const NIVELES_CON_CHIP = JERARQUIA.filter(({ nivel }) => nivel !== 'asignatura');

interface Chip {
  clave: string;
  texto: string;
  alQuitar: () => void;
}

function Pestanas({ indiceActivo, alCambiar }: { indiceActivo: number; alCambiar: (posicion: number) => void }) {
  const botones = useRef<(HTMLButtonElement | null)[]>([]);
  const alPulsarTecla = (evento: KeyboardEvent<HTMLDivElement>) => {
    const cantidad = SECCIONES.length;
    let destino;
    if (evento.key in DESPLAZAMIENTO_PESTANA) destino = (indiceActivo + DESPLAZAMIENTO_PESTANA[evento.key] + cantidad) % cantidad;
    else if (evento.key === 'Home') destino = 0;
    else if (evento.key === 'End') destino = cantidad - 1;
    else return;
    evento.preventDefault();
    alCambiar(destino);
    botones.current[destino]?.focus();
  };
  return (
    <div className="pestanas" role="tablist" aria-label="Secciones del tablero" onKeyDown={alPulsarTecla}>
      {SECCIONES.map((seccion, posicion) => (
        <button
          key={seccion.id}
          ref={boton => { botones.current[posicion] = boton; }}
          type="button"
          role="tab"
          id={`pestana-${seccion.id}`}
          className="pestana"
          aria-selected={posicion === indiceActivo}
          aria-controls={`panel-${seccion.id}`}
          tabIndex={posicion === indiceActivo ? 0 : -1}
          onClick={() => alCambiar(posicion)}
        >
          <span className="pestana-numero">{`Sección ${posicion + 1}`}</span>
          <span className="pestana-nombre">{seccion.nombre}</span>
        </button>
      ))}
    </div>
  );
}

function chipsDeSeleccion(
  modelo: Modelo, filtros: Filtros, alCambiar: (cambios: Partial<Filtros>) => void, alAlternarAsignatura: (asignatura: number) => void
): Chip[] {
  const periodosDelTipo = periodosDeTipo(modelo, filtros.tipo);
  const chips: Chip[] = [];
  const agregar = (clave: string, texto: string, alQuitar: () => void) => chips.push({ clave, texto, alQuitar });
  const quitarDe = (campo: 'sedes' | 'facultades' | 'uabs', valor: number) => () => alCambiar({ [campo]: filtros[campo].filter(elemento => elemento !== valor) });
  if (filtros.periodos.length !== periodosDelTipo.length) {
    const restaurarPeriodos = () => alCambiar({ periodos: periodosDelTipo.slice() });
    agregar('periodos', `${filtros.periodos.length} de ${periodosDelTipo.length} periodos`, restaurarPeriodos);
  }
  NIVELES_CON_CHIP.forEach(({ nivel, campo }) => filtros[campo].forEach(id => (
    agregar(`${nivel}-${id}`, modelo.nombres[nivel][id], quitarDe(campo as 'sedes' | 'facultades' | 'uabs', id))
  )));
  if (filtros.asignaturas.length > MAXIMO_CHIPS_ASIGNATURA) {
    agregar('asignaturas', `${filtros.asignaturas.length} asignaturas`, () => alCambiar({ asignaturas: [] }));
  } else {
    filtros.asignaturas.forEach(asignatura => agregar(
      `asignatura-${asignatura}`,
      rotuloAsignatura(modelo, asignatura),
      () => alAlternarAsignatura(asignatura)
    ));
  }
  return chips;
}

function SeleccionActiva({ chips, alQuitar, alLimpiar }: { chips: Chip[]; alQuitar: (chip: Chip, posicion: number) => void; alLimpiar: () => void }) {
  const idTitulo = useId();
  if (!chips.length) return null;
  return (
    <div className="seleccion-activa">
      <span className="seleccion-titulo" id={idTitulo}>Selección activa</span>
      <ul className="lista-chips" aria-labelledby={idTitulo}>
        {chips.map((chip, posicion) => (
          <li key={chip.clave}>
            <button type="button" className="chip" aria-label={`Quitar filtro: ${chip.texto}`} onClick={() => alQuitar(chip, posicion)}>
              {chip.texto}
              <span className="chip-quitar" aria-hidden="true">×</span>
            </button>
          </li>
        ))}
      </ul>
      <button type="button" className="boton-enlace" onClick={alLimpiar}>Limpiar selección</button>
    </div>
  );
}

function describirCorte({ fechaCorte, fechaCorteMinima }: Modelo): string {
  const hasta = formatearFechaLarga(fechaCorte);
  return fechaCorteMinima === fechaCorte ? hasta : TEXTOS.rangoFechas(formatearFechaLarga(fechaCorteMinima), hasta);
}

function useEstadoEnUrl(modelo: Modelo): [EstadoVista, Dispatch<SetStateAction<EstadoVista>>] {
  const [estado, fijarEstado] = useState(() => leerEstado(modelo, window.location.hash));
  useEffect(() => {
    window.history.replaceState(null, '', `#${serializarEstado(modelo, estado.seccion, estado.filtros)}`);
  }, [modelo, estado]);
  useEffect(() => {
    const restaurar = () => {
      const { hash } = window.location;
      fijarEstado(previo => (tieneEstado(hash) ? leerEstado(modelo, hash) : { ...previo }));
    };
    window.addEventListener('hashchange', restaurar);
    return () => window.removeEventListener('hashchange', restaurar);
  }, [modelo]);
  return [estado, fijarEstado];
}

function useEnfoqueEnFiltros() {
  const zona = useRef<HTMLElement>(null);
  const pendiente = useRef<number | null>(null);
  useEffect(() => {
    const posicion = pendiente.current;
    if (posicion == null || !zona.current) return;
    pendiente.current = null;
    const chips = zona.current.querySelectorAll<HTMLElement>('.chip');
    (chips[Math.min(posicion, chips.length - 1)] ?? zona.current.querySelector<HTMLElement>('button'))?.focus();
  });
  return { zona, pendiente };
}

function App({ modelo, alMontar }: { modelo: Modelo; alMontar: () => void }) {
  const [{ seccion: idSeccion, filtros }, fijarEstado] = useEstadoEnUrl(modelo);
  const indicePestana = SECCIONES.findIndex(seccion => seccion.id === idSeccion);
  const seccionActiva = SECCIONES[indicePestana];
  const indicadorPrincipal = INDICADORES[seccionActiva.principal];
  const { periodos, sedes, facultades, uabs } = filtros;
  const contexto = useMemo(() => ({ periodos, sedes, facultades, uabs }), [periodos, sedes, facultades, uabs]);
  const resultado = useMemo(() => calcular(modelo, filtros, indicadorPrincipal), [modelo, filtros, indicadorPrincipal]);
  const asignaturas = useMemo(() => calcularPorAsignatura(modelo, contexto), [modelo, contexto]);
  const opcionesFiltro = useMemo(() => calcularOpciones(modelo, contexto), [modelo, contexto]);
  const procedencia = useMemo(() => TEXTOS.procedencia(modelo.fuente, describirCorte(modelo), formatearMomento(modelo.actualizado)), [modelo]);
  const descarga = useMemo(() => ({ filtros: describirFiltros(modelo, filtros), procedencia }), [modelo, filtros, procedencia]);
  const enfoque = useEnfoqueEnFiltros();
  useEffect(() => {
    alMontar();
  }, [alMontar]);

  const actualizarFiltros = (transformar: (previos: Filtros) => Filtros) => fijarEstado(previo => ({ ...previo, filtros: transformar(previo.filtros) }));
  const cambiar = (cambios: Partial<Filtros>) => actualizarFiltros(previos => ('tipo' in cambios
    ? (cambios.tipo === previos.tipo ? previos : cambiarTipo(modelo, previos, cambios.tipo as string))
    : depurarFiltros(modelo, { ...previos, ...cambios })));
  const alternarAsignatura = (asignatura: number) => actualizarFiltros(previos => ({
    ...previos,
    asignaturas: alternar(previos.asignaturas, asignatura)
  }));
  const bajarNivel = (nivel: Nivel, id: number) => cambiar(filtrosParaBajar(modelo, nivel, id));
  const quitarChip = (chip: Chip, posicion: number) => {
    enfoque.pendiente.current = posicion;
    chip.alQuitar();
  };
  const limpiar = () => {
    enfoque.pendiente.current = 0;
    actualizarFiltros(previos => estadoInicial(modelo, previos.tipo));
  };
  const elegirPestana = (posicion: number) => fijarEstado(previo => ({ ...previo, seccion: SECCIONES[posicion].id }));


  const mensaje = mensajeSinContenido(modelo, seccionActiva, filtros, resultado);
  const contenido = (
    <>
      {mensaje
        ? <p className="estado">{mensaje}</p>
        : (
          <Seccion
            key={seccionActiva.id}
            modelo={modelo}
            seccion={seccionActiva}
            resultado={resultado}
            asignaturas={asignaturas}
            filtros={filtros}
            descarga={descarga}
            alBajarNivel={bajarNivel}
            alAlternarAsignatura={alternarAsignatura}
          />
        )}
    </>
  );

  return (
    <>
      <Pestanas indiceActivo={indicePestana} alCambiar={elegirPestana} />
      <PanelFiltros modelo={modelo} filtros={filtros} opciones={opcionesFiltro} alCambiar={cambiar} zona={enfoque.zona}>
        <SeleccionActiva
          chips={chipsDeSeleccion(modelo, filtros, cambiar, alternarAsignatura)}
          alQuitar={quitarChip}
          alLimpiar={limpiar}
        />
      </PanelFiltros>
      {SECCIONES.map((seccion, posicion) => (
        <div
          key={seccion.id}
          role="tabpanel"
          id={`panel-${seccion.id}`}
          aria-labelledby={`pestana-${seccion.id}`}
          hidden={posicion !== indicePestana}
        >
          {posicion === indicePestana ? contenido : null}
        </div>
      ))}
      <p className="fuente-pie">{TEXTOS.fuente(modelo.fuente)}</p>
    </>
  );
}

export interface Aplicacion {
  actualizar: (modelo: Modelo) => void;
  desmontar: () => void;
}

export function montarAplicacion(contenedor: HTMLElement, modelo: Modelo, { alMontar, alFallar }: {
  alMontar: () => void;
  alFallar: (error: unknown) => void;
}): Aplicacion {
  const raiz = createRoot(contenedor);
  const dibujar = (actual: Modelo) => flushSync(() => raiz.render(
    <LimiteError key={actual.version} alFallar={alFallar}><App modelo={actual} alMontar={alMontar} /></LimiteError>
  ));
  dibujar(modelo);
  return { actualizar: dibujar, desmontar: () => raiz.unmount() };
}
