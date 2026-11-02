// © 2026 Pito, Santiago Vigna y Santiago Machado — Campus Virtual PROA. Todos los derechos reservados (ver LICENSE).
// backend/controladores/anioController.js
const pool = require('../config/db');
const { logAction } = require('../middleware/sessionLogger');
const { aniosDestinoDe, puedeVerAnio, puedePublicarEnAnio, etiquetaAnio } = require('../utils/anios');

// Posición del año: el número del nombre ("3ro" → 3); si no tiene número, queda al final.
const ordenPara = async (nombre) => {
  const m = String(nombre).match(/\d+/);
  if (m) return parseInt(m[0], 10);
  const [[r]] = await pool.query("SELECT COALESCE(MAX(orden), 0) + 1 AS o FROM anios WHERE tipo = 'escolar'");
  return r.o;
};

// ── CREAR AÑO ──────────────────────────────────────────────────────────────────
exports.crearAnio = async (req, res) => {
  const nombre = String(req.body.nombre || '').trim();
  if (!nombre) return res.status(400).json({ error: 'Escribí el nombre del año (ej: 1ro)' });
  if (nombre.length > 20) return res.status(400).json({ error: 'El nombre es demasiado largo' });

  try {
    const [result] = await pool.query("INSERT INTO anios (nombre, division, turno, orden) VALUES (?, '', '', ?)", [nombre, await ordenPara(nombre)]);
    res.status(201).json({ message: 'Año creado', id: result.insertId });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'Ya existe un año con ese nombre' });
    console.error('Error al crear año:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// ── LISTAR AÑOS ────────────────────────────────────────────────────────────────
exports.listarAnios = async (req, res) => {
  try {
    // El alumno solo ve SU año; el resto ve todos.
    const params = [];
    let filtro = "WHERE a.tipo = 'escolar'";
    if (req.query.incluir_promociones === '1' && req.user.rol !== 'alumno') filtro = 'WHERE 1 = 1';
    if (req.user.rol === 'alumno') {
      if (!req.user.anio_id) return res.json([]);
      filtro = 'WHERE a.id = ?';
      params.push(req.user.anio_id);
    }
    const [rows] = await pool.query(`
      SELECT a.id, a.nombre, a.activo, a.tipo, a.orden,
             ${etiquetaAnio('a')} AS etiqueta,
             COUNT(DISTINCT m.id) AS cantidad_materias,
             (SELECT COUNT(*) FROM users u
               WHERE u.anio_id = a.id AND u.rol = 'alumno' AND u.activo = 1) AS cantidad_alumnos
      FROM anios a
      LEFT JOIN materias m ON m.anio_id = a.id
      ${filtro}
      GROUP BY a.id
      ORDER BY (a.tipo = 'promocion'), a.orden, a.id
    `, params);
    res.json(rows);
  } catch (err) {
    console.error('Error al listar años:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// ── AÑOS DONDE EL USUARIO PUEDE PUBLICAR AVISOS / SUBIR ARCHIVOS ───────────────
// director, secretaria y preceptor: todos. Profesor: los años donde dicta alguna materia.
exports.listarAniosDestino = async (req, res) => {
  try {
    const permitidos = await aniosDestinoDe(req.user);
    const params = [];
    let filtro = '';
    if (permitidos !== null) {
      if (!permitidos.length) return res.json({ todos: false, anios: [] });
      filtro = 'WHERE a.id IN (?)';
      params.push(permitidos);
    }
    const [rows] = await pool.query(`
      SELECT a.id, a.nombre, ${etiquetaAnio('a')} AS etiqueta
      FROM anios a ${filtro}
      ORDER BY a.id
    `, params);
    // "todos" = puede publicar también para todos los años a la vez (aviso general)
    res.json({ todos: permitidos === null, anios: rows });
  } catch (err) {
    console.error('Error al listar años destino:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// ── ELIMINAR AÑO ───────────────────────────────────────────────────────────────
exports.eliminarAnio = async (req, res) => {
  const { id } = req.params;
  try {
    const [[u]] = await pool.query('SELECT COUNT(*) AS n FROM users WHERE anio_id = ?', [id]);
    if (u.n > 0) {
      return res.status(409).json({ error: `Este año tiene ${u.n} persona/s asignada/s. Pasalas de año o reasignalas antes de eliminarlo.` });
    }
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
  // Un alumno solo puede ver las materias de su propio año
  if (!puedeVerAnio(req.user, anioId) || (req.user.rol === 'alumno' && !req.user.anio_id)) {
    return res.status(403).json({ error: 'Solo podés ver las materias de tu año' });
  }
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
  const nombre = String(req.body.nombre || '').trim();
  if (!nombre) return res.status(400).json({ error: 'Escribí el nombre del año' });
  if (nombre.length > 20) return res.status(400).json({ error: 'El nombre es demasiado largo (máx. 20 caracteres)' });
  try {
    const [[a]] = await pool.query('SELECT tipo FROM anios WHERE id = ?', [req.params.id]);
    if (!a) return res.status(404).json({ error: 'Año no encontrado' });
    // Renombrar no mueve a nadie: sirve para corregir un nombre o ponerle otro (ej. "Promoción 2026").
    const orden = a.tipo === 'escolar' && /\d/.test(nombre) ? await ordenPara(nombre) : null;
    await pool.query('UPDATE anios SET nombre = ?' + (orden !== null ? ', orden = ?' : '') + ' WHERE id = ?',
      orden !== null ? [nombre, orden, req.params.id] : [nombre, req.params.id]);
    await logAction(req.user.id, `ANIO_RENOMBRADO(id:${req.params.id})`, req.ip, req.headers['user-agent']);
    res.json({ message: 'Año actualizado' });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'Ya existe un año con ese nombre' });
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

// ── MIS MATERIAS (vista tipo Classroom) ────────────────────────────────────────
// alumno → las de su año · profesor → las que dicta · resto → todas.
exports.misMaterias = async (req, res) => {
  try {
    const where = [];
    const params = [];
    if (req.user.rol === 'alumno') {
      if (!req.user.anio_id) return res.json([]);
      where.push('m.anio_id = ?'); params.push(req.user.anio_id);
    } else if (req.user.rol === 'profesor') {
      where.push('m.profesor_id = ?'); params.push(req.user.id);
    }
    const [rows] = await pool.query(`
      SELECT m.id, m.nombre, m.anio_id, ${etiquetaAnio('a')} AS anio,
             u.id AS profesor_id, u.nombre AS profesor
      FROM materias m
      JOIN anios a ON a.id = m.anio_id
      LEFT JOIN users u ON u.id = m.profesor_id
      ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
      ORDER BY a.id, m.nombre`, params);
    res.json(rows);
  } catch (err) {
    console.error('Error en misMaterias:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// ── DETALLE DE UNA MATERIA (la "clase") ────────────────────────────────────────
exports.detalleMateria = async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT m.id, m.nombre, m.anio_id, ${etiquetaAnio('a')} AS anio,
             u.id AS profesor_id, u.nombre AS profesor
      FROM materias m
      JOIN anios a ON a.id = m.anio_id
      LEFT JOIN users u ON u.id = m.profesor_id
      WHERE m.id = ?`, [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Materia no encontrada' });
    const m = rows[0];

    if (!puedeVerAnio(req.user, m.anio_id)) {
      return res.status(403).json({ error: 'Esta materia es de otro año' });
    }

    const [alumnos] = await pool.query(
      "SELECT id, nombre FROM users WHERE anio_id = ? AND rol = 'alumno' AND activo = 1 ORDER BY nombre",
      [m.anio_id]
    );

    let puedePublicar = false;
    if (req.user.rol !== 'alumno') {
      puedePublicar = await puedePublicarEnAnio(req.user, m.anio_id);
      if (req.user.rol === 'profesor' && m.profesor_id && m.profesor_id !== req.user.id) puedePublicar = false;
    }
    res.json({ ...m, alumnos, puede_publicar: puedePublicar });
  } catch (err) {
    console.error('Error en detalleMateria:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// ═════════════════════════════════════════════════════════════════════════════
//  PASE DE AÑO (fin de ciclo)
//  Cada alumno pasa al año siguiente (1ro→2do, 2do→3ro…); los del último año
//  egresan a "Promoción XXXX" y conservan su cuenta. Los que repiten se excluyen.
//  Las materias, horarios, avisos y archivos quedan en su año; la asistencia
//  histórica queda con cada alumno. El año más bajo queda vacío para los ingresantes.
// ═════════════════════════════════════════════════════════════════════════════
const planDelPase = async () => {
  const [anios] = await pool.query("SELECT id, nombre FROM anios WHERE tipo = 'escolar' ORDER BY orden, id");
  const [alumnos] = await pool.query(
    "SELECT id, nombre, anio_id FROM users WHERE rol = 'alumno' AND activo = 1 AND situacion = 'regular' AND anio_id IS NOT NULL ORDER BY nombre");
  return anios.map((a, i) => ({
    id: a.id, nombre: a.nombre,
    destino_id: i + 1 < anios.length ? anios[i + 1].id : null, // null = egresa
    destino: i + 1 < anios.length ? anios[i + 1].nombre : null,
    alumnos: alumnos.filter((u) => u.anio_id === a.id).map((u) => ({ id: u.id, nombre: u.nombre })),
  }));
};

exports.vistaPreviaPase = async (_req, res) => {
  try {
    const plan = await planDelPase();
    res.json({ anios: plan, promocion_sugerida: `Promoción ${new Date().getFullYear()}` });
  } catch (err) {
    console.error('Error en vistaPreviaPase:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

exports.pasarDeAnio = async (req, res) => {
  const promocionNombre = String(req.body.promocion_nombre || '').trim();
  if (!promocionNombre || promocionNombre.length > 20) {
    return res.status(400).json({ error: 'Escribí el nombre de la promoción (máx. 20 caracteres), ej: Promoción 2026' });
  }
  if (req.body.confirmar !== 'PASAR') {
    return res.status(400).json({ error: 'Falta la confirmación' });
  }
  const excluir = new Set((Array.isArray(req.body.excluir) ? req.body.excluir : []).map(Number));

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const plan = await planDelPase();
    if (!plan.length) { await conn.rollback(); return res.status(400).json({ error: 'No hay años creados' }); }

    const d = new Date();
    const hoy = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const resumen = { pasaron: 0, egresaron: 0, repiten: 0 };

    // Se procesa del último año al primero para no mover dos veces a la misma persona.
    for (let i = plan.length - 1; i >= 0; i--) {
      const a = plan[i];
      const mover = a.alumnos.map((u) => u.id).filter((id) => !excluir.has(id));
      resumen.repiten += a.alumnos.length - mover.length;
      if (!mover.length) continue;
      if (a.destino_id === null) {
        const [ex] = await conn.query("SELECT id, tipo FROM anios WHERE nombre = ?", [promocionNombre]);
        if (ex.length && ex[0].tipo !== 'promocion') {
          await conn.rollback();
          return res.status(409).json({ error: 'Ya existe un año con ese nombre. Elegí otro nombre para la promoción.' });
        }
        let promoId;
        if (ex.length) promoId = ex[0].id;
        else {
          const [ins] = await conn.query("INSERT INTO anios (nombre, division, turno, tipo, orden) VALUES (?, '', '', 'promocion', 0)", [promocionNombre]);
          promoId = ins.insertId;
        }
        await conn.query("UPDATE users SET anio_id = ?, situacion = 'egresado', egresado_en = ? WHERE id IN (?)", [promoId, hoy, mover]);
        resumen.egresaron += mover.length;
      } else {
        await conn.query('UPDATE users SET anio_id = ? WHERE id IN (?)', [a.destino_id, mover]);
        resumen.pasaron += mover.length;
      }
    }
    await conn.commit();
    await logAction(req.user.id, `PASE_DE_ANIO(pasaron:${resumen.pasaron},egresaron:${resumen.egresaron},repiten:${resumen.repiten})`, req.ip, req.headers['user-agent']);
    res.json({ message: 'Pase de año realizado', ...resumen });
  } catch (err) {
    await conn.rollback().catch(() => {});
    console.error('Error en pasarDeAnio:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  } finally {
    conn.release();
  }
};
