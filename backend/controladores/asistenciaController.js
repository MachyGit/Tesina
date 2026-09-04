// backend/controladores/asistenciaController.js
const pool = require('../config/db');

const ESTADOS_VALIDOS = ['presente','ausente','tarde'];

// ── REGISTRAR ASISTENCIA (solo preceptor) ─────────────────────────────────────
exports.registrarAsistencia = async (req, res) => {
  const registros = req.body; // array: [{ alumno_id, estado, observacion? }]

  if (!Array.isArray(registros) || !registros.length) {
    return res.status(400).json({ error: 'Se espera un array de registros' });
  }

  const hoy = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

  const errores = registros.filter(r =>
    !r.alumno_id || !ESTADOS_VALIDOS.includes(r.estado)
  );
  if (errores.length) {
    return res.status(400).json({ error: 'Registros inválidos', errores });
  }

  try {
    // INSERT con ON DUPLICATE KEY para permitir correcciones del mismo día
    const promesas = registros.map(r =>
      pool.query(`
        INSERT INTO asistencia (alumno_id, fecha, estado, preceptor_id, observacion)
        VALUES (?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
          estado = VALUES(estado),
          preceptor_id = VALUES(preceptor_id),
          observacion = VALUES(observacion)
      `, [r.alumno_id, hoy, r.estado, req.user.id, r.observacion || null])
    );

    await Promise.all(promesas);
    res.json({ message: `Asistencia registrada para ${registros.length} alumno/s`, fecha: hoy });
  } catch (err) {
    console.error('Error al registrar asistencia:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// ── VER ASISTENCIA DE UN ALUMNO ────────────────────────────────────────────────
// Accesible por: el propio alumno, preceptor, director, secretaria
exports.verAsistenciaAlumno = async (req, res) => {
  const alumnoId = parseInt(req.params.alumnoId);

  // Alumnos solo pueden ver la suya
  if (req.user.rol === 'alumno' && req.user.id !== alumnoId) {
    return res.status(403).json({ error: 'Solo podés ver tu propia asistencia' });
  }

  const { desde, hasta } = req.query;
  let query = `
    SELECT a.fecha, a.estado, a.observacion,
           u.nombre AS preceptor
    FROM asistencia a
    JOIN users u ON a.preceptor_id = u.id
    WHERE a.alumno_id = ?
  `;
  const params = [alumnoId];

  if (desde) { query += ' AND a.fecha >= ?'; params.push(desde); }
  if (hasta)  { query += ' AND a.fecha <= ?'; params.push(hasta); }

  query += ' ORDER BY a.fecha DESC LIMIT 60';

  try {
    const [rows] = await pool.query(query, params);

    // Estadísticas simples
    const stats = rows.reduce((acc, r) => {
      acc[r.estado] = (acc[r.estado] || 0) + 1;
      return acc;
    }, { presente: 0, ausente: 0, tarde: 0 });

    res.json({ registros: rows, stats, total: rows.length });
  } catch (err) {
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// ── VER ASISTENCIA DE UN CURSO (por fecha) ────────────────────────────────────
exports.verAsistenciaCurso = async (req, res) => {
  const { cursoId } = req.params;
  const fecha = req.query.fecha || new Date().toISOString().split('T')[0];

  try {
    const [rows] = await pool.query(`
      SELECT u.id AS alumno_id, u.nombre AS alumno,
             COALESCE(a.estado, 'sin_registrar') AS estado,
             a.observacion, a.fecha
      FROM users u
      LEFT JOIN asistencia a ON a.alumno_id = u.id AND a.fecha = ?
      WHERE u.curso_id = ? AND u.rol = 'alumno' AND u.activo = 1
      ORDER BY u.nombre
    `, [fecha, cursoId]);

    res.json({ fecha, alumnos: rows });
  } catch (err) {
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// ── ENDPOINT PARA EL BOT ───────────────────────────────────────────────────────
// Retorna asistencia de un alumno identificado por su telegram_id
exports.asistenciaPorTelegramId = async (req, res) => {
  const { telegram_id, alumno_nombre } = req.query;

  if (!telegram_id) {
    return res.status(400).json({ error: 'telegram_id requerido' });
  }

  try {
    // El que consulta debe tener rol permitido
    const [solicitante] = await pool.query(
      'SELECT id, rol FROM users WHERE telegram_id = ? AND activo = 1',
      [String(telegram_id)]
    );
    if (!solicitante.length) {
      return res.status(403).json({ error: 'No autorizado' });
    }
    if (!['director','secretaria','preceptor','profesor'].includes(solicitante[0].rol)) {
      return res.status(403).json({ error: 'Sin permisos para consultar asistencia' });
    }

    // Buscar alumno por nombre (búsqueda parcial)
    const [alumnos] = await pool.query(
      `SELECT id, nombre FROM users WHERE rol = 'alumno' AND nombre LIKE ? AND activo = 1 LIMIT 5`,
      [`%${alumno_nombre}%`]
    );

    if (!alumnos.length) {
      return res.json({ message: 'No se encontró ningún alumno con ese nombre' });
    }

    const alumno = alumnos[0];
    const [registros] = await pool.query(`
      SELECT fecha, estado, observacion FROM asistencia
      WHERE alumno_id = ?
      ORDER BY fecha DESC LIMIT 10
    `, [alumno.id]);

    const stats = registros.reduce((acc, r) => {
      acc[r.estado] = (acc[r.estado] || 0) + 1;
      return acc;
    }, { presente: 0, ausente: 0, tarde: 0 });

    res.json({ alumno: alumno.nombre, registros, stats });
  } catch (err) {
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// ── EDITAR ESTADO DE UN REGISTRO ──────────────────────────────────────────────
// Solo preceptor, director o secretaria
exports.editarAsistencia = async (req, res) => {
  const { id } = req.params;
  const { estado, observacion } = req.body;

  if (!ESTADOS_VALIDOS.includes(estado)) {
    return res.status(400).json({ error: 'Estado inválido. Usá: presente, ausente o tarde' });
  }

  try {
    const [r] = await pool.query(
      'UPDATE asistencia SET estado = ?, observacion = ? WHERE id = ?',
      [estado, observacion || null, id]
    );
    if (!r.affectedRows) return res.status(404).json({ error: 'Registro no encontrado' });
    res.json({ message: 'Asistencia actualizada' });
  } catch (err) {
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// ── BORRAR UN REGISTRO DE ASISTENCIA ─────────────────────────────────────────
exports.borrarAsistencia = async (req, res) => {
  const { id } = req.params;
  try {
    const [r] = await pool.query('DELETE FROM asistencia WHERE id = ?', [id]);
    if (!r.affectedRows) return res.status(404).json({ error: 'Registro no encontrado' });
    res.json({ message: 'Registro eliminado' });
  } catch (err) {
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};
