export const SIN_DATO = 'n. d.';
export const ESPACIO_FIJO = ' ';
export const COMPARADOR_ESPANOL = new Intl.Collator('es');

const MESES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'
];
const PALABRAS_MENORES = new Set(['de', 'del', 'la', 'las', 'los', 'y', 'e', 'en', 'para', 'a', 'el', 'con', 'o', 'u', 'por', 'al']);
const SIGLAS = new Set([
  'CES', 'FMVZ', 'HSJD', 'IBUN', 'ICTA', 'IDEA', 'IECO', 'IEPRI', 'PAE', 'UAB', 'UNAL',
  'II', 'III', 'IV', 'VI', 'VII', 'VIII', 'IX'
]);
const BORDES_SIN_LETRA = /^[^\p{L}]+|[^\p{L}]+$/gu;
const PRIMERA_LETRA = /\p{L}/u;
const PATRON_FECHA_ISO = /^(\d{4})-(\d{2})-(\d{2})$/;

const esNumero = (valor: unknown): valor is number => typeof valor === 'number' && Number.isFinite(valor);
const agruparMiles = (digitos: number | string) => String(digitos).replace(/\B(?=(\d{3})+(?!\d))/g, '.');

export function conPlural(cantidad: number, singular: string, plural: string): string {
  return cantidad === 1 ? singular : plural;
}

export function ordenarNumeros(lista: Iterable<number>): number[] {
  return [...lista].sort((primero, segundo) => primero - segundo);
}

export function formatearEntero(valor: number | null | undefined): string {
  return esNumero(valor) ? agruparMiles(Math.round(valor)) : SIN_DATO;
}

export function formatearDecimal(valor: number | null | undefined, decimales: number): string {
  if (!esNumero(valor)) return SIN_DATO;
  const [entero, fraccion] = Math.abs(valor).toFixed(decimales).split('.');
  return (valor < 0 ? '-' : '') + agruparMiles(entero) + (decimales ? ',' + fraccion : '');
}

export function formatearPorcentaje(valor: number | null | undefined): string {
  return esNumero(valor) ? formatearDecimal(valor, 1) + ESPACIO_FIJO + '%' : SIN_DATO;
}

export function formatearCompacto(valor: number | null | undefined): string {
  if (!esNumero(valor)) return SIN_DATO;
  if (valor >= 1e6) return formatearDecimal(valor / 1e6, 1) + ESPACIO_FIJO + 'M';
  if (valor >= 1e4) return formatearDecimal(valor / 1e3, 0) + ESPACIO_FIJO + 'mil';
  return formatearEntero(valor);
}

export function formatearFechaLarga(fechaIso: string | null | undefined): string {
  const partes = PATRON_FECHA_ISO.exec(fechaIso ?? '');
  if (!partes) return fechaIso ?? SIN_DATO;
  const [, anio, mes, dia] = partes.map(Number);
  return `${dia} de ${MESES[mes - 1]} de ${anio}`;
}

export function formatearMomento(instanteIso: string | null | undefined): string {
  const instante = new Date(instanteIso ?? '');
  if (Number.isNaN(instante.getTime())) return instanteIso ?? SIN_DATO;
  const hora = `${instante.getHours()}`.padStart(2, '0') + ':' + `${instante.getMinutes()}`.padStart(2, '0');
  return `${instante.getDate()} de ${MESES[instante.getMonth()]} de ${instante.getFullYear()}, ${hora}`;
}

export function formatearHora(instante: Date): string {
  return [instante.getHours(), instante.getMinutes(), instante.getSeconds()].map(parte => `${parte}`.padStart(2, '0')).join(':');
}

export function listarEnEspanol(elementos: string[]): string {
  if (elementos.length < 2) return elementos.join('');
  return elementos.slice(0, -1).join(', ') + ' y ' + elementos[elementos.length - 1];
}

