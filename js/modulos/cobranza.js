// Cobranza: qué se debe, quién lo debe y desde cuándo.
import { estado, alCambiar, enviar, firma, nombreItem } from '../datos.js';
import {
  esc, info, toast, $, $$, formulario, dialogo, confirmar, leerNumero, numero, pesos, hoyISO, fechaCorta
} from '../ui.js';
import { nuevoLote, refDoc, escucharDonde, documentosDonde, ultimosDocumentos } from '../stock.js';
import { opcionesLista, pestanas, vacio, avisoError, avisoGuardado, campoNumero } from '../comunes.js';
import { TIPOS_DTE } from '../xml-sii.js';
import {
  nombreCliente, saldo, diasAtraso, etiquetaFactura, registrarPago, anularPago, repartir, importarEmitidas,
  crearFacturaManual, anularFactura, sumarDias
} from '../cobranza-core.js';
import { mesDe } from '../gastos-core.js';
import { editarCliente } from './ventas.js';
import { pdfEstadoCuenta, compartirPDF, enlaceWhatsApp, telefonoWhatsApp } from '../pdf.js';
import { ICONOS } from '../iconos.js';

const PEST = [['por-cobrar', 'Por cobrar'], ['facturas', 'Facturas'], ['pagos', 'Pagos']];
const fallo = avisoError(toast);
const TIPOS_MANUAL = [33, 34, 61, 0];
const nombreMes = (m) => { const [y, mm] = m.split('-').map(Number); const t = new Date(y, mm - 1, 1).toLocaleDateString('es-CL', { month: 'long', year: 'numeric' }); return t.charAt(0).toUpperCase() + t.slice(1); };
const meses = (n = 13) => { const d = new Date(); return Array.from({ length: n }, (_, i) => { const f = new Date(d.getFullYear(), d.getMonth() - i, 1); return `${f.getFullYear()}-${String(f.getMonth() + 1).padStart(2, '0')}`; }); };
const textoAtraso = (d) => (d > 0 ? `${d} día${d > 1 ? 's' : ''} de atraso` : d === 0 ? 'Vence hoy' : `Vence en ${-d} día${d < -1 ? 's' : ''}`);
const medioTexto = (m) => (m === 'nota-credito' ? 'Nota de crédito' : m ? nombreItem('mediosPago', m) : 'Sin indicar');

let abiertas = [];

export default {
  render(el, { sub }) {
    const actual = PEST.some(([k]) => k === sub) ? sub : 'por-cobrar';
    el.innerHTML = `
      <header class="pagina-cabecera">
        <h1>Cobranza</h1>
        <p class="pagina-bajada">${{ 'por-cobrar': 'Qué se debe, quién lo debe y desde cuándo.', facturas: 'Las facturas emitidas por el taller, cargadas desde el XML del SII o a mano.', pagos: 'Cada pago recibido y a qué facturas se aplicó.' }[actual]}</p>
      </header>
      ${pestanas('cobranza', PEST, actual)}
      <div id="cob-cuerpo"></div>`;
    const c = $('#cob-cuerpo', el);
    return ({ 'por-cobrar': vistaPorCobrar, facturas: vistaFacturas, pagos: vistaPagos })[actual](c);
  }
};

