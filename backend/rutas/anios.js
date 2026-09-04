// backend/rutas/anios.js
const router = require('express').Router();
const {
  crearAnio, listarAnios, eliminarAnio, editarAnio,
  crearMateria, listarMaterias, eliminarMateria, editarMateria
} = require('../controladores/anioController');
const { verifyToken, checkRol } = require('../middleware/authMiddleware');

const ADMIN = ['director', 'secretaria'];

// Años
router.get('/',           verifyToken, listarAnios);
router.post('/',          verifyToken, checkRol(...ADMIN), crearAnio);
router.put('/:id',        verifyToken, checkRol(...ADMIN), editarAnio);
router.delete('/:id',     verifyToken, checkRol(...ADMIN), eliminarAnio);

// Materias
router.get('/:anioId/materias',  verifyToken, listarMaterias);
router.post('/materias',         verifyToken, checkRol(...ADMIN), crearMateria);
router.put('/materias/:id',      verifyToken, checkRol(...ADMIN), editarMateria);
router.delete('/materias/:id',   verifyToken, checkRol(...ADMIN), eliminarMateria);

module.exports = router;
