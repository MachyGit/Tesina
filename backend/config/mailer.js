// © 2026 Pito, Santiago Vigna y Santiago Machado — Campus Virtual PROA. Todos los derechos reservados (ver LICENSE).
// backend/config/mailer.js
// Configuración del "cliente SMTP". El backend NO envía el correo directamente:
// le pide a un servidor SMTP que lo despache por nosotros.
//
// Tres modos, según el .env:
//   1) MAIL_HOST definido  → SMTP genérico (Brevo, Mailgun, Outlook, etc.)
//        MAIL_HOST, MAIL_PORT, MAIL_USER, MAIL_PASS, MAIL_FROM
//   2) MAIL_USER + MAIL_PASS → Gmail (con "contraseña de aplicación")
//   3) MAIL_MODO_PRUEBA=1 (o sin credenciales) → NO envía nada: imprime el mail
//      en la consola del backend. Sirve para desarrollar y probar el enlace de
//      recuperación o el código de acceso sin tener el correo configurado.
const nodemailer = require('nodemailer');
require('dotenv').config({ path: require('path').join(__dirname, '../../.env') }); // siempre el .env de la raíz, sin importar desde dónde se ejecute

const modoPrueba =
  process.env.MAIL_MODO_PRUEBA === '1' ||
  (!process.env.MAIL_HOST && (!process.env.MAIL_USER || !process.env.MAIL_PASS));

let transporter;

if (modoPrueba) {
  const real = nodemailer.createTransport({ jsonTransport: true });
  transporter = {
    sendMail: async (opts) => {
      const info = await real.sendMail(opts);
      console.log('\n📧 [MODO PRUEBA — no se envió ningún mail real]');
      console.log(`   Para:    ${opts.to}`);
      console.log(`   Asunto:  ${opts.subject}`);
      if (opts.text) console.log(`   Texto:\n${String(opts.text).split('\n').map(l => '     ' + l).join('\n')}`);
      if (opts.icalEvent) console.log('   (incluye invitación de calendario .ics)');
      console.log('');
      return info;
    },
    verify: async () => true,
  };
  console.warn('⚠️  Mail en MODO PRUEBA: los mails se imprimen en esta consola, no se envían.');
  console.warn('   Para enviar de verdad, completá MAIL_USER y MAIL_PASS (o MAIL_HOST) en el .env.');
} else if (process.env.MAIL_HOST) {
  const puerto = Number(process.env.MAIL_PORT) || 587;
  transporter = nodemailer.createTransport({
    host: process.env.MAIL_HOST,
    port: puerto,
    secure: puerto === 465,
    auth: { user: process.env.MAIL_USER, pass: process.env.MAIL_PASS },
  });
} else {
  transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: process.env.MAIL_USER, pass: process.env.MAIL_PASS },
  });
}

// Remitente que se muestra en los mails.
const direccion = process.env.MAIL_FROM || process.env.MAIL_USER || 'campus@localhost';
transporter.remitente = direccion.includes('<') ? direccion : `"Campus PROA" <${direccion}>`;
transporter.modoPrueba = modoPrueba;

// Verificar la conexión al arrancar el servidor (no frena el arranque si falla)
if (!modoPrueba) {
  transporter.verify()
    .then(() => console.log('✅ Servidor de mail listo para enviar'))
    .catch((err) => {
      console.warn('⚠️  No se pudo verificar el servidor de mail:', err.message);
      console.warn('   Los mails (recuperación de contraseña, códigos, calendario) no van a salir hasta que se configure el .env');
    });
}

module.exports = transporter;