// ================================================================ Por cobrar
function vistaPorCobrar(el) {
  el.innerHTML = '<div class="resumen" data-resumen></div><div class="barra-herramientas"><span class="espacio"></span><button class="btn btn-suave" data-cargar>Cargar facturas emitidas</button><button class="btn btn-primario" data-pago>Registrar pago</button></div><div data-lista></div>';
  $('[data-pago]', el).addEventListener('click', () => pagoDialogo());
  $('[data-cargar]', el).addEventListener('click', () => { location.hash = '#/cobranza/facturas'; });
  const pintar = () => {
    const hoy = hoyISO();
    const fs = abiertas.filter((f) => !f.anulada && saldo(f) > 0);
    const venc = fs.filter((f) => diasAtraso(f, hoy) > 0);
    const total = fs.reduce((s, f) => s + saldo(f), 0);
    const tv = venc.reduce((s, f) => s + saldo(f), 0);
    const porCliente = new Map();
    fs.forEach((f) => { if (!porCliente.has(f.clienteId)) porCliente.set(f.clienteId, []); porCliente.get(f.clienteId).push(f); });
    $('[data-resumen]', el).innerHTML = `
      <div class="dato"><span class="dato-etq">Por cobrar</span><span class="dato-valor">${pesos(total)}</span></div>
      <div class="dato ${tv ? 'dato-alerta' : ''}"><span class="dato-etq">Vencido</span><span class="dato-valor">${pesos(tv)}</span></div>
      <div class="dato"><span class="dato-etq">Al día</span><span class="dato-valor">${pesos(total - tv)}</span></div>
      <div class="dato"><span class="dato-etq">Clientes con saldo</span><span class="dato-valor">${porCliente.size}</span></div>`;
    const lista = $('[data-lista]', el);
    if (!fs.length) {
      lista.innerHTML = vacio('No hay nada por cobrar', 'Carga los XML de las facturas que emitiste en el SII, o regístralas a mano en la pestaña Facturas. Aquí aparecerán por cliente, con sus días de atraso.', '<a class="btn btn-primario" href="#/cobranza/facturas">Ir a Facturas</a>');
      return;
    }
    const grupos = [...porCliente.entries()].map(([id, lista2]) => ({
      cliente: estado.clientes[id] || { id, nombre: lista2[0].clienteNombre },
      facturas: lista2.sort((a, b) => (a.vencimiento || '').localeCompare(b.vencimiento || '')),
      total: lista2.reduce((s, f) => s + saldo(f), 0),
      maxAtraso: Math.max(...lista2.map((f) => diasAtraso(f, hoy)))
    })).sort((a, b) => b.maxAtraso - a.maxAtraso || b.total - a.total);
    lista.innerHTML = `<div class="deudores">${grupos.map((g) => `
      <article class="panel deudor ${g.maxAtraso > 30 ? 'deudor-grave' : g.maxAtraso > 0 ? 'deudor-atrasado' : ''}" data-cliente="${esc(g.cliente.id)}">
        <div class="deudor-cabeza">
          <div><h2>${esc(nombreCliente(g.cliente))}</h2>
            <p class="texto-suave">${g.facturas.length} documento${g.facturas.length > 1 ? 's' : ''}${g.maxAtraso > 0 ? ` · <span class="texto-alerta">el más antiguo con ${g.maxAtraso} días de atraso</span>` : ' · al día'}${g.cliente.ultimoRecordatorio ? ` · recordado el ${fechaCorta(g.cliente.ultimoRecordatorio.fecha)}` : ''}</p></div>
          <span class="deudor-total">${pesos(g.total)}</span>
        </div>
        <ul class="folios">${g.facturas.map((f) => { const d = diasAtraso(f, hoy); return `
          <li><button class="folio" data-factura="${esc(f.id)}"><span>${esc(etiquetaFactura(f))}</span><span class="texto-suave">${fechaCorta(f.fecha)}</span>
            <span class="${d > 0 ? 'texto-alerta' : 'texto-suave'}">${textoAtraso(d)}</span><span class="folio-monto">${pesos(saldo(f))}${f.pagado > 0 ? ` <span class="texto-tenue">de ${pesos(f.total)}</span>` : ''}</span></button></li>`; }).join('')}</ul>
        <div class="deudor-acciones">
          <button class="btn btn-suave btn-chico" data-recordar>Recordar por WhatsApp</button>
          <button class="btn btn-suave btn-chico" data-estado>Estado de cuenta</button>
          <button class="btn btn-primario btn-chico" data-pagar>Registrar pago</button>
        </div>
      </article>`).join('')}</div>`;
    $$('.deudor', lista).forEach((card) => {
      const g = grupos.find((x) => x.cliente.id === card.dataset.cliente);
      $('[data-pagar]', card).addEventListener('click', () => pagoDialogo(g.cliente.id));
      $('[data-recordar]', card).addEventListener('click', () => recordatorio(g.cliente, g.facturas));
      $('[data-estado]', card).addEventListener('click', () => estadoCuenta(g.cliente, g.facturas));
      $$('[data-factura]', card).forEach((b) => b.addEventListener('click', () => detalleFactura(g.facturas.find((f) => f.id === b.dataset.factura))));
    });
  };
  const des = [alCambiar(pintar), escucharDonde('facturas', 'abierta', '==', true, (l) => { abiertas = l; pintar(); })];
  pintar();
  return () => des.forEach((u) => u());
}

// ---------------------------------------------------------------- Recordatorio
function textoRecordatorio(cliente, facturas, tono) {
  const e = estado.empresa || {};
  const quien = e.nombreFantasia || 'Vadim Strika';
  const saludo = cliente.contacto ? cliente.contacto.split(' ')[0] : nombreCliente(cliente);
  const hoy = hoyISO();
  const total = facturas.reduce((s, f) => s + saldo(f), 0);
  const linea = (f) => { const d = diasAtraso(f, hoy); return `• ${etiquetaFactura(f)} del ${fechaCorta(f.fecha)}: ${pesos(saldo(f))}${d > 0 ? ` (venció hace ${d} día${d > 1 ? 's' : ''})` : ` (vence el ${fechaCorta(f.vencimiento)})`}`; };
  const una = facturas.length === 1;
  const detalle = una ? `la ${etiquetaFactura(facturas[0]).toLowerCase()} del ${fechaCorta(facturas[0].fecha)} por ${pesos(total)}` : `estos documentos:\n${facturas.map(linea).join('\n')}\nTotal: ${pesos(total)}`;
  const banco = e.datosTransferencia ? `\n\nDatos para transferir: ${e.datosTransferencia}` : '';
  if (tono === 'firme') {
    return `Hola ${saludo}. Te escribo de ${quien} porque tenemos pendiente ${una ? detalle : `el pago de ${detalle}`}.\n\nTe pido por favor regularizar el pago esta semana.${banco}\n\nQuedo atento a la confirmación. Gracias.`;
  }
  return `Hola ${saludo}, ¿cómo estás? Te escribo de ${quien} para recordarte ${una ? `que tenemos pendiente ${detalle}` : `que tenemos pendientes ${detalle}`}.${banco}\n\nSi ya lo pagaste, avísame y lo marco. ¡Muchas gracias!`;
}

