// backend/rutas/asistencia.js
const router = require('express').Router();
const {
  registrarAsistencia, verAsistenciaAlumno,
  verAsistenciaCurso, asistenciaPorTelegramId,
  editarAsistencia, borrarAsistencia
} = require('../controladores/asistenciaController');
const { verifyToken, checkRol, verifyBotSecret } = require('../middleware/authMiddleware');

const STAFF_ASISTENCIA = ['director', 'secretaria', 'preceptor'];

router.post('/',
  verifyToken, checkRol('preceptor'), registrarAsistencia);

router.get('/alumno/:alumnoId',
  verifyToken, checkRol('director','secretaria','preceptor','profesor','alumno'), verAsistenciaAlumno);

router.get('/curso/:cursoId',
  verifyToken, checkRol(...STAFF_ASISTENCIA), verAsistenciaCurso);

// Editar estado de un registro existente
router.put('/:id',
  verifyToken, checkRol(...STAFF_ASISTENCIA), editarAsistencia);

// Borrar un registro
router.delete('/:id',
  verifyToken, checkRol(...STAFF_ASISTENCIA), borrarAsistencia);

// Endpoint para el bot
router.get('/bot', verifyBotSecret, asistenciaPorTelegramId);

module.exports = router;
