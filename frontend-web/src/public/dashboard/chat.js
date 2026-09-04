// frontend-web/public/dashboard/chat.js
// Lógica del chat privado en tiempo real.
// Se incluye en director, secretaria, preceptor y profesor.
// Requiere: base.js cargado antes, socket.io CDN disponible.

/* ═══════════════════════════════════════════════════════════════
   VARIABLES GLOBALES DEL CHAT
═══════════════════════════════════════════════════════════════ */
let chatSocket        = null;
let chatDestinatarioId = null;
let chatDestinatarioNombre = '';

/* ═══════════════════════════════════════════════════════════════
   INICIALIZAR CHAT (llamar al abrir el tab de mensajes)
═══════════════════════════════════════════════════════════════ */
async function initChat() {
  const user = getUser();
  if (!user || !user.token) return;

  // Cargar contactos
  await cargarContactos();

  // Conectar WebSocket si no está conectado
  if (!chatSocket) {
    _conectarSocket(user.token);
  }
}

function _conectarSocket(token) {
  // socket.io debe estar disponible vía CDN en el HTML
  if (typeof io === 'undefined') {
    console.warn('[Chat] socket.io no cargado — mensajes no serán en tiempo real');
    return;
  }

  chatSocket = io(window.BACKEND_URL || 'http://localhost:5000', {
    auth: { token },
    transports: ['websocket'],
  });

  chatSocket.on('connect', () => {
    console.log('[Chat] WebSocket conectado');
  });

  chatSocket.on('nuevo_mensaje', (msg) => {
    // Si el mensaje es de la conversación abierta, mostrarlo inmediatamente
    if (
      msg.remitente_id === chatDestinatarioId ||
      msg.destinatario_id === chatDestinatarioId
    ) {
      _renderMensaje(msg, false);
      _scrollToBottom();
    }

    // Actualizar badge de no leídos en el contacto
    actualizarBadgeContacto(msg.remitente_id);
  });

  chatSocket.on('connect_error', (err) => {
    console.warn('[Chat] Error WebSocket:', err.message);
  });
}