async function recordatorio(cliente, facturas) {
  const conAtraso = facturas.some((f) => diasAtraso(f) > 15);
  const tel = telefonoWhatsApp(cliente.whatsapp);
  await formulario({
    titulo: `Recordar a ${nombreCliente(cliente)}`, ancho: true, textoGuardar: 'Abrir WhatsApp',
    cuerpo: `
      <div class="segmentado" role="radiogroup">
        <label><input type="radio" name="tono" value="amable" ${!conAtraso ? 'checked' : ''}><span>Amable</span></label>
        <label><input type="radio" name="tono" value="firme" ${conAtraso ? 'checked' : ''}><span>Firme</span></label>
      </div>
      <label class="campo"><span class="campo-etiqueta">Mensaje ${info('Puedes cambiar el texto antes de enviarlo. Los datos de transferencia salen de Configuración → Empresa.')}</span><textarea name="texto" rows="10"></textarea></label>
      ${tel ? `<p class="texto-suave">Se abrirá el chat de WhatsApp con ${esc(cliente.whatsapp)}.</p>` : '<p class="aviso aviso-suave">Este cliente no tiene WhatsApp. Se abrirá WhatsApp para que elijas el chat, o agrega el número en Ventas → Clientes.</p>'}
      <label class="interruptor"><input type="checkbox" name="conPdf"><span>Adjuntar el estado de cuenta en PDF</span></label>`,
    montar(dlg, form) {
      const v = () => { form.texto.value = textoRecordatorio(cliente, facturas, form.tono.value); };
      $$('input[name=tono]', dlg).forEach((r) => r.addEventListener('change', v));
      v();
    },
    async guardar(form) {
      const texto = form.texto.value.trim();
      if (!texto) return 'El mensaje está vacío.';
      if (form.conPdf.checked) {
        try {
          const blob = await pdfEstadoCuenta(cliente, facturas, { diasAtraso, saldo, etiquetaFactura });
          await compartirPDF(blob, `Estado de cuenta ${nombreCliente(cliente)}.pdf`, texto, cliente.whatsapp);
        } catch (e) { console.error(e); return 'No se pudo generar el PDF. Revisa la conexión la primera vez que lo usas.'; }
      } else {
        window.open(enlaceWhatsApp(cliente.whatsapp, texto), '_blank', 'noopener');
      }
      if (cliente.id && estado.clientes[cliente.id]) {
        enviar(nuevoLote().update(refDoc('clientes', cliente.id), { ultimoRecordatorio: { fecha: hoyISO(), tono: form.tono.value }, ...firma() }).commit(), { alFallar: fallo });
      }
      return null;
    }
  });
}

async function estadoCuenta(cliente, facturas) {
  toast('Preparando el estado de cuenta…');
  try {
    const blob = await pdfEstadoCuenta(cliente, facturas, { diasAtraso, saldo, etiquetaFactura });
    const total = facturas.reduce((s, f) => s + saldo(f), 0);
    const r = await compartirPDF(blob, `Estado de cuenta ${nombreCliente(cliente)}.pdf`, `Hola, te envío el estado de cuenta de ${estado.empresa?.nombreFantasia || 'Vadim Strika'}: total pendiente ${pesos(total)}.`, cliente.whatsapp);
    if (r === 'descargado') toast('Estado de cuenta descargado. Adjúntalo en el chat que se abrió.');
  } catch (e) {
    console.error(e);
    toast('No se pudo generar el PDF. Revisa la conexión la primera vez que lo usas.', 'error');
  }
}

