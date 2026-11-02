// © 2026 Pito, Santiago Vigna y Santiago Machado — Campus Virtual PROA. Todos los derechos reservados (ver LICENSE).
// backend/controladores/asistenciaController.js
const pool = require('../config/db');
const jwt = require('jsonwebtoken');
const QRCode = require('qrcode');
const { logAction } = require('../middleware/sessionLogger');
const { hoyLocal, horaLocal, esFechaISO } = require('../utils/fechas');
const { etiquetaAnio, anioExiste } = require('../utils/anios');

const ESTADOS_VALIDOS = ['presente', 'ausente', 'tarde'];

// ── QR de ingreso ──────────────────────────────────────────────────────────────
// El preceptor proyecta un QR que se renueva solo. Cada QR es un token firmado
// que vence a los 90 segundos y solo vale el día en que se generó: una captura
// de pantalla compartida más tarde no sirve. El alumno lo escanea con la cámara
// del celular, se abre el campus con su sesión y queda registrado.
const QR_SEGUNDOS_VALIDEZ = 90;
const secretoQR = () => `${process.env.JWT_SECRET}:asistencia-qr`; // distinto del JWT de sesión

// Hora límite para ser "presente" (PROA tiene un solo turno).
// Configurable en el .env:  HORA_INGRESO=08:00
const horaIngreso = () => {
  const v = String(process.env.HORA_INGRESO || '').trim();
  return /^\d{1,2}:\d{2}$/.test(v) ? v : '08:00';
};

const aMinutos = (hhmm) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
};

// 'presente' si llega hasta la hora límite; si no, 'tarde'.
const estadoPorHorario = () => {
  const ahora = new Date();
  return ahora.getHours() * 60 + ahora.getMinutes() <= aMinutos(horaIngreso()) ? 'presente' : 'tarde';
};

// Solo se aceptan orígenes http/https. Se usa el origen (sin ruta ni parámetros).
const origenSeguro = (valor) => {
  try {
    const u = new URL(valor);
    return ['http:', 'https:'].includes(u.protocol) ? u.origin : null;
  } catch {
    return null;
  }
};

// ── GENERAR QR (preceptor, director, secretaria) ──────────────────────────────
exports.generarQR = async (req, res) => {
  try {
    const base =
      origenSeguro(process.env.FRONTEND_PUBLIC_URL) ||
      origenSeguro(req.query.base) ||
      origenSeguro(process.env.FRONTEND_URL) ||
      'http://localhost:3000';

    const token = jwt.sign(
      { tipo: 'asistencia_qr', fecha: hoyLocal() },
      secretoQR(),
      { expiresIn: QR_SEGUNDOS_VALIDEZ }
    );
    const url = `${base}/dashboard/alumno.html?asistencia=${token}`;
    const qr = await QRCode.toDataURL(url, { width: 360, margin: 1, errorCorrectionLevel: 'M' });

    res.json({ qr, url, base, segundos_validez: QR_SEGUNDOS_VALIDEZ });
  } catch (err) {
    console.error('Error al generar QR:', err);
    res.status(500).json({ error: 'No se pudo generar el código QR' });
  }
};

