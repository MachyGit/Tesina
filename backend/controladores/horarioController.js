// © 2026 Pito, Santiago Vigna y Santiago Machado — Campus Virtual PROA. Todos los derechos reservados (ver LICENSE).
// backend/controladores/horarioController.js
// Horarios de clase: grilla semanal por año (día + desde/hasta + materia + aula).
// Los ve cualquiera (el alumno solo el de su año); los arman director y secretaría.
const pool = require('../config/db');
const { logAction } = require('../middleware/sessionLogger');
const { etiquetaAnio, puedeVerAnio, anioExiste, aIdONulo } = require('../utils/anios');

const HORA_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/;

// GET /api/horarios?anio_id=3   ·   profesor: ?mios=1 (todas sus clases)
exports.listar = async (req, res) => {
  try {
    const where = []; const params = [];
    if (req.user.rol === 'alumno') {
      if (!req.user.anio_id) return res.json([]);
      where.push('h.anio_id = ?'); params.push(req.user.anio_id);
    } else if (req.query.mios === '1' && req.user.rol === 'profesor') {
      where.push('m.profesor_id = ?'); params.push(req.user.id);
    } else {
      const a = aIdONulo(req.query.anio_id);
      if (a === null || Number.isNaN(a)) return res.status(400).json({ error: 'Elegí un año' });
      where.push('h.anio_id = ?'); params.push(a);
    }
    const [rows] = await pool.query(`
      SELECT h.id, h.anio_id, ${etiquetaAnio('an')} AS anio, h.materia_id, m.nombre AS materia,
             h.titulo, h.dia, TIME_FORMAT(h.hora_inicio, '%H:%i') AS hora_inicio,
             TIME_FORMAT(h.hora_fin, '%H:%i') AS hora_fin, h.aula, u.nombre AS profesor
      FROM horarios h
      JOIN anios an ON an.id = h.anio_id
      LEFT JOIN materias m ON m.id = h.materia_id
      LEFT JOIN users u ON u.id = m.profesor_id
      WHERE ${where.join(' AND ')}
      ORDER BY h.dia, h.hora_inicio`, params);
    res.json(rows);
  } catch (err) {
    console.error('Error al listar horarios:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// POST (director / secretaría)
exports.crear = async (req, res) => {
  const anioId = aIdONulo(req.body.anio_id);
  const materiaId = aIdONulo(req.body.materia_id);
  const dia = parseInt(req.body.dia, 10);
  const { hora_inicio, hora_fin } = req.body;
  const titulo = String(req.body.titulo || '').trim().slice(0, 100) || null;
  const aula = String(req.body.aula || '').trim().slice(0, 50) || null;

  if (anioId === null || Number.isNaN(anioId)) return res.status(400).json({ error: 'Elegí el año' });
  if (Number.isNaN(materiaId)) return res.status(400).json({ error: 'Materia inválida' });
  if (!(dia >= 1 && dia <= 6)) return res.status(400).json({ error: 'Día inválido' });
  if (!HORA_REGEX.test(hora_inicio || '') || !HORA_REGEX.test(hora_fin || '')) {
    return res.status(400).json({ error: 'Las horas no son válidas (HH:MM)' });
  }
  if (hora_fin <= hora_inicio) return res.status(400).json({ error: 'La hora de fin tiene que ser posterior a la de inicio' });
  if (materiaId === null && !titulo) return res.status(400).json({ error: 'Elegí una materia o escribí un título (ej: Recreo)' });

  try {
    if (!(await anioExiste(anioId))) return res.status(404).json({ error: 'Año no encontrado' });
    if (materiaId !== null) {
      const [m] = await pool.query('SELECT anio_id FROM materias WHERE id = ?', [materiaId]);
      if (!m.length) return res.status(404).json({ error: 'Materia no encontrada' });
      if (m[0].anio_id !== anioId) return res.status(400).json({ error: 'Esa materia no pertenece al año elegido' });
    }
    const [solapa] = await pool.query(
      `SELECT id FROM horarios WHERE anio_id = ? AND dia = ? AND hora_inicio < ? AND hora_fin > ? LIMIT 1`,
      [anioId, dia, hora_fin, hora_inicio]
    );
    if (solapa.length) return res.status(409).json({ error: 'Ese horario se superpone con otro del mismo día' });

    const [r] = await pool.query(
      `INSERT INTO horarios (anio_id, materia_id, titulo, dia, hora_inicio, hora_fin, aula)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [anioId, materiaId, titulo, dia, hora_inicio, hora_fin, aula]
    );
    await logAction(req.user.id, `HORARIO_CREADO(id:${r.insertId})`, req.ip, req.headers['user-agent']);
    res.status(201).json({ message: 'Horario agregado', id: r.insertId });
  } catch (err) {
    console.error('Error al crear horario:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// DELETE (director / secretaría)
exports.eliminar = async (req, res) => {
  try {
    const [r] = await pool.query('DELETE FROM horarios WHERE id = ?', [req.params.id]);
    if (!r.affectedRows) return res.status(404).json({ error: 'Horario no encontrado' });
    await logAction(req.user.id, `HORARIO_ELIMINADO(id:${req.params.id})`, req.ip, req.headers['user-agent']);
    res.json({ message: 'Horario eliminado' });
  } catch (err) {
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};
