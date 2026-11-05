import { describe, test } from 'vitest';
import assert from 'node:assert/strict';
import { construirCsv } from '../src/dominio/csv';
import { BASE_MINIMA, SECCIONES, TEXTOS, type Seccion } from '../src/dominio/definiciones';
import {
  formatearCompacto, formatearDecimal, formatearEntero, formatearFechaLarga, formatearPorcentaje,
  listarEnEspanol, nombrePropio, normalizarBusqueda, partirEnLineas, SIN_DATO
} from '../src/dominio/formato';
import {
  INDICADORES, calcular, calcularPorAsignatura, formatearIndicador, nivelDe, tituloConUnidad, valorTotal
} from '../src/dominio/indicadores';
import { columnasInconsistentes, crearModelo, periodosDeTipo, type Meta, type RegistrosCrudos } from '../src/dominio/modelo';
import {
  calcularOpciones, cambiarTipo, depurarFiltros, describirFiltros, estadoInicial, filtrosParaBajar, type Filtros
} from '../src/dominio/seleccion';
import {
  elementosPorNivel, filasPorAsignatura, mensajeSinContenido, periodosDelGrafico, puntosDispersion, resumenAccesible,
  resumenesAccesibles, tablasDeDatos, valoresPorPeriodo
} from '../src/dominio/series';
import { meta, modelo, posicionDe, registros } from './datos_reales';

const OCUPACION = INDICADORES.tasaOcupacion;
const conEspacioFijo = (texto: string) => texto.replace(/ /g, '\u00a0');
const indiceSede = (nombre: string) => meta.sedes.findIndex(([, texto]) => texto === nombre);
const indicePeriodo = (codigo: string) => modelo.periodos.indexOf(codigo);

const CIFRAS_REFERENCIA: Record<string, Record<string, number>> = {
  S: {
    asignaturas: 11019, cupos: 1963977, inscritos: 1432821, tasaOcupacion: 72.90732019774163, cupoCompleto: 15.44965775325075,
    inscritosCerrados: 1192241, cancelaciones: 71368, matriculaFinal: 1186351,
    tasaCancelacion: 5.986038057741681, sinCancelaciones: 58.06508458646616,
    matriculaConResultado: 1186053, aprobados: 1087981, reprobados: 98072, tasaAprobacion: 91.73122954876384, promedio: 3.982110324525388
  },
  A: {
    asignaturas: 734, cupos: 35858, inscritos: 10057, tasaOcupacion: 28.03558480673769, cupoCompleto: 5.244252873563219,
    inscritosCerrados: 6642, cancelaciones: 74, matriculaFinal: 6586,
    tasaCancelacion: 1.1141222523336345, sinCancelaciones: 96.50499286733239,
    matriculaConResultado: 6575, aprobados: 6547, reprobados: 28, tasaAprobacion: 99.57414448669202, promedio: 4.5598786324786325
  }
};

const TEXTOS_REFERENCIA: Record<string, Record<string, string[]>> = {
  S: {
    oferta: ['11.019', '1.963.977', '1.432.821', '72,9 %', '15,4 %'],
    cancelaciones: ['1.192.241', '71.368', '1.186.351', '6,0 %', '58,1 %'],
    aprobacion: ['1.186.053', '1.087.981', '98.072', '91,7 %', '3,98']
  },
  A: {
    oferta: ['734', '35.858', '10.057', '28,0 %', '5,2 %'],
    cancelaciones: ['6.642', '74', '6.586', '1,1 %', '96,5 %'],
    aprobacion: ['6.575', '6.547', '28', '99,6 %', '4,56']
  }
};

const REGISTROS_SINTETICOS: RegistrosCrudos = {
  periodo: [0, 1, 2, 3, 1],
  uab: [0, 0, 1, 0, 1],
  asignatura: [0, 0, 0, 1, 1],
  cupos: [40, 20, 30, 10, 0],
  inscritos: [42, 10, 15, 4, 6],
  cancelaciones: [2, 1, 0, 0, 1],
  matricula: [40, 9, 15, 4, 5],
  sinResultado: [0, 1, 0, 4, 0],
  aprobados: [30, 6, 12, 0, 5],
  promedio: [3.5, 3.25, 4.1, null, 4]
};

