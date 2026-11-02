// © 2026 Pito, Santiago Vigna y Santiago Machado — Campus Virtual PROA. Todos los derechos reservados (ver LICENSE).
// backend/controladores/archivoController.js
// Archivos del aula: guías, apuntes, consignas. Los suben profesores, preceptores,
// secretaría y dirección; los alumnos solo descargan lo de SU año (y lo general).
const pool = require('../config/db');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const multer = require('multer');
const { logAction } = require('../middleware/sessionLogger');
const {
  etiquetaAnio, puedePublicarEnAnio, puedeVerAnio, anioExiste, aIdONulo,
} = require('../utils/anios');

const ROLES_SUBEN = ['director', 'secretaria', 'preceptor', 'profesor'];
const ROLES_MODERAN = ['director', 'secretaria'];
const MAX_BYTES = 15 * 1024 * 1024; // 15 MB

const UPLOADS_DIR = path.join(__dirname, '../../uploads/aula');
fs.mkdirSync(UPLOADS_DIR, { recursive: true });

// Sin ejecutables, scripts ni HTML/SVG (que podrían ejecutar código al abrirse).
const EXTENSIONES_PERMITIDAS = [
  '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.odt', '.ods', '.odp',
  '.txt', '.csv', '.jpg', '.jpeg', '.png', '.gif', '.webp',
  '.zip', '.rar', '.7z', '.mp4', '.mp3',
];

// Guarda en disco con nombre aleatorio (nunca se usa el nombre que mandó el usuario).
const subida = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, UPLOADS_DIR),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();
      cb(null, `${crypto.randomUUID()}${ext}`);
    },
  }),
  limits: { fileSize: MAX_BYTES, files: 1 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (!EXTENSIONES_PERMITIDAS.includes(ext)) {
      const e = new Error(`Tipo de archivo no permitido (${ext || 'sin extensión'})`);
      e.codigo = 'EXTENSION';
      return cb(e);
    }
    cb(null, true);
  },
}).single('archivo');

// Middleware: procesa el multipart y traduce los errores de multer a respuestas claras.
exports.recibirArchivo = (req, res, next) => {
  subida(req, res, (err) => {
    if (!err) return next();
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ error: 'El archivo supera los 15 MB permitidos' });
    }
    if (err.codigo === 'EXTENSION') return res.status(400).json({ error: err.message });
    console.error('Error al recibir archivo:', err);
    res.status(400).json({ error: 'No se pudo recibir el archivo' });
  });
};

const borrarDeDisco = (nombreArchivo) => {
  if (!nombreArchivo) return;
  fs.promises.unlink(path.join(UPLOADS_DIR, nombreArchivo)).catch(() => {});
};

