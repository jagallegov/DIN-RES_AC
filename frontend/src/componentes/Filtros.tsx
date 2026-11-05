import { useEffect, useId, useMemo, useRef, useState, type ChangeEvent, type KeyboardEvent, type ReactNode, type RefObject } from 'react';
import { TEXTOS } from '../dominio/definiciones';
import { normalizarBusqueda, ordenarNumeros } from '../dominio/formato';
import { periodosDeTipo, type Modelo, type TipoPeriodo } from '../dominio/modelo';
import { alternar, type Filtros, type Opciones } from '../dominio/seleccion';

const LIMITE_RESULTADOS = 100;
const OPCIONES_PARA_BUSCAR = 12;
const PASO_FLECHA: Record<string, number> = { ArrowDown: 1, ArrowUp: -1 };
const ETIQUETA_RESULTADOS = 'Resultados de la búsqueda de asignaturas';

interface Opcion {
  valor: number;
  texto: string;
  codigo?: string;
}

function useDesplegable<T extends HTMLElement>() {
  const [abierto, fijarAbierto] = useState(false);
  const contenedor = useRef<HTMLDivElement>(null);
  const disparador = useRef<T>(null);
  useEffect(() => {
    if (!abierto) return undefined;
    const cerrarSiQuedaFuera = (evento: Event) => {
      if (!contenedor.current?.contains(evento.target as Node)) fijarAbierto(false);
    };
    const cerrarConEscape = (evento: globalThis.KeyboardEvent) => {
      if (evento.key !== 'Escape') return;
      fijarAbierto(false);
      disparador.current?.focus();
    };
    document.addEventListener('mousedown', cerrarSiQuedaFuera);
    document.addEventListener('focusin', cerrarSiQuedaFuera);
    document.addEventListener('keydown', cerrarConEscape);
    return () => {
      document.removeEventListener('mousedown', cerrarSiQuedaFuera);
      document.removeEventListener('focusin', cerrarSiQuedaFuera);
      document.removeEventListener('keydown', cerrarConEscape);
    };
  }, [abierto]);
  return { abierto, fijarAbierto, contenedor, disparador };
}

function enfocarCasilla(lista: HTMLElement | null, posicion: number): void {
  lista?.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')[posicion]?.focus();
}