function metaSintetica(periodos: string[], periodosEnCurso: string[], cambios: Partial<Meta> = {}): Meta {
  return {
    fechaCorte: '2026-10-06',
    fuente: 'Fuente sintética',
    excluidos: 0,
    filas: REGISTROS_SINTETICOS.periodo.length,
    periodos,
    periodosEnCurso,
    sedes: [['1101', 'Sede Bogotá']],
    facultades: [['2050', 'FACULTAD DE CIENCIAS', 0], ['2055', 'FACULTAD DE INGENIERÍA', 0]],
    uabs: [['2128', 'DEPARTAMENTO DE ESTADÍSTICA', 0], ['2133', 'DEPARTAMENTO DE SISTEMAS', 1]],
    asignaturas: [['1000001-B', 'Probabilidad', 0], ['1000002-B', 'Programación', 0]],
    ...cambios
  };
}

describe('cifras con los filtros por defecto', () => {
  for (const tipo of ['S', 'A']) {
    const resultado = calcular(modelo, estadoInicial(modelo, tipo), OCUPACION);
    for (const seccion of SECCIONES) {
      test(`tipo ${tipo}, sección ${seccion.id}`, () => {
        const valores = seccion.kpis.map(id => valorTotal(resultado, id));
        assert.deepEqual(valores, seccion.kpis.map(id => CIFRAS_REFERENCIA[tipo][id]));
        const textos = seccion.kpis.map((id, posicion) => formatearIndicador(id, valores[posicion]));
        assert.deepEqual(textos, TEXTOS_REFERENCIA[tipo][seccion.id].map(conEspacioFijo));
      });
    }
  }

  test('el tipo por defecto es semestral y toma todos sus periodos', () => {
    assert.equal(modelo.tipoPorDefecto, 'S');
    const filtros = estadoInicial(modelo, modelo.tipoPorDefecto);
    const codigos = filtros.periodos.map(periodo => modelo.periodos[periodo]);
    assert.deepEqual(codigos, ['2024-1S', '2024-2S', '2025-1S', '2025-2S', '2026-1S', '2026-2S']);
    assert.equal(nivelDe(filtros), 'sede');
  });

  test('cada sección define una base que existe entre los indicadores', () => {
    for (const seccion of SECCIONES) {
      assert.ok(INDICADORES[seccion.base], seccion.id);
      assert.equal(INDICADORES[seccion.base].formato, 'conteo');
    }
  });
});

describe('nivel de detalle', () => {
  const vacio = { sedes: [], facultades: [], uabs: [], asignaturas: [] };
  test('una opción baja al nivel siguiente y varias se comparan en su nivel', () => {
    assert.equal(nivelDe(vacio), 'sede');
    assert.equal(nivelDe({ ...vacio, sedes: [0] }), 'facultad');
    assert.equal(nivelDe({ ...vacio, sedes: [0, 1] }), 'sede');
    assert.equal(nivelDe({ ...vacio, facultades: [3] }), 'uab');
    assert.equal(nivelDe({ ...vacio, facultades: [3, 4] }), 'facultad');
    assert.equal(nivelDe({ ...vacio, uabs: [7] }), 'asignatura');
    assert.equal(nivelDe({ ...vacio, uabs: [7, 8] }), 'uab');
    assert.equal(nivelDe({ ...vacio, uabs: [7, 8], asignaturas: [1] }), 'asignatura');
  });

  test('bajar de nivel completa la jerarquía', () => {
    const uab = 10;
    const facultad = modelo.facultadDeUab[uab];
    const esperado = { sedes: [modelo.sedeDeFacultad[facultad]], facultades: [facultad], uabs: [uab] };
    assert.deepEqual(filtrosParaBajar(modelo, 'uab', uab), esperado);
    assert.deepEqual(filtrosParaBajar(modelo, 'sede', 2), { sedes: [2] });
  });
});

