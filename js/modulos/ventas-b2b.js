// Ventas → Órdenes, Consignación y Por facturar (ventas a tiendas y empresas).
import { estado, alCambiar, enviar } from '../datos.js';
import { esc, info, toast, $, $$, formulario, confirmar, leerNumero, numero, pesos, hoyISO, fechaCorta } from '../ui.js';
import { nuevoLote } from '../stock.js';
import { vacio, avisoError, avisoGuardado } from '../comunes.js';
import { nombreCliente } from '../cobranza-core.js';
import { mesDe } from '../gastos-core.js';
import {
  precioCliente, totalesLineas, faltaStock, crearOrden, entregarOrden, anularOrden, etiquetaOV, etiquetaConsignacion,
  crearConsignacion, agregarAConsignacion, liquidarConsignacion, anularConsignacion, enTienda, piezasEnTienda, valorEnTienda,
  porFacturar, detalleFactura, datosParaSII, codigoParaSII, registrarFactura
} from '../b2b-core.js';
import { pdfOrden, pdfConsignacion, compartirPDF } from '../pdf.js';
import { enlaceFavorito, URL_FACTURADOR_SII, copiar } from '../favorito-sii.js';
import { editarCliente } from './ventas.js';
import { ICONOS } from '../iconos.js';

const fallo = avisoError(toast);
const norm = (t) => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const empresas = () => Object.values(estado.clientes).filter((c) => !c.archivado && c.tipo === 'empresa').sort((a, b) => nombreCliente(a).localeCompare(nombreCliente(b), 'es'));
const fichas = () => Object.values(estado.piezas).filter((p) => !p.archivado).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
const clienteDe = (x) => estado.clientes[x.clienteId] || { id: x.clienteId, nombre: x.clienteNombre, razonSocial: x.razonSocial, rut: x.rutCliente, rutLimpio: x.rutLimpio };
const plural = (n, s, p = `${s}s`) => `${numero(n, 0)} ${n === 1 ? s : p}`;
const nombreLinea = (l) => `${esc(l.nombre)}${l.calidad === 'segunda' ? ' <span class="texto-suave">(2ª)</span>' : ''}`;
let nk = 0;

// ================================================================ Editor de piezas
// Lista de piezas con cantidad y precio neto. `cliente()` da el cliente elegido
// para proponer su último precio.
function montarEditor(caja, ls, { cliente, conOtra = true, mostrarStock = true }) {
  function pintar() {
    const t = totalesLineas(ls.filter((l) => l.cantidad > 0 && l.precio > 0));
    caja.innerHTML = `
      <div class="b2b-agregar">
        <label class="campo"><span class="campo-etiqueta">Agregar pieza ${info('Elige la ficha. El precio que aparece es el último que le cobraste a este cliente por esa pieza o, si es la primera vez, el precio a tiendas de la ficha. Puedes cambiarlo.')}</span>
          <select data-agregar><option value="">Elige una pieza…</option>${fichas().map((p) => `<option value="${esc(p.id)}">${esc(p.nombre)}${mostrarStock ? ` · ${numero(p.stock || 0, 0)} en stock${p.stockSegunda ? `, ${numero(p.stockSegunda, 0)} de 2ª` : ''}` : ''}</option>`).join('')}</select></label>
        ${conOtra ? '<button type="button" class="btn btn-suave" data-otra>Otra pieza</button>' : ''}
      </div>
      ${ls.length ? `<ul class="b2b-lineas">${ls.map((l) => `
        <li data-key="${esc(l.key)}">
          ${l.piezaId ? `<span class="b2b-nombre">${esc(l.nombre)}</span>` : `<input class="b2b-nombre-input" data-nombre value="${esc(l.nombre)}" placeholder="Nombre de la pieza" aria-label="Nombre">`}
          <span class="b2b-datos">
            ${l.piezaId ? `<button type="button" class="vr-calidad ${l.calidad === 'segunda' ? 'segunda' : ''}" data-calidad title="Primera o segunda">${l.calidad === 'segunda' ? '2ª' : '1ª'}</button>` : '<span></span>'}
            <span class="con-sufijo b2b-cant"><input data-cant inputmode="numeric" value="${l.cantidad || ''}" aria-label="Cantidad"><span class="sufijo">u</span></span>
            <span class="con-sufijo b2b-precio"><input data-precio inputmode="numeric" value="${l.precio ? numero(l.precio, 0) : ''}" aria-label="Precio neto"><span class="sufijo">$</span></span>
            <span class="b2b-subtotal">${pesos((l.cantidad || 0) * (l.precio || 0))}</span>
            <button type="button" class="btn-icono" data-quitar aria-label="Quitar">✕</button>
          </span>
        </li>`).join('')}</ul>
        <div class="b2b-totales">
          <span>Neto <strong>${pesos(t.neto)}</strong></span><span>IVA <strong>${pesos(t.iva)}</strong></span><span>Total <strong>${pesos(t.total)}</strong></span>
        </div>` : '<p class="texto-suave">Todavía no hay piezas. Los precios son netos (sin IVA), como en la factura.</p>'}`;
    $('[data-agregar]', caja).addEventListener('change', (e) => {
      const p = estado.piezas[e.target.value];
      if (!p) return;
      ls.push({ key: `k${nk++}`, piezaId: p.id, nombre: p.nombre, calidad: 'primera', cantidad: 1, precio: precioCliente(cliente(), p.id), manual: false });
      pintar();
    });
    $('[data-otra]', caja)?.addEventListener('click', () => { ls.push({ key: `k${nk++}`, piezaId: null, nombre: '', calidad: 'primera', cantidad: 1, precio: 0, manual: true }); pintar(); $$('[data-nombre]', caja).pop()?.focus(); });
    $$('li[data-key]', caja).forEach((li) => {
      const l = ls.find((x) => x.key === li.dataset.key);
      $('[data-quitar]', li).addEventListener('click', () => { ls.splice(ls.indexOf(l), 1); pintar(); });
      $('[data-calidad]', li)?.addEventListener('click', () => { l.calidad = l.calidad === 'segunda' ? 'primera' : 'segunda'; pintar(); });
      $('[data-nombre]', li)?.addEventListener('input', (e) => { l.nombre = e.target.value; });
      $('[data-cant]', li).addEventListener('change', (e) => { l.cantidad = Math.round(leerNumero(e.target.value)) || 0; pintar(); });
      $('[data-precio]', li).addEventListener('change', (e) => { const v = leerNumero(e.target.value); l.precio = v >= 0 ? Math.round(v) : 0; l.manual = true; pintar(); });
    });
  }
  pintar();
  return {
    pintar,
    // Al cambiar de cliente se proponen sus precios (salvo los que se escribieron a mano).
    recalcular() { ls.forEach((l) => { if (l.piezaId && !l.manual) l.precio = precioCliente(cliente(), l.piezaId); }); pintar(); }
  };
}

