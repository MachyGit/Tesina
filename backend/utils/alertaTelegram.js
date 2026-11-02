// © 2026 Pito, Santiago Vigna y Santiago Machado — Campus Virtual PROA. Todos los derechos reservados (ver LICENSE).
// backend/utils/alertaTelegram.js
// Avisos a tu propio Telegram (no al de la escuela) cuando algo pasa con la
// firma de autoría o con el servidor. Solo AVISA: nunca bloquea ni apaga nada.
const https = require('https');

const TOKEN = process.env.ALERTA_TG_TOKEN || '';
const CHAT_ID = process.env.ALERTA_TG_CHAT_ID || '';
let avisadoSinConfigurar = false;

function enviarAlerta(texto) {
  if (!TOKEN || !CHAT_ID) {
    if (!avisadoSinConfigurar) {
      console.log('ℹ️  Avisos por Telegram no configurados (ALERTA_TG_TOKEN / ALERTA_TG_CHAT_ID en el .env).');
      avisadoSinConfigurar = true;
    }
    return Promise.resolve(false);
  }
  const body = JSON.stringify({ chat_id: CHAT_ID, text: texto, parse_mode: 'HTML', disable_web_page_preview: true });
  return new Promise((resolve) => {
    const req = https.request(
      {
        hostname: 'api.telegram.org',
        path: `/bot${TOKEN}/sendMessage`,
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
        timeout: 10000,
      },
      (res) => { res.on('data', () => {}); res.on('end', () => resolve(res.statusCode === 200)); }
    );
    req.on('error', (e) => { console.error('⚠️  No se pudo avisar por Telegram:', e.message); resolve(false); });
    req.on('timeout', () => { req.destroy(); resolve(false); });
    req.write(body); req.end();
  });
}

module.exports = { enviarAlerta, configurado: () => !!(TOKEN && CHAT_ID) };
