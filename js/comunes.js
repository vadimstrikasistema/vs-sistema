// Piezas de interfaz que comparten Producción e Inventario.
import { estado, itemsActivos, nombreItem } from './datos.js';
import { esc } from './ui.js';
import { insumosActivos } from './stock.js';

// <option> de una lista editable. Incluye el valor actual aunque esté oculto,
// para que un registro antiguo no pierda su dato al editarlo.
export function opcionesLista(clave, actual = '', { vacio = null } = {}) {
  const items = itemsActivos(clave);
  const ops = items.map((i) => `<option value="${esc(i.id)}" ${i.id === actual ? 'selected' : ''}>${esc(i.nombre)}</option>`);
  if (actual && !items.some((i) => i.id === actual)) {
    ops.unshift(`<option value="${esc(actual)}" selected>${esc(nombreItem(clave, actual))} (oculto)</option>`);
  }
  if (vacio != null) ops.unshift(`<option value="" ${!actual ? 'selected' : ''}>${esc(vacio)}</option>`);
  return ops.join('');
}

// <option> de insumos agrupados por tipo. `filtro(ins)` decide cuáles aparecen.
export function opcionesInsumos(actual = '', { filtro = () => true, vacio = 'Elige un insumo' } = {}) {
  const grupos = new Map();
  insumosActivos().filter(filtro).forEach((i) => {
    const t = nombreItem('tiposInsumo', i.tipo);
    if (!grupos.has(t)) grupos.set(t, []);
    grupos.get(t).push(i);
  });
  let html = vacio != null ? `<option value="">${esc(vacio)}</option>` : '';
  [...grupos.entries()].sort((a, b) => a[0].localeCompare(b[0], 'es')).forEach(([t, lista]) => {
    html += `<optgroup label="${esc(t)}">${lista.map((i) =>
      `<option value="${esc(i.id)}" ${i.id === actual ? 'selected' : ''}>${esc(i.nombre)}</option>`).join('')}</optgroup>`;
  });
  const act = estado.insumos[actual];
  if (act && (act.archivado || !filtro(act))) {
    html += `<option value="${esc(act.id)}" selected>${esc(act.nombre)} (archivado)</option>`;
  }
  return html;
}

export const nombreUnidad = (id) => nombreItem('unidades', id);

// Campo numérico con formato chileno (acepta coma decimal).
export const campoNumero = (nombre, etiqueta, valor = '', { ayuda = '', sufijo = '', requerido = false, placeholder = '', ancho = false } = {}) => `
  <label class="campo ${ancho ? 'campo-ancho' : ''}">
    <span class="campo-etiqueta">${esc(etiqueta)}${requerido ? ' <span class="req" aria-hidden="true">*</span>' : ''} ${ayuda}</span>
    <span class="con-sufijo">
      <input name="${nombre}" type="text" inputmode="decimal" autocomplete="off" value="${esc(valor)}" placeholder="${esc(placeholder)}">
      ${sufijo ? `<span class="sufijo">${esc(sufijo)}</span>` : ''}
    </span>
  </label>`;

export const vacio = (titulo, texto, boton = '') => `
  <div class="vacio">
    <p class="vacio-titulo">${esc(titulo)}</p>
    <p>${esc(texto)}</p>
    ${boton}
  </div>`;

export const pestanas = (base, lista, actual) => `
  <nav class="pestanas" aria-label="Secciones">
    ${lista.map(([k, t]) => `<a href="#/${base}/${k}" class="pestana ${k === actual ? 'activa' : ''}" ${k === actual ? 'aria-current="page"' : ''}>${esc(t)}</a>`).join('')}
  </nav>`;

export const avisoError = (toast) => (e) =>
  toast(e?.code === 'permission-denied'
    ? 'No se guardó: Firestore rechazó el cambio. Revisa que las reglas estén publicadas.'
    : 'No se pudo guardar. Revisa la conexión e intenta de nuevo.', 'error');

export const avisoGuardado = (toast, que) => (enLinea) =>
  toast(enLinea ? `${que}.` : `${que} en este equipo. Se sincroniza al volver la señal.`);
