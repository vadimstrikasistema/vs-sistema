// Ventas → Venta rápida, Historial, Ferias y Análisis.
import { estado, alCambiar, enviar, firma, itemsActivos, nombreItem } from '../datos.js';
import {
  esc, info, toast, $, $$, formulario, confirmar, leerNumero, numero, pesos, hoyISO, fechaCorta
} from '../ui.js';
import { nuevoLote, refNueva, refDoc, escucharDonde, documentosDonde } from '../stock.js';
import { opcionesLista, vacio, avisoError, avisoGuardado, campoNumero } from '../comunes.js';
import {
  configVentas, comisionDe, horaActual, precioDe, totalesCarrito, registrarVenta, anularVenta, marcarBoleta,
  resumenVentas, feriaDeHoy
} from '../ventas-core.js';
import { mesDe } from '../gastos-core.js';
import { nombreCliente } from '../cobranza-core.js';
import { editarCliente } from './ventas.js';
import { ICONOS } from '../iconos.js';

const fallo = avisoError(toast);
const norm = (t) => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const leerLS = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };
const guardarLS = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* sin almacenamiento */ } };
const nombreMes = (m) => { const [y, mm] = m.split('-').map(Number); const t = new Date(y, mm - 1, 1).toLocaleDateString('es-CL', { month: 'long', year: 'numeric' }); return t.charAt(0).toUpperCase() + t.slice(1); };
const meses = (n = 13) => { const d = new Date(); return Array.from({ length: n }, (_, i) => { const f = new Date(d.getFullYear(), d.getMonth() - i, 1); return `${f.getFullYear()}-${String(f.getMonth() + 1).padStart(2, '0')}`; }); };
const ferias = () => Object.values(estado.ferias).sort((a, b) => (b.fechaInicio || '').localeCompare(a.fechaInicio || ''));
const etqCanal = (v) => (v.feriaId && estado.ferias[v.feriaId] ? estado.ferias[v.feriaId].nombre : nombreItem('canalesVenta', v.canal));

// El carrito vive mientras la app está abierta: cambiar de pestaña no lo pierde.
const carrito = { lineas: [], medio: '', descuento: 0, clienteId: '', boleta: false, folio: '', fecha: '' };
const vaciarCarrito = () => Object.assign(carrito, { lineas: [], descuento: 0, clienteId: '', boleta: false, folio: '' });

