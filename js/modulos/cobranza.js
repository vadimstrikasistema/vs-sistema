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
import { vistaDeudores, fichaCliente, vistaSeguimientoConsignacion, cargarDeudas } from './cobranza-deudores.js';
import { todasLasDeudas, diasAtrasoDeuda, registrarGestion } from '../cobranza-gestion-core.js';
import { pagarVenta } from '../ventas-core.js';
import { pagarAlumno } from '../clases-core.js';
import { agregarAbono } from '../encargos-core.js';

const PEST = [['por-cobrar', 'Por cobrar'], ['consignacion', 'Consignación'], ['facturas', 'Facturas'], ['pagos', 'Pagos']];
const fallo = avisoError(toast);
const TIPOS_MANUAL = [33, 34, 61, 0];
const nombreMes = (m) => { const [y, mm] = m.split('-').map(Number); const t = new Date(y, mm - 1, 1).toLocaleDateString('es-CL', { month: 'long', year: 'numeric' }); return t.charAt(0).toUpperCase() + t.slice(1); };
const meses = (n = 13) => { const d = new Date(); return Array.from({ length: n }, (_, i) => { const f = new Date(d.getFullYear(), d.getMonth() - i, 1); return `${f.getFullYear()}-${String(f.getMonth() + 1).padStart(2, '0')}`; }); };
const textoAtraso = (d) => (d > 0 ? `${d} día${d > 1 ? 's' : ''} de atraso` : d === 0 ? 'Vence hoy' : `Vence en ${-d} día${d < -1 ? 's' : ''}`);
const medioTexto = (m) => (m === 'nota-credito' ? 'Nota de crédito' : m ? nombreItem('mediosPago', m) : 'Sin indicar');

let abiertas = [];

export { detalleFactura };

export default {
  render(el, { sub }) {
    if (sub === 'cliente') {
      const id = location.hash.split('/')[3] || '';
      return fichaCliente(el, decodeURIComponent(id), { pagoDialogo, abrirFactura: detalleFactura });
    }
    const actual = PEST.some(([k]) => k === sub) ? sub : 'por-cobrar';
    el.innerHTML = `
      <header class="pagina-cabecera">
        <h1>Cobranza</h1>
        <p class="pagina-bajada">${{ 'por-cobrar': 'Qué te deben, quién, cuánto y desde cuándo, y qué toca hacer para cobrarlo.', consignacion: 'Tiendas con piezas en consignación: cuánto tiempo llevan sin liquidar o sin visita.', facturas: 'Las facturas emitidas por el taller, cargadas desde el XML del SII o a mano.', pagos: 'Cada pago recibido y a qué facturas se aplicó.' }[actual]}</p>
      </header>
      ${pestanas('cobranza', PEST, actual)}
      <div id="cob-cuerpo"></div>`;
    const c = $('#cob-cuerpo', el);
    return ({ 'por-cobrar': (x) => vistaDeudores(x, { pagoDialogo }), consignacion: vistaSeguimientoConsignacion, facturas: vistaFacturas, pagos: vistaPagos })[actual](c);
  }
};

