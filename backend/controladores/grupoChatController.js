// © 2026 Pito, Santiago Vigna y Santiago Machado — Campus Virtual PROA. Todos los derechos reservados (ver LICENSE).
// backend/controladores/grupoChatController.js
// Grupos del chat del personal (director, secretaría, preceptor, profesor).
// Texto solamente. Cualquiera del personal puede crear un grupo; quien lo crea es
// administrador y puede sumar/quitar gente, renombrarlo o eliminarlo.
const pool = require('../config/db');

const ROLES_CHAT = ['director', 'secretaria', 'preceptor', 'profesor'];
const MAX_MIEMBROS = 100;

const acceso = (req, res) => {
  if (!ROLES_CHAT.includes(req.user.rol)) {
    res.status(403).json({ error: 'Solo el personal puede acceder al chat' });
    return false;
  }
  return true;
};

const idsLimpios = (arr) => [...new Set((Array.isArray(arr) ? arr : []).map(Number))].filter((n) => Number.isInteger(n) && n > 0);

// Devuelve la fila de membresía de quien consulta, o responde 404 si no pertenece al grupo.
const miMembresia = async (req, res, grupoId) => {
  const [r] = await pool.query(
    'SELECT m.es_admin, g.nombre, g.creador_id FROM chat_grupo_miembros m JOIN chat_grupos g ON g.id = m.grupo_id WHERE m.grupo_id = ? AND m.user_id = ?',
    [grupoId, req.user.id]);
  if (!r.length) { res.status(404).json({ error: 'Grupo no encontrado' }); return null; }
  return r[0];
};

const emitir = (req, userIds, evento, datos) => {
  const io = req.app.get('io');
  if (io) userIds.forEach((u) => io.to(`user_${u}`).emit(evento, datos));
};
const miembrosDe = async (grupoId) => (await pool.query('SELECT user_id FROM chat_grupo_miembros WHERE grupo_id = ?', [grupoId]))[0].map((r) => r.user_id);

// Mensaje de sistema ("Ana creó el grupo", "Luis salió"…).
const mensajeSistema = async (req, grupoId, texto) => {
  const [r] = await pool.query(
    'INSERT INTO chat_grupo_mensajes (grupo_id, remitente_id, contenido, sistema) VALUES (?, ?, ?, 1)', [grupoId, req.user.id, texto]);
  const msg = { id: r.insertId, grupo_id: grupoId, remitente_id: req.user.id, remitente_nombre: req.user.nombre, contenido: texto, sistema: true, enviado_en: new Date().toISOString() };
  emitir(req, (await miembrosDe(grupoId)).filter((u) => u !== req.user.id), 'nuevo_mensaje_grupo', msg);
  return msg;
};

const validarPersonal = async (ids) => {
  if (!ids.length) return [];
  const [r] = await pool.query("SELECT id, nombre FROM users WHERE id IN (?) AND activo = 1 AND rol IN ('director','secretaria','preceptor','profesor')", [ids]);
  return r;
};

