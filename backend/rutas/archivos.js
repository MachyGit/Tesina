// © 2026 Pito, Santiago Vigna y Santiago Machado — Campus Virtual PROA. Todos los derechos reservados (ver LICENSE).
// backend/rutas/archivos.js
const router = require('express').Router();
const {
  recibirArchivo, subirArchivo, listarArchivos, descargarArchivo, eliminarArchivo,
} = require('../controladores/archivoController');
const { verifyToken, checkRol } = require('../middleware/authMiddleware');

router.get('/',                verifyToken, listarArchivos);
router.get('/:id/descargar',   verifyToken, descargarArchivo);
// El rol se valida ANTES de recibir el archivo, así no se escribe nada en disco si no corresponde.
router.post('/',               verifyToken, checkRol('director', 'secretaria', 'preceptor', 'profesor'),
                               recibirArchivo, subirArchivo);
router.delete('/:id',          verifyToken, eliminarArchivo);

module.exports = router;
