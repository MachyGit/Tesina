// backend/config/mailer.js
// Configuración del "cliente SMTP". El backend NO envía el correo directamente:
// le pide a un servidor SMTP (en este caso Gmail) que lo despache por nosotros.
const nodemailer = require('nodemailer');
require('dotenv').config();

const transporter = nodemailer.createTransport({
  service: 'gmail',                       // usa los servidores SMTP de Gmail
  auth: {
    user: process.env.MAIL_USER,          // la cuenta de Gmail que envía
    pass: process.env.MAIL_PASS,          // contraseña de aplicación (NO la contraseña normal)
  },
});

// Verificar la conexión al arrancar el servidor (no frena el arranque si falla)
transporter.verify()
  .then(() => console.log('✅ Servidor de mail listo para enviar consultas'))
  .catch((err) => {
    console.warn('⚠️  No se pudo verificar el servidor de mail:', err.message);
    console.warn('   El formulario de contacto no va a poder enviar correos hasta que se configure MAIL_USER y MAIL_PASS en el .env');
  });

module.exports = transporter;
