// © 2026 Pito, Santiago Vigna y Santiago Machado — Campus Virtual PROA. Todos los derechos reservados (ver LICENSE).
// "Sigo vivo": mandá esto por cron (ej. cada 6 horas) en el servidor donde
// corre el campus. Si dejás de recibir este mensaje, el servidor se apagó,
// perdiste el acceso, o alguien lo dio de baja.
require('dotenv').config();
const { enviarAlerta } = require('../utils/alertaTelegram');
const A = require('../config/autoria');
enviarAlerta(`✅ <b>Campus Virtual PROA</b> sigue en línea.\n${A.TEXTO}\n${new Date().toLocaleString('es-AR')}`)
  .then((ok) => process.exit(ok ? 0 : 1));
