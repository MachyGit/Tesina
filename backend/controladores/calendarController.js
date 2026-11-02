// backend/controladores/calendarController.js
const { google } = require('googleapis');
const pool = require('../config/db');

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI
);

const SCOPES = ['https://www.googleapis.com/auth/calendar.events'];

exports.getAuthUrl = (req, res) => {
  const url = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    prompt: 'consent'
  });
  res.json({ url });
};

exports.callback = async (req, res) => {
  const { code } = req.query;
  try {
    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);
    // Guardar tokens simplificado (en producción guardar por usuario)
    res.redirect((process.env.FRONTEND_URL || 'http://localhost:5000') + '/dashboard/director.html?calendar=connected');
  } catch (err) {
    console.error('Calendar error:', err);
    res.redirect((process.env.FRONTEND_URL || 'http://localhost:5000') + '/dashboard/director.html?calendar=error');
  }
};

exports.crearEvento = async (req, res) => {
  const { titulo, descripcion, fechaInicio, fechaFin } = req.body;
  try {
    oauth2Client.setCredentials({
      access_token: req.body.access_token,
      refresh_token: req.body.refresh_token
    });
    const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
    const event = {
      summary: titulo,
      description: descripcion,
      start: { dateTime: fechaInicio, timeZone: 'America/Argentina/Buenos_Aires' },
      end: { dateTime: fechaFin, timeZone: 'America/Argentina/Buenos_Aires' },
    };
    const response = await calendar.events.insert({
      calendarId: 'primary',
      resource: event,
    });
    res.json({ message: 'Evento creado en Google Calendar', link: response.data.htmlLink });
  } catch (err) {
    console.error('Error crear evento:', err);
    res.status(500).json({ error: 'Error al crear evento en Google Calendar' });
  }
};
