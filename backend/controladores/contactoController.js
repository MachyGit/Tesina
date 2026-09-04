// backend/controladores/contactoController.js
const transporter = require('../config/mailer');

// Validación simple de email
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// ── RECIBIR CONSULTA DEL FORMULARIO PÚBLICO ───────────────────────────────────
// El formulario de la página principal manda: { nombre, email, asunto, mensaje }
// El mail SIEMPRE llega a la casilla configurada en MAIL_DESTINO (la de la escuela),
// nunca se le pide al usuario que ponga el destinatario.
exports.enviarConsulta = async (req, res) => {
  const { nombre, email, asunto, mensaje } = req.body;

  // ── Definición: validar que estén todos los campos ──
  if (!nombre || !email || !asunto || !mensaje) {
    return res.status(400).json({ error: 'Todos los campos son obligatorios' });
  }
  if (!EMAIL_REGEX.test(email)) {
    return res.status(400).json({ error: 'El email no es válido' });
  }
  if (mensaje.length > 3000) {
    return res.status(400).json({ error: 'El mensaje es demasiado largo' });
  }

  const destino = process.env.MAIL_DESTINO || process.env.MAIL_USER;
  if (!destino) {
    return res.status(503).json({ error: 'El sistema de correo no está configurado. Avisá al administrador.' });
  }

  // ── Despacho: armar y enviar el mail ──
  try {
    await transporter.sendMail({
      from: `"Campus PROA — Formulario web" <${process.env.MAIL_USER}>`,
      to: destino,
      replyTo: email, // así, al responder, le contestás directo al que escribió
      subject: `[Consulta web] ${asunto}`,
      text:
        `Nueva consulta desde la página de la escuela\n\n` +
        `Nombre: ${nombre}\n` +
        `Email:  ${email}\n` +
        `Asunto: ${asunto}\n\n` +
        `Mensaje:\n${mensaje}`,
      html: `
        <div style="font-family:sans-serif; max-width:560px;">
          <h2 style="color:#0b3d63;">Nueva consulta desde la página web</h2>
          <p><strong>Nombre:</strong> ${_esc(nombre)}</p>
          <p><strong>Email:</strong> ${_esc(email)}</p>
          <p><strong>Asunto:</strong> ${_esc(asunto)}</p>
          <hr style="border:none;border-top:1px solid #e5e7eb;margin:16px 0;">
          <p style="white-space:pre-wrap;">${_esc(mensaje)}</p>
        </div>`,
    });

    res.json({ message: 'Consulta enviada correctamente. Te vamos a responder a la brevedad.' });
  } catch (err) {
    // Try-except: si falla el servidor de mail, no rompemos el sistema,
    // devolvemos un error claro al usuario.
    console.error('Error al enviar consulta:', err.message);
    res.status(502).json({ error: 'No se pudo enviar el mensaje. Intentá de nuevo más tarde.' });
  }
};

function _esc(str) {
  return String(str || '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
