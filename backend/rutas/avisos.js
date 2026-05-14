const router = require('express').Router();
const { crearAviso, listarAvisos, eliminarAviso } = require('../controllers/avisoController');
const { verifyToken, checkRol } = require('../middleware/authMiddleware');

router.post('/', verifyToken, checkRol('director', 'secretaria', 'preceptor', 'profesor'), crearAviso);
router.get('/', verifyToken, listarAvisos);
router.delete('/:id', verifyToken, checkRol('director', 'secretaria'), eliminarAviso);

module.exports = router;
