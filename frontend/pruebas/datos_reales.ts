import { readFileSync } from 'node:fs';
import { crearModelo, type Meta, type RegistrosCrudos } from '../src/dominio/modelo';

const leerJson = (ruta: string) => JSON.parse(readFileSync(new URL(ruta, import.meta.url), 'utf8'));

export const meta: Meta = leerJson('./datos/meta.json');
export const registros: RegistrosCrudos = leerJson('./datos/registros.json');
export const modelo = crearModelo(meta, registros);
export const posicionDe = (lista: [string, ...unknown[]][], codigo: string) => lista.findIndex(([candidato]) => candidato === codigo);