/* ═══════════════════════════════════════════════════════════════
   CARGAR LISTA DE CONTACTOS
═══════════════════════════════════════════════════════════════ */
async function cargarContactos() {
  const el = document.getElementById('listaContactos');
  if (!el) return;

  try {
    const contactos = await apiFetch('/api/chat/contactos');
    if (!contactos || !Array.isArray(contactos)) {
      el.innerHTML = '<div style="padding:20px;font-size:.82rem;color:#9ca3af;">Sin contactos disponibles</div>';
      return;
    }

    el.innerHTML = contactos.map(c => `
      <div class="chat-contacto" id="contacto_${c.id}"
           onclick="abrirConversacion(${c.id}, '${_esc(c.nombre)}')"
           style="display:flex; align-items:center; gap:10px; padding:12px 16px;
                  cursor:pointer; border-bottom:1px solid #f9f9f9;
                  transition:background .15s;">
        <div style="width:36px; height:36px; border-radius:50%; flex-shrink:0;
                    background:#1a3a6b; color:#fff; display:flex; align-items:center;
                    justify-content:center; font-weight:700; font-size:.85rem;
                    ${c.foto ? `background-image:url('${c.foto}');background-size:cover;font-size:0;` : ''}">
          ${c.foto ? '' : c.nombre[0].toUpperCase()}
        </div>
        <div style="flex:1; min-width:0;">
          <div style="font-size:.85rem; font-weight:600; color:#1c1c2e;
                      white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
            ${_esc(c.nombre)}
          </div>
          <div style="font-size:.72rem; color:#9ca3af; text-transform:uppercase; letter-spacing:.5px;">
            ${c.rol}
          </div>
        </div>
        ${c.no_leidos > 0
          ? `<span id="badge_${c.id}" style="background:#1a3a6b; color:#fff; border-radius:20px;
               font-size:.7rem; font-weight:700; padding:2px 7px; flex-shrink:0;">${c.no_leidos}</span>`
          : `<span id="badge_${c.id}" style="display:none;background:#1a3a6b;color:#fff;border-radius:20px;
               font-size:.7rem;font-weight:700;padding:2px 7px;flex-shrink:0;"></span>`
        }
      </div>
    `).join('');

    // Hover
    el.querySelectorAll('.chat-contacto').forEach(el => {
      el.addEventListener('mouseenter', () => el.style.background = '#f5f7fa');
      el.addEventListener('mouseleave', () => {
        el.style.background = el.classList.contains('activo') ? '#eff6ff' : '';
      });
    });

  } catch (err) {
    el.innerHTML = '<div style="padding:20px;font-size:.82rem;color:#dc2626;">Error al cargar contactos</div>';
  }
}

/* ═══════════════════════════════════════════════════════════════
   ABRIR CONVERSACIÓN
═══════════════════════════════════════════════════════════════ */
async function abrirConversacion(userId, nombre) {
  chatDestinatarioId     = userId;
  chatDestinatarioNombre = nombre;

  // Marcar contacto activo
  document.querySelectorAll('.chat-contacto').forEach(el => {
    el.classList.remove('activo');
    el.style.background = '';
  });
  const contactoEl = document.getElementById(`contacto_${userId}`);
  if (contactoEl) {
    contactoEl.classList.add('activo');
    contactoEl.style.background = '#eff6ff';
    // Limpiar badge
    const badge = document.getElementById(`badge_${userId}`);
    if (badge) badge.style.display = 'none';
  }

  // Header
  const header = document.getElementById('chatHeader');
  if (header) header.textContent = `💬 ${nombre}`;

  // Mostrar input
  const inputEl = document.getElementById('chatInput');
  if (inputEl) inputEl.style.display = 'flex';

  // Cargar mensajes
  await _cargarMensajes(userId);
}

async function _cargarMensajes(userId) {
  const contenedor = document.getElementById('chatMensajes');
  if (!contenedor) return;

  contenedor.innerHTML = '<div style="text-align:center;color:#9ca3af;font-size:.82rem;padding:20px;">Cargando...</div>';

  try {
    const mensajes = await apiFetch(`/api/chat/conversacion/${userId}`);
    contenedor.innerHTML = '';

    if (!mensajes || !mensajes.length) {
      contenedor.innerHTML = '<div style="text-align:center;color:#9ca3af;font-size:.82rem;padding:40px;">Aún no hay mensajes. ¡Mandá el primero!</div>';
      return;
    }

    const user = getUser();
    mensajes.forEach(m => _renderMensaje(m, m.remitente_id === user.id));
    _scrollToBottom();
  } catch {
    contenedor.innerHTML = '<div style="text-align:center;color:#dc2626;font-size:.82rem;padding:20px;">Error al cargar mensajes</div>';
  }
}

/* ═══════════════════════════════════════════════════════════════
   RENDERIZAR UN MENSAJE EN EL CONTENEDOR
═══════════════════════════════════════════════════════════════ */
function _renderMensaje(msg, esMio) {
  const contenedor = document.getElementById('chatMensajes');
  if (!contenedor) return;

  const user = getUser();
  esMio = esMio !== undefined ? esMio : msg.remitente_id === user?.id;

  const burbuja = document.createElement('div');
  burbuja.style.cssText = `
    display:flex; flex-direction:column;
    align-items:${esMio ? 'flex-end' : 'flex-start'};
    max-width:75%;
    align-self:${esMio ? 'flex-end' : 'flex-start'};
  `;

  const hora = new Date(msg.enviado_en).toLocaleTimeString('es-AR', { hour:'2-digit', minute:'2-digit' });

  let contenidoHtml = '';

  // Texto
  if (msg.contenido) {
    contenidoHtml += `
      <div style="background:${esMio ? '#1a3a6b' : '#f3f4f6'};
                  color:${esMio ? '#fff' : '#1c1c2e'};
                  padding:10px 14px; border-radius:${esMio ? '14px 14px 4px 14px' : '14px 14px 14px 4px'};
                  font-size:.88rem; line-height:1.5; word-break:break-word; max-width:100%;">
        ${_esc(msg.contenido)}
      </div>`;
  }

  // Archivos adjuntos
  if (msg.archivos && msg.archivos.length) {
    msg.archivos.forEach(a => {
      const icono = _iconoMime(a.mime);
      const tamanio = _formatBytes(a.tamanio);
      contenidoHtml += `
        <a href="/api/chat/archivo/${a.archivo}" target="_blank"
           style="display:flex; align-items:center; gap:8px; margin-top:6px;
                  background:${esMio ? 'rgba(255,255,255,.15)' : '#e5e7eb'};
                  color:${esMio ? '#fff' : '#1a3a6b'};
                  padding:8px 12px; border-radius:10px; text-decoration:none;
                  font-size:.82rem; max-width:220px;">
          <span style="font-size:1.2rem;">${icono}</span>
          <div style="min-width:0;">
            <div style="font-weight:600; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${_esc(a.nombre)}</div>
            <div style="font-size:.7rem; opacity:.7;">${tamanio}</div>
          </div>
        </a>`;
    });
  }

  burbuja.innerHTML = `
    ${contenidoHtml}
    <div style="font-size:.68rem; color:#9ca3af; margin-top:3px; padding:0 2px;">${hora}</div>
  `;

  contenedor.appendChild(burbuja);
}

/* ═══════════════════════════════════════════════════════════════
   ENVIAR MENSAJE DE TEXTO
═══════════════════════════════════════════════════════════════ */
async function enviarMensajeChat() {
  if (!chatDestinatarioId) return;

  const input = document.getElementById('chatTexto');
  const texto = input?.value.trim();
  if (!texto) return;

  input.value = '';
  input.style.height = 'auto';

  try {
    await apiFetch(`/api/chat/mensaje/${chatDestinatarioId}`, {
      method: 'POST',
      body: JSON.stringify({ contenido: texto })
    });

    // Mostrar el mensaje propio inmediatamente
    const user = getUser();
    _renderMensaje({
      remitente_id:     user.id,
      destinatario_id:  chatDestinatarioId,
      contenido:        texto,
      enviado_en:       new Date().toISOString(),
      archivos:         [],
    }, true);
    _scrollToBottom();
  } catch {
    alert('No se pudo enviar el mensaje. Verificá la conexión.');
  }
}

/* ═══════════════════════════════════════════════════════════════
   ADJUNTAR Y ENVIAR ARCHIVO
═══════════════════════════════════════════════════════════════ */
async function adjuntarArchivo(event) {
  if (!chatDestinatarioId) {
    alert('Primero seleccioná un contacto');
    return;
  }

  const file = event.target.files[0];
  if (!file) return;

  if (file.size > 10 * 1024 * 1024) {
    alert('El archivo supera los 10MB permitidos');
    return;
  }

  const reader = new FileReader();
  reader.onload = async (e) => {
    const base64 = e.target.result.split(',')[1]; // Sacar el prefijo data:mime;base64,

    try {
      await apiFetch(`/api/chat/archivo/${chatDestinatarioId}`, {
        method: 'POST',
        body: JSON.stringify({
          nombre_original: file.name,
          mime:            file.type,
          datos_base64:    base64,
        })
      });

      // Mostrar en la conversación del remitente
      const user = getUser();
      _renderMensaje({
        remitente_id:     user.id,
        destinatario_id:  chatDestinatarioId,
        contenido:        null,
        enviado_en:       new Date().toISOString(),
        archivos: [{
          nombre:  file.name,
          archivo: 'pendiente',
          mime:    file.type,
          tamanio: file.size,
        }],
      }, true);
      _scrollToBottom();
    } catch {
      alert('Error al enviar el archivo');
    }
  };
  reader.readAsDataURL(file);

  // Limpiar el input file para poder subir el mismo archivo de nuevo
  event.target.value = '';
}

/* ═══════════════════════════════════════════════════════════════
   GESTIÓN DE AÑOS Y MATERIAS (solo director/secretaria)
═══════════════════════════════════════════════════════════════ */
let anioSeleccionadoId = null;

async function cargarAnios() {
  const el = document.getElementById('listaAnios');
  if (!el) return;

  try {
    const anios = await apiFetch('/api/anios');
    if (!anios || !anios.length) {
      el.innerHTML = '<div class="empty"><div class="empty-icon">🏫</div>No hay años creados aún</div>';
      return;
    }

    el.innerHTML = `<table style="width:100%; border-collapse:collapse;">
      <thead><tr>
        <th style="text-align:left;padding:8px 12px;font-size:.75rem;color:#6b7280;border-bottom:2px solid #f0f0f0;">Año</th>
        <th style="text-align:left;padding:8px 12px;font-size:.75rem;color:#6b7280;border-bottom:2px solid #f0f0f0;">División</th>
        <th style="text-align:left;padding:8px 12px;font-size:.75rem;color:#6b7280;border-bottom:2px solid #f0f0f0;">Turno</th>
        <th style="text-align:left;padding:8px 12px;font-size:.75rem;color:#6b7280;border-bottom:2px solid #f0f0f0;">Materias</th>
        <th style="padding:8px 12px;border-bottom:2px solid #f0f0f0;"></th>
      </tr></thead>
      <tbody>
        ${anios.map(a => `
          <tr style="cursor:pointer;" onclick="seleccionarAnio(${a.id}, '${_esc(a.nombre)} ${a.division} - ${a.turno}')">
            <td style="padding:10px 12px;">${a.nombre}</td>
            <td style="padding:10px 12px;">${a.division}</td>
            <td style="padding:10px 12px;text-transform:capitalize;">${a.turno}</td>
            <td style="padding:10px 12px;">${a.cantidad_materias} materia/s</td>
            <td style="padding:10px 12px;text-align:right;">
              <button onclick="event.stopPropagation(); eliminarAnio(${a.id})"
                      style="background:#fee2e2;color:#dc2626;border:none;padding:4px 10px;
                             border-radius:6px;cursor:pointer;font-size:.78rem;font-weight:600;">
                🗑 Eliminar
              </button>
            </td>
          </tr>`).join('')}
      </tbody>
    </table>`;
  } catch {
    el.innerHTML = '<div style="color:#dc2626;font-size:.85rem;">Error al cargar los años</div>';
  }
}

async function crearAnio() {
  const nombre   = document.getElementById('anioNombre')?.value;
  const division = document.getElementById('anioDivision')?.value;
  const turno    = document.getElementById('anioTurno')?.value;

  try {
    const r = await apiFetch('/api/anios', {
      method: 'POST',
      body: JSON.stringify({ nombre, division, turno })
    });
    if (r.error) { alert(r.error); return; }
    await cargarAnios();
  } catch {
    alert('Error al crear el año');
  }
}

async function eliminarAnio(id) {
  if (!confirm('¿Eliminar este año y todas sus materias?')) return;
  try {
    await apiFetch(`/api/anios/${id}`, { method: 'DELETE' });
    if (anioSeleccionadoId === id) {
      anioSeleccionadoId = null;
      const pm = document.getElementById('panelMaterias');
      if (pm) pm.style.display = 'none';
    }
    await cargarAnios();
  } catch {
    alert('Error al eliminar el año');
  }
}

async function seleccionarAnio(id, nombre) {
  anioSeleccionadoId = id;

  const pm = document.getElementById('panelMaterias');
  const titulo = document.getElementById('tituloMaterias');
  if (pm) pm.style.display = 'block';
  if (titulo) titulo.textContent = `Materias — ${nombre}`;

  // Cargar profesores en el select
  await _cargarProfesoresSelect();
  await cargarMaterias(id);
}

async function _cargarProfesoresSelect() {
  const sel = document.getElementById('materiaProfesor');
  if (!sel) return;

  try {
    const users = await apiFetch('/api/users?rol=profesor');
    const profesores = (users || []).filter(u => u.rol === 'profesor');
    sel.innerHTML = '<option value="">— Sin asignar —</option>' +
      profesores.map(p => `<option value="${p.id}">${p.nombre}</option>`).join('');
  } catch {
    sel.innerHTML = '<option value="">— Sin asignar —</option>';
  }
}

async function cargarMaterias(anioId) {
  const el = document.getElementById('listaMaterias');
  if (!el) return;

  try {
    const materias = await apiFetch(`/api/anios/${anioId}/materias`);
    if (!materias || !materias.length) {
      el.innerHTML = '<div class="empty" style="padding:16px;"><div class="empty-icon">📚</div>Sin materias aún</div>';
      return;
    }

    el.innerHTML = materias.map(m => `
      <div style="display:flex; align-items:center; justify-content:space-between;
                  padding:10px 0; border-bottom:1px solid #f7f7f7;">
        <div>
          <div style="font-weight:600; font-size:.88rem;">${_esc(m.nombre)}</div>
          <div style="font-size:.75rem; color:#9ca3af;">
            Profesor: ${m.profesor || '— Sin asignar'}
          </div>
        </div>
        <button onclick="eliminarMateria(${m.id})"
                style="background:#fee2e2;color:#dc2626;border:none;padding:4px 10px;
                       border-radius:6px;cursor:pointer;font-size:.78rem;font-weight:600;">
          🗑
        </button>
      </div>`).join('');
  } catch {
    el.innerHTML = '<div style="color:#dc2626;font-size:.85rem;">Error al cargar materias</div>';
  }
}

async function crearMateria() {
  if (!anioSeleccionadoId) { alert('Seleccioná un año primero'); return; }

  const nombre      = document.getElementById('materiaNombre')?.value.trim();
  const profesor_id = document.getElementById('materiaProfesor')?.value || null;

  if (!nombre) { alert('Ingresá el nombre de la materia'); return; }

  try {
    const r = await apiFetch('/api/anios/materias', {
      method: 'POST',
      body: JSON.stringify({ nombre, anio_id: anioSeleccionadoId, profesor_id })
    });
    if (r.error) { alert(r.error); return; }
    document.getElementById('materiaNombre').value = '';
    await cargarMaterias(anioSeleccionadoId);
  } catch {
    alert('Error al crear la materia');
  }
}

async function eliminarMateria(id) {
  if (!confirm('¿Eliminar esta materia?')) return;
  try {
    await apiFetch(`/api/anios/materias/${id}`, { method: 'DELETE' });
    if (anioSeleccionadoId) await cargarMaterias(anioSeleccionadoId);
  } catch {
    alert('Error al eliminar');
  }
}

/* ═══════════════════════════════════════════════════════════════
   UTILIDADES
═══════════════════════════════════════════════════════════════ */
function _scrollToBottom() {
  const el = document.getElementById('chatMensajes');
  if (el) el.scrollTop = el.scrollHeight;
}

function actualizarBadgeContacto(remitenteId) {
  const badge = document.getElementById(`badge_${remitenteId}`);
  if (!badge) return;
  const actual = parseInt(badge.textContent || '0');
  badge.textContent = actual + 1;
  badge.style.display = 'inline';
}

function _esc(str) {
  return String(str || '')
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function _formatBytes(bytes) {
  if (!bytes) return '';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

function _iconoMime(mime) {
  if (!mime) return '📎';
  if (mime.startsWith('image/'))        return '🖼';
  if (mime === 'application/pdf')       return '📄';
  if (mime.includes('word'))            return '📝';
  if (mime.includes('excel') || mime.includes('spreadsheet')) return '📊';
  if (mime.includes('presentation') || mime.includes('powerpoint')) return '📑';
  if (mime.startsWith('video/'))        return '🎬';
  if (mime.startsWith('audio/'))        return '🎵';
  if (mime.includes('zip') || mime.includes('rar')) return '🗜';
  return '📎';
}

// ── Conectar apiFetch con el token del usuario ────────────────────────────────
// apiFetch ya existe en base.js — solo nos aseguramos de que esté disponible
async function apiFetch(url, options = {}) {
  const user = getUser();
  const headers = { 'Content-Type': 'application/json' };
  if (user?.token) headers['Authorization'] = `Bearer ${user.token}`;

  const BACKEND = window.BACKEND_URL || 'http://localhost:5000';
  const resp = await fetch(BACKEND + url, { ...options, headers: { ...headers, ...(options.headers || {}) } });
  return resp.json();
}