describe('salto de niveles de un solo elemento', () => {
  const base = estadoInicial(modelo, 'S');

  test('una sede con una sola facultad y una sola UAB baja hasta asignatura', () => {
    const orinoquia = indiceSede('Sede Orinoquía');
    const filtros = { ...base, sedes: [orinoquia] };
    assert.equal(nivelDe(filtros), 'facultad');
    const resultado = calcular(modelo, filtros, OCUPACION);
    assert.equal(resultado.nivel, 'asignatura');
    assert.ok(resultado.porNivel.size > 1);
  });

  test('una sede con varias facultades conserva su nivel', () => {
    const resultado = calcular(modelo, { ...base, sedes: [indiceSede('Sede Bogotá')] }, OCUPACION);
    assert.equal(resultado.nivel, 'facultad');
    assert.equal(resultado.porNivel.size, 18);
  });

  test('el salto no cambia los KPI ni las cifras por periodo', () => {
    const orinoquia = indiceSede('Sede Orinoquía');
    const filtros = { ...base, sedes: [orinoquia] };
    const facultad = modelo.sedeDeFacultad.findIndex(sede => sede === orinoquia);
    const conFacultad = calcular(modelo, { ...filtros, facultades: [facultad] }, OCUPACION);
    const resultado = calcular(modelo, filtros, OCUPACION);
    assert.deepEqual(resultado.total, conFacultad.total);
    assert.deepEqual(resultado.porPeriodo, conFacultad.porPeriodo);
    assert.equal(valorTotal(resultado, 'asignaturas'), valorTotal(conFacultad, 'asignaturas'));
  });

  test('con datos sintéticos se salta solo el nivel con una categoría', () => {
    const sintetico = crearModelo(metaSintetica(['2025-1S', '2025-1I', '2025-2S', '2026-1I'], []), REGISTROS_SINTETICOS);
    const filtros = estadoInicial(sintetico, 'S');
    assert.equal(calcular(sintetico, filtros, OCUPACION).nivel, 'facultad');
    assert.equal(calcular(sintetico, { ...filtros, periodos: [0] }, OCUPACION).nivel, 'asignatura');
    assert.equal(calcular(sintetico, { ...filtros, periodos: [] }, OCUPACION).nivel, 'sede');
  });

  test('el salto cuenta solo las categorías con dato para el indicador de la sección', () => {
    const filtros = { ...estadoInicial(modelo, 'A'), periodos: [indicePeriodo('2025-1A')] };
    const oferta = calcular(modelo, filtros, OCUPACION);
    assert.equal(oferta.nivel, 'facultad');
    assert.equal(elementosPorNivel(modelo, oferta, OCUPACION, INDICADORES.cupos).length, 3);
    for (const id of ['tasaCancelacion', 'tasaAprobacion'] as const) {
      const cerrada = calcular(modelo, filtros, INDICADORES[id]);
      assert.notEqual(cerrada.nivel, 'facultad', id);
      assert.ok(elementosPorNivel(modelo, cerrada, INDICADORES[id], INDICADORES.cupos).length > 1, id);
      assert.deepEqual(cerrada.total, oferta.total);
      assert.deepEqual(cerrada.porPeriodo, oferta.porPeriodo);
    }
  });

  test('las categorías que solo tienen periodos en curso no impiden el salto en las secciones cerradas', () => {
    const filtros = { ...estadoInicial(modelo, 'A'), periodos: ['2025-2A', '2026-1A', '2026-2A'].map(indicePeriodo) };
    const aprobacion = calcular(modelo, filtros, INDICADORES.tasaAprobacion);
    assert.ok(elementosPorNivel(modelo, aprobacion, INDICADORES.tasaAprobacion, INDICADORES.matriculaConResultado).length > 1);
  });
});

describe('periodos en curso', () => {
  test('cuentan en oferta y se excluyen de los indicadores de periodos cerrados', () => {
    const enCurso = modelo.periodos.indexOf('2026-2S');
    assert.equal(modelo.periodoEnCurso[enCurso], 1);
    const resultado = calcular(modelo, { ...estadoInicial(modelo, 'S'), periodos: [enCurso] }, OCUPACION);
    assert.ok((valorTotal(resultado, 'cupos') as number) > 0);
    assert.equal(valorTotal(resultado, 'inscritosCerrados'), null);
    assert.equal(valorTotal(resultado, 'tasaAprobacion'), null);
    assert.equal(resultado.total.registrosCerrados, 0);
    assert.equal(formatearIndicador('promedio', valorTotal(resultado, 'promedio')), SIN_DATO);
    assert.deepEqual(periodosDelGrafico(modelo, resultado, INDICADORES.tasaCancelacion), []);
    assert.deepEqual(periodosDelGrafico(modelo, resultado, INDICADORES.tasaOcupacion), [enCurso]);
  });

  test('la nota se construye con los periodos en curso', () => {
    assert.equal(TEXTOS.periodosEnCurso(['2026-2S']), 'Periodo en curso: 2026-2S. Se incluye en la sección de oferta y se excluye de las de cancelaciones y aprobación porque sus actas de calificación no están cerradas.');
    assert.equal(TEXTOS.periodosEnCurso(['2026-1A', '2026-2A', '2026-2S']), 'Periodos en curso: 2026-1A, 2026-2A y 2026-2S. Se incluyen en la sección de oferta y se excluyen de las de cancelaciones y aprobación porque sus actas de calificación no están cerradas.');
  });

  test('la tabla de las secciones cerradas omite las asignaturas que solo están en periodos en curso', () => {
    const asignaturas = calcularPorAsignatura(modelo, estadoInicial(modelo, 'S'));
    const oferta = filasPorAsignatura(modelo, asignaturas, ['cupos'], false);
    const cerradas = filasPorAsignatura(modelo, asignaturas, ['tasaCancelacion'], true);
    assert.equal(oferta.filas.length, 11019);
    assert.equal(oferta.omitidas, 0);
    assert.equal(cerradas.omitidas, 474);
    assert.equal(cerradas.filas.length + cerradas.omitidas, 11019);
    assert.ok(cerradas.filas.every(fila => fila.tasaCancelacion !== undefined));
    assert.equal(TEXTOS.omitidasEnCurso(474), 'Se omiten 474 asignaturas que solo tienen registros en periodos en curso.');
  });
});