// ---------------------------------------------------------------- Pago
async function pagoDialogo(clienteId = '') {
  let fs = abiertas.length ? abiertas : await documentosDonde('facturas', 'abierta', '==', true).catch(() => []);
  fs = fs.filter((f) => !f.anulada && saldo(f) > 0);
  const ids = [...new Set(fs.map((f) => f.clienteId))];
  if (!ids.length) { toast('No hay facturas pendientes de pago.', 'aviso'); return; }
  const cli = (id) => estado.clientes[id] || { id, nombre: fs.find((f) => f.clienteId === id)?.clienteNombre };
  await formulario({
    titulo: 'Registrar pago', ancho: true, textoGuardar: 'Registrar pago',
    cuerpo: `
      <div class="campos">
        <label class="campo campo-ancho"><span class="campo-etiqueta">Cliente</span>
          <select name="cliente">${ids.map((id) => `<option value="${esc(id)}" ${id === clienteId ? 'selected' : ''}>${esc(nombreCliente(cli(id)))}</option>`).join('')}</select></label>
        ${campoNumero('monto', 'Monto recibido', '', { sufijo: '$', requerido: true, ayuda: info('Escribe lo que pagó y la app lo reparte entre sus facturas, de la más antigua a la más nueva. Puedes cambiar cuánto va a cada una. Un pago puede cubrir varias facturas o solo parte de una.') })}
        <label class="campo"><span class="campo-etiqueta">Fecha</span><input type="date" name="fecha" value="${hoyISO()}" max="${hoyISO()}"></label>
        <label class="campo"><span class="campo-etiqueta">Medio de pago</span><select name="medio">${opcionesLista('mediosPago', 'transferencia')}</select></label>
        <label class="campo"><span class="campo-etiqueta">Referencia</span><input name="referencia" maxlength="60" placeholder="N° de operación, opcional"></label>
      </div>
      <div class="tabla-scroll"><table class="tabla tabla-entrada"><thead><tr><th>Documento</th><th class="num">Saldo</th><th class="num">Se aplica</th></tr></thead><tbody data-filas></tbody>
        <tfoot><tr><th>Total aplicado</th><th></th><th class="num" data-aplicado>$0</th></tr></tfoot></table></div>
      <p class="texto-suave" data-dif></p>`,
    montar(dlg, form) {
      const pintar = () => {
        const mias = fs.filter((f) => f.clienteId === form.cliente.value).sort((a, b) => (a.vencimiento || '').localeCompare(b.vencimiento || ''));
        $('[data-filas]', dlg).innerHTML = mias.map((f) => `<tr data-id="${esc(f.id)}"><td><span class="celda-nombre">${esc(etiquetaFactura(f))}</span><span class="celda-sub">${fechaCorta(f.fecha)} · ${textoAtraso(diasAtraso(f))}</span></td>
          <td class="num">${pesos(saldo(f))}</td><td class="num"><span class="con-sufijo"><input data-m inputmode="numeric" value="" aria-label="Monto aplicado"><span class="sufijo">$</span></span></td></tr>`).join('');
        if (!form.monto.value) form.monto.value = numero(mias.reduce((s, f) => s + saldo(f), 0), 0);
        distribuir();
      };
      const distribuir = () => {
        const mias = fs.filter((f) => f.clienteId === form.cliente.value);
        const rep = repartir(leerNumero(form.monto.value) || 0, mias);
        rep.forEach(({ factura, monto }) => { const i = $(`tr[data-id="${factura.id}"] [data-m]`, dlg); if (i) i.value = monto ? numero(monto, 0) : ''; });
        sumar();
      };
      const sumar = () => {
        const ap = $$('[data-m]', dlg).reduce((s, i) => s + (leerNumero(i.value) || 0), 0);
        $('[data-aplicado]', dlg).textContent = pesos(ap);
        const m = leerNumero(form.monto.value) || 0;
        const total = fs.filter((f) => f.clienteId === form.cliente.value).reduce((s, f) => s + saldo(f), 0);
        $('[data-dif]', dlg).innerHTML = m > total ? `<span class="texto-alerta">El monto supera lo que debe (${pesos(total)}). Revisa el monto o registra la diferencia como una nueva factura.</span>`
          : Math.round(ap) !== Math.round(m) ? `<span class="texto-alerta">Lo aplicado no suma el monto recibido.</span>` : '';
      };
      form.cliente.addEventListener('change', () => { form.monto.value = ''; pintar(); });
      form.monto.addEventListener('input', distribuir);
      $('[data-filas]', dlg).addEventListener('input', sumar);
      pintar();
    },
    guardar(form, dlg) {
      const m = leerNumero(form.monto.value);
      if (!(m > 0)) return 'Escribe el monto recibido.';
      const aplicaciones = [];
      for (const tr of $$('[data-filas] tr', dlg)) {
        const f = fs.find((x) => x.id === tr.dataset.id);
        const v = leerNumero($('[data-m]', tr).value) || 0;
        if (v < 0 || v > saldo(f) + 0.5) return `A ${etiquetaFactura(f)} no se le puede aplicar más que su saldo (${pesos(saldo(f))}).`;
        if (v > 0) aplicaciones.push({ factura: f, monto: v });
      }
      const ap = aplicaciones.reduce((s, a) => s + a.monto, 0);
      if (!aplicaciones.length) return 'Aplica el pago a al menos una factura.';
      if (Math.round(ap) !== Math.round(m)) return `Lo aplicado (${pesos(ap)}) no suma el monto recibido (${pesos(m)}).`;
      const cliente = cli(form.cliente.value);
      const lote = nuevoLote();
      registrarPago(lote, { cliente, fecha: form.fecha.value || hoyISO(), medio: form.medio.value, referencia: form.referencia.value.trim(), aplicaciones });
      const quedan = aplicaciones.filter((a) => saldo(a.factura) > 0).length;
      enviar(lote.commit(), { alGuardar: avisoGuardado(toast, `Pago de ${pesos(m)} registrado${quedan ? `. Queda saldo en ${quedan} documento${quedan > 1 ? 's' : ''}` : ''}`), alFallar: fallo });
      return null;
    }
  });
}

