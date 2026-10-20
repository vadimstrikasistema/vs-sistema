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

document.addEventListener('click', (e) => {
  const btn = e.target.closest('.info');
  $$('.info-pop').forEach((p) => p.remove());
  if (!btn) return;
  e.preventDefault();
  const pop = document.createElement('div');
  pop.className = 'info-pop';
  pop.setAttribute('role', 'tooltip');
  pop.textContent = btn.dataset.info;
  document.body.append(pop);
  const r = btn.getBoundingClientRect();
  const w = Math.min(300, window.innerWidth - 32);
  pop.style.width = w + 'px';
  const left = Math.max(16, Math.min(r.left + r.width / 2 - w / 2, window.innerWidth - w - 16));
  pop.style.left = left + 'px';
  pop.style.top = (r.bottom + window.scrollY + 8) + 'px';
});

// Mensajes breves abajo de la pantalla.
export function toast(mensaje, tipo = 'ok') {
  let zona = $('#toasts');
  if (!zona) {
    zona = document.createElement('div');
    zona.id = 'toasts';
    zona.setAttribute('aria-live', 'polite');
    document.body.append(zona);
  }
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
