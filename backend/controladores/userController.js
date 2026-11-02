// © 2026 Pito, Santiago Vigna y Santiago Machado — Campus Virtual PROA. Todos los derechos reservados (ver LICENSE).
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
const { etiquetaAnio, anioExiste, aIdONulo } = require('../utils/anios');

const ROLES_VALIDOS  = ['director','secretaria','preceptor','profesor','alumno'];
const ROL_PROTEGIDO  = 'director'; // el sistema siempre necesita al menos un usuario activo con este rol
const MAX_FOTO_BYTES = 2 * 1024 * 1024 * 1.37; // ~2MB en base64
// Solo imágenes reales en base64 (nada de SVG ni otros tipos con contenido activo).
const FOTO_REGEX = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/]+=*$/;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const LIMITE_FOTO_LISTADO = 150000; // en el listado solo se devuelven fotos chicas (las nuevas se comprimen a ~20 KB)

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
    from: transporter.remitente,
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
//
// Si el mail no se puede enviar (o el servidor está en modo prueba) el usuario
// se crea igual y el código vuelve en la respuesta, para que quien lo creó
// se lo entregue en persona.
exports.crearUsuario = async (req, res) => {
  const { nombre, email, rol, curso_id } = req.body;

  if (!nombre || !email || !rol) {
    return res.status(400).json({ error: 'Faltan campos requeridos' });
  }
  if (!ROLES_VALIDOS.includes(rol)) {
    return res.status(400).json({ error: 'Rol inválido' });
  }
  if (!EMAIL_REGEX.test(String(email).trim())) {
    return res.status(400).json({ error: 'El email no es válido' });
  }

  const anioId = aIdONulo(req.body.anio_id);
  if (Number.isNaN(anioId)) return res.status(400).json({ error: 'Año inválido' });
  if (anioId !== null && rol !== 'alumno') {
    return res.status(400).json({ error: 'Solo los alumnos pertenecen a un año' });
  }

  try {
    if (anioId !== null && !(await anioExiste(anioId))) {
      return res.status(404).json({ error: 'Año no encontrado' });
    }

    const emailNorm = String(email).toLowerCase().trim();
    const [existe] = await pool.query('SELECT id FROM users WHERE email = ?', [emailNorm]);
    if (existe.length) {
      return res.status(409).json({ error: 'El email ya está registrado' });
    }

    // Contraseña provisoria aleatoria: nadie la conoce, es solo para
    // satisfacer el NOT NULL de la columna hasta que el usuario defina la suya.
    const passwordProvisoria = crypto.randomBytes(32).toString('hex');
    const hash = await bcrypt.hash(passwordProvisoria, 10);

    const [result] = await pool.query(
      `INSERT INTO users (nombre, email, password, rol, curso_id, anio_id, creado_por, debe_cambiar_password)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1)`,
      [String(nombre).trim(), emailNorm, hash, rol, curso_id || null, anioId, req.user.id]
    );

    const codigo = generarCodigo();
    await guardarCodigo(result.insertId, codigo, 'primer_login', 60, req.user.id);
    await logAction(req.user.id, `USUARIO_CREADO(id:${result.insertId})`, req.ip, req.headers['user-agent']);

    let emailEnviado = true;
    try {
      await enviarCodigoAcceso(emailNorm, String(nombre).trim(), codigo);
    } catch (errMail) {
      emailEnviado = false;
      console.error('No se pudo enviar el código de acceso por mail:', errMail.message);
    }

    const entregarCodigo = !emailEnviado || transporter.modoPrueba;
    res.status(201).json({
      message: emailEnviado && !transporter.modoPrueba
        ? 'Usuario creado. Se envió un código de acceso a su email para completar el registro.'
        : 'Usuario creado. El mail no se envió: entregale el código en persona.',
      id: result.insertId,
      emailEnviado: emailEnviado && !transporter.modoPrueba,
      ...(entregarCodigo ? { codigo } : {}),
    });
  } catch (err) {
    console.error('Error al crear usuario:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// ── LISTAR USUARIOS ────────────────────────────────────────────────────────────
// Filtros opcionales: ?rol=alumno  ?anio_id=3  ?pendiente=1  ?activo=0|1
exports.listarUsuarios = async (req, res) => {
  try {
    const where = [];
    const params = [];

    if (req.query.rol && ROLES_VALIDOS.includes(req.query.rol)) {
      where.push('u.rol = ?'); params.push(req.query.rol);
    }
    const anioFiltro = aIdONulo(req.query.anio_id);
    if (!Number.isNaN(anioFiltro) && anioFiltro !== null) {
      where.push('u.anio_id = ?'); params.push(anioFiltro);
    }
    // Por defecto solo personas "regulares" (egresados y ex alumnos tienen su propio apartado).
    const sit = req.query.situacion || 'regular';
    if (sit === 'no_regular') where.push("u.situacion <> 'regular'");
    else if (['regular', 'egresado', 'ex_alumno'].includes(sit)) { where.push('u.situacion = ?'); params.push(sit); }
    if (req.query.pendiente === '1') where.push('u.pendiente = 1');
    if (req.query.pendiente === '0') where.push('u.pendiente = 0');
    if (req.query.activo === '1' || req.query.activo === '0') {
      where.push('u.activo = ?'); params.push(Number(req.query.activo));
    }

    const [rows] = await pool.query(`
      SELECT u.id, u.nombre, u.email, u.rol, u.activo, u.pendiente,
             u.fecha_creacion, u.telegram_id, u.situacion, u.egresado_en,
             u.anio_id, u.situacion, ${etiquetaAnio('an')} AS anio,
             (u.foto IS NOT NULL) AS tiene_foto,
             IF(LENGTH(u.foto) <= ${LIMITE_FOTO_LISTADO}, u.foto, NULL) AS foto,
             c.nombre AS curso, c.division
      FROM users u
      LEFT JOIN cursos c  ON u.curso_id = c.id
      LEFT JOIN anios  an ON u.anio_id  = an.id
      ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
      ORDER BY u.pendiente DESC, u.rol, u.nombre
    `, params);

    res.json(rows.map(r => ({ ...r, tiene_foto: !!r.tiene_foto })));
  } catch (err) {
    console.error('Error al listar usuarios:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// ── OBTENER PERFIL PROPIO ──────────────────────────────────────────────────────
exports.obtenerPerfil = async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT u.id, u.nombre, u.email, u.rol, u.foto,
             u.telegram_id, u.fecha_creacion,
             u.anio_id, ${etiquetaAnio('an')} AS anio,
             c.nombre AS curso, c.division
      FROM users u
      LEFT JOIN cursos c  ON u.curso_id = c.id
      LEFT JOIN anios  an ON u.anio_id  = an.id
      WHERE u.id = ?
    `, [req.user.id]);

    if (!rows.length) return res.status(404).json({ error: 'Usuario no encontrado' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// ── SUBIR / ACTUALIZAR FOTO (cualquier usuario, la propia) ─────────────────────
exports.subirFoto = async (req, res) => {
  const { foto } = req.body;

  if (!foto) return res.status(400).json({ error: 'No se recibió ninguna imagen' });
  if (typeof foto !== 'string' || foto.length > MAX_FOTO_BYTES) {
    return res.status(400).json({ error: 'La imagen supera los 2MB permitidos' });
  }
  if (!FOTO_REGEX.test(foto)) {
    return res.status(400).json({ error: 'Formato de imagen inválido. Usá JPG, PNG o WEBP.' });
  }

  try {
    await pool.query('UPDATE users SET foto = ? WHERE id = ?', [foto, req.user.id]);
    res.json({ message: 'Foto actualizada', foto });
  } catch (err) {
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// ── QUITAR LA PROPIA FOTO ──────────────────────────────────────────────────────
exports.quitarFotoPropia = async (req, res) => {
  try {
    await pool.query('UPDATE users SET foto = NULL WHERE id = ?', [req.user.id]);
    res.json({ message: 'Foto eliminada' });
  } catch (err) {
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// ── QUITAR LA FOTO DE OTRO USUARIO (moderación: director / secretaria) ─────────
// Para fotos indebidas. Queda registrado en el log de actividad.
exports.quitarFotoUsuario = async (req, res) => {
  const { userId } = req.params;
  try {
    const [rows] = await pool.query('SELECT id, nombre, foto IS NOT NULL AS tiene FROM users WHERE id = ?', [userId]);
    if (!rows.length) return res.status(404).json({ error: 'Usuario no encontrado' });
    if (!rows[0].tiene) return res.status(404).json({ error: 'Ese usuario no tiene foto de perfil' });

    await pool.query('UPDATE users SET foto = NULL WHERE id = ?', [userId]);
    await logAction(req.user.id, `FOTO_QUITADA(objetivo:${userId})`, req.ip, req.headers['user-agent']);
    res.json({ message: `Se quitó la foto de perfil de ${rows[0].nombre}` });
  } catch (err) {
    console.error('Error al quitar foto:', err);
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

    const [r] = await pool.query(
      "UPDATE users SET rol = ?, anio_id = IF(? = 'alumno', anio_id, NULL) WHERE id = ?",
      [nuevoRol, nuevoRol, userId]
    );
    await logAction(req.user.id, `ROL_CAMBIADO(u:${userId},${nuevoRol})`, req.ip, req.headers['user-agent']);
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

    await pool.query('UPDATE users SET activo = ?, pendiente = 0 WHERE id = ?', [nuevoEstado, userId]);
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
  const esAdmin = ['director', 'secretaria'].includes(req.user.rol);
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

// ── ASIGNAR / CAMBIAR EL AÑO DE UN ALUMNO (director / secretaria) ──────────────
// Un alumno pertenece a UN solo año: solo ve avisos, archivos y materias de ese año.
// Para pasarlo de año (ej. de 1ro a 2do) se cambia acá. anio_id null = sin año.
exports.asignarAnio = async (req, res) => {
  const { userId } = req.params;
  const anioId = aIdONulo(req.body.anio_id);
  if (Number.isNaN(anioId)) return res.status(400).json({ error: 'Año inválido' });

  try {
    const [rows] = await pool.query('SELECT rol FROM users WHERE id = ?', [userId]);
    if (!rows.length) return res.status(404).json({ error: 'Usuario no encontrado' });
    if (rows[0].rol !== 'alumno') {
      return res.status(400).json({ error: 'Solo los alumnos pertenecen a un año' });
    }
    if (anioId !== null && !(await anioExiste(anioId))) {
      return res.status(404).json({ error: 'Año no encontrado' });
    }

    // Elegir un año escolar reincorpora a la persona como alumno regular; elegir una promoción la deja como egresada.
    let situacion = null;
    if (anioId !== null) {
      const [[a]] = await pool.query('SELECT tipo FROM anios WHERE id = ?', [anioId]);
      situacion = a.tipo === 'promocion' ? 'egresado' : 'regular';
    }
    await pool.query(
      situacion ? 'UPDATE users SET anio_id = ?, situacion = ?, egresado_en = IF(? = \'regular\', NULL, COALESCE(egresado_en, CURDATE())) WHERE id = ?' : 'UPDATE users SET anio_id = ? WHERE id = ?',
      situacion ? [anioId, situacion, situacion, userId] : [anioId, userId]);
    await logAction(req.user.id, `ANIO_ASIGNADO(u:${userId},a:${anioId})`, req.ip, req.headers['user-agent']);
    res.json({ message: anioId === null ? 'Alumno sin año asignado' : 'Año asignado' });
  } catch (err) {
    console.error('Error al asignar año:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// ── APROBAR UNA CUENTA PENDIENTE (director / secretaria) ───────────────────────
// Opcionalmente se corrige el rol y/o se asigna el año en el mismo paso.
exports.aprobarUsuario = async (req, res) => {
  const { userId } = req.params;
  const { rol } = req.body;
  const anioId = aIdONulo(req.body.anio_id);
  if (Number.isNaN(anioId)) return res.status(400).json({ error: 'Año inválido' });
  if (rol && !ROLES_VALIDOS.includes(rol)) return res.status(400).json({ error: 'Rol inválido' });

  try {
    const [rows] = await pool.query('SELECT nombre, email, rol, pendiente FROM users WHERE id = ?', [userId]);
    if (!rows.length) return res.status(404).json({ error: 'Usuario no encontrado' });
    if (!rows[0].pendiente) return res.status(400).json({ error: 'Esa cuenta no está pendiente de aprobación' });

    const rolFinal = rol || rows[0].rol;
    if (anioId !== null) {
      if (rolFinal !== 'alumno') return res.status(400).json({ error: 'Solo los alumnos pertenecen a un año' });
      if (!(await anioExiste(anioId))) return res.status(404).json({ error: 'Año no encontrado' });
    }

    await pool.query(
      'UPDATE users SET activo = 1, pendiente = 0, rol = ?, anio_id = ? WHERE id = ?',
      [rolFinal, rolFinal === 'alumno' ? anioId : null, userId]
    );
    await logAction(req.user.id, `USUARIO_APROBADO(id:${userId})`, req.ip, req.headers['user-agent']);

    // Aviso por mail (si falla, la aprobación igual queda hecha)
    transporter.sendMail({
      from: transporter.remitente,
      to: rows[0].email,
      subject: 'Tu cuenta fue aprobada — Campus Virtual PROA',
      text: `Hola ${rows[0].nombre},\n\nTu cuenta del Campus Virtual PROA fue aprobada. Ya podés iniciar sesión con tu email y la contraseña que elegiste.`,
    }).catch(e => console.error('No se pudo avisar la aprobación por mail:', e.message));

    res.json({ message: 'Cuenta aprobada' });
  } catch (err) {
    console.error('Error al aprobar usuario:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// ── RECHAZAR UNA CUENTA PENDIENTE (borra la solicitud) ─────────────────────────
exports.rechazarUsuario = async (req, res) => {
  const { userId } = req.params;
  try {
    const [r] = await pool.query('DELETE FROM users WHERE id = ? AND pendiente = 1', [userId]);
    if (!r.affectedRows) return res.status(404).json({ error: 'No hay una solicitud pendiente con ese id' });
    await logAction(req.user.id, `USUARIO_RECHAZADO(id:${userId})`, req.ip, req.headers['user-agent']);
    res.json({ message: 'Solicitud rechazada' });
  } catch (err) {
    console.error('Error al rechazar usuario:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// ── "SE FUE DEL COLEGIO": conserva la cuenta como ex alumno (director / secretaria) ──
// No se borra nada: la persona sigue pudiendo ingresar (con acceso reducido) y
// se la puede reincorporar a un año cuando quiera volver.
exports.marcarExAlumno = async (req, res) => {
  const { userId } = req.params;
  try {
    const [rows] = await pool.query('SELECT rol, situacion FROM users WHERE id = ?', [userId]);
    if (!rows.length) return res.status(404).json({ error: 'Usuario no encontrado' });
    if (rows[0].rol !== 'alumno') return res.status(400).json({ error: 'Solo los alumnos pueden pasar a ex alumno' });
    if (rows[0].situacion !== 'regular') return res.status(400).json({ error: 'Esa persona ya no es alumno regular' });
    await pool.query("UPDATE users SET situacion = 'ex_alumno', anio_id = NULL, egresado_en = CURDATE() WHERE id = ?", [userId]);
    await logAction(req.user.id, `EX_ALUMNO(u:${userId})`, req.ip, req.headers['user-agent']);
    res.json({ message: 'Pasó a ex alumno. Conserva su cuenta.' });
  } catch (err) {
    console.error('Error al marcar ex alumno:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};