// ================================================================ Facturas
function vistaFacturas(el) {
  let mes = mesDe(hoyISO());
  let filtro = '';
  let delMes = [];
  let des = null;
  el.innerHTML = `
    <section class="panel zona-carga" data-zona>
      <div><p class="zona-titulo">Facturas emitidas ${info('En el SII: Servicios online → Factura electrónica → Sistema de facturación gratuito → Ver documentos emitidos, y descarga el XML. Cada factura queda por cobrar a su cliente; si el cliente no existe, se crea con sus datos. Las notas de crédito descuentan de la factura que corrigen.')}</p>
        <p class="texto-suave">Arrastra aquí los XML de las facturas que emitiste, o regístralas a mano.</p></div>
      <div class="grupo-botones"><button class="btn btn-suave" data-manual>${ICONOS.lapiz}<span>Factura a mano</span></button><button class="btn btn-primario" data-xml>${ICONOS.mas2}<span>Cargar XML</span></button></div>
      <input type="file" accept=".xml,text/xml,application/xml" multiple hidden data-archivo>
    </section>
    <div class="barra-herramientas">
      <select class="filtro" data-mes aria-label="Mes">${meses().map((m) => `<option value="${m}">${nombreMes(m)}</option>`).join('')}</select>
      <select class="filtro" data-estado aria-label="Estado"><option value="">Todas</option><option value="abiertas">Por cobrar</option><option value="pagada">Pagadas</option><option value="anulada">Anuladas</option></select>
      <span class="espacio"></span><span class="texto-suave" data-total></span>
    </div>
    <div data-lista></div>`;
  const archivo = $('[data-archivo]', el);
  $('[data-xml]', el).addEventListener('click', () => archivo.click());
  archivo.addEventListener('change', () => { if (archivo.files.length) cargar([...archivo.files]); archivo.value = ''; });
  $('[data-manual]', el).addEventListener('click', () => facturaManual());
  const zona = $('[data-zona]', el);
  ['dragenter', 'dragover'].forEach((t) => zona.addEventListener(t, (e) => { e.preventDefault(); zona.classList.add('arrastrando'); }));
  ['dragleave', 'drop'].forEach((t) => zona.addEventListener(t, (e) => { e.preventDefault(); zona.classList.remove('arrastrando'); }));
  zona.addEventListener('drop', (e) => { const xs = [...(e.dataTransfer?.files || [])].filter((f) => /\.xml$/i.test(f.name)); if (xs.length) cargar(xs); });
  $('[data-mes]', el).addEventListener('change', (e) => { mes = e.target.value; suscribir(); });
  $('[data-estado]', el).addEventListener('change', (e) => { filtro = e.target.value; pintar(); });
  const pintar = () => {
    const vis = delMes.filter((f) => !filtro || (filtro === 'abiertas' ? f.abierta : f.estado === filtro)).sort((a, b) => b.fecha.localeCompare(a.fecha) || b.creadoMs - a.creadoMs);
    const emitido = delMes.filter((f) => !f.anulada).reduce((s, f) => s + (Number(f.tipoDoc) === 61 ? -1 : 1) * (f.total || 0), 0);
    $('[data-total]', el).textContent = delMes.length ? `Facturado en el mes: ${pesos(emitido)}` : '';
    const lista = $('[data-lista]', el);
    if (!vis.length) { lista.innerHTML = vacio(`Sin facturas en ${nombreMes(mes).toLowerCase()}`, 'Carga los XML de las facturas emitidas o regístralas a mano.'); return; }
    lista.innerHTML = `<section class="panel tabla-panel"><ul class="filas">${vis.map((f) => `
      <li><button class="fila ${f.anulada ? 'fila-anulada' : ''}" data-id="${esc(f.id)}">
        <span class="fila-principal"><span class="fila-nombre">${esc(f.clienteNombre)}</span>
          <span class="fila-meta"><span>${fechaCorta(f.fecha)} · ${esc(etiquetaFactura(f))}</span>${etiquetaEstado(f)}</span></span>
        <span class="fila-dato fila-dato-fuerte"><span class="fila-etq">Total</span>${pesos((Number(f.tipoDoc) === 61 ? -1 : 1) * f.total)}</span>
        <span class="fila-dato"><span class="fila-etq">Saldo</span>${f.abierta ? pesos(saldo(f)) : '—'}</span>
      </button></li>`).join('')}</ul></section>`;
    $$('.fila', lista).forEach((b) => b.addEventListener('click', () => detalleFactura(delMes.find((f) => f.id === b.dataset.id))));
  };
  function suscribir() { des?.(); delMes = []; des = escucharDonde('facturas', 'mes', '==', mes, (l) => { delMes = l; pintar(); }); }
  suscribir();
  const desE = alCambiar(pintar);
  pintar();
  return () => { des?.(); desE(); };
}

const etiquetaEstado = (f) => ({
  pendiente: diasAtraso(f) > 0 ? '<span class="etiqueta etiqueta-alerta">Vencida</span>' : '<span class="etiqueta">Por cobrar</span>',
  parcial: '<span class="etiqueta etiqueta-info">Pago parcial</span>',
  pagada: '<span class="etiqueta etiqueta-ok">Pagada</span>',
  anulada: '<span class="etiqueta etiqueta-suave">Anulada</span>',
  'nota-credito': `<span class="etiqueta">${f.aplicadaA ? `Corrige la ${f.aplicadaA.folio}` : 'Nota de crédito'}</span>`
}[f.estado] || '');