// ── REGISTRAR LLEGADA POR QR (solo alumnos) ───────────────────────────────────
exports.registrarPorQR = async (req, res) => {
  if (req.user.rol !== 'alumno') {
    return res.status(403).json({ error: 'Solo los alumnos registran su llegada con el QR' });
  }
  if (req.user.situacion && req.user.situacion !== 'regular') {
    return res.status(403).json({ error: 'Tu cuenta es de egresado/ex alumno: no registra asistencia.' });
  }
  const { token } = req.body;
  if (!token) return res.status(400).json({ error: 'Falta el código QR' });

  let datos;
  try {
    datos = jwt.verify(token, secretoQR());
  } catch (err) {
    const vencido = err.name === 'TokenExpiredError';
    return res.status(400).json({
      error: vencido
        ? 'El código QR venció. Escaneá el que se muestra ahora en pantalla.'
        : 'El código QR no es válido.',
    });
  }
  if (datos.tipo !== 'asistencia_qr' || datos.fecha !== hoyLocal()) {
    return res.status(400).json({ error: 'El código QR no es de hoy.' });
  }

  try {
    const hoy = hoyLocal();
    const hora = horaLocal();

    const estado = estadoPorHorario();

    const [previos] = await pool.query(
      `SELECT id, estado, TIME_FORMAT(hora_registro, '%H:%i') AS hora
       FROM asistencia WHERE alumno_id = ? AND fecha = ?`,
      [req.user.id, hoy]
    );

    if (previos.length && previos[0].estado !== 'ausente') {
      const p = previos[0];
      return res.json({
        yaRegistrado: true,
        estado: p.estado,
        hora: p.hora,
        mensaje: p.hora
          ? `Ya registraste tu llegada hoy a las ${p.hora} (${p.estado}).`
          : `Tu asistencia de hoy ya está registrada (${p.estado}).`,
      });
    }

    if (previos.length) {
      // El preceptor lo había marcado ausente y el alumno llegó después: pasa a presente/tarde.
      await pool.query(
        `UPDATE asistencia SET estado = ?, origen = 'qr', hora_registro = ?, observacion = NULL WHERE id = ?`,
        [estado, hora, previos[0].id]
      );
    } else {
      // No hay preceptor en este registro: el propio alumno figura como quien lo cargó (origen = 'qr').
      await pool.query(
        `INSERT INTO asistencia (alumno_id, fecha, estado, preceptor_id, origen, hora_registro)
         VALUES (?, ?, ?, ?, 'qr', ?)`,
        [req.user.id, hoy, estado, req.user.id, hora]
      );
    }

    await logAction(req.user.id, 'ASISTENCIA_QR', req.ip, req.headers['user-agent']);
    res.status(201).json({
      yaRegistrado: false,
      estado,
      hora: hora.slice(0, 5),
      mensaje: estado === 'presente'
        ? `¡Listo! Quedaste presente a las ${hora.slice(0, 5)}.`
        : `Registrado a las ${hora.slice(0, 5)}: quedaste con llegada tarde.`,
    });
  } catch (err) {
    console.error('Error al registrar asistencia por QR:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// ── REGISTRAR ASISTENCIA MANUAL (preceptor) ───────────────────────────────────
exports.registrarAsistencia = async (req, res) => {
  const registros = req.body; // array: [{ alumno_id, estado, observacion? }]

  if (!Array.isArray(registros) || !registros.length) {
    return res.status(400).json({ error: 'Se espera un array de registros' });
  }

  const errores = registros.filter(r =>
    !Number.isInteger(Number(r.alumno_id)) || !ESTADOS_VALIDOS.includes(r.estado)
  );
  if (errores.length) {
    return res.status(400).json({ error: 'Registros inválidos', errores });
  }

  const hoy = hoyLocal();
  const ahora = horaLocal();

  // Cada registro puede traer su propia fecha (hoy o un día anterior, hasta 60 días atrás) y la hora
  // en que se marcó: sirve para cargas hechas sin conexión que se suben después.
  const minimo = hoyLocal(new Date(Date.now() - 60 * 86400000));
  for (const r of registros) {
    if (r.fecha !== undefined && (!esFechaISO(r.fecha) || r.fecha > hoy || r.fecha < minimo)) {
      return res.status(400).json({ error: 'La fecha de un registro no es válida (solo hoy o días anteriores, hasta 60 días atrás)' });
    }
    if (r.hora !== undefined && !/^([01]\d|2[0-3]):[0-5]\d$/.test(String(r.hora))) {
      return res.status(400).json({ error: 'La hora de un registro no es válida' });
    }
  }

  try {
    // Todos los ids tienen que ser alumnos activos (no se registra asistencia de cualquiera).
    const ids = [...new Set(registros.map(r => Number(r.alumno_id)))];
    const [validos] = await pool.query(
      "SELECT id FROM users WHERE rol = 'alumno' AND activo = 1 AND situacion = 'regular' AND id IN (?)", [ids]
    );
    if (validos.length !== ids.length) {
      return res.status(400).json({ error: 'Alguno de los alumnos no existe o está inactivo' });
    }

    // ON DUPLICATE KEY: permite corregir el mismo día
    await Promise.all(registros.map(r =>
      pool.query(`
        INSERT INTO asistencia (alumno_id, fecha, estado, preceptor_id, observacion, origen, hora_registro)
        VALUES (?, ?, ?, ?, ?, 'manual', ?)
        ON DUPLICATE KEY UPDATE
          estado = VALUES(estado),
          preceptor_id = VALUES(preceptor_id),
          observacion = VALUES(observacion),
          origen = 'manual',
          hora_registro = VALUES(hora_registro)
      `, [Number(r.alumno_id), r.fecha || hoy, r.estado, req.user.id, r.observacion || null, r.hora ? `${r.hora}:00` : ahora])
    ));

    res.json({ message: `Asistencia registrada para ${registros.length} alumno/s`, fecha: hoy });
  } catch (err) {
    console.error('Error al registrar asistencia:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// ── VER ASISTENCIA DE UN ALUMNO ────────────────────────────────────────────────
// Accesible por: el propio alumno, preceptor, profesor, director, secretaria
exports.verAsistenciaAlumno = async (req, res) => {
  const alumnoId = parseInt(req.params.alumnoId);
  if (Number.isNaN(alumnoId)) return res.status(400).json({ error: 'alumnoId inválido' });

  // Alumnos solo pueden ver la suya
  if (req.user.rol === 'alumno' && req.user.id !== alumnoId) {
    return res.status(403).json({ error: 'Solo podés ver tu propia asistencia' });
  }

  const { desde, hasta } = req.query;
  let query = `
    SELECT a.id, DATE_FORMAT(a.fecha, '%Y-%m-%d') AS fecha, a.estado, a.observacion,
           a.origen, TIME_FORMAT(a.hora_registro, '%H:%i') AS hora
    FROM asistencia a
    WHERE a.alumno_id = ?`;
  const params = [alumnoId];

  if (desde && esFechaISO(desde)) { query += ' AND a.fecha >= ?'; params.push(desde); }
  if (hasta && esFechaISO(hasta)) { query += ' AND a.fecha <= ?'; params.push(hasta); }
  query += ' ORDER BY a.fecha DESC LIMIT 60';

  try {
    const [rows] = await pool.query(query, params);
    const stats = rows.reduce((acc, r) => {
      acc[r.estado] = (acc[r.estado] || 0) + 1;
      return acc;
    }, { presente: 0, ausente: 0, tarde: 0 });

    res.json({ registros: rows, stats, total: rows.length });
  } catch (err) {
    console.error('Error en verAsistenciaAlumno:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// ── VER ASISTENCIA DE UN AÑO (por fecha) ──────────────────────────────────────
exports.verAsistenciaAnio = async (req, res) => {
  const anioId = parseInt(req.params.anioId);
  if (Number.isNaN(anioId)) return res.status(400).json({ error: 'anioId inválido' });

  const fecha = req.query.fecha || hoyLocal();
  if (!esFechaISO(fecha)) return res.status(400).json({ error: 'Fecha inválida (usá AAAA-MM-DD)' });

  try {
    if (!(await anioExiste(anioId))) return res.status(404).json({ error: 'Año no encontrado' });

    const [alumnos] = await pool.query(`
      SELECT u.id AS alumno_id, u.nombre AS alumno,
             COALESCE(a.estado, 'sin_registrar') AS estado,
             a.id AS asistencia_id, a.observacion, a.origen,
             TIME_FORMAT(a.hora_registro, '%H:%i') AS hora
      FROM users u
      LEFT JOIN asistencia a ON a.alumno_id = u.id AND a.fecha = ?
      WHERE u.anio_id = ? AND u.rol = 'alumno' AND u.activo = 1
      ORDER BY u.nombre
    `, [fecha, anioId]);

    const [[anio]] = await pool.query(
      `SELECT a.id, ${etiquetaAnio('a')} AS etiqueta FROM anios a WHERE a.id = ?`, [anioId]
    );
    res.json({ fecha, anio, alumnos });
  } catch (err) {
    console.error('Error en verAsistenciaAnio:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// ── VER ASISTENCIA DE UN CURSO (esquema viejo, por users.curso_id) ────────────
exports.verAsistenciaCurso = async (req, res) => {
  const { cursoId } = req.params;
  const fecha = req.query.fecha || hoyLocal();
  if (!esFechaISO(fecha)) return res.status(400).json({ error: 'Fecha inválida (usá AAAA-MM-DD)' });

  try {
    const [rows] = await pool.query(`
      SELECT u.id AS alumno_id, u.nombre AS alumno,
             COALESCE(a.estado, 'sin_registrar') AS estado,
             a.observacion, DATE_FORMAT(a.fecha, '%Y-%m-%d') AS fecha
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
// Retorna asistencia de un alumno buscado por nombre; quien consulta se identifica por telegram_id.
exports.asistenciaPorTelegramId = async (req, res) => {
  const { telegram_id, alumno_nombre } = req.query;

  if (!telegram_id) {
    return res.status(400).json({ error: 'telegram_id requerido' });
  }
  if (!alumno_nombre || !String(alumno_nombre).trim()) {
    return res.status(400).json({ error: 'alumno_nombre requerido' });
  }

  try {
    const [solicitante] = await pool.query(
      'SELECT id, rol FROM users WHERE telegram_id = ? AND activo = 1',
      [String(telegram_id)]
    );
    if (!solicitante.length) {
      return res.status(403).json({ error: 'No autorizado' });
    }
    if (!['director', 'secretaria', 'preceptor', 'profesor'].includes(solicitante[0].rol)) {
      return res.status(403).json({ error: 'Sin permisos para consultar asistencia' });
    }

    const [alumnos] = await pool.query(
      `SELECT id, nombre FROM users WHERE rol = 'alumno' AND nombre LIKE ? AND activo = 1 LIMIT 5`,
      [`%${String(alumno_nombre).trim()}%`]
    );
    if (!alumnos.length) {
      return res.json({ message: 'No se encontró ningún alumno con ese nombre' });
    }

    if (alumnos.length > 1) {
      // Evita mostrar la asistencia de la persona equivocada: se pide un nombre más completo.
      return res.json({
        coincidencias: alumnos.map(a => a.nombre),
        message: 'Hay más de un alumno con ese nombre. Escribí el nombre y apellido completos.',
      });
    }

    const alumno = alumnos[0];
    const [registros] = await pool.query(`
      SELECT DATE_FORMAT(fecha, '%Y-%m-%d') AS fecha, estado, observacion FROM asistencia
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
exports.editarAsistencia = async (req, res) => {
  const { id } = req.params;
  const { estado, observacion } = req.body;

  if (!ESTADOS_VALIDOS.includes(estado)) {
    return res.status(400).json({ error: 'Estado inválido. Usá: presente, ausente o tarde' });
  }

  try {
    const [r] = await pool.query(
      `UPDATE asistencia SET estado = ?, observacion = ?, preceptor_id = ?, origen = 'manual' WHERE id = ?`,
      [estado, observacion || null, req.user.id, id]
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

// ── EXPORTAR A EXCEL (director / secretaría / preceptor) ──────────────────────
// GET /api/asistencia/exportar?anio_id=&desde=AAAA-MM-DD&hasta=AAAA-MM-DD
// Sin fechas: el mes en curso. Sin anio_id: todos los años.
// Hoja "Resumen" (totales y % por alumno) + hoja "Detalle" (un renglón por registro).
exports.exportarExcel = async (req, res) => {
  const ExcelJS = require('exceljs');
  const hoy = hoyLocal();
  const desde = req.query.desde || `${hoy.slice(0, 8)}01`;
  const hasta = req.query.hasta || hoy;
  if (!esFechaISO(desde) || !esFechaISO(hasta)) {
    return res.status(400).json({ error: 'Fechas inválidas (usá AAAA-MM-DD)' });
  }
  if (desde > hasta) return res.status(400).json({ error: 'La fecha "desde" es posterior a "hasta"' });

  const anioId = req.query.anio_id ? parseInt(req.query.anio_id) : null;
  if (req.query.anio_id && Number.isNaN(anioId)) return res.status(400).json({ error: 'Año inválido' });

  try {
    const params = [desde, hasta];
    let filtroAnio = '';
    if (anioId) { filtroAnio = ' AND u.anio_id = ?'; params.push(anioId); }

    const [rows] = await pool.query(`
      SELECT DATE_FORMAT(a.fecha, '%d/%m/%Y') AS fecha, a.fecha AS f,
             u.id AS alumno_id, u.nombre AS alumno, ${etiquetaAnio('an')} AS anio,
             a.estado, TIME_FORMAT(a.hora_registro, '%H:%i') AS hora,
             a.origen, a.observacion
      FROM asistencia a
      JOIN users u ON u.id = a.alumno_id
      LEFT JOIN anios an ON an.id = u.anio_id
      WHERE a.fecha BETWEEN ? AND ?${filtroAnio}
      ORDER BY a.fecha, an.id, u.nombre`, params);

    // Resumen por alumno (incluye alumnos del año sin registros)
    const resumen = new Map();
    const [alumnos] = await pool.query(`
      SELECT u.id, u.nombre, ${etiquetaAnio('an')} AS anio
      FROM users u LEFT JOIN anios an ON an.id = u.anio_id
      WHERE u.rol = 'alumno' AND u.activo = 1${anioId ? ' AND u.anio_id = ?' : ''}
      ORDER BY an.id, u.nombre`, anioId ? [anioId] : []);
    alumnos.forEach((a) => resumen.set(a.id, { alumno: a.nombre, anio: a.anio || 'Sin año', presente: 0, tarde: 0, ausente: 0 }));
    rows.forEach((r) => {
      const s = resumen.get(r.alumno_id) || resumen.set(r.alumno_id, { alumno: r.alumno, anio: r.anio || 'Sin año', presente: 0, tarde: 0, ausente: 0 }).get(r.alumno_id);
      s[r.estado]++;
    });

    const wb = new ExcelJS.Workbook();
    const AUT = require('../config/autoria');
    wb.creator = AUT.TEXTO; wb.lastModifiedBy = AUT.PROYECTO; wb.company = 'Escuela ProA'; wb.description = AUT.TEXTO;
    const encabezado = (ws) => {
      ws.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
      ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1A3A6B' } };
      ws.views = [{ state: 'frozen', ySplit: 1 }];
      ws.headerFooter = { oddFooter: `&L&8${AUT.TEXTO.replace(/&/g, '&&')}` };
      ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: ws.columns.length } };
    };

    const wsR = wb.addWorksheet('Resumen');
    wsR.columns = [
      { header: 'Año', key: 'anio', width: 20 }, { header: 'Alumno', key: 'alumno', width: 32 },
      { header: 'Presentes', key: 'presente', width: 12 }, { header: 'Tarde', key: 'tarde', width: 10 },
      { header: 'Ausentes', key: 'ausente', width: 12 }, { header: 'Total registros', key: 'total', width: 16 },
      { header: '% asistencia', key: 'pct', width: 14 },
    ];
    [...resumen.values()].forEach((s, i) => {
      const fila = i + 2;
      wsR.addRow({ ...s, total: { formula: `C${fila}+D${fila}+E${fila}` }, pct: { formula: `IF(F${fila}=0,"",(C${fila}+D${fila})/F${fila})` } });
      wsR.getCell(`G${fila}`).numFmt = '0%';
    });
    encabezado(wsR);

    const wsD = wb.addWorksheet('Detalle');
    wsD.columns = [
      { header: 'Fecha', key: 'fecha', width: 12 }, { header: 'Año', key: 'anio', width: 20 },
      { header: 'Alumno', key: 'alumno', width: 32 }, { header: 'Estado', key: 'estado', width: 12 },
      { header: 'Hora', key: 'hora', width: 8 }, { header: 'Cómo se registró', key: 'origen', width: 18 },
      { header: 'Observación', key: 'observacion', width: 34 },
    ];
    const colores = { presente: 'FFDCFCE7', tarde: 'FFFEF3C7', ausente: 'FFFEE2E2' };
    rows.forEach((r) => {
      const row = wsD.addRow({ ...r, anio: r.anio || 'Sin año', origen: r.origen === 'qr' ? 'QR' : 'Preceptor' });
      row.getCell('estado').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: colores[r.estado] || 'FFFFFFFF' } };
    });
    encabezado(wsD);

    await logAction(req.user.id, `ASISTENCIA_EXPORTADA(${desde}..${hasta})`, req.ip, req.headers['user-agent']);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="asistencia_${desde}_a_${hasta}.xlsx"`);
    await wb.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error('Error al exportar asistencia:', err);
    if (!res.headersSent) res.status(500).json({ error: 'Error interno del servidor' });
  }
};