function validarLineas(ls) {
  if (!ls.length) return 'Agrega al menos una pieza.';
  for (const l of ls) {
    if (!l.nombre.trim()) return 'Hay una pieza sin nombre.';
    if (!(l.cantidad > 0)) return `Revisa la cantidad de «${l.nombre}».`;
    if (!(l.precio > 0)) return `Escribe el precio neto de «${l.nombre}».`;
  }
  return null;
}

const selectorCliente = (actual) => `
  <label class="campo"><span class="campo-etiqueta">Cliente <span class="req">*</span> ${info('Tiendas, cafeterías y profesionales. Se crean en Ventas → Clientes, o aquí con «Nuevo». También se crean solos al cargar en Cobranza los XML de facturas emitidas.')}</span>
    <span class="con-boton"><select name="cliente"><option value="">Elige el cliente…</option>${empresas().map((c) => `<option value="${esc(c.id)}" ${c.id === actual ? 'selected' : ''}>${esc(nombreCliente(c))}</option>`).join('')}</select>
    <button type="button" class="btn btn-suave btn-chico" data-nuevo-cliente>Nuevo</button></span></label>`;

function conectarCliente(dlg, form, alElegir) {
  form.cliente.addEventListener('change', alElegir);
  $('[data-nuevo-cliente]', dlg).addEventListener('click', async () => {
    const c = await editarCliente(null, { tipoInicial: 'empresa' });
    if (!c) return;
    estado.clientes[c.id] = { ...c, ...(estado.clientes[c.id] || {}) };
    form.cliente.insertAdjacentHTML('beforeend', `<option value="${esc(c.id)}">${esc(nombreCliente(c))}</option>`);
    form.cliente.value = c.id;
    alElegir();
  });
}

// ================================================================ Órdenes de venta
export function vistaOrdenes(el) {
  const f = { texto: '', estado: '' };
  el.innerHTML = `
    <div class="resumen" data-resumen></div>
    <div class="barra-herramientas">
      <input type="search" class="buscador" placeholder="Buscar cliente o número" aria-label="Buscar orden">
      <select class="filtro" aria-label="Estado"><option value="">Todas</option><option value="entregar">Por entregar</option><option value="facturar">Por facturar</option><option value="facturada">Facturadas</option><option value="anulada">Anuladas</option></select>
      <span class="espacio"></span>
      <button class="btn btn-primario" data-nueva>${ICONOS.mas2}<span>Nueva orden</span></button>
    </div>
    <div data-lista></div>`;
  $('.buscador', el).addEventListener('input', (e) => { f.texto = e.target.value; pintar(); });
  $('.filtro', el).addEventListener('change', (e) => { f.estado = e.target.value; pintar(); });
  $('[data-nueva]', el).addEventListener('click', () => nuevaOrden());
  const lista = $('[data-lista]', el);
  function pintar() {
    const todas = Object.values(estado.ordenes).sort((a, b) => b.numero - a.numero);
    const vivas = todas.filter((o) => !o.anulada);
    const mes = mesDe(hoyISO());
    const pf = vivas.filter((o) => o.entregada && !o.facturada);
    $('[data-resumen]', el).innerHTML = `
      <div class="dato"><span class="dato-etq">Vendido a empresas este mes ${info('Suma neta (sin IVA) de las órdenes de venta del mes, entregadas o no.')}</span><span class="dato-valor">${pesos(vivas.filter((o) => o.mes === mes).reduce((s, o) => s + o.neto, 0))}</span></div>
      <div class="dato"><span class="dato-etq">Por entregar</span><span class="dato-valor">${vivas.filter((o) => !o.entregada).length}</span></div>
      <div class="dato ${pf.length ? 'dato-alerta' : ''}"><span class="dato-etq">Por facturar ${info('Órdenes entregadas que todavía no tienen factura. Se facturan en la pestaña Por facturar.')}</span><span class="dato-valor">${pf.length ? `${pf.length} · ${pesos(pf.reduce((s, o) => s + o.total, 0))}` : '0'}</span></div>`;
    if (!todas.length) {
      lista.innerHTML = vacio('Todavía no hay órdenes de venta', 'Una orden de venta es el pedido de una tienda o cafetería: qué piezas, cuántas y a qué precio. Se manda en PDF por WhatsApp, descuenta las piezas del stock al entregarlas y queda lista para facturar. Las piezas vendidas en consignación también llegan aquí como órdenes.', '<button class="btn btn-primario" data-nueva2>Crear la primera orden</button>');
      $('[data-nueva2]', lista)?.addEventListener('click', () => nuevaOrden());
      return;
    }
    const q = norm(f.texto.trim());
    const vis = todas.filter((o) => {
      if (f.estado === 'anulada' ? !o.anulada : o.anulada && f.estado !== '') return false;
      if (f.estado === 'entregar' && o.entregada) return false;
      if (f.estado === 'facturar' && (!o.entregada || o.facturada)) return false;
      if (f.estado === 'facturada' && !o.facturada) return false;
      return !q || norm(o.clienteNombre).includes(q) || String(o.numero) === q.replace(/\D/g, '');
    });
    if (!vis.length) { lista.innerHTML = vacio('Sin resultados', 'Prueba con otra búsqueda o cambia el filtro.'); return; }
    lista.innerHTML = `<section class="panel tabla-panel"><ul class="filas">${vis.map((o) => `
      <li><button class="fila ${o.anulada ? 'fila-anulada' : ''}" data-id="${esc(o.id)}">
        <span class="fila-principal"><span class="fila-nombre">${esc(etiquetaOV(o))} · ${esc(o.clienteNombre)}</span>
          <span class="fila-meta"><span>${fechaCorta(o.fecha)} · ${plural(o.piezas, 'pieza')}</span>${o.consignacionNumero ? `<span>De consignación ${esc(o.consignacionNumero)}</span>` : ''}${etiquetaEstado(o)}</span></span>
        <span class="fila-dato"><span class="fila-etq">Neto</span>${pesos(o.neto)}</span>
        <span class="fila-dato fila-dato-fuerte"><span class="fila-etq">Total</span>${pesos(o.total)}</span>
      </button></li>`).join('')}</ul></section>`;
    $$('.fila', lista).forEach((b) => b.addEventListener('click', () => detalleOrden(estado.ordenes[b.dataset.id])));
  }
  pintar();
  return alCambiar(pintar);
}

