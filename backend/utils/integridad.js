// © 2026 Pito, Santiago Vigna y Santiago Machado — Campus Virtual PROA. Todos los derechos reservados (ver LICENSE).
// backend/utils/integridad.js
// Verifica que la firma de autoría (backend/config/autoria.js) y los archivos
// que la insertan (server.js, backend/middleware/autoria.js) no hayan sido
// tocados, comparándolos contra el hash guardado en backend/config/autoria.lock.json.
// Si no coincide (o falta el candado), SOLO avisa por Telegram: no interrumpe nada.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { enviarAlerta } = require('./alertaTelegram');

const RAIZ = path.join(__dirname, '../..');
const ARCHIVOS = ['server.js', 'backend/middleware/autoria.js', 'backend/config/autoria.js'];
const LOCK = path.join(__dirname, '../config/autoria.lock.json');

function hashActual() {
  const h = crypto.createHash('sha256');
  for (const f of ARCHIVOS) h.update(fs.readFileSync(path.join(RAIZ, f), 'utf8'));
  return h.digest('hex');
}

function generarCandado() {
  const hash = hashActual();
  fs.writeFileSync(LOCK, JSON.stringify({ hash, archivos: ARCHIVOS, generado: new Date().toISOString() }, null, 2) + '\n');
  return hash;
}

async function verificar(etiqueta) {
  const A = require('../config/autoria');
  let candado = null;
  try { candado = JSON.parse(fs.readFileSync(LOCK, 'utf8')); } catch {}
  const hash = hashActual();

  if (!candado) {
    console.log('ℹ️  No hay candado de integridad (backend/config/autoria.lock.json). Corré: npm run firmar');
    return;
  }
  if (candado.hash !== hash) {
    const msg = `⚠️ <b>Campus Virtual PROA</b>\nLa firma de autoría o los archivos que la agregan (${ARCHIVOS.join(', ')}) fueron modificados respecto de lo registrado.\nServidor: ${process.env.FRONTEND_PUBLIC_URL || process.env.FRONTEND_URL || 'sin URL configurada'}\nMomento: ${new Date().toLocaleString('es-AR')}\n\nEsto es solo un aviso: el campus sigue funcionando normalmente.`;
    console.warn('🚨 Integridad de la firma de autoría: NO coincide con el candado guardado.');
    await enviarAlerta(msg);
  } else {
    console.log(`✅ Integridad de la firma de autoría OK (${etiqueta}).`);
  }
}

module.exports = { verificar, generarCandado, hashActual };
