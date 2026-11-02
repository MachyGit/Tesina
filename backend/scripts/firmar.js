// © 2026 Pito, Santiago Vigna y Santiago Machado — Campus Virtual PROA. Todos los derechos reservados (ver LICENSE).
// Recalcula y guarda el candado de integridad de la firma de autoría.
// Corré esto cada vez que cambies a propósito backend/config/autoria.js,
// server.js o backend/middleware/autoria.js (por ejemplo, al completar los
// nombres y apellidos). Si no lo corrés, vas a recibir una alerta de Telegram
// avisando "modificado" aunque el cambio lo hayas hecho vos.
const { generarCandado } = require('../utils/integridad');
const hash = generarCandado();
console.log('🔏 Candado de integridad actualizado.');
console.log('   Hash:', hash);