describe('selección desde la tabla y la dispersión', () => {
  const base = estadoInicial(modelo, 'S');
  const asignaturas = calcularPorAsignatura(modelo, base);

  test('la tabla y la dispersión ignoran el filtro de asignaturas', () => {
    const elegida = [...asignaturas.porAsignatura.keys()][0];
    const conSeleccion = calcularPorAsignatura(modelo, { ...base, asignaturas: [elegida] });
    assert.equal(conSeleccion.porAsignatura.size, asignaturas.porAsignatura.size);
    const kpi = calcular(modelo, { ...base, asignaturas: [elegida] }, OCUPACION);
    assert.equal(valorTotal(kpi, 'asignaturas'), 1);
    assert.deepEqual(kpi.total, conSeleccion.porAsignatura.get(elegida));
  });

  test('las seleccionadas se muestran aunque no alcancen el mínimo', () => {
    const { dispersion } = SECCIONES[0];
    const pequena = [...asignaturas.porAsignatura.entries()]
      .find(([, acumulado]) => acumulado.cuposOfertados > 0 && acumulado.cuposOfertados < BASE_MINIMA)![0];
    const sinSeleccion = puntosDispersion(modelo, asignaturas.porAsignatura, dispersion, new Set());
    const conSeleccion = puntosDispersion(modelo, asignaturas.porAsignatura, dispersion, new Set([pequena]));
    assert.equal(sinSeleccion.contexto.length, 10340);
    assert.equal(sinSeleccion.seleccionadas.length, 0);
    assert.ok(!sinSeleccion.contexto.some(punto => punto.id === pequena));
    assert.deepEqual(conSeleccion.seleccionadas.map(punto => punto.id), [pequena]);
    assert.equal(conSeleccion.seleccionadas[0].rotulo, `${modelo.codigos.asignatura[pequena]} · ${modelo.nombres.asignatura[pequena]}`);
    assert.equal(conSeleccion.contexto.length, 10340);
  });

  test('la nota de la dispersión describe el criterio y el conteo', () => {
    const { dispersion } = SECCIONES[0];
    assert.equal(
      TEXTOS.notaDispersion(dispersion, { mostradas: 10340, total: 11019, visibles: 0, ausentes: 0 }),
      'Cada punto es una asignatura con 10 o más cupos ofertados en la selección; el tamaño indica las inscripciones. Se muestran 10.340 de 11.019 asignaturas.'
    );
    const dos = TEXTOS.notaDispersion(dispersion, { mostradas: 10342, total: 11019, visibles: 2, ausentes: 0 });
    assert.match(dos, /las 2 asignaturas seleccionadas se resaltan en ámbar/);
    const una = TEXTOS.notaDispersion(dispersion, { mostradas: 1, total: 1, visibles: 1, ausentes: 0 });
    assert.match(una, /Se muestra 1 de 1 asignatura; la asignatura seleccionada se resalta/);
  });

  test('la nota de la dispersión avisa cuando una asignatura seleccionada no se puede ubicar', () => {
    const { dispersion } = SECCIONES[2];
    const sinPromedio = [...asignaturas.porAsignatura.entries()]
      .find(([, acumulado]) => acumulado.matriculaConResultado > 20 && !acumulado.conNota)![0];
    const puntos = puntosDispersion(modelo, asignaturas.porAsignatura, dispersion, new Set([sinPromedio]));
    assert.equal(puntos.seleccionadas.length, 0);
    const nota = TEXTOS.notaDispersion(dispersion, { mostradas: puntos.contexto.length, total: 10545, visibles: 0, ausentes: 1 });
    assert.ok(nota.endsWith('; 1 asignatura seleccionada no aparece porque no tiene datos para ubicarla en el gráfico.'));
    assert.ok(!nota.includes('se resalta'));
  });

  test('el resumen accesible de la dispersión sin selección incluye valores', () => {
    const { dispersion } = SECCIONES[0];
    const puntos = puntosDispersion(modelo, asignaturas.porAsignatura, dispersion, new Set());
    const resumenes = resumenesAccesibles({
      titulos: { periodo: 'P', nivel: 'N', mapa: 'M' }, codigos: [], valores: [], elementos: [], puntos, mapa: null,
      indicador: OCUPACION, dispersion
    });
    assert.match(resumenes.dispersion, /^Cupos y ocupación por asignatura, 10\.340 asignaturas ordenadas por inscripciones: \d{7}(-\w)? · /);
    assert.ok(resumenes.dispersion.endsWith(' y 10.335 más.'));
    assert.equal(resumenes.mapa, 'M.');
  });
});

