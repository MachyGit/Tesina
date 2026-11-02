// © 2026 Pito, Santiago Vigna y Santiago Machado — Campus Virtual PROA. Todos los derechos reservados (ver LICENSE).
// theme.js — Modo claro / oscuro / según el sistema, compartido por toda la plataforma.
// Se carga en <head>, sin defer/async, para aplicar el tema ANTES de pintar la página
// (así no se ve un flash blanco al entrar en modo oscuro).
(function () {
  const KEY = 'campus_theme'; // valores guardados: 'light' | 'dark' | 'system'

  function esSistemaOscuro() {
    return !!(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
  }

  function getTema() {
    return localStorage.getItem(KEY) || 'system';
  }

  function aplicarTema(modo) {
    const real = modo === 'system' ? (esSistemaOscuro() ? 'dark' : 'light') : modo;
    document.documentElement.setAttribute('data-theme', real);
  }

  function setTema(modo) {
    localStorage.setItem(KEY, modo);
    aplicarTema(modo);
    document.dispatchEvent(new CustomEvent('campusTemaCambiado', { detail: modo }));
  }

  // Aplicar de una, antes de que el navegador pinte el body.
  aplicarTema(getTema());

  // Si está en "según el sistema", seguir los cambios de modo claro/oscuro del SO en vivo.
  if (window.matchMedia) {
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
      if (getTema() === 'system') aplicarTema('system');
    });
  }

  function marcarActivo(caja) {
    const actual = getTema();
    caja.querySelectorAll('[data-theme-btn]').forEach((b) => {
      b.classList.toggle('active', b.dataset.themeBtn === actual);
    });
  }

  // Conecta cualquier ".theme-toggle" que haya en la página con los botones
  // data-theme-btn="light|dark|system".
  function inicializarToggles() {
    document.querySelectorAll('.theme-toggle').forEach((caja) => {
      caja.querySelectorAll('[data-theme-btn]').forEach((btn) => {
        btn.addEventListener('click', () => setTema(btn.dataset.themeBtn));
      });
      marcarActivo(caja);
    });
  }

  document.addEventListener('DOMContentLoaded', inicializarToggles);
  document.addEventListener('campusTemaCambiado', () => {
    document.querySelectorAll('.theme-toggle').forEach(marcarActivo);
  });

  // Por si algún script de la página necesita leer/forzar el tema.
  window.CampusTheme = { get: getTema, set: setTema };
})();
