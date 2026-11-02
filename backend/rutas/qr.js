// backend/rutas/qr.js
const router = require('express').Router();
const { generarQR, registrarPorQR, listarRegistrosQR } = require('../controladores/qrController');
const { verifyToken, checkRol } = require('../middleware/authMiddleware');

router.post('/generar', verifyToken, checkRol('director','secretaria','preceptor'), generarQR);
router.post('/registrar', verifyToken, registrarPorQR);
router.get('/registros', verifyToken, checkRol('director','secretaria','preceptor'), listarRegistrosQR);

module.exports = router;
