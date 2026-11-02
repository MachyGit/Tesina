// © 2026 Pito, Santiago Vigna y Santiago Machado — Campus Virtual PROA. Todos los derechos reservados (ver LICENSE).
// backend/utils/anios.js
// Reglas de "a qué año pertenece qué" en un solo lugar, para que avisos, archivos,
// materias y asistencia apliquen SIEMPRE la misma restricción:
//   - un alumno solo ve lo de SU año (y lo general, que no tiene año asignado)
//   - un profesor solo publica en los años donde dicta alguna materia
//   - director / secretaria / preceptor ven y publican en todos los años
const pool = require('../config/db');

// Texto "2do año" para mostrar en pantalla (PROA tiene un solo turno y una sola división).
// `alias` = alias de la tabla anios en el SQL.
const etiquetaAnio = (alias = 'a') => `${alias}.nombre`;
const ETIQUETA_ANIO = etiquetaAnio('a');

const ROLES_TODOS_LOS_ANIOS = ['director', 'secretaria', 'preceptor'];

// Devuelve los años donde el usuario puede PUBLICAR / SUBIR material.
//   null  → todos los años
//   [ids] → solo esos
const aniosDestinoDe = async (user) => {
  if (ROLES_TODOS_LOS_ANIOS.includes(user.rol)) return null;

  if (user.rol === 'profesor') {
    const [rows] = await pool.query(
      'SELECT DISTINCT anio_id FROM materias WHERE profesor_id = ? AND anio_id IS NOT NULL',
      [user.id]
    );
    // Si todavía no le asignaron ninguna materia, no se lo bloquea del todo
    // (la dirección puede no haber cargado las materias aún): puede publicar
    // en cualquier año. En cuanto tenga materias, queda limitado a esos años.
    return rows.length ? rows.map(r => r.anio_id) : null;
  }
  return [];
};

// ¿Puede este usuario publicar/subir material en el año `anioId`?
// anioId null = "todos los años" (general).
const puedePublicarEnAnio = async (user, anioId) => {
  const permitidos = await aniosDestinoDe(user);
  if (permitidos === null) return true;
  if (anioId === null || anioId === undefined) return false; // general solo para quien ve todo
  return permitidos.includes(Number(anioId));
};

// ¿Puede este usuario VER contenido del año `anioId`?
// Contenido sin año (null) es general: lo ve cualquiera.
const puedeVerAnio = (user, anioId) => {
  if (user.rol !== 'alumno') return true;
  if (anioId === null || anioId === undefined) return true;
  return Number(user.anio_id) === Number(anioId);
};

const anioExiste = async (anioId) => {
  const [r] = await pool.query('SELECT id FROM anios WHERE id = ?', [anioId]);
  return r.length > 0;
};

// Entero positivo o null. (undefined, '', 'null', 0 → null)
const aIdONulo = (v) => {
  if (v === undefined || v === null || v === '' || v === 'null') return null;
  const n = parseInt(v, 10);
  return Number.isInteger(n) && n > 0 ? n : NaN;
};

module.exports = {
  ETIQUETA_ANIO,
  etiquetaAnio,
  aniosDestinoDe,
  puedePublicarEnAnio,
  puedeVerAnio,
  anioExiste,
  aIdONulo,
};