async function cargar(archivos) {
  toast(`Leyendo ${archivos.length} archivo${archivos.length > 1 ? 's' : ''}…`);
  let r;
  try { r = await importarEmitidas(archivos); } catch (e) { console.error(e); toast('No se pudieron cargar los archivos. Revisa la conexión.', 'error'); return; }
  r.promesa.catch(fallo);
  const lista = (t, xs) => (xs.length ? `<p><strong>${t}</strong></p><ul class="lista-puntos">${xs.slice(0, 20).map((x) => `<li>${esc(x)}</li>`).join('')}${xs.length > 20 ? `<li>y ${xs.length - 20} más</li>` : ''}</ul>` : '');
  await dialogo({
    titulo: r.nuevas.length ? `${r.nuevas.length} documento${r.nuevas.length > 1 ? 's' : ''} cargado${r.nuevas.length > 1 ? 's' : ''}` : 'No se cargaron documentos nuevos',
    cuerpo: `${r.clientesNuevos ? `<p>Se crearon ${r.clientesNuevos} cliente${r.clientesNuevos > 1 ? 's' : ''} nuevo${r.clientesNuevos > 1 ? 's' : ''} con los datos de la factura. Agrégales su WhatsApp en Ventas → Clientes para enviarles recordatorios.</p>` : ''}
      ${r.notas ? `<p>${r.notas} nota${r.notas > 1 ? 's' : ''} de crédito se descontaron de la factura que corrigen.</p>` : ''}
      ${lista('Ya estaban cargadas:', r.repetidas)}${lista('No se cargaron:', r.ajenas)}${lista('Atención:', r.errores)}`,
    botones: [{ texto: 'Entendido', valor: true }]
  });
}

async function facturaManual() {
  const clientes = () => Object.values(estado.clientes).filter((c) => !c.archivado).sort((a, b) => nombreCliente(a).localeCompare(nombreCliente(b), 'es'));
  const opciones = (sel = '') => `<option value="">Elige un cliente</option>${clientes().map((c) => `<option value="${esc(c.id)}" ${c.id === sel ? 'selected' : ''}>${esc(nombreCliente(c))}</option>`).join('')}`;
  await formulario({
    titulo: 'Factura a mano', ancho: true, textoGuardar: 'Guardar factura',
    cuerpo: `
      <p class="texto-suave">Para facturas emitidas que no tienes en XML, o deudas sin documento (por ejemplo, un abono pendiente). ${info('Lo más rápido y exacto es cargar el XML desde el SII. Usa esto cuando no lo tengas a mano.')}</p>
      <div class="campos">
        <div class="campo campo-ancho"><span class="campo-etiqueta">Cliente <span class="req">*</span></span>
          <div class="con-boton"><select name="cliente">${opciones()}</select><button type="button" class="btn btn-suave btn-chico" data-nuevo-cliente>Nuevo</button></div></div>
        <label class="campo"><span class="campo-etiqueta">Tipo</span><select name="tipoDoc">${TIPOS_MANUAL.map((t) => `<option value="${t}">${t === 0 ? 'Sin documento' : TIPOS_DTE[t]}</option>`).join('')}</select></label>
        <label class="campo" data-folio><span class="campo-etiqueta">Folio <span class="req">*</span></span><input name="folio" inputmode="numeric" maxlength="20"></label>
        <label class="campo"><span class="campo-etiqueta">Fecha</span><input type="date" name="fecha" value="${hoyISO()}" max="${hoyISO()}"></label>
        <label class="campo"><span class="campo-etiqueta">Vencimiento ${info('Se calcula con el plazo de pago del cliente. Cámbialo si acordaron otra fecha.')}</span><input type="date" name="vencimiento"></label>
        ${campoNumero('monto', 'Monto neto', '', { sufijo: '$', requerido: true })}
        <p class="texto-suave" data-total></p>
        <label class="campo campo-ancho" data-nc hidden><span class="campo-etiqueta">Corrige la factura</span><select name="corrige"><option value="">Ninguna</option></select></label>
        <label class="campo campo-ancho"><span class="campo-etiqueta">Detalle</span><input name="detalle" maxlength="200" placeholder="Ej.: 24 tazas nube, pedido de octubre"></label>
      </div>`,
    montar(dlg, form) {
      const v = () => {
        const t = Number(form.tipoDoc.value);
        $('[data-folio]', dlg).hidden = t === 0;
        $('[data-nc]', dlg).hidden = t !== 61;
        $('.campo-etiqueta', form.monto.closest('.campo')).firstChild.textContent = t === 33 || t === 61 ? 'Monto neto ' : 'Monto total ';
        const m = leerNumero(form.monto.value) || 0;
        $('[data-total]', dlg).textContent = (t === 33 || t === 61) && m ? `IVA ${pesos(Math.round(m * 0.19))} · total ${pesos(m + Math.round(m * 0.19))}` : '';
        const c = estado.clientes[form.cliente.value];
        if (c && !form.vencimiento.dataset.tocado) form.vencimiento.value = t === 61 ? form.fecha.value : sumarDias(form.fecha.value || hoyISO(), c.condicionDias ?? 30);
        if (t === 61) {
          const fs = abiertas.filter((f) => f.clienteId === form.cliente.value && saldo(f) > 0);
          const sel = form.corrige.value;
          form.corrige.innerHTML = `<option value="">Ninguna</option>${fs.map((f) => `<option value="${esc(f.id)}" ${f.id === sel ? 'selected' : ''}>${esc(etiquetaFactura(f))} · saldo ${pesos(saldo(f))}</option>`).join('')}`;
        }
      };
      form.vencimiento.addEventListener('input', () => { form.vencimiento.dataset.tocado = '1'; });
      dlg.addEventListener('change', v);
      dlg.addEventListener('input', v);
      $('[data-nuevo-cliente]', dlg).addEventListener('click', async () => {
        const c = await editarCliente(null);
        if (c) { estado.clientes[c.id] = { ...c, ...(estado.clientes[c.id] || {}) }; form.cliente.innerHTML = opciones(c.id); v(); }
      });
      v();
    },
    async guardar(form) {
      const c = estado.clientes[form.cliente.value];
      if (!c) return 'Elige el cliente.';
      const t = Number(form.tipoDoc.value);
      const folio = form.folio.value.trim();
      if (t !== 0 && !folio) return 'Escribe el folio.';
      const m = leerNumero(form.monto.value);
      if (!(m > 0)) return 'Escribe el monto.';
      if (t !== 0) {
        const previas = await documentosDonde('facturas', 'clienteId', '==', c.id).catch(() => []);
        if (previas.some((f) => Number(f.tipoDoc) === t && String(f.folio) === folio && !f.anulada)) return `Ya existe la ${TIPOS_DTE[t].toLowerCase()} ${folio} de este cliente.`;
      }
      const conIva = t === 33 || t === 61;
      const iva = conIva ? Math.round(m * 0.19) : 0;
      const fecha = form.fecha.value || hoyISO();
      const datos = {
        tipoDoc: t, folio: t === 0 ? '' : folio, fecha, mes: mesDe(fecha), vencimiento: form.vencimiento.value || sumarDias(fecha, c.condicionDias ?? 30),
        clienteId: c.id, clienteNombre: nombreCliente(c), rutCliente: c.rut || '', rutLimpio: c.rutLimpio || '',
        neto: conIva ? m : 0, exento: conIva ? 0 : m, iva, total: m + iva,
        lineas: form.detalle.value.trim() ? [{ nombre: form.detalle.value.trim(), cantidad: 1, monto: m }] : [], referencias: []
      };
      const lote = nuevoLote();
      if (t === 61) {
        const objetivo = abiertas.find((f) => f.id === form.corrige.value);
        const id = crearFacturaManual(lote, { ...datos, vencimiento: fecha, aplicadaA: objetivo ? { facturaId: objetivo.id, folio: objetivo.folio } : null });
        lote.update(refDoc('facturas', id), { estado: 'nota-credito', abierta: false, ...firma() });
        if (objetivo) registrarPago(lote, { cliente: c, fecha, medio: 'nota-credito', referencia: `NC ${folio}`, aplicaciones: [{ factura: objetivo, monto: Math.min(datos.total, saldo(objetivo)) }], tipo: 'nota-credito' });
      } else {
        crearFacturaManual(lote, datos);
      }
      enviar(lote.commit(), { alGuardar: avisoGuardado(toast, t === 61 ? 'Nota de crédito guardada' : `Factura guardada: ${pesos(datos.total)} por cobrar a ${nombreCliente(c)}`), alFallar: fallo });
      return null;
    }
  });
}

