// © 2026 Pito, Santiago Vigna y Santiago Machado — Campus Virtual PROA. Todos los derechos reservados (ver LICENSE).
// backend/utils/calendario.js
// Eventos de calendario para las actividades que publican los profesores.
//
//  - enlaceGoogleCalendar(): URL "Agregar a Google Calendar" (abre Google
//    Calendar con el evento ya cargado; la persona solo confirma).
//  - crearICS(): archivo .ics estándar. Sirve para Google Calendar, Outlook,
//    Apple Calendar. Con method=REQUEST y asistentes, Gmail lo muestra como una
//    invitación ("¿Vas a ir? Sí/No") y lo agrega al calendario del alumno.
const { dos } = require('./fechas');

const DURACION_DEFECTO_MIN = 60;

// MySQL devuelve DATETIME como Date (hora local) o como string 'YYYY-MM-DD HH:MM:SS'.
const aDate = (v) => {
  if (v instanceof Date) return v;
  if (typeof v === 'string') return new Date(v.replace(' ', 'T'));
  return new Date(v);
};

// Formato de Google/ICS en "hora flotante" local: 20261024T153000
const fmtLocal = (d) =>
  `${d.getFullYear()}${dos(d.getMonth() + 1)}${dos(d.getDate())}T${dos(d.getHours())}${dos(d.getMinutes())}${dos(d.getSeconds())}`;
const fmtDia = (d) => `${d.getFullYear()}${dos(d.getMonth() + 1)}${dos(d.getDate())}`;
const fmtUTC = (d) =>
  `${d.getUTCFullYear()}${dos(d.getUTCMonth() + 1)}${dos(d.getUTCDate())}T${dos(d.getUTCHours())}${dos(d.getUTCMinutes())}${dos(d.getUTCSeconds())}Z`;

// Rango [inicio, fin) del evento.
const rango = (fechaEvento, todoElDia, duracionMin = DURACION_DEFECTO_MIN) => {
  const inicio = aDate(fechaEvento);
  if (todoElDia) {
    const fin = new Date(inicio.getFullYear(), inicio.getMonth(), inicio.getDate() + 1);
    return { inicio, fin };
  }
  return { inicio, fin: new Date(inicio.getTime() + duracionMin * 60 * 1000) };
};

const zonaHoraria = () => process.env.TZ_CAMPUS || 'America/Argentina/Cordoba';

const enlaceGoogleCalendar = ({ titulo, descripcion, fechaEvento, todoElDia }) => {
  if (!fechaEvento) return null;
  const { inicio, fin } = rango(fechaEvento, todoElDia);
  const dates = todoElDia
    ? `${fmtDia(inicio)}/${fmtDia(fin)}`
    : `${fmtLocal(inicio)}/${fmtLocal(fin)}`;
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: titulo || 'Actividad',
    details: descripcion || '',
    dates,
    ctz: zonaHoraria(),
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
};

// Escapa texto según RFC 5545 y parte líneas largas (máx. 75 bytes por línea).
const esc = (t) =>
  String(t || '')
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');

const plegar = (linea) => {
  const out = [];
  let resto = linea;
  while (Buffer.byteLength(resto) > 75) {
    let corte = 75;
    while (Buffer.byteLength(resto.slice(0, corte)) > 75) corte--;
    out.push(resto.slice(0, corte));
    resto = ' ' + resto.slice(corte);
  }
  out.push(resto);
  return out.join('\r\n');
};

const crearICS = ({
  uid, titulo, descripcion, fechaEvento, todoElDia,
  organizador, asistentes = [], metodo = 'PUBLISH',
}) => {
  const { inicio, fin } = rango(fechaEvento, todoElDia);
  const lineas = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Campus Virtual PROA//ES',
    'CALSCALE:GREGORIAN',
    `METHOD:${metodo}`,
    'BEGIN:VEVENT',
    `UID:${uid}@campus-proa`,
    `DTSTAMP:${fmtUTC(new Date())}`,
  ];

  if (todoElDia) {
    lineas.push(`DTSTART;VALUE=DATE:${fmtDia(inicio)}`);
    lineas.push(`DTEND;VALUE=DATE:${fmtDia(fin)}`);
  } else {
    lineas.push(`DTSTART;TZID=${zonaHoraria()}:${fmtLocal(inicio)}`);
    lineas.push(`DTEND;TZID=${zonaHoraria()}:${fmtLocal(fin)}`);
  }

  lineas.push(`SUMMARY:${esc(titulo)}`);
  if (descripcion) lineas.push(`DESCRIPTION:${esc(descripcion)}`);
  if (organizador && organizador.email) {
    lineas.push(`ORGANIZER;CN=${esc(organizador.nombre || 'Campus PROA')}:mailto:${organizador.email}`);
  }
  asistentes.forEach((a) => {
    lineas.push(
      `ATTENDEE;CN=${esc(a.nombre)};ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=FALSE:mailto:${a.email}`
    );
  });
  lineas.push('STATUS:CONFIRMED', 'TRANSP:OPAQUE');
  // Recordatorio: 1 hora antes
  lineas.push(
    'BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:Recordatorio', 'TRIGGER:-PT1H', 'END:VALARM'
  );
  lineas.push('END:VEVENT', 'END:VCALENDAR');

  return lineas.map(plegar).join('\r\n') + '\r\n';
};

module.exports = { enlaceGoogleCalendar, crearICS, aDate };
