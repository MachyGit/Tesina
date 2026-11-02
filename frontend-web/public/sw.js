// © 2026 Pito, Santiago Vigna y Santiago Machado — Campus Virtual PROA. Todos los derechos reservados (ver LICENSE).
// sw.js — permite abrir el campus aunque no haya internet (usa la última versión guardada).
// Solo guarda archivos estáticos (páginas, JS, CSS). Los datos de la API NUNCA se guardan acá.
const CACHE = 'campus-shell-v1';
const BASE = ['/login.html', '/theme.js', '/dashboard/campus.css', '/dashboard/app.js',
  '/dashboard/director.html', '/dashboard/secretaria.html', '/dashboard/preceptor.html',
  '/dashboard/profesor.html', '/dashboard/alumno.html'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => Promise.all(BASE.map((u) => c.add(u).catch(() => {})))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin) return;
  if (url.pathname.startsWith('/api') || url.pathname.startsWith('/socket.io')) return;
  e.respondWith(
    fetch(req).then((res) => {
      if (res.ok) { const copia = res.clone(); caches.open(CACHE).then((c) => c.put(req, copia)); }
      return res;
    }).catch(() => caches.match(req, { ignoreSearch: true }).then((r) => r || (req.mode === 'navigate' ? caches.match('/login.html') : Response.error())))
  );
});
