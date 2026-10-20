// Agenda: calendario del mes y lista del día, con eventos propios y todo lo
// que tiene fecha en el resto del sistema.
import { estado, alCambiar, enviar } from '../datos.js';
import { esc, info, toast, $, $$, formulario, confirmar, hoyISO, fechaCorta } from '../ui.js';
import { nuevoLote, escucharDonde } from '../stock.js';
import { avisoError, avisoGuardado } from '../comunes.js';
import { TIPOS_EVENTO, semanasDelMes, itemsAgenda, sumar, diasEntreISO, guardarEvento, marcarHecho, anularEvento, deISO } from '../agenda-core.js';
import { detalleEncargo, dialogoEncargo } from './encargos.js';
import { detalleOrden } from './ventas-b2b.js';
import { detalleFeria, editarFeria } from './venta-rapida.js';
import { ICONOS } from '../iconos.js';

const fallo = avisoError(toast);
const DIAS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
const nombreMes = (iso) => { const t = deISO(iso).toLocaleDateString('es-CL', { month: 'long', year: 'numeric' }); return t.charAt(0).toUpperCase() + t.slice(1); };
const nombreDia = (iso) => {
  const d = diasEntreISO(hoyISO(), iso);
  const t = deISO(iso).toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long' });
  const cap = t.charAt(0).toUpperCase() + t.slice(1);
  return d === 0 ? `Hoy · ${cap}` : d === 1 ? `Mañana · ${cap}` : d === -1 ? `Ayer · ${cap}` : cap;
};

// Abre lo que corresponde según de dónde viene el ítem.
export function abrirItem(it) {
  if (it.origen === 'evento') return editarEvento(estado.eventos[it.id]);
  if (it.origen === 'encargo') return detalleEncargo(estado.encargos[it.id]);
  if (it.origen === 'orden') return detalleOrden(estado.ordenes[it.id]);
  if (it.origen === 'feria') return detalleFeria(estado.ferias[it.id]);
  if (it.origen === 'cobro') { location.hash = '#/cobranza/por-cobrar'; }
  return null;
}

export const filaItem = (it, i) => `
  <li><button class="ag-item ${it.clase} ${it.hecho ? 'ag-hecho' : ''} ${it.alerta ? 'ag-alerta' : ''}" data-i="${i}">
    ${it.hora ? `<span class="ag-hora">${esc(it.hora)}</span>` : ''}
    <span class="ag-texto"><span class="ag-titulo">${esc(it.titulo)}</span>${it.sub ? `<span class="ag-sub">${esc(it.sub)}</span>` : ''}</span>
    ${it.alerta ? '<span class="etiqueta etiqueta-alerta">Atrasado</span>' : it.hecho && it.origen === 'evento' ? '<span class="etiqueta etiqueta-ok">Hecho</span>' : ''}
  </button></li>`;