export function normalizarBusqueda(texto: string): string {
  return texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

function convertirPalabra(palabra: string, posicion: number): string {
  if (SIGLAS.has(palabra.replace(BORDES_SIN_LETRA, '').toUpperCase())) return palabra.toUpperCase();
  if (posicion > 0 && PALABRAS_MENORES.has(palabra)) return palabra;
  return palabra.replace(PRIMERA_LETRA, letra => letra.toUpperCase());
}

const ACENTOS: Record<string, string> = {
  academica: 'académica', administracion: 'administración', agricola: 'agrícola', agronomia: 'agronomía', amazonia: 'amazonía',
  andres: 'andrés', antropologia: 'antropología', astronomico: 'astronómico', basicas: 'básicas', biologia: 'biología',
  biomedicas: 'biomédicas', biotecnologia: 'biotecnología', bogota: 'bogotá', cirugia: 'cirugía', clinicas: 'clínicas',
  computacion: 'computación', construccion: 'construcción', contaduria: 'contaduría', desordenes: 'desórdenes', direccion: 'dirección',
  diseno: 'diseño', economia: 'economía', economicas: 'económicas', educacion: 'educación', electrica: 'eléctrica',
  electronica: 'electrónica', enfermeria: 'enfermería', estadistica: 'estadística', esteticas: 'estéticas', filosofia: 'filosofía',
  fisica: 'física', genero: 'género', genetica: 'genética', geografia: 'geografía', grafico: 'gráfico', habitat: 'hábitat',
  informatica: 'informática', ingeneria: 'ingeniería', ingenieria: 'ingeniería', investigacion: 'investigación',
  linguistica: 'lingüística', matematicas: 'matemáticas', mecanica: 'mecánica', mecatronica: 'mecatrónica', medellin: 'medellín',
  musica: 'música', nutricion: 'nutrición', ocupacion: 'ocupación', odontologia: 'odontología', orinoquia: 'orinoquía',
  planeacion: 'planeación', plasticas: 'plásticas', politica: 'política', politicos: 'políticos', practica: 'práctica',
  produccion: 'producción', psicoanalisis: 'psicoanálisis', publica: 'pública', quimica: 'química', rehabilitacion: 'rehabilitación',
  representacion: 'representación', sicologia: 'sicología', sociologia: 'sociología', tecnologia: 'tecnología', television: 'televisión'
};
const ETIQUETAS_FINALES = /\s+(FAC CIENCIAS|C\. HUMANAS|C\. ECONOMICAS|CIENCIAS|ARTES|MEDICINA|ODONTOLOGIA|ENFERMERIA|AGRONOMIA)$/;
const SEDE_FINAL = /\s+(BOGOTA|BOGOTÁ|BOG)$/;
const TERMINA_EN_ENLACE = /\s(DE|DEL|LA|LAS|LOS|Y|E|EN|PARA|A|EL|CON|O|U|POR|AL)$/;

function quitarEtiquetas(texto: string): string {
  if (/^(SEDE|FACULTAD)\s/.test(texto)) return texto;
  const sinSede = texto.replace(SEDE_FINAL, '');
  const sinEtiqueta = sinSede.replace(ETIQUETAS_FINALES, '');
  return TERMINA_EN_ENLACE.test(sinEtiqueta) ? sinSede : sinEtiqueta;
}

export function nombreUnidad(texto: string): string {
  if (texto !== texto.toUpperCase()) return texto;
  const acentuado = quitarEtiquetas(texto).split(' ').map(palabra => (ACENTOS[palabra.toLowerCase()] ?? palabra).toUpperCase()).join(' ');
  return nombrePropio(acentuado);
}

export function nombrePropio(texto: string): string {
  if (texto !== texto.toUpperCase()) return texto;
  return texto.toLowerCase().split(' ').map(convertirPalabra).join(' ');
}

export function partirEnLineas(texto: string, anchoMaximo: number, medirAncho: (texto: string) => number): string[] {
  const lineas: string[] = [];
  let actual = '';
  texto.split(/\s+/).filter(Boolean).forEach(palabra => {
    const tentativa = actual ? `${actual} ${palabra}` : palabra;
    if (actual && medirAncho(tentativa) > anchoMaximo) {
      lineas.push(actual);
      actual = palabra;
    } else {
      actual = tentativa;
    }
  });
  if (actual) lineas.push(actual);
  return lineas;
}

export function escaparHtml(texto: unknown): string {
  return String(texto).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
