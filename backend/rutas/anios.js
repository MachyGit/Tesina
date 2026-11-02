// © 2026 Pito, Santiago Vigna y Santiago Machado — Campus Virtual PROA. Todos los derechos reservados (ver LICENSE).
// backend/rutas/anios.js
const router = require('express').Router();
const {
  crearAnio, listarAnios, listarAniosDestino, eliminarAnio, editarAnio,
  crearMateria, listarMaterias, eliminarMateria, editarMateria, misMaterias, detalleMateria, vistaPreviaPase, pasarDeAnio
} = require('../controladores/anioController');
const { verifyToken, checkRol } = require('../middleware/authMiddleware');

const ADMIN = ['director', 'secretaria'];

// Años
router.get('/',           verifyToken, listarAnios);
router.get('/pase/vista-previa', verifyToken, checkRol(...ADMIN), vistaPreviaPase);
router.post('/pase',            verifyToken, checkRol(...ADMIN), pasarDeAnio);
router.get('/destinos',   verifyToken, listarAniosDestino);   // años donde puedo publicar avisos / subir archivos
router.post('/',          verifyToken, checkRol(...ADMIN), crearAnio);
router.put('/:id',        verifyToken, checkRol(...ADMIN), editarAnio);
router.delete('/:id',     verifyToken, checkRol(...ADMIN), eliminarAnio);

// Materias
router.get('/mis-materias',      verifyToken, misMaterias);
router.get('/materias/:id',      verifyToken, detalleMateria);
router.get('/:anioId/materias',  verifyToken, listarMaterias);
router.post('/materias',         verifyToken, checkRol(...ADMIN), crearMateria);
router.put('/materias/:id',      verifyToken, checkRol(...ADMIN), editarMateria);
router.delete('/materias/:id',   verifyToken, checkRol(...ADMIN), eliminarMateria);

module.exports = router;
