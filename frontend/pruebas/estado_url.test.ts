import { describe, test } from 'vitest';
import assert from 'node:assert/strict';
import { leerEstado, serializarEstado, tieneEstado } from '../src/dominio/estadoUrl';
import { crearModelo, periodosDeTipo } from '../src/dominio/modelo';
import { estadoInicial } from '../src/dominio/seleccion';
import { meta, modelo, posicionDe } from './datos_reales';
const bogota = posicionDe(meta.sedes, '1101');
const medellin = posicionDe(meta.sedes, '1102');
const ciencias = posicionDe(meta.facultades, '2050');
const artes = posicionDe(meta.facultades, '2049');
const estadistica = meta.uabs.findIndex(([codigo, , facultad]) => codigo === '2128' && facultad === ciencias);
const sedeBogotaEnArtes = meta.uabs.findIndex(([codigo, , facultad]) => codigo === '2000' && facultad === artes);
const calculo = posicionDe(meta.asignaturas, '1000004-B');
const registroDeEstadistica = modelo.registros.uab.findIndex((uab, indice) => (
  uab === estadistica && modelo.registros.periodo[indice] === 1
));
const asignaturaDeEstadistica = modelo.registros.asignatura[registroDeEstadistica];

describe('serialización del estado en la dirección', () => {
  test('el estado por defecto solo guarda la sección y el tipo', () => {
    assert.equal(serializarEstado(modelo, 'oferta', estadoInicial(modelo, 'S')), 'seccion=oferta&tipo=S');
  });

  test('las selecciones se guardan con códigos y no con índices', () => {
    const filtros = {
      ...estadoInicial(modelo, 'S'),
      periodos: [3, 1],
      sedes: [bogota],
      facultades: [ciencias],
      uabs: [estadistica],
      asignaturas: [calculo]
    };
    assert.equal(
      serializarEstado(modelo, 'cancelaciones', filtros),
      'seccion=cancelaciones&tipo=S&periodos=2024-1S,2024-2S&sedes=1101&facultades=2050&uabs=2050.2128&asignaturas=1000004-B'
    );
  });

  test('una UAB con el mismo código en varias facultades se distingue por la facultad', () => {
    const filtros = { ...estadoInicial(modelo, 'S'), sedes: [bogota], facultades: [artes], uabs: [sedeBogotaEnArtes] };
    const texto = serializarEstado(modelo, 'oferta', filtros);
    assert.match(texto, /uabs=2049\.2000/);
    assert.deepEqual(leerEstado(modelo, `#${texto}`).filtros.uabs, [sedeBogotaEnArtes]);
  });

  test('sin periodos se guarda una lista vacía', () => {
    const texto = serializarEstado(modelo, 'oferta', { ...estadoInicial(modelo, 'A'), periodos: [] });
    assert.equal(texto, 'seccion=oferta&tipo=A&periodos=');
    assert.deepEqual(leerEstado(modelo, `#${texto}`).filtros.periodos, []);
  });
});

describe('lectura del estado en la dirección', () => {
  test('una dirección vacía da el estado por defecto', () => {
    for (const hash of ['', '#', undefined]) {
      assert.deepEqual(leerEstado(modelo, hash), { seccion: 'oferta', filtros: estadoInicial(modelo, 'S') });
    }
  });

  test('el estado sobrevive a la serialización', () => {
    const filtros = {
      ...estadoInicial(modelo, 'S'),
      periodos: [1, 3, 5],
      sedes: [bogota],
      facultades: [ciencias],
      uabs: [estadistica],
      asignaturas: [asignaturaDeEstadistica]
    };
    const leido = leerEstado(modelo, `#${serializarEstado(modelo, 'aprobacion', filtros)}`);
    assert.deepEqual(leido, { seccion: 'aprobacion', filtros });
  });

  test('los valores desconocidos se ignoran sin romper el estado', () => {
    const leido = leerEstado(modelo, '#seccion=inexistente&tipo=Z&sedes=1101,9999,&facultades=xx&asignaturas=NOEXISTE&otra=1&sinvalor');
    assert.equal(leido.seccion, 'oferta');
    assert.equal(leido.filtros.tipo, 'S');
    assert.deepEqual(leido.filtros.periodos, periodosDeTipo(modelo, 'S'));
    assert.deepEqual(leido.filtros.sedes, [bogota]);
    assert.deepEqual(leido.filtros.facultades, []);
    assert.deepEqual(leido.filtros.asignaturas, []);
  });

  test('periodos de otro tipo o mal codificados equivalen a todos los del tipo', () => {
    assert.deepEqual(leerEstado(modelo, '#tipo=A&periodos=2024-1S').filtros.periodos, periodosDeTipo(modelo, 'A'));
    assert.deepEqual(leerEstado(modelo, '#tipo=S&periodos=%E0%A4').filtros.periodos, periodosDeTipo(modelo, 'S'));
    assert.deepEqual(leerEstado(modelo, '#tipo=S&periodos=2026-2S,2030-1S').filtros.periodos, [modelo.periodos.indexOf('2026-2S')]);
  });

  test('un ancla sin parámetros de estado no cuenta como estado', () => {
    for (const hash of ['#contenido', '#', '', undefined, '#otra=1']) assert.equal(tieneEstado(hash), false, String(hash));
    const conEstado = ['#seccion=oferta', '#tipo=A', '#periodos=', '#sedes=1101', '#uabs=2050.2128'];
    for (const hash of conEstado) assert.equal(tieneEstado(hash), true, hash);
  });

  test('los valores repetidos se cuentan una vez', () => {
    assert.deepEqual(leerEstado(modelo, '#sedes=1101,1101,1102').filtros.sedes, [bogota, medellin]);
  });

  test('la cascada depura selecciones incompatibles', () => {
    const leido = leerEstado(modelo, `#sedes=1102&facultades=2050&uabs=2050.2128&asignaturas=1000004-B`);
    assert.deepEqual(leido.filtros.sedes, [medellin]);
    assert.deepEqual(leido.filtros.facultades, []);
    assert.deepEqual(leido.filtros.uabs, []);
    assert.deepEqual(leido.filtros.asignaturas, []);
  });

  test('los códigos con caracteres especiales se codifican y se leen', () => {
    const sintetico = crearModelo({
      fechaCorte: '2026-10-06', fuente: 'Prueba', excluidos: 0, filas: 1,
      periodos: ['2025-1S'], periodosEnCurso: [],
      sedes: [['S 1', 'Sede uno']], facultades: [['F&1', 'FACULTAD', 0]], uabs: [['U=1', 'UNIDAD', 0]],
      asignaturas: [['A,1#', 'Asignatura', 0]]
    }, {
      periodo: [0], uab: [0], asignatura: [0], cupos: [1], inscritos: [1], cancelaciones: [0],
      matricula: [1], sinResultado: [0], aprobados: [1], promedio: [4]
    });
    const filtros = { ...estadoInicial(sintetico, 'S'), sedes: [0], facultades: [0], uabs: [0], asignaturas: [0] };
    const texto = serializarEstado(sintetico, 'oferta', filtros);
    assert.equal(texto, 'seccion=oferta&tipo=S&sedes=S%201&facultades=F%261&uabs=F%261.U%3D1&asignaturas=A%2C1%23');
    assert.deepEqual(leerEstado(sintetico, `#${texto}`).filtros, filtros);
  });
});
