// Arranque de la app: inicio de sesión, estructura de pantallas y navegación.
import { CORREOS_PERMITIDOS, APP_VERSION } from './config.js';
import { esc, $, $$, toast } from './ui.js';
import { ICONOS } from './iconos.js';
import { crearPendiente } from './modulos/pendiente.js';

const raiz = document.getElementById('app');

// ---------------------------------------------------------------- Módulos
const MODULOS = [
  { clave: 'inicio', titulo: 'Inicio', carga: () => import('./modulos/inicio.js') },
  { clave: 'agenda', titulo: 'Agenda', pendiente: {
    fase: 4, resumen: 'Todo lo que tiene fecha en el taller, en un solo calendario.',
    puntos: ['Quemas programadas y qué lotes llevan', 'Ferias con días, horario y costo del puesto', 'Clases y talleres con sus sesiones', 'Entregas de encargos y compromisos de pago', 'Copia opcional a Google Calendar']
  } },
  { clave: 'ventas', titulo: 'Ventas', pendiente: {
    fase: 3, resumen: 'Venta directa, ferias y ventas a empresas, hasta dejar la factura lista para el SII.',
    puntos: ['Venta rápida con canal y medio de pago, también sin señal', 'Ferias: ventas por día y por hora, resultado del puesto', 'Consignaciones: entrega, liquidación, lo no vendido sigue en el local o vuelve a bodega', 'Órdenes de venta con PDF y WhatsApp', 'Por facturar y favorito que rellena el facturador gratuito del SII con referencia a la orden', 'Clientes empresa y clientes finales, encargos con abono']
  } },
  { clave: 'cobranza', titulo: 'Cobranza', pendiente: {
    fase: 3, resumen: 'Qué se debe, quién lo debe y desde cuándo.',
    puntos: ['Folios pendientes por cliente con días de atraso', 'Recordatorios por WhatsApp en tono amable o firme', 'Estado de cuenta en PDF', 'Pagos parciales y un pago para varias facturas']
  } },
  { clave: 'produccion', titulo: 'Producción', pendiente: {
    fase: 2, resumen: 'Recetas, quemas y lotes que avanzan por etapas, con el costo real de cada pieza.',
    puntos: ['Insumos y materias primas con unidad y formato de compra', 'Recetas de esmaltes, engobes y pastas', 'Fichas de pieza: pasta, esmalte, horas y espacio en el horno', 'Lotes por etapa: modelado, secado, bizcocho, esmaltado, quema de esmalte', 'Mermas con motivo y piezas de segunda', 'Quemas con energía usada y su costo repartido']
  } },
  { clave: 'inventario', titulo: 'Inventario', pendiente: {
    fase: 2, resumen: 'Piezas terminadas, en proceso y en consignación, y materiales en bodega.',
    puntos: ['Stock de piezas por ubicación: bodega o local de cada cliente', 'Piezas en proceso por etapa', 'Insumos y materias primas en bodega', 'Inventario inicial y ajustes con motivo, sin crear gastos', 'Conteo físico que genera los ajustes de una vez']
  } },
  { clave: 'gastos', titulo: 'Gastos', pendiente: {
    fase: 2, resumen: 'Compras y gastos, a mano o desde el XML del SII. Las compras de insumos suman stock solas.',
    puntos: ['Carga de XML de facturas de compra, en lote', 'Ingreso a mano con RUT y folio, y gastos sin documento', 'Cada línea como insumo (suma stock) o gasto general', 'El sistema aprende qué insumo es cada producto de cada proveedor', 'Detección de facturas duplicadas y alertas de precio', 'Por pagar, cuentas recurrentes y análisis por área']
  } },
  { clave: 'configuracion', titulo: 'Configuración', carga: () => import('./modulos/configuracion.js') }
];
const EN_BARRA_MOVIL = ['inicio', 'ventas', 'produccion', 'inventario'];

