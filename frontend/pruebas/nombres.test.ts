import { describe, test } from 'vitest';
import assert from 'node:assert/strict';
import { INDICADORES, calcular } from '../src/dominio/indicadores';
import { desambiguarNombres, rotuloAsignatura } from '../src/dominio/modelo';
import { estadoInicial } from '../src/dominio/seleccion';
import { elementosPorNivel } from '../src/dominio/series';
import { meta, modelo, posicionDe } from './datos_reales';

const contarRepetidos = (nombres: string[]) => nombres.length - new Set(nombres).size;

describe('desambiguación genérica', () => {
  const agregar = (contexto: string[]) => (etiqueta: string, posicion: number) => `${etiqueta} · ${contexto[posicion]}`;

  test('solo amplía los nombres repetidos', () => {
    const nombres = ['Derecho', 'Física', 'Derecho'];
    const resultado = desambiguarNombres(nombres, [agregar(['Bogotá', 'Bogotá', 'Medellín'])]);
    assert.deepEqual(resultado, ['Derecho · Bogotá', 'Física', 'Derecho · Medellín']);
  });

  test('usa el siguiente contexto solo si el anterior no basta', () => {
    const nombres = ['Química', 'Química', 'Química', 'Biología'];
    const facultades = ['Ciencias', 'Ciencias', 'Ingeniería', 'Ciencias'];
    const sedes = ['Bogotá', 'Medellín', 'Bogotá', 'Bogotá'];
    assert.deepEqual(desambiguarNombres(nombres, [agregar(facultades), agregar(sedes)]), [
      'Química · Ciencias · Bogotá',
      'Química · Ciencias · Medellín',
      'Química · Ingeniería',
      'Biología'
    ]);
  });

  test('sin repetidos devuelve una copia intacta', () => {
    const nombres = ['A', 'B'];
    const resultado = desambiguarNombres(nombres, [agregar(['x', 'y'])]);
    assert.deepEqual(resultado, nombres);
    assert.notEqual(resultado, nombres);
  });
});

describe('nombres en selectores y fichas', () => {
  test('no quedan facultades ni UAB con el mismo nombre', () => {
    assert.ok(contarRepetidos(modelo.nombresCortos.uab) > 0);
    assert.ok(contarRepetidos(modelo.nombresCortos.facultad) > 0);
    assert.equal(contarRepetidos(modelo.nombres.uab), 0);
    assert.equal(contarRepetidos(modelo.nombres.facultad), 0);
  });

  test('una facultad repetida muestra la sede y una UAB repetida la facultad', () => {
    const ciencias = posicionDe(meta.facultades, '2050');
    assert.equal(modelo.nombres.facultad[ciencias], 'Facultad de Ciencias · Sede Bogotá');
    const artes = posicionDe(meta.facultades, '2049');
    assert.equal(modelo.nombres.facultad[artes], 'Facultad de Artes');
    const sedeBogotaEnArtes = meta.uabs.findIndex(([codigo, , facultad]) => codigo === '2000' && facultad === artes);
    assert.equal(modelo.nombres.uab[sedeBogotaEnArtes], 'Sede Bogota · Facultad de Artes');
    const conservatorio = posicionDe(meta.uabs, '2102');
    assert.equal(modelo.nombres.uab[conservatorio], 'Conservatorio de Musica Artes Bogota');
  });
});

describe('etiquetas de los gráficos', () => {
  const base = estadoInicial(modelo, 'S');
  const ocupacion = INDICADORES.tasaOcupacion;
  const cupos = INDICADORES.cupos;

  test('en nivel asignatura se agrega el código solo a los nombres repetidos', () => {
    const conservatorio = posicionDe(meta.uabs, '2102');
    const resultado = calcular(modelo, { ...base, uabs: [conservatorio] }, ocupacion);
    assert.equal(resultado.nivel, 'asignatura');
    const elementos = elementosPorNivel(modelo, resultado, ocupacion, cupos);
    const conCodigo = elementos.filter(elemento => elemento.etiqueta.startsWith(`${modelo.codigos.asignatura[elemento.id]} · `));
    const sinCodigo = elementos.filter(elemento => elemento.etiqueta === modelo.nombres.asignatura[elemento.id]);
    assert.ok(conCodigo.length > 0);
    assert.ok(sinCodigo.length > 0);
    assert.equal(conCodigo.length + sinCodigo.length, elementos.length);
    assert.equal(contarRepetidos(elementos.map(elemento => elemento.etiqueta)), 0);
    const repetidos = new Set(conCodigo.map(elemento => modelo.nombres.asignatura[elemento.id]));
    assert.ok(sinCodigo.every(elemento => !repetidos.has(elemento.etiqueta)));
    assert.ok(elementos.every(elemento => elemento.titulo === rotuloAsignatura(modelo, elemento.id)));
    const { id } = elementos[0];
    assert.equal(rotuloAsignatura(modelo, id), `${modelo.codigos.asignatura[id]} · ${modelo.nombres.asignatura[id]}`);
  });

  test('en nivel UAB el contexto solo aparece si hay nombres repetidos entre las categorías', () => {
    const bogota = posicionDe(meta.sedes, '1101');
    const artes = posicionDe(meta.facultades, '2049');
    const resultado = calcular(modelo, { ...base, sedes: [bogota], facultades: [artes] }, ocupacion);
    assert.equal(resultado.nivel, 'uab');
    const elementos = elementosPorNivel(modelo, resultado, ocupacion, cupos);
    assert.ok(elementos.every(elemento => !elemento.etiqueta.includes(' · ')));
    assert.ok(elementos.every(elemento => elemento.contexto === 'Facultad de Artes · Sede Bogotá'));
    const sedeBogota = meta.uabs.map((uab, indice): [[string, string, number], number] => [uab, indice]).filter(([[codigo]]) => codigo === '2000').map(([, indice]) => indice);
    const comparadas = calcular(modelo, { ...base, uabs: sedeBogota.slice(0, 3) }, ocupacion);
    assert.equal(comparadas.nivel, 'uab');
    const etiquetas = elementosPorNivel(modelo, comparadas, ocupacion, cupos).map(elemento => elemento.etiqueta);
    assert.ok(etiquetas.every(etiqueta => etiqueta.startsWith('Sede Bogota · ')));
    assert.equal(contarRepetidos(etiquetas), 0);
  });

  test('en nivel sede y facultad el título es el nombre completo', () => {
    const resultado = calcular(modelo, base, ocupacion);
    const elementos = elementosPorNivel(modelo, resultado, ocupacion, cupos);
    assert.ok(elementos.every(elemento => elemento.titulo === modelo.nombres.sede[elemento.id] && elemento.contexto === null));
    assert.ok(elementos.every(elemento => elemento.base === cupos.valor(resultado.porNivel.get(elemento.id)!)));
    const bogota = posicionDe(meta.sedes, '1101');
    const facultades = calcular(modelo, { ...base, sedes: [bogota] }, ocupacion);
    assert.equal(facultades.nivel, 'facultad');
    const porFacultad = elementosPorNivel(modelo, facultades, ocupacion, cupos);
    assert.ok(porFacultad.length > 1);
    assert.ok(porFacultad.every(elemento => elemento.titulo === modelo.nombresCortos.facultad[elemento.id]));
    assert.ok(porFacultad.every(elemento => elemento.contexto === 'Sede Bogotá'));
  });
});