// Pago de un cliente: se reparte entre lo que debe (facturas, ventas que quedaron
// debiendo, saldos de clases y de encargos listos), de lo más antiguo a lo más nuevo.
export async function pagoDialogo(clienteId = '') {
  const fuentes = await cargarDeudas();
  const ds = todasLasDeudas(fuentes).filter((d) => d.cobrable);
  const ids = [...new Set(ds.map((d) => d.clienteId))];
  if (!ids.length) { toast('No hay nada pendiente de pago.', 'aviso'); return; }
  const cli = (id) => estado.clientes[id] || { id, nombre: ds.find((d) => d.clienteId === id)?.clienteNombre };
  await formulario({
    titulo: 'Registrar pago', ancho: true, textoGuardar: 'Registrar pago',
    cuerpo: `
      <div class="campos">
        <label class="campo campo-ancho"><span class="campo-etiqueta">Cliente</span>
          <select name="cliente">${ids.map((id) => `<option value="${esc(id)}" ${id === clienteId ? 'selected' : ''}>${esc(nombreCliente(cli(id)))}</option>`).join('')}</select></label>
        ${campoNumero('monto', 'Monto recibido', '', { sufijo: '$', requerido: true, ayuda: info('Escribe lo que pagó y la app lo reparte entre lo que debe, de lo más antiguo a lo más nuevo. Puedes cambiar cuánto va a cada cosa. Un pago puede cubrir varias deudas o solo parte de una.') })}
        <label class="campo"><span class="campo-etiqueta">Fecha</span><input type="date" name="fecha" value="${hoyISO()}" max="${hoyISO()}"></label>
        <label class="campo"><span class="campo-etiqueta">Medio de pago</span><select name="medio">${opcionesLista('mediosPago', 'transferencia')}</select></label>
        <label class="campo"><span class="campo-etiqueta">Referencia</span><input name="referencia" maxlength="60" placeholder="N° de operación, opcional"></label>
      </div>
      <div class="tabla-scroll"><table class="tabla tabla-entrada"><thead><tr><th>Deuda</th><th class="num">Saldo</th><th class="num">Se aplica</th></tr></thead><tbody data-filas></tbody>
        <tfoot><tr><th>Total aplicado</th><th></th><th class="num" data-aplicado>$0</th></tr></tfoot></table></div>
      <p class="texto-suave" data-dif></p>`,
    montar(dlg, form) {
      const mias = () => ds.filter((d) => d.clienteId === form.cliente.value).sort((a, b) => (a.vencimiento || '').localeCompare(b.vencimiento || ''));
      const pintar = () => {
        $('[data-filas]', dlg).innerHTML = mias().map((d) => `<tr data-id="${esc(d.id)}"><td><span class="celda-nombre">${esc(d.etiqueta)}</span><span class="celda-sub">${fechaCorta(d.fecha)} · ${textoAtraso(diasAtrasoDeuda(d) || (d.vencimiento && d.vencimiento > hoyISO() ? -Math.round((new Date(`${d.vencimiento}T12:00`) - new Date(`${hoyISO()}T12:00`)) / 86400000) : 0))}</span></td>
          <td class="num">${pesos(d.saldo)}</td><td class="num"><span class="con-sufijo"><input data-m inputmode="numeric" value="" aria-label="Monto aplicado"><span class="sufijo">$</span></span></td></tr>`).join('');
        if (!form.monto.value) form.monto.value = numero(mias().reduce((s, d) => s + d.saldo, 0), 0);
        distribuir();
      };
      const distribuir = () => {
        let resto = leerNumero(form.monto.value) || 0;
        mias().forEach((d) => { const m = Math.max(0, Math.min(resto, d.saldo)); resto -= m; const i = $(`tr[data-id="${CSS.escape(d.id)}"] [data-m]`, dlg); if (i) i.value = m ? numero(m, 0) : ''; });
        sumar();
      };
      const sumar = () => {
        const ap = $$('[data-m]', dlg).reduce((s, i) => s + (leerNumero(i.value) || 0), 0);
        $('[data-aplicado]', dlg).textContent = pesos(ap);
        const m = leerNumero(form.monto.value) || 0;
        const total = mias().reduce((s, d) => s + d.saldo, 0);
        $('[data-dif]', dlg).innerHTML = m > total ? `<span class="texto-alerta">El monto supera lo que debe (${pesos(total)}). Revisa el monto.</span>`
          : Math.round(ap) !== Math.round(m) ? '<span class="texto-alerta">Lo aplicado no suma el monto recibido.</span>' : '';
      };
      form.cliente.addEventListener('change', () => { form.monto.value = ''; pintar(); });
      form.monto.addEventListener('input', distribuir);
      $('[data-filas]', dlg).addEventListener('input', sumar);
      pintar();
    },
    guardar(form, dlg) {
      const m = leerNumero(form.monto.value);
      if (!(m > 0)) return 'Escribe el monto recibido.';
      const aplicadas = [];
      for (const tr of $$('[data-filas] tr', dlg)) {
        const d = ds.find((x) => x.id === tr.dataset.id);
        const v = leerNumero($('[data-m]', tr).value) || 0;
        if (v < 0 || v > d.saldo + 0.5) return `A ${d.etiqueta} no se le puede aplicar más que su saldo (${pesos(d.saldo)}).`;
        if (v > 0) aplicadas.push({ d, monto: Math.round(v) });
      }
      const ap = aplicadas.reduce((s, a) => s + a.monto, 0);
      if (!aplicadas.length) return 'Aplica el pago a al menos una deuda.';
      if (Math.round(ap) !== Math.round(m)) return `Lo aplicado (${pesos(ap)}) no suma el monto recibido (${pesos(m)}).`;
      const cliente = cli(form.cliente.value);
      const fecha = form.fecha.value || hoyISO();
      const medio = form.medio.value;
      const lote = nuevoLote();
      const facturas = aplicadas.filter((a) => a.d.tipo === 'factura').map((a) => ({ factura: a.d.ref, monto: a.monto }));
      if (facturas.length) registrarPago(lote, { cliente, fecha, medio, referencia: form.referencia.value.trim(), aplicaciones: facturas });
      aplicadas.filter((a) => a.d.tipo !== 'factura').forEach(({ d, monto }) => {
        if (d.tipo === 'venta') pagarVenta(lote, d.ref, { monto, medio, fecha });
        if (d.tipo === 'clase') { const c = estado.cursos[d.cursoId]; pagarAlumno(lote, c, c.alumnos.find((a) => a.key === d.alumnoKey), { monto, medio, fecha, boleta: { emitida: false, folio: '' } }); }
        if (d.tipo === 'encargo') agregarAbono(lote, estado.encargos[d.id], { monto, medio, fecha });
      });
      if (estado.clientes[cliente.id]) registrarGestion(lote, cliente, { tipo: 'pago', fecha, texto: `${pesos(m)} · ${nombreItem('mediosPago', medio)}`, items: aplicadas.map((a) => ({ ...a.d, saldo: a.monto })) });
      const quedan = aplicadas.filter((a) => a.monto < a.d.saldo).length;
      enviar(lote.commit(), { alGuardar: avisoGuardado(toast, `Pago de ${pesos(m)} registrado${quedan ? `. Queda saldo en ${quedan} deuda${quedan > 1 ? 's' : ''}` : ''}`), alFallar: fallo });
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
    cuerpo: `${r.clientesNuevos ? `<p>Se crearon ${r.clientesNuevos} cliente${r.clientesNuevos > 1 ? 's' : ''} nuevo${r.clientesNuevos > 1 ? 's' : ''} con los datos de la factura. Agrégales su WhatsApp en su ficha de cliente para enviarles recordatorios.</p>` : ''}
      ${r.notas ? `<p>${r.notas} nota${r.notas > 1 ? 's' : ''} de crédito se descontaron de la factura que corrigen.</p>` : ''}
      ${lista('Ya estaban cargadas:', r.repetidas)}${lista('No se cargaron:', r.ajenas)}${lista('Atención:', r.errores)}`,
    botones: [{ texto: 'Entendido', valor: true }]
  });
}

async function facturaManual() {
  abiertas = await documentosDonde('facturas', 'abierta', '==', true).catch(() => []);
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
