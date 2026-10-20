// Service worker: guarda la app en el equipo para que abra sin señal.
// Los datos no pasan por aquí: los maneja la caché de Firestore.
// Al publicar una versión nueva, cambia VERSION para que los equipos la descarguen.
const VERSION = 'vs-0.1.1';

const ARCHIVOS = [
  './',
  'index.html',
  'manifest.webmanifest',
  'css/app.css?v=0.1.1',
  'js/app.js?v=0.1.1',
  'js/config.js',
  'js/firebase.js',
  'js/datos.js',
  'js/datos-iniciales.js',
  'js/ui.js',
  'js/iconos.js',
  'js/modulos/inicio.js',
  'js/modulos/configuracion.js',
  'js/modulos/pendiente.js',
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