export default {
  render(el, { sub }) {
    const hoy = hoyISO();
    let mes = /^\d{4}-\d{2}$/.test(sub || '') ? `${sub}-01` : hoy;
    let dia = mes.slice(0, 7) === hoy.slice(0, 7) ? hoy : mes;
    let facturas = [];
    el.innerHTML = `
      <header class="pagina-cabecera">
        <h1>Agenda</h1>
        <p class="pagina-bajada">Todo lo que tiene fecha en el taller: entregas, ferias, clases, quemas y cobros.</p>
      </header>
      <div class="barra-herramientas ag-barra">
        <div class="grupo-botones">
          <button class="btn btn-suave btn-chico" data-mover="-1" aria-label="Mes anterior">‹</button>
          <button class="btn btn-suave btn-chico" data-hoy>Hoy</button>
          <button class="btn btn-suave btn-chico" data-mover="1" aria-label="Mes siguiente">›</button>
        </div>
        <h2 class="ag-mes" data-mes></h2>
        <span class="espacio"></span>
        <button class="btn btn-primario" data-nuevo aria-label="Agregar a la agenda">${ICONOS.mas2}<span>Agregar</span></button>
      </div>
      <div class="ag">
        <section class="panel ag-calendario" data-cal></section>
        <aside class="ag-lado">
          <section class="panel" data-dia></section>
          <section class="panel" data-proximos></section>
        </aside>
      </div>
      <p class="texto-suave ag-leyenda">
        <span class="ag-punto ag-entrega"></span>Entregas <span class="ag-punto ag-feria"></span>Ferias <span class="ag-punto ag-clase"></span>Clases
        <span class="ag-punto ag-quema"></span>Quemas <span class="ag-punto ag-cobro"></span>Vencimientos de cobro <span class="ag-punto ag-otro"></span>Otros
        ${info('Los encargos, las órdenes por entregar, las ferias y las facturas por cobrar aparecen solos: se cambian en su propia sección. Aquí agregas lo demás, como clases, quemas o entregas sin orden.')}
      </p>`;
    $$('[data-mover]', el).forEach((b) => b.addEventListener('click', () => {
      const d = deISO(mes); d.setMonth(d.getMonth() + Number(b.dataset.mover)); d.setDate(1);
      mes = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
      dia = mes.slice(0, 7) === hoyISO().slice(0, 7) ? hoyISO() : mes;
      pintar();
    }));
    $('[data-hoy]', el).addEventListener('click', () => { mes = hoyISO(); dia = hoyISO(); pintar(); });
    $('[data-nuevo]', el).addEventListener('click', () => agregar(dia));

    function pintar() {
      const sem = semanasDelMes(mes);
      const desde = sem[0][0]; const hasta = sem[sem.length - 1][6];
      const its = itemsAgenda(desde, hasta, { facturas });
      const porDia = new Map();
      its.forEach((it) => porDia.set(it.fecha, [...(porDia.get(it.fecha) || []), it]));
      $('[data-mes]', el).textContent = nombreMes(mes);
      const m = mes.slice(0, 7);
      $('[data-cal]', el).innerHTML = `
        <div class="ag-semana ag-cabeza">${DIAS.map((d) => `<span>${d}</span>`).join('')}</div>
        ${sem.map((s) => `<div class="ag-semana">${s.map((f) => {
          const l = porDia.get(f) || [];
          return `<button class="ag-dia ${f.slice(0, 7) !== m ? 'ag-fuera' : ''} ${f === hoyISO() ? 'ag-hoy' : ''} ${f === dia ? 'ag-elegido' : ''}" data-fecha="${f}" aria-label="${esc(nombreDia(f))}: ${l.length} ${l.length === 1 ? 'cosa' : 'cosas'}">
            <span class="ag-num">${Number(f.slice(8))}</span>
            <span class="ag-chips">${l.slice(0, 3).map((it) => `<span class="ag-chip ${it.clase} ${it.hecho ? 'ag-hecho' : ''}">${esc(it.titulo)}</span>`).join('')}${l.length > 3 ? `<span class="ag-mas">+${l.length - 3}</span>` : ''}</span>
            <span class="ag-puntos">${l.slice(0, 4).map((it) => `<span class="ag-punto ${it.clase}"></span>`).join('')}</span>
          </button>`;
        }).join('')}</div>`).join('')}`;
      $$('[data-fecha]', el).forEach((b) => b.addEventListener('click', () => { dia = b.dataset.fecha; pintar(); }));

      const delDia = itemsAgenda(dia, dia, { facturas });
      const cajaDia = $('[data-dia]', el);
      cajaDia.innerHTML = `
        <div class="panel-cabecera"><h2>${esc(nombreDia(dia))}</h2><button class="btn btn-suave btn-chico" data-agregar-dia>Agregar</button></div>
        ${delDia.length ? `<ul class="ag-lista">${delDia.map(filaItem).join('')}</ul>` : '<p class="texto-suave">Nada para este día.</p>'}`;
      $('[data-agregar-dia]', cajaDia).addEventListener('click', () => agregar(dia));
      $$('[data-i]', cajaDia).forEach((b) => b.addEventListener('click', () => abrirItem(delDia[Number(b.dataset.i)])));

      const h = hoyISO();
      const prox = itemsAgenda(h, sumar(h, 14), { facturas }).filter((it) => !(it.origen === 'evento' && it.hecho));
      const cajaP = $('[data-proximos]', el);
      let ultimo = '';
      cajaP.innerHTML = `<h2>Próximos 14 días</h2>${prox.length ? `<ul class="ag-lista">${prox.map((it, i) => {
        const cab = it.fecha !== ultimo ? `<li class="ag-fecha">${esc(nombreDia(it.fecha))}</li>` : '';
        ultimo = it.fecha;
        return cab + filaItem(it, i);
      }).join('')}</ul>` : '<p class="texto-suave">Nada en las próximas dos semanas.</p>'}`;
      $$('[data-i]', cajaP).forEach((b) => b.addEventListener('click', () => abrirItem(prox[Number(b.dataset.i)])));
    }
    const des = [alCambiar(pintar), escucharDonde('facturas', 'abierta', '==', true, (l) => { facturas = l; pintar(); })];
    pintar();
    return () => des.forEach((u) => u());
  }
};

// Elegir qué agregar en un día.
async function agregar(fecha) {
  const r = await formulario({
    titulo: `Agregar · ${fechaCorta(fecha)}`, textoGuardar: '',
    cuerpo: `<div class="opciones ag-opciones">
      <button type="button" class="opcion" data-que="evento"><span class="opcion-titulo">Evento</span><span class="opcion-detalle">Clase, quema, entrega sin orden, compra, reunión.</span></button>
      <button type="button" class="opcion" data-que="encargo"><span class="opcion-titulo">Encargo</span><span class="opcion-detalle">Piezas a pedido de un cliente, con abono, para entregar este día.</span></button>
      <button type="button" class="opcion" data-que="feria"><span class="opcion-titulo">Feria</span><span class="opcion-detalle">Con sus días y el costo del puesto, para ver su resultado.</span></button>
    </div>`,
    montar(dlg, form, cerrar) {
      $$('[data-que]', dlg).forEach((b) => b.addEventListener('click', () => {
        cerrar();
        const q = b.dataset.que;
        if (q === 'evento') editarEvento(null, { fecha });
        if (q === 'encargo') dialogoEncargo(null, { fechaEntrega: fecha });
        if (q === 'feria') editarFeria(null, { fecha });
      }));
    }
  });
  return r;
}

