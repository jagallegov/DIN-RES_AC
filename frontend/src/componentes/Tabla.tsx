import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type RefObject } from 'react';
import { construirCsv } from '../dominio/csv';
import { TEXTOS, type IdIndicador, type Seccion } from '../dominio/definiciones';
import { COMPARADOR_ESPANOL, formatearEntero, normalizarBusqueda } from '../dominio/formato';
import { ICONOS } from '../dominio/iconos';
import { formatearIndicador, tituloConUnidad } from '../dominio/indicadores';
import type { Modelo } from '../dominio/modelo';
import type { FilaAsignatura as Fila } from '../dominio/series';
import { Icono, Tarjeta } from './Componentes';

const PASO = 300;
const UMBRALES_ESTUDIANTES = [1, 10];
const INDICADOR_ESTUDIANTES: Record<string, IdIndicador> = {
  oferta: 'inscritos',
  cancelaciones: 'matriculaFinal',
  aprobacion: 'matriculaConResultado'
};
const MARCAS_ORDEN = { ascending: '▲', descending: '▼' };
const DESPLAZAMIENTO_FILA: Record<string, number> = { ArrowDown: 1, ArrowUp: -1 };

type Sentido = 'ascending' | 'descending' | undefined;

interface Columna {
  clave: string;
  titulo: string;
  numerica: boolean;
  clase: string;
}

interface Orden {
  clave: string;
  ascendente: boolean;
}

function columnasDeTabla(indicadores: IdIndicador[]): Columna[] {
  return [
    { clave: 'codigo', titulo: 'Código', numerica: false, clase: 'celda-texto' },
    { clave: 'nombre', titulo: 'Asignatura', numerica: false, clase: 'celda-texto celda-amplia' },
    { clave: 'sede', titulo: 'Sede', numerica: false, clase: 'celda-texto celda-corta' },
    { clave: 'uab', titulo: 'Unidad académica básica', numerica: false, clase: 'celda-texto celda-amplia' },
    ...indicadores.map(id => ({ clave: id, titulo: tituloConUnidad(id), numerica: true, clase: 'celda-numero' }))
  ];
}

function ordenarFilas(filas: Fila[], { clave, ascendente }: Orden): Fila[] {
  return [...filas].sort((filaA, filaB) => {
    const valorA = filaA[clave];
    const valorB = filaB[clave];
    if (valorA == null || valorB == null) return Number(valorA == null) - Number(valorB == null);
    const diferencia = typeof valorA === 'string' ? COMPARADOR_ESPANOL.compare(valorA, valorB as string) : valorA - (valorB as number);
    return ascendente ? diferencia : -diferencia;
  });
}

function descargarCsv(nombreArchivo: string, columnas: Columna[], filas: Fila[]): void {
  const enlace = document.createElement('a');
  enlace.href = URL.createObjectURL(new Blob([construirCsv(columnas, filas)], { type: 'text/csv;charset=utf-8' }));
  enlace.download = `${nombreArchivo}.csv`;
  enlace.click();
  setTimeout(() => URL.revokeObjectURL(enlace.href), 2000);
}

function filaDestino(tecla: string, actual: number, cantidad: number): number | null {
  if (tecla in DESPLAZAMIENTO_FILA) return Math.min(Math.max(actual + DESPLAZAMIENTO_FILA[tecla], 0), cantidad - 1);
  if (tecla === 'Home') return 0;
  if (tecla === 'End') return cantidad - 1;
  return null;
}

const textoCelda = (columna: Columna, fila: Fila) => (
  columna.numerica ? formatearIndicador(columna.clave as IdIndicador, fila[columna.clave] as number | null) : fila[columna.clave]
);

function EncabezadoOrdenable({ columna, sentido, alOrdenar }: { columna: Columna; sentido: Sentido; alOrdenar: (columna: Columna) => void }) {
  return (
    <th scope="col" className={columna.clase} aria-sort={sentido}>
      <button type="button" className="boton-orden" onClick={() => alOrdenar(columna)}>
        {columna.titulo}
        <span className="marca-orden" aria-hidden="true">{(sentido && MARCAS_ORDEN[sentido]) ?? ''}</span>
      </button>
    </th>
  );
}