// ---------------------------------------------------------------- Login
function pantallaLogin(mensaje = '') {
  document.body.classList.add('modo-login');
  raiz.innerHTML = `
    <main class="login">
      <div class="login-moteado" aria-hidden="true"></div>
      <form class="login-caja" id="form-login" novalidate>
        <img src="img/logo-negro.svg" alt="Vadim Strika" class="login-logo" width="88" height="102">
        <h1>Sistema del taller</h1>
        ${mensaje ? `<p class="aviso" role="alert">${esc(mensaje)}</p>` : ''}
        <label class="campo">
          <span class="campo-etiqueta">Correo</span>
          <input name="correo" type="email" autocomplete="username" required>
        </label>
        <label class="campo">
          <span class="campo-etiqueta">Contraseña</span>
          <input name="clave" type="password" autocomplete="current-password" required>
        </label>
        <button class="btn btn-primario btn-bloque" type="submit">Entrar</button>
        <button class="btn-enlace" type="button" id="olvide">Olvidé mi contraseña</button>
        <p class="login-version">v${APP_VERSION}</p>
      </form>
    </main>`;

  const f = $('#form-login');
  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    const correo = f.correo.value.trim().toLowerCase();
    const clave = f.clave.value;
    if (!correo || !clave) { mostrarErrorLogin('Escribe tu correo y tu contraseña.'); return; }
    const btn = f.querySelector('[type="submit"]');
    btn.disabled = true; btn.textContent = 'Entrando…';
    try {
      const fb = await import('./firebase.js');
      await fb.signInWithEmailAndPassword(fb.auth, correo, clave);
    } catch (err) {
      mostrarErrorLogin(mensajeAuth(err));
      btn.disabled = false; btn.textContent = 'Entrar';
    }
  });

  $('#olvide').addEventListener('click', async () => {
    const correo = f.correo.value.trim().toLowerCase();
    if (!correo) { mostrarErrorLogin('Escribe tu correo arriba y vuelve a pulsar «Olvidé mi contraseña».'); f.correo.focus(); return; }
    try {
      const fb = await import('./firebase.js');
      await fb.sendPasswordResetEmail(fb.auth, correo);
      mostrarErrorLogin(`Si ${correo} tiene cuenta, le llegará un correo para crear una contraseña nueva. Revisa también la carpeta de spam.`, 'ok');
    } catch (err) {
      mostrarErrorLogin(mensajeAuth(err));
    }
  });
}

function mostrarErrorLogin(texto, tipo = 'error') {
  let p = $('.login-caja .aviso');
  if (!p) {
    p = document.createElement('p');
    p.setAttribute('role', 'alert');
    $('.login-caja h1').after(p);
  }
  p.className = `aviso ${tipo === 'ok' ? 'aviso-ok' : ''}`;
  p.textContent = texto;
}

function mensajeAuth(err) {
  const c = err?.code || '';
  if (['auth/invalid-credential', 'auth/wrong-password', 'auth/user-not-found', 'auth/invalid-login-credentials'].includes(c)) return 'Correo o contraseña incorrectos.';
  if (c === 'auth/invalid-email') return 'El correo no tiene un formato válido.';
  if (c === 'auth/too-many-requests') return 'Demasiados intentos. Espera unos minutos o cambia la contraseña con «Olvidé mi contraseña».';
  if (c === 'auth/network-request-failed') return 'Sin conexión. Para entrar la primera vez en este equipo se necesita internet.';
  if (c === 'auth/user-disabled') return 'Esta cuenta está desactivada.';
  return 'No se pudo entrar. Intenta de nuevo.';
}

