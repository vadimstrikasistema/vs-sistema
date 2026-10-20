// Ventas → Encargos: piezas a pedido con abono y fecha de entrega.
import { estado, alCambiar, enviar, itemsActivos, nombreItem } from '../datos.js';
import { esc, info, toast, $, $$, formulario, leerNumero, pesos, hoyISO, fechaCorta } from '../ui.js';
import { nuevoLote } from '../stock.js';
import { opcionesLista, vacio, avisoError, avisoGuardado } from '../comunes.js';
import { nombreCliente } from '../cobranza-core.js';
import { precioDe as precioVenta } from '../ventas-core.js';
import {
  ESTADOS_ENCARGO, etiquetaEncargo, abonado, saldoEncargo, encargoActivo, atrasado,
  resumenEncargo, crearEncargo, editarEncargo, agregarAbono, cambiarEstado, entregarEncargo, anularEncargo, totalEncargo
} from '../encargos-core.js';
import { enlaceWhatsApp } from '../pdf.js';
import { montarEditor, validarLineas } from './ventas-b2b.js';
import { editarCliente } from './ventas.js';
import { ICONOS } from '../iconos.js';

const fallo = avisoError(toast);
const norm = (t) => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const clientes = () => Object.values(estado.clientes).filter((c) => !c.archivado).sort((a, b) => nombreCliente(a).localeCompare(nombreCliente(b), 'es'));
const precioPublico = (_c, piezaId) => (estado.piezas[piezaId] ? precioVenta(estado.piezas[piezaId], 'primera') : 0);
const etqEstado = (e) => {
  if (atrasado(e)) return '<span class="etiqueta etiqueta-alerta">Atrasado</span>';
  const x = ESTADOS_ENCARGO[e.estado] || ESTADOS_ENCARGO.pendiente;
  return `<span class="etiqueta ${x.clase}">${esc(x.nombre)}</span>`;
};
const medios = (actual = '') => itemsActivos('mediosPago').map((m) => `<label><input type="radio" name="medio" value="${esc(m.id)}" ${m.id === actual ? 'checked' : ''}><span>${esc(m.nombre)}</span></label>`).join('');
const diasHasta = (iso) => Math.round((new Date(`${iso}T12:00`) - new Date(`${hoyISO()}T12:00`)) / 86400000);
const cuando = (e) => {
  if (!e.fechaEntrega) return 'Sin fecha';
  const d = diasHasta(e.fechaEntrega);
  if (d === 0) return 'Para hoy';
  if (d === 1) return 'Para mañana';
  if (d < 0) return `Atrasado ${-d} día${d === -1 ? '' : 's'}`;
  return `Para el ${fechaCorta(e.fechaEntrega)}${d <= 7 ? ` (en ${d} días)` : ''}`;
};