describe('formatos', () => {
  test('números', () => {
    assert.equal(formatearEntero(1963977), '1.963.977');
    assert.equal(formatearEntero(999), '999');
    assert.equal(formatearEntero(-12345.6), '-12.346');
    assert.equal(formatearEntero(null), SIN_DATO);
    assert.equal(formatearEntero(Number.NaN), SIN_DATO);
    assert.equal(formatearDecimal(3.982110324525388, 2), '3,98');
    assert.equal(formatearDecimal(12345.67, 1), '12.345,7');
    assert.equal(formatearPorcentaje(72.90732019774163), conEspacioFijo('72,9 %'));
    assert.equal(formatearPorcentaje(undefined), SIN_DATO);
    assert.equal(formatearCompacto(1234567), conEspacioFijo('1,2 M'));
    assert.equal(formatearCompacto(35400), conEspacioFijo('35 mil'));
    assert.equal(formatearCompacto(9999), '9.999');
  });

  test('fecha larga sin desfase de zona horaria', () => {
    assert.equal(formatearFechaLarga('2026-10-06'), '6 de octubre de 2026');
    assert.equal(formatearFechaLarga('2026-01-01'), '1 de enero de 2026');
    assert.equal(formatearFechaLarga('sin fecha'), 'sin fecha');
  });

  test('textos', () => {
    assert.equal(normalizarBusqueda('Cálculo DIFERENCIAL Ñandú'), 'calculo diferencial nandu');
    assert.equal(nombrePropio('FACULTAD DE CIENCIAS AGRARIAS'), 'Facultad de Ciencias Agrarias');
    assert.equal(nombrePropio('INSTITUTO DE BIOTECNOLOGÍA - IBUN'), 'Instituto de Biotecnología - IBUN');
    assert.equal(nombrePropio('CENTRO DE ESTUDIOS SOCIALES - CES BOGOTA'), 'Centro de Estudios Sociales - CES Bogota');
    assert.equal(nombrePropio('PRÁCTICA ACADÉMICA ESPECIAL (PAE) - III'), 'Práctica Académica Especial (PAE) - III');
    assert.equal(nombrePropio('Departamento de Física'), 'Departamento de Física');
    assert.equal(listarEnEspanol(['a']), 'a');
    assert.equal(listarEnEspanol(['a', 'b']), 'a y b');
    assert.equal(listarEnEspanol(['a', 'b', 'c']), 'a, b y c');
  });

  test('partición de textos en líneas', () => {
    const medir = (texto: string) => texto.length;
    assert.deepEqual(partirEnLineas('uno dos tres cuatro', 8, medir), ['uno dos', 'tres', 'cuatro']);
    assert.deepEqual(partirEnLineas('palabramuylarga corta', 5, medir), ['palabramuylarga', 'corta']);
    assert.deepEqual(partirEnLineas('', 10, medir), []);
  });

  test('encabezados con unidades', () => {
    assert.equal(tituloConUnidad('tasaOcupacion'), 'Tasa de ocupación (%)');
    assert.equal(tituloConUnidad('promedio'), 'Promedio de calificaciones (0,0 a 5,0)');
    assert.equal(tituloConUnidad('cupos'), 'Cupos ofertados');
  });

  test('CSV con punto y coma, coma decimal y marca UTF-8', () => {
    const columnas = [{ clave: 'nombre', titulo: 'Asignatura' }, { clave: 'tasa', titulo: 'Tasa' }, { clave: 'vacio', titulo: 'Vacío' }];
    const csv = construirCsv(columnas, [{ nombre: 'Física; teoría "básica"', tasa: 72.9073, vacio: null }]);
    assert.equal(csv, '\ufeffAsignatura;Tasa;Vacío\r\n"Física; teoría ""básica""";72,91;');
  });

  test('resumen accesible de los gráficos', () => {
    assert.equal(resumenAccesible('Tasa por sede', [['A', '1 %'], ['B', '2 %']]), 'Tasa por sede: A 1 %, B 2 %.');
    const muchos = Array.from({ length: 8 }, (_, posicion): [string, string] => [`S${posicion}`, String(posicion)]);
    assert.equal(resumenAccesible('T', muchos), 'T: S0 0, S1 1, S2 2, S3 3, S4 4 y 3 más.');
    assert.equal(resumenAccesible('T', []), 'T.');
  });
});