// ── LISTAR MIS GRUPOS ─────────────────────────────────────────────────────────
exports.listar = async (req, res) => {
  if (!acceso(req, res)) return;
  try {
    const [rows] = await pool.query(`
      SELECT g.id, g.nombre,
             (SELECT COUNT(*) FROM chat_grupo_miembros x WHERE x.grupo_id = g.id) AS miembros,
             (SELECT COUNT(*) FROM chat_grupo_mensajes m
               WHERE m.grupo_id = g.id AND m.id > me.ultimo_leido AND m.remitente_id <> ? AND m.sistema = 0
                 AND NOT EXISTS (SELECT 1 FROM chat_grupo_ocultos o WHERE o.mensaje_id = m.id AND o.user_id = ?)) AS no_leidos,
             (SELECT MAX(m.id) FROM chat_grupo_mensajes m WHERE m.grupo_id = g.id) AS ultimo_id
      FROM chat_grupos g JOIN chat_grupo_miembros me ON me.grupo_id = g.id AND me.user_id = ?
      ORDER BY no_leidos DESC, ultimo_id DESC, g.nombre`, [req.user.id, req.user.id, req.user.id]);
    res.json(rows);
  } catch (err) {
    console.error('Error al listar grupos:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// ── CREAR ─────────────────────────────────────────────────────────────────────
exports.crear = async (req, res) => {
  if (!acceso(req, res)) return;
  const nombre = String(req.body.nombre || '').trim();
  if (!nombre) return res.status(400).json({ error: 'Ponele un nombre al grupo' });
  if (nombre.length > 80) return res.status(400).json({ error: 'El nombre es demasiado largo (máx. 80)' });
  const ids = idsLimpios(req.body.miembros).filter((i) => i !== req.user.id);
  if (!ids.length) return res.status(400).json({ error: 'Elegí al menos una persona para el grupo' });
  if (ids.length + 1 > MAX_MIEMBROS) return res.status(400).json({ error: `Un grupo admite hasta ${MAX_MIEMBROS} personas` });
  try {
    const validos = await validarPersonal(ids);
    if (validos.length !== ids.length) return res.status(400).json({ error: 'Alguna de las personas no existe o no es del personal' });
    const [g] = await pool.query('INSERT INTO chat_grupos (nombre, creador_id) VALUES (?, ?)', [nombre, req.user.id]);
    const gid = g.insertId;
    await pool.query('INSERT INTO chat_grupo_miembros (grupo_id, user_id, es_admin) VALUES (?, ?, 1)', [gid, req.user.id]);
    await pool.query('INSERT INTO chat_grupo_miembros (grupo_id, user_id) VALUES ?', [ids.map((i) => [gid, i])]);
    await mensajeSistema(req, gid, `${req.user.nombre} creó el grupo "${nombre}"`);
    emitir(req, ids, 'grupo_actualizado', { grupo_id: gid });
    res.status(201).json({ message: 'Grupo creado', id: gid });
  } catch (err) {
    console.error('Error al crear grupo:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// ── DETALLE (miembros) ────────────────────────────────────────────────────────
exports.detalle = async (req, res) => {
  if (!acceso(req, res)) return;
  const gid = parseInt(req.params.id);
  try {
    const yo = await miMembresia(req, res, gid); if (!yo) return;
    const [miembros] = await pool.query(
      `SELECT u.id, u.nombre, u.rol, u.foto, m.es_admin FROM chat_grupo_miembros m JOIN users u ON u.id = m.user_id
       WHERE m.grupo_id = ? ORDER BY m.es_admin DESC, u.nombre`, [gid]);
    res.json({ id: gid, nombre: yo.nombre, soy_admin: !!yo.es_admin, miembros: miembros.map((m) => ({ ...m, es_admin: !!m.es_admin })) });
  } catch (err) {
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// ── RENOMBRAR (admin) ─────────────────────────────────────────────────────────
exports.renombrar = async (req, res) => {
  if (!acceso(req, res)) return;
  const gid = parseInt(req.params.id);
  const nombre = String(req.body.nombre || '').trim();
  if (!nombre || nombre.length > 80) return res.status(400).json({ error: 'Nombre inválido (1 a 80 caracteres)' });
  try {
    const yo = await miMembresia(req, res, gid); if (!yo) return;
    if (!yo.es_admin) return res.status(403).json({ error: 'Solo un administrador del grupo puede renombrarlo' });
    await pool.query('UPDATE chat_grupos SET nombre = ? WHERE id = ?', [nombre, gid]);
    await mensajeSistema(req, gid, `${req.user.nombre} cambió el nombre del grupo a "${nombre}"`);
    emitir(req, await miembrosDe(gid), 'grupo_actualizado', { grupo_id: gid });
    res.json({ message: 'Grupo renombrado' });
  } catch (err) {
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// ── AGREGAR MIEMBROS (admin) ──────────────────────────────────────────────────
exports.agregarMiembros = async (req, res) => {
  if (!acceso(req, res)) return;
  const gid = parseInt(req.params.id);
  const ids = idsLimpios(req.body.ids);
  if (!ids.length) return res.status(400).json({ error: 'Elegí al menos una persona' });
  try {
    const yo = await miMembresia(req, res, gid); if (!yo) return;
    if (!yo.es_admin) return res.status(403).json({ error: 'Solo un administrador del grupo puede agregar gente' });
    const actuales = await miembrosDe(gid);
    const nuevos = ids.filter((i) => !actuales.includes(i));
    if (actuales.length + nuevos.length > MAX_MIEMBROS) return res.status(400).json({ error: `Un grupo admite hasta ${MAX_MIEMBROS} personas` });
    const validos = await validarPersonal(nuevos);
    if (validos.length !== nuevos.length) return res.status(400).json({ error: 'Alguna de las personas no existe o no es del personal' });
    if (nuevos.length) {
      // ultimo_leido = último mensaje actual: quien entra no ve lo anterior como "no leído"
      const [[u]] = await pool.query('SELECT COALESCE(MAX(id), 0) AS m FROM chat_grupo_mensajes WHERE grupo_id = ?', [gid]);
      await pool.query('INSERT INTO chat_grupo_miembros (grupo_id, user_id, ultimo_leido) VALUES ?', [nuevos.map((i) => [gid, i, u.m])]);
      await mensajeSistema(req, gid, `${req.user.nombre} agregó a ${validos.map((v) => v.nombre).join(', ')}`);
      emitir(req, [...actuales, ...nuevos], 'grupo_actualizado', { grupo_id: gid });
    }
    res.json({ message: nuevos.length ? 'Personas agregadas' : 'Ya estaban en el grupo', agregados: nuevos.length });
  } catch (err) {
    console.error('Error al agregar miembros:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// ── QUITAR A ALGUIEN (admin) o SALIR (cualquiera, userId = yo) ────────────────
exports.quitarMiembro = async (req, res) => {
  if (!acceso(req, res)) return;
  const gid = parseInt(req.params.id), uid = parseInt(req.params.userId);
  try {
    const yo = await miMembresia(req, res, gid); if (!yo) return;
    const salgo = uid === req.user.id;
    if (!salgo && !yo.es_admin) return res.status(403).json({ error: 'Solo un administrador puede quitar gente del grupo' });
    const [obj] = await pool.query('SELECT u.nombre, m.es_admin FROM chat_grupo_miembros m JOIN users u ON u.id = m.user_id WHERE m.grupo_id = ? AND m.user_id = ?', [gid, uid]);
    if (!obj.length) return res.status(404).json({ error: 'Esa persona no está en el grupo' });

    const antes = await miembrosDe(gid);
    await pool.query('DELETE FROM chat_grupo_miembros WHERE grupo_id = ? AND user_id = ?', [gid, uid]);
    const quedan = antes.filter((i) => i !== uid);
    if (!quedan.length) {
      await pool.query('DELETE FROM chat_grupos WHERE id = ?', [gid]); // se borran mensajes y membresías en cascada
    } else {
      // si no queda ningún admin, el miembro más antiguo pasa a serlo
      const [[a]] = await pool.query('SELECT COUNT(*) AS n FROM chat_grupo_miembros WHERE grupo_id = ? AND es_admin = 1', [gid]);
      if (!a.n) await pool.query('UPDATE chat_grupo_miembros SET es_admin = 1 WHERE grupo_id = ? ORDER BY unido_en, user_id LIMIT 1', [gid]);
      await mensajeSistema(req, gid, salgo ? `${obj[0].nombre} salió del grupo` : `${req.user.nombre} quitó a ${obj[0].nombre}`);
    }
    emitir(req, antes, 'grupo_actualizado', { grupo_id: gid });
    res.json({ message: salgo ? 'Saliste del grupo' : 'Persona quitada del grupo' });
  } catch (err) {
    console.error('Error al quitar miembro:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// ── ELIMINAR EL GRUPO (admin) ─────────────────────────────────────────────────
exports.eliminarGrupo = async (req, res) => {
  if (!acceso(req, res)) return;
  const gid = parseInt(req.params.id);
  try {
    const yo = await miMembresia(req, res, gid); if (!yo) return;
    if (!yo.es_admin) return res.status(403).json({ error: 'Solo un administrador puede eliminar el grupo' });
    const miembros = await miembrosDe(gid);
    await pool.query('DELETE FROM chat_grupos WHERE id = ?', [gid]);
    emitir(req, miembros, 'grupo_actualizado', { grupo_id: gid });
    res.json({ message: 'Grupo eliminado' });
  } catch (err) {
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// ── MENSAJES ──────────────────────────────────────────────────────────────────
exports.mensajes = async (req, res) => {
  if (!acceso(req, res)) return;
  const gid = parseInt(req.params.id);
  try {
    const yo = await miMembresia(req, res, gid); if (!yo) return;
    const limite = Math.min(parseInt(req.query.limit) || 100, 200);
    const [rows] = await pool.query(`
      SELECT m.id, m.grupo_id, m.remitente_id, u.nombre AS remitente_nombre, m.contenido, m.sistema, m.enviado_en
      FROM chat_grupo_mensajes m JOIN users u ON u.id = m.remitente_id
      WHERE m.grupo_id = ? AND NOT EXISTS (SELECT 1 FROM chat_grupo_ocultos o WHERE o.mensaje_id = m.id AND o.user_id = ?)
      ORDER BY m.id DESC LIMIT ?`, [gid, req.user.id, limite]);
    await pool.query(
      'UPDATE chat_grupo_miembros SET ultimo_leido = (SELECT COALESCE(MAX(id), 0) FROM chat_grupo_mensajes WHERE grupo_id = ?) WHERE grupo_id = ? AND user_id = ?',
      [gid, gid, req.user.id]);
    res.json(rows.reverse().map((r) => ({ ...r, sistema: !!r.sistema })));
  } catch (err) {
    console.error('Error al leer mensajes del grupo:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

exports.marcarLeido = async (req, res) => {
  if (!acceso(req, res)) return;
  const gid = parseInt(req.params.id);
  try {
    const yo = await miMembresia(req, res, gid); if (!yo) return;
    await pool.query(
      'UPDATE chat_grupo_miembros SET ultimo_leido = (SELECT COALESCE(MAX(id), 0) FROM chat_grupo_mensajes WHERE grupo_id = ?) WHERE grupo_id = ? AND user_id = ?',
      [gid, gid, req.user.id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

exports.enviar = async (req, res) => {
  if (!acceso(req, res)) return;
  const gid = parseInt(req.params.id);
  const contenido = String(req.body.contenido || '').trim();
  if (!contenido) return res.status(400).json({ error: 'El mensaje está vacío' });
  if (contenido.length > 2000) return res.status(400).json({ error: 'El mensaje es demasiado largo (máx. 2000 caracteres)' });
  try {
    const yo = await miMembresia(req, res, gid); if (!yo) return;
    const clientId = /^[A-Za-z0-9_-]{8,40}$/.test(String(req.body.client_id || '')) ? String(req.body.client_id) : null;
    if (clientId) {
      const [ya] = await pool.query('SELECT id FROM chat_grupo_mensajes WHERE remitente_id = ? AND client_id = ?', [req.user.id, clientId]);
      if (ya.length) return res.status(200).json({ message: 'Mensaje ya enviado', id: ya[0].id, duplicado: true });
    }
    const [r] = await pool.query('INSERT INTO chat_grupo_mensajes (grupo_id, remitente_id, contenido, client_id) VALUES (?, ?, ?, ?)', [gid, req.user.id, contenido, clientId]);
    await pool.query('UPDATE chat_grupo_miembros SET ultimo_leido = ? WHERE grupo_id = ? AND user_id = ?', [r.insertId, gid, req.user.id]);
    const msg = { id: r.insertId, grupo_id: gid, remitente_id: req.user.id, remitente_nombre: req.user.nombre, contenido, sistema: false, enviado_en: new Date().toISOString() };
    emitir(req, (await miembrosDe(gid)).filter((u) => u !== req.user.id), 'nuevo_mensaje_grupo', { ...msg, grupo_nombre: yo.nombre });
    res.status(201).json({ message: 'Mensaje enviado', id: r.insertId });
  } catch (err) {
    console.error('Error al enviar mensaje de grupo:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// ── BORRAR (como WhatsApp): "para mí" u "para todos" (autor o admin del grupo) ─
const borrarMensajes = async (req, gid, yo, ids, modo) => {
  if (!ids.length) return 0;
  const [rows] = await pool.query('SELECT id, remitente_id FROM chat_grupo_mensajes WHERE grupo_id = ? AND id IN (?)', [gid, ids]);
  if (!rows.length) return 0;
  if (modo === 'mi') {
    await pool.query('INSERT IGNORE INTO chat_grupo_ocultos (mensaje_id, user_id) VALUES ?', [rows.map((r) => [r.id, req.user.id])]);
    return rows.length;
  }
  const permitidos = rows.filter((r) => r.remitente_id === req.user.id || yo.es_admin).map((r) => r.id);
  if (!permitidos.length) return 0;
  await pool.query('DELETE FROM chat_grupo_mensajes WHERE id IN (?)', [permitidos]);
  const miembros = await miembrosDe(gid);
  permitidos.forEach((id) => emitir(req, miembros.filter((u) => u !== req.user.id), 'mensaje_grupo_borrado', { id, grupo_id: gid }));
  return permitidos.length;
};
const modoDe = (req) => (String(req.query.modo || req.body.modo || 'todos') === 'mi' ? 'mi' : 'todos');

exports.borrarMensaje = async (req, res) => {
  if (!acceso(req, res)) return;
  const gid = parseInt(req.params.id), mid = parseInt(req.params.mid);
  try {
    const yo = await miMembresia(req, res, gid); if (!yo) return;
    const [m] = await pool.query('SELECT remitente_id FROM chat_grupo_mensajes WHERE id = ? AND grupo_id = ?', [mid, gid]);
    if (!m.length) return res.status(404).json({ error: 'Mensaje no encontrado' });
    if (modoDe(req) === 'todos' && m[0].remitente_id !== req.user.id && !yo.es_admin) {
      return res.status(403).json({ error: 'Para borrar "para todos" tiene que ser tu mensaje (o ser administrador del grupo)' });
    }
    await borrarMensajes(req, gid, yo, [mid], modoDe(req));
    res.json({ message: 'Mensaje borrado' });
  } catch (err) {
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

exports.borrarVarios = async (req, res) => {
  if (!acceso(req, res)) return;
  const gid = parseInt(req.params.id);
  const ids = idsLimpios(req.body.ids);
  if (!ids.length) return res.status(400).json({ error: 'Elegí al menos un mensaje' });
  if (ids.length > 500) return res.status(400).json({ error: 'Demasiados mensajes a la vez (máx. 500)' });
  try {
    const yo = await miMembresia(req, res, gid); if (!yo) return;
    if (modoDe(req) === 'todos' && !yo.es_admin) {
      const [ajenos] = await pool.query('SELECT id FROM chat_grupo_mensajes WHERE grupo_id = ? AND id IN (?) AND remitente_id <> ?', [gid, ids, req.user.id]);
      if (ajenos.length) return res.status(403).json({ error: 'Para borrar "para todos" solo podés elegir tus propios mensajes' });
    }
    const borrados = await borrarMensajes(req, gid, yo, ids, modoDe(req));
    res.json({ message: `${borrados} mensaje/s eliminado/s`, borrados });
  } catch (err) {
    console.error('Error al borrar varios (grupo):', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// Vaciar: "mi" oculta todo el historial para mí; "todos" borra los míos para todos.
exports.vaciar = async (req, res) => {
  if (!acceso(req, res)) return;
  const gid = parseInt(req.params.id);
  try {
    const yo = await miMembresia(req, res, gid); if (!yo) return;
    const modo = modoDe(req);
    const [rows] = modo === 'mi'
      ? await pool.query('SELECT id FROM chat_grupo_mensajes WHERE grupo_id = ?', [gid])
      : await pool.query('SELECT id FROM chat_grupo_mensajes WHERE grupo_id = ? AND remitente_id = ?', [gid, req.user.id]);
    const borrados = await borrarMensajes(req, gid, yo, rows.map((r) => r.id), modo);
    res.json({ message: `${borrados} mensaje/s eliminado/s`, borrados });
  } catch (err) {
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// Total de mensajes de grupo sin leer (para el puntito del menú).
exports.totalNoLeidos = async (userId) => {
  const [[r]] = await pool.query(`
    SELECT COUNT(*) AS n FROM chat_grupo_mensajes m
    JOIN chat_grupo_miembros me ON me.grupo_id = m.grupo_id AND me.user_id = ?
    WHERE m.id > me.ultimo_leido AND m.remitente_id <> ? AND m.sistema = 0
      AND NOT EXISTS (SELECT 1 FROM chat_grupo_ocultos o WHERE o.mensaje_id = m.id AND o.user_id = ?)`, [userId, userId, userId]);
  return r.n;
};
