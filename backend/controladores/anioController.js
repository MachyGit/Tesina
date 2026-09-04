// backend/controladores/anioController.js
const pool = require('../config/db');

const TURNOS_VALIDOS = ['mañana', 'tarde', 'noche'];

// ── CREAR AÑO ──────────────────────────────────────────────────────────────────
exports.crearAnio = async (req, res) => {
  const { nombre, division, turno } = req.body;

  if (!nombre || !division || !turno) {
    return res.status(400).json({ error: 'nombre, division y turno son requeridos' });
  }
  if (!TURNOS_VALIDOS.includes(turno)) {
    return res.status(400).json({ error: 'Turno inválido. Usá: mañana, tarde o noche' });
  }

  try {
    const [result] = await pool.query(
      'INSERT INTO anios (nombre, division, turno) VALUES (?, ?, ?)',
      [nombre.trim(), division.trim().toUpperCase(), turno]
    );
    res.status(201).json({ message: 'Año creado', id: result.insertId });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'Ya existe ese año con esa división y turno' });
    }
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// ── LISTAR AÑOS ────────────────────────────────────────────────────────────────
exports.listarAnios = async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT a.id, a.nombre, a.division, a.turno, a.activo,
             COUNT(m.id) AS cantidad_materias
      FROM anios a
      LEFT JOIN materias m ON m.anio_id = a.id
      GROUP BY a.id
      ORDER BY a.nombre, a.division
    `);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// ── ELIMINAR AÑO ───────────────────────────────────────────────────────────────
exports.eliminarAnio = async (req, res) => {
  const { id } = req.params;
  try {
    const [r] = await pool.query('DELETE FROM anios WHERE id = ?', [id]);
    if (!r.affectedRows) return res.status(404).json({ error: 'Año no encontrado' });
    res.json({ message: 'Año eliminado' });
  } catch (err) {
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// ── AGREGAR MATERIA A UN AÑO ───────────────────────────────────────────────────
exports.crearMateria = async (req, res) => {
  const { nombre, anio_id, profesor_id } = req.body;

  if (!nombre || !anio_id) {
    return res.status(400).json({ error: 'nombre y anio_id son requeridos' });
  }

  try {
    // Verificar que el año exista
    const [anio] = await pool.query('SELECT id FROM anios WHERE id = ?', [anio_id]);
    if (!anio.length) return res.status(404).json({ error: 'Año no encontrado' });

    // Verificar que el profesor_id sea un profesor (si se manda)
    if (profesor_id) {
      const [prof] = await pool.query(
        "SELECT id FROM users WHERE id = ? AND rol = 'profesor'",
        [profesor_id]
      );
      if (!prof.length) return res.status(400).json({ error: 'El usuario no es un profesor' });
    }

    const [result] = await pool.query(
      'INSERT INTO materias (nombre, anio_id, profesor_id) VALUES (?, ?, ?)',
      [nombre.trim(), anio_id, profesor_id || null]
    );
    res.status(201).json({ message: 'Materia creada', id: result.insertId });
  } catch (err) {
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// ── LISTAR MATERIAS DE UN AÑO ──────────────────────────────────────────────────
exports.listarMaterias = async (req, res) => {
  const { anioId } = req.params;
  try {
    const [rows] = await pool.query(`
      SELECT m.id, m.nombre, m.anio_id,
             u.id AS profesor_id, u.nombre AS profesor
      FROM materias m
      LEFT JOIN users u ON m.profesor_id = u.id
      WHERE m.anio_id = ?
      ORDER BY m.nombre
    `, [anioId]);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// ── ELIMINAR MATERIA ───────────────────────────────────────────────────────────
exports.eliminarMateria = async (req, res) => {
  const { id } = req.params;
  try {
    const [r] = await pool.query('DELETE FROM materias WHERE id = ?', [id]);
    if (!r.affectedRows) return res.status(404).json({ error: 'Materia no encontrada' });
    res.json({ message: 'Materia eliminada' });
  } catch (err) {
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// ── EDITAR NOMBRE DE AÑO ──────────────────────────────────────────────────────
exports.editarAnio = async (req, res) => {
  const { id } = req.params;
  const { nombre, division, turno } = req.body;

  if (!nombre && !division && !turno) {
    return res.status(400).json({ error: 'Mandá al menos un campo a actualizar' });
  }

  try {
    const campos = [];
    const valores = [];
    if (nombre)   { campos.push('nombre = ?');   valores.push(nombre.trim()); }
    if (division) { campos.push('division = ?'); valores.push(division.trim().toUpperCase()); }
    if (turno)    { campos.push('turno = ?');    valores.push(turno); }
    valores.push(id);

    const [r] = await pool.query(
      `UPDATE anios SET ${campos.join(', ')} WHERE id = ?`,
      valores
    );
    if (!r.affectedRows) return res.status(404).json({ error: 'Año no encontrado' });
    res.json({ message: 'Año actualizado' });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'Ya existe un año con esos datos' });
    }
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// ── EDITAR NOMBRE DE MATERIA ──────────────────────────────────────────────────
exports.editarMateria = async (req, res) => {
  const { id } = req.params;
  const { nombre, profesor_id } = req.body;

  if (!nombre && profesor_id === undefined) {
    return res.status(400).json({ error: 'Mandá al menos un campo a actualizar' });
  }

  try {
    const campos = [];
    const valores = [];
    if (nombre)              { campos.push('nombre = ?');      valores.push(nombre.trim()); }
    if (profesor_id !== undefined) { campos.push('profesor_id = ?'); valores.push(profesor_id || null); }
    valores.push(id);

    const [r] = await pool.query(
      `UPDATE materias SET ${campos.join(', ')} WHERE id = ?`,
      valores
    );
    if (!r.affectedRows) return res.status(404).json({ error: 'Materia no encontrada' });
    res.json({ message: 'Materia actualizada' });
  } catch (err) {
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};
