// © 2026 Pito, Santiago Vigna y Santiago Machado — Campus Virtual PROA. Todos los derechos reservados (ver LICENSE).
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
const { asegurarEsquema } = require('./backend/config/migraciones');

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
// Detrás de un túnel o proxy (ngrok, Cloudflare, Railway…) la IP real viene en X-Forwarded-For.
app.set('trust proxy', 1);

// CSP desactivada: el campus usa scripts y estilos propios dentro de las páginas y fuentes de Google.
app.use(helmet({ contentSecurityPolicy: false, crossOriginResourcePolicy: false }));

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

// Vincular Telegram: el código tiene 6 dígitos, así que se limita para impedir adivinarlo
// (todas las llamadas vienen del bot, por eso el tope es global y no por persona).
const vincularLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 40,
  message: { error: 'Demasiados intentos de vinculación. Esperá unos minutos.' },
  standardHeaders: true,
  legacyHeaders: false,
});

app.use(generalLimiter);
app.use('/api/telegram/vincular', vincularLimiter);

// ── Logging ────────────────────────────────────────────────────────────────────
if (process.env.NODE_ENV !== 'test') {
  app.use(morgan('dev'));
}

// ── Body parsing ───────────────────────────────────────────────────────────────
// limit 5mb para permitir fotos en base64
// El chat recibe archivos en base64 (hasta ~10 MB): su límite va ANTES del parser global.
app.use('/api/chat/archivo', express.json({ limit: '15mb' }));
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
app.use('/api/horarios',                require('./backend/rutas/horarios'));
app.use('/api/calendario',              require('./backend/rutas/calendario'));
app.use('/api/chat',                    require('./backend/rutas/chat'));
app.use('/api/archivos',                require('./backend/rutas/archivos'));
app.use('/api/contacto', contactoLimiter, require('./backend/rutas/contacto'));

// ── Frontend estático ─────────────────────────────────────────────────────────
// El backend también sirve las páginas (frontend-web/public). Así un solo túnel/URL
// alcanza para todo: abrí http://localhost:5000/login.html
require('./backend/middleware/autoria')(app); // firma de autoría (ver LICENSE)
app.use(express.static(path.join(__dirname, 'frontend-web/public')));

// ── Ruta raíz ─────────────────────────────────────────────────────────────────
app.get('/api', (_req, res) => res.json({
  app:     'Campus Virtual PROA',
  autoria: require('./backend/config/autoria').TEXTO,
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

// Primero se verifica/actualiza el esquema de la base (idempotente) y recién después se escucha.
asegurarEsquema()
  .catch(err => console.error('⚠️  No se pudo verificar el esquema de la base:', err.message))
  .finally(() => {
    require('./backend/utils/integridad').verificar('arranque');
    setInterval(() => require('./backend/utils/integridad').verificar('chequeo periódico'), 6 * 60 * 60 * 1000); // cada 6 hs
    server.listen(PORT, HOST, () => {
      console.log(`\n🚀 Servidor corriendo en http://localhost:${PORT} (accesible en la red por tu IP local)`);
      console.log(`   Modo: ${process.env.NODE_ENV || 'development'}`);
      console.log(`   ${require('./backend/config/autoria').TEXTO}\n`);
    });
  });