function FilaAsignatura({ fila, columnas, seleccionada, activa, alAlternar, alEnfocar }: {
  fila: Fila;
  columnas: Columna[];
  seleccionada: boolean;
  activa: boolean;
  alAlternar: (id: number) => void;
  alEnfocar: (id: number) => void;
}) {
  const alPulsarTecla = (evento: KeyboardEvent<HTMLTableRowElement>) => {
    if (evento.key !== 'Enter' && evento.key !== ' ') return;
    evento.preventDefault();
    alAlternar(fila.id);
  };
  const [primera, ...resto] = columnas;
  return (
    <tr
      className={seleccionada ? 'fila-seleccionada' : undefined}
      tabIndex={activa ? 0 : -1}
      aria-selected={seleccionada}
      onClick={() => alAlternar(fila.id)}
      onFocus={() => alEnfocar(fila.id)}
      onKeyDown={alPulsarTecla}
    >
      <th scope="row" className={primera.clase}>{textoCelda(primera, fila)}</th>
      {resto.map(columna => <td key={columna.clave} className={columna.clase}>{textoCelda(columna, fila)}</td>)}
    </tr>
  );
}

function PieTabla({ mostradas, total, alMostrarMas, alMostrarTodo }: { mostradas: number; total: number; alMostrarMas: () => void; alMostrarTodo: () => void }) {
  const restantes = total - mostradas;
  return (
    <div className="tabla-pie">
      <div className="tabla-pie-textos">
        <p role="status">{total ? TEXTOS.filasMostradas(mostradas, total) : TEXTOS.tablaSinCoincidencias}</p>
      </div>
      {restantes > 0
        ? (
          <div className="tabla-pie-acciones">
            <button type="button" className="boton-secundario" onClick={alMostrarMas}>{`Mostrar ${formatearEntero(Math.min(PASO, restantes))} más`}</button>
            <button type="button" className="boton-secundario" onClick={alMostrarTodo}>Mostrar todo</button>
          </div>
        )
        : null}
    </div>
  );
}

function FiltroEstudiantes({ minimo, alCambiar }: { minimo: number | null; alCambiar: (minimo: number | null) => void }) {
  return (
    <div className="filtro-estudiantes" role="group" aria-label="Filtrar asignaturas por número de estudiantes">
      {UMBRALES_ESTUDIANTES.map(umbral => (
        <button
          key={umbral}
          type="button"
          className="boton-secundario boton-alternable"
          aria-pressed={minimo === umbral}
          onClick={() => alCambiar(minimo === umbral ? null : umbral)}
        >
          {`Más de ${umbral} ${umbral === 1 ? 'estudiante' : 'estudiantes'}`}
        </button>
      ))}
    </div>
  );
}

function useEnfoquePendiente(cuerpo: RefObject<HTMLTableSectionElement>, alternativa: RefObject<HTMLInputElement>) {
  const pendiente = useRef<number | null>(null);
  useEffect(() => {
    const posicion = pendiente.current;
    if (posicion == null) return;
    pendiente.current = null;
    const contenedor = cuerpo.current as HTMLTableSectionElement;
    if (contenedor.contains(document.activeElement)) return;
    const filas = contenedor.rows;
    (filas[Math.min(posicion, filas.length - 1)] ?? alternativa.current)?.focus();
  });
  return pendiente;
}

