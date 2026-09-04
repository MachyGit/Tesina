// backend/controladores/userController.js
const pool   = require('../config/db');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const transporter = require('../config/mailer');
const { logAction } = require('../middleware/sessionLogger');
const {
  generarCodigo,
  guardarCodigo,
} = require('../utils/codigosPassword');

const ROLES_VALIDOS  = ['director','secretaria','preceptor','profesor','alumno'];
const ROL_PROTEGIDO  = 'director'; // el sistema siempre necesita al menos un usuario activo con este rol
const MAX_FOTO_BYTES = 2 * 1024 * 1024 * 1.37; // ~2MB en base64

// Devuelve true si `userId` es el único usuario activo con el rol `rol`
// (es decir, si sacárselo/desactivarlo lo dejaría en cero).
const esUltimoConRol = async (rol, userId) => {
  const [rows] = await pool.query(
    'SELECT COUNT(*) AS total FROM users WHERE rol = ? AND activo = 1 AND id != ?',
    [rol, userId]
  );
  return rows[0].total === 0;
};

// Envía el mail con el código de acceso (primer ingreso). Se usa tanto al
// crear la cuenta como cuando un director/secretaria resetea la clave de
// alguien que sí tiene acceso a su mail.
const enviarCodigoAcceso = async (destinatario, nombre, codigo) => {
  await transporter.sendMail({
    from: `"Campus PROA" <${process.env.MAIL_USER}>`,
    to: destinatario,
    subject: 'Tu código de acceso — Campus Virtual PROA',
    text:
      `Hola ${nombre},\n\n` +
      `Tu código de acceso es: ${codigo}\n\n` +
      `Entrá en la página de login con tu email y este código para completar tu registro definiendo tu contraseña. ` +
      `El código vence en 60 minutos.`,
    html: `
      <div style="font-family:sans-serif; max-width:560px;">
        <h2 style="color:#0b3d63;">Bienvenido/a a Campus Virtual PROA</h2>
        <p>Hola ${nombre},</p>
        <p>Tu código de acceso es:</p>
        <p style="font-size:28px;font-weight:700;letter-spacing:4px;color:#0b3d63;">${codigo}</p>
        <p>Entrá con tu email y este código para completar tu registro definiendo tu contraseña. Vence en 60 minutos.</p>
      </div>`,
  });
};

