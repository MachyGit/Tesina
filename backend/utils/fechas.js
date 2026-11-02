// © 2026 Pito, Santiago Vigna y Santiago Machado — Campus Virtual PROA. Todos los derechos reservados (ver LICENSE).
// backend/utils/fechas.js
// Fechas en HORA LOCAL del servidor (no UTC).
// Antes se usaba new Date().toISOString().split('T')[0], que devuelve la fecha en
// UTC: en Argentina, después de las 21:00 ya era "mañana", y la asistencia del
// turno noche se guardaba con el día equivocado.

const dos = (n) => String(n).padStart(2, '0');

// 'YYYY-MM-DD' de hoy (o de la fecha que se pase), en hora local.
const hoyLocal = (d = new Date()) =>
  `${d.getFullYear()}-${dos(d.getMonth() + 1)}-${dos(d.getDate())}`;

// 'HH:MM:SS' de ahora, en hora local.
const horaLocal = (d = new Date()) =>
  `${dos(d.getHours())}:${dos(d.getMinutes())}:${dos(d.getSeconds())}`;

// Valida 'YYYY-MM-DD' (y que sea una fecha real).
const esFechaISO = (s) => {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00`);
  return !isNaN(d.getTime()) && hoyLocal(d) === s;
};

module.exports = { hoyLocal, horaLocal, esFechaISO, dos };
