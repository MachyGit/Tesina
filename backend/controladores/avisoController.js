// © 2026 Pito, Santiago Vigna y Santiago Machado — Campus Virtual PROA. Todos los derechos reservados (ver LICENSE).
// backend/controladores/avisoController.js
const pool = require('../config/db');
const transporter = require('../config/mailer');
const { logAction } = require('../middleware/sessionLogger');
const { enlaceGoogleCalendar, crearICS } = require('../utils/calendario');
const {
  etiquetaAnio, puedePublicarEnAnio, puedeVerAnio, anioExiste, aIdONulo,
} = require('../utils/anios');

const TIPOS_VALIDOS = ['general', 'tarea', 'horario', 'urgente'];
const ROLES_PUEDEN_PUBLICAR = ['director', 'secretaria', 'preceptor', 'profesor'];
const ROLES_MODERAN = ['director', 'secretaria'];
const MAX_DESTINATARIOS_MAIL = 200;

// Columnas de un aviso listo para mostrar (fecha de la actividad como texto
// local 'YYYY-MM-DDTHH:MM:SS', sin zona horaria, para que el navegador la lea como hora local).
const SELECT_AVISO = `
  SELECT a.id, a.titulo, a.contenido, a.tipo, a.fecha, a.autor_id,
         u.nombre AS autor, u.rol AS rol_autor, u.foto AS autor_foto,
         (SELECT COUNT(*) FROM aviso_comentarios c WHERE c.aviso_id = a.id) AS comentarios,
         a.anio_id, ${etiquetaAnio('an')} AS anio,
         a.materia_id, m.nombre AS materia,
         DATE_FORMAT(a.fecha_evento, '%Y-%m-%dT%H:%i:%s') AS fecha_evento,
         a.todo_el_dia
  FROM avisos a
  JOIN users u       ON u.id  = a.autor_id
  LEFT JOIN anios an ON an.id = a.anio_id
  LEFT JOIN materias m ON m.id = a.materia_id`;

const conCalendario = (row) => ({
  ...row,
  todo_el_dia: !!row.todo_el_dia,
  gcal_url: row.fecha_evento
    ? enlaceGoogleCalendar({
        titulo: row.titulo,
        descripcion: row.contenido,
        fechaEvento: row.fecha_evento,
        todoElDia: !!row.todo_el_dia,
      })
    : null,
});

// Acepta 'YYYY-MM-DDTHH:MM', 'YYYY-MM-DD HH:MM[:SS]' o 'YYYY-MM-DD' (si es todo el día).
// Devuelve 'YYYY-MM-DD HH:MM:SS' o null (sin fecha) o false (inválida).
const normalizarFechaEvento = (valor, todoElDia) => {
  if (valor === undefined || valor === null || valor === '') return null;
  const m = String(valor).trim().match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?$/);
  if (!m) return false;
  const [, y, mo, d, h, mi, s] = m;
  const hora = todoElDia ? '00' : (h || null);
  if (hora === null) return false; // con hora hace falta la hora
  const fecha = new Date(Number(y), Number(mo) - 1, Number(d), Number(hora), Number(todoElDia ? 0 : mi), 0);
  if (isNaN(fecha.getTime()) || fecha.getMonth() !== Number(mo) - 1) return false;
  return `${y}-${mo}-${d} ${todoElDia ? '00:00:00' : `${h}:${mi}:${s || '00'}`}`;
};