export function vistaEncargos(el) {
  const f = { texto: '', ver: 'activos' };
  el.innerHTML = `
    <div class="resumen" data-resumen></div>
    <div class="barra-herramientas">
      <input type="search" class="buscador" placeholder="Buscar cliente o pieza" aria-label="Buscar encargo">
      <select class="filtro" aria-label="Mostrar"><option value="activos">Activos</option><option value="entregados">Entregados</option><option value="anulados">Anulados</option></select>
      <span class="espacio"></span>
      <button class="btn btn-primario" data-nuevo>${ICONOS.mas2}<span>Nuevo encargo</span></button>
    </div>
    <div data-lista></div>`;
  $('.buscador', el).addEventListener('input', (e) => { f.texto = e.target.value; pintar(); });
  $('.filtro', el).addEventListener('change', (e) => { f.ver = e.target.value; pintar(); });
  $('[data-nuevo]', el).addEventListener('click', () => dialogoEncargo());
  const lista = $('[data-lista]', el);
  function pintar() {
    const todos = Object.values(estado.encargos);
    const act = todos.filter(encargoActivo);
    const semana = act.filter((e) => e.fechaEntrega && diasHasta(e.fechaEntrega) <= 7);
    $('[data-resumen]', el).innerHTML = `
      <div class="dato"><span class="dato-etq">Encargos activos</span><span class="dato-valor">${act.length}</span></div>
      <div class="dato ${act.some((e) => atrasado(e)) ? 'dato-alerta' : ''}"><span class="dato-etq">Para esta semana</span><span class="dato-valor">${semana.length}${act.some((e) => atrasado(e)) ? ` · ${act.filter((e) => atrasado(e)).length} atrasado${act.filter((e) => atrasado(e)).length > 1 ? 's' : ''}` : ''}</span></div>
      <div class="dato"><span class="dato-etq">Abonado ${info('Lo que ya te pagaron por adelantado en los encargos activos. La venta se registra completa al entregar.')}</span><span class="dato-valor">${pesos(act.reduce((s, e) => s + abonado(e), 0))}</span></div>
      <div class="dato"><span class="dato-etq">Por cobrar al entregar</span><span class="dato-valor">${pesos(act.reduce((s, e) => s + saldoEncargo(e), 0))}</span></div>`;
    if (!todos.length) {
      lista.innerHTML = vacio('Todavía no hay encargos', 'Un encargo es una pieza o un juego que un cliente te pide para una fecha: queda con lo que pidió, el precio, el abono que dejó y cuándo hay que entregarlo. Aparece en la Agenda y, al entregarlo, se registra la venta y se cobra el saldo.', '<button class="btn btn-primario" data-nuevo2>Anotar el primer encargo</button>');
      $('[data-nuevo2]', lista)?.addEventListener('click', () => dialogoEncargo());
      return;
    }
    const q = norm(f.texto.trim());
    const vis = todos.filter((e) => (f.ver === 'activos' ? encargoActivo(e) : f.ver === 'entregados' ? e.estado === 'entregado' : e.estado === 'anulado'))
      .filter((e) => !q || norm(e.clienteNombre).includes(q) || norm(resumenEncargo(e)).includes(q) || String(e.numero) === q)
      .sort((a, b) => (f.ver === 'activos' ? (a.fechaEntrega || '9').localeCompare(b.fechaEntrega || '9') : b.numero - a.numero));
    if (!vis.length) { lista.innerHTML = vacio(f.ver === 'activos' ? 'No hay encargos activos' : 'Sin resultados', f.ver === 'activos' ? 'Todos los encargos están entregados.' : 'Prueba con otra búsqueda o cambia el filtro.'); return; }
    lista.innerHTML = `<section class="panel tabla-panel"><ul class="filas">${vis.map((e) => `
      <li><button class="fila ${e.estado === 'anulado' ? 'fila-anulada' : ''}" data-id="${esc(e.id)}">
        <span class="fila-principal"><span class="fila-nombre">${esc(e.clienteNombre)} · ${esc(resumenEncargo(e))}</span>
          <span class="fila-meta"><span class="${atrasado(e) ? 'texto-alerta' : ''}">${encargoActivo(e) ? esc(cuando(e)) : `${esc(etiquetaEncargo(e))} · ${fechaCorta(e.fechaEntregado || e.fecha)}`}</span>${etqEstado(e)}</span></span>
        <span class="fila-dato"><span class="fila-etq">Abonado</span>${pesos(abonado(e))}</span>
        <span class="fila-dato fila-dato-fuerte"><span class="fila-etq">${encargoActivo(e) ? 'Saldo' : 'Total'}</span>${pesos(encargoActivo(e) ? saldoEncargo(e) : e.total)}</span>
      </button></li>`).join('')}</ul></section>`;
    $$('.fila', lista).forEach((b) => b.addEventListener('click', () => detalleEncargo(estado.encargos[b.dataset.id])));
  }
  pintar();
  return alCambiar(pintar);
}

