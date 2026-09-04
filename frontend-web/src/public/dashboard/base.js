
Copiar

// ═══════════════════════════════════════════════════
// base.js — Utilidades compartidas del Campus Virtual
// ═══════════════════════════════════════════════════
 
// ── Obtener usuario y token ──
function getUser() {
  const u = localStorage.getItem('campus_user');
  if (!u) { window.location.href = '../login.html'; return null; }
  return JSON.parse(u);
}
 
function getToken() { return localStorage.getItem('campus_token'); }
 
// ── Cerrar sesión ──
function logout() {
  localStorage.removeItem('campus_token');
  localStorage.removeItem('campus_user');
  window.location.href = '../login.html';
}
 
// ── Fetch con token (para cuando haya backend) ──
async function apiFetch(url, opts = {}) {
  try {
    const res = await fetch(url, {
      ...opts,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + getToken(),
        ...(opts.headers || {})
      }
    });
    if (res.status === 403) { logout(); return null; }
    return res.json();
  } catch {
    return null;
  }
}
 
// ── Formatear fecha ──
function formatFecha(f) {
  return new Date(f).toLocaleDateString('es-AR', {
    day: '2-digit', month: 'long', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });
}
 
// ── Obtener todos los usuarios del localStorage ──
function getUsuarios() {
  const data = localStorage.getItem('campus_usuarios');
  const usuarios = data ? JSON.parse(data) : [];
  const defaults = [
    { nombre:'Director',   email:'lenunez@escuelasproa.edu.ar',  password:'Admin1',   rol:'director',   estado:'activo', telegram_validado: false },
    { nombre:'Secretaria', email:'stmachado@escuelasproa.edu.ar', password:'Admin1',   rol:'secretaria', estado:'activo', telegram_validado: false },
  ];
  defaults.forEach((d, i) => {
    if (!usuarios.find(u => u.email === d.email)) usuarios.splice(i, 0, d);
  });
  return usuarios;
}
 
function guardarUsuarios(u) {
  localStorage.setItem('campus_usuarios', JSON.stringify(u));
}
 
// ── Actualizar campo de usuario en localStorage ──
function actualizarUsuario(email, campos) {
  const usuarios = getUsuarios();
  const idx = usuarios.findIndex(u => u.email === email);
  if (idx !== -1) {
    usuarios[idx] = { ...usuarios[idx], ...campos };
    guardarUsuarios(usuarios);
    // Actualizar sesión activa si es el mismo usuario
    const userActual = JSON.parse(localStorage.getItem('campus_user') || '{}');
    if (userActual.email === email) {
      localStorage.setItem('campus_user', JSON.stringify({ ...userActual, ...campos }));
    }
  }
}
 
// ═══════════════════════════════════════════════════
// 🔔 MODAL VALIDACIÓN TELEGRAM (director y secretaria)
// ═══════════════════════════════════════════════════
function mostrarModalTelegram(user) {
  if (!['director','secretaria'].includes(user.rol)) return;
  if (user.telegram_validado) return;
 
  // Crear modal
  const overlay = document.createElement('div');
  overlay.id = 'telegramModal';
  overlay.style.cssText = `
    position:fixed; inset:0; background:rgba(0,0,0,.6);
    display:flex; align-items:center; justify-content:center;
    z-index:9999; font-family:'DM Sans',sans-serif;
  `;
 
  overlay.innerHTML = `
    <div style="background:#fff; border-radius:16px; padding:36px; max-width:420px; width:90%; box-shadow:0 20px 60px rgba(0,0,0,.2);">
      <div style="text-align:center; margin-bottom:24px;">
        <div style="font-size:3rem; margin-bottom:12px;">📱</div>
        <h2 style="font-family:'Playfair Display',serif; color:#1a3a6b; font-size:1.5rem; margin-bottom:8px;">Validación de Telegram</h2>
        <p style="color:#6b7280; font-size:.9rem; line-height:1.6;">
          Para completar la configuración de tu cuenta de administrador,
          necesitamos validar tu ID de Telegram.
        </p>
      </div>
 
      <div style="background:#f5f7fa; border-radius:10px; padding:16px; margin-bottom:20px; font-size:.85rem; color:#374151; line-height:1.7;">
        <strong>¿Cómo obtener tu ID?</strong><br>
        1. Abrí Telegram<br>
        2. Buscá <strong>@userinfobot</strong><br>
        3. Escribile cualquier cosa<br>
        4. Copiá el número que dice <strong>Id:</strong>
      </div>
 
      <div style="display:flex; flex-direction:column; gap:12px;">
        <input
          id="telegramIdInput"
          type="text"
          placeholder="Ej: 123456789"
          style="padding:13px 16px; border:1.5px solid #e5e7eb; border-radius:8px; font-size:.95rem; outline:none; font-family:'DM Sans',sans-serif;"
        />
        <div id="telegramError" style="color:#dc2626; font-size:.82rem; display:none;"></div>
        <button onclick="validarTelegram('${user.email}')" style="background:#1a3a6b; color:#fff; padding:14px; border:none; border-radius:8px; font-family:'DM Sans',sans-serif; font-size:.95rem; font-weight:600; cursor:pointer;">
          ✅ Validar y continuar
        </button>
        <button onclick="saltarTelegram()" style="background:none; border:none; color:#9ca3af; font-size:.82rem; cursor:pointer; padding:4px;">
          Omitir por ahora (se pedirá en el próximo ingreso)
        </button>
      </div>
    </div>
  `;
 
  document.body.appendChild(overlay);
}
 
