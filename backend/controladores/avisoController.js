// backend/controladores/avisoController.js
const pool = require('../config/db');

const TIPOS_VALIDOS = ['general','tarea','horario','urgente'];
const ROLES_PUEDEN_PUBLICAR = ['director','secretaria','preceptor','profesor'];

// ── CREAR AVISO ────────────────────────────────────────────────────────────────
exports.crearAviso = async (req, res) => {
  const { titulo, contenido, tipo, curso_id } = req.body;

  if (!titulo || !contenido) {
    return res.status(400).json({ error: 'Título y contenido son requeridos' });
  }
  if (tipo && !TIPOS_VALIDOS.includes(tipo)) {
    return res.status(400).json({ error: 'Tipo de aviso inválido' });
  }
  if (!ROLES_PUEDEN_PUBLICAR.includes(req.user.rol)) {
    return res.status(403).json({ error: 'Tu rol no puede publicar avisos' });
  }

  try {
    const [result] = await pool.query(
      'INSERT INTO avisos (titulo, contenido, tipo, autor_id, curso_id) VALUES (?, ?, ?, ?, ?)',
      [titulo.trim(), contenido.trim(), tipo || 'general', req.user.id, curso_id || null]
    );
    res.status(201).json({ message: 'Aviso publicado', id: result.insertId });
  } catch (err) {
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// ── LISTAR AVISOS ──────────────────────────────────────────────────────────────
// Alumnos solo ven avisos de su curso + generales
// Resto ve todos
exports.listarAvisos = async (req, res) => {
  try {
    let query = `
      SELECT a.id, a.titulo, a.contenido, a.tipo, a.fecha,
             u.nombre AS autor, u.rol AS rol_autor,
             c.nombre AS curso, c.division
      FROM avisos a
      JOIN users u ON a.autor_id = u.id
      LEFT JOIN cursos c ON a.curso_id = c.id
    `;
    const params = [];

    if (req.user.rol === 'alumno') {
      query += ' WHERE (a.curso_id = ? OR a.curso_id IS NULL)';
      params.push(req.user.curso_id);
    }

    const limit = Math.min(parseInt(req.query.limit) || 20, 50);
    query += ' ORDER BY a.fecha DESC LIMIT ?';
    params.push(limit);

    const [rows] = await pool.query(query, params);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// ── ELIMINAR AVISO ─────────────────────────────────────────────────────────────
// Solo el autor o el director pueden eliminar
exports.eliminarAviso = async (req, res) => {
  const { id } = req.params;
  try {
    const [rows] = await pool.query('SELECT autor_id FROM avisos WHERE id = ?', [id]);
    if (!rows.length) return res.status(404).json({ error: 'Aviso no encontrado' });

    const esAutor    = rows[0].autor_id === req.user.id;
    const esAdmin    = ['director', 'secretaria', 'profesor'].includes(req.user.rol);
    if (!esAutor && !esAdmin) {
      return res.status(403).json({ error: 'No podés eliminar este aviso' });
    }

    await pool.query('DELETE FROM avisos WHERE id = ?', [id]);
    res.json({ message: 'Aviso eliminado' });
  } catch (err) {
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// ── ENDPOINT PARA EL BOT (autenticado con BOT_SECRET) ─────────────────────────
exports.crearAvisoPorBot = async (req, res) => {
  const { titulo, contenido, tipo, telegram_id } = req.body;

  if (!titulo || !contenido || !telegram_id) {
    return res.status(400).json({ error: 'Faltan datos' });
  }

  try {
    // Buscar usuario por telegram_id y verificar que tenga rol permitido
    const [rows] = await pool.query(
      'SELECT id, rol, nombre FROM users WHERE telegram_id = ? AND activo = 1',
      [String(telegram_id)]
    );

    if (!rows.length) {
      return res.status(403).json({ error: 'Telegram ID no registrado o cuenta inactiva' });
    }
    const user = rows[0];
    if (!ROLES_PUEDEN_PUBLICAR.includes(user.rol)) {
      return res.status(403).json({ error: 'Tu rol no puede publicar avisos' });
    }

    const [result] = await pool.query(
      'INSERT INTO avisos (titulo, contenido, tipo, autor_id) VALUES (?, ?, ?, ?)',
      [titulo.trim(), contenido.trim(), tipo || 'general', user.id]
    );

    res.json({ message: 'Aviso publicado', id: result.insertId, autor: user.nombre });
  } catch (err) {
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};