function etiquetaEstado(o) {
  if (o.anulada) return '<span class="etiqueta etiqueta-suave">Anulada</span>';
  if (o.facturada) return `<span class="etiqueta etiqueta-ok">Factura ${esc(o.folio)}</span>`;
  if (!o.entregada) return '<span class="etiqueta etiqueta-info">Por entregar</span>';
  return '<span class="etiqueta etiqueta-alerta">Por facturar</span>';
}

export async function nuevaOrden({ clienteId = '' } = {}) {
  const ls = [];
  let ed;
  let creada = null;
  await formulario({
    titulo: 'Nueva orden de venta', ancho: true, textoGuardar: 'Crear orden',
    cuerpo: `
      <div class="campos">
        ${selectorCliente(clienteId)}
        <label class="campo"><span class="campo-etiqueta">Fecha</span><input type="date" name="fecha" value="${hoyISO()}" max="${hoyISO()}"></label>
      </div>
      <div data-editor></div>
      <label class="interruptor"><input type="checkbox" name="entregar" checked><span>Se entrega ahora ${info('Las piezas salen del stock al entregarlas. Si la tienda pidió y todavía no se las llevas, desmárcalo: la orden queda «Por entregar» y la marcas cuando las entregues.')}</span></label>
      <label class="campo campo-ancho"><span class="campo-etiqueta">Nota</span><input name="nota" maxlength="200" placeholder="Ej.: pedido para la vitrina de diciembre"></label>`,
    montar(dlg, form) {
      ed = montarEditor($('[data-editor]', dlg), ls, { cliente: () => estado.clientes[form.cliente.value] });
      conectarCliente(dlg, form, () => ed.recalcular());
    },
    guardar(form) {
      const cliente = estado.clientes[form.cliente.value];
      if (!cliente) return 'Elige el cliente.';
      const err = validarLineas(ls);
      if (err) return err;
      if (form.entregar.checked) { const f = faltaStock(ls); if (f) return f; }
      const lote = nuevoLote();
      creada = crearOrden(lote, { cliente, fecha: form.fecha.value || hoyISO(), lineas: ls, entregar: form.entregar.checked, nota: form.nota.value.trim() });
      enviar(lote.commit(), { alGuardar: avisoGuardado(toast, `${etiquetaOV(creada)} creada: ${pesos(creada.total)}`), alFallar: fallo });
      return null;
    }
  });
  if (creada) detalleOrden(creada, { recienCreada: true });
}

async function enviarOrden(o) {
  const cliente = clienteDe(o);
  toast('Preparando el PDF…');
  try {
    const blob = await pdfOrden(o, cliente);
    const saludo = cliente.contacto ? cliente.contacto.split(' ')[0] : nombreCliente(cliente);
    const texto = `Hola ${saludo}, te envío la orden de venta N° ${o.numero} de ${estado.empresa?.nombreFantasia || 'Vadim Strika'}: ${plural(o.piezas, 'pieza')} por ${pesos(o.total)} con IVA. ¡Gracias!`;
    const r = await compartirPDF(blob, `OV ${o.numero} ${nombreCliente(cliente)}.pdf`, texto, cliente.whatsapp);
    if (r === 'descargado') toast('PDF descargado. Adjúntalo en el chat de WhatsApp que se abrió.');
  } catch (e) { console.error(e); toast('No se pudo generar el PDF. Revisa la conexión la primera vez que lo usas.', 'error'); }
}

export async function detalleOrden(o0, { recienCreada = false } = {}) {
  const o = estado.ordenes[o0.id] || o0;
  const margen = o.neto - (o.costo || 0);
  await formulario({
    titulo: `${etiquetaOV(o)} · ${o.clienteNombre}`, ancho: true, textoGuardar: '',
    extra: `<button type="button" class="btn btn-primario" data-enviar>PDF por WhatsApp</button>
      ${!o.anulada && !o.entregada ? '<button type="button" class="btn btn-suave" data-entregar>Marcar entregada</button>' : ''}
      ${!o.anulada && o.entregada && !o.facturada ? '<a class="btn btn-suave" href="#/ventas/por-facturar" data-ir>Facturar</a>' : ''}
      ${!o.anulada && !o.facturada ? '<button type="button" class="btn btn-peligro" data-anular>Anular</button>' : ''}`,
    cuerpo: `
      ${recienCreada ? `<p class="aviso aviso-ok">Orden creada.${o.entregada ? ' Las piezas ya salieron del stock y la orden quedó en «Por facturar».' : ' Cuando entregues las piezas, márcala como entregada.'}</p>` : ''}
      <div class="resumen resumen-chico">
        <div class="dato"><span class="dato-etq">Neto</span><span class="dato-valor">${pesos(o.neto)}</span></div>
        <div class="dato"><span class="dato-etq">Total con IVA</span><span class="dato-valor">${pesos(o.total)}</span></div>
        <div class="dato"><span class="dato-etq">Margen ${info('Precio neto menos lo que costó hacer las piezas (costo real del lote, o el de la ficha si no hay lotes).')}</span><span class="dato-valor ${margen < 0 ? 'texto-alerta' : ''}">${pesos(margen)}</span></div>
      </div>
      <dl class="datos-fijos compacto">
        <div><dt>Fecha</dt><dd>${fechaCorta(o.fecha)}</dd></div>
        <div><dt>Estado</dt><dd>${etiquetaEstado(o)}</dd></div>
        ${o.entregada && o.fechaEntrega ? `<div><dt>Entregada</dt><dd>${fechaCorta(o.fechaEntrega)}</dd></div>` : ''}
        ${o.consignacionNumero ? `<div><dt>Origen</dt><dd>Vendido en ${esc(etiquetaConsignacion({ numero: o.consignacionNumero }).toLowerCase())}</dd></div>` : ''}
        ${o.facturada ? `<div><dt>Factura</dt><dd>Folio ${esc(o.folio)} · ${fechaCorta(o.fechaFactura)}</dd></div>` : ''}
        ${o.nota ? `<div><dt>Nota</dt><dd>${esc(o.nota)}</dd></div>` : ''}
      </dl>
      <h3>Piezas</h3>
      <ul class="lista-bajos">${o.lineas.map((l) => `<li><span>${l.cantidad} × ${nombreLinea(l)} <span class="texto-tenue">a ${pesos(l.precio)}</span></span><span>${pesos(l.subtotal)}</span></li>`).join('')}
        <li><span>IVA 19%</span><span>${pesos(o.iva)}</span></li>
        <li><strong>Total</strong><strong>${pesos(o.total)}</strong></li></ul>
      ${o.anulada ? `<p class="aviso">Orden anulada${o.motivoAnulacion ? `: ${esc(o.motivoAnulacion)}` : ''}.</p>` : ''}`,
    montar(dlg, form, cerrar) {
      $('[data-enviar]', dlg).addEventListener('click', () => enviarOrden(o));
      $('[data-ir]', dlg)?.addEventListener('click', () => cerrar());
      $('[data-entregar]', dlg)?.addEventListener('click', async () => {
        const f = faltaStock(o.lineas);
        if (f) { toast(f, 'error'); return; }
        if (!(await confirmar('Marcar entregada', `Las ${plural(o.piezas, 'pieza')} salen del stock hoy y la orden pasa a «Por facturar».`, 'Entregada'))) return;
        const lote = nuevoLote(); entregarOrden(lote, o, hoyISO());
        enviar(lote.commit(), { alGuardar: avisoGuardado(toast, `${etiquetaOV(o)} entregada`), alFallar: fallo });
        cerrar();
      });
      $('[data-anular]', dlg)?.addEventListener('click', async () => {
        const txt = o.origen === 'consignacion' ? 'Las piezas vuelven a contar como «en la tienda» en su consignación.' : o.entregada ? 'Las piezas vuelven al stock.' : 'Todavía no salían del stock.';
        if (!(await confirmar('Anular orden', `${esc(etiquetaOV(o))} queda anulada en el historial. ${txt} Nada se borra.`, 'Anular orden', true))) return;
        const lote = nuevoLote();
        try { anularOrden(lote, o); } catch (e) { toast(e.message, 'error'); return; }
        enviar(lote.commit(), { alGuardar: avisoGuardado(toast, `${etiquetaOV(o)} anulada`), alFallar: fallo });
        cerrar();
      });
    }
  });
}