function validarTelegram(email) {
  const id = document.getElementById('telegramIdInput').value.trim();
  const errEl = document.getElementById('telegramError');
 
  if (!id || !/^\d+$/.test(id)) {
    errEl.textContent = 'Ingresá un ID válido (solo números).';
    errEl.style.display = 'block';
    return;
  }
 
  actualizarUsuario(email, { telegram_validado: true, telegram_id: id });
 
  // Cerrar modal con animación
  const modal = document.getElementById('telegramModal');
  modal.style.opacity = '0';
  modal.style.transition = 'opacity .3s';
  setTimeout(() => {
    modal.remove();
    mostrarVerificado();
  }, 300);
}
 
function saltarTelegram() {
  document.getElementById('telegramModal').remove();
}
 
// ── Badge verificado en el header ──
function mostrarVerificado() {
  const badge = document.getElementById('verificadoBadge');
  if (badge) {
    badge.style.display = 'flex';
    badge.innerHTML = '✅ Verificado';
  }
}
 
// ── Inicializar validación al cargar el dashboard ──
function initValidacionTelegram() {
  const user = getUser();
  if (!user) return;
  if (['director','secretaria'].includes(user.rol) && !user.telegram_validado) {
    setTimeout(() => mostrarModalTelegram(user), 800);
  }
  if (user.telegram_validado) {
    setTimeout(() => mostrarVerificado(), 200);
  }
} 
// ═══════════════════════════════════════════════════
// 📸 FOTO DE PERFIL
// ═══════════════════════════════════════════════════

// ── Renderizar avatar en el topbar ──
function renderAvatar(user) {
  const avatarEl = document.getElementById('avatarInitial');
  if (!avatarEl) return;

  if (user.foto) {
    avatarEl.style.cssText += `
      background-image: url('${user.foto}');
      background-size: cover;
      background-position: center;
      font-size: 0;
    `;
  } else {
    avatarEl.textContent = user.nombre ? user.nombre[0].toUpperCase() : '?';
  }

  // Hacer clickeable para abrir el modal de perfil
  avatarEl.style.cursor = 'pointer';
  avatarEl.title = 'Ver perfil';
  avatarEl.onclick = () => abrirModalPerfil();
}