// ---------------------------------------------------------------- Estructura
function pantallaApp(usuario) {
  document.body.classList.remove('modo-login');
  const enlace = (m) => `<a href="#/${m.clave}" class="nav-item" data-clave="${m.clave}">${ICONOS[m.clave]}<span>${m.titulo}</span></a>`;
  raiz.innerHTML = `
    <div class="marco">
      <aside class="lateral" aria-label="Menú principal">
        <a href="#/inicio" class="lateral-marca">
          <img src="img/logo-negro.svg" alt="" width="34" height="40">
          <span>Vadim Strika</span>
        </a>
        <nav class="lateral-nav">${MODULOS.map(enlace).join('')}</nav>
        <div class="lateral-pie">
          <span class="conexion" data-conexion></span>
          <span class="lateral-usuario" title="${esc(usuario.email)}">${esc(usuario.email)}</span>
        </div>
      </aside>

      <header class="barra-superior">
        <a href="#/inicio" class="barra-marca"><img src="img/logo-negro.svg" alt="Vadim Strika" width="26" height="30"></a>
        <span class="barra-titulo" id="titulo-movil"></span>
        <span class="conexion" data-conexion></span>
      </header>

      <main class="contenido" id="contenido" tabindex="-1"></main>

      <nav class="barra-inferior" aria-label="Menú">
        ${MODULOS.filter((m) => EN_BARRA_MOVIL.includes(m.clave)).map(enlace).join('')}
        <button class="nav-item" id="btn-mas" aria-haspopup="true" aria-expanded="false">${ICONOS.mas}<span>Más</span></button>
      </nav>

      <div class="hoja" id="hoja-mas" hidden>
        <div class="hoja-fondo" data-cerrar></div>
        <div class="hoja-panel" role="menu">
          ${MODULOS.filter((m) => !EN_BARRA_MOVIL.includes(m.clave)).map((m) => `<a href="#/${m.clave}" class="hoja-item" role="menuitem" data-cerrar>${ICONOS[m.clave]}<span>${m.titulo}</span></a>`).join('')}
          <button class="hoja-item" role="menuitem" id="hoja-salir">${ICONOS.salir}<span>Cerrar sesión</span></button>
        </div>
      </div>
    </div>`;

  const hoja = $('#hoja-mas');
  const btnMas = $('#btn-mas');
  const cerrarHoja = () => { hoja.hidden = true; btnMas.setAttribute('aria-expanded', 'false'); };
  btnMas.addEventListener('click', () => {
    hoja.hidden = !hoja.hidden;
    btnMas.setAttribute('aria-expanded', String(!hoja.hidden));
  });
  $$('[data-cerrar]', hoja).forEach((x) => x.addEventListener('click', cerrarHoja));
  $('#hoja-salir').addEventListener('click', () => { cerrarHoja(); window.dispatchEvent(new Event('vs:salir')); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') cerrarHoja(); });

  pintarConexion();
}

function pintarConexion() {
  const en = navigator.onLine;
  $$('[data-conexion]').forEach((c) => {
    c.className = `conexion ${en ? 'en-linea' : 'sin-linea'}`;
    c.innerHTML = `${en ? ICONOS.nube : ICONOS.nubeTachada}<span>${en ? 'En línea' : 'Sin señal'}</span>`;
    c.title = en ? 'Conectado: los cambios se guardan en la nube.' : 'Sin señal: los cambios quedan en este equipo y se sincronizan al volver la conexión.';
  });
}
window.addEventListener('online', () => { pintarConexion(); toast('Conexión recuperada. Sincronizando cambios.'); });
window.addEventListener('offline', () => { pintarConexion(); toast('Sin señal. Puedes seguir trabajando; los cambios se guardan en este equipo.', 'aviso'); });

// ---------------------------------------------------------------- Rutas
let limpiarModulo = null;
let rutaToken = 0;

async function navegar() {
  const contenido = $('#contenido');
  if (!contenido) return;
  const [clave = 'inicio', sub = ''] = location.hash.replace(/^#\/?/, '').split('/');
  const mod = MODULOS.find((m) => m.clave === clave) || MODULOS[0];
  const token = ++rutaToken;

  if (typeof limpiarModulo === 'function') limpiarModulo();
  limpiarModulo = null;

  $$('.nav-item[data-clave]').forEach((a) => {
    const activo = a.dataset.clave === mod.clave;
    a.classList.toggle('activo', activo);
    activo ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current');
  });
  const enMas = !EN_BARRA_MOVIL.includes(mod.clave);
  $('#btn-mas')?.classList.toggle('activo', enMas);
  $('#titulo-movil').textContent = mod.titulo;
  document.title = `${mod.titulo} · Vadim Strika`;

  let impl;
  if (mod.pendiente) {
    impl = crearPendiente({ titulo: mod.titulo, ...mod.pendiente });
  } else {
    impl = (await mod.carga()).default;
  }
  if (token !== rutaToken) return;
  contenido.innerHTML = '';
  limpiarModulo = impl.render(contenido, { sub }) || null;
  contenido.focus({ preventScroll: true });
  window.scrollTo(0, 0);
}
window.addEventListener('hashchange', navegar);

// ---------------------------------------------------------------- Arranque
function pantallaCarga(texto = 'Abriendo…') {
  raiz.innerHTML = `<div class="cargando"><img src="img/logo-negro.svg" alt="" width="56" height="65"><p>${esc(texto)}</p></div>`;
}

async function arrancar() {
  pantallaCarga();
  let fb;
  try {
    fb = await import('./firebase.js');
  } catch (e) {
    console.error(e);
    raiz.innerHTML = `<div class="cargando"><img src="img/logo-negro.svg" alt="" width="56" height="65">
      <p>No se pudo cargar la app. Si es la primera vez en este equipo, se necesita internet.</p>
      <button class="btn btn-primario" onclick="location.reload()">Reintentar</button></div>`;
    return;
  }
  const datos = await import('./datos.js');

  window.addEventListener('vs:salir', async () => {
    datos.detener();
    await fb.signOut(fb.auth);
  });

  window.addEventListener('vs:error-datos', (e) => {
    if (e.detail?.code === 'permission-denied') {
      toast('Esta cuenta no tiene permiso para leer los datos. Revisa las reglas de Firestore.', 'error');
    }
  });

  fb.onAuthStateChanged(fb.auth, async (usuario) => {
    if (!usuario) {
      datos.detener();
      pantallaLogin();
      return;
    }
    const correo = (usuario.email || '').toLowerCase();
    if (!CORREOS_PERMITIDOS.includes(correo)) {
      await fb.signOut(fb.auth);
      pantallaLogin(`La cuenta ${correo} no tiene acceso a este sistema.`);
      return;
    }
    pantallaCarga('Preparando datos…');
    try {
      await datos.prepararBase();
    } catch (e) {
      console.error(e);
      if (e.message === 'sin-conexion-primera-vez') {
        pantallaLogin('La primera vez se necesita internet para preparar la base de datos. Conéctate e intenta de nuevo.');
        await fb.signOut(fb.auth);
        return;
      }
      if (e?.code === 'permission-denied') {
        await fb.signOut(fb.auth);
        pantallaLogin('Firestore rechazó el acceso. Revisa que las reglas estén publicadas (ver README).');
        return;
      }
      toast('No se pudo verificar la base de datos. Se usarán los datos guardados en este equipo.', 'aviso');
    }
    datos.escuchar();
    pantallaApp(usuario);
    if (!location.hash) location.hash = '#/inicio';
    navegar();
  });
}

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('sw.js').catch((e) => console.warn('Service worker no registrado', e));
}

arrancar();