// Nuevo encargo, o editar uno que todavía no se entrega.
export async function dialogoEncargo(e = null, { fechaEntrega = '' } = {}) {
  const ls = e ? e.lineas.map((l, i) => ({ ...l, key: `e${i}`, manual: true })) : [];
  let ed;
  let creado = null;
  const canal = e?.canal || (itemsActivos('canalesVenta').find((c) => c.id === 'instagram') || itemsActivos('canalesVenta').find((c) => c.id !== 'feria'))?.id || '';
  await formulario({
    titulo: e ? `Editar ${etiquetaEncargo(e).toLowerCase()}` : 'Nuevo encargo', ancho: true, textoGuardar: e ? 'Guardar cambios' : 'Anotar encargo',
    cuerpo: `
      <div class="campos">
        ${e ? `<div class="campo"><span class="campo-etiqueta">Cliente</span><strong>${esc(e.clienteNombre)}</strong></div>` : `
        <label class="campo"><span class="campo-etiqueta">Cliente <span class="req">*</span> ${info('Clientes finales y empresas. Para un cliente nuevo basta el nombre y su WhatsApp, para avisarle cuando esté listo.')}</span>
          <span class="con-boton"><select name="cliente"><option value="">Elige el cliente…</option>${clientes().map((c) => `<option value="${esc(c.id)}">${esc(nombreCliente(c))}</option>`).join('')}</select>
          <button type="button" class="btn btn-suave btn-chico" data-nuevo-cliente>Nuevo</button></span></label>`}
        <label class="campo"><span class="campo-etiqueta">Fecha de entrega <span class="req">*</span> ${info('Cuándo te comprometiste a entregarlo. Aparece en la Agenda y en Inicio cuando se acerca.')}</span><input type="date" name="fechaEntrega" value="${esc(e?.fechaEntrega || fechaEntrega)}"></label>
        <label class="campo"><span class="campo-etiqueta">Cómo llegó</span><select name="canal">${opcionesLista('canalesVenta', canal)}</select></label>
      </div>
      <div data-editor></div>
      <label class="campo campo-ancho"><span class="campo-etiqueta">Detalles ${info('Lo que hay que recordar para hacerlo: color, esmalte, medidas, grabado, si va envuelto para regalo.')}</span><textarea name="nota" rows="2" maxlength="500" placeholder="Ej.: esmalte celadón, 6 platos de 27 cm, para regalo">${esc(e?.nota || '')}</textarea></label>
      ${e ? '' : `
      <h3>Abono ${info('Lo que el cliente deja pagado al encargar. Si no dejó nada, déjalo en blanco. Más abonos se agregan después en el detalle del encargo.')}</h3>
      <div class="campos">
        <label class="campo"><span class="campo-etiqueta">Monto</span><span class="con-sufijo"><input name="abono" inputmode="numeric" placeholder="0"><span class="sufijo">$</span></span></label>
        <div class="campo"><span class="campo-etiqueta">Medio de pago</span><div class="segmentado segmentado-chico">${medios(itemsActivos('mediosPago').find((m) => m.id === 'transferencia')?.id || itemsActivos('mediosPago')[0]?.id)}</div></div>
      </div>`}`,
    montar(dlg, form) {
      ed = montarEditor($('[data-editor]', dlg), ls, { cliente: () => null, precioDe: precioPublico, conIva: true, mostrarStock: false });
      if (!e) {
        $('[data-nuevo-cliente]', dlg).addEventListener('click', async () => {
          const c = await editarCliente(null, { tipoInicial: 'persona' });
          if (!c) return;
          estado.clientes[c.id] = { ...c, ...(estado.clientes[c.id] || {}) };
          form.cliente.insertAdjacentHTML('beforeend', `<option value="${esc(c.id)}">${esc(nombreCliente(c))}</option>`);
          form.cliente.value = c.id;
        });
      }
    },
    guardar(form) {
      const cliente = e ? null : estado.clientes[form.cliente.value];
      if (!e && !cliente) return 'Elige el cliente.';
      if (!form.fechaEntrega.value) return 'Escribe la fecha de entrega.';
      const err = validarLineas(ls);
      if (err) return err;
      const lote = nuevoLote();
      const comun = { fechaEntrega: form.fechaEntrega.value, canal: form.canal.value, lineas: ls, nota: form.nota.value.trim() };
      if (e) {
        if (totalEncargo(ls) < abonado(e)) return `El total no puede quedar bajo lo ya abonado (${pesos(abonado(e))}).`;
        editarEncargo(lote, e, comun);
        enviar(lote.commit(), { alGuardar: avisoGuardado(toast, 'Encargo guardado'), alFallar: fallo });
        return null;
      }
      const monto = Math.round(leerNumero(form.abono.value) || 0);
      if (monto < 0) return 'Revisa el abono.';
      if (monto > totalEncargo(ls)) return 'El abono es mayor que el total del encargo.';
      creado = crearEncargo(lote, { cliente, fecha: hoyISO(), ...comun, abono: monto > 0 ? { monto, medio: form.medio.value, fecha: hoyISO() } : null });
      enviar(lote.commit(), { alGuardar: avisoGuardado(toast, `${etiquetaEncargo(creado)} anotado para el ${fechaCorta(creado.fechaEntrega)}`), alFallar: fallo });
      return null;
    }
  });
  return creado;
}

