const router = require('express').Router();
const { crearUsuario, listarUsuarios, asignarRol } = require('../controllers/userController');
const { verifyToken, checkRol } = require('../middleware/authMiddleware');

router.post('/', verifyToken, checkRol('director', 'secretaria'), crearUsuario);
router.get('/', verifyToken, checkRol('director', 'secretaria'), listarUsuarios);
router.put('/rol', verifyToken, checkRol('director', 'secretaria'), asignarRol);

module.exports = router;