describe('consistencia de los datos', () => {
  test('detecta columnas con longitud distinta de meta.filas', () => {
    const registros: Record<string, unknown[]> = structuredClone(REGISTROS_SINTETICOS);
    assert.deepEqual(columnasInconsistentes({ filas: 5 }, registros), []);
    registros.cupos.pop();
    delete registros.promedio;
    assert.deepEqual(columnasInconsistentes({ filas: 5 }, registros), ['cupos', 'promedio']);
  });

  test('un JSON nulo se informa como inconsistente sin lanzar errores', () => {
    assert.equal(columnasInconsistentes({ filas: 5 }, null).length, 10);
    assert.equal(columnasInconsistentes(null, structuredClone(REGISTROS_SINTETICOS)).length, 10);
  });

  test('los datos publicados son consistentes', () => {
    assert.deepEqual(columnasInconsistentes(meta, registros), []);
  });
});

describe('periodo intersemestral sintético', () => {
  const sintetico = crearModelo(metaSintetica(['2025-1S', '2025-1I', '2025-2S', '2026-1I'], ['2026-1I']), REGISTROS_SINTETICOS);

  test('los tipos de periodo se derivan de los datos', () => {
    assert.deepEqual(sintetico.tiposPeriodo.map(tipo => [tipo.clave, tipo.etiqueta, tipo.periodos]), [
      ['S', 'Semestral', [0, 2]],
      ['I', 'Intersemestral', [1, 3]]
    ]);
    assert.equal(sintetico.tipoPorDefecto, 'S');
    assert.deepEqual(estadoInicial(sintetico, 'I').periodos, [1, 3]);
  });

  test('los indicadores del tipo intersemestral excluyen el periodo en curso', () => {
    const resultado = calcular(sintetico, estadoInicial(sintetico, 'I'), OCUPACION);
    assert.equal(valorTotal(resultado, 'asignaturas'), 2);
    assert.equal(valorTotal(resultado, 'cupos'), 30);
    assert.equal(valorTotal(resultado, 'inscritos'), 20);
    assert.equal(valorTotal(resultado, 'tasaOcupacion'), 14 / 30 * 100);
    assert.equal(valorTotal(resultado, 'cupoCompleto'), 0);
    assert.equal(valorTotal(resultado, 'inscritosCerrados'), 16);
    assert.equal(valorTotal(resultado, 'cancelaciones'), 2);
    assert.equal(valorTotal(resultado, 'tasaCancelacion'), 2 / 16 * 100);
    assert.equal(valorTotal(resultado, 'matriculaConResultado'), 13);
    assert.equal(valorTotal(resultado, 'reprobados'), 2);
    assert.equal(valorTotal(resultado, 'promedio'), (325 * 8 + 400 * 5) / 13 / 100);
    assert.deepEqual(periodosDelGrafico(sintetico, resultado, INDICADORES.tasaAprobacion), [1]);
  });

  test('sin periodos semestrales el tipo por defecto es el primero y las letras nuevas se rotulan', () => {
    const otro = crearModelo(metaSintetica(['2025-1X', '2025-1I', '2025-2X', '2026-1I'], []), REGISTROS_SINTETICOS);
    assert.deepEqual(otro.tiposPeriodo.map(tipo => tipo.etiqueta), ['Intersemestral', 'Tipo X']);
    assert.equal(otro.tipoPorDefecto, 'I');
    assert.deepEqual(periodosDeTipo(otro, 'X'), [0, 2]);
  });
});