// ================================================================ Consignación
export function vistaConsignacion(el) {
  const f = { cerradas: false };
  el.innerHTML = `
    <div class="resumen" data-resumen></div>
    <div class="barra-herramientas">
      <label class="interruptor"><input type="checkbox" data-cerradas><span>Ver cerradas</span></label>
      <span class="espacio"></span>
      <button class="btn btn-primario" data-nueva>${ICONOS.mas2}<span>Nueva consignación</span></button>
    </div>
    <div data-lista></div>`;
  $('[data-cerradas]', el).addEventListener('change', (e) => { f.cerradas = e.target.checked; pintar(); });
  $('[data-nueva]', el).addEventListener('click', () => dialogoConsignacion());
  const lista = $('[data-lista]', el);
  function pintar() {
    const todas = Object.values(estado.consignaciones).sort((a, b) => b.numero - a.numero);
    const abiertas = todas.filter((c) => !c.anulada && !c.cerrada);
    $('[data-resumen]', el).innerHTML = `
      <div class="dato"><span class="dato-etq">Tiendas con piezas</span><span class="dato-valor">${new Set(abiertas.map((c) => c.clienteId)).size}</span></div>
      <div class="dato"><span class="dato-etq">Piezas en tiendas</span><span class="dato-valor">${numero(abiertas.reduce((s, c) => s + piezasEnTienda(c), 0), 0)}</span></div>
      <div class="dato"><span class="dato-etq">Valor en tiendas ${info('Lo que pagarían las tiendas, neto, si vendieran todo lo que tienen en consignación.')}</span><span class="dato-valor">${pesos(abiertas.reduce((s, c) => s + valorEnTienda(c), 0))}</span></div>`;
    if (!todas.length) {
      lista.innerHTML = vacio('Nada en consignación', 'Cuando dejes piezas en una tienda para que las venda, regístralas aquí: salen de tu stock y quedan «en la tienda». Cada cierto tiempo haces la liquidación: lo vendido se convierte en una orden de venta lista para facturar, y lo que no se vendió sigue en la tienda o vuelve al taller.', '<button class="btn btn-primario" data-nueva2>Registrar una consignación</button>');
      $('[data-nueva2]', lista)?.addEventListener('click', () => dialogoConsignacion());
      return;
    }
    const vis = f.cerradas ? todas : abiertas;
    if (!vis.length) { lista.innerHTML = vacio('No hay consignaciones abiertas', 'Todas están cerradas. Marca «Ver cerradas» para revisarlas.'); return; }
    lista.innerHTML = `<div class="deudores">${vis.map((c) => {
      const ult = (c.liquidaciones || []).slice(-1)[0];
      const n = piezasEnTienda(c);
      return `
      <article class="panel deudor ${c.cerrada ? 'b2b-cerrada' : ''}" data-id="${esc(c.id)}">
        <div class="deudor-cabeza">
          <div><h2>${esc(c.clienteNombre)}</h2>
            <p class="texto-suave">${esc(etiquetaConsignacion(c))} · desde el ${fechaCorta(c.fecha)}${ult ? ` · última liquidación ${fechaCorta(ult.fecha)}` : ' · sin liquidar'}${c.anulada ? ' · anulada' : c.cerrada ? ' · cerrada' : ''}</p></div>
          <span class="deudor-total">${plural(n, 'pieza')}</span>
        </div>
        <p class="b2b-piezas">${c.lineas.filter((l) => enTienda(l) > 0).map((l) => `${enTienda(l)} ${esc(l.nombre)}${l.calidad === 'segunda' ? ' (2ª)' : ''}`).join(' · ') || '<span class="texto-suave">No quedan piezas en la tienda.</span>'}</p>
        <div class="deudor-acciones">
          <span class="texto-suave b2b-valor">${pesos(valorEnTienda(c))} neto en la tienda</span>
          <button class="btn btn-suave btn-chico" data-ver>Ver detalle</button>
          ${!c.cerrada ? '<button class="btn btn-primario btn-chico" data-liquidar>Liquidar</button>' : ''}
        </div>
      </article>`;
    }).join('')}</div>`;
    $$('.deudor', lista).forEach((card) => {
      const c = estado.consignaciones[card.dataset.id];
      $('[data-ver]', card).addEventListener('click', () => detalleConsignacion(c));
      $('[data-liquidar]', card)?.addEventListener('click', () => liquidar(c));
    });
  }
  pintar();
  return alCambiar(pintar);
}

