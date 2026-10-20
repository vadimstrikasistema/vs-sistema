// Service worker: guarda la app en el equipo para que abra sin señal.
// Los datos no pasan por aquí: los maneja la caché de Firestore.
// Al publicar una versión nueva, cambia VERSION para que los equipos la descarguen.
const VERSION = 'vs-1.0.0';

const ARCHIVOS = [
  './',
  'index.html',
  'manifest.webmanifest',
  'css/app.css?v=1.0.0',
  'js/app.js?v=1.0.0',
  'js/config.js',
  'js/firebase.js',
  'js/datos.js',
  'js/datos-iniciales.js',
  'js/ui.js',
  'js/iconos.js',
  'js/modulos/inicio.js',
  'js/modulos/configuracion.js',
  'js/modulos/pendiente.js',
  'js/modulos/produccion.js',
  'js/modulos/inventario.js',
  'js/stock.js',
  'js/comunes.js',
  'js/xml-sii.js',
  'js/gastos-core.js',
  'js/modulos/gastos.js',
  'js/piezas-core.js',
  'js/modulos/produccion-piezas.js',
  'js/cobranza-core.js',
  'js/pdf.js',
  'js/vendor/jspdf.umd.min.js',
  'js/modulos/ventas.js',
  'js/modulos/cobranza.js',
  'js/ventas-core.js',
  'js/modulos/venta-rapida.js',
  'js/b2b-core.js',
  'js/favorito-sii.js',
  'js/modulos/ventas-b2b.js',
  'js/encargos-core.js',
  'js/agenda-core.js',
  'js/modulos/encargos.js',
  'js/modulos/agenda.js',
  'js/recurrentes-core.js',
  'js/modulos/recurrentes.js',
  'js/clases-core.js',
  'js/modulos/clases.js',
  'js/modulos/modo-feria.js',
  'img/logo-negro.svg',
  'img/moteado.svg',
  'img/icono.svg',
  'img/icono-192.png',
  'fonts/instrument-sans-400.woff2',
  'fonts/instrument-sans-500.woff2',
  'fonts/instrument-sans-600.woff2'
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(ARCHIVOS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((ks) => Promise.all(ks.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // SDK de Firebase: se guarda la primera vez que se descarga (versión fija en la URL).
  if (url.hostname === 'www.gstatic.com' && url.pathname.startsWith('/firebasejs/')) {
    e.respondWith(
      caches.match(req).then((hit) => hit || fetch(req).then((res) => {
        const copia = res.clone();
        caches.open(VERSION).then((c) => c.put(req, copia));
        return res;
      }))
    );
    return;
  }

  if (url.origin !== location.origin) return;

  // Archivos propios: primero la red (para tener siempre lo último); si no hay
  // señal o la red tarda más de 4 segundos (feria con señal débil), lo guardado.
  const conLimite = Promise.race([
    fetch(req),
    new Promise((_, rechazar) => setTimeout(() => rechazar(new Error('lento')), 4000))
  ]);
  e.respondWith(
    conLimite
      .then((res) => {
        if (res.ok) {
          const copia = res.clone();
          caches.open(VERSION).then((c) => c.put(req, copia));
        }
        return res;
      })
      .catch(() => caches.match(req, { ignoreSearch: false }).then((hit) => hit || caches.match('index.html')))
  );
});