// ── SUBIR ──────────────────────────────────────────────────────────────────────
exports.subirArchivo = async (req, res) => {
  const archivo = req.file;
  const limpiar = () => archivo && borrarDeDisco(archivo.filename);

  if (!archivo) return res.status(400).json({ error: 'Elegí un archivo para subir' });
  if (!ROLES_SUBEN.includes(req.user.rol)) {
    limpiar();
    return res.status(403).json({ error: 'Tu rol no puede subir archivos' });
  }

  const anioId = aIdONulo(req.body.anio_id);
  const materiaId = aIdONulo(req.body.materia_id);
  const avisoId = aIdONulo(req.body.aviso_id);
  if (Number.isNaN(anioId) || Number.isNaN(materiaId) || Number.isNaN(avisoId)) {
    limpiar();
    return res.status(400).json({ error: 'Año o materia inválidos' });
  }

  try {
    if (anioId !== null && !(await anioExiste(anioId))) {
      limpiar();
      return res.status(404).json({ error: 'Año no encontrado' });
    }
    if (!(await puedePublicarEnAnio(req.user, anioId))) {
      limpiar();
      return res.status(403).json({
        error: anioId === null
          ? 'Elegí el año al que va dirigido el archivo'
          : 'Solo podés subir archivos a los años donde dictás materias',
      });
    }

    if (materiaId !== null) {
      const [m] = await pool.query('SELECT anio_id FROM materias WHERE id = ?', [materiaId]);
      if (!m.length) { limpiar(); return res.status(404).json({ error: 'Materia no encontrada' }); }
      if (anioId !== null && m[0].anio_id !== anioId) {
        limpiar();
        return res.status(400).json({ error: 'Esa materia no pertenece al año elegido' });
      }
    }

    if (avisoId !== null) {
      const [av] = await pool.query('SELECT autor_id, anio_id, materia_id FROM avisos WHERE id = ?', [avisoId]);
      if (!av.length) { limpiar(); return res.status(404).json({ error: 'Anuncio no encontrado' }); }
      if (av[0].autor_id !== req.user.id && !ROLES_MODERAN.includes(req.user.rol)) {
        limpiar(); return res.status(403).json({ error: 'Solo quien publicó el anuncio puede adjuntarle archivos' });
      }
      if (av[0].anio_id !== anioId || av[0].materia_id !== materiaId) {
        limpiar(); return res.status(400).json({ error: 'El archivo no coincide con el anuncio' });
      }
    }

    // El nombre original llega en latin1 desde multer; se lo pasa a UTF-8 para conservar tildes y ñ.
    const nombreOriginal = Buffer.from(archivo.originalname, 'latin1').toString('utf8').slice(0, 255);
    const descripcion = String(req.body.descripcion || '').trim().slice(0, 255) || null;

    const [r] = await pool.query(
      `INSERT INTO archivos_aula
         (nombre_original, nombre_archivo, tipo_mime, tamanio, descripcion, anio_id, materia_id, subido_por, aviso_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [nombreOriginal, archivo.filename, archivo.mimetype, archivo.size, descripcion, anioId, materiaId, req.user.id, avisoId]
    );
    await logAction(req.user.id, `ARCHIVO_SUBIDO(id:${r.insertId})`, req.ip, req.headers['user-agent']);
    res.status(201).json({ message: 'Archivo subido', id: r.insertId });
  } catch (err) {
    limpiar();
    console.error('Error al subir archivo:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// ── LISTAR ─────────────────────────────────────────────────────────────────────
exports.listarArchivos = async (req, res) => {
  try {
    const where = [];
    const params = [];

    if (req.user.rol === 'alumno') {
      if (req.user.anio_id) { where.push('(f.anio_id IS NULL OR f.anio_id = ?)'); params.push(req.user.anio_id); }
      else                  { where.push('f.anio_id IS NULL'); }
    } else {
      const filtroAnio = aIdONulo(req.query.anio_id);
      if (!Number.isNaN(filtroAnio) && filtroAnio !== null) { where.push('f.anio_id = ?'); params.push(filtroAnio); }
    }
    const filtroMateria = aIdONulo(req.query.materia_id);
    if (!Number.isNaN(filtroMateria) && filtroMateria !== null) { where.push('f.materia_id = ?'); params.push(filtroMateria); }
    // Los adjuntos de un anuncio se ven en el anuncio, no en el material general.
    const filtroAviso = aIdONulo(req.query.aviso_id);
    if (!Number.isNaN(filtroAviso) && filtroAviso !== null) { where.push('f.aviso_id = ?'); params.push(filtroAviso); }
    else where.push('f.aviso_id IS NULL');

    const [rows] = await pool.query(`
      SELECT f.id, f.nombre_original, f.tipo_mime, f.tamanio, f.descripcion, f.creado_en,
             f.anio_id, ${etiquetaAnio('an')} AS anio,
             f.materia_id, m.nombre AS materia,
             f.subido_por, u.nombre AS subido_por_nombre
      FROM archivos_aula f
      JOIN users u        ON u.id  = f.subido_por
      LEFT JOIN anios an  ON an.id = f.anio_id
      LEFT JOIN materias m ON m.id = f.materia_id
      ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
      ORDER BY f.creado_en DESC, f.id DESC
      LIMIT 200`, params);

    res.json(rows);
  } catch (err) {
    console.error('Error al listar archivos:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// ── DESCARGAR ──────────────────────────────────────────────────────────────────
exports.descargarArchivo = async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM archivos_aula WHERE id = ?', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Archivo no encontrado' });

    const f = rows[0];
    if (!puedeVerAnio(req.user, f.anio_id)) {
      return res.status(403).json({ error: 'Este archivo es de otro año' });
    }

    const ruta = path.join(UPLOADS_DIR, f.nombre_archivo);
    if (!fs.existsSync(ruta)) {
      return res.status(404).json({ error: 'El archivo ya no está en el servidor' });
    }

    // Nombre ASCII de respaldo + nombre real codificado (RFC 5987) para tildes y ñ.
    const respaldo = f.nombre_original.replace(/[^\x20-\x7E]/g, '_').replace(/["\\]/g, '_');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${respaldo}"; filename*=UTF-8''${encodeURIComponent(f.nombre_original)}`
    );
    res.setHeader('Content-Type', f.tipo_mime || 'application/octet-stream');
    res.sendFile(ruta);
  } catch (err) {
    console.error('Error al descargar archivo:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// ── ELIMINAR (quien lo subió, director o secretaria) ──────────────────────────
exports.eliminarArchivo = async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT subido_por, nombre_archivo FROM archivos_aula WHERE id = ?', [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Archivo no encontrado' });

    const esAutor = rows[0].subido_por === req.user.id;
    if (!esAutor && !ROLES_MODERAN.includes(req.user.rol)) {
      return res.status(403).json({ error: 'No podés eliminar este archivo' });
    }

    await pool.query('DELETE FROM archivos_aula WHERE id = ?', [req.params.id]);
    borrarDeDisco(rows[0].nombre_archivo);
    await logAction(req.user.id, `ARCHIVO_ELIMINADO(id:${req.params.id})`, req.ip, req.headers['user-agent']);
    res.json({ message: 'Archivo eliminado' });
  } catch (err) {
    console.error('Error al eliminar archivo:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};
