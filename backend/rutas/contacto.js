// backend/rutas/contacto.js
const router = require('express').Router();
const { enviarConsulta } = require('../controladores/contactoController');

// Ruta pública — no requiere login, la usa el formulario de la página principal
router.post('/', enviarConsulta);

module.exports = router;