async function detalleFactura(f) {
  const pagos = (await documentosDonde('pagos', 'clienteId', '==', f.clienteId).catch(() => []))
    .filter((p) => p.aplicaciones.some((a) => a.facturaId === f.id)).sort((a, b) => b.fecha.localeCompare(a.fecha));
  const activos = pagos.filter((p) => !p.anulado);
  await formulario({
    titulo: `${etiquetaFactura(f)} · ${f.clienteNombre}`, ancho: true, textoGuardar: '',
    extra: f.anulada || f.estado === 'nota-credito' ? '' : `${f.abierta ? '<button type="button" class="btn btn-primario" data-pagar>Registrar pago</button>' : ''}<button type="button" class="btn btn-peligro" data-anular>Anular</button>`,
    cuerpo: `
      <div class="resumen resumen-chico">
        <div class="dato"><span class="dato-etq">Total</span><span class="dato-valor">${pesos(f.total)}</span></div>
        <div class="dato"><span class="dato-etq">Pagado</span><span class="dato-valor">${pesos(f.pagado || 0)}</span></div>
        <div class="dato ${f.abierta && diasAtraso(f) > 0 ? 'dato-alerta' : ''}"><span class="dato-etq">Saldo</span><span class="dato-valor">${pesos(f.abierta ? saldo(f) : 0)}</span></div>
      </div>
      <dl class="datos-fijos compacto">
        <div><dt>Emisión</dt><dd>${fechaCorta(f.fecha)}</dd></div>
        <div><dt>Vencimiento</dt><dd>${fechaCorta(f.vencimiento)}${f.abierta ? ` · ${textoAtraso(diasAtraso(f))}` : ''}</dd></div>
        <div><dt>Neto · IVA</dt><dd>${pesos(f.neto || f.exento || 0)} · ${pesos(f.iva || 0)}</dd></div>
        ${f.rutCliente ? `<div><dt>RUT</dt><dd>${esc(f.rutCliente)}</dd></div>` : ''}
        ${(f.ordenNumeros || []).length ? `<div><dt>Órdenes de venta</dt><dd>${f.ordenNumeros.map((n) => `OV ${esc(n)}`).join(', ')}</dd></div>` : ''}
      </dl>
      ${(f.lineas || []).length ? `<h3>Detalle</h3><ul class="lista-bajos">${f.lineas.map((l) => `<li><span>${l.cantidad && l.cantidad !== 1 ? `${numero(l.cantidad)} × ` : ''}${esc(l.nombre)}</span><span>${pesos(l.monto)}</span></li>`).join('')}</ul>` : ''}
      <h3>Pagos</h3>
      ${pagos.length ? `<ul class="lista-bajos">${pagos.map((p) => `<li class="${p.anulado ? 'tachado' : ''}"><span>${fechaCorta(p.fecha)} · ${esc(medioTexto(p.medio))}${p.referencia ? ` · ${esc(p.referencia)}` : ''}${p.anulado ? ' · anulado' : ''}</span><span>${pesos(p.aplicaciones.find((a) => a.facturaId === f.id)?.monto || 0)}</span></li>`).join('')}</ul>` : '<p class="texto-suave">Sin pagos todavía.</p>'}`,
    montar(dlg, form, cerrar) {
      $('[data-pagar]', dlg)?.addEventListener('click', () => { cerrar(); pagoDialogo(f.clienteId); });
      $('[data-anular]', dlg)?.addEventListener('click', async () => {
        if (activos.length) { toast('Esta factura tiene pagos. Anula primero los pagos en la pestaña Pagos.', 'error'); return; }
        if (!(await confirmar('Anular factura', `La ${esc(etiquetaFactura(f).toLowerCase())} deja de estar por cobrar y queda en el historial como anulada. En el SII se anula con una nota de crédito; si la emitiste, cárgala también.${(f.ordenIds || []).length ? ' Sus órdenes de venta vuelven a «Por facturar».' : ''}`, 'Anular', true))) return;
        const lote = nuevoLote();
        anularFactura(lote, f);
        enviar(lote.commit(), { alGuardar: avisoGuardado(toast, 'Factura anulada'), alFallar: fallo });
        cerrar();
      });
    }
  });
}