// ================================================================ Venta rápida
export function vistaVentaRapida(el) {
  const ctx = leerLS('vs-venta-contexto', { canal: 'feria', feriaId: '' });
  if (!carrito.medio) carrito.medio = itemsActivos('mediosPago')[0]?.id || 'efectivo';
  const f = { texto: '', cat: '' };
  let delDia = [];
  let desDia = null;

  el.innerHTML = `
    <div class="vr-contexto panel">
      <label class="campo"><span class="campo-etiqueta">Dónde vendes</span><select data-canal>${opcionesLista('canalesVenta', ctx.canal)}</select></label>
      <label class="campo" data-con-feria><span class="campo-etiqueta">Feria ${info('Las ventas quedan asociadas a la feria para ver su resultado: ventas por día y por hora, costo del puesto y ganancia. Crea las ferias en la pestaña Ferias.')}</span><select data-feria></select></label>
      <label class="campo"><span class="campo-etiqueta">Fecha ${info('Hoy, por defecto. Cámbiala para pasar ventas anotadas en el cuaderno.')}</span><input type="date" data-fecha max="${hoyISO()}"></label>
      <div class="campo vr-modo-feria"><span class="campo-etiqueta">En la feria ${info('Pantalla completa con botones grandes, solo para vender: tocas las piezas, eliges cómo paga y cobras. Funciona sin señal. En Android, si mantienes presionado el ícono de la app aparece «Modo feria» para abrirla directo.')}</span><a class="btn btn-primario" href="#/feria">Abrir modo feria</a></div>
    </div>
    <div class="vr">
      <section class="vr-piezas">
        <div class="barra-herramientas">
          <input type="search" class="buscador" placeholder="Buscar pieza" aria-label="Buscar pieza">
          <select class="filtro" aria-label="Categoría"><option value="">Todas</option>${opcionesLista('categoriasPieza')}</select>
        </div>
        <div class="vr-grilla" data-grilla></div>
      </section>
      <aside class="vr-carrito panel" data-carrito id="carrito"></aside>
    </div>
    <div class="vr-barra" data-barra hidden><span data-barra-texto></span><a href="#carrito" class="btn btn-primario btn-chico" data-ir>Ver venta</a></div>
    <section data-dia></section>`;

  const selCanal = $('[data-canal]', el);
  const selFeria = $('[data-feria]', el);
  const inFecha = $('[data-fecha]', el);
  inFecha.value = carrito.fecha || hoyISO();
  const pintarFerias = () => {
    const hoy = inFecha.value || hoyISO();
    const abiertas = ferias().filter((x) => !x.cerrada);
    const sugerida = feriaDeHoy(abiertas, hoy);
    // La feria elegida se mantiene solo si la fecha de la venta cae dentro de sus días.
    const elegida = abiertas.find((x) => x.id === ctx.feriaId && x.fechaInicio <= hoy && hoy <= (x.fechaFin || x.fechaInicio));
    const actual = elegida?.id || sugerida?.id || '';
    selFeria.innerHTML = `<option value="">Sin feria</option>${abiertas.map((x) => `<option value="${esc(x.id)}" ${x.id === actual ? 'selected' : ''}>${esc(x.nombre)} · ${fechaCorta(x.fechaInicio)}</option>`).join('')}`;
    ctx.feriaId = actual;
    $('[data-con-feria]', el).hidden = selCanal.value !== 'feria';
  };
  selCanal.addEventListener('change', () => { ctx.canal = selCanal.value; guardarLS('vs-venta-contexto', ctx); pintarFerias(); suscribirDia(); });
  selFeria.addEventListener('change', () => { ctx.feriaId = selFeria.value; guardarLS('vs-venta-contexto', ctx); pintarDia(); });
  inFecha.addEventListener('change', () => { carrito.fecha = inFecha.value; pintarFerias(); suscribirDia(); });
  $('.buscador', el).addEventListener('input', (e) => { f.texto = e.target.value; pintarGrilla(); });
  $('.filtro', el).addEventListener('change', (e) => { f.cat = e.target.value; pintarGrilla(); });
  $('[data-ir]', el).addEventListener('click', (e) => { e.preventDefault(); $('[data-carrito]', el).scrollIntoView({ behavior: 'smooth', block: 'start' }); });

  function pintarGrilla() {
    const cv = configVentas();
    const q = norm(f.texto.trim());
    const fichas = Object.values(estado.piezas).filter((p) => !p.archivado && !(p.tipo === 'unica' && p.estadoUnica === 'vendida'))
      .filter((p) => (!f.cat || p.categoria === f.cat) && (!q || norm(p.nombre).includes(q)))
      .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
    const g = $('[data-grilla]', el);
    g.innerHTML = `${fichas.map((p) => {
      const enCarrito = carrito.lineas.filter((l) => l.piezaId === p.id).reduce((s, l) => s + l.cantidad, 0);
      const stock = (p.stock || 0) + (p.stockSegunda || 0);
      return `<button class="vr-pieza ${enCarrito ? 'en-carrito' : ''}" data-pieza="${esc(p.id)}">
        <span class="vr-pieza-nombre">${esc(p.nombre)}</span>
        <span class="vr-pieza-precio">${p.precioB2C ? pesos(p.precioB2C) : 'Sin precio'}</span>
        ${cv.controlarStock || stock > 0 ? `<span class="vr-pieza-stock ${cv.controlarStock && stock <= 0 ? 'texto-alerta' : ''}">${stock > 0 ? `Quedan ${stock}` : 'Sin stock'}</span>` : ''}
        ${enCarrito ? `<span class="vr-pieza-cuenta">${enCarrito}</span>` : ''}
      </button>`;
    }).join('')}
      <button class="vr-pieza vr-otra" data-otra>${ICONOS.mas2}<span class="vr-pieza-nombre">Otra pieza</span><span class="vr-pieza-stock">Sin ficha</span></button>`;
    if (!fichas.length && !Object.keys(estado.piezas).length) {
      g.insertAdjacentHTML('afterbegin', '<p class="texto-suave vr-ayuda">Todavía no hay fichas de pieza. Puedes vender con «Otra pieza» o crear fichas rápidas en Producción → Piezas: para vender solo hace falta el nombre y el precio.</p>');
    }
    $$('[data-pieza]', g).forEach((b) => b.addEventListener('click', () => agregar(estado.piezas[b.dataset.pieza])));
    $('[data-otra]', g).addEventListener('click', otraPieza);
  }

  function agregar(p, calidad = 'primera') {
    const cv = configVentas();
    const stock = calidad === 'segunda' ? p.stockSegunda || 0 : p.stock || 0;
    const ya = carrito.lineas.filter((l) => l.piezaId === p.id && l.calidad === calidad).reduce((s, l) => s + l.cantidad, 0);
    if (cv.controlarStock && ya + 1 > stock) { toast(`No queda stock de ${p.nombre}${calidad === 'segunda' ? ' de segunda' : ''}.`, 'error'); return; }
    if (!p.precioB2C) toast(`«${p.nombre}» no tiene precio: escríbelo en la venta.`, 'aviso');
    const l = carrito.lineas.find((x) => x.piezaId === p.id && x.calidad === calidad);
    if (l) l.cantidad++;
    else carrito.lineas.push({ key: `${p.id}-${calidad}-${Date.now()}`, piezaId: p.id, nombre: p.nombre, calidad, cantidad: 1, precio: precioDe(p, calidad) });
    pintarCarrito(); pintarGrilla();
  }

  async function otraPieza() {
    await formulario({
      titulo: 'Otra pieza', textoGuardar: 'Agregar',
      cuerpo: `<p class="texto-suave">Para piezas sin ficha: una pieza única, una prueba, algo de otra persona. No descuenta stock.</p>
        <div class="campos"><label class="campo campo-ancho"><span class="campo-etiqueta">Qué es</span><input name="nombre" maxlength="80" placeholder="Ej.: Cuenco prueba esmalte"></label>
        ${campoNumero('precio', 'Precio con IVA', '', { sufijo: '$' })}${campoNumero('cantidad', 'Cantidad', '1', { sufijo: 'u' })}</div>`,
      guardar(form) {
        const n = form.nombre.value.trim(); const pr = leerNumero(form.precio.value); const c = leerNumero(form.cantidad.value);
        if (!n) return 'Escribe qué pieza es.';
        if (!(pr > 0)) return 'Escribe el precio.';
        if (!Number.isInteger(c) || c < 1) return 'La cantidad debe ser un número entero.';
        carrito.lineas.push({ key: `otra-${Date.now()}`, piezaId: null, nombre: n, calidad: 'primera', cantidad: c, precio: pr });
        pintarCarrito();
        return null;
      }
    });
  }

  function pintarCarrito() {
    const cv = configVentas();
    const caja = $('[data-carrito]', el);
    const t = totalesCarrito(carrito.lineas, carrito.medio, carrito.descuento);
    const personas = Object.values(estado.clientes).filter((c) => !c.archivado).sort((a, b) => nombreCliente(a).localeCompare(nombreCliente(b), 'es'));
    const n = carrito.lineas.reduce((s, l) => s + l.cantidad, 0);
    $('[data-barra]', el).hidden = !n;
    $('[data-barra-texto]', el).textContent = `${n} pieza${n === 1 ? '' : 's'} · ${pesos(t.total)}`;
    if (!carrito.lineas.length) {
      caja.innerHTML = '<h2>Venta</h2><p class="texto-suave">Toca las piezas para agregarlas.</p>';
      return;
    }
    caja.innerHTML = `
      <div class="panel-cabecera"><h2>Venta</h2><button type="button" class="btn-enlace" data-vaciar>Vaciar</button></div>
      <ul class="vr-lineas">${carrito.lineas.map((l) => {
        const p = l.piezaId ? estado.piezas[l.piezaId] : null;
        return `<li data-key="${esc(l.key)}">
          <div class="vr-linea-cabeza"><span class="vr-linea-nombre">${esc(l.nombre)}</span><button type="button" class="btn-icono" data-quitar aria-label="Quitar">✕</button></div>
          <div class="vr-linea-datos">
            <span class="vr-cant"><button type="button" class="btn-icono" data-menos aria-label="Una menos">−</button><span>${l.cantidad}</span><button type="button" class="btn-icono" data-mas aria-label="Una más">+</button></span>
            ${p ? `<button type="button" class="vr-calidad ${l.calidad === 'segunda' ? 'segunda' : ''}" data-calidad title="Cambiar entre primera y segunda">${l.calidad === 'segunda' ? '2ª' : '1ª'}</button>` : '<span></span>'}
            <span class="con-sufijo vr-precio"><input data-precio inputmode="numeric" value="${numero(l.precio, 0)}" aria-label="Precio"><span class="sufijo">$</span></span>
            <span class="vr-subtotal">${pesos(l.cantidad * l.precio)}</span>
          </div></li>`;
      }).join('')}</ul>
      <div class="vr-totales">
        <label class="vr-descuento"><span>Descuento</span><span class="con-sufijo"><input data-descuento inputmode="numeric" value="${carrito.descuento ? numero(carrito.descuento, 0) : ''}" placeholder="0" aria-label="Descuento"><span class="sufijo">$</span></span></label>
        <div class="vr-total"><span>Total</span><strong>${pesos(t.total)}</strong></div>
        ${t.comision ? `<p class="texto-tenue">Comisión de la máquina ${numero(comisionDe(carrito.medio), 2)} %: ${pesos(t.comision)}</p>` : ''}
      </div>
      <div class="campo"><span class="campo-etiqueta">Medio de pago</span>
        <div class="segmentado segmentado-chico" role="radiogroup">${itemsActivos('mediosPago').map((m) => `<label><input type="radio" name="medio" value="${esc(m.id)}" ${m.id === carrito.medio ? 'checked' : ''}><span>${esc(m.nombre)}</span></label>`).join('')}<label><input type="radio" name="medio" value="por-cobrar" ${carrito.medio === 'por-cobrar' ? 'checked' : ''}><span>Queda debiendo</span></label></div>
        ${carrito.medio === 'por-cobrar' ? `<p class="texto-tenue vr-recordar">La venta se registra y el cobro queda en Cobranza, con su seguimiento. ${info('Elige el cliente: así sabes quién te debe y puedes mandarle recordatorios por WhatsApp. Cuando pague, regístralo en Cobranza.')}</p>` : ''}</div>
      <div class="campos vr-extras">
        <label class="campo"><span class="campo-etiqueta">Cliente ${info('Opcional. Sirve para conocer a quienes compran y escribirles después. Crea clientes finales con nombre e Instagram.')}</span>
          <span class="con-boton"><select data-cliente><option value="">Sin cliente</option>${personas.map((c) => `<option value="${esc(c.id)}" ${c.id === carrito.clienteId ? 'selected' : ''}>${esc(nombreCliente(c))}</option>`).join('')}</select><button type="button" class="btn btn-suave btn-chico" data-nuevo-cliente>Nuevo</button></span></label>
        <div class="campo"><span class="campo-etiqueta">Boleta ${info('Anota si emitiste boleta y su folio. Al cerrar el día verás cuáles ventas quedaron sin boleta.')}</span>
          <span class="vr-boleta"><label class="interruptor"><input type="checkbox" data-boleta ${carrito.boleta ? 'checked' : ''}><span>Emití boleta</span></label>
          <input data-folio inputmode="numeric" placeholder="Folio" value="${esc(carrito.folio)}" ${carrito.boleta ? '' : 'hidden'} aria-label="Folio de la boleta"></span></div>
      </div>
      ${cv.recordarBoleta && !carrito.boleta ? '<p class="texto-tenue vr-recordar">Sin boleta: quedará en la lista de pendientes del día.</p>' : ''}
      <button class="btn btn-primario btn-bloque" data-registrar>Registrar venta · ${pesos(t.total)}</button>`;

    $('[data-vaciar]', caja).addEventListener('click', () => { vaciarCarrito(); pintarCarrito(); pintarGrilla(); });
    $$('.vr-lineas li', caja).forEach((li) => {
      const l = carrito.lineas.find((x) => x.key === li.dataset.key);
      $('[data-quitar]', li).addEventListener('click', () => { carrito.lineas = carrito.lineas.filter((x) => x !== l); pintarCarrito(); pintarGrilla(); });
      $('[data-menos]', li).addEventListener('click', () => { l.cantidad = Math.max(1, l.cantidad - 1); pintarCarrito(); pintarGrilla(); });
      $('[data-mas]', li).addEventListener('click', () => {
        const p = l.piezaId && estado.piezas[l.piezaId];
        if (p && configVentas().controlarStock && l.cantidad + 1 > (l.calidad === 'segunda' ? p.stockSegunda || 0 : p.stock || 0)) { toast('No queda más stock.', 'error'); return; }
        l.cantidad++; pintarCarrito(); pintarGrilla();
      });
      $('[data-calidad]', li)?.addEventListener('click', () => {
        const p = estado.piezas[l.piezaId];
        l.calidad = l.calidad === 'segunda' ? 'primera' : 'segunda';
        l.precio = precioDe(p, l.calidad);
        pintarCarrito();
      });
      $('[data-precio]', li).addEventListener('change', (e) => { const v = leerNumero(e.target.value); if (v >= 0) l.precio = v; pintarCarrito(); });
    });
    $('[data-descuento]', caja).addEventListener('change', (e) => { carrito.descuento = leerNumero(e.target.value) || 0; pintarCarrito(); });
    $$('input[name=medio]', caja).forEach((r) => r.addEventListener('change', () => { carrito.medio = r.value; pintarCarrito(); }));
    $('[data-cliente]', caja).addEventListener('change', (e) => { carrito.clienteId = e.target.value; });
    $('[data-nuevo-cliente]', caja).addEventListener('click', async () => {
      const c = await editarCliente(null, { tipoInicial: 'persona' });
      if (c) { estado.clientes[c.id] = { ...c, ...(estado.clientes[c.id] || {}) }; carrito.clienteId = c.id; pintarCarrito(); }
    });
    $('[data-boleta]', caja).addEventListener('change', (e) => { carrito.boleta = e.target.checked; pintarCarrito(); if (carrito.boleta) $('[data-folio]', el)?.focus(); });
    $('[data-folio]', caja).addEventListener('input', (e) => { carrito.folio = e.target.value.trim(); });
    $('[data-registrar]', caja).addEventListener('click', registrar);
  }

  function registrar() {
    if (!carrito.lineas.length) return;
    if (carrito.lineas.some((l) => !(l.precio > 0))) { toast('Hay piezas sin precio. Escribe el precio antes de registrar.', 'error'); return; }
    const fecha = inFecha.value || hoyISO();
    const cliente = carrito.clienteId ? { id: carrito.clienteId, nombre: nombreCliente(estado.clientes[carrito.clienteId]) } : null;
    if (carrito.medio === 'por-cobrar' && !cliente) { toast('Para dejar una venta debiendo, elige el cliente.', 'error'); return; }
    const lote = nuevoLote();
    const v = registrarVenta(lote, {
      lineas: carrito.lineas, medio: carrito.medio, canal: selCanal.value, feriaId: selCanal.value === 'feria' ? selFeria.value || null : null,
      cliente, fecha, hora: fecha === hoyISO() ? horaActual() : '', boleta: { emitida: carrito.boleta, folio: carrito.folio }, descuento: carrito.descuento
    });
    enviar(lote.commit(), { alGuardar: avisoGuardado(toast, `Venta registrada: ${pesos(v.total)}`), alFallar: fallo });
    vaciarCarrito();
    pintarCarrito(); pintarGrilla();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function pintarDia() {
    const caja = $('[data-dia]', el);
    const vs = delDia.filter((v) => v.canal === selCanal.value && (selCanal.value !== 'feria' || !selFeria.value || v.feriaId === selFeria.value))
      .sort((a, b) => b.creadoMs - a.creadoMs);
    const r = resumenVentas(vs);
    const fecha = inFecha.value || hoyISO();
    caja.innerHTML = `
      <div class="panel-cabecera seccion-cabecera"><h2>${fecha === hoyISO() ? 'Ventas de hoy' : `Ventas del ${fechaCorta(fecha)}`} · ${esc(selCanal.value === 'feria' && selFeria.value ? estado.ferias[selFeria.value]?.nombre || 'Feria' : nombreItem('canalesVenta', selCanal.value))}</h2>
        ${vs.length ? '<button class="btn btn-suave btn-chico" data-cierre>Cierre del día</button>' : ''}</div>
      ${vs.length ? `
        <div class="resumen resumen-chico">
          <div class="dato"><span class="dato-etq">Vendido</span><span class="dato-valor">${pesos(r.total)}</span></div>
          <div class="dato"><span class="dato-etq">Ventas</span><span class="dato-valor">${r.ventas}</span></div>
          <div class="dato"><span class="dato-etq">Piezas</span><span class="dato-valor">${r.piezas}</span></div>
          <div class="dato ${r.sinBoleta.length ? 'dato-alerta' : ''}"><span class="dato-etq">Sin boleta</span><span class="dato-valor">${r.sinBoleta.length}</span></div>
        </div>
        <section class="panel tabla-panel"><ul class="filas">${vs.map(filaVenta).join('')}</ul></section>` : '<p class="texto-suave">Todavía no hay ventas.</p>'}`;
    $('[data-cierre]', caja)?.addEventListener('click', () => cierreDelDia(vs, fecha));
    $$('.fila', caja).forEach((b) => b.addEventListener('click', () => detalleVenta(vs.find((v) => v.id === b.dataset.id))));
  }
  function suscribirDia() {
    desDia?.();
    desDia = escucharDonde('ventas', 'fecha', '==', inFecha.value || hoyISO(), (l) => { delDia = l; pintarDia(); });
  }

  const desE = alCambiar(() => { pintarGrilla(); pintarCarrito(); });
  pintarFerias(); suscribirDia(); pintarGrilla(); pintarCarrito(); pintarDia();
  return () => { desDia?.(); desE(); };
}

const filaVenta = (v) => `
  <li><button class="fila ${v.anulado ? 'fila-anulada' : ''}" data-id="${esc(v.id)}">
    <span class="fila-principal"><span class="fila-nombre">${v.lineas.map((l) => `${l.cantidad > 1 ? `${l.cantidad} × ` : ''}${esc(l.nombre)}${l.calidad === 'segunda' ? ' (2ª)' : ''}`).join(', ')}</span>
      <span class="fila-meta"><span>${v.hora ? `${esc(v.hora)} · ` : ''}${esc(nombreItem('mediosPago', v.medio))}${v.clienteNombre ? ` · ${esc(v.clienteNombre)}` : ''}</span>
        ${v.deuda?.saldo > 0 && !v.anulado ? `<span class="etiqueta etiqueta-alerta">Debe ${pesos(v.deuda.saldo)}</span>` : ''}${v.anulado ? '<span class="etiqueta etiqueta-suave">Anulada</span>' : v.boleta?.emitida ? `<span class="etiqueta etiqueta-ok">Boleta ${esc(v.boleta.folio || '')}</span>` : '<span class="etiqueta etiqueta-alerta">Sin boleta</span>'}</span></span>
    <span class="fila-dato fila-dato-fuerte"><span class="fila-etq">Total</span>${pesos(v.total)}</span>
  </button></li>`;

async function detalleVenta(v) {
  await formulario({
    titulo: `Venta · ${fechaCorta(v.fecha)}${v.hora ? ` ${v.hora}` : ''}`, ancho: false, textoGuardar: v.anulado || v.boleta?.emitida ? '' : 'Guardar boleta',
    extra: v.anulado ? '' : '<button type="button" class="btn btn-peligro" data-anular>Anular venta</button>',
    cuerpo: `
      <ul class="lista-bajos">${v.lineas.map((l) => `<li><span>${l.cantidad} × ${esc(l.nombre)}${l.calidad === 'segunda' ? ' (2ª)' : ''}</span><span>${pesos(l.subtotal)}</span></li>`).join('')}
        ${v.descuento ? `<li><span>Descuento</span><span>−${pesos(v.descuento)}</span></li>` : ''}
        <li><strong>Total</strong><strong>${pesos(v.total)}</strong></li></ul>
      <dl class="datos-fijos compacto">
        <div><dt>Dónde</dt><dd>${esc(etqCanal(v))}</dd></div>
        <div><dt>Medio de pago</dt><dd>${v.pagos?.length > 1 ? v.pagos.map((x) => `${esc(nombreItem('mediosPago', x.medio))} ${pesos(x.monto)}${x.fecha !== v.fecha ? ` (${fechaCorta(x.fecha)})` : ''}`).join(' · ') : esc(nombreItem('mediosPago', v.medio))}${v.comision ? ` · comisión ${pesos(v.comision)}` : ''}</dd></div>
        ${v.encargoId ? `<div><dt>Encargo</dt><dd>${esc(estado.encargos[v.encargoId] ? `Encargo ${estado.encargos[v.encargoId].numero}` : 'Encargo')}</dd></div>` : ''}
        ${v.clienteNombre ? `<div><dt>Cliente</dt><dd>${esc(v.clienteNombre)}</dd></div>` : ''}
        <div><dt>Boleta</dt><dd>${v.boleta?.emitida ? `Folio ${esc(v.boleta.folio || 'sin anotar')}` : 'Sin boleta'}</dd></div>
      </dl>
      ${v.anulado ? `<p class="aviso">Venta anulada${v.motivoAnulacion ? `: ${esc(v.motivoAnulacion)}` : ''}. Las piezas volvieron al stock.</p>` : ''}
      ${!v.anulado && !v.boleta?.emitida ? '<label class="campo"><span class="campo-etiqueta">Folio de la boleta</span><input name="folio" inputmode="numeric" maxlength="20"></label>' : ''}`,
    montar(dlg, form, cerrar) {
      $('[data-anular]', dlg)?.addEventListener('click', async () => {
        if (!(await confirmar('Anular venta', `La venta de ${pesos(v.total)} queda anulada y sus piezas vuelven al stock. Nada se borra.`, 'Anular venta', true))) return;
        const lote = nuevoLote(); anularVenta(lote, v);
        enviar(lote.commit(), { alGuardar: avisoGuardado(toast, 'Venta anulada'), alFallar: fallo });
        cerrar();
      });
    },
    guardar(form) {
      const folio = form.folio?.value.trim();
      if (!folio) return 'Escribe el folio de la boleta.';
      const lote = nuevoLote(); marcarBoleta(lote, v, folio);
      enviar(lote.commit(), { alGuardar: avisoGuardado(toast, 'Boleta anotada'), alFallar: fallo });
      return null;
    }
  });
}

async function cierreDelDia(vs, fecha) {
  const r = resumenVentas(vs);
  const filasMedio = [...r.porMedio.entries()].sort((a, b) => b[1] - a[1]);
  const piezas = [...r.porPieza.values()].sort((a, b) => b.cantidad - a.cantidad);
  await formulario({
    titulo: `Cierre del ${fechaCorta(fecha)}`, ancho: true, textoGuardar: r.sinBoleta.length ? 'Guardar folios' : '',
    cuerpo: `
      <div class="resumen resumen-chico">
        <div class="dato"><span class="dato-etq">Vendido</span><span class="dato-valor">${pesos(r.total)}</span></div>
        <div class="dato"><span class="dato-etq">Ventas · piezas</span><span class="dato-valor">${r.ventas} · ${r.piezas}</span></div>
        <div class="dato"><span class="dato-etq">Ticket promedio</span><span class="dato-valor">${r.ventas ? pesos(r.total / r.ventas) : '—'}</span></div>
      </div>
      <h3>Por medio de pago ${info('Sirve para cuadrar la caja: el efectivo que debería haber y lo que llegó por transferencia o máquina.')}</h3>
      <ul class="lista-bajos">${filasMedio.map(([m, t]) => `<li><span>${esc(nombreItem('mediosPago', m))}</span><span>${pesos(t)}</span></li>`).join('')}</ul>
      <h3>Piezas vendidas</h3>
      <ul class="lista-bajos">${piezas.map((p) => `<li><span>${p.cantidad} × ${esc(p.nombre)}</span><span>${pesos(p.total)}</span></li>`).join('')}</ul>
      ${r.sinBoleta.length ? `<h3>Sin boleta <span class="lista-cuenta">${r.sinBoleta.length} · ${pesos(r.sinBoleta.reduce((s, v) => s + v.total, 0))}</span></h3>
        <p class="texto-suave">Anota el folio de cada boleta a medida que las emitas.</p>
        <div class="tabla-scroll"><table class="tabla tabla-entrada"><thead><tr><th>Venta</th><th class="num">Total</th><th class="num">Folio</th></tr></thead><tbody>
          ${r.sinBoleta.map((v) => `<tr data-id="${esc(v.id)}"><td><span class="celda-nombre">${esc(v.hora || '')} ${esc(v.lineas.map((l) => l.nombre).join(', '))}</span></td><td class="num">${pesos(v.total)}</td>
            <td class="num"><input data-folio inputmode="numeric" maxlength="20" aria-label="Folio" class="input-folio"></td></tr>`).join('')}
        </tbody></table></div>` : '<p class="aviso aviso-ok">Todas las ventas del día tienen boleta.</p>'}`,
    guardar(form, dlg) {
      const lote = nuevoLote();
      let n = 0;
      $$('tbody tr', dlg).forEach((tr) => {
        const folio = $('[data-folio]', tr).value.trim();
        if (!folio) return;
        marcarBoleta(lote, vs.find((v) => v.id === tr.dataset.id), folio); n++;
      });
      if (!n) return 'Escribe al menos un folio, o cierra la ventana.';
      enviar(lote.commit(), { alGuardar: avisoGuardado(toast, `${n} boleta${n > 1 ? 's' : ''} anotada${n > 1 ? 's' : ''}`), alFallar: fallo });
      return null;
    }
  });
}

// ================================================================ Historial
export function vistaHistorial(el) {
  let mes = mesDe(hoyISO());
  let canal = '';
  let lista = [];
  let des = null;
  el.innerHTML = `
    <div class="barra-herramientas">
      <select class="filtro" data-mes aria-label="Mes">${meses().map((m) => `<option value="${m}">${nombreMes(m)}</option>`).join('')}</select>
      <select class="filtro" data-canal aria-label="Canal"><option value="">Todos los canales</option>${opcionesLista('canalesVenta')}</select>
      <span class="espacio"></span><span class="texto-suave" data-total></span>
    </div>
    <div data-lista></div>`;
  $('[data-mes]', el).addEventListener('change', (e) => { mes = e.target.value; suscribir(); });
  $('[data-canal]', el).addEventListener('change', (e) => { canal = e.target.value; pintar(); });
  const pintar = () => {
    const vs = lista.filter((v) => !canal || v.canal === canal).sort((a, b) => b.fecha.localeCompare(a.fecha) || b.creadoMs - a.creadoMs);
    const r = resumenVentas(vs);
    $('[data-total]', el).textContent = vs.length ? `${r.ventas} ventas · ${pesos(r.total)}` : '';
    const caja = $('[data-lista]', el);
    if (!vs.length) { caja.innerHTML = vacio(`Sin ventas en ${nombreMes(mes).toLowerCase()}`, 'Las ventas que registres en Venta rápida aparecen aquí, día por día.'); return; }
    const dias = new Map();
    vs.forEach((v) => { if (!dias.has(v.fecha)) dias.set(v.fecha, []); dias.get(v.fecha).push(v); });
    caja.innerHTML = [...dias.entries()].map(([d, xs]) => `
      <section class="panel tabla-panel">
        <h2 class="grupo-titulo">${fechaCorta(d)} <span class="lista-cuenta">${pesos(xs.filter((v) => !v.anulado).reduce((s, v) => s + v.total, 0))}</span></h2>
        <ul class="filas">${xs.map(filaVenta).join('')}</ul></section>`).join('');
    $$('.fila', caja).forEach((b) => b.addEventListener('click', () => detalleVenta(vs.find((v) => v.id === b.dataset.id))));
  };
  function suscribir() { des?.(); lista = []; des = escucharDonde('ventas', 'mes', '==', mes, (l) => { lista = l; pintar(); }); }
  suscribir();
  pintar();
  return () => des?.();
}

// ================================================================ Ferias
export function vistaFerias(el) {
  el.innerHTML = `<div class="barra-herramientas"><span class="espacio"></span><button class="btn btn-primario" data-nueva>${ICONOS.mas2}<span>Nueva feria</span></button></div><div data-lista></div>`;
  $('[data-nueva]', el).addEventListener('click', () => editarFeria());
  const pintar = () => {
    const fs = ferias();
    const caja = $('[data-lista]', el);
    if (!fs.length) { caja.innerHTML = vacio('Todavía no hay ferias', 'Crea cada feria con sus fechas y el costo del puesto. Al vender en Venta rápida, elige la feria y al final verás si dejó ganancia, qué se vendió y a qué hora.'); return; }
    const hoy = hoyISO();
    caja.innerHTML = `<section class="panel tabla-panel"><ul class="filas">${fs.map((f) => {
      const enCurso = !f.cerrada && f.fechaInicio <= hoy && hoy <= (f.fechaFin || f.fechaInicio);
      const proxima = f.fechaInicio > hoy;
      return `<li><button class="fila" data-id="${esc(f.id)}">
        <span class="fila-principal"><span class="fila-nombre">${esc(f.nombre)}</span>
          <span class="fila-meta"><span>${fechaCorta(f.fechaInicio)}${f.fechaFin && f.fechaFin !== f.fechaInicio ? ` al ${fechaCorta(f.fechaFin)}` : ''}${f.lugar ? ` · ${esc(f.lugar)}` : ''}</span>
            ${f.cerrada ? '<span class="etiqueta etiqueta-suave">Cerrada</span>' : enCurso ? '<span class="etiqueta etiqueta-ok">En curso</span>' : proxima ? '<span class="etiqueta etiqueta-info">Próxima</span>' : '<span class="etiqueta">Terminada</span>'}</span></span>
        <span class="fila-dato"><span class="fila-etq">Puesto</span>${pesos((f.costoPuesto || 0) + (f.otrosCostos || 0))}</span>
      </button></li>`;
    }).join('')}</ul></section>`;
    $$('.fila', caja).forEach((b) => b.addEventListener('click', () => detalleFeria(estado.ferias[b.dataset.id])));
  };
  pintar();
  return alCambiar(pintar);
}

export async function editarFeria(f = null, { fecha = hoyISO() } = {}) {
  const d = f || { nombre: '', lugar: '', fechaInicio: fecha, fechaFin: fecha, costoPuesto: null, otrosCostos: null, notas: '' };
  await formulario({
    titulo: f ? f.nombre : 'Nueva feria', textoGuardar: f ? 'Guardar cambios' : 'Crear feria',
    cuerpo: `<div class="campos">
      <label class="campo campo-ancho"><span class="campo-etiqueta">Nombre <span class="req">*</span></span><input name="nombre" value="${esc(d.nombre)}" maxlength="80" placeholder="Ej.: Ceramiko 2026, Feria Pulgas Concepción"></label>
      <label class="campo campo-ancho"><span class="campo-etiqueta">Lugar</span><input name="lugar" value="${esc(d.lugar || '')}" maxlength="120"></label>
      <label class="campo"><span class="campo-etiqueta">Desde</span><input type="date" name="fechaInicio" value="${esc(d.fechaInicio)}"></label>
      <label class="campo"><span class="campo-etiqueta">Hasta</span><input type="date" name="fechaFin" value="${esc(d.fechaFin || d.fechaInicio)}"></label>
      ${campoNumero('costoPuesto', 'Costo del puesto', d.costoPuesto != null ? numero(d.costoPuesto, 0) : '', { sufijo: '$', ayuda: info('Lo que pagaste por el puesto. Si ya lo registraste como gasto, igual anótalo aquí para ver el resultado de la feria.') })}
      ${campoNumero('otrosCostos', 'Otros costos', d.otrosCostos != null ? numero(d.otrosCostos, 0) : '', { sufijo: '$', ayuda: info('Transporte, alojamiento, comida, ayudante. Lo que gastaste para estar en la feria.') })}
      <label class="campo campo-ancho"><span class="campo-etiqueta">Notas</span><textarea name="notas" rows="2" maxlength="500">${esc(d.notas || '')}</textarea></label>
    </div>`,
    guardar(form) {
      const n = form.nombre.value.trim();
      if (!n) return 'Escribe el nombre de la feria.';
      const fi = form.fechaInicio.value; const ff = form.fechaFin.value || fi;
      if (!fi) return 'Indica la fecha.';
      if (ff < fi) return 'La fecha de término no puede ser anterior al inicio.';
      const datos = { nombre: n, lugar: form.lugar.value.trim(), fechaInicio: fi, fechaFin: ff, costoPuesto: leerNumero(form.costoPuesto.value) || 0, otrosCostos: leerNumero(form.otrosCostos.value) || 0, notas: form.notas.value.trim() };
      const lote = nuevoLote();
      if (f) lote.update(refDoc('ferias', f.id), { ...datos, ...firma() });
      else lote.set(refNueva('ferias'), { ...datos, cerrada: false, creadoMs: Date.now(), ...firma() });
      enviar(lote.commit(), { alGuardar: avisoGuardado(toast, f ? 'Feria guardada' : `Feria «${n}» creada`), alFallar: fallo });
      return null;
    }
  });
}

const barras = (pares, formato = pesos) => {
  const max = Math.max(...pares.map(([, v]) => Math.abs(v)), 1);
  return pares.length ? `<ul class="barras">${pares.map(([k, v]) => `<li><span class="barra-etq">${esc(k)}</span><span class="barra-pista"><span class="barra" style="width:${Math.max(2, Math.abs(v) / max * 100)}%"></span></span><span class="barra-valor">${formato(v)}</span></li>`).join('')}</ul>` : '<p class="texto-suave">Sin datos.</p>';
};
const columnasHora = (porHora) => {
  const hs = [...porHora.keys()].map(Number);
  if (!hs.length) return '<p class="texto-suave">Sin ventas con hora.</p>';
  const desde = Math.min(...hs), hasta = Math.max(...hs);
  const fila = Array.from({ length: hasta - desde + 1 }, (_, i) => { const h = String(desde + i).padStart(2, '0'); return [h, porHora.get(h) || 0]; });
  const max = Math.max(...fila.map(([, v]) => v), 1);
  return `<div class="columnas-mes columnas-hora" style="grid-template-columns:repeat(${fila.length},1fr)">${fila.map(([h, v]) => `
    <div class="col-mes"><span class="col-valor">${v ? pesos(v) : ''}</span><span class="col-pista"><span class="col-barra" style="height:${v ? Math.max(3, v / max * 100) : 0}%"></span></span><span class="col-mes-etq">${h}h</span></div>`).join('')}</div>`;
};

export async function detalleFeria(f) {
  const vs = await documentosDonde('ventas', 'feriaId', '==', f.id).catch(() => []);
  const r = resumenVentas(vs);
  const gastos = (f.costoPuesto || 0) + (f.otrosCostos || 0);
  const resultado = r.margen - gastos;
  const dias = [...r.porDia.entries()].sort();
  const piezas = [...r.porPieza.values()].sort((a, b) => b.total - a.total).slice(0, 10);
  await formulario({
    titulo: f.nombre, ancho: true, textoGuardar: '',
    extra: `<button type="button" class="btn btn-suave" data-editar>Editar</button>${f.cerrada ? '' : '<button type="button" class="btn btn-suave" data-cerrar-feria>Cerrar feria</button><button type="button" class="btn btn-primario" data-vender>Vender aquí</button>'}`,
    cuerpo: `
      <p class="texto-suave">${fechaCorta(f.fechaInicio)}${f.fechaFin && f.fechaFin !== f.fechaInicio ? ` al ${fechaCorta(f.fechaFin)}` : ''}${f.lugar ? ` · ${esc(f.lugar)}` : ''}</p>
      <div class="resumen resumen-chico">
        <div class="dato"><span class="dato-etq">Vendido</span><span class="dato-valor">${pesos(r.total)}</span></div>
        <div class="dato"><span class="dato-etq">Piezas</span><span class="dato-valor">${r.piezas}</span></div>
        <div class="dato"><span class="dato-etq">Ticket promedio</span><span class="dato-valor">${r.ventas ? pesos(r.total / r.ventas) : '—'}</span></div>
        <div class="dato ${resultado < 0 ? 'dato-alerta' : ''}"><span class="dato-etq">Resultado ${info('Ventas sin IVA, menos lo que costó hacer las piezas vendidas, las comisiones de la máquina, el puesto y los otros costos.')}</span><span class="dato-valor">${pesos(resultado)}</span></div>
      </div>
      <div class="desglose">
        <div class="desglose-fila"><span>Ventas sin IVA</span><span>${pesos(r.neto)}</span></div>
        <div class="desglose-fila"><span>Costo de las piezas vendidas</span><span>−${pesos(r.costo)}</span></div>
        ${r.comision ? `<div class="desglose-fila"><span>Comisiones</span><span>−${pesos(r.comision)}</span></div>` : ''}
        <div class="desglose-fila"><span>Puesto</span><span>−${pesos(f.costoPuesto || 0)}</span></div>
        ${f.otrosCostos ? `<div class="desglose-fila"><span>Otros costos</span><span>−${pesos(f.otrosCostos)}</span></div>` : ''}
        <div class="desglose-fila desglose-total"><span>Resultado</span><span class="${resultado < 0 ? 'texto-alerta' : 'entra'}">${pesos(resultado)}</span></div>
      </div>
      ${r.sinBoleta.length ? `<p class="aviso aviso-suave">${r.sinBoleta.length} venta${r.sinBoleta.length > 1 ? 's' : ''} sin boleta, por ${pesos(r.sinBoleta.reduce((s, v) => s + v.total, 0))}. Anota los folios en el cierre del día.</p>` : ''}
      ${dias.length > 1 ? `<h3>Por día</h3>${barras(dias.map(([d, v]) => [fechaCorta(d), v]))}` : ''}
      <h3>Por hora</h3>${columnasHora(r.porHora)}
      <h3>Lo más vendido</h3>
      ${piezas.length ? `<ul class="lista-bajos">${piezas.map((p) => `<li><span>${p.cantidad} × ${esc(p.nombre)}</span><span>${pesos(p.total)}</span></li>`).join('')}</ul>` : '<p class="texto-suave">Todavía no hay ventas en esta feria.</p>'}`,
    montar(dlg, form, cerrar) {
      $('[data-editar]', dlg).addEventListener('click', () => { cerrar(); editarFeria(f); });
      $('[data-vender]', dlg)?.addEventListener('click', () => {
        guardarLS('vs-venta-contexto', { canal: 'feria', feriaId: f.id });
        cerrar(); location.hash = '#/ventas/venta-rapida';
      });
      $('[data-cerrar-feria]', dlg)?.addEventListener('click', async () => {
        if (!(await confirmar('Cerrar feria', 'La feria deja de aparecer al vender. Sus ventas y su resultado se mantienen.', 'Cerrar feria'))) return;
        enviar(nuevoLote().update(refDoc('ferias', f.id), { cerrada: true, ...firma() }).commit(), { alGuardar: avisoGuardado(toast, 'Feria cerrada'), alFallar: fallo });
        cerrar();
      });
    }
  });
}

// ================================================================ Análisis
export function vistaAnalisis(el) {
  let mes = mesDe(hoyISO());
  let des = null;
  let lista = [];
  el.innerHTML = `<div class="barra-herramientas"><select class="filtro" data-mes aria-label="Mes">${meses().map((m) => `<option value="${m}">${nombreMes(m)}</option>`).join('')}</select></div><div data-cuerpo></div>`;
  $('[data-mes]', el).addEventListener('change', (e) => { mes = e.target.value; suscribir(); });
  const pintar = () => {
    const r = resumenVentas(lista);
    const caja = $('[data-cuerpo]', el);
    if (!r.ventas) { caja.innerHTML = vacio(`Sin ventas en ${nombreMes(mes).toLowerCase()}`, 'Cuando registres ventas, aquí verás qué se vende más, en qué canal, con qué medio de pago y a qué hora.'); return; }
    const piezas = [...r.porPieza.values()].sort((a, b) => b.total - a.total).slice(0, 10);
    caja.innerHTML = `
      <div class="resumen">
        <div class="dato"><span class="dato-etq">Vendido</span><span class="dato-valor">${pesos(r.total)}</span></div>
        <div class="dato"><span class="dato-etq">Ventas · piezas</span><span class="dato-valor">${r.ventas} · ${r.piezas}</span></div>
        <div class="dato"><span class="dato-etq">Ticket promedio</span><span class="dato-valor">${pesos(r.total / r.ventas)}</span></div>
        <div class="dato"><span class="dato-etq">Margen ${info('Ventas sin IVA, menos el costo de las piezas vendidas y las comisiones. No descuenta puestos ni otros gastos.')}</span><span class="dato-valor">${pesos(r.margen)}</span></div>
        <div class="dato ${r.sinBoleta.length ? 'dato-alerta' : ''}"><span class="dato-etq">Sin boleta</span><span class="dato-valor">${r.sinBoleta.length}</span></div>
      </div>
      <div class="dos-columnas">
        <section class="panel"><h2>Por canal</h2>${barras([...r.porCanal.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => [nombreItem('canalesVenta', k), v]))}</section>
        <section class="panel"><h2>Por medio de pago</h2>${barras([...r.porMedio.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => [nombreItem('mediosPago', k), v]))}</section>
      </div>
      <section class="panel"><h2>Lo más vendido</h2>
        <div class="tabla-scroll"><table class="tabla"><thead><tr><th>Pieza</th><th class="num">Unidades</th><th class="num">Vendido</th></tr></thead><tbody>
          ${piezas.map((p) => `<tr><td>${esc(p.nombre)}</td><td class="num">${p.cantidad}</td><td class="num">${pesos(p.total)}</td></tr>`).join('')}</tbody></table></div></section>
      <section class="panel"><h2>Por hora del día</h2>${columnasHora(r.porHora)}</section>`;
  };
  function suscribir() { des?.(); lista = []; des = escucharDonde('ventas', 'mes', '==', mes, (l) => { lista = l; pintar(); }); }
  suscribir();
  pintar();
  return () => des?.();
}