describe('pertenencia de asignaturas a unidades', () => {
  const sintetico = crearModelo(metaSintetica(['2025-1S', '2025-1I', '2025-2S', '2026-1I'], []), REGISTROS_SINTETICOS);
  const base = estadoInicial(sintetico, 'S');

  test('una asignatura que cambió de UAB aparece en ambas', () => {
    assert.deepEqual(calcularOpciones(sintetico, { ...base, uabs: [0] }).asignaturas, [0]);
    assert.deepEqual(calcularOpciones(sintetico, { ...base, uabs: [1] }).asignaturas, [0]);
    assert.deepEqual(calcularOpciones(sintetico, { ...base, facultades: [0] }).asignaturas, [0]);
    assert.deepEqual(calcularOpciones(sintetico, { ...base, facultades: [1] }).asignaturas, [0]);
  });

  test('la cascada conserva la asignatura mientras tenga registros en la unidad elegida', () => {
    assert.deepEqual(depurarFiltros(sintetico, { ...base, uabs: [0], asignaturas: [0] }).asignaturas, [0]);
    assert.deepEqual(depurarFiltros(sintetico, { ...base, periodos: [2], uabs: [0], asignaturas: [0] }).asignaturas, [0]);
    assert.deepEqual(depurarFiltros(sintetico, { ...base, uabs: [1], asignaturas: [1] }).asignaturas, []);
    assert.deepEqual(depurarFiltros(sintetico, { ...base, facultades: [1], uabs: [0], asignaturas: [0] }).uabs, []);
  });

  test('la tabla muestra la UAB del registro más reciente de la selección', () => {
    const uabDe = (filtros: Filtros) => filasPorAsignatura(sintetico, calcularPorAsignatura(sintetico, filtros), ['cupos'], false)
      .filas.find(fila => fila.id === 0)!.uab;
    assert.equal(uabDe(base), 'Departamento de Sistemas');
    assert.equal(uabDe({ ...base, periodos: [0] }), 'Departamento de Estadística');
  });

  test('cambiar el tipo conserva las unidades y limpia solo las asignaturas sin registros', () => {
    const filtros = { ...base, facultades: [0], uabs: [0], asignaturas: [0, 1] };
    const intersemestral = cambiarTipo(sintetico, filtros, 'I');
    assert.deepEqual(intersemestral.periodos, [1, 3]);
    assert.deepEqual(intersemestral.facultades, [0]);
    assert.deepEqual(intersemestral.uabs, [0]);
    assert.deepEqual(intersemestral.asignaturas, [0, 1]);
    const sinUnidad = cambiarTipo(sintetico, { ...base, asignaturas: [0, 1] }, 'I');
    assert.deepEqual(sinUnidad.asignaturas, [0, 1]);
    const otroModelo = crearModelo(metaSintetica(['2025-1S', '2025-1A', '2025-2S', '2026-1A'], []), REGISTROS_SINTETICOS);
    const anual = cambiarTipo(otroModelo, { ...estadoInicial(otroModelo, 'S'), uabs: [1], asignaturas: [0, 1] }, 'A');
    assert.deepEqual(anual.uabs, [1]);
    assert.deepEqual(anual.asignaturas, [1]);
  });

  test('cambiar el tipo con datos reales selecciona todos los periodos del nuevo tipo', () => {
    const bogota = indiceSede('Sede Bogotá');
    const filtros = { ...estadoInicial(modelo, 'S'), sedes: [bogota], asignaturas: [0, 1, 2] };
    const anual = cambiarTipo(modelo, filtros, 'A');
    assert.deepEqual(anual.periodos, periodosDeTipo(modelo, 'A'));
    assert.deepEqual(anual.sedes, [bogota]);
    const conRegistros = calcularPorAsignatura(modelo, anual).porAsignatura;
    assert.ok(anual.asignaturas.every(asignatura => conRegistros.has(asignatura)));
  });
});

describe('resumen de filtros para las imágenes', () => {
  test('describe tipo, periodos y selecciones', () => {
    const bogota = indiceSede('Sede Bogotá');
    const filtros = { ...estadoInicial(modelo, 'S'), sedes: [bogota] };
    assert.equal(describirFiltros(modelo, filtros), 'Tipo de periodo: Semestral. Periodos: 2024-1S a 2026-2S. Sedes: Sede Bogotá.');
    const parcial = { ...filtros, periodos: [3, 1], asignaturas: [0, 1, 2, 3] };
    assert.equal(describirFiltros(modelo, parcial), 'Tipo de periodo: Semestral. Periodos: 2024-1S, 2024-2S. Sedes: Sede Bogotá. Asignaturas: 4 asignaturas.');
    assert.match(describirFiltros(modelo, { ...filtros, periodos: [] }), /Periodos: ninguno\./);
  });
});

describe('estado vacío de las secciones', () => {
  const base = estadoInicial(modelo, 'S');
  const [oferta, cancelaciones] = SECCIONES;
  const mensaje = (seccion: Seccion, filtros: Filtros) => {
    const resultado = calcular(modelo, filtros, INDICADORES[seccion.principal]);
    return mensajeSinContenido(modelo, seccion, filtros, resultado);
  };

  test('sin periodos o sin registros no hay contenido', () => {
    assert.equal(mensaje(oferta, { ...base, periodos: [] }), TEXTOS.sinRegistros);
    assert.equal(mensaje(oferta, base), null);
  });

  test('con todos los periodos elegidos en curso se indica que no hay actas cerradas', () => {
    assert.equal(mensaje(cancelaciones, { ...base, periodos: [indicePeriodo('2026-2S')] }), TEXTOS.soloEnCurso);
  });

  test('si los registros de la selección solo están en periodos en curso el mensaje lo dice', () => {
    const filtros = { ...base, asignaturas: [posicionDe(meta.asignaturas, '1000168-B')] };
    const resultado = calcular(modelo, filtros, OCUPACION);
    assert.ok(resultado.total.registros > 0);
    assert.equal(resultado.total.registrosCerrados, 0);
    assert.equal(mensaje(oferta, filtros), null);
    assert.equal(mensaje(cancelaciones, filtros), TEXTOS.soloRegistrosEnCurso);
  });
});

