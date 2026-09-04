// server.js
require('dotenv').config();
const express    = require('express');
const cors       = require('cors');
const helmet     = require('helmet');
const morgan     = require('morgan');
const rateLimit  = require('express-rate-limit');
const path       = require('path');
const http       = require('http');
const { Server } = require('socket.io');
const jwt        = require('jsonwebtoken');

const app    = express();
const server = http.createServer(app);

// ── WebSocket / Socket.IO ──────────────────────────────────────────────────────
const io = new Server(server, {
  cors: { origin: '*', methods: ['GET','POST'] }
});

// Autenticar conexión WebSocket con el mismo JWT
io.use((socket, next) => {
  const token = socket.handshake.auth?.token;
  if (!token) return next(new Error('Token requerido'));
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    socket.userId = decoded.id;
    socket.userRol = decoded.rol;
    next();
  } catch {
    next(new Error('Token inválido'));
  }
});

io.on('connection', (socket) => {
  socket.join(`user_${socket.userId}`);
  console.log(`🔌 WS: user_${socket.userId} (${socket.userRol}) conectado`);
  socket.on('disconnect', () => {
    console.log(`🔌 WS: user_${socket.userId} desconectado`);
  });
});

app.set('io', io);

// ── Seguridad básica ───────────────────────────────────────────────────────────
app.use(helmet());

// CORS: en desarrollo acepta todo; en producción limitar a tu dominio
app.use(cors({
  origin: process.env.NODE_ENV === 'production'
    ? ['https://tu-dominio.com']      // <-- cambiar en producción
    : '*',
  methods: ['GET','POST','PUT','DELETE'],
  allowedHeaders: ['Content-Type','Authorization','X-Bot-Secret'],
}));

// ── Rate limiting ──────────────────────────────────────────────────────────────
// Login: máx 10 intentos por IP cada 15 minutos (anti fuerza bruta)
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: 'Demasiados intentos. Esperá 15 minutos.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// General: máx 200 requests por IP cada 15 minutos
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  message: { error: 'Límite de peticiones alcanzado.' },
});

// Contacto: máx 5 consultas por IP cada 15 minutos (anti-spam del formulario)
const contactoLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { error: 'Enviaste demasiadas consultas. Esperá unos minutos.' },
});

app.use(generalLimiter);

// ── Logging ────────────────────────────────────────────────────────────────────
if (process.env.NODE_ENV !== 'test') {
  app.use(morgan('dev'));
}

// ── Body parsing ───────────────────────────────────────────────────────────────
// limit 5mb para permitir fotos en base64
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true, limit: '5mb' }));

// ── Rutas API ──────────────────────────────────────────────────────────────────
app.use('/api/auth',       loginLimiter, require('./backend/rutas/auth'));
app.use('/api/users',                   require('./backend/rutas/users'));
app.use('/api/avisos',                  require('./backend/rutas/avisos'));
app.use('/api/asistencia',              require('./backend/rutas/asistencia'));
app.use('/api/telegram',                require('./backend/rutas/telegram'));
app.use('/api/logs',                    require('./backend/rutas/logs'));
app.use('/api/anios',                   require('./backend/rutas/anios'));
app.use('/api/chat',                    require('./backend/rutas/chat'));
app.use('/api/contacto', contactoLimiter, require('./backend/rutas/contacto'));

// ── Ruta raíz ─────────────────────────────────────────────────────────────────
app.get('/', (_req, res) => res.json({
  app:     'Campus Virtual PROA',
  version: '2.0.0',
  estado:  'OK ✅'
}));

// ── Manejo de rutas no encontradas ─────────────────────────────────────────────
app.use((_req, res) => res.status(404).json({ error: 'Ruta no encontrada' }));

// ── Manejo global de errores ───────────────────────────────────────────────────
app.use((err, _req, res, _next) => {
  console.error('Error no manejado:', err);
  res.status(500).json({ error: 'Error interno del servidor' });
});

// ── Arrancar ───────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 5000;
const HOST = process.env.HOST || '0.0.0.0'; // 0.0.0.0 = escucha en todas las interfaces (LAN incluida)
server.listen(PORT, HOST, () => {
  console.log(`\n🚀 Servidor corriendo en http://localhost:${PORT} (accesible en la red por tu IP local)`);
  console.log(`   Modo: ${process.env.NODE_ENV || 'development'}\n`);
});
