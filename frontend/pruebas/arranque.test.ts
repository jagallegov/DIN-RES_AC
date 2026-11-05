// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { TEXTOS } from '../src/dominio/definiciones';

const app = vi.hoisted(() => ({ montajes: [] as any[], actualizaciones: [] as any[] }));

vi.mock('../src/componentes/App', () => ({
  montarAplicacion: (_: unknown, modelo: any, { alMontar }: any) => {
    app.montajes.push(modelo);
    alMontar();
    return { actualizar: (nuevo: any) => app.actualizaciones.push(nuevo), desmontar: () => {} };
  }
}));

const leerJson = (ruta: string) => JSON.parse(readFileSync(new URL(ruta, import.meta.url), 'utf8'));
const meta = leerJson('./datos/meta.json');
const registros = leerJson('./datos/registros.json');
const datosVersion = (version: number) => ({ meta: { ...meta, version, actualizado: '2026-10-07T14:44:12-05:00' }, registros });
const json = (cuerpo: unknown, status = 200) => new Response(JSON.stringify(cuerpo), { status, headers: { 'Content-Type': 'application/json' } });
const sinBase = () => json({ detalle: 'No fue posible consultar la base de datos.' }, 503);

let solicitudes: { ruta: string; opciones: RequestInit | undefined }[];
let rutas: Record<string, () => Response>;

function preparar() {
  vi.resetModules();
  vi.useFakeTimers();
  Object.assign(app, { montajes: [], actualizaciones: [] });
  document.body.innerHTML = '<p id="estado-conexion" class="estado-conexion" role="status"></p><div id="raiz" data-estado="cargando"><p>Cargando datos</p></div>';
  solicitudes = [];
  rutas = {
    'api/datos': () => json(datosVersion(7)),
    'api/estado': () => json({ version: 7, actualizado: '2026-10-07T14:44:12-05:00' })
  };
  globalThis.fetch = vi.fn(async (ruta: any, opciones?: RequestInit) => {
    solicitudes.push({ ruta, opciones });
    return rutas[ruta]();
  }) as any;
}

const iniciar = () => import('../src/main');
const raiz = () => document.getElementById('raiz') as HTMLElement;
const linea = () => document.getElementById('estado-conexion') as HTMLElement;
const cuantas = (ruta: string) => solicitudes.filter(solicitud => solicitud.ruta === ruta).length;
const siguienteConsulta = () => vi.advanceTimersByTimeAsync(15000);
const esperaReal = globalThis.setTimeout;

async function hasta(condicion: () => boolean): Promise<void> {
  for (let intento = 0; intento < 400; intento++) {
    if (condicion()) return;
    await new Promise(resolver => esperaReal(resolver, 5));
  }
  throw new Error('La condición no se cumplió a tiempo');
}

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
});

