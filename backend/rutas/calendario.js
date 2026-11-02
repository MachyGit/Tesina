// © 2026 Pito, Santiago Vigna y Santiago Machado — Campus Virtual PROA. Todos los derechos reservados (ver LICENSE).
// backend/rutas/calendario.js
const router = require('express').Router();
const { listar, crear, eliminar } = require('../controladores/calendarioController');
const { verifyToken } = require('../middleware/authMiddleware');

router.get('/',       verifyToken, listar);
router.post('/',      verifyToken, crear);
router.delete('/:id', verifyToken, eliminar);

module.exports = router;
