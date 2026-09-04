// backend/rutas/users.js
const router = require('express').Router();
const {
  crearUsuario, listarUsuarios, asignarRol,
  toggleActivo, obtenerPerfil, subirFoto,
  generarTokenTelegram, editarNombre,
  cambiarPassword, resetearPasswordAdmin
} = require('../controladores/userController');
const { verifyToken, checkRol } = require('../middleware/authMiddleware');

// Perfil propio
router.get('/perfil',           verifyToken, obtenerPerfil);
router.put('/foto',             verifyToken, subirFoto);
router.post('/telegram-token',  verifyToken, generarTokenTelegram);

// Cambiar la propia contraseña (primer ingreso, o cambio voluntario)
router.put('/password',         verifyToken, cambiarPassword);

// Cualquier usuario puede cambiar su propio nombre; admins pueden cambiar cualquiera
router.put('/:userId/nombre',   verifyToken, editarNombre);

// Solo admins
router.post('/',                     verifyToken, checkRol('director','secretaria','profesor'), crearUsuario);
router.get('/',                      verifyToken, checkRol('director','secretaria','profesor'), listarUsuarios);
router.put('/rol',                   verifyToken, checkRol('director','secretaria','profesor'), asignarRol);
router.put('/:userId/toggle-activo', verifyToken, checkRol('director','secretaria','profesor'), toggleActivo);

// Resetear la contraseña de otro usuario que perdió el acceso a su mail.
// Solo director y secretaria (no cualquier admin, a diferencia de las de arriba).
router.post('/:userId/reset-password', verifyToken, checkRol('director','secretaria'), resetearPasswordAdmin);

module.exports = router;