describe('arranque y vigilancia de cambios', () => {
  test('abre sin sesión, monta una vez y recarga cuando cambia la versión', async () => {
    preparar();
    await iniciar();
    await hasta(() => raiz().dataset.estado === 'listo');
    expect(app.montajes).toHaveLength(1);
    expect(app.montajes[0].version).toBe(7);
    expect(solicitudes.every(({ opciones }) => !new Headers(opciones?.headers).has('Authorization'))).toBe(true);
    expect(solicitudes.find(({ ruta }) => ruta === 'api/datos')?.opciones?.cache).toBe('no-cache');
    await hasta(() => linea().dataset.estado === 'conectado');
    expect(linea().textContent).toBe(TEXTOS.conexion.conectado);

    rutas['api/datos'] = () => json(datosVersion(8));
    rutas['api/estado'] = () => json({ version: 8 });
    await siguienteConsulta();
    await hasta(() => app.actualizaciones.length === 1);
    expect(app.montajes).toHaveLength(1);
    expect(app.actualizaciones[0].version).toBe(8);
    expect(linea().dataset.estado).toBe('actualizado');
    expect(linea().textContent).toMatch(/^Datos actualizados a las \d{2}:\d{2}:\d{2}\.$/);
    const textoActualizado = linea().textContent;

    await siguienteConsulta();
    expect(linea().textContent).toBe(textoActualizado);
    expect(app.actualizaciones).toHaveLength(1);
  });

  test('la consulta de estado se repite cada 15 segundos', async () => {
    preparar();
    await iniciar();
    await hasta(() => linea().dataset.estado === 'conectado');
    const consultas = cuantas('api/estado');
    await vi.advanceTimersByTimeAsync(14999);
    expect(cuantas('api/estado')).toBe(consultas);
    await vi.advanceTimersByTimeAsync(1);
    expect(cuantas('api/estado')).toBe(consultas + 1);
    expect(solicitudes.find(({ ruta }) => ruta === 'api/estado')?.opciones?.cache).toBe('no-store');
  });

  test('la línea de conexión solo cambia cuando cambia el estado de la conexión', async () => {
    preparar();
    await iniciar();
    await hasta(() => linea().dataset.estado === 'conectado');

    rutas['api/estado'] = sinBase;
    await siguienteConsulta();
    expect(linea().dataset.estado).toBe('reconectando');
    expect(linea().textContent).toBe(TEXTOS.conexion.sinBase);

    rutas['api/estado'] = () => json({ version: 7 });
    await siguienteConsulta();
    expect(linea().dataset.estado).toBe('conectado');
    expect(linea().textContent).toBe(TEXTOS.conexion.conectado);
    expect(app.actualizaciones).toHaveLength(0);

    rutas['api/estado'] = () => { throw new TypeError('Failed to fetch'); };
    await siguienteConsulta();
    expect(linea().dataset.estado).toBe('reconectando');
    expect(linea().textContent).toBe(TEXTOS.conexion.reconectando);

    rutas['api/estado'] = () => json({}, 502);
    await siguienteConsulta();
    expect(linea().textContent).toBe(TEXTOS.conexion.reconectando);

    rutas['api/estado'] = () => json({ version: 7 });
    await siguienteConsulta();
    expect(linea().textContent).toBe(TEXTOS.conexion.conectado);
    expect(app.montajes).toHaveLength(1);
  });

  test('con la base caída al inicio reintenta a los 5 segundos y carga cuando vuelve', async () => {
    preparar();
    rutas['api/datos'] = sinBase;
    rutas['api/estado'] = sinBase;
    await iniciar();
    await hasta(() => raiz().dataset.estado === 'error');
    expect(raiz().querySelector('h2')?.textContent).toBe(TEXTOS.errorBase);
    expect(raiz().querySelector('p')?.textContent).toBe(TEXTOS.ayudaBase);
    expect(linea().textContent).toBe(TEXTOS.conexion.sinBase);
    const pedidas = cuantas('api/datos');
    rutas['api/datos'] = () => json(datosVersion(7));
    await vi.advanceTimersByTimeAsync(4999);
    expect(cuantas('api/datos')).toBe(pedidas);
    await vi.advanceTimersByTimeAsync(1);
    await hasta(() => raiz().dataset.estado === 'listo');
    expect(cuantas('api/datos')).toBe(pedidas + 1);
    expect(app.montajes).toHaveLength(1);
  });

  test('un 502 del proxy al pedir datos se reintenta como falla transitoria', async () => {
    preparar();
    rutas['api/datos'] = () => json({}, 502);
    await iniciar();
    await hasta(() => raiz().dataset.estado === 'error');
    expect(raiz().querySelector('h2')?.textContent).toBe(TEXTOS.errorDatos);
    expect(raiz().querySelector('code')?.textContent).toBe('HTTP 502 al solicitar api/datos');
    rutas['api/datos'] = () => json(datosVersion(7));
    await vi.advanceTimersByTimeAsync(5000);
    await hasta(() => raiz().dataset.estado === 'listo');
  });

  test('si falla la recarga se conservan los datos, se avisa y se reintenta', async () => {
    preparar();
    await iniciar();
    await hasta(() => raiz().dataset.estado === 'listo');
    rutas['api/estado'] = () => json({ version: 8 });
    rutas['api/datos'] = sinBase;
    await siguienteConsulta();
    await hasta(() => linea().dataset.estado === 'error');
    expect(linea().textContent).toBe(TEXTOS.conexion.sinActualizar);
    expect(raiz().dataset.estado).toBe('listo');
    expect(app.actualizaciones).toHaveLength(0);
    rutas['api/datos'] = () => json(datosVersion(8));
    await vi.advanceTimersByTimeAsync(5000);
    await hasta(() => app.actualizaciones.length === 1);
    expect(linea().dataset.estado).toBe('actualizado');
  });

  test('sin registros muestra el aviso de carga y no vuelve a pedir datos mientras no cambie la versión', async () => {
    preparar();
    rutas['api/datos'] = () => json({ meta: { ...meta, filas: 0, version: 3 }, registros: {} });
    rutas['api/estado'] = () => json({ version: 3 });
    await iniciar();
    await hasta(() => raiz().dataset.estado === 'error');
    expect(raiz().querySelector('h2')?.textContent).toBe(TEXTOS.sinCarga);
    expect(raiz().querySelector('p')?.textContent).toBe(TEXTOS.ayudaSinCarga);
    const pedidas = cuantas('api/datos');
    await siguienteConsulta();
    await siguienteConsulta();
    expect(cuantas('api/datos')).toBe(pedidas);
  });

  test('datos con columnas de distinto largo muestran el aviso de consistencia', async () => {
    preparar();
    rutas['api/datos'] = () => json({ meta: { ...meta, version: 4 }, registros: { ...registros, cupos: registros.cupos.slice(1) } });
    rutas['api/estado'] = () => json({ version: 4 });
    await iniciar();
    await hasta(() => raiz().dataset.estado === 'error');
    expect(raiz().querySelector('h2')?.textContent).toBe(TEXTOS.errorConsistencia);
    expect(raiz().querySelector('code')?.textContent).toBe('Columnas con una longitud distinta de 45.032: cupos.');
  });
});
