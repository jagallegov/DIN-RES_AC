import { ordenarNumeros } from './formato';

export const CANTIDAD_TONOS = 5;

const TONO_MEDIO = Math.floor(CANTIDAD_TONOS / 2);
const POSICIONES_TONO = Array.from({ length: CANTIDAD_TONOS }, (_, posicion) => posicion);

export type ModoEscala = 'unico' | 'quintiles' | 'lineal';

export interface Tono {
  indice: number;
  desde: number;
  hasta: number;
}

export interface Escala {
  modo: ModoEscala;
  tonos: Tono[];
  tonoDe: (valor: number) => number;
}

function tonoSegunCortes(cortes: number[]) {
  return (valor: number) => cortes.filter(corte => valor >= corte).length;
}

function escalaUnica(valor: number): Escala {
  return { modo: 'unico', tonos: [{ indice: TONO_MEDIO, desde: valor, hasta: valor }], tonoDe: () => TONO_MEDIO };
}

function escalaPorQuintiles(distintos: number[]): Escala {
  const limites = [...POSICIONES_TONO, CANTIDAD_TONOS].map(posicion => Math.floor(posicion * distintos.length / CANTIDAD_TONOS));
  const cortes = limites.slice(1, -1).map(limite => distintos[limite]);
  return {
    modo: 'quintiles',
    tonos: POSICIONES_TONO.map(indice => ({ indice, desde: distintos[limites[indice]], hasta: distintos[limites[indice + 1] - 1] })),
    tonoDe: tonoSegunCortes(cortes)
  };
}

function escalaLineal(minimo: number, maximo: number): Escala {
  const paso = (maximo - minimo) / CANTIDAD_TONOS;
  const limites = POSICIONES_TONO.map(posicion => minimo + posicion * paso).concat(maximo);
  return {
    modo: 'lineal',
    tonos: POSICIONES_TONO.map(indice => ({ indice, desde: limites[indice], hasta: limites[indice + 1] })),
    tonoDe: tonoSegunCortes(limites.slice(1, -1))
  };
}

export function escalaDeTonos(valores: number[]): Escala | null {
  const distintos = ordenarNumeros(new Set(valores));
  if (!distintos.length) return null;
  if (distintos.length === 1) return escalaUnica(distintos[0]);
  if (distintos.length < CANTIDAD_TONOS) return escalaLineal(distintos[0], distintos[distintos.length - 1]);
  return escalaPorQuintiles(distintos);
}
