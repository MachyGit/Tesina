// ── Verificar sesión ──
function getUser() {
  const user = localStorage.getItem('user');
  if (!user) { window.location.href = '/login.html'; return null; }
  return JSON.parse(user);
}

function getToken() { return localStorage.getItem('token'); }

function logout() {
  fetch('/api/auth/logout', {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + getToken() }
  }).finally(() => {
    localStorage.clear();
    window.location.href = '/login.html';
  });
}

// ── Fetch con token ──
async function apiFetch(url, opts = {}) {
  const res = await fetch(url, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + getToken(),
      ...(opts.headers || {})
    }
  });
  if (res.status === 403) { localStorage.clear(); window.location.href = '/login.html'; }
  return res.json();
}

// ── Formatear fecha ──
function formatFecha(f) {
  return new Date(f).toLocaleDateString('es-AR', {
    day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit'
  });
}
