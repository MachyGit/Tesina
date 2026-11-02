// © 2026 Pito, Santiago Vigna y Santiago Machado — Campus Virtual PROA. Todos los derechos reservados (ver LICENSE).
// backend/rutas/asistencia.js
const router = require('express').Router();
const {
  registrarAsistencia, verAsistenciaAlumno, verAsistenciaAnio,
  verAsistenciaCurso, asistenciaPorTelegramId,
  editarAsistencia, borrarAsistencia,
  generarQR, registrarPorQR, exportarExcel,
} = require('../controladores/asistenciaController');
const { verifyToken, checkRol, verifyBotSecret } = require('../middleware/authMiddleware');

const STAFF_ASISTENCIA = ['director', 'secretaria', 'preceptor'];

// Endpoint para el bot (va primero: "bot" no debe interpretarse como un id)
router.get('/bot', verifyBotSecret, asistenciaPorTelegramId);

// ── QR de ingreso ──
// Quien administra genera el QR rotativo; el alumno lo escanea y se registra.
router.get('/qr',  verifyToken, checkRol(...STAFF_ASISTENCIA), generarQR);
router.post('/qr', verifyToken, checkRol('alumno'), registrarPorQR);

// Excel con todas las asistencias (va antes de '/:id')
router.get('/exportar', verifyToken, checkRol(...STAFF_ASISTENCIA), exportarExcel);

router.post('/',
  verifyToken, checkRol(...STAFF_ASISTENCIA), registrarAsistencia);

router.get('/alumno/:alumnoId',
  verifyToken, checkRol('director','secretaria','preceptor','profesor','alumno'), verAsistenciaAlumno);

router.get('/anio/:anioId',
  verifyToken, checkRol('director','secretaria','preceptor','profesor'), verAsistenciaAnio);

router.get('/curso/:cursoId',
  verifyToken, checkRol(...STAFF_ASISTENCIA), verAsistenciaCurso);

// Editar estado de un registro existente
router.put('/:id',
  verifyToken, checkRol(...STAFF_ASISTENCIA), editarAsistencia);

// Borrar un registro
router.delete('/:id',
  verifyToken, checkRol(...STAFF_ASISTENCIA), borrarAsistencia);

module.exports = router;
