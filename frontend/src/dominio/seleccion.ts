import { JERARQUIA, type Nivel } from './definiciones';
import { formatearEntero, ordenarNumeros } from './formato';
import { marcarPeriodos, periodosDeTipo, type Modelo } from './modelo';

const MAXIMO_NOMBRES_EN_RESUMEN = 3;

export interface Filtros {
  tipo: string;
  periodos: number[];
  sedes: number[];
  facultades: number[];
  uabs: number[];
  asignaturas: number[];
}

export interface Contexto {
  periodos: number[];
  sedes: number[];
  facultades: number[];
  uabs: number[];
  asignaturas?: number[];
}

export interface Opciones {
  sedes: number[];
  facultades: number[];
  uabs: number[];
  asignaturas: number[];
}

export function estadoInicial(modelo: Modelo, tipo: string): Filtros {
  return { tipo, periodos: periodosDeTipo(modelo, tipo).slice(), sedes: [], facultades: [], uabs: [], asignaturas: [] };
}

export function alternar<T>(lista: T[], valor: T): T[] {
  return lista.includes(valor) ? lista.filter(elemento => elemento !== valor) : [...lista, valor];
}

function marcarPresencia(modelo: Modelo, filtros: Contexto): Record<Nivel, Uint8Array> {
  const columnas = modelo.registros;
  const periodoElegido = marcarPeriodos(modelo, filtros.periodos);
  const facultades = new Set(filtros.facultades);
  const uabs = new Set(filtros.uabs);
  const presencia = Object.fromEntries(JERARQUIA.map(({ nivel }) => [nivel, new Uint8Array(modelo.nombres[nivel].length)])) as Record<Nivel, Uint8Array>;
  for (let indice = 0; indice < modelo.cantidadRegistros; indice++) {
    if (!periodoElegido[columnas.periodo[indice]]) continue;
    presencia.sede[columnas.sede[indice]] = 1;
    presencia.facultad[columnas.facultad[indice]] = 1;
    presencia.uab[columnas.uab[indice]] = 1;
    if (facultades.size && !facultades.has(columnas.facultad[indice])) continue;
    if (uabs.size && !uabs.has(columnas.uab[indice])) continue;
    presencia.asignatura[columnas.asignatura[indice]] = 1;
  }
  return presencia;
}

const admite = (conjunto: Set<number>, valor: number) => !conjunto.size || conjunto.has(valor);

export function calcularOpciones(modelo: Modelo, filtros: Contexto): Opciones {
  const presencia = marcarPresencia(modelo, filtros);
  const sedes = new Set(filtros.sedes);
  const facultades = new Set(filtros.facultades);
  return {
    sedes: modelo.ordenAlfabetico.sede.filter(sede => presencia.sede[sede]),
    facultades: modelo.ordenAlfabetico.facultad.filter(facultad => presencia.facultad[facultad]
      && admite(sedes, modelo.sedeDeFacultad[facultad])),
    uabs: modelo.ordenAlfabetico.uab.filter(uab => presencia.uab[uab]
      && admite(facultades, modelo.facultadDeUab[uab]) && admite(sedes, modelo.sedeDeUab[uab])),
    asignaturas: modelo.ordenAlfabetico.asignatura.filter(asignatura => presencia.asignatura[asignatura]
      && admite(sedes, modelo.sedeDeAsignatura[asignatura]))
  };
}

const conservarSiNoCambia = (lista: number[], vigentes: number[]) => (vigentes.length === lista.length ? lista : vigentes);

export function depurarFiltros(modelo: Modelo, filtros: Filtros): Filtros {
  const sedes = new Set(filtros.sedes);
  const facultadesVigentes = conservarSiNoCambia(filtros.facultades,
    filtros.facultades.filter(facultad => admite(sedes, modelo.sedeDeFacultad[facultad])));
  const facultades = new Set(facultadesVigentes);
  const uabAdmitida = (uab: number) => admite(facultades, modelo.facultadDeUab[uab]) && admite(sedes, modelo.sedeDeUab[uab]);
  const uabsVigentes = conservarSiNoCambia(filtros.uabs, filtros.uabs.filter(uabAdmitida));
  const depurado = { ...filtros, facultades: facultadesVigentes, uabs: uabsVigentes };
  const pertenece = facultadesVigentes.length || uabsVigentes.length
    ? marcarPresencia(modelo, { ...depurado, periodos: periodosDeTipo(modelo, filtros.tipo) }).asignatura
    : null;
  const asignaturaAdmitida = (asignatura: number) => admite(sedes, modelo.sedeDeAsignatura[asignatura]) && (!pertenece || pertenece[asignatura]);
  depurado.asignaturas = conservarSiNoCambia(filtros.asignaturas, filtros.asignaturas.filter(asignaturaAdmitida));
  return depurado;
}

export function cambiarTipo(modelo: Modelo, filtros: Filtros, tipo: string): Filtros {
  const periodos = periodosDeTipo(modelo, tipo).slice();
  const conRegistros = marcarPresencia(modelo, { ...filtros, periodos }).asignatura;
  const sedes = new Set(filtros.sedes);
  return {
    ...filtros,
    tipo,
    periodos,
    asignaturas: filtros.asignaturas.filter(asignatura => conRegistros[asignatura]
      && admite(sedes, modelo.sedeDeAsignatura[asignatura]))
  };
}

export function filtrosParaBajar(modelo: Modelo, nivel: Nivel, id: number): Partial<Filtros> {
  if (nivel === 'sede') return { sedes: [id] };
  if (nivel === 'facultad') return { sedes: [modelo.sedeDeFacultad[id]], facultades: [id] };
  const facultad = modelo.facultadDeUab[id];
  return { sedes: [modelo.sedeDeFacultad[facultad]], facultades: [facultad], uabs: [id] };
}

function resumirLista(rotulo: string, nombres: string[], plural: string): string | null {
  if (!nombres.length) return null;
  const contenido = nombres.length > MAXIMO_NOMBRES_EN_RESUMEN ? `${formatearEntero(nombres.length)} ${plural}` : nombres.join('; ');
  return `${rotulo}: ${contenido}`;
}

function textoPeriodos(codigos: string[], cantidadDelTipo: number): string {
  if (!codigos.length) return 'Periodos: ninguno';
  if (codigos.length === cantidadDelTipo && codigos.length > 1) return `Periodos: ${codigos[0]} a ${codigos[codigos.length - 1]}`;
  return `Periodos: ${codigos.join(', ')}`;
}

export function describirFiltros(modelo: Modelo, filtros: Filtros): string {
  const tipo = modelo.tiposPeriodo.find(candidato => candidato.clave === filtros.tipo);
  const codigos = ordenarNumeros(filtros.periodos).map(periodo => modelo.periodos[periodo]);
  return [
    `Tipo de periodo: ${tipo?.etiqueta ?? filtros.tipo}`,
    textoPeriodos(codigos, periodosDeTipo(modelo, filtros.tipo).length),
    resumirLista('Sedes', filtros.sedes.map(sede => modelo.nombres.sede[sede]), 'sedes'),
    resumirLista('Facultades', filtros.facultades.map(facultad => modelo.nombres.facultad[facultad]), 'facultades'),
    resumirLista('Unidades académicas básicas', filtros.uabs.map(uab => modelo.nombres.uab[uab]), 'unidades'),
    resumirLista('Asignaturas', filtros.asignaturas.map(asignatura => modelo.codigos.asignatura[asignatura]), 'asignaturas')
  ].filter(Boolean).map(parte => `${parte}.`).join(' ');
}
