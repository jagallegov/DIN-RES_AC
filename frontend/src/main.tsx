import './estilos/tablero.css';
import type { Aplicacion } from './componentes/App';
import { TEXTOS } from './dominio/definiciones';
import { formatearHora } from './dominio/formato';
import { columnasInconsistentes, crearModelo, type DatosTablero, type Modelo } from './dominio/modelo';

const RUTA_DATOS = 'api/datos';
const RUTA_ESTADO = 'api/estado';
const ESPERA_REINTENTO_MS = 5000;
const INTERVALO_ESTADO_MS = 15000;
const ESTADOS_SIN_SERVICIO = [502, 504];

type Conexion = 'conectado' | 'reconectando' | 'sinBase';

const raiz = document.getElementById('raiz') as HTMLElement;
const avisoConexion = document.getElementById('estado-conexion') as HTMLElement;

let aplicacion: Aplicacion | null = null;
let versionMostrada: number | null = null;
let versionConocida: number | null = null;
let cargaPendiente: Promise<void> | null = null;
let reintento: ReturnType<typeof setTimeout> | null = null;
let conexion: Conexion | null = null;
let consultando = false;

class ErrorVisible extends Error {
  titulo: string;
  ayuda: string;
  detalle: string | null | undefined;
  transitorio: boolean;

  constructor(titulo: string, ayuda: string, detalle?: string | null, { transitorio = false } = {}) {
    super(detalle ?? titulo);
    this.titulo = titulo;
    this.ayuda = ayuda;
    this.detalle = detalle;
    this.transitorio = transitorio;
  }
}

const mensajeDe = (error: unknown) => (error instanceof Error ? error.message : String(error));

function informarConexion(estado: string, texto: string): void {
  avisoConexion.dataset.estado = estado;
  avisoConexion.textContent = texto;
}

function cambiarConexion(nueva: Conexion): boolean {
  if (nueva === conexion) return false;
  conexion = nueva;
  if (nueva === 'conectado') informarConexion('conectado', TEXTOS.conexion.conectado);
  else informarConexion('reconectando', nueva === 'sinBase' ? TEXTOS.conexion.sinBase : TEXTOS.conexion.reconectando);
  return true;
}

function mostrarError({ titulo, ayuda, detalle }: ErrorVisible): void {
  aplicacion?.desmontar();
  aplicacion = null;
  const aviso = document.createElement('div');
  aviso.className = 'aviso-error';
  aviso.setAttribute('role', 'alert');
  const encabezado = document.createElement('h2');
  encabezado.textContent = titulo;
  const explicacion = document.createElement('p');
  explicacion.textContent = ayuda;
  aviso.append(encabezado, explicacion);
  if (detalle) {
    const tecnico = document.createElement('code');
    tecnico.textContent = detalle;
    aviso.append(tecnico);
  }
  raiz.replaceChildren(aviso);
  raiz.dataset.estado = 'error';
}

async function pedirDatos(): Promise<DatosTablero> {
  let respuesta: Response;
  try {
    respuesta = await fetch(RUTA_DATOS, { cache: 'no-cache' });
  } catch (error) {
    throw new ErrorVisible(TEXTOS.errorDatos, TEXTOS.ayudaServicio, mensajeDe(error), { transitorio: true });
  }
  if (respuesta.status === 503) {
    throw new ErrorVisible(TEXTOS.errorBase, TEXTOS.ayudaBase, `HTTP 503 al solicitar ${RUTA_DATOS}`, { transitorio: true });
  }
  if (!respuesta.ok) {
    const transitorio = ESTADOS_SIN_SERVICIO.includes(respuesta.status);
    throw new ErrorVisible(TEXTOS.errorDatos, TEXTOS.ayudaServicio, `HTTP ${respuesta.status} al solicitar ${RUTA_DATOS}`, { transitorio });
  }
  return respuesta.json();
}

function prepararModelo({ meta, registros }: DatosTablero): Modelo {
  if (!meta?.filas) throw new ErrorVisible(TEXTOS.sinCarga, TEXTOS.ayudaSinCarga);
  const inconsistentes = columnasInconsistentes(meta, registros);
  if (inconsistentes.length) {
    throw new ErrorVisible(TEXTOS.errorConsistencia, TEXTOS.ayudaConsistencia, TEXTOS.columnasInconsistentes(meta.filas, inconsistentes));
  }
  return crearModelo(meta, registros);
}

async function mostrar(datos: DatosTablero): Promise<void> {
  versionMostrada = datos?.meta?.version ?? null;
  const modelo = prepararModelo(datos);
  if (aplicacion) {
    aplicacion.actualizar(modelo);
    return;
  }
  const { montarAplicacion } = await import('./componentes/App');
  raiz.replaceChildren();
  aplicacion = montarAplicacion(raiz, modelo, {
    alMontar: () => { raiz.dataset.estado = 'listo'; },
    alFallar: () => { raiz.dataset.estado = 'error'; }
  });
}

async function cargar(): Promise<boolean> {
  const habiaAplicacion = Boolean(aplicacion);
  try {
    await mostrar(await pedirDatos());
    if (habiaAplicacion && aplicacion) informarConexion('actualizado', TEXTOS.conexion.actualizado(formatearHora(new Date())));
    return true;
  } catch (error) {
    console.error(error);
    const transitorio = error instanceof ErrorVisible && error.transitorio;
    if (transitorio) programarReintento();
    if (habiaAplicacion && transitorio) {
      informarConexion('error', TEXTOS.conexion.sinActualizar);
      return false;
    }
    mostrarError(error instanceof ErrorVisible ? error : new ErrorVisible(TEXTOS.errorInicio, TEXTOS.ayudaInicio, mensajeDe(error)));
    return false;
  }
}

function programarReintento(): void {
  if (reintento) return;
  reintento = setTimeout(() => {
    reintento = null;
    solicitarCarga();
  }, ESPERA_REINTENTO_MS);
}

function solicitarCarga(): Promise<void> {
  if (!cargaPendiente) {
    cargaPendiente = cargar().then(cargada => {
      cargaPendiente = null;
      if (cargada && versionConocida !== null && versionConocida !== versionMostrada && raiz.dataset.estado !== 'error') solicitarCarga();
    });
  }
  return cargaPendiente;
}

async function consultarEstado(): Promise<void> {
  let respuesta: Response;
  try {
    respuesta = await fetch(RUTA_ESTADO, { cache: 'no-store' });
  } catch {
    cambiarConexion('reconectando');
    return;
  }
  if (respuesta.status === 503) {
    cambiarConexion('sinBase');
    return;
  }
  let version: unknown;
  try {
    if (!respuesta.ok) throw new Error(`HTTP ${respuesta.status} al solicitar ${RUTA_ESTADO}`);
    ({ version } = await respuesta.json());
  } catch {
    cambiarConexion('reconectando');
    return;
  }
  if (cambiarConexion('conectado') && raiz.dataset.estado !== 'listo') solicitarCarga();
  if (typeof version !== 'number') return;
  versionConocida = version;
  if (versionConocida !== versionMostrada) solicitarCarga();
}

async function vigilarUnaVez(): Promise<void> {
  if (consultando) return;
  consultando = true;
  try {
    await consultarEstado();
  } catch (error) {
    console.error(error);
  } finally {
    consultando = false;
  }
}

function vigilarCambios(): void {
  vigilarUnaVez();
  setInterval(vigilarUnaVez, INTERVALO_ESTADO_MS);
}

solicitarCarga();
vigilarCambios();
