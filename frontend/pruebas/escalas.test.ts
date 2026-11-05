import { describe, test } from 'vitest';
import assert from 'node:assert/strict';
import { CANTIDAD_TONOS, escalaDeTonos, type Escala } from '../src/dominio/escalas';
import { TONOS_MAPA } from '../src/dominio/graficos';

const tonosDe = (valores: number[]) => {
  const escala = escalaDeTonos(valores) as Escala;
  return valores.map(valor => escala.tonoDe(valor));
};

describe('cortes del mapa de calor', () => {
  test('la paleta del mapa tiene un color por tono', () => {
    assert.equal(TONOS_MAPA.length, CANTIDAD_TONOS);
  });

  test('sin valores no hay escala', () => {
    assert.equal(escalaDeTonos([]), null);
  });

  test('una celda usa el tono medio', () => {
    const escala = escalaDeTonos([42]) as Escala;
    assert.equal(escala.modo, 'unico');
    assert.equal(escala.tonoDe(42), 2);
    assert.deepEqual(escala.tonos, [{ indice: 2, desde: 42, hasta: 42 }]);
  });

  test('varias celdas con el mismo valor usan el tono medio', () => {
    assert.deepEqual(tonosDe([7, 7, 7]), [2, 2, 2]);
  });

  test('dos celdas quedan en los extremos de la escala', () => {
    const escala = escalaDeTonos([10, 90]) as Escala;
    assert.equal(escala.modo, 'lineal');
    assert.deepEqual(tonosDe([10, 90]), [0, 4]);
  });

  test('con menos de cinco valores distintos los tonos se reparten de forma lineal', () => {
    const valores = [1, 20, 50, 99];
    const escala = escalaDeTonos(valores) as Escala;
    assert.equal(escala.modo, 'lineal');
    assert.deepEqual(tonosDe(valores), [0, 0, 2, 4]);
    assert.equal(escala.tonos.length, 5);
    const esperados = [1, 20.6, 40.2, 59.8, 79.4];
    escala.tonos.forEach((tono, posicion) => assert.ok(Math.abs(tono.desde - esperados[posicion]) < 1e-9));
    assert.equal(escala.tonos[4].hasta, 99);
  });

  test('cinco valores distintos ocupan los cinco tonos', () => {
    const valores = [3, 1, 5, 2, 4];
    const escala = escalaDeTonos(valores) as Escala;
    assert.equal(escala.modo, 'quintiles');
    assert.deepEqual(tonosDe(valores), [2, 0, 4, 1, 3]);
    assert.deepEqual(escala.tonos.map(tono => [tono.desde, tono.hasta]), [[1, 1], [2, 2], [3, 3], [4, 4], [5, 5]]);
  });

  test('veinte celdas se reparten por quintiles de cuatro valores', () => {
    const valores = Array.from({ length: 20 }, (_, posicion) => (posicion + 1) * 5);
    const tonos = tonosDe(valores);
    for (let tono = 0; tono < 5; tono++) assert.equal(tonos.filter(valor => valor === tono).length, 4);
    const rangos = (escalaDeTonos(valores) as Escala).tonos.map(tono => [tono.desde, tono.hasta]);
    assert.deepEqual(rangos, [[5, 20], [25, 40], [45, 60], [65, 80], [85, 100]]);
  });

  test('los empates en el mínimo no aplanan la escala', () => {
    const valores = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 25, 50, 75, 100];
    const tonos = tonosDe(valores);
    assert.deepEqual(tonos.slice(-5), [0, 1, 2, 3, 4]);
    assert.ok(tonos.slice(0, 12).every(tono => tono === 0));
    assert.equal(new Set(tonos).size, 5);
  });

  test('los empates con pocos valores distintos usan la escala lineal', () => {
    const valores = [0, 0, 0, 0, 0, 0, 10, 90];
    assert.equal((escalaDeTonos(valores) as Escala).modo, 'lineal');
    assert.deepEqual(tonosDe(valores), [0, 0, 0, 0, 0, 0, 0, 4]);
  });

  test('los cortes se calculan sobre los valores distintos', () => {
    const valores = [1, 2, 2, 2, 2, 2, 2, 3, 4, 5, 6];
    const escala = escalaDeTonos(valores) as Escala;
    assert.equal(escala.modo, 'quintiles');
    assert.deepEqual([1, 2, 3, 4, 5, 6].map(escala.tonoDe), [0, 1, 2, 3, 4, 4]);
    assert.deepEqual(escala.tonos.map(tono => [tono.desde, tono.hasta]), [[1, 1], [2, 2], [3, 3], [4, 4], [5, 6]]);
  });
});