function ListaCasillas({ etiqueta, opciones, marcadas, alAlternar, alSalirArriba, doble = false }: {
  etiqueta: string;
  opciones: Opcion[];
  marcadas: Set<number>;
  alAlternar: (valor: number) => void;
  alSalirArriba?: () => void;
  doble?: boolean;
}) {
  const [activa, fijarActiva] = useState(0);
  const posicionActiva = Math.min(activa, opciones.length - 1);
  const moverFoco = (evento: KeyboardEvent<HTMLUListElement>) => {
    const paso = PASO_FLECHA[evento.key];
    if (!paso) return;
    evento.preventDefault();
    const casillas = [...evento.currentTarget.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')];
    const destino = casillas.indexOf(evento.target as HTMLInputElement) + paso;
    if (destino < 0) alSalirArriba?.();
    else casillas[Math.min(destino, casillas.length - 1)].focus();
  };
  const clase = doble ? 'lista-casillas lista-casillas-doble' : 'lista-casillas';
  return (
    <ul className={clase} aria-label={etiqueta} onKeyDown={moverFoco}>
      {opciones.map((opcion, posicion) => (
        <li key={opcion.valor}>
          <label className="casilla">
            <input
              type="checkbox"
              tabIndex={posicion === posicionActiva ? 0 : -1}
              checked={marcadas.has(opcion.valor)}
              onChange={() => alAlternar(opcion.valor)}
              onFocus={() => fijarActiva(posicion)}
            />
            {opcion.codigo ? <b className="casilla-codigo">{opcion.codigo}</b> : null}
            <span>{opcion.texto}</span>
          </label>
        </li>
      ))}
    </ul>
  );
}

function Desplegable({ etiqueta, resumen, children }: { etiqueta: string; resumen: string; children?: ReactNode }) {
  const { abierto, fijarAbierto, contenedor, disparador } = useDesplegable<HTMLButtonElement>();
  const id = useId();
  return (
    <div className="campo" ref={contenedor}>
      <label className="campo-etiqueta" id={`${id}-etiqueta`} htmlFor={`${id}-boton`}>{etiqueta}</label>
      <button
        type="button"
        id={`${id}-boton`}
        ref={disparador}
        className="desplegable-boton"
        aria-expanded={abierto}
        aria-controls={abierto ? `${id}-panel` : undefined}
        aria-labelledby={`${id}-etiqueta ${id}-boton`}
        onClick={() => fijarAbierto(!abierto)}
      >
        {resumen}
      </button>
      {abierto ? <div className="desplegable-panel" id={`${id}-panel`}>{children}</div> : null}
    </div>
  );
}

function AccionesPanel({ acciones }: { acciones: { texto: string; alPulsar: () => void }[] }) {
  return (
    <div className="desplegable-acciones">
      {acciones.map(({ texto, alPulsar }) => <button key={texto} type="button" className="boton-secundario" onClick={alPulsar}>{texto}</button>)}
    </div>
  );
}

function SegmentadoTipo({ tipos, valor, alCambiar }: { tipos: TipoPeriodo[]; valor: string; alCambiar: (tipo: string) => void }) {
  const idEtiqueta = useId();
  return (
    <div className="campo">
      <span className="campo-etiqueta" id={idEtiqueta}>Tipo de periodo</span>
      <div className="segmentado" role="group" aria-labelledby={idEtiqueta}>
        {tipos.map(tipo => (
          <button key={tipo.clave} type="button" aria-pressed={tipo.clave === valor} onClick={() => alCambiar(tipo.clave)}>{tipo.etiqueta}</button>
        ))}
      </div>
    </div>
  );
}

function resumenPeriodos(seleccion: number[], opciones: number[], codigos: string[]): string {
  if (!seleccion.length) return 'Ninguno';
  if (seleccion.length === opciones.length) return 'Todos';
  return seleccion.length === 1 ? codigos[seleccion[0]] : `${seleccion.length} seleccionados`;
}

function SelectorPeriodos({ codigos, opciones, seleccion, alCambiar }: {
  codigos: string[];
  opciones: number[];
  seleccion: number[];
  alCambiar: (periodos: number[]) => void;
}) {
  const marcadas = new Set(seleccion);
  const acciones = [{ texto: 'Todos', alPulsar: () => alCambiar(opciones.slice()) }, { texto: 'Ninguno', alPulsar: () => alCambiar([]) }];
  return (
    <Desplegable etiqueta="Periodos" resumen={resumenPeriodos(seleccion, opciones, codigos)}>
      <AccionesPanel acciones={acciones} />
      <ListaCasillas
        etiqueta="Periodos"
        opciones={opciones.map(periodo => ({ valor: periodo, texto: codigos[periodo] }))}
        marcadas={marcadas}
        alAlternar={periodo => alCambiar(ordenarNumeros(alternar(seleccion, periodo)))}
        doble
      />
    </Desplegable>
  );
}

function SelectorMultiple({ etiqueta, opciones, nombres, seleccion, alCambiar }: {
  etiqueta: string;
  opciones: number[];
  nombres: string[];
  seleccion: number[];
  alCambiar: (seleccion: number[]) => void;
}) {
  const [consulta, fijarConsulta] = useState('');
  const marcadas = new Set(seleccion);
  const resumen = !seleccion.length ? 'Todas' : seleccion.length === 1 ? nombres[seleccion[0]] : `${seleccion.length} seleccionadas`;
  const visibles = useMemo(() => {
    const texto = normalizarBusqueda(consulta.trim());
    const filtradas = texto ? opciones.filter(opcion => normalizarBusqueda(nombres[opcion]).includes(texto)) : opciones;
    return filtradas.map(opcion => ({ valor: opcion, texto: nombres[opcion] }));
  }, [consulta, opciones, nombres]);
  return (
    <Desplegable etiqueta={etiqueta} resumen={resumen}>
      {opciones.length > OPCIONES_PARA_BUSCAR
        ? (
          <input
            type="search"
            className="entrada entrada-panel"
            placeholder="Buscar"
            aria-label={`Buscar en ${etiqueta.toLowerCase()}`}
            value={consulta}
            onChange={evento => fijarConsulta(evento.target.value)}
          />
        )
        : null}
      <AccionesPanel acciones={[{ texto: 'Limpiar', alPulsar: () => alCambiar([]) }]} />
      {visibles.length
        ? <ListaCasillas etiqueta={etiqueta} opciones={visibles} marcadas={marcadas} alAlternar={valor => alCambiar(alternar(seleccion, valor))} />
        : <p className="desplegable-aviso">{TEXTOS.sinCoincidencias}</p>}
    </Desplegable>
  );
}

function PanelResultados({ id, panel, cantidad, visibles, seleccion, alCambiar, alSalirArriba }: {
  id: string;
  panel: RefObject<HTMLDivElement>;
  cantidad: number;
  visibles: Opcion[];
  seleccion: number[];
  alCambiar: (seleccion: number[]) => void;
  alSalirArriba: () => void;
}) {
  return (
    <div className="desplegable-panel" id={`${id}-panel`} ref={panel} role="dialog" aria-label={ETIQUETA_RESULTADOS}>
      <p className="desplegable-aviso" id={`${id}-estado`} role="status">{TEXTOS.coincidencias(cantidad, LIMITE_RESULTADOS)}</p>
      {visibles.length
        ? (
          <ListaCasillas
            etiqueta="Asignaturas encontradas"
            opciones={visibles}
            marcadas={new Set(seleccion)}
            alAlternar={asignatura => alCambiar(alternar(seleccion, asignatura))}
            alSalirArriba={alSalirArriba}
          />
        )
        : null}
    </div>
  );
}

function BuscadorAsignaturas({ modelo, opciones, seleccion, alCambiar }: {
  modelo: Modelo;
  opciones: number[];
  seleccion: number[];
  alCambiar: (seleccion: number[]) => void;
}) {
  const { abierto, fijarAbierto, contenedor, disparador } = useDesplegable<HTMLInputElement>();
  const [consulta, fijarConsulta] = useState('');
  const panel = useRef<HTMLDivElement>(null);
  const id = useId();
  const coincidencias = useMemo(() => {
    const texto = normalizarBusqueda(consulta.trim());
    return texto ? opciones.filter(asignatura => modelo.busquedaAsignatura[asignatura].includes(texto)) : opciones;
  }, [consulta, opciones, modelo]);
  const visibles = coincidencias.slice(0, LIMITE_RESULTADOS).map(asignatura => ({
    valor: asignatura,
    codigo: modelo.codigos.asignatura[asignatura],
    texto: modelo.nombres.asignatura[asignatura]
  }));
  const alPulsarTecla = (evento: KeyboardEvent<HTMLInputElement>) => {
    if (evento.key !== 'ArrowDown') return;
    evento.preventDefault();
    if (!abierto) fijarAbierto(true);
    else enfocarCasilla(panel.current, 0);
  };
  const alEscribir = (evento: ChangeEvent<HTMLInputElement>) => {
    fijarConsulta(evento.target.value);
    if (evento.target.value.trim()) fijarAbierto(true);
  };
  return (
    <div className="campo campo-buscador" ref={contenedor}>
      <label className="campo-etiqueta" htmlFor={id}>{seleccion.length ? `Asignaturas (${seleccion.length})` : 'Asignaturas'}</label>
      <input
        id={id}
        ref={disparador}
        type="search"
        role="combobox"
        className="entrada"
        placeholder="Código o nombre"
        autoComplete="off"
        aria-haspopup="dialog"
        aria-expanded={abierto}
        aria-controls={abierto ? `${id}-panel` : undefined}
        aria-describedby={abierto ? `${id}-estado` : undefined}
        value={consulta}
        onClick={() => fijarAbierto(true)}
        onKeyDown={alPulsarTecla}
        onChange={alEscribir}
      />
      {abierto
        ? (
          <PanelResultados
            id={id}
            panel={panel}
            cantidad={coincidencias.length}
            visibles={visibles}
            seleccion={seleccion}
            alCambiar={alCambiar}
            alSalirArriba={() => disparador.current?.focus()}
          />
        )
        : null}
    </div>
  );
}

export function PanelFiltros({ modelo, filtros, opciones, alCambiar, zona, children }: {
  modelo: Modelo;
  filtros: Filtros;
  opciones: Opciones;
  alCambiar: (cambios: Partial<Filtros>) => void;
  zona: RefObject<HTMLElement>;
  children?: ReactNode;
}) {
  return (
    <section className="panel-filtros" aria-label="Filtros" ref={zona}>
      <div className="rejilla-filtros">
        <SegmentadoTipo tipos={modelo.tiposPeriodo} valor={filtros.tipo} alCambiar={tipo => alCambiar({ tipo })} />
        <SelectorPeriodos
          codigos={modelo.periodos}
          opciones={periodosDeTipo(modelo, filtros.tipo)}
          seleccion={filtros.periodos}
          alCambiar={periodos => alCambiar({ periodos })}
        />
        <SelectorMultiple
          etiqueta="Sedes" opciones={opciones.sedes} nombres={modelo.nombres.sede}
          seleccion={filtros.sedes} alCambiar={sedes => alCambiar({ sedes })}
        />
        <SelectorMultiple
          etiqueta="Facultades" opciones={opciones.facultades} nombres={modelo.nombres.facultad}
          seleccion={filtros.facultades} alCambiar={facultades => alCambiar({ facultades })}
        />
        <SelectorMultiple
          etiqueta="Unidades académicas básicas" opciones={opciones.uabs} nombres={modelo.nombres.uab}
          seleccion={filtros.uabs} alCambiar={uabs => alCambiar({ uabs })}
        />
        <BuscadorAsignaturas
          modelo={modelo} opciones={opciones.asignaturas}
          seleccion={filtros.asignaturas} alCambiar={asignaturas => alCambiar({ asignaturas })}
        />
      </div>
      {children}
    </section>
  );
}
