// Utilidades de interfaz compartidas por todos los módulos.

export const esc = (v) => String(v ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

// Nota explicativa (i). Se abre al tocar y se cierra al tocar fuera.
export function info(texto) {
  return `<button type="button" class="info" aria-label="Más información" data-info="${esc(texto)}">i</button>`;
}

// La nota se abre dentro de la ventana (diálogo) donde está el botón: los diálogos
// quedan en una capa propia, por encima de todo lo demás de la página.
const cerrarNotas = () => $$('.info-pop').forEach((p) => p.remove());
document.addEventListener('click', (e) => {
  const btn = e.target.closest('.info');
  if (e.target.closest('.info-pop')) return;
  cerrarNotas();
  if (!btn) return;
  e.preventDefault();
  e.stopPropagation();
  const pop = document.createElement('div');
  pop.className = 'info-pop';
  pop.setAttribute('role', 'tooltip');
  pop.textContent = btn.dataset.info;
  (btn.closest('dialog[open]') || document.body).append(pop);
  const r = btn.getBoundingClientRect();
  const w = Math.min(300, window.innerWidth - 32);
  pop.style.width = w + 'px';
  pop.style.left = Math.max(16, Math.min(r.left + r.width / 2 - w / 2, window.innerWidth - w - 16)) + 'px';
  const alto = pop.offsetHeight;
  const abajo = r.bottom + 8;
  pop.style.top = (abajo + alto > window.innerHeight - 8 && r.top - alto - 8 > 8 ? r.top - alto - 8 : abajo) + 'px';
}, true);
// Al desplazar la página o una ventana, la nota se cierra (si no, quedaría flotando fuera de lugar).
window.addEventListener('scroll', cerrarNotas, true);
window.addEventListener('resize', cerrarNotas);

// Mensajes breves abajo de la pantalla.
export function toast(mensaje, tipo = 'ok') {
  let zona = $('#toasts');
  if (!zona) {
    zona = document.createElement('div');
    zona.id = 'toasts';
    zona.setAttribute('aria-live', 'polite');
    document.body.append(zona);
  }
  // Máximo dos avisos a la vez: el más antiguo se va.
  while (zona.children.length >= 2) zona.firstElementChild.remove();
  const t = document.createElement('div');
  t.className = `toast toast-${tipo}`;
  t.textContent = mensaje;
  zona.append(t);
  setTimeout(() => t.classList.add('saliendo'), 3200);
  setTimeout(() => t.remove(), 3600);
}

// Ventana de diálogo. Devuelve una promesa con el valor del botón pulsado.
export function dialogo({ titulo, cuerpo = '', botones = [{ texto: 'Cerrar', valor: null }] }) {
  return new Promise((resolve) => {
    const d = document.createElement('dialog');
    d.className = 'dialogo';
    d.innerHTML = `
      <form method="dialog">
        <h2>${esc(titulo)}</h2>
        <div class="dialogo-cuerpo">${cuerpo}</div>
        <div class="dialogo-botones">
          ${botones.map((b, i) => `<button value="${i}" class="btn ${b.clase || (i === botones.length - 1 ? 'btn-primario' : 'btn-suave')}">${esc(b.texto)}</button>`).join('')}
        </div>
      </form>`;
    document.body.append(d);
    d.addEventListener('close', () => {
      const i = d.returnValue === '' ? -1 : Number(d.returnValue);
      const form = d.querySelector('form');
      const datos = Object.fromEntries(new FormData(form));
      d.remove();
      resolve(i < 0 ? null : { valor: botones[i].valor, datos });
    });
    d.showModal();
    const primero = d.querySelector('input, select, textarea');
    if (primero) primero.focus();
  });
}

// ---------- RUT chileno ----------
export function limpiarRut(rut) {
  return String(rut || '').replace(/[^0-9kK]/g, '').toUpperCase();
}

export function rutValido(rut) {
  const r = limpiarRut(rut);
  if (r.length < 2) return false;
  const cuerpo = r.slice(0, -1);
  const dv = r.slice(-1);
  let suma = 0, mult = 2;
  for (let i = cuerpo.length - 1; i >= 0; i--) {
    suma += Number(cuerpo[i]) * mult;
    mult = mult === 7 ? 2 : mult + 1;
  }
  const res = 11 - (suma % 11);
  const esperado = res === 11 ? '0' : res === 10 ? 'K' : String(res);
  return dv === esperado;
}

export function formatearRut(rut) {
  const r = limpiarRut(rut);
  if (r.length < 2) return r;
  const cuerpo = r.slice(0, -1).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${cuerpo}-${r.slice(-1)}`;
}

export const fechaLarga = (d = new Date()) =>
  d.toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long' });

// ---------- Números (formato chileno: punto de miles, coma decimal) ----------
// Acepta «1.250,5», «1250,5», «1250.5» y «1,5».
export function leerNumero(texto) {
  if (typeof texto === 'number') return texto;
  let t = String(texto ?? '').trim().replace(/\s|\$/g, '');
  if (!t) return NaN;
  const coma = t.lastIndexOf(',');
  const punto = t.lastIndexOf('.');
  if (coma > -1 && punto > -1) {
    t = coma > punto ? t.replace(/\./g, '').replace(',', '.') : t.replace(/,/g, '');
  } else if (coma > -1) {
    t = t.replace(',', '.');
  } else if (punto > -1 && /^\d{1,3}(\.\d{3})+$/.test(t)) {
    t = t.replace(/\./g, ''); // «1.250» es mil doscientos cincuenta
  }
  const n = Number(t);
  return Number.isFinite(n) ? n : NaN;
}

export const numero = (n, dec = 2) =>
  Number.isFinite(n) ? n.toLocaleString('es-CL', { maximumFractionDigits: dec }) : '—';

export const pesos = (n) => {
  if (!Number.isFinite(n)) return '—';
  const r = Math.round(n);
  return (r < 0 ? '−$' : '$') + Math.abs(r).toLocaleString('es-CL');
};

// Costo por unidad: con decimales solo cuando el valor es chico ($/g).
export function pesosUnidad(n) {
  if (!Number.isFinite(n)) return '—';
  const dec = Math.abs(n) < 10 ? 2 : Math.abs(n) < 100 ? 1 : 0;
  return '$' + n.toLocaleString('es-CL', { minimumFractionDigits: 0, maximumFractionDigits: dec });
}

export function hoyISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export const fechaCorta = (iso) => {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('es-CL', { day: 'numeric', month: 'short', year: 'numeric' });
};

// ---------- Formulario en ventana ----------
// Abre un diálogo con un formulario. `montar(dialogo)` conecta la lógica;
// `guardar(form)` devuelve un texto de error (y la ventana sigue abierta)
// o nada (y la ventana se cierra). Devuelve una promesa: true si se guardó.
export function formulario({ titulo, cuerpo, textoGuardar = 'Guardar', ancho = false, montar, guardar, extra = '' }) {
  return new Promise((resolve) => {
    const d = document.createElement('dialog');
    d.className = `dialogo ${ancho ? 'dialogo-ancho' : ''}`;
    d.innerHTML = `
      <form novalidate>
        <div class="dialogo-cabeza">
          <h2>${esc(titulo)}</h2>
          <button type="button" class="btn-icono" data-cerrar aria-label="Cerrar">✕</button>
        </div>
        <div class="dialogo-cuerpo">${cuerpo}</div>
        <p class="aviso" data-error hidden role="alert"></p>
        <div class="dialogo-botones">
          ${extra}
          <span class="espacio"></span>
          <button type="button" class="btn btn-suave" data-cerrar>${textoGuardar ? 'Cancelar' : 'Cerrar'}</button>
          ${textoGuardar ? `<button type="submit" class="btn btn-primario">${esc(textoGuardar)}</button>` : ''}
        </div>
      </form>`;
    document.body.append(d);
    const form = d.querySelector('form');
    let guardado = false;
    const cerrar = () => d.close();
    d.querySelectorAll('[data-cerrar]').forEach((b) => b.addEventListener('click', cerrar));
    d.addEventListener('close', () => { d.remove(); resolve(guardado); });
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const err = await guardar?.(form, d);
      const caja = d.querySelector('[data-error]');
      if (err) {
        caja.textContent = err;
        caja.hidden = false;
        caja.scrollIntoView({ block: 'nearest' });
        return;
      }
      guardado = true;
      cerrar();
    });
    montar?.(d, form, cerrar);
    d.showModal();
    const primero = d.querySelector('.dialogo-cuerpo input:not([type=hidden]):not([readonly]), .dialogo-cuerpo select');
    // En celular no se enfoca solo: abriría el teclado o el calendario sin pedirlo.
    const tactil = window.matchMedia?.('(pointer: coarse)').matches;
    if (primero && !tactil && primero.type !== 'date') primero.focus();
  });
}

export const confirmar = async (titulo, texto, textoSi = 'Confirmar', peligro = false) => {
  const r = await dialogo({
    titulo,
    cuerpo: `<p>${texto}</p>`,
    botones: [{ texto: 'Cancelar', valor: false }, { texto: textoSi, valor: true, clase: peligro ? 'btn btn-peligro' : undefined }]
  });
  return Boolean(r?.valor);
};