export async function editarEvento(ev = null, { fecha = hoyISO(), tipo = 'clase' } = {}) {
  const d = ev || { titulo: '', tipo, fecha, fechaFin: '', hora: '', horaFin: '', lugar: '', nota: '' };
  await formulario({
    titulo: ev ? ev.titulo : 'Nuevo evento', textoGuardar: ev ? 'Guardar cambios' : 'Agregar a la agenda',
    extra: ev ? `<button type="button" class="btn btn-suave" data-hecho>${ev.hecho ? 'Marcar pendiente' : 'Marcar hecho'}</button><button type="button" class="btn btn-peligro" data-anular>Quitar</button>` : '',
    cuerpo: `<div class="campos">
      <label class="campo campo-ancho"><span class="campo-etiqueta">Qué <span class="req">*</span></span><input name="titulo" value="${esc(d.titulo)}" maxlength="100" placeholder="Ej.: Clase de esmaltes · grupo martes, Quema de esmalte horno 2"></label>
      <label class="campo"><span class="campo-etiqueta">Tipo</span><select name="tipo">${Object.entries(TIPOS_EVENTO).map(([k, t]) => `<option value="${k}" ${k === d.tipo ? 'selected' : ''}>${esc(t.nombre)}</option>`).join('')}</select></label>
      <label class="campo"><span class="campo-etiqueta">Lugar</span><input name="lugar" value="${esc(d.lugar || '')}" maxlength="100" placeholder="Taller"></label>
      <label class="campo"><span class="campo-etiqueta">Día <span class="req">*</span></span><input type="date" name="fecha" value="${esc(d.fecha)}"></label>
      <label class="campo"><span class="campo-etiqueta">Hasta ${info('Solo si dura varios días, como un taller de fin de semana. Si es un solo día, déjalo vacío.')}</span><input type="date" name="fechaFin" value="${esc(d.fechaFin || '')}"></label>
      <label class="campo"><span class="campo-etiqueta">Hora</span><input type="time" name="hora" value="${esc(d.hora || '')}"></label>
      <label class="campo"><span class="campo-etiqueta">Hasta las</span><input type="time" name="horaFin" value="${esc(d.horaFin || '')}"></label>
      <label class="campo campo-ancho"><span class="campo-etiqueta">Notas</span><textarea name="nota" rows="2" maxlength="500">${esc(d.nota || '')}</textarea></label>
    </div>`,
    montar(dlg, form, cerrar) {
      $('[data-hecho]', dlg)?.addEventListener('click', () => {
        const lote = nuevoLote(); marcarHecho(lote, ev, !ev.hecho);
        enviar(lote.commit(), { alGuardar: avisoGuardado(toast, ev.hecho ? 'Marcado pendiente' : 'Marcado hecho'), alFallar: fallo }); cerrar();
      });
      $('[data-anular]', dlg)?.addEventListener('click', async () => {
        if (!(await confirmar('Quitar de la agenda', `«${esc(ev.titulo)}» deja de aparecer en la agenda.`, 'Quitar', true))) return;
        const lote = nuevoLote(); anularEvento(lote, ev);
        enviar(lote.commit(), { alGuardar: avisoGuardado(toast, 'Quitado de la agenda'), alFallar: fallo }); cerrar();
      });
    },
    guardar(form) {
      const titulo = form.titulo.value.trim();
      if (!titulo) return 'Escribe qué es.';
      if (!form.fecha.value) return 'Elige el día.';
      if (form.fechaFin.value && form.fechaFin.value < form.fecha.value) return 'El día de término no puede ser anterior al inicio.';
      if (form.hora.value && form.horaFin.value && form.horaFin.value < form.hora.value) return 'La hora de término no puede ser anterior al inicio.';
      const datos = { titulo, tipo: form.tipo.value, lugar: form.lugar.value.trim(), fecha: form.fecha.value, fechaFin: form.fechaFin.value || null, hora: form.hora.value || '', horaFin: form.horaFin.value || '', nota: form.nota.value.trim() };
      const lote = nuevoLote(); guardarEvento(lote, ev, datos);
      enviar(lote.commit(), { alGuardar: avisoGuardado(toast, ev ? 'Evento guardado' : `Agregado a la agenda el ${fechaCorta(datos.fecha)}`), alFallar: fallo });
      return null;
    }
  });
}
