const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
require('dotenv').config();

const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const avisoRoutes = require('./routes/avisos');
const asistenciaRoutes = require('./routes/asistencia');
const logRoutes = require('./routes/logs');

const app = express();
app.use(cors());
app.use(helmet());
app.use(morgan('dev'));
app.use(express.json());

app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/avisos', avisoRoutes);
app.use('/api/asistencia', asistenciaRoutes);
app.use('/api/logs', logRoutes);

app.get('/', (req, res) => res.json({ message: 'API Escuela OK ✅' }));

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Servidor en puerto ${PORT}`));
