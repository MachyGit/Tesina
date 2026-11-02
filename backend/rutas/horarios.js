// © 2026 Pito, Santiago Vigna y Santiago Machado — Campus Virtual PROA. Todos los derechos reservados (ver LICENSE).
// backend/rutas/horarios.js
const router = require('express').Router();
const { listar, crear, eliminar } = require('../controladores/horarioController');
const { verifyToken, checkRol } = require('../middleware/authMiddleware');

router.get('/',       verifyToken, listar);
router.post('/',      verifyToken, checkRol('director', 'secretaria'), crear);
router.delete('/:id', verifyToken, checkRol('director', 'secretaria'), eliminar);

module.exports = router;
