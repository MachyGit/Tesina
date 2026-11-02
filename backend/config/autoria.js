// © 2026 Pito, Santiago Vigna y Santiago Machado — Campus Virtual PROA. Todos los derechos reservados (ver LICENSE).
// © Autoría de Campus Virtual PROA — ver LICENSE.
// ÚNICO lugar donde se define la autoría. Si cambia algo, se cambia acá.
const crypto = require('crypto');

const PROYECTO = 'Campus Virtual PROA';
const AUTORES = ['Pito', 'Santiago Vigna', 'Santiago Machado']; // ← poné acá los nombres completos // ← poné acá los nombres completos
const ANIO = 2026;

const lista = AUTORES.length > 1 ? `${AUTORES.slice(0, -1).join(', ')} y ${AUTORES[AUTORES.length - 1]}` : AUTORES[0];
const TEXTO = `${PROYECTO} © ${ANIO} · Desarrollado por ${lista} · Escuela ProA, Río Tercero`;
const HUELLA = crypto.createHash('sha256').update(`${PROYECTO}|${AUTORES.join(',')}|${ANIO}`).digest('hex');

module.exports = { PROYECTO, AUTORES, ANIO, TEXTO, HUELLA, corta: HUELLA.slice(0, 12) };