// ── CREAR USUARIO ──────────────────────────────────────────────────────────────
// La cuenta se crea SIN contraseña utilizable: se le asigna un hash aleatorio
// que nadie conoce y queda marcada con debe_cambiar_password = 1. Se manda un
// código de 6 dígitos al mail; con ese código el usuario entra una vez y
// define su propia clave (ver authController.loginConCodigo).
exports.crearUsuario = async (req, res) => {
  const { nombre, email, rol, curso_id } = req.body;

  if (!nombre || !email || !rol) {
    return res.status(400).json({ error: 'Faltan campos requeridos' });
  }
  if (!ROLES_VALIDOS.includes(rol)) {
    return res.status(400).json({ error: 'Rol inválido' });
  }

  try {
    const [existe] = await pool.query('SELECT id FROM users WHERE email = ?', [email.toLowerCase()]);
    if (existe.length) {
      return res.status(409).json({ error: 'El email ya está registrado' });
    }

    // Contraseña provisoria aleatoria: nadie la conoce, es solo para
    // satisfacer el NOT NULL de la columna hasta que el usuario defina la suya.
    const passwordProvisoria = crypto.randomBytes(32).toString('hex');
    const hash = await bcrypt.hash(passwordProvisoria, 10);

    const [result] = await pool.query(
      'INSERT INTO users (nombre, email, password, rol, curso_id, creado_por, debe_cambiar_password) VALUES (?, ?, ?, ?, ?, ?, 1)',
      [nombre.trim(), email.toLowerCase().trim(), hash, rol, curso_id || null, req.user.id]
    );

    const codigo = generarCodigo();
    await guardarCodigo(result.insertId, codigo, 'primer_login', 60, req.user.id);
    await enviarCodigoAcceso(email.toLowerCase().trim(), nombre.trim(), codigo);

    res.status(201).json({
      message: 'Usuario creado. Se envió un código de acceso a su email para completar el registro.',
      id: result.insertId
    });
  } catch (err) {
    console.error('Error al crear usuario:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// ── LISTAR USUARIOS ────────────────────────────────────────────────────────────
exports.listarUsuarios = async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT u.id, u.nombre, u.email, u.rol, u.activo,
             u.fecha_creacion, u.telegram_id,
             c.nombre AS curso, c.division
      FROM users u
      LEFT JOIN cursos c ON u.curso_id = c.id
      ORDER BY u.rol, u.nombre
    `);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// ── OBTENER PERFIL PROPIO ──────────────────────────────────────────────────────
exports.obtenerPerfil = async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT u.id, u.nombre, u.email, u.rol, u.foto,
             u.telegram_id, u.fecha_creacion,
             c.nombre AS curso, c.division, c.turno
      FROM users u
      LEFT JOIN cursos c ON u.curso_id = c.id
      WHERE u.id = ?
    `, [req.user.id]);

    if (!rows.length) return res.status(404).json({ error: 'Usuario no encontrado' });

    // No devolver la foto completa en el listado para no saturar
    const user = rows[0];
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// ── SUBIR / ACTUALIZAR FOTO ────────────────────────────────────────────────────
exports.subirFoto = async (req, res) => {
  const { foto } = req.body;

  if (!foto) return res.status(400).json({ error: 'No se recibió ninguna imagen' });
  if (!foto.startsWith('data:image/')) {
    return res.status(400).json({ error: 'Formato de imagen inválido. Usá JPG o PNG.' });
  }
  if (foto.length > MAX_FOTO_BYTES) {
    return res.status(400).json({ error: 'La imagen supera los 2MB permitidos' });
  }

  try {
    await pool.query('UPDATE users SET foto = ? WHERE id = ?', [foto, req.user.id]);
    res.json({ message: 'Foto actualizada', foto });
  } catch (err) {
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// ── ASIGNAR ROL ────────────────────────────────────────────────────────────────
exports.asignarRol = async (req, res) => {
  const { userId, nuevoRol } = req.body;
  if (!ROLES_VALIDOS.includes(nuevoRol)) {
    return res.status(400).json({ error: 'Rol inválido' });
  }
  try {
    const [rows] = await pool.query('SELECT rol FROM users WHERE id = ?', [userId]);
    if (!rows.length) return res.status(404).json({ error: 'Usuario no encontrado' });

    const rolActual = rows[0].rol;

    // Bloqueo: si este usuario es el único director activo, no se le puede
    // sacar el rol (dejaría al sistema sin nadie con permisos de director).
    // Si hay 2 o más, se puede cambiar sin problema.
    if (rolActual === ROL_PROTEGIDO && nuevoRol !== ROL_PROTEGIDO) {
      const esUltimo = await esUltimoConRol(ROL_PROTEGIDO, userId);
      if (esUltimo) {
        return res.status(409).json({
          error: `No se puede cambiar el rol: es el único ${ROL_PROTEGIDO} activo del sistema. Asigná el rol de ${ROL_PROTEGIDO} a otra persona antes de sacárselo.`
        });
      }
    }

    const [r] = await pool.query('UPDATE users SET rol = ? WHERE id = ?', [nuevoRol, userId]);
    if (!r.affectedRows) return res.status(404).json({ error: 'Usuario no encontrado' });
    res.json({ message: 'Rol actualizado' });
  } catch (err) {
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// ── ACTIVAR / DESACTIVAR USUARIO ───────────────────────────────────────────────
exports.toggleActivo = async (req, res) => {
  const { userId } = req.params;
  try {
    const [rows] = await pool.query('SELECT activo, rol FROM users WHERE id = ?', [userId]);
    if (!rows.length) return res.status(404).json({ error: 'Usuario no encontrado' });

    const nuevoEstado = rows[0].activo ? 0 : 1;

    // Mismo bloqueo que en el cambio de rol: desactivar al único director
    // activo tendría el mismo efecto que sacarle el rol, así que se aplica
    // la misma regla acá.
    if (nuevoEstado === 0 && rows[0].rol === ROL_PROTEGIDO) {
      const esUltimo = await esUltimoConRol(ROL_PROTEGIDO, userId);
      if (esUltimo) {
        return res.status(409).json({
          error: `No se puede desactivar: es el único ${ROL_PROTEGIDO} activo del sistema.`
        });
      }
    }

    await pool.query('UPDATE users SET activo = ? WHERE id = ?', [nuevoEstado, userId]);
    res.json({ message: nuevoEstado ? 'Usuario activado' : 'Usuario desactivado' });
  } catch (err) {
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// ── GENERAR TOKEN DE VINCULACIÓN TELEGRAM ─────────────────────────────────────
// El usuario lo solicita desde el perfil en la web, recibe un código de 6 dígitos
// y lo manda al bot con /vincular <código>
exports.generarTokenTelegram = async (req, res) => {
  try {
    // Token: 6 dígitos numéricos fácil de escribir en Telegram
    const token = String(crypto.randomInt(100000, 999999));
    const expira = new Date(Date.now() + 15 * 60 * 1000); // 15 minutos

    // Upsert: si ya tenía un token pendiente, lo reemplaza
    await pool.query(`
      INSERT INTO telegram_tokens (user_id, token, expira_en)
      VALUES (?, ?, ?)
      ON DUPLICATE KEY UPDATE token = VALUES(token), expira_en = VALUES(expira_en), usado = 0
    `, [req.user.id, token, expira]);

    res.json({
      token,
      mensaje: `Enviá este código al bot de Telegram con el comando /vincular ${token}. Expira en 15 minutos.`
    });
  } catch (err) {
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// ── EDITAR NOMBRE DE USUARIO ──────────────────────────────────────────────────
exports.editarNombre = async (req, res) => {
  const { userId } = req.params;
  const { nombre } = req.body;

  if (!nombre || nombre.trim().length < 2) {
    return res.status(400).json({ error: 'El nombre debe tener al menos 2 caracteres' });
  }

  // Un usuario puede cambiar su propio nombre; admins pueden cambiar cualquiera
  const esAdmin = ['director', 'secretaria', 'profesor'].includes(req.user.rol);
  const esPropioUsuario = req.user.id === parseInt(userId);

  if (!esAdmin && !esPropioUsuario) {
    return res.status(403).json({ error: 'Sin permisos para editar este usuario' });
  }

  try {
    const [r] = await pool.query(
      'UPDATE users SET nombre = ? WHERE id = ?',
      [nombre.trim(), userId]
    );
    if (!r.affectedRows) return res.status(404).json({ error: 'Usuario no encontrado' });
    res.json({ message: 'Nombre actualizado' });
  } catch (err) {
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// ── CAMBIAR CONTRASEÑA (propia) ────────────────────────────────────────────────
// Si la cuenta tiene debe_cambiar_password = 1 (primer ingreso con código, o
// reseteo hecho por un director/secretaria) no hace falta la clave actual,
// porque justamente no hay una clave utilizable todavía. En un cambio
// voluntario normal, sí se pide la actual.
exports.cambiarPassword = async (req, res) => {
  const { passwordActual, passwordNueva } = req.body;

  if (!passwordNueva || passwordNueva.length < 8) {
    return res.status(400).json({ error: 'La nueva contraseña debe tener al menos 8 caracteres' });
  }

  try {
    const [rows] = await pool.query(
      'SELECT password, debe_cambiar_password FROM users WHERE id = ?',
      [req.user.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Usuario no encontrado' });

    const user = rows[0];

    if (!user.debe_cambiar_password) {
      if (!passwordActual) {
        return res.status(400).json({ error: 'Ingresá tu contraseña actual' });
      }
      const valida = await bcrypt.compare(passwordActual, user.password);
      if (!valida) {
        return res.status(401).json({ error: 'La contraseña actual es incorrecta' });
      }
    }

    const hash = await bcrypt.hash(passwordNueva, 10);
    await pool.query(
      'UPDATE users SET password = ?, debe_cambiar_password = 0 WHERE id = ?',
      [hash, req.user.id]
    );
    await logAction(req.user.id, 'CAMBIO_PASSWORD', req.ip, req.headers['user-agent']);

    res.json({ message: 'Contraseña actualizada correctamente' });
  } catch (err) {
    console.error('Error al cambiar contraseña:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// ── RESETEAR CONTRASEÑA DE OTRO USUARIO (director / secretaria) ────────────────
// Para cuando el usuario perdió el acceso a su casilla de mail y por lo tanto
// no puede usar el enlace de "olvidé mi contraseña". Genera un código de
// primer ingreso y lo devuelve en la respuesta para que el director o la
// secretaria se lo entregue en persona (a propósito NO se manda por mail:
// este flujo existe justamente para cuando el mail no es una opción).
exports.resetearPasswordAdmin = async (req, res) => {
  const { userId } = req.params;

  try {
    const [rows] = await pool.query('SELECT id, nombre, email FROM users WHERE id = ?', [userId]);
    if (!rows.length) return res.status(404).json({ error: 'Usuario no encontrado' });

    const codigo = generarCodigo();
    await guardarCodigo(rows[0].id, codigo, 'primer_login', 60, req.user.id);
    await pool.query('UPDATE users SET debe_cambiar_password = 1 WHERE id = ?', [rows[0].id]);

    await logAction(
      req.user.id,
      `RESET_PASSWORD_ADMIN(objetivo:${rows[0].id})`,
      req.ip,
      req.headers['user-agent']
    );

    res.json({
      message: `Código generado para ${rows[0].nombre}. Entregáselo en persona: vence en 60 minutos.`,
      codigo
    });
  } catch (err) {
    console.error('Error al resetear contraseña:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};