const escHtml = (t) =>
  String(t || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const emailDe = (remitente) => {
  const m = String(remitente).match(/<([^>]+)>/);
  return m ? m[1] : String(remitente);
};

// ── INVITACIONES DE CALENDARIO POR MAIL ────────────────────────────────────────
// Un mail por alumno con un .ics adjunto como invitación (method REQUEST):
// Gmail lo muestra como evento y lo agrega al Google Calendar del alumno.
// Se ejecuta en segundo plano: la publicación del aviso no espera a los mails.
const enviarInvitaciones = async (aviso, autor) => {
  let sql = "SELECT id, nombre, email FROM users WHERE rol = 'alumno' AND activo = 1";
  const params = [];
  if (aviso.anio_id) { sql += ' AND anio_id = ?'; params.push(aviso.anio_id); }
  sql += ' LIMIT ?';
  params.push(MAX_DESTINATARIOS_MAIL + 1);

  const [alumnos] = await pool.query(sql, params);
  if (!alumnos.length) return { enviados: 0, fallidos: 0, omitido: 'sin_alumnos' };
  if (alumnos.length > MAX_DESTINATARIOS_MAIL) return { enviados: 0, fallidos: 0, omitido: 'demasiados' };

  const organizadorEmail = emailDe(transporter.remitente);
  let enviados = 0, fallidos = 0;

  for (const al of alumnos) {
    try {
      const ics = crearICS({
        uid: `aviso-${aviso.id}-${al.id}`,
        titulo: aviso.titulo,
        descripcion: aviso.contenido,
        fechaEvento: aviso.fecha_evento,
        todoElDia: aviso.todo_el_dia,
        organizador: { nombre: autor.nombre, email: organizadorEmail },
        asistentes: [{ nombre: al.nombre, email: al.email }],
        metodo: 'REQUEST',
      });
      await transporter.sendMail({
        from: transporter.remitente,
        to: al.email,
        subject: `📅 ${aviso.titulo} — Campus Virtual PROA`,
        text:
          `Hola ${al.nombre},\n\n${autor.nombre} publicó una actividad:\n\n` +
          `${aviso.titulo}\n${aviso.contenido}\n\n` +
          `Se agrega a tu calendario desde esta invitación.`,
        html: `
          <div style="font-family:sans-serif; max-width:560px;">
            <h2 style="color:#1a3a6b;">📅 ${escHtml(aviso.titulo)}</h2>
            <p>Hola ${escHtml(al.nombre)}, <strong>${escHtml(autor.nombre)}</strong> publicó una actividad en el Campus:</p>
            <p style="white-space:pre-line;">${escHtml(aviso.contenido)}</p>
            <p style="color:#6b7280;font-size:13px;">Aceptá la invitación para verla en tu Google Calendar.</p>
          </div>`,
        icalEvent: { method: 'REQUEST', filename: 'actividad.ics', content: ics },
      });
      enviados++;
    } catch (err) {
      fallidos++;
      console.error(`Invitación de calendario no enviada a ${al.email}:`, err.message);
    }
  }
  console.log(`📅 Aviso ${aviso.id}: invitaciones enviadas ${enviados}, fallidas ${fallidos}`);
  return { enviados, fallidos };
};

// ── CREAR AVISO ────────────────────────────────────────────────────────────────
exports.crearAviso = async (req, res) => {
  const { titulo, contenido, tipo, fecha_evento, todo_el_dia, enviar_calendario } = req.body;

  if (!titulo || !contenido || !String(titulo).trim() || !String(contenido).trim()) {
    return res.status(400).json({ error: 'Título y contenido son requeridos' });
  }
  if (tipo && !TIPOS_VALIDOS.includes(tipo)) {
    return res.status(400).json({ error: 'Tipo de aviso inválido' });
  }
  if (!ROLES_PUEDEN_PUBLICAR.includes(req.user.rol)) {
    return res.status(403).json({ error: 'Tu rol no puede publicar avisos' });
  }

  let anioId = aIdONulo(req.body.anio_id);
  if (Number.isNaN(anioId)) return res.status(400).json({ error: 'Año inválido' });
  const materiaId = aIdONulo(req.body.materia_id);
  if (Number.isNaN(materiaId)) return res.status(400).json({ error: 'Materia inválida' });

  const todoElDia = !!todo_el_dia;
  const fechaEvento = normalizarFechaEvento(fecha_evento, todoElDia);
  if (fechaEvento === false) {
    return res.status(400).json({ error: 'La fecha de la actividad no es válida' });
  }

  try {
    if (materiaId !== null) {
      const [m] = await pool.query('SELECT anio_id, profesor_id FROM materias WHERE id = ?', [materiaId]);
      if (!m.length) return res.status(404).json({ error: 'Materia no encontrada' });
      if (anioId !== null && anioId !== m[0].anio_id) {
        return res.status(400).json({ error: 'Esa materia no pertenece al año elegido' });
      }
      if (req.user.rol === 'profesor' && m[0].profesor_id && m[0].profesor_id !== req.user.id) {
        return res.status(403).json({ error: 'Solo el profesor de la materia puede publicar en ella' });
      }
      anioId = m[0].anio_id; // lo de una materia es siempre para el año de esa materia
    }
    if (anioId !== null && !(await anioExiste(anioId))) {
      return res.status(404).json({ error: 'Año no encontrado' });
    }
    if (!(await puedePublicarEnAnio(req.user, anioId))) {
      return res.status(403).json({
        error: anioId === null
          ? 'Elegí el año al que va dirigido el aviso'
          : 'Solo podés publicar en los años donde dictás materias',
      });
    }

    const [result] = await pool.query(
      `INSERT INTO avisos (titulo, contenido, tipo, autor_id, anio_id, materia_id, fecha_evento, todo_el_dia)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [String(titulo).trim(), String(contenido).trim(), tipo || 'general',
       req.user.id, anioId, materiaId, fechaEvento, todoElDia ? 1 : 0]
    );
    await logAction(req.user.id, `AVISO_CREADO(id:${result.insertId})`, req.ip, req.headers['user-agent']);

    // Invitaciones de calendario (en segundo plano)
    let invitaciones = 'no';
    if (fechaEvento && enviar_calendario !== false) {
      invitaciones = 'en_proceso';
      enviarInvitaciones(
        { id: result.insertId, titulo: String(titulo).trim(), contenido: String(contenido).trim(),
          anio_id: anioId, fecha_evento: fechaEvento, todo_el_dia: todoElDia },
        req.user
      ).catch(e => console.error('Error enviando invitaciones:', e.message));
    }

    res.status(201).json({ message: 'Aviso publicado', id: result.insertId, invitaciones });
  } catch (err) {
    console.error('Error al crear aviso:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// ── LISTAR AVISOS ──────────────────────────────────────────────────────────────
// Alumnos: solo los de SU año + los generales (sin año).
// Resto: todos (con filtro opcional por año).
exports.listarAvisos = async (req, res) => {
  try {
    const where = [];
    const params = [];

    if (req.user.rol === 'alumno') {
      if (req.user.anio_id) { where.push('(a.anio_id IS NULL OR a.anio_id = ?)'); params.push(req.user.anio_id); }
      else                  { where.push('a.anio_id IS NULL'); }
    } else if (req.query.anio_id) {
      const filtro = aIdONulo(req.query.anio_id);
      if (!Number.isNaN(filtro) && filtro !== null) { where.push('a.anio_id = ?'); params.push(filtro); }
    }

    if (req.query.tipo && TIPOS_VALIDOS.includes(req.query.tipo)) {
      where.push('a.tipo = ?'); params.push(req.query.tipo);
    }
    if (req.query.excluir_tipo && TIPOS_VALIDOS.includes(req.query.excluir_tipo)) {
      where.push('a.tipo <> ?'); params.push(req.query.excluir_tipo);
    }
    const filtroMateria = aIdONulo(req.query.materia_id);
    if (!Number.isNaN(filtroMateria) && filtroMateria !== null) { where.push('a.materia_id = ?'); params.push(filtroMateria); }
    if (req.query.mios === '1') { where.push('a.autor_id = ?'); params.push(req.user.id); }

    const limit = Math.min(parseInt(req.query.limit) || 20, 100);
    const sql = `${SELECT_AVISO}
      ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
      ORDER BY a.fecha DESC, a.id DESC LIMIT ?`;
    params.push(limit);

    const [rows] = await pool.query(sql, params);
    await adjuntarArchivos(rows);
    res.json(rows.map(conCalendario));
  } catch (err) {
    console.error('Error al listar avisos:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// Agrega a cada aviso la lista de archivos adjuntos (una sola consulta).
const adjuntarArchivos = async (rows) => {
  rows.forEach((r) => { r.archivos = []; });
  if (!rows.length) return;
  const [fs] = await pool.query(
    'SELECT id, aviso_id, nombre_original, tamanio FROM archivos_aula WHERE aviso_id IN (?) ORDER BY id',
    [rows.map((r) => r.id)]
  );
  const porId = new Map(rows.map((r) => [r.id, r]));
  fs.forEach((f) => porId.get(f.aviso_id)?.archivos.push({ id: f.id, nombre: f.nombre_original, tamanio: f.tamanio }));
};

// ── DETALLE DE UN ANUNCIO + COMENTARIOS ────────────────────────────────────────
exports.detalleAviso = async (req, res) => {
  try {
    const [rows] = await pool.query(`${SELECT_AVISO} WHERE a.id = ?`, [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Anuncio no encontrado' });
    if (!puedeVerAnio(req.user, rows[0].anio_id)) return res.status(403).json({ error: 'Este anuncio es de otro año' });
    await adjuntarArchivos(rows);
    const [coms] = await pool.query(
      `SELECT c.id, c.contenido, c.creado_en, c.autor_id, u.nombre AS autor, u.rol AS rol_autor, u.foto AS autor_foto
       FROM aviso_comentarios c JOIN users u ON u.id = c.autor_id
       WHERE c.aviso_id = ? ORDER BY c.id`, [req.params.id]);
    res.json({ ...conCalendario(rows[0]), lista_comentarios: coms });
  } catch (err) {
    console.error('Error al ver anuncio:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

exports.comentarAviso = async (req, res) => {
  const contenido = String(req.body.contenido || '').trim();
  if (!contenido) return res.status(400).json({ error: 'Escribí el comentario' });
  if (contenido.length > 1000) return res.status(400).json({ error: 'El comentario es muy largo (máx. 1000 caracteres)' });
  try {
    const [a] = await pool.query('SELECT anio_id FROM avisos WHERE id = ?', [req.params.id]);
    if (!a.length) return res.status(404).json({ error: 'Anuncio no encontrado' });
    if (!puedeVerAnio(req.user, a[0].anio_id)) return res.status(403).json({ error: 'Este anuncio es de otro año' });
    const [r] = await pool.query('INSERT INTO aviso_comentarios (aviso_id, autor_id, contenido) VALUES (?, ?, ?)',
      [req.params.id, req.user.id, contenido]);
    res.status(201).json({ id: r.insertId });
  } catch (err) {
    console.error('Error al comentar:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

exports.borrarComentario = async (req, res) => {
  try {
    const [c] = await pool.query('SELECT autor_id FROM aviso_comentarios WHERE id = ?', [req.params.cid]);
    if (!c.length) return res.status(404).json({ error: 'Comentario no encontrado' });
    if (c[0].autor_id !== req.user.id && !ROLES_MODERAN.includes(req.user.rol)) {
      return res.status(403).json({ error: 'No podés borrar este comentario' });
    }
    await pool.query('DELETE FROM aviso_comentarios WHERE id = ?', [req.params.cid]);
    res.json({ message: 'Comentario eliminado' });
  } catch (err) {
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// ── ELIMINAR AVISO ─────────────────────────────────────────────────────────────
// Solo el autor, el director o la secretaria.
exports.eliminarAviso = async (req, res) => {
  const { id } = req.params;
  try {
    const [rows] = await pool.query('SELECT autor_id FROM avisos WHERE id = ?', [id]);
    if (!rows.length) return res.status(404).json({ error: 'Aviso no encontrado' });

    const esAutor = rows[0].autor_id === req.user.id;
    if (!esAutor && !ROLES_MODERAN.includes(req.user.rol)) {
      return res.status(403).json({ error: 'No podés eliminar este aviso' });
    }

    const [adj] = await pool.query('SELECT nombre_archivo FROM archivos_aula WHERE aviso_id = ?', [id]);
    await pool.query('DELETE FROM avisos WHERE id = ?', [id]);
    adj.forEach((f) => require('fs').promises.unlink(require('path').join(__dirname, '../../uploads/aula', f.nombre_archivo)).catch(() => {}));
    await logAction(req.user.id, `AVISO_ELIMINADO(id:${id})`, req.ip, req.headers['user-agent']);
    res.json({ message: 'Aviso eliminado' });
  } catch (err) {
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// ── DESCARGAR EL EVENTO (.ics) DE UN AVISO ─────────────────────────────────────
exports.descargarICS = async (req, res) => {
  try {
    const [rows] = await pool.query(`${SELECT_AVISO} WHERE a.id = ?`, [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Aviso no encontrado' });

    const aviso = rows[0];
    if (!puedeVerAnio(req.user, aviso.anio_id)) {
      return res.status(403).json({ error: 'Este aviso es de otro año' });
    }
    if (!aviso.fecha_evento) {
      return res.status(404).json({ error: 'Este aviso no tiene fecha de actividad' });
    }

    const ics = crearICS({
      uid: `aviso-${aviso.id}`,
      titulo: aviso.titulo,
      descripcion: aviso.contenido,
      fechaEvento: aviso.fecha_evento,
      todoElDia: !!aviso.todo_el_dia,
      organizador: { nombre: aviso.autor, email: emailDe(transporter.remitente) },
      metodo: 'PUBLISH',
    });
    res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="actividad.ics"');
    res.send(ics);
  } catch (err) {
    console.error('Error al generar .ics:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// ── ENDPOINTS PARA EL BOT (autenticados con BOT_SECRET) ───────────────────────
exports.crearAvisoPorBot = async (req, res) => {
  const { titulo, contenido, telegram_id } = req.body;
  if (!titulo || !contenido || !telegram_id) {
    return res.status(400).json({ error: 'Faltan datos' });
  }
  try {
    const [rows] = await pool.query(
      'SELECT id, rol, nombre, anio_id FROM users WHERE telegram_id = ? AND activo = 1',
      [String(telegram_id)]
    );
    if (!rows.length) {
      return res.status(403).json({ error: 'Telegram ID no registrado o cuenta inactiva' });
    }
    // Mismas reglas que desde la web: año, fecha de actividad, invitaciones y límites del profesor.
    req.user = rows[0];
    return exports.crearAviso(req, res);
  } catch (err) {
    console.error('Error al crear aviso por bot:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

exports.listarAvisosPorBot = async (req, res) => {
  const { telegram_id } = req.query;
  if (!telegram_id) return res.status(400).json({ error: 'Falta telegram_id' });

  try {
    const [users] = await pool.query(
      'SELECT id, rol, anio_id FROM users WHERE telegram_id = ? AND activo = 1',
      [String(telegram_id)]
    );
    if (!users.length) {
      return res.status(403).json({ error: 'Telegram ID no registrado o cuenta inactiva' });
    }
    const user = users[0];

    let sql = `
      SELECT a.id, a.titulo, a.contenido, a.tipo, a.fecha,
             u.nombre AS autor, u.rol AS rol_autor
      FROM avisos a
      JOIN users u ON a.autor_id = u.id`;
    const params = [];

    if (user.rol === 'alumno') {
      if (user.anio_id) { sql += ' WHERE (a.anio_id IS NULL OR a.anio_id = ?)'; params.push(user.anio_id); }
      else              { sql += ' WHERE a.anio_id IS NULL'; }
    }

    const limit = Math.min(parseInt(req.query.limit) || 5, 20);
    sql += ' ORDER BY a.fecha DESC, a.id DESC LIMIT ?';
    params.push(limit);

    const [rows] = await pool.query(sql, params);
    res.json(rows);
  } catch (err) {
    console.error('Error en listarAvisosPorBot:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};