// ================================================================ Pagos
function vistaPagos(el) {
  el.innerHTML = '<div class="barra-herramientas"><span class="espacio"></span><button class="btn btn-primario" data-pago>Registrar pago</button></div><div data-lista><p class="texto-suave">Cargando…</p></div>';
  $('[data-pago]', el).addEventListener('click', () => pagoDialogo().then(() => setTimeout(cargar, 300)));
  const lista = $('[data-lista]', el);
  async function cargar() {
    let ps;
    try { ps = await ultimosDocumentos('pagos', 80); } catch { lista.innerHTML = '<p class="texto-suave">No se pudo cargar. Revisa la conexión.</p>'; return; }
    if (!ps.length) { lista.innerHTML = vacio('Sin pagos registrados', 'Cuando un cliente te pague, regístralo desde Por cobrar o aquí. Un pago puede cubrir varias facturas o parte de una.'); return; }
    const mes = mesDe(hoyISO());
    const delMes = ps.filter((p) => !p.anulado && p.fecha.startsWith(mes) && p.tipo !== 'nota-credito').reduce((s, p) => s + p.monto, 0);
    lista.innerHTML = `<p class="texto-suave nota-lista">Cobrado este mes: <strong>${pesos(delMes)}</strong></p>
      <section class="panel tabla-panel"><ul class="filas">${ps.sort((a, b) => b.fecha.localeCompare(a.fecha) || b.creadoMs - a.creadoMs).map((p) => `
      <li class="fila-con-accion"><div class="fila ${p.anulado ? 'fila-anulada' : ''}">
        <span class="fila-principal"><span class="fila-nombre">${esc(p.clienteNombre)}</span>
          <span class="fila-meta"><span>${fechaCorta(p.fecha)} · ${esc(medioTexto(p.medio))}${p.referencia ? ` · ${esc(p.referencia)}` : ''}</span><span>${p.aplicaciones.map((a) => `${esc(TIPOS_DTE[a.tipoDoc] || 'Doc.')} ${esc(a.folio)}`).join(', ')}</span>${p.anulado ? '<span class="etiqueta etiqueta-suave">Anulado</span>' : ''}</span></span>
        <span class="fila-dato fila-dato-fuerte"><span class="fila-etq">Monto</span>${pesos(p.monto)}</span></div>
        ${p.anulado || p.tipo === 'nota-credito' ? '' : `<button class="btn btn-suave btn-chico" data-anular="${esc(p.id)}">Anular</button>`}
      </li>`).join('')}</ul></section>`;
    $$('[data-anular]', lista).forEach((b) => b.addEventListener('click', async () => {
      const p = ps.find((x) => x.id === b.dataset.anular);
      if (!(await confirmar('Anular pago', `El pago de ${pesos(p.monto)} de ${esc(p.clienteNombre)} se anula y sus facturas vuelven a quedar con saldo.`, 'Anular pago', true))) return;
      const fs = {};
      (await documentosDonde('facturas', 'clienteId', '==', p.clienteId).catch(() => [])).forEach((f) => { fs[f.id] = f; });
      const lote = nuevoLote();
      anularPago(lote, p, fs);
      enviar(lote.commit(), { alGuardar: avisoGuardado(toast, 'Pago anulado'), alFallar: fallo });
      setTimeout(cargar, 300);
    }));
  }
  cargar();
  return null;
}
