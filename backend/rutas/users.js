// © 2026 Pito, Santiago Vigna y Santiago Machado — Campus Virtual PROA. Todos los derechos reservados (ver LICENSE).
// backend/rutas/users.js
const router = require('express').Router();
const {
  crearUsuario, listarUsuarios, asignarRol,
  toggleActivo, obtenerPerfil, subirFoto,
  generarTokenTelegram, editarNombre,
  cambiarPassword, resetearPasswordAdmin,
  quitarFotoPropia, quitarFotoUsuario,
  asignarAnio, aprobarUsuario, rechazarUsuario, marcarExAlumno,
} = require('../controladores/userController');
const { verifyToken, checkRol } = require('../middleware/authMiddleware');

const ADMINS = ['director', 'secretaria'];

// Perfil propio (cualquier usuario)
router.get('/perfil',           verifyToken, obtenerPerfil);
router.put('/foto',             verifyToken, subirFoto);
router.delete('/foto',          verifyToken, quitarFotoPropia);
router.post('/telegram-token',  verifyToken, generarTokenTelegram);
router.put('/password',         verifyToken, cambiarPassword);

// Listado: el staff lo necesita para elegir destinatarios (chat) y ver alumnos
router.get('/', verifyToken, checkRol('director', 'secretaria', 'preceptor', 'profesor'), listarUsuarios);

// Solo dirección y secretaría
router.post('/',          verifyToken, checkRol(...ADMINS), crearUsuario);
router.put('/rol',        verifyToken, checkRol(...ADMINS), asignarRol);

// Nombre: el propio, o cualquier usuario si sos admin (se valida en el controlador)
router.put('/:userId/nombre',        verifyToken, editarNombre);
router.put('/:userId/toggle-activo', verifyToken, checkRol(...ADMINS), toggleActivo);
router.put('/:userId/anio',          verifyToken, checkRol(...ADMINS), asignarAnio);
router.post('/:userId/ex-alumno',    verifyToken, checkRol(...ADMINS), marcarExAlumno);
router.post('/:userId/aprobar',      verifyToken, checkRol(...ADMINS), aprobarUsuario);
router.delete('/:userId/rechazar',   verifyToken, checkRol(...ADMINS), rechazarUsuario);
router.delete('/:userId/foto',       verifyToken, checkRol(...ADMINS), quitarFotoUsuario);
router.post('/:userId/reset-password', verifyToken, checkRol(...ADMINS), resetearPasswordAdmin);

module.exports = router;