// Nueva consignación, o más piezas para una que ya existe (`existente`).
async function dialogoConsignacion(existente = null) {
  const ls = [];
  let ed;
  let creada = null;
  await formulario({
    titulo: existente ? `Más piezas · ${existente.clienteNombre}` : 'Nueva consignación', ancho: true,
    textoGuardar: existente ? 'Agregar piezas' : 'Registrar entrega',
    cuerpo: `
      <p class="texto-suave">Las piezas salen de tu stock y quedan «en la tienda» hasta que se vendan o vuelvan. ${info('Siguen siendo tuyas: valen lo que costó hacerlas y aparecen en Inventario como «en consignación». El precio es el neto que te paga la tienda por cada pieza vendida.')}</p>
      <div class="campos">
        ${existente ? `<div class="campo"><span class="campo-etiqueta">Cliente</span><strong>${esc(existente.clienteNombre)}</strong></div>` : selectorCliente('')}
        <label class="campo"><span class="campo-etiqueta">Fecha de entrega</span><input type="date" name="fecha" value="${hoyISO()}" max="${hoyISO()}"></label>
      </div>
      <div data-editor></div>
      ${existente ? '' : '<label class="campo campo-ancho"><span class="campo-etiqueta">Nota</span><input name="nota" maxlength="200" placeholder="Ej.: comisión acordada, vitrina, plazo para liquidar"></label>'}`,
    montar(dlg, form) {
      const cli = () => (existente ? estado.clientes[existente.clienteId] : estado.clientes[form.cliente.value]);
      ed = montarEditor($('[data-editor]', dlg), ls, { cliente: cli });
      if (!existente) conectarCliente(dlg, form, () => ed.recalcular());
    },
    guardar(form) {
      const cliente = existente ? clienteDe(existente) : estado.clientes[form.cliente.value];
      if (!cliente) return 'Elige el cliente.';
      const err = validarLineas(ls) || faltaStock(ls);
      if (err) return err;
      const fecha = form.fecha.value || hoyISO();
      const lote = nuevoLote();
      const n = ls.reduce((s, l) => s + l.cantidad, 0);
      if (existente) {
        agregarAConsignacion(lote, estado.consignaciones[existente.id] || existente, { fecha, lineas: ls });
        enviar(lote.commit(), { alGuardar: avisoGuardado(toast, `${plural(n, 'pieza')} más en ${existente.clienteNombre}`), alFallar: fallo });
      } else {
        // Si ya hay una consignación abierta con esa tienda, se suman ahí.
        const abierta = Object.values(estado.consignaciones).find((c) => !c.anulada && !c.cerrada && c.clienteId === cliente.id);
        if (abierta) {
          agregarAConsignacion(lote, abierta, { fecha, lineas: ls });
          creada = abierta;
          enviar(lote.commit(), { alGuardar: avisoGuardado(toast, `Sumadas a la ${etiquetaConsignacion(abierta).toLowerCase()} abierta con ${cliente.nombre}`), alFallar: fallo });
        } else {
          creada = crearConsignacion(lote, { cliente, fecha, lineas: ls, nota: form.nota.value.trim() });
          enviar(lote.commit(), { alGuardar: avisoGuardado(toast, `${etiquetaConsignacion(creada)}: ${plural(n, 'pieza')} en ${cliente.nombre}`), alFallar: fallo });
        }
      }
      return null;
    }
  });
  if (creada) setTimeout(() => detalleConsignacion(estado.consignaciones[creada.id] || creada), 50);
}

async function comprobante(c) {
  const cliente = clienteDe(c);
  toast('Preparando el PDF…');
  try {
    const blob = await pdfConsignacion(c, cliente, { enTienda });
    const texto = `Hola, te envío el detalle de las piezas de ${estado.empresa?.nombreFantasia || 'Vadim Strika'} en consignación: ${plural(piezasEnTienda(c), 'pieza')}.`;
    const r = await compartirPDF(blob, `Consignacion ${c.numero} ${nombreCliente(cliente)}.pdf`, texto, cliente.whatsapp);
    if (r === 'descargado') toast('PDF descargado. Adjúntalo en el chat de WhatsApp que se abrió.');
  } catch (e) { console.error(e); toast('No se pudo generar el PDF. Revisa la conexión la primera vez que lo usas.', 'error'); }
}

async function detalleConsignacion(c0) {
  const c = estado.consignaciones[c0.id] || c0;
  const vendidas = c.lineas.reduce((s, l) => s + (l.vendidas || 0), 0);
  const hist = [
    ...(c.entregas || []).map((e) => ({ fecha: e.fecha, txt: `Entrega de ${plural(e.piezas, 'pieza')}` })),
    ...(c.liquidaciones || []).map((q) => ({
      fecha: q.fecha, ordenId: q.ordenId,
      txt: `Liquidación: ${[q.vendidas && `${q.vendidas} vendida${q.vendidas > 1 ? 's' : ''}${q.ordenNumero ? ` (OV ${q.ordenNumero})` : ''}`, q.vuelven && `${q.vuelven} vuelven`, q.vuelvenSegunda && `${q.vuelvenSegunda} vuelven dañadas`, q.perdidas && `${q.perdidas} perdidas`].filter(Boolean).join(', ')}`
    }))
  ].sort((a, b) => b.fecha.localeCompare(a.fecha));
  await formulario({
    titulo: `${etiquetaConsignacion(c)} · ${c.clienteNombre}`, ancho: true, textoGuardar: '',
    extra: `${!c.cerrada ? '<button type="button" class="btn btn-primario" data-liquidar>Liquidar</button><button type="button" class="btn btn-suave" data-mas>Más piezas</button>' : ''}
      <button type="button" class="btn btn-suave" data-pdf>Comprobante PDF</button>
      ${!c.anulada && !(c.liquidaciones || []).length ? '<button type="button" class="btn btn-peligro" data-anular>Anular</button>' : ''}`,
    cuerpo: `
      <div class="resumen resumen-chico">
        <div class="dato"><span class="dato-etq">En la tienda</span><span class="dato-valor">${numero(piezasEnTienda(c), 0)}</span></div>
        <div class="dato"><span class="dato-etq">Valor neto en la tienda</span><span class="dato-valor">${pesos(valorEnTienda(c))}</span></div>
        <div class="dato"><span class="dato-etq">Vendidas hasta ahora</span><span class="dato-valor">${numero(vendidas, 0)}</span></div>
      </div>
      <div class="tabla-scroll"><table class="tabla"><thead><tr><th>Pieza</th><th class="num">Precio neto</th><th class="num">Entregadas</th><th class="num">Vendidas</th><th class="num">Volvieron</th><th class="num">Perdidas</th><th class="num">En la tienda</th></tr></thead><tbody>
        ${c.lineas.map((l) => `<tr><td><span class="celda-nombre">${nombreLinea(l)}</span></td><td class="num">${pesos(l.precio)}</td><td class="num">${l.entregadas}</td><td class="num">${l.vendidas || 0}</td><td class="num">${l.devueltas || 0}</td><td class="num">${l.perdidas || 0}</td><td class="num"><strong>${enTienda(l)}</strong></td></tr>`).join('')}
      </tbody></table></div>
      <h3>Historial</h3>
      <ul class="lista-bajos">${hist.map((h) => `<li><span>${fechaCorta(h.fecha)} · ${esc(h.txt)}</span>${h.ordenId ? `<button type="button" class="btn-enlace" data-orden="${esc(h.ordenId)}">Ver orden</button>` : '<span></span>'}</li>`).join('')}</ul>
      ${c.nota ? `<p class="texto-suave">Nota: ${esc(c.nota)}</p>` : ''}
      ${c.anulada ? `<p class="aviso">Consignación anulada${c.motivoAnulacion ? `: ${esc(c.motivoAnulacion)}` : ''}. Las piezas volvieron al stock.</p>` : ''}`,
    montar(dlg, form, cerrar) {
      $('[data-liquidar]', dlg)?.addEventListener('click', () => { cerrar(); liquidar(c); });
      $('[data-mas]', dlg)?.addEventListener('click', () => { cerrar(); dialogoConsignacion(c); });
      $('[data-pdf]', dlg).addEventListener('click', () => comprobante(c));
      $$('[data-orden]', dlg).forEach((b) => b.addEventListener('click', () => { const o = estado.ordenes[b.dataset.orden]; if (o) { cerrar(); detalleOrden(o); } }));
      $('[data-anular]', dlg)?.addEventListener('click', async () => {
        if (!(await confirmar('Anular consignación', 'Úsalo si la registraste por error: las piezas vuelven al stock y la consignación queda anulada en el historial. Si la tienda te devolvió piezas, mejor haz una liquidación con «vuelven al taller».', 'Anular', true))) return;
        const lote = nuevoLote();
        try { anularConsignacion(lote, c); } catch (e) { toast(e.message, 'error'); return; }
        enviar(lote.commit(), { alGuardar: avisoGuardado(toast, `${etiquetaConsignacion(c)} anulada`), alFallar: fallo });
        cerrar();
      });
    }
  });
}

