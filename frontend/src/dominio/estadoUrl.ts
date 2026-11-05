import { JERARQUIA, SECCIONES, type Nivel } from './definiciones';
import { ordenarNumeros } from './formato';
import { periodosDeTipo, type Modelo } from './modelo';
import { depurarFiltros, estadoInicial, type Filtros } from './seleccion';

const SEPARADOR_VALORES = ',';
const SEPARADOR_UAB = '.';
const CLAVES_ESTADO = ['seccion', 'tipo', 'periodos', ...JERARQUIA.map(({ campo }) => campo)];

export interface EstadoVista {
  seccion: string;
  filtros: Filtros;
}

function claveDe(modelo: Modelo, nivel: Nivel, id: number): string {
  if (nivel !== 'uab') return modelo.codigos[nivel][id];
  return modelo.codigos.facultad[modelo.facultadDeUab[id]] + SEPARADOR_UAB + modelo.codigos.uab[id];
}

function decodificar(texto: string): string | null {
  try {
    return decodeURIComponent(texto);
  } catch {
    return null;
  }
}

function incluyeTodosLosPeriodos(periodos: number[], delTipo: number[]): boolean {
  const elegidos = new Set(periodos);
  return elegidos.size === delTipo.length && delTipo.every(periodo => elegidos.has(periodo));
}

export function serializarEstado(modelo: Modelo, seccion: string, filtros: Filtros): string {
  const partes: [string, string[]][] = [['seccion', [seccion]], ['tipo', [filtros.tipo]]];
  if (!incluyeTodosLosPeriodos(filtros.periodos, periodosDeTipo(modelo, filtros.tipo))) {
    partes.push(['periodos', ordenarNumeros(filtros.periodos).map(periodo => modelo.periodos[periodo])]);
  }
  JERARQUIA.forEach(({ campo, nivel }) => {
    if (filtros[campo].length) partes.push([campo, filtros[campo].map(id => claveDe(modelo, nivel, id))]);
  });
  return partes.map(([clave, valores]) => `${clave}=${valores.map(encodeURIComponent).join(SEPARADOR_VALORES)}`).join('&');
}

function leerParametros(hash: string | null | undefined): Map<string | null, (string | null)[]> {
  const parametros = new Map<string | null, (string | null)[]>();
  (hash ?? '').replace(/^#/, '').split('&').forEach(parte => {
    const separador = parte.indexOf('=');
    if (separador < 1) return;
    const valores = parte.slice(separador + 1).split(SEPARADOR_VALORES).filter(Boolean).map(decodificar);
    parametros.set(decodificar(parte.slice(0, separador)), valores);
  });
  return parametros;
}

export function tieneEstado(hash: string | null | undefined): boolean {
  const parametros = leerParametros(hash);
  return CLAVES_ESTADO.some(clave => parametros.has(clave));
}

function traducirClaves(modelo: Modelo, nivel: Nivel, claves: (string | null)[]): number[] {
  const idPorClave = new Map(modelo.codigos[nivel].map((_, id) => [claveDe(modelo, nivel, id), id]));
  return [...new Set(claves.map(clave => idPorClave.get(clave as string)).filter((id): id is number => id !== undefined))];
}

function leerPeriodos(modelo: Modelo, tipo: string, pedidos: (string | null)[]): number[] {
  const delTipo = periodosDeTipo(modelo, tipo);
  const validos = delTipo.filter(periodo => pedidos.includes(modelo.periodos[periodo]));
  return validos.length || !pedidos.length ? validos : delTipo.slice();
}

export function leerEstado(modelo: Modelo, hash: string | null | undefined): EstadoVista {
  const parametros = leerParametros(hash);
  const primerValor = (clave: string) => parametros.get(clave)?.[0];
  const seccion = SECCIONES.some(candidata => candidata.id === primerValor('seccion')) ? primerValor('seccion') as string : SECCIONES[0].id;
  const tipo = modelo.tiposPeriodo.some(candidato => candidato.clave === primerValor('tipo')) ? primerValor('tipo') as string : modelo.tipoPorDefecto;
  const filtros = estadoInicial(modelo, tipo);
  if (parametros.has('periodos')) filtros.periodos = leerPeriodos(modelo, tipo, parametros.get('periodos') as (string | null)[]);
  JERARQUIA.forEach(({ campo, nivel }) => {
    if (parametros.has(campo)) filtros[campo] = traducirClaves(modelo, nivel, parametros.get(campo) as (string | null)[]);
  });
  return { seccion, filtros: depurarFiltros(modelo, filtros) };
}