function mensajeListo(e) {
  const c = estado.clientes[e.clienteId] || {};
  const nombre = (c.contacto || c.nombre || e.clienteNombre || '').split(' ')[0];
  const quien = estado.empresa?.nombreFantasia || 'Vadim Strika';
  const saldo = saldoEncargo(e);
  const banco = saldo > 0 && estado.empresa?.datosTransferencia ? `\n\nSi prefieres transferir: ${estado.empresa.datosTransferencia}` : '';
  return `Hola ${nombre}, ¡tu encargo de ${quien} está listo! (${resumenEncargo(e)}).${saldo > 0 ? ` Queda un saldo de ${pesos(saldo)}.` : ' Ya está pagado.'}${banco}\n\nAvísame cuándo te acomoda retirarlo.`;
}

export async function detalleEncargo(e0) {
  const e = estado.encargos[e0.id] || e0;
  const c = estado.clientes[e.clienteId] || {};
  const activo = encargoActivo(e);
  const sig = { pendiente: ['taller', 'Pasar a «En el taller»'], taller: ['listo', 'Marcar listo'] }[e.estado];
  await formulario({
    titulo: `${etiquetaEncargo(e)} · ${e.clienteNombre}`, ancho: true, textoGuardar: '',
    extra: activo ? `
      ${e.estado === 'listo' ? '<button type="button" class="btn btn-primario" data-entregar>Entregar y cobrar</button>' : ''}
      ${sig ? `<button type="button" class="btn ${e.estado === 'listo' ? 'btn-suave' : 'btn-primario'}" data-estado="${sig[0]}">${sig[1]}</button>` : ''}
      <button type="button" class="btn btn-suave" data-abono>Agregar abono</button>
      ${e.estado === 'listo' ? '<button type="button" class="btn btn-suave" data-avisar>Avisar por WhatsApp</button>' : ''}
      <button type="button" class="btn btn-suave" data-editar>Editar</button>
      <button type="button" class="btn btn-peligro" data-anular>Anular</button>` : '',
    cuerpo: `
      <div class="resumen resumen-chico">
        <div class="dato"><span class="dato-etq">Total</span><span class="dato-valor">${pesos(e.total)}</span></div>
        <div class="dato"><span class="dato-etq">Abonado</span><span class="dato-valor">${pesos(abonado(e))}</span></div>
        <div class="dato ${activo && atrasado(e) ? 'dato-alerta' : ''}"><span class="dato-etq">${activo ? 'Saldo al entregar' : 'Estado'}</span><span class="dato-valor">${activo ? pesos(saldoEncargo(e)) : esc(ESTADOS_ENCARGO[e.estado].nombre)}</span></div>
      </div>
      <dl class="datos-fijos compacto">
        <div><dt>Estado</dt><dd>${etqEstado(e)}</dd></div>
        <div><dt>Entrega</dt><dd>${e.estado === 'entregado' ? `Entregado el ${fechaCorta(e.fechaEntregado)}` : esc(cuando(e))}</dd></div>
        <div><dt>Encargado</dt><dd>${fechaCorta(e.fecha)} · ${esc(nombreItem('canalesVenta', e.canal))}</dd></div>
        ${c.whatsapp ? `<div><dt>WhatsApp</dt><dd>${esc(c.whatsapp)}</dd></div>` : ''}
        ${e.nota ? `<div><dt>Detalles</dt><dd>${esc(e.nota)}</dd></div>` : ''}
      </dl>
      <h3>Piezas</h3>
      <ul class="lista-bajos">${e.lineas.map((l) => `<li><span>${l.cantidad} × ${esc(l.nombre)}${l.piezaId ? '' : ' <span class="texto-tenue">(sin ficha)</span>'}</span><span>${pesos(l.subtotal)}</span></li>`).join('')}</ul>
      <h3>Abonos</h3>
      ${(e.abonos || []).length ? `<ul class="lista-bajos">${e.abonos.map((a) => `<li class="${a.devuelto ? 'tachado' : ''}"><span>${fechaCorta(a.fecha)} · ${esc(nombreItem('mediosPago', a.medio))}${a.devuelto ? ' · devuelto' : ''}</span><span>${pesos(a.monto)}</span></li>`).join('')}</ul>` : '<p class="texto-suave">Sin abonos.</p>'}
      ${e.estado === 'entregado' ? '<p class="aviso aviso-ok">Entregado: la venta quedó registrada en el historial de ventas, con cada abono como parte del pago.</p>' : ''}
      ${e.estado === 'anulado' ? `<p class="aviso">Encargo anulado${e.motivoAnulacion ? `: ${esc(e.motivoAnulacion)}` : ''}.</p>` : ''}`,
    montar(dlg, form, cerrar) {
      const guardarLote = (fn, msj) => { const lote = nuevoLote(); fn(lote); enviar(lote.commit(), { alGuardar: avisoGuardado(toast, msj), alFallar: fallo }); cerrar(); };
      $('[data-estado]', dlg)?.addEventListener('click', (ev) => {
        const nuevo = ev.target.closest('button').dataset.estado;
        guardarLote((l) => cambiarEstado(l, e, nuevo), nuevo === 'listo' ? 'Encargo listo para entregar' : 'Encargo en el taller');
        if (nuevo === 'listo' && c.whatsapp) setTimeout(() => toast('Puedes avisarle por WhatsApp desde el detalle.'), 500);
      });
      $('[data-avisar]', dlg)?.addEventListener('click', () => window.open(enlaceWhatsApp(c.whatsapp, mensajeListo(e)), '_blank', 'noopener'));
      $('[data-editar]', dlg)?.addEventListener('click', () => { cerrar(); dialogoEncargo(e); });
      $('[data-abono]', dlg)?.addEventListener('click', () => { cerrar(); dialogoAbono(e); });
      $('[data-entregar]', dlg)?.addEventListener('click', () => { cerrar(); dialogoEntrega(e); });
      $('[data-anular]', dlg)?.addEventListener('click', async () => {
        cerrar();
        await formulario({
          titulo: `Anular ${etiquetaEncargo(e).toLowerCase()}`, textoGuardar: 'Anular encargo',
          cuerpo: `<p>El encargo queda anulado en el historial. Nada se borra.</p>
            ${abonado(e) ? `<label class="interruptor"><input type="checkbox" name="devolver"><span>Devolví el abono de ${pesos(abonado(e))} ${info('Márcalo si le devolviste la plata. Si el cliente pierde el abono, déjalo sin marcar: queda anotado en el encargo.')}</span></label>` : ''}
            <label class="campo"><span class="campo-etiqueta">Motivo</span><input name="motivo" maxlength="200"></label>`,
          guardar(f) {
            const lote = nuevoLote(); anularEncargo(lote, e, { devolverAbono: Boolean(f.devolver?.checked), motivo: f.motivo.value.trim() });
            enviar(lote.commit(), { alGuardar: avisoGuardado(toast, 'Encargo anulado'), alFallar: fallo });
            return null;
          }
        });
      });
    }
  });
}

