const SEPARADOR = ';';
const MARCA_UTF8 = '﻿';

export interface ColumnaCsv {
  clave: string;
  titulo: string;
}

function celdaCsv(valor: unknown): string {
  const texto = valor == null
    ? ''
    : typeof valor === 'number' ? String(Math.round(valor * 100) / 100).replace('.', ',') : String(valor);
  return /[;"\r\n]/.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto;
}

export function construirCsv(columnas: ColumnaCsv[], filas: Record<string, unknown>[]): string {
  const encabezado = columnas.map(columna => celdaCsv(columna.titulo)).join(SEPARADOR);
  const cuerpo = filas.map(fila => columnas.map(columna => celdaCsv(fila[columna.clave])).join(SEPARADOR));
  return MARCA_UTF8 + [encabezado, ...cuerpo].join('\r\n');
}