async function liquidar(c0) {
  const c = estado.consignaciones[c0.id] || c0;
  const ls = c.lineas.filter((l) => enTienda(l) > 0);
  let res = null;
  const campo = (k, l) => `<td class="num"><input data-${k} inputmode="numeric" class="input-folio b2b-num" aria-label="${l}" placeholder="0"></td>`;
  await formulario({
    titulo: `Liquidar · ${c.clienteNombre}`, ancho: true, textoGuardar: 'Guardar liquidación',
    cuerpo: `
      <p class="texto-suave">Anota lo que te informa la tienda. Lo vendido se convierte en una orden de venta lista para facturar. ${info('Vendidas: las que la tienda vendió y te va a pagar (si perdió o rompió una y la paga, cuéntala como vendida). Vuelven: las que te llevas al taller en buen estado. Vuelven dañadas: entran a tu stock como de segunda. Perdidas: las que no vuelven y nadie paga; su costo queda como pérdida. Lo que no anotes sigue en la tienda.')}</p>
      <label class="campo"><span class="campo-etiqueta">Fecha</span><input type="date" name="fecha" value="${hoyISO()}" max="${hoyISO()}"></label>
      <div class="tabla-scroll"><table class="tabla tabla-entrada b2b-liquidar"><thead><tr><th>Pieza</th><th class="num">En la tienda</th><th class="num">Vendidas</th><th class="num">Vuelven</th><th class="num">Vuelven dañadas</th><th class="num">Perdidas</th></tr></thead><tbody>
        ${ls.map((l) => `<tr data-key="${esc(l.key)}"><td><span class="celda-nombre">${nombreLinea(l)}</span><span class="celda-sub">${pesos(l.precio)} neto</span></td><td class="num"><strong>${enTienda(l)}</strong></td>
          ${campo('v', 'Vendidas')}${campo('b', 'Vuelven')}${campo('s', 'Vuelven dañadas')}${campo('p', 'Perdidas')}</tr>`).join('')}
      </tbody></table></div>
      <div class="grupo-botones"><button type="button" class="btn btn-suave btn-chico" data-resto>Lo que no se vendió vuelve al taller</button></div>
      <p class="aviso aviso-info" data-resumen></p>`,
    montar(dlg) {
      const filas = () => $$('tbody tr', dlg).map((tr) => {
        const n = (k) => Math.max(0, Math.round(leerNumero($(`[data-${k}]`, tr).value) || 0));
        return { tr, l: ls.find((x) => x.key === tr.dataset.key), vendidas: n('v'), vuelven: n('b'), vuelvenSegunda: n('s'), perdidas: n('p') };
      });
      const resumen = () => {
        const fs = filas();
        const neto = fs.reduce((s, f) => s + f.vendidas * f.l.precio, 0);
        const v = fs.reduce((s, f) => s + f.vendidas, 0);
        const vuelve = fs.reduce((s, f) => s + f.vuelven + f.vuelvenSegunda, 0);
        const quedan = fs.reduce((s, f) => s + enTienda(f.l) - f.vendidas - f.vuelven - f.vuelvenSegunda - f.perdidas, 0);
        fs.forEach((f) => f.tr.classList.toggle('fila-alerta', f.vendidas + f.vuelven + f.vuelvenSegunda + f.perdidas > enTienda(f.l)));
        $('[data-resumen]', dlg).textContent = v || vuelve
          ? `${v ? `Se crea una orden de venta por ${pesos(neto)} neto (${pesos(neto + Math.round(neto * 0.19))} con IVA). ` : ''}${vuelve ? `Vuelven al taller ${vuelve}. ` : ''}${quedan > 0 ? `Siguen en la tienda ${quedan}.` : 'La consignación queda cerrada.'}`
          : 'Anota cuántas se vendieron y cuántas vuelven.';
      };
      $$('input', $('tbody', dlg)).forEach((i) => i.addEventListener('input', resumen));
      $('[data-resto]', dlg).addEventListener('click', () => {
        filas().forEach((f) => { $('[data-b]', f.tr).value = String(Math.max(0, enTienda(f.l) - f.vendidas - f.vuelvenSegunda - f.perdidas)); });
        resumen();
      });
      resumen();
    },
    guardar(form, dlg) {
      const filas = $$('tbody tr', dlg).map((tr) => {
        const n = (k) => Math.max(0, Math.round(leerNumero($(`[data-${k}]`, tr).value) || 0));
        return { key: tr.dataset.key, vendidas: n('v'), vuelven: n('b'), vuelvenSegunda: n('s'), perdidas: n('p') };
      });
      const lote = nuevoLote();
      try { res = liquidarConsignacion(lote, estado.consignaciones[c.id] || c, { fecha: form.fecha.value || hoyISO(), filas }); } catch (e) { return e.message; }
      enviar(lote.commit(), {
        alGuardar: avisoGuardado(toast, res.orden ? `Liquidación guardada: ${etiquetaOV(res.orden)} por ${pesos(res.orden.total)}` : 'Liquidación guardada'),
        alFallar: fallo
      });
      return null;
    }
  });
  if (res?.orden) setTimeout(() => detalleOrden(res.orden, { recienCreada: true }), 50);
}