async function dialogoAbono(e) {
  await formulario({
    titulo: `Abono · ${etiquetaEncargo(e)}`, textoGuardar: 'Guardar abono',
    cuerpo: `
      <p class="texto-suave">Saldo actual: <strong>${pesos(saldoEncargo(e))}</strong></p>
      <label class="campo"><span class="campo-etiqueta">Monto</span><span class="con-sufijo"><input name="monto" inputmode="numeric"><span class="sufijo">$</span></span></label>
      <div class="campo"><span class="campo-etiqueta">Medio de pago</span><div class="segmentado segmentado-chico">${medios(itemsActivos('mediosPago')[0]?.id)}</div></div>
      <label class="campo"><span class="campo-etiqueta">Fecha</span><input type="date" name="fecha" value="${hoyISO()}" max="${hoyISO()}"></label>`,
    guardar(form) {
      const monto = Math.round(leerNumero(form.monto.value) || 0);
      if (!(monto > 0)) return 'Escribe el monto del abono.';
      if (monto > saldoEncargo(e)) return `El abono no puede ser mayor que el saldo (${pesos(saldoEncargo(e))}).`;
      const lote = nuevoLote(); agregarAbono(lote, e, { monto, medio: form.medio.value, fecha: form.fecha.value || hoyISO() });
      enviar(lote.commit(), { alGuardar: avisoGuardado(toast, `Abono de ${pesos(monto)} guardado`), alFallar: fallo });
      return null;
    }
  });
}

