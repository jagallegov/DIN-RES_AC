import type { IdIndicador } from './definiciones';

export const ICONOS = {
  descargaImagen: 'M8 11 3.5 6.5l1.06-1.06 2.69 2.69V1.5h1.5v6.63l2.69-2.69L12.5 6.5zM2.5 13h11v1.5h-11z',
  descargaCsv: 'M3 1.5h6.5L13 5v9.5H3zm6 1V5.5h3zM5 8h6v1.2H5zm0 2.4h6v1.2H5z'
};

const PERSONA = 'M12 12a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9zm0 2c-4.4 0-8 2.2-8 5v2h16v-2c0-2.8-3.6-5-8-5z';

export const ICONOS_INDICADOR: Record<IdIndicador, string> = {
  asignaturas: 'M6 2h12a1 1 0 0 1 1 1v14H7a1 1 0 1 0 0 2h12v2H7a3 3 0 0 1-3-3V4a2 2 0 0 1 2-2z',
  cupos: 'M4 4h7v7H4zm9 0h7v7h-7zM4 13h7v7H4zm9 0h7v7h-7z',
  inscritos: PERSONA,
  tasaOcupacion: 'M7.5 10a2.5 2.5 0 1 1 0-5 2.5 2.5 0 0 1 0 5zm9 9a2.5 2.5 0 1 1 0-5 2.5 2.5 0 0 1 0 5zM5.4 19.2 17.2 4.4l1.6 1.2L7 20.4z',
  cupoCompleto: 'M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zm5 13.2 7.6-7.6-1.4-1.4-6.2 6.2-2.8-2.8-1.4 1.4z',
  inscritosCerrados: PERSONA,
  cancelaciones: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm3.5 12.1-1.4 1.4-2.1-2.1-2.1 2.1-1.4-1.4 2.1-2.1-2.1-2.1 1.4-1.4 2.1 2.1 2.1-2.1 1.4 1.4-2.1 2.1z',
  matriculaFinal: 'M6 2h8l6 6v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2zm7 1.5V9h5.5zM8 13h8v1.6H8zm0 3.5h8v1.6H8z',
  tasaCancelacion: 'M10 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h5v-2H5V5h5zm6.6 4.4-1.4 1.4 2.2 2.2H9v2h8.4l-2.2 2.2 1.4 1.4L21.2 12z',
  sinCancelaciones: 'M12 2 4 5v6c0 5 3.4 9.6 8 11 4.6-1.4 8-6 8-11V5zm-1.2 14.2-3.6-3.6 1.4-1.4 2.2 2.2 4.8-4.8 1.4 1.4z',
  matriculaConResultado: 'M9 2h6v2h3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h3zm1 1.5V5h4V3.5zM8 10h8v1.6H8zm0 3.5h8v1.6H8zm0 3.5h5v1.6H8z',
  aprobados: 'M9 16.2 4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4z',
  reprobados: 'M19 6.4 17.6 5 12 10.6 6.4 5 5 6.4 10.6 12 5 17.6 6.4 19 12 13.4 17.6 19 19 17.6 13.4 12z',
  tasaAprobacion: 'M3 17.6 9 11.6l4 4 6.6-6.6V12h2V5.6h-6.4v2h2.6L13 12.8l-4-4-7.4 7.4z',
  promedio: 'M12 17.3 18.2 21l-1.6-7L22 9.2l-7.2-.6L12 2 9.2 8.6 2 9.2l5.4 4.8L5.8 21z'
};
