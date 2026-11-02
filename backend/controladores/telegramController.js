// © 2026 Pito, Santiago Vigna y Santiago Machado — Campus Virtual PROA. Todos los derechos reservados (ver LICENSE).
// backend/controladores/telegramController.js
const pool = require('../config/db');
const { etiquetaAnio, aniosDestinoDe } = require('../utils/anios');

// ── VINCULAR CUENTA vía token (llamado por el bot) ────────────────────────────
// El bot manda: { token: "123456", telegram_id: "7859819402" }
exports.vincularCuenta = async (req, res) => {
  const { token, telegram_id } = req.body;

  if (!token || !telegram_id) {
    return res.status(400).json({ error: 'token y telegram_id son requeridos' });
  }

  try {
    // Buscar token válido y no expirado
    const [rows] = await pool.query(`
      SELECT tt.user_id, tt.expira_en, tt.usado, u.nombre, u.rol
      FROM telegram_tokens tt
      JOIN users u ON tt.user_id = u.id
      WHERE tt.token = ?
    `, [String(token)]);

    if (!rows.length) {
      return res.status(400).json({ error: 'Código inválido' });
    }

    const registro = rows[0];

    if (registro.usado) {
      return res.status(400).json({ error: 'Este código ya fue usado' });
    }
    if (new Date() > new Date(registro.expira_en)) {
      return res.status(400).json({ error: 'El código expiró. Generá uno nuevo desde el campus.' });
    }

    // Verificar que el telegram_id no esté ya usado por otro usuario
    const [yaUsado] = await pool.query(
      'SELECT id FROM users WHERE telegram_id = ? AND id != ?',
      [String(telegram_id), registro.user_id]
    );
    if (yaUsado.length) {
      return res.status(409).json({ error: 'Este Telegram ya está vinculado a otra cuenta' });
    }

    // Vincular
    await pool.query(
      'UPDATE users SET telegram_id = ? WHERE id = ?',
      [String(telegram_id), registro.user_id]
    );
    await pool.query(
      'UPDATE telegram_tokens SET usado = 1 WHERE token = ?',
      [String(token)]
    );

    res.json({
      message: '✅ Cuenta vinculada correctamente',
      nombre: registro.nombre,
      rol:    registro.rol
    });
  } catch (err) {
    console.error('Error al vincular cuenta:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// ── VERIFICAR SI UN TELEGRAM_ID ESTÁ VINCULADO ────────────────────────────────
exports.verificarTelegramId = async (req, res) => {
  const { telegram_id } = req.query;
  if (!telegram_id) return res.status(400).json({ error: 'telegram_id requerido' });

  try {
    const [rows] = await pool.query(
      'SELECT id, nombre, rol, activo FROM users WHERE telegram_id = ?',
      [String(telegram_id)]
    );

    if (!rows.length) {
      return res.json({ vinculado: false });
    }

    const u = rows[0];
    if (!u.activo) {
      return res.json({ vinculado: false, error: 'Cuenta desactivada' });
    }

    res.json({ vinculado: true, nombre: u.nombre, rol: u.rol });
  } catch (err) {
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};


// ── CONTEXTO DEL USUARIO PARA EL BOT ──────────────────────────────────────────
// Un solo pedido con lo que el bot necesita para responder con datos reales:
// quién es, su año, sus materias, los avisos que le corresponden y (si es alumno) su asistencia.
exports.contextoBot = async (req, res) => {
  const { telegram_id } = req.query;
  if (!telegram_id) return res.status(400).json({ error: 'telegram_id requerido' });

  try {
    const [rows] = await pool.query(`
      SELECT u.id, u.nombre, u.rol, u.activo, u.anio_id, ${etiquetaAnio('an')} AS anio
      FROM users u LEFT JOIN anios an ON an.id = u.anio_id
      WHERE u.telegram_id = ?`, [String(telegram_id)]);
    if (!rows.length) return res.json({ vinculado: false });
    const u = rows[0];
    if (!u.activo) return res.json({ vinculado: false, error: 'Cuenta desactivada' });

    // Materias: las de su año (alumno) o las que dicta (profesor)
    let materias = [];
    if (u.rol === 'alumno' && u.anio_id) {
      [materias] = await pool.query(`
        SELECT m.nombre, pr.nombre AS profesor FROM materias m
        LEFT JOIN users pr ON pr.id = m.profesor_id
        WHERE m.anio_id = ? ORDER BY m.nombre`, [u.anio_id]);
    } else if (u.rol === 'profesor') {
      [materias] = await pool.query(`
        SELECT m.nombre, ${etiquetaAnio('an')} AS anio FROM materias m
        LEFT JOIN anios an ON an.id = m.anio_id
        WHERE m.profesor_id = ? ORDER BY an.id, m.nombre`, [u.id]);
    }

    // Avisos: el alumno ve los de su año y los generales
    const filtro = u.rol === 'alumno'
      ? (u.anio_id ? 'WHERE (a.anio_id IS NULL OR a.anio_id = ?)' : 'WHERE a.anio_id IS NULL')
      : '';
    const [avisos] = await pool.query(`
      SELECT a.titulo, LEFT(a.contenido, 400) AS contenido, a.tipo,
             DATE_FORMAT(a.fecha, '%Y-%m-%d') AS fecha,
             DATE_FORMAT(a.fecha_evento, '%Y-%m-%d %H:%i') AS fecha_evento, a.todo_el_dia,
             au.nombre AS autor, ${etiquetaAnio('an')} AS anio
      FROM avisos a
      JOIN users au ON au.id = a.autor_id
      LEFT JOIN anios an ON an.id = a.anio_id
      ${filtro}
      ORDER BY a.fecha DESC, a.id DESC LIMIT 8`, u.rol === 'alumno' && u.anio_id ? [u.anio_id] : []);

    // Asistencia propia (solo alumnos)
    let asistencia = null;
    if (u.rol === 'alumno') {
      const [reg] = await pool.query(`
        SELECT DATE_FORMAT(fecha, '%Y-%m-%d') AS fecha, estado FROM asistencia
        WHERE alumno_id = ? ORDER BY fecha DESC LIMIT 60`, [u.id]);
      const stats = reg.reduce((acc, r) => { acc[r.estado] = (acc[r.estado] || 0) + 1; return acc; },
        { presente: 0, ausente: 0, tarde: 0 });
      asistencia = { stats, total: reg.length, ultimos: reg.slice(0, 7) };
    }

    res.json({
      vinculado: true, id: u.id, nombre: u.nombre, rol: u.rol,
      anio_id: u.anio_id, anio: u.anio, materias,
      avisos: avisos.map(a => ({ ...a, todo_el_dia: !!a.todo_el_dia })),
      asistencia,
    });
  } catch (err) {
    console.error('Error en contextoBot:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// ── AÑOS DONDE ESTA PERSONA PUEDE PUBLICAR (para los botones del bot) ──────────
exports.aniosBot = async (req, res) => {
  const { telegram_id } = req.query;
  if (!telegram_id) return res.status(400).json({ error: 'telegram_id requerido' });
  try {
    const [rows] = await pool.query(
      'SELECT id, rol FROM users WHERE telegram_id = ? AND activo = 1', [String(telegram_id)]);
    if (!rows.length) return res.status(403).json({ error: 'No autorizado' });
    const permitidos = await aniosDestinoDe(rows[0]);
    if (permitidos !== null && !permitidos.length) return res.json({ todos: false, anios: [] });
    const [anios] = await pool.query(`
      SELECT a.id, ${etiquetaAnio('a')} AS etiqueta FROM anios a
      ${permitidos !== null ? 'WHERE a.id IN (?) AND' : 'WHERE'} a.tipo = 'escolar' ORDER BY a.orden, a.id`,
      permitidos !== null ? [permitidos] : []);
    res.json({ todos: permitidos === null, anios });
  } catch (err) {
    console.error('Error en aniosBot:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// ── LOGS ──────────────────────────────────────────────────────────────────────
exports.listarLogs = async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 50, 200);
    const [rows] = await pool.query(`
      SELECT sl.id, u.nombre, u.rol, sl.accion, sl.ip, sl.hora
      FROM session_logs sl
      JOIN users u ON sl.user_id = u.id
      ORDER BY sl.hora DESC
      LIMIT ?
    `, [limit]);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};
