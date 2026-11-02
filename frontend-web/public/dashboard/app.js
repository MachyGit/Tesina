// © 2026 Pito, Santiago Vigna y Santiago Machado — Campus Virtual PROA. Todos los derechos reservados (ver LICENSE).
// ═══════════════════════════════════════════════════════════════════════════
// app.js — Panel del Campus Virtual PROA (los 5 roles comparten este archivo)
// Cada dashboard (director.html, alumno.html, …) solo declara <body data-rol="…">.
// Todo lo que se muestra viene del backend (nada de datos falsos en localStorage).
// ═══════════════════════════════════════════════════════════════════════════
(function () {
  'use strict';

  // ── Backend: si la página viene del servidor de desarrollo (puerto 3000) va al puerto 5000 del mismo host;
  //    si la sirve el propio backend (modo túnel/hosting) usa el mismo origen ──
  if (!window.BACKEND_URL) window.BACKEND_URL = (location.port === '3000' ? `${location.protocol}//${location.hostname}:5000` : location.origin);
  const BACK = window.BACKEND_URL;

  // ── Un alumno que abre el QR sin sesión: se guarda el código y se retoma tras el login ──
  const qs = new URLSearchParams(location.search);
  if (qs.get('asistencia')) {
    try { localStorage.setItem('campus_qr_pendiente', qs.get('asistencia')); } catch {}
  }

  // ── Helpers ───────────────────────────────────────────────────────────────
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const token = () => localStorage.getItem('campus_token');
  const leerUser = () => { try { return JSON.parse(localStorage.getItem('campus_user') || 'null'); } catch { return null; } };
  const guardarUser = (u) => localStorage.setItem('campus_user', JSON.stringify(u));

  function logout() {
    localStorage.removeItem('campus_token');
    localStorage.removeItem('campus_user');
    location.href = '../login.html';
  }

  // Fetch con el JWT real. Devuelve { ok, status, data, error }.
  async function api(path, { method = 'GET', body, raw = false } = {}) {
    const headers = { Authorization: 'Bearer ' + token() };
    let cuerpo;
    if (body instanceof FormData) cuerpo = body;
    else if (body !== undefined) { headers['Content-Type'] = 'application/json'; cuerpo = JSON.stringify(body); }
    let r;
    // Si el wifi anda pero no hay internet, el pedido puede quedar colgado: se corta y se toma como "sin conexión".
    const ctl = new AbortController();
    const corte = setTimeout(() => ctl.abort(), cuerpo instanceof FormData ? 120000 : 20000);
    try { r = await fetch(BACK + path, { method, headers, body: cuerpo, signal: ctl.signal }); }
    catch { clearTimeout(corte); marcarRed(false); return { ok: false, status: 0, data: null, error: 'Sin conexión con el servidor. Revisá tu internet.' }; }
    clearTimeout(corte); marcarRed(true);
    if (raw) return r;
    let data = null;
    try { data = await r.json(); } catch {}
    if (r.status === 401 || (r.status === 403 && data && data.error === 'Token inválido')) {
      logout();
      return { ok: false, status: r.status, data, error: 'Tu sesión venció. Ingresá de nuevo.' };
    }
    return { ok: r.ok, status: r.status, data, error: r.ok ? null : ((data && data.error) || `Error ${r.status}`) };
  }

  // Descarga un archivo protegido (hace falta el token, por eso no sirve un <a href> común)
  async function descargar(path, nombre) {
    const r = await api(path, { raw: true });
    if (!r.ok) {
      let msg = `No se pudo descargar (error ${r.status})`;
      try { msg = (await r.json()).error || msg; } catch {}
      return toast(msg, 'error');
    }
    const url = URL.createObjectURL(await r.blob());
    const a = document.createElement('a');
    a.href = url; a.download = nombre || 'archivo';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }

  function toast(msg, tipo = 'info') {
    let c = $('#toasts');
    if (!c) { c = document.createElement('div'); c.id = 'toasts'; document.body.appendChild(c); }
    const t = document.createElement('div');
    t.className = 'toast ' + tipo; t.textContent = msg;
    c.appendChild(t);
    setTimeout(() => t.remove(), tipo === 'error' ? 6000 : 3500);
  }

  function confirmar(msg, okTxt = 'Confirmar') {
    return new Promise((res) => {
      const m = modal(`<h3>Confirmar</h3><p class="muted" style="margin:10px 0 18px;font-size:.9rem;color:var(--texto)">${esc(msg)}</p>
        <div class="row"><button class="btn btn-ghost spacer" data-m="no">Cancelar</button><button class="btn btn-primary spacer" data-m="si">${esc(okTxt)}</button></div>`);
      m.el.addEventListener('click', (e) => {
        const b = e.target.closest('[data-m]'); if (!b) return;
        m.close(); res(b.dataset.m === 'si');
      });
    });
  }

  function modal(html) {
    const bg = document.createElement('div');
    bg.className = 'modal-bg';
    bg.innerHTML = `<div class="modal"><button class="modal-x" data-x title="Cerrar">✕</button>${html}</div>`;
    const close = () => bg.remove();
    bg.addEventListener('click', (e) => { if (e.target === bg || e.target.closest('[data-x]')) close(); });
    document.body.appendChild(bg);
    return { el: bg.firstChild, close };
  }

  const fechaCorta = (f) => f ? new Date(f).toLocaleDateString('es-AR', { day: '2-digit', month: 'short', year: 'numeric' }) : '';
  const fechaHora = (f) => f ? new Date(f).toLocaleString('es-AR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';
  const fechaEvento = (f, todoDia) => {
    if (!f) return '';
    const d = new Date(f);
    const dia = d.toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' });
    return todoDia ? dia : `${dia}, ${d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })} hs`;
  };
  const hoyISO = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  const bytes = (n) => n < 1024 ? n + ' B' : n < 1048576 ? (n / 1024).toFixed(0) + ' KB' : (n / 1048576).toFixed(1) + ' MB';
  const icono = (nombre = '') => {
    const e = nombre.split('.').pop().toLowerCase();
    if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(e)) return '🖼️';
    if (e === 'pdf') return '📕';
    if (['doc', 'docx', 'odt', 'txt'].includes(e)) return '📄';
    if (['xls', 'xlsx', 'csv', 'ods'].includes(e)) return '📊';
    if (['ppt', 'pptx', 'odp'].includes(e)) return '📽️';
    if (['zip', 'rar', '7z'].includes(e)) return '🗜️';
    if (['mp4'].includes(e)) return '🎬';
    if (['mp3'].includes(e)) return '🎵';
    return '📎';
  };
  const vacio = (ico, txt) => `<div class="empty"><div class="empty-icon">${ico}</div>${esc(txt)}</div>`;
  const FOTO_OK = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/]+=*$/;

  function avatar(u, extra = '') {
    const ini = esc((u.nombre || '?').trim()[0]?.toUpperCase() || '?');
    if (u.foto && FOTO_OK.test(u.foto)) return `<span class="av ${extra}" style="background-image:url('${u.foto}')"></span>`;
    return `<span class="av ${extra}">${ini}</span>`;
  }
  const botonCargando = async (btn, fn) => {
    if (!btn || btn.disabled) return;
    const txt = btn.innerHTML; btn.disabled = true;
    try { await fn(); } finally { btn.disabled = false; btn.innerHTML = txt; }
  };

  // ── Configuración por rol ─────────────────────────────────────────────────
  const T = {
    inicio: ['🏠', 'Inicio'], avisos: ['📢', 'Avisos'], archivos: ['📁', 'Archivos'],
    usuarios: ['👥', 'Usuarios'], pendientes: ['⏳', 'Pendientes'], asistencia: ['✅', 'Asistencia'],
    anios: ['🏫', 'Años y materias'], materias: ['📚', 'Materias'], calendario: ['📅', 'Calendario'], horarios: ['🕐', 'Horarios'], egresados: ['🎓', 'Egresados'], logs: ['📋', 'Actividad'], chat: ['💬', 'Mensajes'],
  };
  const ADMIN_TABS = ['inicio', 'materias', 'calendario', 'horarios', 'avisos', 'archivos', 'usuarios', 'pendientes', 'asistencia', 'anios', 'egresados', 'logs', 'chat'];
  const ROLES = {
    director:   { titulo: 'Panel Director',   marca: '🟣 Director',   tabs: ADMIN_TABS },
    secretaria: { titulo: 'Panel Secretaría', marca: '🔵 Secretaría', tabs: ADMIN_TABS },
    preceptor:  { titulo: 'Panel Preceptor',  marca: '🔵 Preceptor',  tabs: ['inicio', 'materias', 'calendario', 'horarios', 'avisos', 'archivos', 'asistencia', 'chat'] },
    profesor:   { titulo: 'Panel Profesor',   marca: '🟢 Profesor',   tabs: ['inicio', 'materias', 'calendario', 'horarios', 'avisos', 'archivos', 'chat'] },
    alumno:     { titulo: 'Mi Campus',        marca: '🟡 Alumno',     tabs: ['inicio', 'materias', 'calendario', 'horarios', 'avisos', 'archivos', 'asistencia'] },
  };

  let U = leerUser();
  let CFG, TABS;
  const cargados = {};
  let anioCache = null; // años donde esta persona puede publicar

  // ── Arranque ──────────────────────────────────────────────────────────────
  document.addEventListener('DOMContentLoaded', async () => {
    if (!U || !token()) return logout();
    const rolPagina = document.body.dataset.rol;
    if (U.rol !== rolPagina) { location.replace(`${U.rol}.html`); return; }
    CFG = { ...ROLES[U.rol] };
    if (U.rol === 'alumno' && U.situacion && U.situacion !== 'regular') CFG.tabs = ['inicio', 'avisos', 'archivos'];
    TABS = CFG.tabs;
    construir();
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
    window.addEventListener('online', () => { marcarRed(true); procesarCola(); });
    window.addEventListener('offline', () => marcarRed(false));
    setInterval(() => { if (getCola().some((i) => !i.error)) procesarCola(); }, 20000);
    if (!navigator.onLine) marcarRed(false);
    pintarBanner(); procesarCola();
    // Datos frescos del perfil (foto, año, telegram). Si falla la red, se sigue con lo guardado.
    const p = await api('/api/users/perfil');
    if (p.ok) {
      const antes = U.situacion || 'regular';
      U = { ...U, ...p.data }; guardarUser(U); pintarUsuario();
      if (U.rol === 'alumno' && (U.situacion || 'regular') !== antes) return location.reload();
    }
    if (U.rol === 'alumno') procesarQRPendiente();
    else { try { localStorage.removeItem('campus_qr_pendiente'); } catch {} }
    const inicial = (location.hash || '').slice(1);
    mostrar(TABS.includes(inicial) ? inicial : 'inicio');
    if (U.rol !== 'alumno') { precargarChat(); }
    if (['director', 'secretaria'].includes(U.rol)) actualizarPendientes();
  });

  function construir() {
    document.title = `${CFG.titulo} — Campus Virtual`;
    const nav = TABS.map((t) => `<div class="nav-item" data-tab="${t}"><span class="icon">${T[t][0]}</span> ${T[t][1]}
        ${t === 'pendientes' ? '<span class="nav-badge" id="badgePend" style="display:none">0</span>' : ''}
        ${t === 'chat' ? '<span class="chat-tab-dot"></span>' : ''}</div>`).join('');
    const paneles = TABS.map((t) => `<div class="panel" id="panel-${t}"></div>`).join('');
    document.body.innerHTML = `
      <aside class="sidebar">
        <div class="sidebar-logo">Campus <span>Virtual</span></div>
        <div class="sidebar-rol">${CFG.marca}</div>
        <nav class="sidebar-nav">${nav}</nav>
        <div class="sidebar-footer"><button class="btn-logout" data-act="logout">🚪 Cerrar sesión</button></div>
      </aside>
      <div class="main">
        <div class="topbar">
          <div class="row" style="flex-wrap:nowrap"><button class="menu-btn" data-act="menu" aria-label="Menú">☰</button><div class="topbar-title" id="pageTitle">${CFG.titulo}</div></div>
          <div class="topbar-right">
            <div class="verificado-badge" id="tgBadge">✅ Telegram vinculado</div>
            <div class="theme-toggle">
              <button data-theme-btn="light" title="Modo claro">☀️</button>
              <button data-theme-btn="dark" title="Modo oscuro">🌙</button>
              <button data-theme-btn="system" title="Igual que el sistema">🖥️</button>
            </div>
            <div class="topbar-user" data-act="perfil" title="Mi perfil"><span id="topAvatar"></span><span id="userName"></span></div>
          </div>
        </div>
        <div id="colaBanner" class="cola-banner" style="display:none"></div>
        <div class="content">${paneles}</div>
      </div>`;
    // el toggle de tema se conecta en DOMContentLoaded de theme.js; como armamos el DOM después, lo reconectamos
    $$('.theme-toggle [data-theme-btn]').forEach((b) => b.addEventListener('click', () => window.CampusTheme?.set(b.dataset.themeBtn)));
    $$('.theme-toggle [data-theme-btn]').forEach((b) => b.classList.toggle('active', b.dataset.themeBtn === window.CampusTheme?.get()));
    document.addEventListener('campusTemaCambiado', () => $$('.theme-toggle [data-theme-btn]').forEach((b) => b.classList.toggle('active', b.dataset.themeBtn === window.CampusTheme?.get())));
    pintarUsuario();
  }

  function pintarUsuario() {
    $('#topAvatar').innerHTML = avatar(U);
    $('#userName').textContent = U.nombre || '';
    const tg = $('#tgBadge'); if (tg) tg.style.display = U.telegram_id ? 'inline-flex' : 'none';
  }

  async function mostrar(tab) {
    if (!TABS.includes(tab)) tab = 'inicio';
    $$('.panel').forEach((p) => p.classList.toggle('active', p.id === 'panel-' + tab));
    $$('[data-tab]').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
    document.body.classList.remove('menu-abierto');
    $('#pageTitle').textContent = tab === 'inicio' ? CFG.titulo : T[tab][1];
    try { history.replaceState(null, '', '#' + tab); } catch {}
    const m = MODULOS[tab];
    if (m) { if (!cargados[tab] && m.init) { cargados[tab] = true; await m.init(); } cargados[tab] = true; m.load && m.load(); }
  }

  // ── Eventos (delegación: no hay onclick inline) ───────────────────────────
  document.addEventListener('click', (e) => {
    const tab = e.target.closest('[data-tab]');
    if (tab) return mostrar(tab.dataset.tab);
    const b = e.target.closest('[data-act]');
    if (b && ACC[b.dataset.act]) { e.preventDefault(); ACC[b.dataset.act](b.dataset, b); }
  });
  document.addEventListener('change', (e) => {
    const s = e.target.closest('[data-change]');
    if (s && ACC[s.dataset.change]) ACC[s.dataset.change](s.dataset, s);
  });
  document.addEventListener('input', (e) => {
    const s = e.target.closest('[data-input]');
    if (s && ACC[s.dataset.input]) ACC[s.dataset.input](s.dataset, s);
  });

  const ACC = {
    logout: () => logout(),
    menu: () => document.body.classList.toggle('menu-abierto'),
    perfil: () => abrirPerfil(),
  };

  // ═════════════════════════════════════════════════════════════════════════
  // MODO SIN CONEXIÓN: lo que se hace sin internet queda en una cola (se guarda en este
  // dispositivo) y se envía solo cuando vuelve la conexión. Hoy: mensajes de chat y asistencia.
  // ═════════════════════════════════════════════════════════════════════════
  let sinRed = false, procesando = false, cola = null, colaModal = null;
  const nuevoId = () => (window.crypto?.randomUUID ? crypto.randomUUID().replace(/-/g, '') : Date.now().toString(36) + Math.random().toString(36).slice(2, 14)).slice(0, 32);
  const colaKey = () => 'campus_cola_' + (U ? U.id : 0);
  function getCola() {
    if (cola === null) { try { cola = JSON.parse(localStorage.getItem(colaKey()) || '[]'); } catch { cola = []; } }
    return cola;
  }
  function guardarCola() { try { localStorage.setItem(colaKey(), JSON.stringify(getCola())); } catch {} pintarBanner(); }
  function encolar(tipo, datos) {
    const it = { id: nuevoId(), tipo, datos, creado: new Date().toISOString() };
    getCola().push(it); guardarCola(); return it;
  }
  function quitarDeCola(fn) { cola = getCola().filter((i) => !fn(i)); guardarCola(); }
  // Copia local de lo último que se vio (para poder ver la lista y escribir sin conexión).
  const cacheSet = (k, v) => { try { localStorage.setItem(`campus_c_${U.id}_${k}`, JSON.stringify(v)); } catch {} };
  const cacheGet = (k) => { try { return JSON.parse(localStorage.getItem(`campus_c_${U.id}_${k}`)); } catch { return null; } };

  function marcarRed(ok) {
    const antes = sinRed; sinRed = !ok;
    if (antes !== sinRed) pintarBanner();
    if (ok && antes) procesarCola();
  }
  function pintarBanner() {
    const b = $('#colaBanner'); if (!b) return;
    const c = getCola(), pend = c.filter((i) => !i.error).length, fallidos = c.length - pend;
    const partes = [];
    if (sinRed) partes.push('📴 <strong>Sin conexión.</strong> Lo que hagas se guarda en este dispositivo y se envía solo cuando vuelva internet.');
    if (pend) partes.push(`${procesando ? '🔄 Enviando' : '🕐 Pendientes de enviar:'} <strong>${pend}</strong>`);
    if (fallidos) partes.push(`⚠️ <strong>${fallidos}</strong> no se pudo enviar`);
    if (!partes.length) { b.style.display = 'none'; b.innerHTML = ''; return; }
    b.style.display = ''; b.className = 'cola-banner' + (fallidos ? ' warn' : sinRed ? ' off' : '');
    b.innerHTML = `<span>${partes.join(' · ')}</span>${c.length ? '<button class="btn btn-ghost btn-sm" data-act="cola-ver">Ver pendientes</button>' : ''}`;
  }
  async function enviarItem(it) {
    let r;
    if (it.tipo === 'chat') r = await api(`/api/chat/mensaje/${it.datos.para}`, { method: 'POST', body: { contenido: it.datos.texto, client_id: it.id } });
    else if (it.tipo === 'chatg') r = await api(`/api/chat/grupos/${it.datos.grupo}/mensaje`, { method: 'POST', body: { contenido: it.datos.texto, client_id: it.id } });
    else r = await api('/api/asistencia', { method: 'POST', body: [{ alumno_id: it.datos.alumno_id, estado: it.datos.estado, fecha: it.datos.fecha, hora: it.datos.hora }] });
    if (r.ok) return { res: 'ok', data: r.data };
    if (r.status === 0 || r.status >= 500) return { res: 'red' };
    return { res: 'error', msg: r.error };
  }
  async function procesarCola() {
    if (procesando || !getCola().some((i) => !i.error)) return;
    procesando = true; pintarBanner();
    let huboAsistencia = false;
    try {
      for (const it of [...getCola()]) {
        if (it.error) continue;
        const o = await enviarItem(it);
        if (o.res === 'red') break;
        if (o.res === 'ok') {
          quitarDeCola((x) => x.id === it.id);
          if (it.tipo === 'chat' || it.tipo === 'chatg') {
            const n = $(`[data-mid="p_${it.id}"]`);
            if (n) n.outerHTML = msgHTML({ id: o.data.id, remitente_id: U.id, grupo_id: it.tipo === 'chatg' ? it.datos.grupo : undefined, contenido: it.datos.texto, enviado_en: new Date().toISOString(), archivos: [] });
          } else huboAsistencia = true;
        } else {
          it.error = o.msg || 'Error'; guardarCola();
          if (it.tipo === 'chat' || it.tipo === 'chatg') { const n = $(`[data-mid="p_${it.id}"]`); if (n) n.outerHTML = msgPendienteHTML(it); }
        }
      }
    } finally { procesando = false; guardarCola(); }
    if (huboAsistencia) {
      toast('Asistencia sincronizada ✔', 'ok');
      if ($('#panel-asistencia')?.classList.contains('active') && $('#asAnio')?.value) ACC['as-cargar']();
    }
  }
  const nombreContacto = (id) => (contactos.find((c) => c.id === id) || (cacheGet('contactos') || []).find((c) => c.id === id) || {}).nombre || 'contacto';
  const nombreGrupo = (id) => (grupos.find((g) => g.id === id) || (cacheGet('grupos') || []).find((g) => g.id === id) || {}).nombre || 'grupo';
  const itemColaTxt = (it) => it.tipo === 'chatg'
    ? `💬 Mensaje al grupo <strong>${esc(nombreGrupo(it.datos.grupo))}</strong>: “${esc(it.datos.texto.length > 80 ? it.datos.texto.slice(0, 80) + '…' : it.datos.texto)}”`
    : it.tipo === 'chat'
    ? `💬 Mensaje a <strong>${esc(nombreContacto(it.datos.para))}</strong>: “${esc(it.datos.texto.length > 80 ? it.datos.texto.slice(0, 80) + '…' : it.datos.texto)}”`
    : `✅ <strong>${esc(it.datos.nombre || 'Alumno')}</strong> · ${esc(it.datos.fecha.split('-').reverse().join('/'))} → ${esc(it.datos.estado)}`;
  function abrirCola() {
    colaModal?.close();
    const c = getCola();
    colaModal = modal(`<h3>Pendientes de enviar</h3>
      <div style="margin:10px 0 14px">${c.length ? c.map((it) => `<div class="cola-item"><span>${it.error ? '⚠️' : '🕐'}</span>
        <div class="spacer">${itemColaTxt(it)}${it.error ? `<div class="muted" style="color:var(--rojo)">${esc(it.error)}</div>` : ''}</div>
        <button class="btn btn-danger btn-sm" data-act="cola-quitar" data-id="${it.id}" title="Quitar (no se envía)">🗑</button></div>`).join('') : '<p class="muted">No hay nada pendiente.</p>'}</div>
      ${c.length ? '<button class="btn btn-primary" data-act="cola-reintentar">🔄 Reintentar ahora</button>' : ''}`);
  }
  ACC['cola-ver'] = () => abrirCola();
  ACC['cola-reintentar'] = () => { getCola().forEach((i) => delete i.error); guardarCola(); colaModal?.close(); procesarCola(); };
  ACC['cola-quitar'] = (d) => {
    const it = getCola().find((i) => i.id === d.id);
    quitarDeCola((i) => i.id === d.id);
    $(`[data-mid="p_${d.id}"]`)?.remove();
    if (it && it.tipo === 'asistencia' && $('#panel-asistencia')?.classList.contains('active') && $('#asAnio')?.value) ACC['as-cargar']();
    if (colaModal && document.body.contains(colaModal.el)) abrirCola();
  };

  // ═════════════════════════════════════════════════════════════════════════
  // INICIO
  // ═════════════════════════════════════════════════════════════════════════
  const esAdmin = () => ['director', 'secretaria'].includes(U.rol);
  const puedePublicar = () => U.rol !== 'alumno';

  const inicio = {
    async load() {
      const p = $('#panel-inicio');
      if (U.rol === 'alumno') return inicioAlumno(p);
      p.innerHTML = `<div class="stats-grid" id="stats"></div>
        <div class="card"><div class="card-header"><div class="card-title">📢 Últimos avisos</div></div><div id="inicioAvisos"></div></div>`;
      const [av, us] = await Promise.all([
        api('/api/avisos?limit=5'),
        ['director', 'secretaria', 'preceptor', 'profesor'].includes(U.rol) ? api('/api/users') : Promise.resolve({ ok: false }),
      ]);
      const lista = av.ok ? av.data : [];
      const stats = [];
      if (us.ok) {
        const u = us.data;
        stats.push(['👥', u.filter((x) => x.activo).length, 'Usuarios activos']);
        stats.push(['🎓', u.filter((x) => x.rol === 'alumno' && x.activo).length, 'Alumnos']);
        if (esAdmin()) stats.push(['⏳', u.filter((x) => x.pendiente).length, 'Pendientes de aprobar']);
      }
      stats.push(['📢', lista.length >= 5 ? '5+' : lista.length, 'Avisos recientes']);
      $('#stats').innerHTML = stats.map(([i, v, l]) => `<div class="stat-card"><div class="stat-icon">${i}</div><div class="stat-val">${v}</div><div class="stat-lbl">${l}</div></div>`).join('');
      $('#inicioAvisos').innerHTML = lista.length ? lista.map(avisoHTML).join('') : vacio('📭', 'Sin avisos aún');
    },
  };

  async function inicioAlumno(p) {
    if (U.situacion && U.situacion !== 'regular') {
      const egr = U.situacion === 'egresado';
      p.innerHTML = `
        <div class="alumno-hero">${avatar(U, 'lg')}<div><h2>Hola, ${esc((U.nombre || '').split(' ')[0])} 👋</h2>
          <p>${egr ? '🎓 Egresado/a · ' + esc(U.anio || 'Promoción') : '🚪 Ex alumno/a'}</p></div></div>
        <div class="card"><p class="muted">${egr ? '¡Felicitaciones por haber terminado! Tu cuenta sigue activa: podés seguir viendo los avisos y archivos que la escuela comparta.' : 'Tu cuenta sigue activa. Podés seguir viendo los avisos y archivos que la escuela comparta.'} Ya no registrás asistencia ni cursás materias.</p></div>
        <div class="card"><div class="card-header"><div class="card-title">📢 Últimos avisos</div></div><div id="inicioAvisos"></div></div>`;
      const av = await api('/api/avisos?limit=5');
      $('#inicioAvisos').innerHTML = av.ok && av.data.length ? av.data.map(avisoHTML).join('') : vacio('📭', 'Sin avisos aún');
      return;
    }
    p.innerHTML = `
      <div class="alumno-hero">${avatar(U, 'lg')}<div><h2>Hola, ${esc((U.nombre || '').split(' ')[0])} 👋</h2>
        <p>${U.anio ? '🏫 ' + esc(U.anio) : 'Todavía no tenés un año asignado. Consultá en secretaría.'}</p></div></div>
      <div id="qrResultado"></div>
      <div class="card"><div class="card-header"><div class="card-title">📲 Registrar mi llegada</div></div>
        <p class="muted">Cuando llegues a la escuela, escaneá el <strong>código QR</strong> que muestra el preceptor con la <strong>cámara de tu celular</strong>. Se abre esta página y quedás registrado automáticamente. Si no tenías sesión iniciada, ingresá y se registra solo.</p>
        <div id="hoyEstado" style="margin-top:12px"></div></div>
      <div class="card"><div class="card-header"><div class="card-title">📢 Últimos avisos de mi año</div></div><div id="inicioAvisos"></div></div>`;
    const [av, as] = await Promise.all([api('/api/avisos?limit=5'), api(`/api/asistencia/alumno/${U.id}?desde=${hoyISO()}&hasta=${hoyISO()}`)]);
    $('#inicioAvisos').innerHTML = av.ok && av.data.length ? av.data.map(avisoHTML).join('') : vacio('📭', 'Sin avisos aún');
    const hoy = as.ok && as.data.registros[0];
    $('#hoyEstado').innerHTML = hoy
      ? `<span class="badge ${hoy.estado === 'presente' ? 'badge-ok' : hoy.estado === 'tarde' ? 'badge-tarde' : 'badge-mal'}">Hoy: ${esc(hoy.estado)}${hoy.hora ? ' · ' + esc(hoy.hora) + ' hs' : ''}</span>`
      : '<span class="badge badge-gris">Hoy: todavía sin registrar</span>';
  }

  async function procesarQRPendiente() {
    let t = null;
    try { t = localStorage.getItem('campus_qr_pendiente'); } catch {}
    if (!t) return;
    try { localStorage.removeItem('campus_qr_pendiente'); } catch {}
    history.replaceState(null, '', location.pathname + (location.hash || ''));
    const r = await api('/api/asistencia/qr', { method: 'POST', body: { token: t } });
    const caja = () => $('#qrResultado');
    const poner = () => {
      if (!caja()) return setTimeout(poner, 150);
      caja().innerHTML = `<div class="alerta ${r.ok ? 'ok' : 'mal'}">${r.ok ? '✅' : '⚠️'} ${esc(r.ok ? r.data.mensaje : r.error)}</div>`;
    };
    poner();
    if (r.ok) toast(r.data.mensaje, 'ok'); else toast(r.error, 'error');
  }

  // ═════════════════════════════════════════════════════════════════════════
  // AVISOS (con calendario de Google)
  // ═════════════════════════════════════════════════════════════════════════
  function avisoHTML(a) {
    const puedeBorrar = esAdmin() || a.autor_id === U.id;
    return `<div class="aviso-card">
      <div class="aviso-meta"><span class="badge badge-${esc(a.tipo)}">${esc(a.tipo)}</span>
        <span class="badge badge-anio">${a.anio ? esc(a.anio) : 'Todos los años'}</span>
        <span class="muted">por ${esc(a.autor)}</span><span class="aviso-fecha">${fechaCorta(a.fecha)}</span></div>
      <div class="aviso-titulo">${esc(a.titulo)}</div>
      <div class="aviso-body" style="white-space:pre-wrap">${esc(a.contenido)}</div>
      ${a.fecha_evento ? `<div class="evento">📅 <strong>${esc(fechaEvento(a.fecha_evento, a.todo_el_dia))}</strong>
        <span class="spacer"></span>
        <a href="${esc(a.gcal_url)}" target="_blank" rel="noopener">➕ Agregar a Google Calendar</a>
        <button class="link-btn" data-act="ics" data-id="${a.id}" data-name="${esc(a.titulo)}">⬇ .ics</button></div>` : ''}
      ${puedeBorrar && U.rol !== 'alumno' ? `<div class="row" style="margin-top:10px"><span class="spacer"></span><button class="btn btn-danger btn-sm" data-act="borrar-aviso" data-id="${a.id}">🗑 Eliminar</button></div>` : ''}
    </div>`;
  }

  ACC.ics = (d) => descargar(`/api/avisos/${d.id}/ics`, `${d.name || 'evento'}.ics`);
  ACC['borrar-aviso'] = async (d) => {
    if (!(await confirmar('¿Eliminar este aviso?', 'Eliminar'))) return;
    const r = await api(`/api/avisos/${d.id}`, { method: 'DELETE' });
    if (!r.ok) return toast(r.error, 'error');
    toast('Aviso eliminado', 'ok'); avisos.load(); cargados.inicio = false;
  };

  async function aniosDestino() {
    if (anioCache) return anioCache;
    const r = await api('/api/anios/destinos');
    anioCache = r.ok ? r.data : { todos: false, anios: [] };
    return anioCache;
  }
  const optsAnios = (arr, conTodos, txtTodos = 'Todos los años') =>
    (conTodos ? `<option value="">${txtTodos}</option>` : '<option value="">Elegí un año…</option>') +
    arr.map((a) => `<option value="${a.id}">${esc(a.etiqueta || a.nombre)}</option>`).join('');

  let tipoAviso = 'general';
  const avisos = {
    async init() {
      const p = $('#panel-avisos');
      let form = '';
      if (puedePublicar()) {
        const d = await aniosDestino();
        form = `<div class="card"><div class="card-header"><div class="card-title">Publicar nuevo aviso</div></div>
          <div class="form-grid">
            <div class="field"><label>Título</label><input type="text" id="avTitulo" maxlength="150" placeholder="Título del aviso"/></div>
            <div class="field"><label>Para quién</label><select id="avAnio">${optsAnios(d.anios, d.todos)}</select></div>
            <div class="field full"><label>Tipo</label><div class="tipo-row" id="avTipos">
              ${[['general', '📣 General'], ['tarea', '📚 Actividad / tarea'], ['horario', '🕐 Horario'], ['urgente', '🚨 Urgente']].map(([k, v], i) => `<span class="tipo-badge ${i ? '' : 'active'}" data-act="tipo-aviso" data-tipo="${k}">${v}</span>`).join('')}</div></div>
            <div class="field full"><label>Contenido</label><textarea id="avContenido" placeholder="Escribí el contenido…"></textarea></div>
            <div class="caja-evento">
              <label class="check full"><input type="checkbox" id="avConFecha" data-change="evento-toggle"/> 📅 Es una actividad con fecha (se puede agregar al calendario)</label>
              <div class="field" id="avFechaBox" style="display:none"><label>Fecha</label><input type="date" id="avFecha"/></div>
              <div class="field" id="avHoraBox" style="display:none"><label>Hora</label><input type="time" id="avHora" value="08:00"/></div>
              <label class="check" id="avDiaBox" style="display:none"><input type="checkbox" id="avTodoDia" data-change="evento-toggle"/> Todo el día</label>
              <label class="check full" id="avMailBox" style="display:none"><input type="checkbox" id="avMail" checked/> ✉️ Enviar invitación de calendario por mail a los alumnos (les llega con el botón “Agregar a Google Calendar”)</label>
            </div>
            <div class="field full"><button class="btn btn-primary" data-act="publicar-aviso">📤 Publicar aviso</button></div>
          </div></div>`;
      }
      p.innerHTML = form + `<div class="card"><div class="card-header"><div class="card-title">Avisos publicados</div>
        <select id="avFiltro" data-change="avisos-filtro" style="max-width:200px"><option value="">Todos los tipos</option><option value="general">General</option><option value="tarea">Actividades</option><option value="horario">Horario</option><option value="urgente">Urgente</option></select></div>
        <div id="listaAvisos"></div></div>`;
    },
    async load() {
      const t = $('#avFiltro')?.value;
      const r = await api('/api/avisos?limit=100' + (t ? '&tipo=' + t : ''));
      $('#listaAvisos').innerHTML = !r.ok ? vacio('⚠️', r.error) : r.data.length ? r.data.map(avisoHTML).join('') : vacio('📭', 'Sin avisos');
    },
  };
  ACC['avisos-filtro'] = () => avisos.load();
  ACC['tipo-aviso'] = (d, el) => { tipoAviso = d.tipo; $$('#avTipos .tipo-badge').forEach((x) => x.classList.toggle('active', x === el)); };
  ACC['evento-toggle'] = () => {
    const con = $('#avConFecha').checked, todo = $('#avTodoDia').checked;
    $('#avFechaBox').style.display = $('#avDiaBox').style.display = $('#avMailBox').style.display = con ? '' : 'none';
    $('#avHoraBox').style.display = con && !todo ? '' : 'none';
  };
  ACC['publicar-aviso'] = (d, btn) => botonCargando(btn, async () => {
    const titulo = $('#avTitulo').value.trim(), contenido = $('#avContenido').value.trim();
    if (!titulo || !contenido) return toast('Completá título y contenido', 'error');
    const anio = $('#avAnio').value;
    const dest = await aniosDestino();
    if (!dest.todos && !anio) return toast('Elegí el año al que va dirigido el aviso', 'error');
    const body = { titulo, contenido, tipo: tipoAviso, anio_id: anio || null };
    if ($('#avConFecha').checked) {
      const f = $('#avFecha').value;
      if (!f) return toast('Elegí la fecha de la actividad', 'error');
      body.todo_el_dia = $('#avTodoDia').checked;
      body.fecha_evento = body.todo_el_dia ? f : `${f} ${$('#avHora').value || '08:00'}`;
      body.enviar_calendario = $('#avMail').checked;
    }
    const r = await api('/api/avisos', { method: 'POST', body });
    if (!r.ok) return toast(r.error, 'error');
    toast(body.enviar_calendario ? 'Aviso publicado. Se están enviando las invitaciones.' : 'Aviso publicado', 'ok');
    ['avTitulo', 'avContenido'].forEach((i) => ($('#' + i).value = ''));
    $('#avConFecha').checked = false; ACC['evento-toggle']();
    avisos.load(); cargados.inicio = false;
  });

  // ═════════════════════════════════════════════════════════════════════════
  // ARCHIVOS
  // ═════════════════════════════════════════════════════════════════════════
  let archivoElegido = null;
  const archivos = {
    async init() {
      const p = $('#panel-archivos');
      let form = '';
      if (puedePublicar()) {
        const d = await aniosDestino();
        form = `<div class="card"><div class="card-header"><div class="card-title">Subir archivo</div></div>
          <div class="form-grid">
            <div class="field full"><label class="dropzone" id="dz" for="arFile"><span id="dzTxt">📎 <strong>Elegí un archivo</strong> o arrastralo acá<br><span class="muted">PDF, Word, Excel, PowerPoint, imágenes, ZIP… (máx. 15 MB)</span></span></label>
              <input type="file" id="arFile" data-change="ar-elegido" style="display:none"/></div>
            <div class="field"><label>Año</label><select id="arAnio" data-change="ar-anio">${optsAnios(d.anios, d.todos)}</select></div>
            <div class="field"><label>Materia (opcional)</label><select id="arMateria"><option value="">Sin materia</option></select></div>
            <div class="field full"><label>Descripción (opcional)</label><input type="text" id="arDesc" maxlength="255" placeholder="Ej: Guía de ejercicios unidad 2"/></div>
            <div class="field full"><button class="btn btn-primary" data-act="subir-archivo">⬆️ Subir archivo</button></div>
          </div></div>`;
      }
      const filtro = U.rol === 'alumno' ? '' : `<select id="arFiltroAnio" data-change="ar-filtro" style="max-width:220px"><option value="">Todos los años</option></select>`;
      p.innerHTML = form + `<div class="card"><div class="card-header"><div class="card-title">${U.rol === 'alumno' ? 'Material de mi año' : 'Archivos subidos'}</div>${filtro}</div><div id="listaArchivos"></div></div>`;
      const dz = $('#dz');
      if (dz) {
        ['dragover', 'dragenter'].forEach((ev) => dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.add('over'); }));
        ['dragleave', 'drop'].forEach((ev) => dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.remove('over'); }));
        dz.addEventListener('drop', (e) => { if (e.dataTransfer.files[0]) elegirArchivo(e.dataTransfer.files[0]); });
      }
      if ($('#arFiltroAnio')) { const a = await api('/api/anios'); if (a.ok) $('#arFiltroAnio').innerHTML = optsAnios(a.data, true); }
    },
    async load() {
      const anio = $('#arFiltroAnio')?.value;
      const r = await api('/api/archivos' + (anio ? '?anio_id=' + anio : ''));
      const el = $('#listaArchivos');
      if (!r.ok) return (el.innerHTML = vacio('⚠️', r.error));
      el.innerHTML = r.data.length ? r.data.map((f) => `<div class="archivo">
        <div class="archivo-icono">${icono(f.nombre_original)}</div>
        <div class="archivo-info"><div class="archivo-nombre" title="${esc(f.nombre_original)}">${esc(f.nombre_original)}</div>
          <div class="muted">${f.descripcion ? esc(f.descripcion) + ' · ' : ''}${bytes(f.tamanio)} · ${esc(f.subido_por_nombre)} · ${fechaCorta(f.creado_en)}</div>
          <div class="row" style="gap:6px;margin-top:4px"><span class="badge badge-anio">${f.anio ? esc(f.anio) : 'Todos los años'}</span>${f.materia ? `<span class="badge badge-gris">${esc(f.materia)}</span>` : ''}</div></div>
        <button class="btn btn-primary btn-sm" data-act="bajar-archivo" data-id="${f.id}" data-name="${esc(f.nombre_original)}">⬇ Descargar</button>
        ${puedePublicar() && (esAdmin() || f.subido_por === U.id) ? `<button class="btn btn-danger btn-sm" data-act="borrar-archivo" data-id="${f.id}">🗑</button>` : ''}
      </div>`).join('') : vacio('📂', 'Todavía no hay archivos');
    },
  };
  function elegirArchivo(f) {
    archivoElegido = f;
    $('#dzTxt').innerHTML = `${icono(f.name)} <strong>${esc(f.name)}</strong> <span class="muted">(${bytes(f.size)})</span>`;
  }
  ACC['ar-elegido'] = (d, el) => { if (el.files[0]) elegirArchivo(el.files[0]); };
  ACC['ar-filtro'] = () => archivos.load();
  ACC['ar-anio'] = async (d, el) => {
    const sel = $('#arMateria'); sel.innerHTML = '<option value="">Sin materia</option>';
    if (!el.value) return;
    const r = await api(`/api/anios/${el.value}/materias`);
    if (r.ok) sel.innerHTML += r.data.map((m) => `<option value="${m.id}">${esc(m.nombre)}</option>`).join('');
  };
  ACC['bajar-archivo'] = (d) => descargar(`/api/archivos/${d.id}/descargar`, d.name);
  ACC['borrar-archivo'] = async (d) => {
    if (!(await confirmar('¿Eliminar este archivo?', 'Eliminar'))) return;
    const r = await api(`/api/archivos/${d.id}`, { method: 'DELETE' });
    if (!r.ok) return toast(r.error, 'error');
    toast('Archivo eliminado', 'ok'); archivos.load();
  };
  ACC['subir-archivo'] = (d, btn) => botonCargando(btn, async () => {
    if (!archivoElegido) return toast('Elegí un archivo primero', 'error');
    if (archivoElegido.size > 15 * 1048576) return toast('El archivo supera los 15 MB', 'error');
    const dest = await aniosDestino();
    const anio = $('#arAnio').value;
    if (!dest.todos && !anio) return toast('Elegí el año al que va dirigido', 'error');
    const fd = new FormData();
    fd.append('archivo', archivoElegido);
    if (anio) fd.append('anio_id', anio);
    if ($('#arMateria').value) fd.append('materia_id', $('#arMateria').value);
    fd.append('descripcion', $('#arDesc').value.trim());
    const r = await api('/api/archivos', { method: 'POST', body: fd });
    if (!r.ok) return toast(r.error, 'error');
    toast('Archivo subido', 'ok');
    archivoElegido = null; $('#arFile').value = ''; $('#arDesc').value = '';
    $('#dzTxt').innerHTML = '📎 <strong>Elegí un archivo</strong> o arrastralo acá<br><span class="muted">PDF, Word, Excel, PowerPoint, imágenes, ZIP… (máx. 15 MB)</span>';
    archivos.load();
  });

  // ═════════════════════════════════════════════════════════════════════════
  // USUARIOS (director / secretaría)
  // ═════════════════════════════════════════════════════════════════════════
  let usuariosCache = [], aniosLista = [];
  const rolBadge = (r) => `<span class="badge badge-${r}">${r}</span>`;
  const usuarios = {
    async init() {
      const a = await api('/api/anios'); aniosLista = a.ok ? a.data : [];
      $('#panel-usuarios').innerHTML = `
        <div class="card"><div class="card-header"><div class="card-title">Crear usuario</div></div>
          <div class="form-grid">
            <div class="field"><label>Nombre completo</label><input type="text" id="uNombre" placeholder="Nombre y apellido"/></div>
            <div class="field"><label>Email</label><input type="email" id="uEmail" placeholder="correo@ejemplo.com"/></div>
            <div class="field"><label>Rol</label><select id="uRol" data-change="u-rol"><option value="alumno">🟡 Alumno</option><option value="profesor">🟢 Profesor</option><option value="preceptor">🔵 Preceptor</option><option value="secretaria">🔵 Secretaría</option><option value="director">🟣 Director</option></select></div>
            <div class="field" id="uAnioBox"><label>Año del alumno</label><select id="uAnio">${optsAnios(aniosLista, false)}</select></div>
            <div class="field full"><button class="btn btn-primary" data-act="crear-usuario">➕ Crear y enviar código de acceso</button>
              <span class="muted">Le llega un código al mail para entrar por primera vez y elegir su contraseña.</span></div>
          </div></div>
        <div class="card"><div class="card-header"><div class="card-title">Usuarios del sistema</div></div>
          <div class="filtros"><input type="text" id="uBuscar" data-input="u-filtrar" placeholder="🔎 Buscar por nombre o email…"/>
            <select id="uFRol" data-change="u-filtrar"><option value="">Todos los roles</option><option value="alumno">Alumnos</option><option value="profesor">Profesores</option><option value="preceptor">Preceptores</option><option value="secretaria">Secretaría</option><option value="director">Dirección</option></select>
            <select id="uFAnio" data-change="u-filtrar"><option value="">Todos los años</option>${aniosLista.map((x) => `<option value="${x.id}">${esc(x.etiqueta || x.nombre)}</option>`).join('')}</select></div>
          <div class="tabla-wrap"><table><thead><tr><th>Usuario</th><th>Rol</th><th>Año</th><th>Estado</th><th>Acciones</th></tr></thead><tbody id="tablaUsuarios"></tbody></table></div></div>`;
    },
    async load() {
      const r = await api('/api/users?pendiente=0');
      usuariosCache = r.ok ? r.data : [];
      if (!r.ok) toast(r.error, 'error');
      pintarUsuarios();
    },
  };
  function pintarUsuarios() {
    const q = ($('#uBuscar').value || '').toLowerCase(), fr = $('#uFRol').value, fa = $('#uFAnio').value;
    const lista = usuariosCache.filter((u) => (!fr || u.rol === fr) && (!fa || String(u.anio_id) === fa) && (!q || u.nombre.toLowerCase().includes(q) || u.email.toLowerCase().includes(q)));
    $('#tablaUsuarios').innerHTML = lista.length ? lista.map((u) => `<tr>
      <td><div class="persona">${avatar(u)}<div><div style="font-weight:600">${esc(u.nombre)}</div><div class="muted">${esc(u.email)}</div></div></div></td>
      <td>${u.id === U.id ? rolBadge(u.rol) : `<select data-change="u-cambiar-rol" data-id="${u.id}">${['alumno', 'profesor', 'preceptor', 'secretaria', 'director'].map((r) => `<option ${r === u.rol ? 'selected' : ''}>${r}</option>`).join('')}</select>`}</td>
      <td>${u.rol === 'alumno' ? `<select data-change="u-cambiar-anio" data-id="${u.id}"><option value="">Sin año</option>${aniosLista.map((a) => `<option value="${a.id}" ${a.id === u.anio_id ? 'selected' : ''}>${esc(a.etiqueta || a.nombre)}</option>`).join('')}</select>` : '<span class="muted">—</span>'}</td>
      <td><span class="badge ${u.activo ? 'badge-activo' : 'badge-pendiente'}">${u.activo ? 'Activo' : 'Inactivo'}</span></td>
      <td><div class="row" style="gap:6px">
        ${u.id !== U.id ? `<button class="btn btn-ghost btn-sm" data-act="u-toggle" data-id="${u.id}" data-activo="${u.activo ? 1 : 0}" data-nombre="${esc(u.nombre)}">${u.activo ? 'Desactivar' : 'Activar'}</button>` : ''}
        ${u.tiene_foto ? `<button class="btn btn-danger btn-sm" data-act="u-sacar-foto" data-id="${u.id}" data-nombre="${esc(u.nombre)}" title="Quitar foto de perfil inapropiada">🚫 Foto</button>` : ''}
        ${u.rol === 'alumno' ? `<button class="btn btn-ghost btn-sm" data-act="u-se-fue" data-id="${u.id}" data-nombre="${esc(u.nombre)}" title="Dejó la escuela: conserva su cuenta">🚪 Se fue</button>` : ''}
        ${u.id !== U.id ? `<button class="btn btn-ghost btn-sm" data-act="u-reset" data-id="${u.id}" data-nombre="${esc(u.nombre)}" title="Generar un código para que cree una contraseña nueva">🔑</button>` : ''}
      </div></td></tr>`).join('') : `<tr><td colspan="5">${vacio('🔎', 'No hay usuarios con ese filtro')}</td></tr>`;
  }
  ACC['u-filtrar'] = pintarUsuarios;
  ACC['u-rol'] = (d, el) => { $('#uAnioBox').style.display = el.value === 'alumno' ? '' : 'none'; };
  ACC['crear-usuario'] = (d, btn) => botonCargando(btn, async () => {
    const nombre = $('#uNombre').value.trim(), email = $('#uEmail').value.trim(), rol = $('#uRol').value;
    if (!nombre || !email) return toast('Completá nombre y email', 'error');
    const body = { nombre, email, rol };
    if (rol === 'alumno') { if (!$('#uAnio').value) return toast('Elegí el año del alumno', 'error'); body.anio_id = $('#uAnio').value; }
    const r = await api('/api/users', { method: 'POST', body });
    if (!r.ok) return toast(r.error, 'error');
    if (r.data.codigo) mostrarCodigo(nombre, r.data.codigo, r.data.message);
    else toast(r.data.message, 'ok');
    ['uNombre', 'uEmail'].forEach((i) => ($('#' + i).value = ''));
    usuarios.load();
  });
  function mostrarCodigo(nombre, codigo, msg) {
    modal(`<h3>Código de acceso</h3><p class="muted" style="margin:6px 0 14px">${esc(msg || '')}</p>
      <div style="text-align:center;font-size:2.2rem;font-weight:700;letter-spacing:8px;background:var(--claro);border-radius:12px;padding:18px;margin-bottom:10px">${esc(codigo)}</div>
      <p class="muted">Entregáselo a <strong>${esc(nombre)}</strong>. Entra en “Primer ingreso” con su email y este código; vence en 60 minutos.</p>`);
  }
  ACC['u-cambiar-rol'] = async (d, el) => {
    const r = await api('/api/users/rol', { method: 'PUT', body: { userId: Number(d.id), nuevoRol: el.value } });
    toast(r.ok ? 'Rol actualizado' : r.error, r.ok ? 'ok' : 'error'); usuarios.load();
  };
  ACC['u-cambiar-anio'] = async (d, el) => {
    const r = await api(`/api/users/${d.id}/anio`, { method: 'PUT', body: { anio_id: el.value || null } });
    toast(r.ok ? r.data.message : r.error, r.ok ? 'ok' : 'error'); usuarios.load();
  };
  ACC['u-toggle'] = async (d) => {
    const act = d.activo === '1';
    if (!(await confirmar(`¿${act ? 'Desactivar' : 'Activar'} a ${d.nombre}?`))) return;
    const r = await api(`/api/users/${d.id}/toggle-activo`, { method: 'PUT' });
    toast(r.ok ? 'Estado actualizado' : r.error, r.ok ? 'ok' : 'error'); usuarios.load();
  };
  ACC['u-sacar-foto'] = async (d) => {
    if (!(await confirmar(`¿Quitar la foto de perfil de ${d.nombre}? Se muestra su inicial en su lugar.`, 'Quitar foto'))) return;
    const r = await api(`/api/users/${d.id}/foto`, { method: 'DELETE' });
    toast(r.ok ? r.data.message : r.error, r.ok ? 'ok' : 'error'); usuarios.load(); if (cargados.pendientes) pendientes.load();
  };
  ACC['u-se-fue'] = async (d) => {
    if (!(await confirmar(`¿${d.nombre} dejó la escuela? Sale de las listas y de la asistencia, pero su cuenta se conserva (pasa a “Egresados / ex alumnos”) y puede reincorporarse después.`, 'Marcar como ex alumno'))) return;
    const r = await api(`/api/users/${d.id}/ex-alumno`, { method: 'POST' });
    toast(r.ok ? (r.data.message || 'Marcado como ex alumno') : r.error, r.ok ? 'ok' : 'error'); usuarios.load();
  };
  ACC['u-reset'] = async (d) => {
    if (!(await confirmar(`¿Generar un código nuevo para ${d.nombre}? Su contraseña actual dejará de funcionar.`, 'Generar código'))) return;
    const r = await api(`/api/users/${d.id}/reset-password`, { method: 'POST' });
    if (!r.ok) return toast(r.error, 'error');
    mostrarCodigo(d.nombre, r.data.codigo, r.data.message);
  };

  // ── Pendientes de aprobación ──
  const pendientes = {
    async load() {
      const [r, a] = await Promise.all([api('/api/users?pendiente=1'), aniosLista.length ? Promise.resolve({ ok: true, data: aniosLista }) : api('/api/anios')]);
      if (a.ok) aniosLista = a.data;
      const el = $('#panel-pendientes');
      const lista = r.ok ? r.data : [];
      actualizarPendientes(lista.length);
      el.innerHTML = `<div class="card"><div class="card-header"><div class="card-title">⏳ Cuentas esperando aprobación</div></div>
        ${!r.ok ? vacio('⚠️', r.error) : lista.length ? lista.map((u) => `<div class="pendiente-card">
          <div class="pendiente-info"><div class="persona">${avatar(u)}<div><div class="pendiente-nombre">${esc(u.nombre)}</div><div class="pendiente-email">${esc(u.email)}</div></div></div>
            <div class="pendiente-rol">Pidió ser: ${esc(u.rol)} · Año: ${u.anio ? esc(u.anio) : 'sin elegir'} · ${fechaCorta(u.fecha_creacion)}</div></div>
          <div class="pendiente-btns">
            <select id="pa-${u.id}"><option value="">Año…</option>${aniosLista.map((a) => `<option value="${a.id}" ${a.id === u.anio_id ? 'selected' : ''}>${esc(a.etiqueta || a.nombre)}</option>`).join('')}</select>
            <button class="btn btn-success btn-sm" data-act="aprobar" data-id="${u.id}">✓ Aprobar</button>
            <button class="btn btn-danger btn-sm" data-act="rechazar" data-id="${u.id}" data-nombre="${esc(u.nombre)}">✕ Rechazar</button></div></div>`).join('') : vacio('✅', 'No hay solicitudes pendientes')}</div>`;
    },
  };
  async function actualizarPendientes(n) {
    if (n === undefined) { const r = await api('/api/users?pendiente=1'); n = r.ok ? r.data.length : 0; }
    const b = $('#badgePend');
    if (b) { b.textContent = n; b.style.display = n ? '' : 'none'; }
  }
  ACC.aprobar = async (d) => {
    const anio = $('#pa-' + d.id).value;
    const r = await api(`/api/users/${d.id}/aprobar`, { method: 'POST', body: { anio_id: anio || null } });
    toast(r.ok ? 'Cuenta aprobada' : r.error, r.ok ? 'ok' : 'error'); pendientes.load(); cargados.usuarios = false;
  };
  ACC.rechazar = async (d) => {
    if (!(await confirmar(`¿Rechazar la solicitud de ${d.nombre}? Se borra.`, 'Rechazar'))) return;
    const r = await api(`/api/users/${d.id}/rechazar`, { method: 'DELETE' });
    toast(r.ok ? 'Solicitud rechazada' : r.error, r.ok ? 'ok' : 'error'); pendientes.load();
  };

  // ═════════════════════════════════════════════════════════════════════════
  // ASISTENCIA (QR + lista manual) / mi asistencia (alumno)
  // ═════════════════════════════════════════════════════════════════════════
  let qrTimer = null, qrRestante = 0, qrTotal = 80;
  const asistencia = {
    async init() {
      if (U.rol === 'alumno') return;
      const a = await api('/api/anios');
      if (a.ok) { aniosLista = a.data; cacheSet('anios', a.data); } else if (a.status === 0) aniosLista = cacheGet('anios') || [];
      $('#panel-asistencia').innerHTML = `
        <div class="card"><div class="card-header"><div class="card-title">📲 Código QR de ingreso</div>
          <button class="btn btn-ghost btn-sm" data-act="qr-nuevo">🔄 Renovar</button></div>
          <p class="muted" style="margin-bottom:12px">Mostralo en una pantalla en la entrada. Cada alumno lo escanea con la cámara de su celular y queda registrado (presente o tarde según la hora de ingreso). El código cambia solo cada pocos segundos para que no se pueda compartir una foto.</p>
          <div class="qr-box" id="qrBox"><div class="muted">Generando…</div></div></div>
        <div class="card"><div class="card-header"><div class="card-title">📊 Descargar asistencias en Excel</div></div>
          <div class="filtros"><select id="exAnio"><option value="">Todos los años</option>${aniosLista.map((x) => `<option value="${x.id}">${esc(x.etiqueta || x.nombre)}</option>`).join('')}</select>
            <input type="date" id="exDesde" value="${hoyISO().slice(0, 8)}01" title="Desde"/><input type="date" id="exHasta" value="${hoyISO()}" title="Hasta"/>
            <button class="btn btn-primary" data-act="exportar-excel">⬇ Descargar Excel</button></div>
          <p class="muted">Incluye una hoja <strong>Resumen</strong> (presentes, tarde, ausentes y % por alumno) y una hoja <strong>Detalle</strong> con cada registro.</p></div>
        <div class="card"><div class="card-header"><div class="card-title">📝 Lista del día</div></div>
          <div class="filtros"><select id="asAnio" data-change="as-cargar"><option value="">Elegí un año…</option>${aniosLista.map((x) => `<option value="${x.id}">${esc(x.etiqueta || x.nombre)}</option>`).join('')}</select>
            <input type="date" id="asFecha" value="${hoyISO()}" max="${hoyISO()}" data-change="as-cargar"/></div>
          <div id="asLista">${vacio('👆', 'Elegí un año para ver y marcar la asistencia')}</div></div>`;
    },
    load() {
      if (U.rol === 'alumno') return asistenciaAlumno();
      guardarListasDeHoy();
      generarQR();
    },
  };
  async function asistenciaAlumno() {
    const el = $('#panel-asistencia');
    const r = await api(`/api/asistencia/alumno/${U.id}`);
    if (!r.ok) return (el.innerHTML = `<div class="card">${vacio('⚠️', r.error)}</div>`);
    const s = r.data.stats;
    el.innerHTML = `<div class="stats-grid">
        <div class="stat-card"><div class="stat-icon">✅</div><div class="stat-val">${s.presente}</div><div class="stat-lbl">Presentes</div></div>
        <div class="stat-card"><div class="stat-icon">🕐</div><div class="stat-val">${s.tarde}</div><div class="stat-lbl">Llegadas tarde</div></div>
        <div class="stat-card"><div class="stat-icon">❌</div><div class="stat-val">${s.ausente}</div><div class="stat-lbl">Ausentes</div></div></div>
      <div class="card"><div class="card-header"><div class="card-title">Mi historial</div></div>
        ${r.data.registros.length ? `<div class="tabla-wrap"><table><thead><tr><th>Fecha</th><th>Estado</th><th>Hora</th><th>Cómo</th></tr></thead><tbody>${r.data.registros.map((x) => `<tr><td>${esc(x.fecha.split('-').reverse().join('/'))}</td><td><span class="badge ${x.estado === 'presente' ? 'badge-ok' : x.estado === 'tarde' ? 'badge-tarde' : 'badge-mal'}">${esc(x.estado)}</span></td><td>${esc(x.hora || '—')}</td><td>${x.origen === 'qr' ? '📲 QR' : '✍️ Preceptor'}</td></tr>`).join('')}</tbody></table></div>` : vacio('📭', 'Todavía no hay registros')}</div>`;
  }
  async function generarQR() {
    clearInterval(qrTimer);
    const box = $('#qrBox'); if (!box) return;
    // En el celular "localhost" no funciona: se manda la IP/host con el que abrió la página esta PC
    const r = await api('/api/asistencia/qr?base=' + encodeURIComponent(location.origin));
    if (!r.ok) return (box.innerHTML = `<div class="alerta mal">${esc(r.error)}</div>`);
    qrTotal = r.data.segundos_validez || 90; qrRestante = qrTotal - 5;
    const local = /^(localhost|127\.|\[::1\])/.test(location.hostname);
    box.innerHTML = `<img src="${r.data.qr}" alt="QR de asistencia"/>
      <div class="qr-timer"><div id="qrBar" style="width:100%"></div></div>
      <div class="muted">Se renueva solo en <span id="qrSeg">${qrRestante}</span> s</div>
      ${local ? '<div class="alerta info" style="margin-top:12px;text-align:left">⚠️ Estás en <strong>localhost</strong>: el celular no puede abrir esa dirección. Abrí el campus desde la IP de esta PC (ej. <code>http://192.168.x.x:3000</code>) o definí <code>FRONTEND_PUBLIC_URL</code> en el .env.</div>' : ''}`;
    qrTimer = setInterval(() => {
      if (!$('#qrBox') || !$('#panel-asistencia').classList.contains('active')) return clearInterval(qrTimer);
      qrRestante--;
      const s = $('#qrSeg'), b = $('#qrBar');
      if (s) s.textContent = Math.max(qrRestante, 0);
      if (b) b.style.width = Math.max(0, (qrRestante / (qrTotal - 5)) * 100) + '%';
      if (qrRestante <= 0) generarQR();
    }, 1000);
  }
  ACC['qr-nuevo'] = () => generarQR();
  ACC['exportar-excel'] = (d, btn) => botonCargando(btn, async () => {
    const desde = $('#exDesde').value, hasta = $('#exHasta').value, anio = $('#exAnio').value;
    if (!desde || !hasta) return toast('Elegí las fechas', 'error');
    const q = new URLSearchParams({ desde, hasta }); if (anio) q.set('anio_id', anio);
    await descargar('/api/asistencia/exportar?' + q, `asistencia_${desde}_a_${hasta}.xlsx`);
  });
  ACC['as-cargar'] = async () => {
    const anio = $('#asAnio').value, fecha = $('#asFecha').value || hoyISO();
    const el = $('#asLista');
    if (!anio) return (el.innerHTML = vacio('👆', 'Elegí un año para ver y marcar la asistencia'));
    const r = await api(`/api/asistencia/anio/${anio}?fecha=${fecha}`);
    let datos = r.ok ? r.data : null, guardado = false;
    if (r.ok) cacheSet(`as_${anio}_${fecha}`, datos);
    else if (r.status === 0 && cacheGet(`as_${anio}_${fecha}`)) { datos = cacheGet(`as_${anio}_${fecha}`); guardado = true; }
    if (!datos) return (el.innerHTML = vacio('⚠️', r.status === 0 ? 'Sin conexión y esta lista no se había abierto antes en este dispositivo.' : r.error));
    if ($('#asAnio').value !== anio) return;
    // Lo marcado que todavía no se envió se muestra encima de lo que dice el servidor.
    const pend = {};
    getCola().filter((i) => i.tipo === 'asistencia' && i.datos.fecha === fecha).forEach((i) => (pend[i.datos.alumno_id] = i));
    const al = datos.alumnos;
    el.innerHTML = (guardado ? '<div class="alerta mal">📴 Sin conexión: se muestran los datos guardados la última vez. Podés seguir marcando: se sube todo cuando vuelva internet.</div>' : '') + (al.length ? `<div class="tabla-wrap"><table><thead><tr><th>Alumno</th><th>Hora</th><th>Estado</th></tr></thead><tbody>${al.map((a) => {
      const p = pend[a.alumno_id], est = p ? p.datos.estado : a.estado;
      return `<tr class="${p ? 'fila-pend' : ''}"><td>${esc(a.alumno)}</td><td class="muted">${p ? (p.error ? '⚠️ no se envió' : '🕐 sin enviar') : esc(a.hora || '') + (a.origen === 'qr' ? ' 📲' : '')}</td>
      <td><div class="asis-btns">${['presente', 'tarde', 'ausente'].map((e) => `<button class="${est === e ? 'on-' + e : ''}" data-act="as-marcar" data-alumno="${a.alumno_id}" data-nombre="${esc(a.alumno)}" data-estado="${e}">${e === 'presente' ? 'P' : e === 'tarde' ? 'T' : 'A'}</button>`).join('')}</div></td></tr>`;
    }).join('')}</tbody></table></div>
      <p class="muted" style="margin-top:10px">P = presente · T = tarde · A = ausente · 🕐 = marcado, falta enviarlo</p>` : vacio('🎓', 'Este año todavía no tiene alumnos'));
  };
  ACC['as-marcar'] = (d) => {
    const fecha = $('#asFecha').value || hoyISO();
    if (fecha > hoyISO()) return toast('No se puede cargar asistencia de una fecha futura', 'error');
    const alumnoId = Number(d.alumno);
    quitarDeCola((i) => i.tipo === 'asistencia' && i.datos.alumno_id === alumnoId && i.datos.fecha === fecha);
    const h = new Date();
    encolar('asistencia', { alumno_id: alumnoId, nombre: d.nombre, estado: d.estado, fecha, hora: `${dos(h.getHours())}:${dos(h.getMinutes())}` });
    ACC['as-cargar']();
    procesarCola();
  };
  // Con internet, deja guardada la lista de hoy de todos los años para poder usarla si se corta.
  async function guardarListasDeHoy() {
    for (const x of aniosLista) {
      const r = await api(`/api/asistencia/${'anio'}/${x.id}?fecha=${hoyISO()}`);
      if (r.ok) cacheSet(`as_${x.id}_${hoyISO()}`, r.data); else if (r.status === 0) break;
    }
  }

  // ═════════════════════════════════════════════════════════════════════════
  // AÑOS Y MATERIAS (director / secretaría)
  // ═════════════════════════════════════════════════════════════════════════
  let profes = [];
  const anios = {
    async init() {
      const p = await api('/api/users?rol=profesor&activo=1'); profes = p.ok ? p.data : [];
      $('#panel-anios').innerHTML = `
        <div class="card"><div class="card-header"><div class="card-title">Crear año escolar</div></div>
          <div class="form-grid">
            <div class="field"><label>Nombre del año</label><input type="text" id="anNombre" list="anSug" maxlength="30" placeholder="Ej: 1ro" autocomplete="off"/><datalist id="anSug">${['1ro', '2do', '3ro', '4to', '5to', '6to', '7mo'].map((x) => `<option value="${x}">`).join('')}</datalist></div>
            <div class="field" style="justify-content:flex-end"><button class="btn btn-primary" data-act="crear-anio">➕ Crear año</button></div>
          </div></div>
        <div class="card"><div class="card-header"><div class="card-title">🎓 Pasar de año</div></div>
          <p class="muted">Al terminar el ciclo: cada alumno pasa al año siguiente y los del último año quedan como <strong>egresados de una promoción</strong> (conservan su cuenta). Podés dejar a los que repiten. El primer año queda vacío para los ingresantes nuevos.</p>
          <div style="margin-top:12px"><button class="btn btn-primary" data-act="pase-abrir">🎓 Pasar de año…</button></div></div>
        <div class="card"><div class="card-header"><div class="card-title">Años y materias</div></div><div id="listaAnios"></div></div>`;
    },
    async load() {
      const r = await api('/api/anios');
      const el = $('#listaAnios');
      if (!r.ok) return (el.innerHTML = vacio('⚠️', r.error));
      aniosLista = r.data; anioCache = null;
      el.innerHTML = r.data.length ? r.data.map((a) => `<div class="aviso-card" id="an-${a.id}">
        <div class="aviso-meta"><strong>${esc(a.etiqueta)}</strong><span class="muted">${a.cantidad_alumnos} alumnos · ${a.cantidad_materias} materias</span><span class="spacer"></span>
          <button class="btn btn-ghost btn-sm" data-act="an-materias" data-id="${a.id}">📚 Gestionar materias</button>
          <button class="btn btn-ghost btn-sm" data-act="an-renombrar" data-id="${a.id}" data-nombre="${esc(a.nombre)}">✏️ Renombrar</button>
          <button class="btn btn-danger btn-sm" data-act="an-borrar" data-id="${a.id}" data-nombre="${esc(a.etiqueta)}">🗑</button></div>
        <div class="an-mat" id="mat-${a.id}" style="display:none"></div></div>`).join('') : vacio('🏫', 'Todavía no creaste ningún año');
    },
  };
  ACC['crear-anio'] = (d, btn) => botonCargando(btn, async () => {
    const r = await api('/api/anios', { method: 'POST', body: { nombre: $('#anNombre').value } });
    toast(r.ok ? 'Año creado' : r.error, r.ok ? 'ok' : 'error'); if (r.ok) anios.load();
  });
  ACC['an-renombrar'] = (d) => {
    const m = modal(`<h3>Renombrar año</h3><div class="field" style="margin:12px 0"><label>Nuevo nombre</label><input type="text" id="anNuevo" maxlength="30" value="${esc(d.nombre)}"/></div>
      <button class="btn btn-primary" data-act="an-renombrar-ok" data-id="${d.id}">Guardar</button>`);
    ACC._m = m;
  };
  ACC['an-renombrar-ok'] = (d, btn) => botonCargando(btn, async () => {
    const nombre = $('#anNuevo').value.trim(); if (!nombre) return toast('Escribí un nombre', 'error');
    const r = await api(`/api/anios/${d.id}`, { method: 'PUT', body: { nombre } });
    if (!r.ok) return toast(r.error, 'error');
    ACC._m?.close(); toast('Año renombrado', 'ok'); cargados.chat = false; anios.load();
  });
  ACC['pase-abrir'] = async () => {
    const r = await api('/api/anios/pase/vista-previa');
    if (!r.ok) return toast(r.error, 'error');
    const v = r.data;
    if (!v.anios.length) return toast('No hay años creados', 'error');
    const total = v.anios.reduce((n, a) => n + a.alumnos.length, 0);
    const m = modal(`<h3>🎓 Pasar de año</h3>
      <p class="muted" style="margin:6px 0 12px">Se mueven <strong>${total}</strong> alumnos. Tildá a los que <strong>repiten</strong> (se quedan en su año).</p>
      <div style="max-height:300px;overflow:auto;border:1px solid var(--borde);border-radius:8px;padding:8px 12px">
        ${v.anios.map((a) => `<details style="margin:6px 0"><summary><strong>${esc(a.nombre)}</strong> → ${a.destino_id ? esc(a.destino) : '🎓 <em>promoción</em>'} <span class="muted">· ${a.alumnos.length} alumnos</span></summary>
          ${a.alumnos.map((x) => `<label class="check" style="padding:3px 0 3px 14px"><input type="checkbox" class="pase-rep" value="${x.id}"/> ${esc(x.nombre)} <span class="muted">repite</span></label>`).join('') || '<p class="muted" style="padding-left:14px">Sin alumnos</p>'}</details>`).join('')}
      </div>
      <div class="field" style="margin-top:12px"><label>Nombre de la promoción que egresa</label><input type="text" id="paseProm" maxlength="20" value="${esc(v.promocion_sugerida)}"/></div>
      <div class="field" style="margin-top:8px"><label>Para confirmar, escribí PASAR</label><input type="text" id="paseConf" autocomplete="off"/></div>
      <div style="margin-top:14px"><button class="btn btn-primary" data-act="pase-ok">🎓 Pasar de año</button></div>`);
    ACC._m = m;
  };
  ACC['pase-ok'] = (d, btn) => botonCargando(btn, async () => {
    if ($('#paseConf').value.trim().toUpperCase() !== 'PASAR') return toast('Escribí PASAR para confirmar', 'error');
    const excluir = $$('.pase-rep:checked').map((c) => Number(c.value));
    const r = await api('/api/anios/pase', { method: 'POST', body: { promocion_nombre: $('#paseProm').value.trim(), excluir, confirmar: 'PASAR' } });
    if (!r.ok) return toast(r.error, 'error');
    ACC._m?.close();
    toast(`Listo: pasaron ${r.data.pasaron}, egresaron ${r.data.egresaron}, repiten ${r.data.repiten}`, 'ok');
    anioCache = null; cargados.usuarios = false; cargados.egresados = false; anios.load();
  });
  ACC['an-borrar'] = async (d) => {
    if (!(await confirmar(`¿Eliminar ${d.nombre}? Se borran también sus materias y avisos.`, 'Eliminar'))) return;
    const r = await api(`/api/anios/${d.id}`, { method: 'DELETE' });
    toast(r.ok ? 'Año eliminado' : r.error, r.ok ? 'ok' : 'error'); anios.load();
  };
  ACC['an-materias'] = async (d) => {
    const box = $('#mat-' + d.id);
    if (box.style.display === '') { box.style.display = 'none'; return; }
    box.style.display = '';
    await pintarMaterias(d.id);
  };
  async function pintarMaterias(id) {
    const box = $('#mat-' + id);
    const r = await api(`/api/anios/${id}/materias`);
    if (!r.ok) return (box.innerHTML = vacio('⚠️', r.error));
    box.innerHTML = `<div style="margin-top:12px">${r.data.length ? r.data.map((m) => `<div class="archivo" style="padding:8px 0"><div class="archivo-info"><strong>${esc(m.nombre)}</strong> <span class="muted">· ${m.profesor ? esc(m.profesor) : 'sin profesor'}</span></div>
        <button class="btn btn-primary btn-sm" data-act="abrir-materia" data-id="${m.id}">Abrir clase</button>
        <button class="btn btn-danger btn-sm" data-act="mat-borrar" data-id="${m.id}" data-anio="${id}">🗑</button></div>`).join('') : '<p class="muted">Sin materias todavía.</p>'}
      <div class="row" style="margin-top:12px"><input type="text" id="mn-${id}" placeholder="Nueva materia" style="flex:1;min-width:140px"/>
        <select id="mp-${id}"><option value="">Sin profesor</option>${profes.map((p) => `<option value="${p.id}">${esc(p.nombre)}</option>`).join('')}</select>
        <button class="btn btn-primary btn-sm" data-act="mat-crear" data-anio="${id}">➕ Agregar</button></div></div>`;
  }
  ACC['mat-crear'] = async (d) => {
    const nombre = $('#mn-' + d.anio).value.trim();
    if (!nombre) return toast('Escribí el nombre de la materia', 'error');
    const r = await api('/api/anios/materias', { method: 'POST', body: { nombre, anio_id: Number(d.anio), profesor_id: $('#mp-' + d.anio).value || null } });
    toast(r.ok ? 'Materia agregada' : r.error, r.ok ? 'ok' : 'error'); if (r.ok) pintarMaterias(d.anio);
  };
  ACC['mat-borrar'] = async (d) => {
    if (!(await confirmar('¿Eliminar esta materia?', 'Eliminar'))) return;
    const r = await api(`/api/anios/materias/${d.id}`, { method: 'DELETE' });
    toast(r.ok ? 'Materia eliminada' : r.error, r.ok ? 'ok' : 'error'); pintarMaterias(d.anio);
  };


  // ═════════════════════════════════════════════════════════════════════════
  // CALENDARIO (tipo Moodle): eventos cargados + avisos con fecha
  // ═════════════════════════════════════════════════════════════════════════
  const TIPOS_EV = { evento: 'Evento', examen: 'Examen', entrega: 'Entrega', reunion: 'Reunión', feriado: 'Feriado / sin clases', acto: 'Acto', aviso: 'Aviso' };
  const dos = (n) => String(n).padStart(2, '0');
  const isoDe = (d) => `${d.getFullYear()}-${dos(d.getMonth() + 1)}-${dos(d.getDate())}`;
  const puedeAnotar = () => U.rol !== 'alumno';
  let cal = null; // { sel, materiaId, mes, items }

  function calMontar(sel, materiaId = null) {
    const h = new Date();
    cal = { sel, materiaId, anioId: '', mes: new Date(h.getFullYear(), h.getMonth(), 1), items: [] };
    return calPintar();
  }
  async function calPintar() {
    const c = cal; const cont = $(c.sel); if (!cont) return;
    const ini = c.mes, fin = new Date(ini.getFullYear(), ini.getMonth() + 1, 0);
    // la grilla muestra semanas completas (lunes a domingo)
    const desde = new Date(ini); desde.setDate(1 - ((ini.getDay() + 6) % 7));
    const hasta = new Date(fin); hasta.setDate(fin.getDate() + (6 - ((fin.getDay() + 6) % 7)));
    const q = new URLSearchParams({ desde: isoDe(desde), hasta: isoDe(hasta) });
    if (c.materiaId) q.set('materia_id', c.materiaId);
    if (c.anioId) q.set('anio_id', c.anioId);
    const filtroAnio = (!c.materiaId && U.rol !== 'alumno') ? await aniosFiltroCal() : [];
    const r = await api('/api/calendario?' + q);
    if (cal !== c || !$(c.sel)) return;
    c.items = r.ok ? r.data : [];
    const porDia = {};
    c.items.forEach((e) => (porDia[e.fecha] ||= []).push(e));
    const hoy = hoyISO();
    const celdas = [];
    for (let d = new Date(desde); d <= hasta; d.setDate(d.getDate() + 1)) {
      const iso = isoDe(d), evs = porDia[iso] || [];
      celdas.push(`<div class="cal-dia${d.getMonth() !== ini.getMonth() ? ' otro' : ''}${iso === hoy ? ' hoy' : ''}" data-act="cal-dia" data-fecha="${iso}">
        <span class="cal-num">${d.getDate()}</span>
        ${evs.slice(0, 3).map((e) => `<span class="cal-ev t-${esc(e.tipo)}" title="${esc(e.titulo)}">${e.hora ? esc(e.hora) + ' ' : ''}${esc(e.titulo)}</span>`).join('')}
        ${evs.length > 3 ? `<div class="cal-mas">+${evs.length - 3} más</div>` : ''}</div>`);
    }
    const delMes = c.items.filter((e) => e.fecha.slice(0, 7) === isoDe(ini).slice(0, 7));
    cont.innerHTML = `
      <div class="cal-barra">
        <button class="btn btn-ghost btn-sm" data-act="cal-mover" data-d="-1">◀</button>
        <div class="cal-mes">${esc(nombreMes(ini))}</div>
        <button class="btn btn-ghost btn-sm" data-act="cal-mover" data-d="1">▶</button>
        <button class="btn btn-ghost btn-sm" data-act="cal-mover" data-d="0">Hoy</button>
        <span class="spacer"></span>
        ${filtroAnio.length ? `<select data-change="cal-anio" style="max-width:180px">${optsAnios(filtroAnio, true).replace(`value="${c.anioId}"`, c.anioId ? `value="${c.anioId}" selected` : 'value=""')}</select>` : ''}
        ${puedeAnotar() ? '<button class="btn btn-primary btn-sm" data-act="cal-nuevo">➕ Anotar evento</button>' : ''}
      </div>
      ${r.ok ? '' : `<div class="alerta mal">⚠️ ${esc(r.error)}</div>`}
      <div class="cal-grid">${['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'].map((x) => `<div class="cal-dow">${x}</div>`).join('')}${celdas.join('')}</div>
      <div class="cal-leyenda">${Object.entries(TIPOS_EV).map(([k, v]) => `<span><i class="t-${k}"></i>${v}</span>`).join('')}</div>
      <h3 class="anio-titulo" style="margin-top:18px">Este mes</h3>
      ${delMes.length ? delMes.map(calItemHTML).join('') : vacio('📅', 'No hay nada anotado este mes')}`;
  }
  const nombreMes = (d) => { const t = d.toLocaleDateString('es-AR', { month: 'long', year: 'numeric' }).replace(' de ', ' '); return t[0].toUpperCase() + t.slice(1); };
  let aniosCalCache = null;
  async function aniosFiltroCal() {
    if (!aniosCalCache) { const r = await api('/api/anios'); aniosCalCache = r.ok ? r.data : []; }
    return aniosCalCache;
  }
  ACC['cal-anio'] = (d, el) => { cal.anioId = el.value; calPintar(); };
  function calItemHTML(e) {
    const f = new Date(e.fecha + 'T00:00:00');
    return `<div class="cal-item"><div class="cal-fecha"><b>${f.getDate()}</b>${f.toLocaleDateString('es-AR', { month: 'short' })}</div>
      <div class="spacer"><div><span class="cal-ev t-${esc(e.tipo)}" style="display:inline-block">${esc(TIPOS_EV[e.tipo] || e.tipo)}</span>
        <strong>${esc(e.titulo)}</strong>${e.hora ? ` <span class="muted">· ${esc(e.hora)} hs</span>` : ''}</div>
        ${e.descripcion ? `<div class="muted" style="white-space:pre-wrap;margin-top:3px">${esc(e.descripcion.length > 240 ? e.descripcion.slice(0, 240) + '…' : e.descripcion)}</div>` : ''}
        <div class="row" style="gap:6px;margin-top:4px">${e.anio ? `<span class="badge badge-anio">${esc(e.anio)}</span>` : '<span class="badge badge-anio">Todos</span>'}${e.materia ? `<span class="badge badge-gris">${esc(e.materia)}</span>` : ''}<span class="muted">por ${esc(e.autor)}</span></div></div>
      ${e.puede_borrar ? `<button class="btn btn-danger btn-sm" data-act="cal-borrar" data-id="${e.id}">🗑</button>` : ''}</div>`;
  }
  ACC['cal-mover'] = (d) => {
    const n = Number(d.d), h = new Date();
    cal.mes = n === 0 ? new Date(h.getFullYear(), h.getMonth(), 1) : new Date(cal.mes.getFullYear(), cal.mes.getMonth() + n, 1);
    calPintar();
  };
  ACC['cal-dia'] = (d) => {
    const evs = cal.items.filter((e) => e.fecha === d.fecha);
    const f = new Date(d.fecha + 'T00:00:00').toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' });
    const m = modal(`<h3 style="text-transform:capitalize">${esc(f)}</h3><div style="margin:12px 0">${evs.length ? evs.map(calItemHTML).join('') : '<p class="muted">Nada anotado este día.</p>'}</div>
      ${puedeAnotar() ? `<button class="btn btn-primary" data-act="cal-nuevo" data-fecha="${d.fecha}" data-cerrar="1">➕ Anotar evento este día</button>` : ''}`);
    m.el.addEventListener('click', (e) => { if (e.target.closest('[data-cerrar]') || e.target.closest('[data-act="cal-borrar"]')) m.close(); });
  };
  ACC['cal-nuevo'] = async (d) => {
    const dest = await aniosDestino();
    const fijo = cal.materiaId;
    const m = modal(`<h3>Anotar en el calendario</h3>
      <div class="form-grid" style="margin-top:12px">
        <div class="field full"><label>Título</label><input type="text" id="evTitulo" maxlength="150" placeholder="Ej: Examen de Matemática"/></div>
        <div class="field"><label>Tipo</label><select id="evTipo">${Object.entries(TIPOS_EV).filter(([k]) => k !== 'aviso').map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></div>
        <div class="field"><label>Fecha</label><input type="date" id="evFecha" value="${esc(d.fecha || hoyISO())}"/></div>
        <div class="field"><label>Hora (opcional)</label><input type="time" id="evHora"/></div>
        ${fijo ? '' : `<div class="field"><label>Para quién</label><select id="evAnio" data-change="ev-anio">${optsAnios(dest.anios, dest.todos)}</select></div>
        <div class="field full"><label>Materia (opcional)</label><select id="evMateria"><option value="">Sin materia</option></select></div>`}
        <div class="field full"><label>Detalle (opcional)</label><textarea id="evDesc" maxlength="2000" placeholder="Temas, aula, qué llevar…"></textarea></div>
        <div class="field full"><button class="btn btn-primary" data-act="cal-guardar">💾 Guardar</button></div>
      </div>`);
    cal.modal = m;
  };
  ACC['ev-anio'] = async (d, el) => {
    const sel = $('#evMateria'); sel.innerHTML = '<option value="">Sin materia</option>';
    if (!el.value) return;
    const r = await api(`/api/anios/${el.value}/materias`);
    if (r.ok) sel.innerHTML += r.data.map((x) => `<option value="${x.id}">${esc(x.nombre)}</option>`).join('');
  };
  ACC['cal-guardar'] = (d, btn) => botonCargando(btn, async () => {
    const titulo = $('#evTitulo').value.trim();
    if (!titulo) return toast('Escribí un título', 'error');
    if (!$('#evFecha').value) return toast('Elegí la fecha', 'error');
    const body = { titulo, tipo: $('#evTipo').value, fecha: $('#evFecha').value, hora: $('#evHora').value || null, descripcion: $('#evDesc').value.trim() };
    if (cal.materiaId) body.materia_id = cal.materiaId;
    else {
      const dest = await aniosDestino();
      body.anio_id = $('#evAnio').value || null; body.materia_id = $('#evMateria').value || null;
      if (!dest.todos && !body.anio_id) return toast('Elegí el año', 'error');
    }
    const r = await api('/api/calendario', { method: 'POST', body });
    if (!r.ok) return toast(r.error, 'error');
    toast('Evento anotado', 'ok'); cal.modal?.close(); calPintar();
  });
  ACC['cal-borrar'] = async (d) => {
    if (!(await confirmar('¿Eliminar este evento del calendario?', 'Eliminar'))) return;
    const r = await api(`/api/calendario/${d.id}`, { method: 'DELETE' });
    if (!r.ok) return toast(r.error, 'error');
    toast('Evento eliminado', 'ok'); calPintar();
  };
  const calendario = {
    init() { $('#panel-calendario').innerHTML = '<div class="card" id="calGeneral"></div>'; },
    load() { calMontar('#calGeneral'); },
  };

  // ═════════════════════════════════════════════════════════════════════════
  // MATERIAS (tipo Classroom): lista de clases → entrar a una materia
  // ═════════════════════════════════════════════════════════════════════════
  let claseId = null, claseData = null, claseTab = 'tablon';
  const colorClase = (id) => 'c' + (Number(id) % 6);

  const materias = {
    init() { $('#panel-materias').innerHTML = '<div id="materiasCont"></div>'; },
    async load() { return claseId ? pintarClase() : pintarListaClases(); },
  };
  async function pintarListaClases() {
    const el = $('#materiasCont'); if (!el) return;
    el.innerHTML = '<p class="muted">Cargando…</p>';
    const r = await api('/api/anios/mis-materias');
    if (!r.ok) return (el.innerHTML = vacio('⚠️', r.error));
    if (!r.data.length) {
      return (el.innerHTML = vacio('📚', U.rol === 'alumno' ? (U.anio ? 'Tu año todavía no tiene materias cargadas.' : 'Todavía no tenés un año asignado. Consultá en secretaría.')
        : U.rol === 'profesor' ? 'Todavía no tenés materias asignadas.' : 'Todavía no hay materias. Creá un año y sus materias en “Años y materias”.'));
    }
    const grupos = {};
    r.data.forEach((m) => (grupos[m.anio] ||= []).push(m));
    el.innerHTML = Object.entries(grupos).map(([anio, ms]) => `
      ${U.rol === 'alumno' ? '' : `<h3 class="anio-titulo">${esc(anio)}</h3>`}
      <div class="clases-grid">${ms.map((m) => `<div class="clase-card" data-act="abrir-materia" data-id="${m.id}">
        <div class="clase-top ${colorClase(m.id)}"><h3>${esc(m.nombre)}</h3><span>${esc(m.anio)}</span></div>
        <div class="clase-pie">👤 ${m.profesor ? esc(m.profesor) : 'Sin profesor asignado'}</div></div>`).join('')}</div>`).join('');
  }
  async function pintarClase() {
    const el = $('#materiasCont'); if (!el) return;
    el.innerHTML = '<p class="muted">Cargando…</p>';
    const r = await api(`/api/anios/materias/${claseId}`);
    if (!r.ok) { claseId = null; toast(r.error, 'error'); return pintarListaClases(); }
    claseData = r.data;
    el.innerHTML = `<div class="clase-banner ${colorClase(claseData.id)}">
        <button class="volver" data-act="volver-materias">← Todas las materias</button>
        <h2>${esc(claseData.nombre)}</h2><div style="opacity:.9">${esc(claseData.anio)} · 👤 ${claseData.profesor ? esc(claseData.profesor) : 'Sin profesor asignado'}</div></div>
      <div class="subtabs">${[['tablon', '📣 Tablón'], ['material', '📁 Material'], ['calendario', '📅 Calendario'], ['personas', '👥 Personas']]
        .map(([k, v]) => `<button class="subtab${k === claseTab ? ' active' : ''}" data-act="clase-tab" data-t="${k}">${v}</button>`).join('')}</div>
      <div id="claseCuerpo"></div>`;
    pintarClaseTab();
  }
  async function pintarClaseTab() {
    const c = $('#claseCuerpo'); if (!c) return;
    $$('.subtab').forEach((b) => b.classList.toggle('active', b.dataset.t === claseTab));
    if (claseTab === 'tablon') return pintarTablon(c);
    if (claseTab === 'material') return pintarMaterial(c);
    if (claseTab === 'calendario') { c.innerHTML = '<div class="card" id="calClase"></div>'; return calMontar('#calClase', claseData.id); }
    c.innerHTML = `<div class="card"><div class="card-title" style="margin-bottom:8px">Profesor</div>
      ${claseData.profesor ? `<div class="persona">${avatar({ nombre: claseData.profesor })} ${esc(claseData.profesor)}</div>` : '<p class="muted">Sin profesor asignado.</p>'}
      <div class="card-title" style="margin:18px 0 8px">Alumnos (${claseData.alumnos.length})</div>
      ${claseData.alumnos.length ? claseData.alumnos.map((a) => `<div class="persona">${avatar(a)} ${esc(a.nombre)}</div>`).join('') : '<p class="muted">Todavía no hay alumnos en este año.</p>'}</div>`;
  }
  async function pintarTablon(c) {
    const puede = claseData.puede_publicar;
    c.innerHTML = (puede ? `<button class="an-nuevo" data-act="cl-nuevo">✏️ Nuevo anuncio</button>
      <div class="card" id="clForm" style="display:none"><div class="card-title" style="margin-bottom:12px">Publicar en la clase</div>
        <div class="form-grid">
          <div class="field"><label>Título</label><input type="text" id="clTitulo" maxlength="150" placeholder="Ej: Trabajo práctico 2"/></div>
          <div class="field"><label>Tipo</label><select id="clTipo"><option value="general">📣 Anuncio</option><option value="tarea">📚 Tarea / actividad</option></select></div>
          <div class="field full"><label>Contenido</label><textarea id="clContenido" placeholder="Escribí la consigna o el anuncio…"></textarea></div>
          <div class="field full"><label>Archivos adjuntos (opcional)</label><input type="file" id="clAdjuntos" multiple/><span class="muted">Hasta 5 archivos · máx. 15 MB cada uno</span></div>
          <label class="check full"><input type="checkbox" id="clConFecha" data-change="cl-fecha"/> 📅 Tiene fecha (entrega, examen…): aparece en el calendario</label>
          <div class="field" id="clFechaBox" style="display:none"><label>Fecha</label><input type="date" id="clFecha"/></div>
          <div class="field" id="clHoraBox" style="display:none"><label>Hora</label><input type="time" id="clHora" value="08:00"/></div>
          <div class="field full"><button class="btn btn-primary" data-act="cl-publicar">📤 Publicar</button></div>
        </div></div>` : '') + '<div id="clStream"></div>';
    cargarStream();
  }
  ACC['cl-nuevo'] = () => { const f = $('#clForm'); f.style.display = f.style.display === 'none' ? '' : 'none'; };
  const chipArchivo = (f) => `<button class="adj-chip" data-act="bajar-archivo" data-id="${f.id}" data-name="${esc(f.nombre)}" title="${esc(f.nombre)}"><span class="adj-ic">${icono(f.nombre)}</span><span class="adj-n">${esc(f.nombre)}</span></button>`;
  async function cargarStream() {
    const r = await api(`/api/avisos?materia_id=${claseId}&limit=100`);
    const s = $('#clStream'); if (!s) return;
    if (!r.ok) return (s.innerHTML = vacio('⚠️', r.error));
    s.innerHTML = r.data.length ? r.data.map((a) => `<div class="an-post" data-act="cl-abrir-anuncio" data-id="${a.id}">
        <div class="an-cab">${avatar({ nombre: a.autor, foto: a.autor_foto })}<div><div class="an-autor">${esc(a.autor)}</div><div class="muted">${esc(fechaCorta(a.fecha))}${a.tipo === 'tarea' ? ' · 📚 Tarea' : ''}</div></div></div>
        <div class="an-cuerpo"><strong>${esc(a.titulo)}</strong><div class="an-txt">${esc(a.contenido)}</div></div>
        ${a.fecha_evento ? `<div class="an-fecha">📅 ${esc(fechaEvento(a.fecha_evento, a.todo_el_dia))}</div>` : ''}
        ${a.archivos.length ? `<div class="an-adj">${a.archivos.map((f) => `<span class="adj-chip"><span class="adj-ic">${icono(f.nombre)}</span><span class="adj-n">${esc(f.nombre)}</span></span>`).join('')}</div>` : ''}
        <div class="an-pie">${a.comentarios ? `💬 ${a.comentarios} comentario${a.comentarios === 1 ? '' : 's'} de clase` : 'Agregar un comentario de clase'}</div></div>`).join('')
      : vacio('📭', 'Todavía no se publicó nada en esta clase');
  }
  async function abrirAnuncio(id) {
    const c = $('#claseCuerpo'); if (!c) return;
    c.innerHTML = '<p class="muted">Cargando…</p>';
    const r = await api(`/api/avisos/${id}`);
    if (!r.ok) { toast(r.error, 'error'); return pintarTablon(c); }
    const a = r.data;
    const puedeBorrar = esAdmin() || a.autor_id === U.id;
    c.innerHTML = `<button class="btn btn-ghost btn-sm" data-act="cl-volver-tablon" style="margin-bottom:12px">← Volver al tablón</button>
      <div class="an-detalle">
        <div class="an-cab">${avatar({ nombre: a.autor, foto: a.autor_foto })}<div><div class="an-autor">${esc(a.autor)}</div><div class="muted">${esc(fechaCorta(a.fecha))}${a.tipo === 'tarea' ? ' · 📚 Tarea' : ''}</div></div>
          ${puedeBorrar && U.rol !== 'alumno' ? `<span class="spacer"></span><button class="btn btn-danger btn-sm" data-act="cl-borrar-anuncio" data-id="${a.id}">🗑 Eliminar</button>` : ''}</div>
        <div class="an-det-cuerpo"><strong>${esc(a.titulo)}:</strong> <span style="white-space:pre-wrap">${esc(a.contenido)}</span></div>
        ${a.fecha_evento ? `<div class="evento" style="margin-top:12px">📅 <strong>${esc(fechaEvento(a.fecha_evento, a.todo_el_dia))}</strong><span class="spacer"></span>
          <a href="${esc(a.gcal_url)}" target="_blank" rel="noopener">➕ Agregar a Google Calendar</a></div>` : ''}
        ${a.archivos.length ? `<h4 class="an-h">Archivos adjuntos</h4><div class="an-adj col">${a.archivos.map(chipArchivo).join('')}</div>` : ''}
        <h4 class="an-h">Comentarios de clase</h4>
        <div id="anComs">${a.lista_comentarios.length ? a.lista_comentarios.map((m) => `<div class="an-com">${avatar({ nombre: m.autor, foto: m.autor_foto })}<div class="spacer"><div><strong>${esc(m.autor)}</strong> <span class="muted">${esc(fechaCorta(m.creado_en))}</span></div><div style="white-space:pre-wrap">${esc(m.contenido)}</div></div>
          ${m.autor_id === U.id || esAdmin() ? `<button class="btn btn-ghost btn-sm" data-act="cl-borrar-com" data-id="${m.id}" data-aviso="${a.id}" title="Borrar comentario">🗑</button>` : ''}</div>`).join('') : '<p class="muted">No hay comentarios</p>'}</div>
        <div class="an-form"><input type="text" id="anComTxt" maxlength="1000" placeholder="Agregar un comentario de clase" data-aviso="${a.id}"/><button class="btn btn-primary" data-act="cl-comentar" data-id="${a.id}" aria-label="Enviar">➤</button></div>
      </div>`;
    $('#anComTxt').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); ACC['cl-comentar']({ id }); } });
  }
  ACC['cl-abrir-anuncio'] = (d) => abrirAnuncio(d.id);
  ACC['cl-volver-tablon'] = () => pintarTablon($('#claseCuerpo'));
  ACC['cl-comentar'] = async (d) => {
    const inp = $('#anComTxt'); const contenido = inp.value.trim(); if (!contenido) return;
    inp.disabled = true;
    const r = await api(`/api/avisos/${d.id}/comentarios`, { method: 'POST', body: { contenido } });
    if (!r.ok) { inp.disabled = false; return toast(r.error, 'error'); }
    abrirAnuncio(d.id);
  };
  ACC['cl-borrar-com'] = async (d) => {
    if (!(await confirmar('¿Borrar este comentario?', 'Borrar'))) return;
    const r = await api(`/api/avisos/comentarios/${d.id}`, { method: 'DELETE' });
    if (!r.ok) return toast(r.error, 'error');
    abrirAnuncio(d.aviso);
  };
  ACC['cl-borrar-anuncio'] = async (d) => {
    if (!(await confirmar('¿Eliminar este anuncio con sus archivos y comentarios?', 'Eliminar'))) return;
    const r = await api(`/api/avisos/${d.id}`, { method: 'DELETE' });
    if (!r.ok) return toast(r.error, 'error');
    toast('Anuncio eliminado', 'ok'); cargados.inicio = false; cargados.avisos = false; pintarTablon($('#claseCuerpo'));
  };
  ACC['cl-fecha'] = () => { const on = $('#clConFecha').checked; $('#clFechaBox').style.display = $('#clHoraBox').style.display = on ? '' : 'none'; };
  ACC['cl-publicar'] = (d, btn) => botonCargando(btn, async () => {
    const titulo = $('#clTitulo').value.trim(), contenido = $('#clContenido').value.trim();
    if (!titulo || !contenido) return toast('Completá título y contenido', 'error');
    const files = [...($('#clAdjuntos').files || [])];
    if (files.length > 5) return toast('Máximo 5 archivos por anuncio', 'error');
    if (files.some((f) => f.size > 15 * 1048576)) return toast('Un archivo supera los 15 MB', 'error');
    const body = { titulo, contenido, tipo: $('#clTipo').value, materia_id: claseId, enviar_calendario: false };
    if ($('#clConFecha').checked) {
      const f = $('#clFecha').value; if (!f) return toast('Elegí la fecha', 'error');
      body.fecha_evento = `${f} ${$('#clHora').value || '08:00'}`;
    }
    const r = await api('/api/avisos', { method: 'POST', body });
    if (!r.ok) return toast(r.error, 'error');
    let fallo = 0;
    for (const f of files) {
      const fd = new FormData();
      fd.append('archivo', f); fd.append('anio_id', claseData.anio_id); fd.append('materia_id', claseId); fd.append('aviso_id', r.data.id);
      const u = await api('/api/archivos', { method: 'POST', body: fd });
      if (!u.ok) { fallo++; toast(`${f.name}: ${u.error}`, 'error'); }
    }
    toast(fallo ? 'Publicado, pero algún archivo no se pudo subir' : 'Publicado', fallo ? 'error' : 'ok'); cargados.inicio = false; cargados.avisos = false;
    pintarTablon($('#claseCuerpo'));
  });
  async function pintarMaterial(c) {
    const puede = claseData.puede_publicar;
    c.innerHTML = (puede ? `<div class="card"><div class="card-title" style="margin-bottom:12px">Subir material</div>
        <div class="form-grid">
          <div class="field"><label>Archivo</label><input type="file" id="clFile"/></div>
          <div class="field"><label>Descripción (opcional)</label><input type="text" id="clDesc" maxlength="200" placeholder="Ej: Guía de ejercicios"/></div>
          <div class="field full"><button class="btn btn-primary" data-act="cl-subir">⬆ Subir</button><span class="muted" style="margin-left:10px">Máx. 15 MB</span></div>
        </div></div>` : '') + '<div class="card"><div id="clArchivos"></div></div>';
    cargarMaterial();
  }
  async function cargarMaterial() {
    const r = await api(`/api/archivos?materia_id=${claseId}`);
    const el = $('#clArchivos'); if (!el) return;
    el.innerHTML = !r.ok ? vacio('⚠️', r.error) : r.data.length ? r.data.map((f) => `<div class="archivo">
        <div class="archivo-icono">${icono(f.nombre_original)}</div>
        <div class="archivo-info"><div class="archivo-nombre" title="${esc(f.nombre_original)}">${esc(f.nombre_original)}</div>
          <div class="muted">${f.descripcion ? esc(f.descripcion) + ' · ' : ''}${bytes(f.tamanio)} · ${esc(f.subido_por_nombre)} · ${fechaCorta(f.creado_en)}</div></div>
        <button class="btn btn-primary btn-sm" data-act="bajar-archivo" data-id="${f.id}" data-name="${esc(f.nombre_original)}">⬇ Descargar</button>
        ${puedePublicar() && (esAdmin() || f.subido_por === U.id) ? `<button class="btn btn-danger btn-sm" data-act="cl-borrar-archivo" data-id="${f.id}">🗑</button>` : ''}
      </div>`).join('') : vacio('📂', 'Todavía no hay material en esta clase');
  }
  ACC['cl-subir'] = (d, btn) => botonCargando(btn, async () => {
    const f = $('#clFile').files[0];
    if (!f) return toast('Elegí un archivo primero', 'error');
    if (f.size > 15 * 1048576) return toast('El archivo supera los 15 MB', 'error');
    const fd = new FormData();
    fd.append('archivo', f); fd.append('anio_id', claseData.anio_id); fd.append('materia_id', claseId);
    fd.append('descripcion', $('#clDesc').value.trim());
    const r = await api('/api/archivos', { method: 'POST', body: fd });
    if (!r.ok) return toast(r.error, 'error');
    toast('Archivo subido', 'ok'); $('#clFile').value = ''; $('#clDesc').value = ''; cargados.archivos = false; cargarMaterial();
  });
  ACC['cl-borrar-archivo'] = async (d) => {
    if (!(await confirmar('¿Eliminar este archivo?', 'Eliminar'))) return;
    const r = await api(`/api/archivos/${d.id}`, { method: 'DELETE' });
    if (!r.ok) return toast(r.error, 'error');
    toast('Archivo eliminado', 'ok'); cargarMaterial();
  };
  ACC['abrir-materia'] = (d) => { claseId = Number(d.id); claseTab = 'tablon'; mostrar('materias'); };
  ACC['volver-materias'] = () => { claseId = null; pintarListaClases(); };
  ACC['clase-tab'] = (d) => { claseTab = d.t; pintarClaseTab(); };


  // ═════════════════════════════════════════════════════════════════════════
  // HORARIOS (grilla semanal por año)
  // ═════════════════════════════════════════════════════════════════════════
  const DIAS = { 1: 'Lunes', 2: 'Martes', 3: 'Miércoles', 4: 'Jueves', 5: 'Viernes', 6: 'Sábado' };
  const horarios = {
    async init() {
      const esAlu = U.rol === 'alumno';
      const a = esAlu ? { ok: true, data: [] } : await api('/api/anios');
      const lista = a.ok ? a.data : [];
      const sel = esAlu ? '' : `<div class="card"><div class="row"><label style="font-weight:600">Ver horario de</label>
          <select id="hoAnio" data-change="ho-cargar" style="max-width:240px">${U.rol === 'profesor' ? '<option value="mios">Mis clases (todos los años)</option>' : ''}${lista.map((x) => `<option value="${x.id}">${esc(x.etiqueta || x.nombre)}</option>`).join('')}</select></div></div>`;
      const form = !esAdmin() ? '' : `<div class="card"><div class="card-header"><div class="card-title">Agregar horario</div></div>
        <div class="form-grid">
          <div class="field"><label>Día</label><select id="hoDia">${Object.entries(DIAS).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></div>
          <div class="field"><label>Materia</label><select id="hoMateria"><option value="">— Otro (escribir título) —</option></select></div>
          <div class="field"><label>Desde</label><input type="time" id="hoDesde" value="08:00"/></div>
          <div class="field"><label>Hasta</label><input type="time" id="hoHasta" value="09:20"/></div>
          <div class="field"><label>Título (si no es una materia)</label><input type="text" id="hoTitulo" maxlength="100" placeholder="Ej: Recreo, Acto, Hora libre"/></div>
          <div class="field"><label>Aula (opcional)</label><input type="text" id="hoAula" maxlength="50" placeholder="Ej: Aula 3, Laboratorio"/></div>
          <div class="field full"><button class="btn btn-primary" data-act="ho-agregar">➕ Agregar al horario</button></div>
        </div></div>`;
      $('#panel-horarios').innerHTML = sel + form + '<div class="card"><div id="hoGrilla"></div></div>';
      if (esAdmin()) ACC['ho-materias']();
    },
    async load() {
      const g = $('#hoGrilla'); if (!g) return;
      const v = $('#hoAnio')?.value;
      if (U.rol !== 'alumno' && !v) return (g.innerHTML = vacio('🏫', esAdmin() ? 'Primero creá un año en “Años y materias”.' : 'Todavía no hay años creados.'));
      if (U.rol === 'alumno' && !U.anio) return (g.innerHTML = vacio('🏫', 'Todavía no tenés un año asignado. Consultá en secretaría.'));
      const r = await api('/api/horarios' + (U.rol === 'alumno' ? '' : v === 'mios' ? '?mios=1' : '?anio_id=' + v));
      if (!r.ok) return (g.innerHTML = vacio('⚠️', r.error));
      if (!r.data.length) return (g.innerHTML = vacio('🕐', esAdmin() ? 'Este año todavía no tiene horarios. Agregalos arriba.' : 'Todavía no hay horarios cargados.'));
      const hoy = new Date().getDay(); // 1 = lunes
      const dias = [1, 2, 3, 4, 5].concat(r.data.some((b) => b.dia === 6) ? [6] : []);
      const conAnio = v === 'mios';
      g.innerHTML = `<div class="hor-grid">${dias.map((d) => {
        const bs = r.data.filter((b) => b.dia === d);
        return `<div class="hor-col${hoy === d ? ' hoy' : ''}"><div class="hor-dia">${DIAS[d]}</div>
          ${bs.length ? bs.map((b) => `<div class="hor-bloque${b.materia_id ? '' : ' libre'}">
            <div class="hor-hora">${esc(b.hora_inicio)} – ${esc(b.hora_fin)}</div>
            <div class="hor-mat">${esc(b.materia || b.titulo || '')}</div>
            <div class="muted">${[conAnio ? b.anio : null, b.profesor, b.aula ? '📍 ' + b.aula : null].filter(Boolean).map(esc).join(' · ')}</div>
            ${esAdmin() ? `<button class="btn btn-danger btn-sm" style="margin-top:6px" data-act="ho-borrar" data-id="${b.id}">🗑</button>` : ''}</div>`).join('') : '<div class="hor-vacio">Sin clases</div>'}</div>`;
      }).join('')}</div>`;
    },
  };
  ACC['ho-cargar'] = () => { horarios.load(); ACC['ho-materias'](); };
  ACC['ho-materias'] = async () => {
    const sel = $('#hoMateria'); const v = $('#hoAnio')?.value;
    if (!sel) return;
    sel.innerHTML = '<option value="">— Otro (escribir título) —</option>';
    if (!v || v === 'mios') return;
    const r = await api(`/api/anios/${v}/materias`);
    if (r.ok) sel.innerHTML += r.data.map((m) => `<option value="${m.id}">${esc(m.nombre)}</option>`).join('');
  };
  ACC['ho-agregar'] = (d, btn) => botonCargando(btn, async () => {
    const anio = $('#hoAnio')?.value;
    if (!anio || anio === 'mios') return toast('Elegí el año', 'error');
    const body = { anio_id: anio, materia_id: $('#hoMateria').value || null, dia: $('#hoDia').value, hora_inicio: $('#hoDesde').value, hora_fin: $('#hoHasta').value, titulo: $('#hoTitulo').value.trim(), aula: $('#hoAula').value.trim() };
    const r = await api('/api/horarios', { method: 'POST', body });
    if (!r.ok) return toast(r.error, 'error');
    toast('Horario agregado', 'ok'); $('#hoTitulo').value = ''; $('#hoAula').value = ''; horarios.load();
  });
  ACC['ho-borrar'] = async (d) => {
    if (!(await confirmar('¿Quitar este horario?', 'Quitar'))) return;
    const r = await api(`/api/horarios/${d.id}`, { method: 'DELETE' });
    if (!r.ok) return toast(r.error, 'error');
    toast('Horario eliminado', 'ok'); horarios.load();
  };

  // ── Actividad (logs) ──
  const logs = {
    async load() {
      const r = await api('/api/logs?limit=100');
      $('#panel-logs').innerHTML = `<div class="card"><div class="card-header"><div class="card-title">📋 Actividad reciente</div><button class="btn btn-ghost btn-sm" data-act="logs-recargar">🔄</button></div>
        ${!r.ok ? vacio('⚠️', r.error) : r.data.length ? `<div class="tabla-wrap"><table><thead><tr><th>Cuándo</th><th>Quién</th><th>Acción</th><th>IP</th></tr></thead><tbody>${r.data.map((l) => `<tr><td>${fechaHora(l.hora)}</td><td>${esc(l.nombre)} ${rolBadge(l.rol)}</td><td>${esc(l.accion)}</td><td class="muted">${esc(l.ip || '')}</td></tr>`).join('')}</tbody></table></div>` : vacio('📭', 'Sin actividad')}</div>`;
    },
  };
  ACC['logs-recargar'] = () => logs.load();

  // ═════════════════════════════════════════════════════════════════════════
  // PERFIL: foto (todos) + Telegram + contraseña
  // ═════════════════════════════════════════════════════════════════════════
  // Reduce la imagen a 256 px y la comprime: queda en ~20 KB y carga rápido en todos lados.
  function reducirImagen(file, max = 256) {
    return new Promise((res, rej) => {
      if (!/^image\/(jpeg|png|webp)$/.test(file.type)) return rej(new Error('Usá una imagen JPG, PNG o WEBP'));
      const img = new Image(), url = URL.createObjectURL(file);
      img.onload = () => {
        const lado = Math.min(img.width, img.height);
        const c = document.createElement('canvas'); c.width = c.height = Math.min(max, lado);
        c.getContext('2d').drawImage(img, (img.width - lado) / 2, (img.height - lado) / 2, lado, lado, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url); res(c.toDataURL('image/jpeg', 0.85));
      };
      img.onerror = () => { URL.revokeObjectURL(url); rej(new Error('No se pudo leer la imagen')); };
      img.src = url;
    });
  }
  let fotoNueva = null;
  function abrirPerfil() {
    fotoNueva = null;
    const staff = ['director', 'secretaria', 'preceptor', 'profesor'].includes(U.rol);
    const m = modal(`
      <div style="text-align:center;margin-bottom:16px"><div id="pfAv" style="display:inline-block">${avatar(U, 'lg')}</div>
        <h3 style="margin-top:10px">${esc(U.nombre)}</h3><div class="muted">${esc(U.email || '')}</div>
        <div style="margin-top:6px">${rolBadge(U.rol)} ${U.anio ? `<span class="badge badge-anio">${esc(U.anio)}</span>` : ''}</div></div>
      <div style="border-top:1px solid var(--borde-suave);padding-top:14px">
        <label style="display:block;margin-bottom:8px">Foto de perfil</label>
        <input type="file" id="pfFile" accept="image/jpeg,image/png,image/webp" style="display:none"/>
        <div class="row"><button class="btn btn-ghost spacer" data-pf="elegir">📷 Elegir foto</button>
          ${U.foto ? '<button class="btn btn-danger" data-pf="quitar">Quitar</button>' : ''}</div>
        <button class="btn btn-primary btn-wide" data-pf="guardar" style="display:none;margin-top:10px">💾 Guardar foto</button>
        <p class="muted" style="margin-top:8px">Si una foto es inapropiada, la dirección puede quitarla.</p></div>
      <div style="border-top:1px solid var(--borde-suave);margin-top:14px;padding-top:14px"><label style="display:block;margin-bottom:8px">Contraseña</label>
        <div class="field"><input type="password" id="pfPassA" placeholder="Contraseña actual" autocomplete="current-password"/></div>
        <div class="field"><input type="password" id="pfPassN" placeholder="Nueva (mín. 8 caracteres)" autocomplete="new-password"/></div>
        <button class="btn btn-ghost btn-wide" data-pf="pass">🔒 Cambiar contraseña</button></div>
      ${staff ? `<div style="border-top:1px solid var(--borde-suave);margin-top:14px;padding-top:14px"><label style="display:block;margin-bottom:6px">Telegram</label>
        ${U.telegram_id ? '<div class="alerta ok" style="margin:0">✅ Tu cuenta está vinculada al bot</div>' : `<p class="muted" style="margin-bottom:8px">Vinculá el bot para publicar avisos y consultar desde Telegram.</p><div id="pfTg"></div><button class="btn btn-ghost btn-wide" data-pf="tg">🔑 Generar código</button>`}</div>` : ''}
      <button class="btn btn-ghost btn-wide" data-act="logout" style="margin-top:16px">🚪 Cerrar sesión</button>`);
    const fi = $('#pfFile', m.el);
    fi.addEventListener('change', async () => {
      if (!fi.files[0]) return;
      try {
        fotoNueva = await reducirImagen(fi.files[0]);
        $('#pfAv', m.el).innerHTML = avatar({ ...U, foto: fotoNueva }, 'lg');
        $('[data-pf=guardar]', m.el).style.display = '';
      } catch (e) { toast(e.message, 'error'); }
    });
    m.el.addEventListener('click', async (e) => {
      const b = e.target.closest('[data-pf]'); if (!b) return;
      const k = b.dataset.pf;
      if (k === 'elegir') fi.click();
      if (k === 'guardar') botonCargando(b, async () => {
        const r = await api('/api/users/foto', { method: 'PUT', body: { foto: fotoNueva } });
        if (!r.ok) return toast(r.error, 'error');
        U.foto = fotoNueva; guardarUser(U); pintarUsuario(); toast('Foto actualizada', 'ok'); m.close();
      });
      if (k === 'quitar') botonCargando(b, async () => {
        const r = await api('/api/users/foto', { method: 'DELETE' });
        if (!r.ok) return toast(r.error, 'error');
        U.foto = null; guardarUser(U); pintarUsuario(); toast('Foto eliminada', 'ok'); m.close();
      });
      if (k === 'pass') botonCargando(b, async () => {
        const a = $('#pfPassA', m.el).value, n = $('#pfPassN', m.el).value;
        if (n.length < 8) return toast('La nueva contraseña debe tener al menos 8 caracteres', 'error');
        const r = await api('/api/users/password', { method: 'PUT', body: { passwordActual: a, passwordNueva: n } });
        if (!r.ok) return toast(r.error, 'error');
        toast('Contraseña actualizada', 'ok'); m.close();
      });
      if (k === 'tg') botonCargando(b, async () => {
        const r = await api('/api/users/telegram-token', { method: 'POST' });
        if (!r.ok) return toast(r.error, 'error');
        $('#pfTg', m.el).innerHTML = `<div style="text-align:center;font-size:1.8rem;font-weight:700;letter-spacing:6px;background:var(--claro);border-radius:10px;padding:12px;margin-bottom:8px">${esc(r.data.token)}</div><p class="muted" style="margin-bottom:8px">Enviale al bot: <strong>/vincular ${esc(r.data.token)}</strong> (vence en 15 min). Después recargá esta página.</p>`;
      });
    });
  }

  // ═════════════════════════════════════════════════════════════════════════
  // CHAT del personal (tiempo real con Socket.IO)
  // ═════════════════════════════════════════════════════════════════════════
  let sock = null, chatCon = null, chatGrupo = null, contactos = [], grupos = [], grupoInfo = null, grupoModal = null;
  const chat = {
    init() {
      $('#panel-chat').innerHTML = `<div class="card" style="padding:0;overflow:hidden"><div class="chat-row">
        <div class="chat-contactos" id="chatContactos"></div>
        <div class="chat-main"><div class="chat-head"><div id="chatHead" class="spacer">Elegí a quién escribirle</div><button class="btn btn-ghost btn-sm" id="chatInfoBtn" data-act="g-info" style="display:none">👥 Grupo</button><button class="btn btn-ghost btn-sm" id="chatBorrarBtn" data-act="chat-sel-abrir" style="display:none">🗑 Borrar mensajes</button></div><div id="chatSelBar" class="sel-bar" style="display:none"></div>
          <div id="chatMensajes"><div class="chat-vacio">💬<br>Seleccioná un contacto o un grupo de la lista</div></div>
          <div class="chat-input"><input type="file" id="chatFile" data-change="chat-archivo" style="display:none"/>
            <button class="btn btn-ghost btn-sm" data-act="chat-adjuntar" title="Adjuntar archivo" disabled id="chatAdj">📎</button>
            <input type="text" id="chatTexto" maxlength="2000" placeholder="Escribí un mensaje…" disabled/>
            <button class="btn btn-primary btn-sm" data-act="chat-enviar" id="chatEnv" disabled>Enviar</button></div></div></div></div>`;
      $('#chatTexto').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); ACC['chat-enviar'](); } });
    },
    async load() { await cargarContactos(); },
  };
  function conectarSocket() {
    if (sock || !token()) return;
    const iniciar = () => {
      if (typeof io === 'undefined') return;
      sock = io(BACK, { auth: { token: token() }, transports: ['websocket', 'polling'] });
      sock.on('nuevo_mensaje', onMensajeVivo);
      sock.on('mensaje_borrado', (m) => { if (chatGrupo === null) $(`[data-mid="${m.id}"]`)?.remove(); });
      sock.on('nuevo_mensaje_grupo', onMensajeGrupoVivo);
      sock.on('mensaje_grupo_borrado', (m) => { if (chatGrupo === m.grupo_id) $(`[data-mid="${m.id}"]`)?.remove(); });
      sock.on('grupo_actualizado', () => { if ($('#panel-chat')?.classList.contains('active')) cargarContactos(); else api('/api/chat/no-leidos').then((r) => r.ok && marcarNoLeido(r.data.total > 0)); });
    };
    if (typeof io !== 'undefined') return iniciar();
    const s = document.createElement('script');
    s.src = BACK + '/socket.io/socket.io.js'; s.onload = iniciar;
    s.onerror = () => console.warn('[Chat] No se pudo cargar socket.io: los mensajes no serán en vivo');
    document.head.appendChild(s);
  }
  async function precargarChat() {
    conectarSocket();
    const r = await api('/api/chat/no-leidos');
    if (r.ok && r.data.total > 0) marcarNoLeido(true);
  }
  const marcarNoLeido = (on) => $$('.chat-tab-dot').forEach((d) => d.classList.toggle('show', on));
  async function cargarContactos() {
    const [r, rg] = await Promise.all([api('/api/chat/contactos'), api('/api/chat/grupos')]);
    const el = $('#chatContactos'); if (!el) return;
    if (r.ok) cacheSet('contactos', r.data);
    if (rg.ok) cacheSet('grupos', rg.data);
    const guardado = !r.ok && r.status === 0 ? cacheGet('contactos') : null;
    if (!r.ok && !guardado) return (el.innerHTML = vacio('⚠️', r.error));
    contactos = r.ok ? r.data : guardado;
    grupos = rg.ok ? rg.data : (cacheGet('grupos') || []);
    // si me sacaron del grupo que tenía abierto
    if (chatGrupo !== null && rg.ok && !grupos.some((g) => g.id === chatGrupo)) {
      chatGrupo = null; grupoInfo = null; resetVistaChat(); toast('Ya no formás parte de ese grupo');
    } else if (chatGrupo !== null) {
      const g = grupos.find((x) => x.id === chatGrupo);
      if (g && $('#chatHead')) $('#chatHead').innerHTML = `<span class="av sm av-grupo">👥</span> ${esc(g.nombre)} <span class="muted">· ${g.miembros} personas</span>`;
    }
    pintarContactos();
    hayNoLeidos();
  }
  const hayNoLeidos = () => marcarNoLeido(contactos.some((c) => c.no_leidos > 0 && c.id !== chatCon) || grupos.some((g) => g.no_leidos > 0 && g.id !== chatGrupo));
  function resetVistaChat() {
    $('#chatHead').textContent = 'Elegí a quién escribirle';
    $('#chatMensajes').innerHTML = '<div class="chat-vacio">💬<br>Seleccioná un contacto o un grupo de la lista</div>';
    ['chatTexto', 'chatEnv', 'chatAdj'].forEach((i) => ($('#' + i).disabled = true));
    $('#chatBorrarBtn').style.display = 'none'; $('#chatInfoBtn').style.display = 'none'; ACC['chat-sel-cerrar']();
  }
  function pintarContactos() {
    const el = $('#chatContactos'); if (!el) return;
    const gHtml = grupos.map((g) => `<div class="contacto ${g.id === chatGrupo ? 'active' : ''}" data-act="chat-abrir-grupo" data-id="${g.id}">
      <span class="av av-grupo">👥</span><div><div class="contacto-nombre">${esc(g.nombre)}</div><div class="contacto-rol">${g.miembros} personas</div></div>
      ${g.no_leidos > 0 ? `<span class="nb">${g.no_leidos}</span>` : ''}</div>`).join('');
    const cHtml = contactos.length ? contactos.map((c) => `<div class="contacto ${c.id === chatCon ? 'active' : ''}" data-act="chat-abrir" data-id="${c.id}">
      ${avatar(c)}<div><div class="contacto-nombre">${esc(c.nombre)}</div><div class="contacto-rol">${esc(c.rol)}</div></div>
      ${c.no_leidos > 0 ? `<span class="nb">${c.no_leidos}</span>` : ''}</div>`).join('') : vacio('👥', 'No hay otros usuarios del personal');
    el.innerHTML = `<div class="contactos-titulo"><span>Grupos</span><button class="btn btn-ghost btn-sm" data-act="g-nuevo" title="Crear un grupo">➕ Nuevo</button></div>
      ${gHtml || '<div class="muted" style="padding:6px 14px 10px;font-size:.78rem">Todavía no tenés grupos.</div>'}
      <div class="contactos-titulo"><span>Personas</span></div>${cHtml}`;
  }
  function msgHTML(m) {
    const mio = m.remitente_id === U.id;
    if (m.sistema) return `<div class="msg-sistema" data-mid="${m.id}">${esc(m.contenido)}</div>`;
    const arch = (m.archivos || []).map((a) => `<button class="msg-archivo" data-act="chat-bajar" data-file="${esc(a.archivo)}" data-name="${esc(a.nombre)}">${icono(a.nombre)} <span>${esc(a.nombre)}<br><span style="opacity:.7">${bytes(a.tamanio)}</span></span> ⬇</button>`).join('');
    const autor = m.grupo_id && !mio ? `<div class="msg-autor">${esc(m.remitente_nombre || '')}</div>` : '';
    return `<div class="msg ${mio ? 'mio' : ''}" data-mid="${m.id}"><input type="checkbox" class="msg-sel" data-change="chat-sel-marcar" data-id="${m.id}" data-mio="${mio ? 1 : 0}" aria-label="Elegir mensaje"/>${autor}${m.contenido ? esc(m.contenido) : ''}${arch}<div class="msg-hora">${fechaHora(m.enviado_en)}<button class="msg-x" data-act="chat-borrar" data-id="${m.id}" data-mio="${mio ? 1 : 0}" title="Borrar mensaje">🗑</button></div></div>`;
  }
  // Mensaje que todavía no salió (sin conexión): reloj, y se puede quitar.
  function msgPendienteHTML(it) {
    return `<div class="msg mio pendiente${it.error ? ' fallo' : ''}" data-mid="p_${it.id}">${esc(it.datos.texto)}<div class="msg-hora">${it.error ? '⚠️ No se pudo enviar: ' + esc(it.error) : '🕐 Sin enviar'}<button class="msg-x" data-act="cola-quitar" data-id="${it.id}" title="Quitar mensaje">🗑</button></div></div>`;
  }
  function pintarMensajes(lista) {
    const box = $('#chatMensajes');
    box.innerHTML = lista.length ? lista.map(msgHTML).join('') : '<div class="chat-vacio">👋<br>Todavía no hay mensajes. ¡Escribí el primero!</div>';
    box.scrollTop = box.scrollHeight;
  }
  function agregarMensaje(m) {
    const box = $('#chatMensajes'); if (!box) return;
    if (box.querySelector(`[data-mid="${m.id}"]`)) return;
    if (box.querySelector('.chat-vacio')) box.innerHTML = '';
    box.insertAdjacentHTML('beforeend', msgHTML(m));
    box.scrollTop = box.scrollHeight;
  }
  function onMensajeVivo(m) {
    const abierto = $('#panel-chat')?.classList.contains('active');
    if (abierto && chatCon === m.remitente_id) {
      agregarMensaje(m);
      api(`/api/chat/leido/${m.remitente_id}`, { method: 'PUT' });
      return;
    }
    marcarNoLeido(true);
    const c = contactos.find((x) => x.id === m.remitente_id);
    if (c) { c.no_leidos = (c.no_leidos || 0) + 1; contactos.sort((a, b) => b.no_leidos - a.no_leidos); pintarContactos(); }
    else if (abierto) cargarContactos();
    toast(`💬 ${m.remitente_nombre}: ${m.contenido || 'te envió un archivo'}`);
  }
  function onMensajeGrupoVivo(m) {
    const abierto = $('#panel-chat')?.classList.contains('active');
    if (abierto && chatGrupo === m.grupo_id) {
      agregarMensaje(m);
      api(`/api/chat/grupos/${m.grupo_id}/leido`, { method: 'PUT' });
      return;
    }
    if (m.sistema) { if (abierto) cargarContactos(); return; }
    marcarNoLeido(true);
    const g = grupos.find((x) => x.id === m.grupo_id);
    if (g) { g.no_leidos = (g.no_leidos || 0) + 1; grupos.sort((a, b) => b.no_leidos - a.no_leidos); pintarContactos(); }
    else if (abierto) cargarContactos();
    toast(`👥 ${m.grupo_nombre || 'Grupo'} · ${m.remitente_nombre}: ${m.contenido}`);
  }
  ACC['chat-abrir'] = async (d) => {
    chatGrupo = null; grupoInfo = null; $('#chatInfoBtn').style.display = 'none';
    chatCon = Number(d.id);
    const c = contactos.find((x) => x.id === chatCon);
    if (c) c.no_leidos = 0;
    pintarContactos();
    $('#chatHead').innerHTML = c ? `${avatar(c, 'sm')} ${esc(c.nombre)} <span class="muted">· ${esc(c.rol)}</span>` : '';
    ['chatTexto', 'chatEnv', 'chatAdj'].forEach((i) => ($('#' + i).disabled = false));
    $('#chatBorrarBtn').style.display = ''; ACC['chat-sel-cerrar']();
    $('#chatMensajes').innerHTML = '<div class="chat-vacio">Cargando…</div>';
    const r = await api(`/api/chat/conversacion/${chatCon}`);
    if (chatCon !== Number(d.id)) return;
    let lista = r.ok ? r.data : null;
    if (r.ok) cacheSet('chat_' + chatCon, lista);
    else if (r.status === 0 && cacheGet('chat_' + chatCon)) { lista = cacheGet('chat_' + chatCon); toast('Sin conexión: se muestra la última conversación guardada'); }
    if (!lista) return ($('#chatMensajes').innerHTML = vacio('⚠️', r.error));
    pintarMensajes(lista);
    const pendientes = getCola().filter((i) => i.tipo === 'chat' && i.datos.para === chatCon);
    if (pendientes.length) {
      const box = $('#chatMensajes'); box.querySelector('.chat-vacio')?.remove();
      box.insertAdjacentHTML('beforeend', pendientes.map(msgPendienteHTML).join('')); box.scrollTop = box.scrollHeight;
    }
    hayNoLeidos();
    $('#chatTexto').focus();
  };
  ACC['chat-abrir-grupo'] = async (d) => {
    chatGrupo = Number(d.id); chatCon = null; grupoInfo = null;
    const g = grupos.find((x) => x.id === chatGrupo);
    if (g) g.no_leidos = 0;
    pintarContactos();
    $('#chatHead').innerHTML = g ? `<span class="av sm av-grupo">👥</span> ${esc(g.nombre)} <span class="muted">· ${g.miembros} personas</span>` : '';
    ['chatTexto', 'chatEnv'].forEach((i) => ($('#' + i).disabled = false));
    $('#chatAdj').disabled = true; // en los grupos solo texto
    $('#chatBorrarBtn').style.display = ''; $('#chatInfoBtn').style.display = ''; ACC['chat-sel-cerrar']();
    $('#chatMensajes').innerHTML = '<div class="chat-vacio">Cargando…</div>';
    const gid = chatGrupo;
    const [r, det] = await Promise.all([api(`/api/chat/grupos/${gid}/mensajes`), api(`/api/chat/grupos/${gid}`)]);
    if (chatGrupo !== gid) return;
    if (det.ok) grupoInfo = det.data;
    let lista = r.ok ? r.data : null;
    if (r.ok) cacheSet('chatg_' + gid, lista);
    else if (r.status === 0 && cacheGet('chatg_' + gid)) { lista = cacheGet('chatg_' + gid); toast('Sin conexión: se muestra la última conversación guardada'); }
    if (!lista) return ($('#chatMensajes').innerHTML = vacio('⚠️', r.error));
    pintarMensajes(lista);
    const pendientes = getCola().filter((i) => i.tipo === 'chatg' && i.datos.grupo === gid);
    if (pendientes.length) {
      const box = $('#chatMensajes'); box.querySelector('.chat-vacio')?.remove();
      box.insertAdjacentHTML('beforeend', pendientes.map(msgPendienteHTML).join('')); box.scrollTop = box.scrollHeight;
    }
    hayNoLeidos();
    $('#chatTexto').focus();
  };
  ACC['chat-enviar'] = () => {
    const inp = $('#chatTexto'), texto = inp.value.trim();
    if (!texto || (!chatCon && !chatGrupo)) return;
    inp.value = ''; inp.focus();
    // Siempre pasa por la cola: se ve enseguida con el reloj y, si hay conexión, sale al instante.
    const it = chatGrupo ? encolar('chatg', { grupo: chatGrupo, texto }) : encolar('chat', { para: chatCon, texto });
    const box = $('#chatMensajes'); box.querySelector('.chat-vacio')?.remove();
    box.insertAdjacentHTML('beforeend', msgPendienteHTML(it)); box.scrollTop = box.scrollHeight;
    procesarCola();
  };
  // ── Apartado "Borrar mensajes": elegir varios, todos los míos o vaciar la conversación ──
  const selIds = () => $$('#chatMensajes .msg-sel:checked').map((c) => c.dataset.id);
  function pintarSelBar() {
    const n = selIds().length, bar = $('#chatSelBar');
    bar.innerHTML = `<span><strong>Modo borrar:</strong> tildá mensajes y elegí “para mí” o “para todos”.</span><span class="spacer"></span>
      <button class="btn btn-ghost btn-sm" data-act="chat-sel-todos">☑ Todos</button>
      <button class="btn btn-danger btn-sm" data-act="chat-sel-borrar" ${n ? '' : 'disabled'}>🗑 Borrar elegidos (${n})</button>
      <button class="btn btn-danger btn-sm" data-act="chat-sel-vaciar">🧹 Vaciar conversación</button>
      <button class="btn btn-ghost btn-sm" data-act="chat-sel-cerrar">Listo</button>`;
  }
  ACC['chat-sel-abrir'] = () => { $('#chatMensajes').classList.add('seleccion'); $('#chatSelBar').style.display = ''; pintarSelBar(); };
  ACC['chat-sel-cerrar'] = () => { $('#chatMensajes')?.classList.remove('seleccion'); $$('#chatMensajes .msg-sel').forEach((c) => (c.checked = false)); const b = $('#chatSelBar'); if (b) b.style.display = 'none'; };
  ACC['chat-sel-marcar'] = () => pintarSelBar();
  ACC['chat-sel-todos'] = () => { const cs = $$('#chatMensajes .msg-sel'); const todos = cs.every((c) => c.checked); cs.forEach((c) => (c.checked = !todos)); pintarSelBar(); };
  function quitarMensajesLocal(ids) {
    const set = new Set(ids.map(String));
    set.forEach((id) => $(`#chatMensajes [data-mid="${id}"]`)?.remove());
    const clave = chatGrupo !== null ? 'chatg_' + chatGrupo : 'chat_' + chatCon; const g = cacheGet(clave); if (g) cacheSet(clave, g.filter((m) => !set.has(String(m.id))));
    if (!$('#chatMensajes .msg, #chatMensajes .msg-sistema')) $('#chatMensajes').innerHTML = '<div class="chat-vacio">👋<br>No hay mensajes en esta conversación.</div>';
  }
  // Pregunta como WhatsApp: "para todos" (si es mío, o soy admin del grupo) o "para mí".
  function preguntarBorrado(titulo, texto, permiteTodos) {
    return new Promise((res) => {
      const m = modal(`<h3>${esc(titulo)}</h3><p class="muted" style="margin:10px 0 16px;font-size:.9rem;color:var(--texto)">${esc(texto)}</p>
        <div style="display:flex;flex-direction:column;gap:8px">
          ${permiteTodos ? '<button class="btn btn-danger" data-m="todos">🗑 Borrar para todos</button>' : ''}
          <button class="btn btn-danger" data-m="mi">🙈 Borrar para mí</button>
          <button class="btn btn-ghost" data-m="no">Cancelar</button></div>
        ${permiteTodos ? '' : '<p class="muted" style="margin-top:10px">“Para todos” solo está disponible para tus propios mensajes.</p>'}`);
      let fin = false;
      const listo = (v) => { if (fin) return; fin = true; m.close(); res(v); };
      m.el.addEventListener('click', (e) => { const b = e.target.closest('[data-m]'); if (b) listo(b.dataset.m === 'no' ? null : b.dataset.m); });
      m.el.parentNode.addEventListener('click', (e) => { if (e.target === m.el.parentNode || e.target.closest('[data-x]')) listo(null); });
    });
  }
  const errBorrar = (r) => toast(r.status === 0 ? 'Sin conexión: no se pudo borrar. Probá cuando vuelva internet.' : r.error, 'error');
  const esAdminGrupo = () => chatGrupo !== null && !!grupoInfo?.soy_admin;
  const urlMsg = (id, modo) => chatGrupo !== null ? `/api/chat/grupos/${chatGrupo}/mensaje/${id}?modo=${modo}` : `/api/chat/mensaje/${id}?modo=${modo}`;
  ACC['chat-borrar'] = async (d) => {
    const modo = await preguntarBorrado('Borrar mensaje', '¿Cómo querés borrarlo?', d.mio === '1' || esAdminGrupo());
    if (!modo) return;
    const r = await api(urlMsg(d.id, modo), { method: 'DELETE' });
    if (!r.ok) return errBorrar(r);
    quitarMensajesLocal([d.id]); toast(modo === 'mi' ? 'Mensaje borrado para vos' : 'Mensaje borrado para todos', 'ok');
  };
  ACC['chat-sel-borrar'] = async () => {
    const ids = selIds(); if (!ids.length) return;
    const todosMios = $$('#chatMensajes .msg-sel:checked').every((c) => c.dataset.mio === '1') || esAdminGrupo();
    const modo = await preguntarBorrado(`Borrar ${ids.length} mensaje/s`, '¿Cómo querés borrarlos?', todosMios);
    if (!modo) return;
    const r = await api(chatGrupo !== null ? `/api/chat/grupos/${chatGrupo}/borrar-varios` : '/api/chat/borrar-varios', { method: 'POST', body: { ids, modo } });
    if (!r.ok) return errBorrar(r);
    quitarMensajesLocal(ids); pintarSelBar(); toast(`${r.data.borrados} mensaje/s borrado/s`, 'ok');
  };
  ACC['chat-sel-vaciar'] = async () => {
    if (!chatCon && !chatGrupo) return;
    const modo = await preguntarBorrado('Vaciar conversación', 'Para mí: se borra toda la conversación de tu cuenta (los demás la siguen viendo). Para todos: se borran tus mensajes para todos.', true);
    if (!modo) return;
    const r = await api(chatGrupo !== null ? `/api/chat/grupos/${chatGrupo}/mensajes?modo=${modo}` : `/api/chat/conversacion/${chatCon}?modo=${modo}`, { method: 'DELETE' });
    if (!r.ok) return errBorrar(r);
    quitarMensajesLocal($$(modo === 'mi' ? '#chatMensajes .msg:not(.pendiente), #chatMensajes .msg-sistema' : '#chatMensajes .msg.mio:not(.pendiente)').map((m) => m.dataset.mid)); pintarSelBar();
    toast(`${r.data.borrados} mensaje/s borrado/s`, 'ok');
  };
  // ── Grupos: crear, ver miembros, renombrar, agregar, quitar, salir, eliminar ──
  const checklistPersonas = (excluir = []) => contactos.filter((c) => !excluir.includes(c.id)).map((c) =>
    `<label class="check" style="padding:5px 0"><input type="checkbox" class="g-chk" value="${c.id}"/> ${esc(c.nombre)} <span class="muted">· ${esc(c.rol)}</span></label>`).join('') || '<p class="muted">No hay más personas para agregar.</p>';
  const chk = () => $$('.g-chk:checked').map((c) => Number(c.value));
  ACC['g-nuevo'] = () => {
    grupoModal?.close();
    grupoModal = modal(`<h3>Nuevo grupo</h3>
      <div class="field" style="margin:12px 0"><label>Nombre del grupo</label><input type="text" id="gNombre" maxlength="80" placeholder="Ej: Equipo de 3ro, Profesores de Programación"/></div>
      <div class="field"><label>Personas</label><div style="max-height:260px;overflow:auto;border:1px solid var(--borde);border-radius:8px;padding:6px 12px">${checklistPersonas()}</div></div>
      <div style="margin-top:14px"><button class="btn btn-primary" data-act="g-crear">✅ Crear grupo</button></div>`);
  };
  ACC['g-crear'] = (d, btn) => botonCargando(btn, async () => {
    const nombre = $('#gNombre').value.trim(), miembros = chk();
    if (!nombre) return toast('Ponele un nombre al grupo', 'error');
    if (!miembros.length) return toast('Elegí al menos una persona', 'error');
    const r = await api('/api/chat/grupos', { method: 'POST', body: { nombre, miembros } });
    if (!r.ok) return toast(r.error, 'error');
    grupoModal?.close(); toast('Grupo creado', 'ok');
    await cargarContactos(); ACC['chat-abrir-grupo']({ id: r.data.id });
  });
  async function abrirInfoGrupo() {
    if (chatGrupo === null) return;
    const r = await api(`/api/chat/grupos/${chatGrupo}`);
    if (!r.ok) return toast(r.error, 'error');
    grupoInfo = r.data;
    const g = grupoInfo;
    grupoModal?.close();
    grupoModal = modal(`<h3>👥 ${esc(g.nombre)}</h3><p class="muted" style="margin:4px 0 12px">${g.miembros.length} personas${g.soy_admin ? ' · sos administrador/a' : ''}</p>
      ${g.soy_admin ? `<div class="row" style="margin-bottom:12px"><input type="text" id="gRenombrar" maxlength="80" value="${esc(g.nombre)}" style="flex:1;min-width:140px"/><button class="btn btn-ghost btn-sm" data-act="g-renombrar">✏️ Renombrar</button></div>` : ''}
      <div style="max-height:260px;overflow:auto">${g.miembros.map((m) => `<div class="persona">${avatar(m)} <div class="spacer"><strong>${esc(m.nombre)}</strong> <span class="muted">· ${esc(m.rol)}${m.es_admin ? ' · admin' : ''}${m.id === U.id ? ' · vos' : ''}</span></div>
        ${g.soy_admin && m.id !== U.id ? `<button class="btn btn-danger btn-sm" data-act="g-quitar" data-uid="${m.id}" data-nombre="${esc(m.nombre)}" title="Quitar del grupo">✕</button>` : ''}</div>`).join('')}</div>
      <div class="row" style="margin-top:14px">${g.soy_admin ? '<button class="btn btn-primary btn-sm" data-act="g-agregar">➕ Agregar personas</button>' : ''}
        <span class="spacer"></span><button class="btn btn-danger btn-sm" data-act="g-salir">🚪 Salir del grupo</button>
        ${g.soy_admin ? '<button class="btn btn-danger btn-sm" data-act="g-eliminar">🗑 Eliminar grupo</button>' : ''}</div>`);
  }
  ACC['g-info'] = () => abrirInfoGrupo();
  ACC['g-renombrar'] = async () => {
    const nombre = $('#gRenombrar').value.trim(); if (!nombre) return toast('Escribí un nombre', 'error');
    const r = await api(`/api/chat/grupos/${chatGrupo}`, { method: 'PUT', body: { nombre } });
    if (!r.ok) return toast(r.error, 'error');
    toast('Grupo renombrado', 'ok'); await cargarContactos(); abrirInfoGrupo();
  };
  ACC['g-agregar'] = () => {
    const ya = (grupoInfo?.miembros || []).map((m) => m.id);
    grupoModal?.close();
    grupoModal = modal(`<h3>Agregar personas</h3><div style="max-height:300px;overflow:auto;border:1px solid var(--borde);border-radius:8px;padding:6px 12px;margin:12px 0">${checklistPersonas(ya)}</div>
      <button class="btn btn-primary" data-act="g-agregar-ok">➕ Agregar</button>`);
  };
  ACC['g-agregar-ok'] = async () => {
    const ids = chk(); if (!ids.length) return toast('Elegí al menos una persona', 'error');
    const r = await api(`/api/chat/grupos/${chatGrupo}/miembros`, { method: 'POST', body: { ids } });
    if (!r.ok) return toast(r.error, 'error');
    toast('Personas agregadas', 'ok'); await cargarContactos(); abrirInfoGrupo();
  };
  ACC['g-quitar'] = async (d) => {
    if (!(await confirmar(`¿Quitar a ${d.nombre} del grupo?`, 'Quitar'))) return;
    const r = await api(`/api/chat/grupos/${chatGrupo}/miembros/${d.uid}`, { method: 'DELETE' });
    if (!r.ok) return toast(r.error, 'error');
    toast('Persona quitada', 'ok'); await cargarContactos(); abrirInfoGrupo();
  };
  ACC['g-salir'] = async () => {
    if (!(await confirmar('¿Salir del grupo? Ya no vas a ver sus mensajes.', 'Salir'))) return;
    const r = await api(`/api/chat/grupos/${chatGrupo}/miembros/${U.id}`, { method: 'DELETE' });
    if (!r.ok) return errBorrar(r);
    grupoModal?.close(); toast('Saliste del grupo', 'ok'); chatGrupo = null; grupoInfo = null; resetVistaChat(); cargarContactos();
  };
  ACC['g-eliminar'] = async () => {
    if (!(await confirmar('¿Eliminar el grupo para todos? Se borran todos sus mensajes y no se puede deshacer.', 'Eliminar'))) return;
    const r = await api(`/api/chat/grupos/${chatGrupo}`, { method: 'DELETE' });
    if (!r.ok) return errBorrar(r);
    grupoModal?.close(); toast('Grupo eliminado', 'ok'); chatGrupo = null; grupoInfo = null; resetVistaChat(); cargarContactos();
  };
  ACC['chat-adjuntar'] = () => $('#chatFile').click();
  ACC['chat-archivo'] = async (d, el) => {
    const f = el.files[0]; el.value = '';
    if (!f || !chatCon) return;
    if (sinRed) return toast('Sin conexión: los archivos se pueden enviar cuando vuelva internet (los mensajes de texto sí quedan guardados).', 'error');
    if (f.size > 10 * 1048576) return toast('El archivo supera los 10 MB del chat', 'error');
    const b64 = await new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(String(fr.result).split(',')[1]); fr.onerror = rej; fr.readAsDataURL(f); });
    toast('Enviando archivo…');
    const r = await api(`/api/chat/archivo/${chatCon}`, { method: 'POST', body: { nombre_original: f.name, mime: f.type || 'application/octet-stream', datos_base64: b64, contenido: $('#chatTexto').value.trim() } });
    if (!r.ok) return toast(r.error, 'error');
    const textoEnviado = $('#chatTexto').value.trim();
    $('#chatTexto').value = '';
    agregarMensaje({ id: r.data.id, remitente_id: U.id, contenido: textoEnviado, enviado_en: new Date().toISOString(), archivos: [r.data.archivo] });
  };
  ACC['chat-bajar'] = (d) => descargar(`/api/chat/archivo/${encodeURIComponent(d.file)}`, d.name);

  // ═════════════════════════════════════════════════════════════════
  // EGRESADOS / EX ALUMNOS (director / secretaría)
  // ═════════════════════════════════════════════════════════════════
  let egrCache = [], egrProm = [];
  const egresados = {
    async init() {
      $('#panel-egresados').innerHTML = `<div class="card"><div class="card-header"><div class="card-title">🎓 Egresados y ex alumnos</div></div>
        <p class="muted">Quienes terminaron o dejaron la escuela conservan su cuenta. Desde acá podés reincorporarlos a un año.</p>
        <div class="filtros" style="margin:12px 0"><input type="text" id="egBuscar" data-input="eg-filtrar" placeholder="Buscar por nombre o email…"/>
          <select id="egProm" data-change="eg-filtrar"><option value="">Todas las promociones</option></select>
          <select id="egTipo" data-change="eg-filtrar"><option value="">Egresados y ex alumnos</option><option value="egresado">Solo egresados</option><option value="ex_alumno">Solo ex alumnos</option></select></div>
        <div class="tabla-wrap"><table class="tabla"><thead><tr><th>Persona</th><th>Situación</th><th>Desde</th><th></th></tr></thead><tbody id="tablaEgr"></tbody></table></div></div>`;
    },
    async load() {
      const [r, pr] = await Promise.all([api('/api/users?rol=alumno&situacion=no_regular'), api('/api/anios?incluir_promociones=1')]);
      if (!r.ok) return toast(r.error, 'error');
      egrCache = r.data; egrProm = pr.ok ? pr.data : [];
      const sel = $('#egProm'), cur = sel.value;
      sel.innerHTML = '<option value="">Todas las promociones</option>' + egrProm.filter((a) => a.tipo === 'promocion').map((a) => `<option value="${a.id}">${esc(a.nombre)}</option>`).join('');
      sel.value = cur; pintarEgr();
    },
  };
  function pintarEgr() {
    const q = ($('#egBuscar').value || '').toLowerCase(), pr = $('#egProm').value, t = $('#egTipo').value;
    const lista = egrCache.filter((u) => (!t || u.situacion === t) && (!pr || String(u.anio_id) === pr) && (!q || u.nombre.toLowerCase().includes(q) || u.email.toLowerCase().includes(q)));
    $('#tablaEgr').innerHTML = lista.length ? lista.map((u) => `<tr>
      <td><div class="persona">${avatar(u)}<div><div style="font-weight:600">${esc(u.nombre)}</div><div class="muted">${esc(u.email)}</div></div></div></td>
      <td>${u.situacion === 'egresado' ? `<span class="badge badge-ok">🎓 ${esc(u.anio || 'Egresado')}</span>` : '<span class="badge badge-gris">🚪 Ex alumno</span>'}</td>
      <td>${fechaCorta(u.egresado_en) || '—'}</td>
      <td><button class="btn btn-ghost btn-sm" data-act="eg-reincorporar" data-id="${u.id}" data-nombre="${esc(u.nombre)}">↩️ Reincorporar</button></td></tr>`).join('')
      : `<tr><td colspan="4">${vacio('🎓', 'Todavía no hay egresados ni ex alumnos')}</td></tr>`;
  }
  ACC['eg-filtrar'] = pintarEgr;
  ACC['eg-reincorporar'] = async (d) => {
    const r = await api('/api/anios');
    if (!r.ok || !r.data.length) return toast('No hay años creados', 'error');
    const m = modal(`<h3>Reincorporar a ${esc(d.nombre)}</h3><p class="muted" style="margin:6px 0 12px">Vuelve a ser alumno regular del año que elijas.</p>
      <div class="field"><label>Año</label><select id="egAnio">${r.data.map((a) => `<option value="${a.id}">${esc(a.etiqueta || a.nombre)}</option>`).join('')}</select></div>
      <div style="margin-top:14px"><button class="btn btn-primary" data-act="eg-reincorporar-ok" data-id="${d.id}">Reincorporar</button></div>`);
    ACC._m = m;
  };
  ACC['eg-reincorporar-ok'] = (d, btn) => botonCargando(btn, async () => {
    const r = await api(`/api/users/${d.id}/anio`, { method: 'PUT', body: { anio_id: $('#egAnio').value } });
    if (!r.ok) return toast(r.error, 'error');
    ACC._m?.close(); toast('Reincorporado/a', 'ok'); cargados.usuarios = false; egresados.load();
  });

  const MODULOS = { inicio, materias, calendario, horarios, avisos, archivos, usuarios, pendientes, asistencia, anios, egresados, logs, chat };
})();
