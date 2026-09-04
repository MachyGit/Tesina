// backend/controladores/authController.js
const pool    = require('../config/db');
const bcrypt  = require('bcryptjs');
const jwt     = require('jsonwebtoken');
const { logAction } = require('../middleware/sessionLogger');
const transporter = require('../config/mailer');
const {
  generarCodigo,
  generarTokenLink,
  hashToken,
  guardarCodigo,
  buscarCodigoValido,
  marcarUsado,
} = require('../utils/codigosPassword');

// ── LOGIN ──────────────────────────────────────────────────────────────────────
exports.login = async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email y contraseña son requeridos' });
  }

  const ip        = req.ip;
  const userAgent = req.headers['user-agent'] || '';

  try {
    const [rows] = await pool.query(
      'SELECT * FROM users WHERE email = ? AND activo = 1',
      [email.toLowerCase().trim()]
    );

    if (!rows.length) {
      return res.status(401).json({ error: 'Credenciales incorrectas' });
    }

    const user = rows[0];

    // Cuenta recién creada o reseteada: todavía no tiene una contraseña
    // propia, tiene que entrar con el código que le mandamos por mail.
    if (user.debe_cambiar_password) {
      return res.status(403).json({
        error: 'Todavía no definiste tu contraseña. Usá el código que recibiste por email para completar el ingreso.',
        debeUsarCodigo: true,
      });
    }

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      await logAction(user.id, 'LOGIN_FALLIDO', ip, userAgent);
      return res.status(401).json({ error: 'Credenciales incorrectas' });
    }

    await logAction(user.id, 'LOGIN', ip, userAgent);

    const token = jwt.sign(
      { id: user.id, rol: user.rol, nombre: user.nombre },
      process.env.JWT_SECRET,
      { expiresIn: '8h' }
    );

    res.json({
      token,
      user: {
        id:    user.id,
        nombre: user.nombre,
        email:  user.email,
        rol:    user.rol,
        foto:   user.foto || null,
        curso_id: user.curso_id || null,
      }
    });

  } catch (err) {
    console.error('Error en login:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// ── LOGOUT ─────────────────────────────────────────────────────────────────────
exports.logout = async (req, res) => {
  try {
    await logAction(req.user.id, 'LOGOUT', req.ip, req.headers['user-agent']);
    res.json({ message: 'Sesión cerrada correctamente' });
  } catch (err) {
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// ── LOGIN CON CÓDIGO (primer ingreso / cuenta reseteada) ────────────────────────
// El usuario recibió un código de 6 dígitos por mail (al crearse la cuenta, o
// porque un director/secretaria le reseteó la clave). Con email + código entra
// una sola vez, con una sesión corta, y desde ahí el frontend lo manda directo
// a definir su contraseña (PUT /api/users/password).
exports.loginConCodigo = async (req, res) => {
  const { email, codigo } = req.body;

  if (!email || !codigo) {
    return res.status(400).json({ error: 'Email y código son requeridos' });
  }

  const ip        = req.ip;
  const userAgent = req.headers['user-agent'] || '';

  try {
    const [rows] = await pool.query(
      'SELECT * FROM users WHERE email = ? AND activo = 1',
      [email.toLowerCase().trim()]
    );
    if (!rows.length) {
      return res.status(401).json({ error: 'Credenciales incorrectas' });
    }

    const user = rows[0];
    const registro = await buscarCodigoValido(codigo.trim(), 'primer_login');

    if (!registro || registro.user_id !== user.id) {
      await logAction(user.id, 'LOGIN_CODIGO_FALLIDO', ip, userAgent);
      return res.status(401).json({ error: 'Código incorrecto o vencido' });
    }

    await marcarUsado(registro.id);
    await logAction(user.id, 'LOGIN_CODIGO', ip, userAgent);

    // Sesión corta: alcanza para entrar y definir la contraseña, nada más.
    const token = jwt.sign(
      { id: user.id, rol: user.rol, nombre: user.nombre },
      process.env.JWT_SECRET,
      { expiresIn: '30m' }
    );

    res.json({
      token,
      debeCambiarPassword: true,
      user: { id: user.id, nombre: user.nombre, email: user.email, rol: user.rol }
    });
  } catch (err) {
    console.error('Error en login con código:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// ── SOLICITAR RECUPERACIÓN DE CONTRASEÑA ────────────────────────────────────────
// El usuario perdió su clave pero todavía tiene acceso a su mail registrado.
// Le mandamos un enlace con un token de un solo uso, válido 1 hora.
exports.solicitarRecuperacion = async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'El email es requerido' });

  // Respuesta genérica siempre (exista o no la cuenta), para no revelar
  // qué emails están registrados en el sistema.
  const mensajeGenerico = {
    message: 'Si el email está registrado, vas a recibir un enlace para restablecer tu contraseña.'
  };

  try {
    const [rows] = await pool.query(
      'SELECT id, nombre, email FROM users WHERE email = ? AND activo = 1',
      [email.toLowerCase().trim()]
    );
    if (!rows.length) return res.json(mensajeGenerico);

    const user = rows[0];
    const tokenCrudo = generarTokenLink();
    await guardarCodigo(user.id, hashToken(tokenCrudo), 'recuperacion', 60);

    const base = process.env.FRONTEND_URL || 'http://localhost:5500/frontend-web/public';
    const enlace = `${base}/reset-password.html?token=${tokenCrudo}`;

    await transporter.sendMail({
      from: `"Campus PROA" <${process.env.MAIL_USER}>`,
      to: user.email,
      subject: 'Restablecer tu contraseña — Campus Virtual PROA',
      text:
        `Hola ${user.nombre},\n\n` +
        `Pediste restablecer tu contraseña. Entrá al siguiente enlace (válido por 1 hora):\n${enlace}\n\n` +
        `Si no fuiste vos, ignorá este mensaje: tu clave actual sigue funcionando.`,
      html: `
        <div style="font-family:sans-serif; max-width:560px;">
          <h2 style="color:#0b3d63;">Restablecer contraseña</h2>
          <p>Hola ${user.nombre},</p>
          <p>Pediste restablecer tu contraseña. El enlace es válido por 1 hora.</p>
          <p><a href="${enlace}" style="background:#0b3d63;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none;">Restablecer contraseña</a></p>
          <p style="color:#6b7280;font-size:13px;">Si no fuiste vos, ignorá este mensaje: tu clave actual sigue funcionando.</p>
        </div>`,
    });

    res.json(mensajeGenerico);
  } catch (err) {
    console.error('Error al solicitar recuperación:', err);
    // Igual devolvemos el mensaje genérico: no filtramos si falló el mail
    // o si el email no existía.
    res.json(mensajeGenerico);
  }
};

// ── RESETEAR CONTRASEÑA CON EL ENLACE DEL MAIL ──────────────────────────────────
exports.resetearPassword = async (req, res) => {
  const { token, passwordNueva } = req.body;

  if (!token || !passwordNueva) {
    return res.status(400).json({ error: 'Faltan datos' });
  }
  if (passwordNueva.length < 8) {
    return res.status(400).json({ error: 'La contraseña debe tener al menos 8 caracteres' });
  }

  try {
    const registro = await buscarCodigoValido(hashToken(token), 'recuperacion');
    if (!registro) {
      return res.status(400).json({ error: 'El enlace no es válido o ya venció. Pedí uno nuevo.' });
    }

    const hash = await bcrypt.hash(passwordNueva, 10);
    await pool.query(
      'UPDATE users SET password = ?, debe_cambiar_password = 0 WHERE id = ?',
      [hash, registro.user_id]
    );
    await marcarUsado(registro.id);
    await logAction(registro.user_id, 'RESET_PASSWORD_AUTOGESTIONADO', req.ip, req.headers['user-agent']);

    res.json({ message: 'Contraseña actualizada. Ya podés iniciar sesión.' });
  } catch (err) {
    console.error('Error al restablecer contraseña:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};