describe('tablas de datos de los gráficos', () => {
  test('repiten las cifras de los gráficos con encabezados y unidades', () => {
    const resultado = calcular(modelo, estadoInicial(modelo, 'S'), OCUPACION);
    const periodos = periodosDelGrafico(modelo, resultado, OCUPACION);
    const codigos = periodos.map(periodo => modelo.periodos[periodo]);
    const valores = valoresPorPeriodo(resultado, periodos, OCUPACION, INDICADORES.cupos);
    const elementos = elementosPorNivel(modelo, resultado, OCUPACION, INDICADORES.cupos);
    const celdas: ({ valor: number; base: number | null } | null)[][] = elementos.map(() => codigos.map(() => null));
    celdas[0][0] = { valor: 50, base: 20 };
    const tablas = tablasDeDatos({
      nivel: resultado.nivel, codigos, valores, elementos, mapa: { celdas }, indicador: OCUPACION, base: INDICADORES.cupos
    });
    assert.deepEqual(tablas.periodo.columnas, ['Periodo', 'Tasa de ocupación (%)', 'Cupos ofertados']);
    assert.equal(tablas.periodo.filas.length, 6);
    assert.equal(tablas.periodo.filas[0][0], '2024-1S');
    assert.deepEqual(tablas.nivel.columnas, ['Sede', 'Tasa de ocupación (%)', 'Cupos ofertados']);
    const [primero] = elementos;
    assert.deepEqual(tablas.nivel.filas[0], [
      primero.etiqueta, formatearIndicador('tasaOcupacion', primero.valor), formatearIndicador('cupos', primero.base)
    ]);
    assert.deepEqual(tablas.mapa!.columnas, ['Sede', ...codigos]);
    assert.deepEqual(tablas.mapa!.filas[0].slice(0, 3), [elementos[0].etiqueta, conEspacioFijo('50,0 %'), SIN_DATO]);
    const sinMapa = tablasDeDatos({ nivel: 'uab', codigos, valores, elementos, mapa: null, indicador: OCUPACION, base: INDICADORES.cupos });
    assert.equal(sinMapa.mapa, null);
  });

  test('los textos de conteo concuerdan en número', () => {
    assert.equal(TEXTOS.filasMostradas(1, 1), 'Se muestra 1 de 1 asignatura.');
    assert.equal(TEXTOS.filasMostradas(300, 11019), 'Se muestran 300 de 11.019 asignaturas.');
    assert.equal(TEXTOS.omitidasEnCurso(1), 'Se omite 1 asignatura que solo tiene registros en periodos en curso.');
    assert.equal(TEXTOS.coincidencias(0, 100), TEXTOS.sinCoincidencias);
    assert.equal(TEXTOS.coincidencias(1, 100), '1 coincidencia.');
    assert.equal(TEXTOS.coincidencias(10605, 100), 'Se muestran 100 de 10.605 coincidencias; la búsqueda se puede precisar.');
    assert.equal(TEXTOS.glosarioPeriodos, 'Los periodos se identifican como año, semestre y tipo: S semestral, A anual, I intersemestral.');
    assert.equal(TEXTOS.categoriasVisibles(15, 28, 69), 'Se muestran las categorías 15 a 28 de 69.');
  });
});

describe('cascada al cambiar los periodos', () => {
  test('vaciar y restaurar los periodos conserva las asignaturas elegidas dentro de una facultad', () => {
    const ciencias = posicionDe(meta.facultades, '2050');
    const elegidas = ['1000004-B', '1000003-B'].map(codigo => posicionDe(meta.asignaturas, codigo));
    const filtros = depurarFiltros(modelo, { ...estadoInicial(modelo, 'S'), facultades: [ciencias], asignaturas: elegidas });
    assert.deepEqual(filtros.asignaturas, elegidas);
    const sinPeriodos = depurarFiltros(modelo, { ...filtros, periodos: [] });
    assert.deepEqual(sinPeriodos.asignaturas, elegidas);
    assert.deepEqual(depurarFiltros(modelo, { ...sinPeriodos, periodos: periodosDeTipo(modelo, 'S').slice() }).asignaturas, elegidas);
  });
});
