// © 2026 Pito, Santiago Vigna y Santiago Machado — Campus Virtual PROA. Todos los derechos reservados (ver LICENSE).
// backend/controladores/calendarioController.js
// Calendario del campus (tipo Moodle): junta los eventos cargados a mano
// (exámenes, reuniones, feriados, entregas…) con los avisos que tienen fecha.
// Cada persona ve solo lo de su año y lo general.
const pool = require('../config/db');
const { logAction } = require('../middleware/sessionLogger');
const { etiquetaAnio, puedePublicarEnAnio, anioExiste, aIdONulo } = require('../utils/anios');
const { esFechaISO } = require('../utils/fechas');

const TIPOS = ['evento', 'examen', 'entrega', 'reunion', 'feriado', 'acto'];
const ROLES_CREAN = ['director', 'secretaria', 'preceptor', 'profesor'];
const ROLES_MODERAN = ['director', 'secretaria'];

// ── EVENTOS DEL MES (o del rango pedido) ──────────────────────────────────────
// GET /api/calendario?desde=2026-10-01&hasta=2026-10-31[&anio_id=][&materia_id=]
exports.listar = async (req, res) => {
  const { desde, hasta } = req.query;
  if (!esFechaISO(desde) || !esFechaISO(hasta)) {
    return res.status(400).json({ error: 'Indicá desde y hasta (YYYY-MM-DD)' });
  }
  if (desde > hasta) return res.status(400).json({ error: 'El rango de fechas es inválido' });

  try {
    const filtros = (alias) => {
      const w = []; const p = [];
      if (req.user.rol === 'alumno') {
        if (req.user.anio_id) { w.push(`(${alias}.anio_id IS NULL OR ${alias}.anio_id = ?)`); p.push(req.user.anio_id); }
        else                  { w.push(`${alias}.anio_id IS NULL`); }
      } else {
        const fa = aIdONulo(req.query.anio_id);
        if (!Number.isNaN(fa) && fa !== null) { w.push(`${alias}.anio_id = ?`); p.push(fa); }
      }
      const fm = aIdONulo(req.query.materia_id);
      if (!Number.isNaN(fm) && fm !== null) { w.push(`${alias}.materia_id = ?`); p.push(fm); }
      return { w, p };
    };

    const e = filtros('e');
    const [eventos] = await pool.query(`
      SELECT e.id, e.titulo, e.descripcion, e.tipo,
             DATE_FORMAT(e.fecha, '%Y-%m-%d') AS fecha, TIME_FORMAT(e.hora, '%H:%i') AS hora,
             e.anio_id, ${etiquetaAnio('an')} AS anio, e.materia_id, m.nombre AS materia,
             e.autor_id, u.nombre AS autor
      FROM eventos e
      JOIN users u ON u.id = e.autor_id
      LEFT JOIN anios an ON an.id = e.anio_id
      LEFT JOIN materias m ON m.id = e.materia_id
      WHERE e.fecha BETWEEN ? AND ? ${e.w.length ? 'AND ' + e.w.join(' AND ') : ''}
      ORDER BY e.fecha, e.hora`, [desde, hasta, ...e.p]);

    const a = filtros('a');
    const [avisos] = await pool.query(`
      SELECT a.id, a.titulo, a.contenido AS descripcion, a.tipo,
             DATE_FORMAT(a.fecha_evento, '%Y-%m-%d') AS fecha,
             IF(a.todo_el_dia = 1, NULL, DATE_FORMAT(a.fecha_evento, '%H:%i')) AS hora,
             a.anio_id, ${etiquetaAnio('an')} AS anio, a.materia_id, m.nombre AS materia,
             a.autor_id, u.nombre AS autor
      FROM avisos a
      JOIN users u ON u.id = a.autor_id
      LEFT JOIN anios an ON an.id = a.anio_id
      LEFT JOIN materias m ON m.id = a.materia_id
      WHERE a.fecha_evento IS NOT NULL AND DATE(a.fecha_evento) BETWEEN ? AND ?
        ${a.w.length ? 'AND ' + a.w.join(' AND ') : ''}
      ORDER BY a.fecha_evento`, [desde, hasta, ...a.p]);

    const items = [
      ...eventos.map((x) => ({
        ...x, origen: 'evento',
        puede_borrar: x.autor_id === req.user.id || ROLES_MODERAN.includes(req.user.rol),
      })),
      ...avisos.map((x) => ({
        ...x, origen: 'aviso', tipo: x.tipo === 'tarea' ? 'entrega' : 'aviso', puede_borrar: false,
      })),
    ].sort((p, q) => (p.fecha + (p.hora || '')).localeCompare(q.fecha + (q.hora || '')));

    res.json(items);
  } catch (err) {
    console.error('Error al listar calendario:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// ── ANOTAR UN EVENTO ──────────────────────────────────────────────────────────
exports.crear = async (req, res) => {
  if (!ROLES_CREAN.includes(req.user.rol)) {
    return res.status(403).json({ error: 'Tu rol no puede anotar eventos en el calendario' });
  }
  const titulo = String(req.body.titulo || '').trim();
  const descripcion = String(req.body.descripcion || '').trim().slice(0, 2000) || null;
  const tipo = req.body.tipo || 'evento';
  const { fecha } = req.body;
  const hora = req.body.hora ? String(req.body.hora) : null;

  if (!titulo) return res.status(400).json({ error: 'Escribí un título' });
  if (titulo.length > 200) return res.status(400).json({ error: 'El título es demasiado largo' });
  if (!TIPOS.includes(tipo)) return res.status(400).json({ error: 'Tipo de evento inválido' });
  if (!esFechaISO(fecha)) return res.status(400).json({ error: 'La fecha no es válida' });
  if (hora && !/^([01]\d|2[0-3]):[0-5]\d$/.test(hora)) return res.status(400).json({ error: 'La hora no es válida' });

  let anioId = aIdONulo(req.body.anio_id);
  const materiaId = aIdONulo(req.body.materia_id);
  if (Number.isNaN(anioId) || Number.isNaN(materiaId)) return res.status(400).json({ error: 'Año o materia inválidos' });

  try {
    if (materiaId !== null) {
      const [m] = await pool.query('SELECT anio_id, profesor_id FROM materias WHERE id = ?', [materiaId]);
      if (!m.length) return res.status(404).json({ error: 'Materia no encontrada' });
      if (req.user.rol === 'profesor' && m[0].profesor_id && m[0].profesor_id !== req.user.id) {
        return res.status(403).json({ error: 'Solo el profesor de la materia puede anotar eventos en ella' });
      }
      anioId = m[0].anio_id;
    }
    if (anioId !== null && !(await anioExiste(anioId))) return res.status(404).json({ error: 'Año no encontrado' });
    if (!(await puedePublicarEnAnio(req.user, anioId))) {
      return res.status(403).json({
        error: anioId === null ? 'Elegí el año del evento' : 'Solo podés anotar eventos en los años donde dictás materias',
      });
    }

    const [r] = await pool.query(
      `INSERT INTO eventos (titulo, descripcion, tipo, fecha, hora, anio_id, materia_id, autor_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [titulo, descripcion, tipo, fecha, hora, anioId, materiaId, req.user.id]
    );
    await logAction(req.user.id, `EVENTO_CREADO(id:${r.insertId})`, req.ip, req.headers['user-agent']);
    res.status(201).json({ message: 'Evento anotado', id: r.insertId });
  } catch (err) {
    console.error('Error al crear evento:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// ── BORRAR (autor, director o secretaria) ─────────────────────────────────────
exports.eliminar = async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT autor_id FROM eventos WHERE id = ?', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Evento no encontrado' });
    if (rows[0].autor_id !== req.user.id && !ROLES_MODERAN.includes(req.user.rol)) {
      return res.status(403).json({ error: 'No podés eliminar este evento' });
    }
    await pool.query('DELETE FROM eventos WHERE id = ?', [req.params.id]);
    await logAction(req.user.id, `EVENTO_ELIMINADO(id:${req.params.id})`, req.ip, req.headers['user-agent']);
    res.json({ message: 'Evento eliminado' });
  } catch (err) {
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};