export function TablaAsignaturas({ modelo, seccion, filas, seleccionadas, nombreArchivo, alAlternar }: {
  modelo: Modelo;
  seccion: Seccion;
  filas: Fila[];
  seleccionadas: Set<number>;
  nombreArchivo: string;
  alAlternar: (id: number) => void;
}) {
  const columnas = useMemo(() => columnasDeTabla(seccion.tabla), [seccion]);
  const [orden, fijarOrden] = useState<Orden>({ clave: seccion.tabla[0], ascendente: false });
  const [consulta, fijarConsulta] = useState('');
  const [minimo, fijarMinimo] = useState<number | null>(null);
  const [filaActiva, fijarFilaActiva] = useState<number | null>(null);
  const cuerpo = useRef<HTMLTableSectionElement>(null);
  const buscador = useRef<HTMLInputElement>(null);
  const enfoquePendiente = useEnfoquePendiente(cuerpo, buscador);
  const filtroSeleccion = seleccionadas.size ? seleccionadas : null;
  const ordenadas = useMemo(() => ordenarFilas(filas, orden), [filas, orden]);
  const claveEstudiantes = INDICADOR_ESTUDIANTES[seccion.id];
  const vista = useMemo(() => {
    const texto = normalizarBusqueda(consulta.trim());
    if (!texto && !filtroSeleccion && minimo == null) return ordenadas;
    return ordenadas.filter(fila => (!filtroSeleccion || filtroSeleccion.has(fila.id))
      && (!texto || modelo.busquedaAsignatura[fila.id].includes(texto))
      && (minimo == null || ((fila[claveEstudiantes] as number | null) ?? 0) > minimo));
  }, [ordenadas, filtroSeleccion, consulta, modelo, minimo, claveEstudiantes]);
  const filtrarSeleccion = Boolean(filtroSeleccion);
  const [ampliacion, fijarAmpliacion] = useState({ filas, consulta, filtrarSeleccion, minimo, limite: PASO });
  const ampliacionVigente = ampliacion.filas === filas && ampliacion.consulta === consulta
    && ampliacion.filtrarSeleccion === filtrarSeleccion && ampliacion.minimo === minimo;
  const limite = ampliacionVigente ? ampliacion.limite : PASO;
  const visibles = vista.slice(0, limite);
  const idActiva = visibles.some(fila => fila.id === filaActiva) ? filaActiva : visibles[0]?.id;

  const mostrarMas = () => {
    enfoquePendiente.current = limite;
    fijarAmpliacion({ filas, consulta, filtrarSeleccion, minimo, limite: limite + PASO });
  };
  const mostrarTodo = () => {
    enfoquePendiente.current = limite;
    fijarAmpliacion({ filas, consulta, filtrarSeleccion, minimo, limite: vista.length });
  };
  const alternarFila = (id: number) => {
    enfoquePendiente.current = visibles.findIndex(fila => fila.id === id);
    alAlternar(id);
  };
  const moverFoco = (evento: KeyboardEvent<HTMLTableSectionElement>) => {
    const filasVisibles = [...evento.currentTarget.rows];
    const destino = filaDestino(evento.key, filasVisibles.indexOf((evento.target as Element).closest('tr') as HTMLTableRowElement), filasVisibles.length);
    if (destino == null) return;
    evento.preventDefault();
    filasVisibles[destino].focus();
  };
  const ordenarPor = (columna: Columna) => fijarOrden(previo => ({
    clave: columna.clave,
    ascendente: previo.clave === columna.clave ? !previo.ascendente : !columna.numerica
  }));
  const sentidoDe = (columna: Columna): Sentido => {
    if (orden.clave !== columna.clave) return undefined;
    return orden.ascendente ? 'ascending' : 'descending';
  };
  const acciones = [
    <FiltroEstudiantes key="estudiantes" minimo={minimo} alCambiar={fijarMinimo} />,
    <input
      key="buscar"
      ref={buscador}
      type="search"
      className="entrada entrada-tabla"
      placeholder="Filtrar la tabla"
      aria-label="Filtrar la tabla de asignaturas"
      value={consulta}
      onChange={evento => fijarConsulta(evento.target.value)}
    />,
    <button
      key="csv"
      type="button"
      className="boton-icono"
      title="Descargar CSV"
      aria-label="Descargar la tabla de asignaturas en CSV"
      onClick={() => descargarCsv(nombreArchivo, columnas, vista)}
    >
      <Icono trazado={ICONOS.descargaCsv} />
    </button>
  ];

  return (
    <Tarjeta
      titulo="Asignaturas"
      acciones={acciones}
      pie={<PieTabla mostradas={visibles.length} total={vista.length} alMostrarMas={mostrarMas} alMostrarTodo={mostrarTodo} />}
    >
      <div className="tabla-contenedor" tabIndex={0} role="region" aria-label="Tabla de asignaturas, área desplazable">
        <table className="tabla" role="grid" aria-multiselectable aria-label="Asignaturas">
          <thead><tr>
            {columnas.map(columna => <EncabezadoOrdenable key={columna.clave} columna={columna} sentido={sentidoDe(columna)} alOrdenar={ordenarPor} />)}
          </tr></thead>
          <tbody ref={cuerpo} onKeyDown={moverFoco}>
            {visibles.map(fila => (
              <FilaAsignatura
                key={fila.id}
                fila={fila}
                columnas={columnas}
                seleccionada={seleccionadas.has(fila.id)}
                activa={fila.id === idActiva}
                alAlternar={alternarFila}
                alEnfocar={fijarFilaActiva}
              />
            ))}
          </tbody>
        </table>
      </div>
    </Tarjeta>
  );
}
