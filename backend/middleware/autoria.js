// © 2026 Pito, Santiago Vigna y Santiago Machado — Campus Virtual PROA. Todos los derechos reservados (ver LICENSE).
// © Campus Virtual PROA — ver LICENSE.
// La firma de autoría se agrega DESDE EL SERVIDOR a cada página y a cada respuesta,
// así que borrarla de los archivos HTML/JS del frontend no la saca.
const fs = require('fs');
const path = require('path');
const A = require('../config/autoria');

const PUBLIC = path.join(__dirname, '../../frontend-web/public');
const esc = (t) => String(t).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

// Script que dibuja la firma y la vuelve a poner si alguien la borra o la esconde.
const firmaJS = () => `/* ${A.TEXTO} [${A.corta}] */
(function(){
  var T=${JSON.stringify(A.TEXTO)}, ID='firma-autoria';
  function css(){return 'position:fixed!important;left:10px!important;bottom:6px!important;z-index:2147483000!important;display:block!important;visibility:visible!important;opacity:.75!important;font:11px/1.3 system-ui,sans-serif!important;color:#6b7280!important;background:rgba(255,255,255,.85)!important;padding:2px 8px!important;border-radius:10px!important;pointer-events:none!important;max-width:92vw!important;white-space:nowrap!important;overflow:hidden!important;text-overflow:ellipsis!important;transform:none!important;clip:auto!important;height:auto!important;width:auto!important;margin:0!important;';}
  function poner(){
    var e=document.getElementById(ID);
    if(!e){e=document.createElement('div');e.id=ID;(document.body||document.documentElement).appendChild(e);}
    if(e.textContent!==T)e.textContent=T;
    if(e.getAttribute('style')!==css())e.setAttribute('style',css());
    if(e.parentNode!==document.body&&document.body)document.body.appendChild(e);
  }
  function iniciar(){poner();new MutationObserver(poner).observe(document.documentElement,{childList:true,subtree:true,attributes:true,characterData:true});setInterval(poner,2000);}
  if(document.body)iniciar();else document.addEventListener('DOMContentLoaded',iniciar);
  try{console.log('%c'+T,'color:#1a3a6b;font-weight:bold');}catch(e){}
})();`;

const inyectar = (html) => {
  const metas = `<meta name="author" content="${esc(A.AUTORES.join(', '))}"/><meta name="generator" content="${esc(A.PROYECTO)} ${A.corta}"/><meta name="copyright" content="${esc(A.TEXTO)}"/>`;
  html = html.includes('name="copyright"') ? html : html.replace(/<head[^>]*>/i, (m) => `${m}${metas}`);
  html = html.replace(/<\/body>/i, `<!-- ${esc(A.TEXTO)} [${A.corta}] --><script src="/firma.js"></script></body>`);
  return html;
};

module.exports = (app) => {
  // Encabezado en TODAS las respuestas.
  app.use((_req, res, next) => { res.setHeader('X-Autoria', `${A.PROYECTO} - ${A.AUTORES.join(', ')} [${A.corta}]`); next(); });
  app.get('/firma.js', (_req, res) => { res.type('application/javascript').set('Cache-Control', 'no-cache').send(firmaJS()); });
  // Páginas HTML: se leen, se les agrega la firma y se envían.
  app.get(/(^\/$|\.html$)/, (req, res, next) => {
    let rel = req.path === '/' ? '/index.html' : decodeURIComponent(req.path);
    const abs = path.normalize(path.join(PUBLIC, rel));
    if (!abs.startsWith(PUBLIC) || !fs.existsSync(abs)) return next();
    res.type('html').set('Cache-Control', 'no-cache').send(inyectar(fs.readFileSync(abs, 'utf8')));
  });
};