// ── Abrir modal de perfil ──
function abrirModalPerfil() {
  const user = getUser();
  if (!user) return;

  // Evitar duplicados
  if (document.getElementById('perfilModal')) return;

  const fotoActual = user.foto
    ? `<img src="${user.foto}" style="width:90px;height:90px;border-radius:50%;object-fit:cover;border:3px solid #1a3a6b;" />`
    : `<div style="width:90px;height:90px;border-radius:50%;background:#1a3a6b;color:#fff;display:flex;align-items:center;justify-content:center;font-size:2.5rem;font-weight:700;border:3px solid #1a3a6b;">${user.nombre[0].toUpperCase()}</div>`;

  const overlay = document.createElement('div');
  overlay.id = 'perfilModal';
  overlay.style.cssText = `
    position:fixed; inset:0; background:rgba(0,0,0,.55);
    display:flex; align-items:center; justify-content:center;
    z-index:9999; font-family:'DM Sans',sans-serif;
  `;

  overlay.innerHTML = `
    <div style="background:#fff; border-radius:18px; padding:36px 32px; max-width:400px; width:92%; box-shadow:0 20px 60px rgba(0,0,0,.25); position:relative;">
      <button onclick="cerrarModalPerfil()" style="position:absolute;top:14px;right:16px;background:none;border:none;font-size:1.3rem;cursor:pointer;color:#9ca3af;">✕</button>

      <div style="text-align:center; margin-bottom:24px;">
        <div id="previewFotoWrap" style="display:inline-block; margin-bottom:12px;">
          ${fotoActual}
        </div>
        <div style="font-family:'Playfair Display',serif; font-size:1.2rem; color:#1c1c2e; font-weight:700;">${user.nombre}</div>
        <div style="font-size:.82rem; color:#6b7280; margin-top:2px; text-transform:uppercase; letter-spacing:1px;">${user.rol}</div>
        <div style="font-size:.82rem; color:#9ca3af; margin-top:2px;">${user.email || ''}</div>
      </div>

      <div style="border-top:1px solid #f3f4f6; padding-top:20px;">
        <p style="font-size:.83rem; color:#6b7280; margin-bottom:12px; font-weight:600; text-transform:uppercase; letter-spacing:.5px;">Cambiar foto de perfil</p>

        <label for="fotoInput" style="
          display:block; border:2px dashed #d1d5db; border-radius:10px;
          padding:18px; text-align:center; cursor:pointer; color:#6b7280;
          font-size:.88rem; transition:border .2s; margin-bottom:12px;
        " id="fotoLabel">
          📷 Seleccioná una imagen<br>
          <span style="font-size:.75rem; color:#9ca3af;">JPG, PNG — máx. 2MB</span>
        </label>
        <input type="file" id="fotoInput" accept="image/jpeg,image/png,image/webp" style="display:none;" onchange="previsualizarFoto(event)" />

        <div id="fotoError" style="color:#dc2626;font-size:.82rem;display:none;margin-bottom:8px;"></div>

        <button id="btnGuardarFoto" onclick="guardarFoto()" style="
          width:100%; background:#1a3a6b; color:#fff; border:none;
          padding:13px; border-radius:9px; font-family:'DM Sans',sans-serif;
          font-size:.93rem; font-weight:600; cursor:pointer; display:none;
          transition:background .2s;
        ">💾 Guardar foto</button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  // Cerrar al hacer click fuera
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) cerrarModalPerfil();
  });
}

function cerrarModalPerfil() {
  const modal = document.getElementById('perfilModal');
  if (modal) {
    modal.style.opacity = '0';
    modal.style.transition = 'opacity .25s';
    setTimeout(() => modal.remove(), 250);
  }
}

// ── Previsualizar antes de guardar ──
function previsualizarFoto(event) {
  const file = event.target.files[0];
  const errEl = document.getElementById('fotoError');
  errEl.style.display = 'none';

  if (!file) return;

  if (file.size > 2 * 1024 * 1024) {
    errEl.textContent = 'La imagen supera los 2MB. Elegí una más pequeña.';
    errEl.style.display = 'block';
    return;
  }

  const reader = new FileReader();
  reader.onload = (e) => {
    const base64 = e.target.result;
    document.getElementById('previewFotoWrap').innerHTML =
      `<img src="${base64}" style="width:90px;height:90px;border-radius:50%;object-fit:cover;border:3px solid #1a3a6b;" />`;
    document.getElementById('btnGuardarFoto').style.display = 'block';
    document.getElementById('fotoLabel').style.borderColor = '#1a3a6b';
    document.getElementById('fotoLabel').innerHTML = `✅ ${file.name}<br><span style="font-size:.75rem;color:#9ca3af;">Listo para guardar</span>`;

    // Guardar temporalmente para usarla en guardarFoto()
    window._fotoBase64Pendiente = base64;
  };
  reader.readAsDataURL(file);
}

// ── Guardar foto ──
async function guardarFoto() {
  const errEl = document.getElementById('fotoError');
  const base64 = window._fotoBase64Pendiente;

  if (!base64) return;

  const btn = document.getElementById('btnGuardarFoto');
  btn.disabled = true;
  btn.textContent = 'Guardando...';

  try {
    // Intentar guardar en backend
    const res = await apiFetch('/api/users/foto', {
      method: 'PUT',
      body: JSON.stringify({ foto: base64 })
    });

    if (res && res.foto) {
      // Éxito con backend
      _aplicarFotoLocal(base64);
      cerrarModalPerfil();
      return;
    }
  } catch (_) {
    // Si el backend no está disponible, guardar solo en localStorage
  }

  // Fallback: guardar en localStorage
  _aplicarFotoLocal(base64);
  cerrarModalPerfil();
}

function _aplicarFotoLocal(base64) {
  const user = getUser();
  if (!user) return;
  const updated = { ...user, foto: base64 };
  localStorage.setItem('campus_user', JSON.stringify(updated));
  actualizarUsuario(user.email, { foto: base64 });
  renderAvatar(updated);
  window._fotoBase64Pendiente = null;
}

// ── Inicializar avatar al cargar la página ──
function initAvatar() {
  const user = getUser();
  if (user) renderAvatar(user);
}