// ================================================================ Por facturar
export function vistaPorFacturar(el) {
  const elegidas = {}; // clienteId → Set de ids de OV desmarcadas
  el.innerHTML = `
    <details class="panel favorito" data-fav>
      <summary><span class="favorito-titulo">Favorito para el facturador del SII</span> <span class="texto-suave">Se instala una vez en el computador</span></summary>
      <div class="favorito-cuerpo">
        <p>El favorito escribe la factura por ti en el facturador gratuito del SII: el RUT del cliente, el detalle y la referencia a la orden de venta (nota de pedido). ${info('No envía datos a ningún lado: solo escribe en la página del SII que tienes abierta. Tú revisas y firmas como siempre.')}</p>
        <ol class="lista-puntos">
          <li>En Chrome, muestra la barra de favoritos: <strong>Ctrl + Shift + B</strong> (en Mac, <strong>Cmd + Shift + B</strong>).</li>
          <li>Arrastra este botón hasta la barra: <a class="btn btn-suave btn-chico" href="${esc(enlaceFavorito())}" data-favorito draggable="true">VS → SII</a></li>
          <li>Para facturar: en «Por facturar» toca <strong>Preparar factura</strong>, luego <strong>Copiar para el SII</strong>, abre el facturador y haz clic en el favorito. Primero escribe el RUT; cuando el SII cargue los datos del cliente, haz clic otra vez y escribe el detalle y la referencia.</li>
        </ol>
        <p class="aviso aviso-suave">Los nombres de los campos del facturador hay que confirmarlos con tu favorito actual. Si algo no se rellena, el favorito te dice qué falta para escribirlo a mano. Si no encuentra el RUT, te muestra la lista de campos de la página: cópiala y mándala para ajustarlo.</p>
        <div class="grupo-botones"><button type="button" class="btn btn-suave btn-chico" data-copiar-fav>Copiar el código del favorito</button></div>
      </div>
    </details>
    <div class="resumen" data-resumen></div>
    <div data-lista></div>`;
  $('[data-favorito]', el).addEventListener('click', (e) => { e.preventDefault(); toast('Arrástralo a la barra de favoritos; aquí no hace nada.', 'aviso'); });
  $('[data-copiar-fav]', el).addEventListener('click', async () => {
    toast(await copiar(enlaceFavorito()) ? 'Código copiado. Crea un favorito nuevo y pégalo como dirección (URL).' : 'No se pudo copiar.', 'ok');
  });
  const lista = $('[data-lista]', el);
  function pintar() {
    const os = porFacturar();
    const porCliente = new Map();
    os.forEach((o) => porCliente.set(o.clienteId, [...(porCliente.get(o.clienteId) || []), o]));
    const sinEntregar = Object.values(estado.ordenes).filter((o) => !o.anulada && !o.entregada).length;
    $('[data-resumen]', el).innerHTML = `
      <div class="dato ${os.length ? 'dato-alerta' : ''}"><span class="dato-etq">Por facturar</span><span class="dato-valor">${pesos(os.reduce((s, o) => s + o.total, 0))}</span></div>
      <div class="dato"><span class="dato-etq">Órdenes · clientes</span><span class="dato-valor">${os.length} · ${porCliente.size}</span></div>
      <div class="dato"><span class="dato-etq">Por entregar ${info('Órdenes que todavía no se entregan. Se facturan después de entregarlas.')}</span><span class="dato-valor">${sinEntregar}</span></div>`;
    if (!os.length) {
      lista.innerHTML = vacio('Nada por facturar', 'Aquí aparecen las órdenes de venta entregadas que todavía no tienen factura, juntas por cliente. Puedes facturar varias órdenes de un cliente en una sola factura.', '<a class="btn btn-suave" href="#/ventas/ordenes">Ver órdenes</a>');
      return;
    }
    const grupos = [...porCliente.entries()].map(([id, l]) => ({ cliente: clienteDe(l[0]), ordenes: l.sort((a, b) => a.numero - b.numero) }))
      .sort((a, b) => a.ordenes[0].fecha.localeCompare(b.ordenes[0].fecha));
    lista.innerHTML = `<div class="deudores">${grupos.map((g) => {
      const fuera = elegidas[g.cliente.id] || new Set();
      const sel = g.ordenes.filter((o) => !fuera.has(o.id));
      const faltan = [!g.cliente.rut && 'RUT', !g.cliente.giro && 'giro', !g.cliente.direccion && 'dirección'].filter(Boolean);
      return `
      <article class="panel deudor" data-cliente="${esc(g.cliente.id)}">
        <div class="deudor-cabeza">
          <div><h2>${esc(nombreCliente(g.cliente))}</h2>
            <p class="texto-suave">${esc(g.cliente.rut || 'Sin RUT')} · ${plural(g.ordenes.length, 'orden', 'órdenes')}${faltan.length ? ` · <span class="texto-alerta">falta ${faltan.join(', ')}</span>` : ''}</p></div>
          <span class="deudor-total">${pesos(detalleFactura(sel).total)}</span>
        </div>
        <ul class="b2b-ovs">${g.ordenes.map((o) => `
          <li><label class="interruptor"><input type="checkbox" data-ov="${esc(o.id)}" ${fuera.has(o.id) ? '' : 'checked'}>
            <span>${esc(etiquetaOV(o))} · ${fechaCorta(o.fecha)} · ${plural(o.piezas, 'pieza')}${o.consignacionNumero ? ' · de consignación' : ''}</span></label>
            <span class="b2b-ov-monto">${pesos(o.total)}</span></li>`).join('')}</ul>
        <div class="deudor-acciones">
          ${faltan.length ? '<button class="btn btn-suave btn-chico" data-editar>Completar datos</button>' : ''}
          <button class="btn btn-primario btn-chico" data-preparar ${sel.length ? '' : 'disabled'}>Preparar factura${sel.length > 1 ? ` de ${sel.length} órdenes` : ''}</button>
        </div>
      </article>`;
    }).join('')}</div>`;
    $$('.deudor', lista).forEach((card) => {
      const g = grupos.find((x) => x.cliente.id === card.dataset.cliente);
      $$('[data-ov]', card).forEach((cb) => cb.addEventListener('change', () => {
        const s = elegidas[g.cliente.id] || (elegidas[g.cliente.id] = new Set());
        if (cb.checked) s.delete(cb.dataset.ov); else s.add(cb.dataset.ov);
        pintar();
      }));
      $('[data-editar]', card)?.addEventListener('click', () => editarCliente(estado.clientes[g.cliente.id]));
      $('[data-preparar]', card).addEventListener('click', () => {
        const fuera = elegidas[g.cliente.id] || new Set();
        prepararFactura(g.ordenes.filter((o) => !fuera.has(o.id)), estado.clientes[g.cliente.id] || g.cliente);
      });
    });
  }
  pintar();
  return alCambiar(pintar);
}