async function dialogoEntrega(e) {
  const saldo = saldoEncargo(e);
  await formulario({
    titulo: `Entregar · ${e.clienteNombre}`, textoGuardar: saldo > 0 ? `Cobrar ${pesos(saldo)} y entregar` : 'Entregar',
    cuerpo: `
      <ul class="lista-bajos">
        <li><span>Total del encargo</span><span>${pesos(e.total)}</span></li>
        <li><span>Abonado</span><span>−${pesos(abonado(e))}</span></li>
        <li><strong>Saldo a cobrar</strong><strong>${pesos(saldo)}</strong></li>
      </ul>
      ${saldo > 0 ? `<div class="campo"><span class="campo-etiqueta">Medio de pago del saldo</span><div class="segmentado segmentado-chico">${medios(itemsActivos('mediosPago')[0]?.id)}</div></div>` : ''}
      <label class="campo"><span class="campo-etiqueta">Fecha de entrega</span><input type="date" name="fecha" value="${hoyISO()}" max="${hoyISO()}"></label>
      <div class="vr-boleta"><label class="interruptor"><input type="checkbox" name="boleta"><span>Emití boleta</span></label><input name="folio" inputmode="numeric" maxlength="20" placeholder="Folio" aria-label="Folio" class="input-folio"></div>
      <p class="texto-suave">Se registra la venta completa por ${pesos(e.total)}, con cada abono como parte del pago, y las piezas con ficha salen del stock. ${info('La venta queda en el historial con la fecha de entrega. La boleta es por el total del encargo.')}</p>
`,
    guardar(form) {
      const lote = nuevoLote();
      entregarEncargo(lote, e, { fecha: form.fecha.value || hoyISO(), medio: form.medio?.value || itemsActivos('mediosPago')[0]?.id, boleta: { emitida: form.boleta.checked || Boolean(form.folio.value.trim()), folio: form.folio.value.trim() } });
      enviar(lote.commit(), { alGuardar: avisoGuardado(toast, `${etiquetaEncargo(e)} entregado`), alFallar: fallo });
      return null;
    }
  });
}