async function prepararFactura(ordenes, cliente) {
  if (!cliente.rut) { toast('El cliente no tiene RUT. Complétalo en Ventas → Clientes.', 'error'); return; }
  const datos = datosParaSII(ordenes, cliente);
  const fila = (etq, valor, copiable = true) => `<li><span class="texto-suave">${etq}</span><span class="b2b-copiar"><span>${esc(valor || '—')}</span>${copiable && valor ? `<button type="button" class="btn-enlace" data-copia="${esc(valor)}">Copiar</button>` : ''}</span></li>`;
  await formulario({
    titulo: `Factura a ${nombreCliente(cliente)}`, ancho: true, textoGuardar: 'Anotar folio',
    cuerpo: `
      <ol class="pasos-sii">
        <li><strong>Copia los datos</strong> y abre el facturador del SII.
          <div class="grupo-botones"><button type="button" class="btn btn-primario btn-chico" data-copiar>Copiar para el SII</button>
            <a class="btn btn-suave btn-chico" href="${esc(URL_FACTURADOR_SII)}" target="_blank" rel="noopener">Abrir el facturador</a></div></li>
        <li><strong>Haz clic en el favorito</strong> «VS → SII»: escribe el RUT. Cuando el SII cargue el cliente, otro clic: escribe el detalle y la referencia. ${info('Si no tienes el favorito, instálalo desde el recuadro «Favorito para el facturador del SII» en esta misma pestaña, o copia los datos de abajo uno por uno.')}</li>
        <li><strong>Revisa que el total sea ${pesos(datos.total)}</strong>, firma y anota aquí el folio que te da el SII.</li>
      </ol>
      <details class="b2b-manual"><summary>Datos para copiar a mano</summary>
        <ul class="lista-bajos">
          ${fila('RUT', datos.rutCompleto)}${fila('Razón social', datos.razonSocial)}${fila('Giro', datos.giro)}${fila('Dirección', datos.direccion)}${fila('Comuna', datos.comuna)}
        </ul>
        <h3>Detalle</h3>
        <ul class="lista-bajos">${datos.lineas.map((l) => `<li><span class="b2b-copiar"><span>${esc(l.nombre)}</span><button type="button" class="btn-enlace" data-copia="${esc(l.nombre)}">Copiar</button></span><span>${l.cantidad} × ${pesos(l.precio)}</span></li>`).join('')}
          <li><span>Neto · IVA</span><span>${pesos(datos.neto)} · ${pesos(datos.iva)}</span></li>
          <li><strong>Total</strong><strong>${pesos(datos.total)}</strong></li></ul>
        <h3>Referencias ${info('En la sección Referencias de la factura: tipo de documento «Nota de pedido» (código 802), con el número de la orden de venta y su fecha.')}</h3>
        <ul class="lista-bajos">${datos.referencias.map((r) => `<li><span>Nota de pedido (802) · N° ${esc(r.folio)}</span><span>${esc(r.fecha)}</span></li>`).join('')}</ul>
      </details>
      <div class="campos">
        <label class="campo"><span class="campo-etiqueta">Folio de la factura <span class="req">*</span></span><input name="folio" inputmode="numeric" maxlength="12" autocomplete="off"></label>
        <label class="campo"><span class="campo-etiqueta">Fecha de emisión</span><input type="date" name="fecha" value="${hoyISO()}" max="${hoyISO()}"></label>
      </div>
      <p class="texto-suave">Al anotar el folio, la factura pasa a Cobranza con vencimiento a ${Number(cliente.condicionDias ?? 30) || 0} días. ${info('Si después cargas el XML de esta factura en Cobranza, la app la reconoce por el folio y no la duplica.')}</p>`,
    montar(dlg) {
      $('[data-copiar]', dlg).addEventListener('click', async (e) => {
        const ok = await copiar(codigoParaSII(datos));
        toast(ok ? 'Copiado. Abre el facturador y haz clic en el favorito.' : 'No se pudo copiar. Usa los datos para copiar a mano.', ok ? 'ok' : 'error');
        if (ok) e.target.textContent = 'Copiado ✓';
      });
      $$('[data-copia]', dlg).forEach((b) => b.addEventListener('click', async () => { if (await copiar(b.dataset.copia)) { b.textContent = 'Copiado ✓'; setTimeout(() => { b.textContent = 'Copiar'; }, 1500); } }));
    },
    async guardar(form) {
      const folio = form.folio.value.replace(/\D/g, '');
      if (!folio) return 'Escribe el folio de la factura que emitiste en el SII.';
      const lote = nuevoLote();
      let r;
      try { r = await registrarFactura(lote, { ordenes, cliente, folio, fecha: form.fecha.value || hoyISO() }); } catch (e) { console.error(e); return 'No se pudo revisar si la factura ya existe. Revisa la conexión.'; }
      enviar(lote.commit(), {
        alGuardar: avisoGuardado(toast, r.vinculada ? `Factura ${folio} vinculada con la que ya estaba en Cobranza` : `Factura ${folio} en Cobranza: ${pesos(datos.total)}`),
        alFallar: fallo
      });
      if (r.vinculada && r.diferencia) setTimeout(() => toast(`Ojo: la factura ${folio} en Cobranza es por ${pesos(datos.total + r.diferencia)}, no ${pesos(datos.total)}. Revísala.`, 'aviso'), 600);
      return null;
    }
  });
}
