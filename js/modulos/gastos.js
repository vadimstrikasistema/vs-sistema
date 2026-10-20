// Gastos: facturas y boletas desde el XML del SII o a mano. Cada línea se
// clasifica como insumo (suma stock en bodega) o gasto general.
import { estado, alCambiar, enviar, firma, itemsActivos, nombreItem } from '../datos.js';
import {
  esc, info, toast, $, $$, formulario, dialogo, leerNumero, numero, pesos, pesosUnidad,
  hoyISO, fechaCorta, rutValido, formatearRut, limpiarRut
} from '../ui.js';
import { nuevoLote, refDoc, refNueva, escucharDonde, documentosDonde, ultimosDocumentos } from '../stock.js';
import { opcionesLista, opcionesInsumos, nombreUnidad, vacio, pestanas, avisoError, avisoGuardado } from '../comunes.js';
import { TIPOS_DTE, esBoleta, esExenta, esFactura, signoDoc } from '../xml-sii.js';
import {
  importarArchivos, prepararLineas, validarLineas, aplicarClasificacion, anularGasto, buscarDuplicados,
  totalesManual, costosLineas, ivaCredito, mesDe, diasEntre, ITEM_INSUMOS, AREA_DEFECTO, sugerencia
} from '../gastos-core.js';
import { ICONOS } from '../iconos.js';
import { vistaRecurrentes } from './recurrentes.js';
import { marcarRegistro, liberarPeriodo } from '../recurrentes-core.js';

const PEST = [['documentos', 'Documentos'], ['por-pagar', 'Por pagar'], ['recurrentes', 'Recurrentes'], ['analisis', 'Análisis'], ['alertas', 'Alertas de precio']];
const fallo = avisoError(toast);
const TIPOS_MANUAL = [33, 34, 39, 61, 0];

const nombreMes = (m) => {
  const [y, mm] = m.split('-').map(Number);
  const t = new Date(y, mm - 1, 1).toLocaleDateString('es-CL', { month: 'long', year: 'numeric' });
  return t.charAt(0).toUpperCase() + t.slice(1);
};
function ultimosMeses(n = 13) {
  const d = new Date();
  return Array.from({ length: n }, (_, i) => {
    const f = new Date(d.getFullYear(), d.getMonth() - i, 1);
    return `${f.getFullYear()}-${String(f.getMonth() + 1).padStart(2, '0')}`;
  });
}
const opcionesMes = (actual) => ultimosMeses().map((m) => `<option value="${m}" ${m === actual ? 'selected' : ''}>${nombreMes(m)}</option>`).join('');
const etiquetaDoc = (g) => `${TIPOS_DTE[g.tipoDoc] || 'Documento'}${g.folio ? ` ${g.folio}` : ''}`;

export default {
  render(el, { sub }) {
    const actual = PEST.some(([k]) => k === sub) ? sub : 'documentos';
    el.innerHTML = `
      <header class="pagina-cabecera">
        <h1>Gastos</h1>
        <p class="pagina-bajada">${{
          documentos: 'Facturas y boletas de compra. Las líneas de insumos suman stock en bodega; el resto queda como gasto general.',
          'por-pagar': 'Facturas a crédito que aún no se pagan, ordenadas por vencimiento.',
          recurrentes: 'Cuentas que llegan cada mes o cada cierto tiempo: luz, arriendo, internet, contador.',
          analisis: 'En qué se gasta, por mes, por ítem y por área del negocio.',
          alertas: 'Insumos cuyo precio subió o bajó 10 % o más respecto de la compra anterior.'
        }[actual]}</p>
      </header>
      ${pestanas('gastos', PEST, actual)}
      <div id="gas-cuerpo"></div>`;
    const c = $('#gas-cuerpo', el);
    return ({ documentos: vistaDocumentos, 'por-pagar': vistaPorPagar, recurrentes: vistaRecurrentes, analisis: vistaAnalisis, alertas: vistaAlertas })[actual](c);
  }
};

// ================================================================ Documentos
function filaGasto(g) {
  const etiquetas = [];
  if (g.anulado) etiquetas.push('<span class="etiqueta etiqueta-suave">Anulado</span>');
  else {
    if (g.estado === 'por-clasificar') etiquetas.push('<span class="etiqueta etiqueta-alerta">Por clasificar</span>');
    if (g.automatico && !g.revisado) etiquetas.push('<span class="etiqueta etiqueta-info">Automático · revisar</span>');
    if (g.posibleDuplicado) etiquetas.push('<span class="etiqueta etiqueta-alerta">Posible duplicado</span>');
    if (g.pagoEstado === 'por-pagar') etiquetas.push('<span class="etiqueta">Por pagar</span>');
  }
  return `
    <li><button class="fila ${g.anulado ? 'fila-anulada' : ''}" data-id="${esc(g.id)}">
      <span class="fila-principal">
        <span class="fila-nombre">${esc(g.proveedor || 'Sin proveedor')}</span>
        <span class="fila-meta"><span>${fechaCorta(g.fecha)} · ${esc(etiquetaDoc(g))}</span>${etiquetas.join('')}</span>
      </span>
      <span class="fila-dato fila-dato-fuerte"><span class="fila-etq">Total</span>${pesos(signoDoc(g.tipoDoc) * (g.total || 0))}</span>
    </button></li>`;
}

function vistaDocumentos(el) {
  let mes = mesDe(hoyISO());
  let porClasificar = [];
  let delMes = [];
  let desMes = null;
  el.innerHTML = `
    <section class="panel zona-carga" data-zona>
      <div>
        <p class="zona-titulo">Cargar facturas del SII ${info('En el sitio del SII: Servicios online → Factura electrónica → Sistema de facturación gratuito → Ver documentos recibidos, y descarga el XML de cada factura. También sirve el XML que llega por correo del proveedor. Puedes subir varios a la vez.')}</p>
        <p class="texto-suave">Arrastra aquí los archivos XML o elígelos. Quedan «por clasificar» hasta que digas qué es cada línea.</p>
      </div>
      <div class="grupo-botones">
        <button class="btn btn-suave" data-manual>${ICONOS.lapiz}<span>Gasto a mano</span></button>
        <button class="btn btn-primario" data-xml>${ICONOS.mas2}<span>Cargar XML</span></button>
      </div>
      <input type="file" accept=".xml,text/xml,application/xml" multiple hidden data-archivo>
    </section>
    <div data-pendientes></div>
    <div class="barra-herramientas">
      <select class="filtro" data-mes aria-label="Mes">${opcionesMes(mes)}</select>
      <span class="espacio"></span>
      <span class="texto-suave" data-total-mes></span>
    </div>
    <div data-lista></div>`;

  const archivo = $('[data-archivo]', el);
  $('[data-xml]', el).addEventListener('click', () => archivo.click());
  archivo.addEventListener('change', () => { if (archivo.files.length) cargar([...archivo.files]); archivo.value = ''; });
  $('[data-manual]', el).addEventListener('click', () => editorGasto());
  const zona = $('[data-zona]', el);
  ['dragenter', 'dragover'].forEach((t) => zona.addEventListener(t, (e) => { e.preventDefault(); zona.classList.add('arrastrando'); }));
  ['dragleave', 'drop'].forEach((t) => zona.addEventListener(t, (e) => { e.preventDefault(); zona.classList.remove('arrastrando'); }));
  zona.addEventListener('drop', (e) => {
    const xs = [...(e.dataTransfer?.files || [])].filter((f) => /\.xml$/i.test(f.name) || f.type.includes('xml'));
    if (xs.length) cargar(xs); else toast('Solo se aceptan archivos XML del SII.', 'error');
  });
  $('[data-mes]', el).addEventListener('change', (e) => { mes = e.target.value; suscribirMes(); });

  const pintar = () => {
    const pend = porClasificar.filter((g) => !g.anulado).sort((a, b) => a.fecha.localeCompare(b.fecha));
    const revisar = delMes.filter((g) => g.automatico && !g.revisado && !g.anulado);
    $('[data-pendientes]', el).innerHTML = pend.length || revisar.length ? `
      <section class="panel tabla-panel panel-destacado">
        <h2 class="grupo-titulo">Por clasificar <span class="lista-cuenta">${pend.length}</span></h2>
        ${pend.length ? `<ul class="filas">${pend.map(filaGasto).join('')}</ul>` : '<p class="texto-suave relleno-chico">Nada pendiente.</p>'}
      </section>` : '';
    const lista = $('[data-lista]', el);
    const vis = delMes.filter((g) => g.estado !== 'por-clasificar' || g.anulado).sort((a, b) => b.fecha.localeCompare(a.fecha) || b.creadoMs - a.creadoMs);
    const total = vis.filter((g) => !g.anulado).reduce((s, g) => s + costosLineas(g).reduce((a, b) => a + b, 0), 0);
    $('[data-total-mes]', el).innerHTML = vis.length ? `Gasto del mes: <strong>${pesos(total)}</strong> ${info('Suma del costo para la empresa: neto en facturas (el IVA es crédito fiscal) y total en boletas. No incluye lo que está por clasificar.')}` : '';
    if (!vis.length) {
      lista.innerHTML = vacio(`Sin gastos clasificados en ${nombreMes(mes).toLowerCase()}`,
        'Carga los XML de las facturas del mes o registra a mano las boletas y los gastos sin documento.');
    } else {
      lista.innerHTML = `<section class="panel tabla-panel"><ul class="filas">${vis.map(filaGasto).join('')}</ul></section>`;
    }
    $$('.fila', el).forEach((b) => b.addEventListener('click', () => {
      const g = [...porClasificar, ...delMes].find((x) => x.id === b.dataset.id);
      if (g) editorGasto(g);
    }));
  };

  const desPend = escucharDonde('gastos', 'estado', '==', 'por-clasificar', (l) => { porClasificar = l; pintar(); });
  function suscribirMes() {
    desMes?.();
    delMes = [];
    desMes = escucharDonde('gastos', 'mes', '==', mes, (l) => { delMes = l; pintar(); });
  }
  suscribirMes();
  const desEstado = alCambiar(pintar);
  pintar();
  return () => { desPend(); desMes?.(); desEstado(); };
}

async function cargar(archivos) {
  toast(`Leyendo ${archivos.length} archivo${archivos.length > 1 ? 's' : ''}…`);
  let r;
  try {
    r = await importarArchivos(archivos);
  } catch (e) {
    console.error(e);
    toast('No se pudieron cargar los archivos. Revisa la conexión e intenta de nuevo.', 'error');
    return;
  }
  r.promesa.catch(fallo);
  const lista = (titulo, items) => items.length ? `<p><strong>${titulo}</strong></p><ul class="lista-puntos">${items.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : '';
  await dialogo({
    titulo: r.nuevos.length ? `${r.nuevos.length} documento${r.nuevos.length > 1 ? 's' : ''} cargado${r.nuevos.length > 1 ? 's' : ''}` : 'No se cargaron documentos nuevos',
    cuerpo: `
      ${r.nuevos.length ? `<p>${r.nuevos.length - r.automaticos === 1 ? '1 queda' : `${r.nuevos.length - r.automaticos} quedan`} por clasificar.${r.automaticos ? ` ${r.automaticos} se clasificaron solos porque ya conocía al proveedor; quedan marcados para revisar.` : ''}</p>` : ''}
      ${r.posibles ? `<p class="aviso">${r.posibles} parece${r.posibles > 1 ? 'n' : ''} duplicado${r.posibles > 1 ? 's' : ''}: mismo proveedor y monto, con otro folio y fecha cercana. Revísalo al clasificar.</p>` : ''}
      ${lista('Ya estaban ingresados (no se repiten):', r.repetidos)}
      ${lista('No son gastos:', r.noGasto)}
      ${lista('No se pudieron leer:', r.errores)}`,
    botones: [{ texto: 'Entendido', valor: true }]
  });
}

// ---------------------------------------------------------------- Línea a clasificar
function opcionesConversion(ins, l) {
  if (!ins) return '<option value="">Elige primero el insumo</option>';
  const u = nombreUnidad(ins.unidad);
  const ops = (ins.formatos || []).map((f) => ({ v: String(f.cantidad), t: `${f.nombre} = ${numero(f.cantidad, 4)} ${u}`, nombre: f.nombre }));
  ops.push({ v: '1', t: `Ya viene en ${u}`, nombre: '' });
  const actual = l.factor != null ? String(l.factor) : (ins.formatos?.length === 1 ? String(ins.formatos[0].cantidad) : '1');
  const hay = ops.some((o) => o.v === actual && (!l.formato || o.nombre === l.formato || o.v === '1'));
  let html = ops.map((o) => `<option value="${o.v}" data-formato="${esc(o.nombre)}" ${o.v === actual && hay ? 'selected' : ''}>${esc(o.t)}</option>`).join('');
  html += `<option value="otro" ${!hay ? 'selected' : ''}>Otra conversión…</option>`;
  return html;
}

function htmlLinea(l, i, { editable, tipoDoc }) {
  const ins = estado.insumos[l.insumoId];
  const montoEtq = esFactura(tipoDoc) || esExenta(tipoDoc) ? 'Monto neto' : 'Monto pagado';
  const otro = ins && l.factor != null && !(ins.formatos || []).some((f) => f.cantidad === l.factor) && l.factor !== 1;
  return `
    <div class="lg" data-i="${i}">
      <div class="lg-cabeza">
        ${editable ? `
          <input data-nombre value="${esc(l.nombre || '')}" placeholder="Descripción, ej.: Saco arcilla gres 25 kg" aria-label="Descripción" maxlength="120">
          <span class="con-sufijo lg-cant"><input data-cant inputmode="decimal" value="${l.cantidad != null ? esc(numero(l.cantidad, 4)) : '1'}" aria-label="Cantidad"><span class="sufijo">cant.</span></span>
          <span class="con-sufijo lg-monto"><input data-monto inputmode="decimal" value="${l.monto ? esc(numero(l.monto, 0)) : ''}" placeholder="${montoEtq}" aria-label="${montoEtq}"><span class="sufijo">$</span></span>
          <button type="button" class="btn-icono" data-quitar aria-label="Quitar línea">✕</button>`
        : `
          <span class="lg-nombre">${esc(l.nombre)}${l.descripcion ? `<span class="celda-sub">${esc(l.descripcion)}</span>` : ''}</span>
          <span class="lg-montos">${numero(l.cantidad)}${l.unidadXml ? ` ${esc(l.unidadXml)}` : ''} × ${pesos(l.precio ?? (l.monto / (l.cantidad || 1)))} = <strong>${pesos(l.monto)}</strong></span>`}
      </div>
      <div class="lg-clase">
        <div class="segmentado segmentado-chico" role="radiogroup" aria-label="Tipo de línea">
          <label><input type="radio" name="clase-${i}" value="insumo" ${l.clase === 'insumo' ? 'checked' : ''}><span>Insumo a bodega</span></label>
          <label><input type="radio" name="clase-${i}" value="gasto" ${l.clase === 'gasto' ? 'checked' : ''}><span>Gasto general</span></label>
        </div>
        ${l.sugerida ? '<span class="etiqueta etiqueta-info">Sugerido</span>' : ''}
      </div>
      <div class="lg-detalle" data-insumo ${l.clase === 'insumo' ? '' : 'hidden'}>
        <select data-ins aria-label="Insumo">${opcionesInsumos(l.insumoId || '')}</select>
        <select data-conv aria-label="Cómo viene">${opcionesConversion(ins, l)}</select>
        <span class="con-sufijo" data-otro ${otro ? '' : 'hidden'}><input data-factor inputmode="decimal" value="${otro ? esc(numero(l.factor, 4)) : ''}" placeholder="Trae" aria-label="Cuánto trae cada unidad"><span class="sufijo">${ins ? esc(nombreUnidad(ins.unidad)) : ''}</span></span>
        <p class="lg-resultado" data-res></p>
      </div>
      <div class="lg-detalle" data-gasto ${l.clase === 'gasto' ? '' : 'hidden'}>
        <select data-item aria-label="Ítem de gasto">${opcionesLista('itemsGasto', l.itemGasto || '', { vacio: 'Ítem de gasto' })}</select>
        <select data-area aria-label="Área del negocio">${opcionesLista('areasNegocio', l.area || '', { vacio: 'Área del negocio' })}</select>
      </div>
    </div>`;
}

function leerLinea(div, base) {
  const clase = div.querySelector(`input[name^="clase-"]:checked`)?.value || null;
  const l = { ...base, clase };
  if (div.querySelector('[data-nombre]')) {
    l.nombre = div.querySelector('[data-nombre]').value.trim();
    l.cantidad = leerNumero(div.querySelector('[data-cant]').value);
    l.monto = leerNumero(div.querySelector('[data-monto]').value);
  }
  if (clase === 'insumo') {
    l.insumoId = div.querySelector('[data-ins]').value || null;
    const conv = div.querySelector('[data-conv]');
    if (conv.value === 'otro') { l.factor = leerNumero(div.querySelector('[data-factor]').value); l.formato = ''; }
    else { l.factor = Number(conv.value) || null; l.formato = conv.selectedOptions[0]?.dataset.formato || ''; }
    l.itemGasto = null; l.area = null;
  } else if (clase === 'gasto') {
    l.itemGasto = div.querySelector('[data-item]').value || null;
    l.area = div.querySelector('[data-area]').value || null;
    l.insumoId = null; l.factor = null; l.formato = '';
  }
  return l;
}

// ---------------------------------------------------------------- Editor
export async function editorGasto(g = null) {
  const nuevo = !g;
  const xml = g?.origen === 'xml';
  const soloLectura = Boolean(g?.anulado);
  const d = g || {
    origen: 'manual', tipoDoc: 39, folio: '', fecha: hoyISO(), rutProveedor: '', proveedor: '',
    lineas: [{ nombre: '', cantidad: 1, monto: null, clase: null }],
    pagoEstado: 'pagado', pago: { fecha: hoyISO(), medio: '' }, notas: ''
  };
  let lineasBase = d.lineas.map((l) => ({ ...l }));
  const proveedoresConocidos = Object.values(estado.proveedores).sort((a, b) => (a.nombre || '').localeCompare(b.nombre || '', 'es'));

  const avisos = [];
  if (g?.anulado) avisos.push(`<p class="aviso">Gasto anulado${g.motivoAnulacion ? `: ${esc(g.motivoAnulacion)}` : ''}. Su stock ya se revirtió.</p>`);
  if (g?.posibleDuplicado && !g.anulado) avisos.push(`<p class="aviso">Posible duplicado: hay otro documento de este proveedor por el mismo monto, folio ${esc(g.posibleDuplicado.folio)} del ${fechaCorta(g.posibleDuplicado.fecha)}. Si es el mismo gasto, anula uno de los dos.</p>`);
  if (g?.receptorDistinto && !g.anulado) avisos.push(`<p class="aviso">Esta factura está emitida a otro RUT (${esc(formatearRut(g.rutReceptor))}), no al de la empresa. Revisa si corresponde.</p>`);
  if (g?.automatico && !g.revisado && !g.anulado) avisos.push('<p class="aviso aviso-info">Se clasificó solo, según cómo clasificaste antes las facturas de este proveedor. Revísalo y guarda para confirmarlo.</p>');

  const cabeza = xml ? `
    <dl class="ficha-doc">
      <div><dt>Proveedor</dt><dd>${esc(d.proveedor)}<span class="celda-sub">${esc(d.rutProveedor)}${d.giroProveedor ? ` · ${esc(d.giroProveedor)}` : ''}</span></dd></div>
      <div><dt>Documento</dt><dd>${esc(etiquetaDoc(d))}<span class="celda-sub">${fechaCorta(d.fecha)}</span></dd></div>
      <div><dt>Neto${d.exento ? ' + exento' : ''}</dt><dd>${pesos((d.neto || 0) + (d.exento || 0))}</dd></div>
      <div><dt>IVA</dt><dd>${pesos(d.iva || 0)}</dd></div>
      <div><dt>Total</dt><dd><strong>${pesos(d.total)}</strong></dd></div>
    </dl>
    ${(d.referencias || []).length ? `<p class="texto-suave">Referencias: ${d.referencias.map((r) => `${esc(TIPOS_DTE[r.tipo] || r.tipo)} ${esc(r.folio)}${r.razon ? ` (${esc(r.razon)})` : ''}`).join(' · ')}</p>` : ''}`
    : `
    <div class="campos">
      <label class="campo">
        <span class="campo-etiqueta">Tipo de documento ${info('Factura: anotas montos netos y el IVA queda como crédito fiscal. Boleta o sin documento: anotas lo que pagaste, que es el costo completo. Nota de crédito: resta.')}</span>
        <select name="tipoDoc" ${soloLectura ? 'disabled' : ''}>${TIPOS_MANUAL.map((t) => `<option value="${t}" ${Number(d.tipoDoc) === t ? 'selected' : ''}>${TIPOS_DTE[t]}</option>`).join('')}</select>
      </label>
      <label class="campo">
        <span class="campo-etiqueta">Fecha</span>
        <input type="date" name="fecha" value="${esc(d.fecha)}" max="${hoyISO()}">
      </label>
      <label class="campo" data-con-doc>
        <span class="campo-etiqueta">RUT del proveedor <span class="req">*</span></span>
        <input name="rut" value="${esc(d.rutProveedor || '')}" list="lista-proveedores" placeholder="76.123.456-7" autocomplete="off">
        <datalist id="lista-proveedores">${proveedoresConocidos.map((p) => `<option value="${esc(p.rut)}">${esc(p.nombre)}</option>`).join('')}</datalist>
        <small class="campo-error" data-rut-error hidden>RUT no válido. Revisa el dígito verificador.</small>
      </label>
      <label class="campo">
        <span class="campo-etiqueta"><span data-etq-prov>Proveedor</span> <span class="req" data-req-prov>*</span></span>
        <input name="proveedor" value="${esc(d.proveedor || '')}" maxlength="100" autocomplete="off" placeholder="Nombre o razón social">
      </label>
      <label class="campo" data-con-doc>
        <span class="campo-etiqueta">Folio <span class="req">*</span> ${info('El número del documento. Con el RUT y el tipo, sirve para detectar si ya lo ingresaste.')}</span>
        <input name="folio" value="${esc(d.folio || '')}" inputmode="numeric" maxlength="20" autocomplete="off">
      </label>
    </div>`;

  const cuerpo = `
    ${avisos.join('')}
    ${cabeza}
    <fieldset class="bloque">
      <legend>Líneas ${info('Insumo a bodega: material que entra al stock (arcilla, materias primas, esmaltes, embalaje). Elige cuál es y cómo viene: si la factura dice «2 sacos de 25 kg», entran 50 kg. Gasto general: luz, arriendo, transporte, herramientas, todo lo que no se guarda en bodega.')}</legend>
      ${soloLectura ? '' : `
      <div class="aplicar-todas">
        <span class="texto-suave">Para todas las líneas de gasto general:</span>
        <select data-todas-item aria-label="Ítem para todas">${opcionesLista('itemsGasto', '', { vacio: 'Ítem' })}</select>
        <select data-todas-area aria-label="Área para todas">${opcionesLista('areasNegocio', '', { vacio: 'Área' })}</select>
        <button type="button" class="btn btn-suave btn-chico" data-todas>Aplicar</button>
      </div>`}
      <div data-lineas></div>
      ${!xml && !soloLectura ? `<button type="button" class="btn btn-suave btn-chico" data-agregar>${ICONOS.mas2}<span>Agregar línea</span></button>` : ''}
      <div class="resumen-receta" data-totales></div>
    </fieldset>

    <fieldset class="bloque">
      <legend>Pago</legend>
      <div class="segmentado" role="radiogroup" aria-label="Estado del pago">
        <label><input type="radio" name="pagoEstado" value="pagado" ${d.pagoEstado !== 'por-pagar' ? 'checked' : ''}><span>Pagado</span></label>
        <label><input type="radio" name="pagoEstado" value="por-pagar" ${d.pagoEstado === 'por-pagar' ? 'checked' : ''}><span>Por pagar</span></label>
      </div>
      <div class="campos" data-pagado>
        <label class="campo"><span class="campo-etiqueta">Fecha de pago</span><input type="date" name="fechaPago" value="${esc(d.pago?.fecha || d.fecha || hoyISO())}"></label>
        <label class="campo"><span class="campo-etiqueta">Medio de pago</span><select name="medio">${opcionesLista('mediosPago', d.pago?.medio || '', { vacio: 'Sin indicar' })}</select></label>
      </div>
      <div class="campos" data-porpagar>
        <label class="campo"><span class="campo-etiqueta">Vencimiento ${info('Cuándo hay que pagarla. Aparece en «Por pagar» y en la Agenda.')}</span><input type="date" name="vencimiento" value="${esc(d.pago?.vencimiento || '')}"></label>
      </div>
    </fieldset>

    <label class="campo">
      <span class="campo-etiqueta">Notas</span>
      <textarea name="notas" rows="2" maxlength="500">${esc(d.notas || '')}</textarea>
    </label>`;

  const extra = !nuevo && !soloLectura ? '<button type="button" class="btn btn-peligro" data-anular>Anular</button>' : '';

  await formulario({
    titulo: nuevo ? 'Nuevo gasto' : `${d.proveedor || 'Gasto'} · ${etiquetaDoc(d)}`,
    cuerpo, extra, ancho: true,
    textoGuardar: soloLectura ? '' : (d.estado === 'clasificado' ? (d.automatico && !d.revisado ? 'Confirmar clasificación' : 'Guardar cambios') : 'Guardar y clasificar'),
    montar(dlg, form, cerrar) {
      const caja = $('[data-lineas]', dlg);
      const tipoActual = () => (xml ? d.tipoDoc : Number(form.tipoDoc.value));
      const pintarLineas = () => {
        caja.innerHTML = lineasBase.map((l, i) => htmlLinea(l, i, { editable: !xml && !soloLectura, tipoDoc: tipoActual() })).join('');
        $$('.lg', caja).forEach(conectarLinea);
        if (soloLectura) $$('input, select, button', caja).forEach((x) => { x.disabled = true; });
        recalcular();
      };
      const leerTodas = () => $$('.lg', caja).map((div) => leerLinea(div, lineasBase[Number(div.dataset.i)]));
      const recalcular = () => {
        const tipo = tipoActual();
        const lineas = leerTodas();
        const gastoTmp = { ...d, tipoDoc: tipo, origen: xml ? 'xml' : 'manual', lineas: lineas.map((l) => ({ ...l, monto: Number.isFinite(l.monto) ? l.monto : 0 })) };
        if (!xml) Object.assign(gastoTmp, totalesManual(tipo, gastoTmp.lineas));
        const prep = prepararLineas(gastoTmp, gastoTmp.lineas);
        $$('.lg', caja).forEach((div, k) => {
          const res = div.querySelector('[data-res]');
          const l = prep[k];
          const ins = estado.insumos[l.insumoId];
          if (!res) return;
          if (l.clase !== 'insumo' || !ins || !(l.factor > 0) || !(l.cantidad > 0)) { res.textContent = ''; return; }
          const ant = ins.costoUltimo ?? ins.costoRef ?? null;
          const varr = ant && l.costoUnitario ? (l.costoUnitario - ant) / ant : 0;
          res.innerHTML = `Entran <strong>${numero(l.cantidadInsumo)} ${esc(nombreUnidad(ins.unidad))}</strong> a ${pesosUnidad(l.costoUnitario)}/${esc(nombreUnidad(ins.unidad))}${
            Math.abs(varr) >= 0.10 ? ` <span class="${varr > 0 ? 'texto-alerta' : 'entra'}">${varr > 0 ? '▲' : '▼'} ${numero(Math.abs(varr) * 100, 0)} % vs. compra anterior</span>` : ''}`;
        });
        const base = prep.reduce((s, l) => s + l.costo, 0);
        const insumosV = prep.filter((l) => l.clase === 'insumo').reduce((s, l) => s + l.costo, 0);
        $('[data-totales]', dlg).innerHTML = `
          <span>Costo para la empresa: <strong>${pesos(base)}</strong></span>
          ${insumosV ? `<span>A bodega: <strong>${pesos(insumosV)}</strong></span>` : ''}
          ${ivaCredito(gastoTmp) ? `<span>IVA crédito fiscal: <strong>${pesos(ivaCredito(gastoTmp))}</strong></span>` : ''}
          ${!xml ? `<span>Total del documento: <strong>${pesos(signoDoc(tipo) * gastoTmp.total)}</strong></span>` : ''}`;
      };
      const conectarLinea = (div) => {
        const i = Number(div.dataset.i);
        div.addEventListener('change', (e) => {
          const t = e.target;
          if (t.name?.startsWith('clase-')) {
            div.querySelector('[data-insumo]').hidden = t.value !== 'insumo';
            div.querySelector('[data-gasto]').hidden = t.value !== 'gasto';
            if (t.value === 'gasto' && !div.querySelector('[data-item]').value) {
              const s = sugerencia(limpiarRut(xml ? d.rutProveedor : form.rut.value), lineasBase[i].nombre);
              if (s?.clase === 'gasto') { div.querySelector('[data-item]').value = s.itemGasto || ''; div.querySelector('[data-area]').value = s.area || ''; }
            }
          }
          if (t.matches('[data-ins]')) {
            const ins = estado.insumos[t.value];
            div.querySelector('[data-conv]').innerHTML = opcionesConversion(ins, { factor: null });
            div.querySelector('[data-otro] .sufijo').textContent = ins ? nombreUnidad(ins.unidad) : '';
            div.querySelector('[data-otro]').hidden = div.querySelector('[data-conv]').value !== 'otro';
          }
          if (t.matches('[data-conv]')) div.querySelector('[data-otro]').hidden = t.value !== 'otro';
          recalcular();
        });
        div.addEventListener('input', recalcular);
        div.querySelector('[data-quitar]')?.addEventListener('click', () => {
          lineasBase = leerTodas();
          lineasBase.splice(i, 1);
          if (!lineasBase.length) lineasBase.push({ nombre: '', cantidad: 1, monto: null, clase: null });
          pintarLineas();
        });
      };
      pintarLineas();
      $('[data-agregar]', dlg)?.addEventListener('click', () => {
        lineasBase = leerTodas();
        lineasBase.push({ nombre: '', cantidad: 1, monto: null, clase: null });
        pintarLineas();
        caja.lastElementChild.querySelector('[data-nombre]')?.focus();
      });
      $('[data-todas]', dlg)?.addEventListener('click', () => {
        const it = $('[data-todas-item]', dlg).value;
        const ar = $('[data-todas-area]', dlg).value;
        $$('.lg', caja).forEach((div) => {
          const clase = div.querySelector('input[name^="clase-"]:checked')?.value;
          if (clase === 'insumo') return;
          div.querySelector('input[value="gasto"]').checked = true;
          div.querySelector('[data-insumo]').hidden = true;
          div.querySelector('[data-gasto]').hidden = false;
          if (it) div.querySelector('[data-item]').value = it;
          if (ar) div.querySelector('[data-area]').value = ar;
        });
        recalcular();
      });

      // Pago
      const pintarPago = () => {
        const pp = form.pagoEstado.value === 'por-pagar';
        $('[data-pagado]', dlg).hidden = pp;
        $('[data-porpagar]', dlg).hidden = !pp;
      };
      $$('input[name=pagoEstado]', dlg).forEach((r) => r.addEventListener('change', pintarPago));
      pintarPago();

      if (!xml) {
        const pintarTipo = () => {
          const t = Number(form.tipoDoc.value);
          $$('[data-con-doc]', dlg).forEach((x) => { x.hidden = t === 0; });
          $('[data-etq-prov]', dlg).textContent = t === 0 ? 'Proveedor o descripción' : 'Proveedor';
          $$('.lg [data-monto]', dlg).forEach((x) => { x.placeholder = esFactura(t) || esExenta(t) ? 'Monto neto' : 'Monto pagado'; });
          recalcular();
        };
        form.tipoDoc.addEventListener('change', pintarTipo);
        pintarTipo();
        form.rut.addEventListener('change', () => {
          const p = estado.proveedores[limpiarRut(form.rut.value)];
          if (p && !form.proveedor.value.trim()) form.proveedor.value = p.nombre || '';
          if (form.rut.value.trim()) form.rut.value = formatearRut(form.rut.value);
          $('[data-rut-error]', dlg).hidden = !form.rut.value.trim() || rutValido(form.rut.value);
        });
      }
      if (soloLectura) $$('input, select, textarea', form).forEach((x) => { x.disabled = true; });

      $('[data-anular]', dlg)?.addEventListener('click', async () => {
        const r = await dialogo({
          titulo: 'Anular gasto',
          cuerpo: `<p>El gasto queda en el historial como anulado y deja de sumar.${(d.movs || []).length ? ' Lo que entró a bodega con este documento se descuenta.' : ''}</p>
                   <label class="campo"><span class="campo-etiqueta">Motivo</span><input name="motivo" maxlength="200" placeholder="Ej.: duplicado, ingresado por error"></label>`,
          botones: [{ texto: 'Cancelar', valor: false }, { texto: 'Anular gasto', valor: true, clase: 'btn-peligro' }]
        });
        if (!r?.valor) return;
        const lote = nuevoLote();
        anularGasto(lote, d, r.datos.motivo || '');
        // Si era el gasto de una cuenta recurrente, ese período vuelve a quedar pendiente.
        if (d.recurrenteId && estado.recurrentes[d.recurrenteId]) liberarPeriodo(lote, estado.recurrentes[d.recurrenteId], d.periodo);
        enviar(lote.commit(), { alGuardar: avisoGuardado(toast, 'Gasto anulado'), alFallar: fallo });
        cerrar();
      });
    },
    async guardar(form, dlg) {
      const caja = $('[data-lineas]', dlg);
      let lineas = $$('.lg', caja).map((div) => leerLinea(div, lineasBase[Number(div.dataset.i)]));
      const datos = { ...d };
      if (!xml) {
        const tipo = Number(form.tipoDoc.value);
        lineas = lineas.filter((l) => l.nombre || Number.isFinite(l.monto));
        for (const l of lineas) {
          if (!l.nombre) return 'Cada línea necesita una descripción.';
          if (!(l.monto > 0)) return `Escribe el monto de «${l.nombre}».`;
          if (!(l.cantidad > 0)) return `La cantidad de «${l.nombre}» debe ser mayor que cero.`;
        }
        const proveedor = form.proveedor.value.trim();
        if (!proveedor) return tipo === 0 ? 'Escribe a quién se pagó o qué fue.' : 'Escribe el nombre del proveedor.';
        let rut = '';
        if (tipo !== 0) {
          rut = form.rut.value.trim();
          if (!rut) return 'El RUT del proveedor es obligatorio en documentos tributarios.';
          if (!rutValido(rut)) return 'El RUT del proveedor no es válido.';
          if (!form.folio.value.trim()) return 'El folio es obligatorio en documentos tributarios.';
        }
        Object.assign(datos, {
          origen: 'manual', tipoDoc: tipo, fecha: form.fecha.value || hoyISO(), mes: mesDe(form.fecha.value),
          rutProveedor: rut ? formatearRut(rut) : '', rutLimpio: rut ? limpiarRut(rut) : '', proveedor,
          folio: tipo === 0 ? '' : form.folio.value.trim(),
          ...totalesManual(tipo, lineas)
        });
        if (tipo !== 0) {
          const { mismo, posible } = await buscarDuplicados(datos.rutLimpio, tipo, datos.folio, datos.total, datos.fecha, d.id || null);
          if (mismo) return `Ya existe ${etiquetaDoc(mismo).toLowerCase()} de este proveedor, del ${fechaCorta(mismo.fecha)}.`;
          datos.posibleDuplicado = posible ? { id: posible.id, folio: posible.folio, fecha: posible.fecha } : null;
        }
      }
      const error = validarLineas(datos, lineas);
      if (error) return error;
      const pagoEstado = form.pagoEstado.value;
      datos.pagoEstado = pagoEstado;
      datos.pago = pagoEstado === 'pagado'
        ? { fecha: form.fechaPago.value || datos.fecha, medio: form.medio.value || '' }
        : { vencimiento: form.vencimiento.value || '' };
      datos.notas = form.notas.value.trim();
      datos.lineas = lineas;

      const lote = nuevoLote();
      const ref = d.id ? refDoc('gastos', d.id) : null;
      const firmaClas = (ls) => JSON.stringify(ls.map((l) => [l.nombre, l.cantidad, l.monto, l.clase, l.insumoId, l.factor, l.itemGasto, l.area]));
      const mismaClasificacion = d.estado === 'clasificado' && firmaClas(d.lineas) === firmaClas(lineas)
        && d.tipoDoc === datos.tipoDoc && d.fecha === datos.fecha;
      let alertas = 0;
      if (mismaClasificacion) {
        lote.update(ref, { pagoEstado: datos.pagoEstado, pago: datos.pago, notas: datos.notas, revisado: true, ...firma() });
      } else {
        const id = d.id || refNueva('gastos').id;
        const gasto = { ...datos, id };
        const res = aplicarClasificacion(lote, gasto, lineas);
        alertas = res.alertas;
        const docData = { ...gasto, ...res };
        delete docData.id;
        delete docData.alertas;
        if (d.id) lote.update(refDoc('gastos', id), { ...docData, ...firma() });
        else lote.set(refDoc('gastos', id), { ...docData, anulado: false, creadoMs: Date.now(), ...firma() });
      }
      enviar(lote.commit(), {
        alGuardar: avisoGuardado(toast, alertas ? `Gasto guardado. ${alertas} insumo${alertas > 1 ? 's cambiaron' : ' cambió'} de precio: revisa Alertas de precio` : 'Gasto guardado'),
        alFallar: fallo
      });
      return null;
    }
  });
}

// ================================================================ Por pagar
function vistaPorPagar(el) {
  let lista = [];
  el.innerHTML = '<div data-resumen class="resumen"></div><div data-lista></div>';
  const pintar = () => {
    const vis = lista.filter((g) => !g.anulado).sort((a, b) => (a.pago?.vencimiento || '9').localeCompare(b.pago?.vencimiento || '9'));
    const hoy = hoyISO();
    const vencidas = vis.filter((g) => g.pago?.vencimiento && g.pago.vencimiento < hoy);
    const semana = vis.filter((g) => g.pago?.vencimiento && g.pago.vencimiento >= hoy && diasEntre(hoy, g.pago.vencimiento) <= 7);
    const suma = (xs) => xs.reduce((s, g) => s + signoDoc(g.tipoDoc) * (g.total || 0), 0);
    $('[data-resumen]', el).innerHTML = `
      <div class="dato"><span class="dato-etq">Total por pagar</span><span class="dato-valor">${pesos(suma(vis))}</span></div>
      <div class="dato ${vencidas.length ? 'dato-alerta' : ''}"><span class="dato-etq">Vencido</span><span class="dato-valor">${pesos(suma(vencidas))}</span></div>
      <div class="dato"><span class="dato-etq">Vence en 7 días</span><span class="dato-valor">${pesos(suma(semana))}</span></div>`;
    const caja = $('[data-lista]', el);
    if (!vis.length) { caja.innerHTML = vacio('No hay nada por pagar', 'Las facturas a crédito aparecen aquí hasta que las marques como pagadas.'); return; }
    caja.innerHTML = `<section class="panel tabla-panel"><ul class="filas">${vis.map((g) => {
      const v = g.pago?.vencimiento;
      const dias = v ? diasEntre(hoy, v) : null;
      const cuando = v == null ? 'Sin vencimiento' : dias < 0 ? `Venció hace ${-dias} día${dias === -1 ? '' : 's'}` : dias === 0 ? 'Vence hoy' : `Vence en ${dias} día${dias === 1 ? '' : 's'}`;
      return `
        <li class="fila-con-accion">
          <button class="fila" data-id="${esc(g.id)}">
            <span class="fila-principal">
              <span class="fila-nombre">${esc(g.proveedor)}</span>
              <span class="fila-meta"><span>${esc(etiquetaDoc(g))} · ${fechaCorta(g.fecha)}</span><span class="${dias != null && dias < 0 ? 'texto-alerta' : ''}">${cuando}${v ? ` (${fechaCorta(v)})` : ''}</span></span>
            </span>
            <span class="fila-dato fila-dato-fuerte"><span class="fila-etq">Total</span>${pesos(g.total)}</span>
          </button>
          <button class="btn btn-suave btn-chico" data-pagar="${esc(g.id)}">Marcar pagado</button>
        </li>`;
    }).join('')}</ul></section>`;
    $$('.fila', caja).forEach((b) => b.addEventListener('click', () => editorGasto(lista.find((g) => g.id === b.dataset.id))));
    $$('[data-pagar]', caja).forEach((b) => b.addEventListener('click', () => marcarPagado(lista.find((g) => g.id === b.dataset.pagar))));
  };
  const des = escucharDonde('gastos', 'pagoEstado', '==', 'por-pagar', (l) => { lista = l; pintar(); });
  pintar();
  return des;
}

export async function marcarPagado(g) {
  await formulario({
    titulo: `Pagar ${etiquetaDoc(g).toLowerCase()} de ${g.proveedor}`,
    cuerpo: `
      <p class="texto-suave">Total: <strong>${pesos(g.total)}</strong></p>
      <div class="campos">
        <label class="campo"><span class="campo-etiqueta">Fecha de pago</span><input type="date" name="fecha" value="${hoyISO()}" max="${hoyISO()}"></label>
        <label class="campo"><span class="campo-etiqueta">Medio de pago</span><select name="medio">${opcionesLista('mediosPago', 'transferencia', { vacio: 'Sin indicar' })}</select></label>
      </div>`,
    textoGuardar: 'Marcar pagado',
    guardar(form) {
      const lote = nuevoLote();
      lote.update(refDoc('gastos', g.id), { pagoEstado: 'pagado', pago: { ...g.pago, fecha: form.fecha.value || hoyISO(), medio: form.medio.value }, ...firma() });
      const r = g.recurrenteId && estado.recurrentes[g.recurrenteId];
      if (r && r.registros?.[g.periodo]) marcarRegistro(lote, r, g.periodo, { ...r.registros[g.periodo], estado: 'pagado' });
      enviar(lote.commit(), { alGuardar: avisoGuardado(toast, 'Marcado como pagado'), alFallar: fallo });
      return null;
    }
  });
}

// ================================================================ Análisis
function vistaAnalisis(el) {
  let mes = mesDe(hoyISO());
  el.innerHTML = `
    <div class="barra-herramientas"><select class="filtro" data-mes aria-label="Mes">${opcionesMes(mes)}</select></div>
    <div data-cuerpo><p class="texto-suave">Cargando…</p></div>`;
  $('[data-mes]', el).addEventListener('change', (e) => { mes = e.target.value; cargarMes(); });
  const cuerpo = $('[data-cuerpo]', el);

  async function cargarMes() {
    cuerpo.innerHTML = '<p class="texto-suave">Cargando…</p>';
    const meses = ultimosMeses(13);
    const idx = meses.indexOf(mes);
    const desde = meses[Math.min(idx + 5, meses.length - 1)];
    let docs;
    try {
      docs = (await documentosDonde('gastos', 'mes', '>=', desde)).filter((g) => !g.anulado && g.mes <= mes);
    } catch (e) {
      console.error(e);
      cuerpo.innerHTML = '<p class="texto-suave">No se pudo cargar. Revisa la conexión.</p>';
      return;
    }
    const delMes = docs.filter((g) => g.mes === mes);
    const clasif = delMes.filter((g) => g.estado === 'clasificado');
    const pend = delMes.filter((g) => g.estado !== 'clasificado');
    const porItem = new Map();
    const porArea = new Map();
    let total = 0, aBodega = 0, iva = 0;
    clasif.forEach((g) => {
      iva += ivaCredito(g);
      const costos = costosLineas(g);
      g.lineas.forEach((l, i) => {
        const c = costos[i];
        total += c;
        const item = l.clase === 'insumo' ? ITEM_INSUMOS : l.itemGasto;
        const area = l.clase === 'insumo' ? (l.area || AREA_DEFECTO) : l.area;
        if (l.clase === 'insumo') aBodega += c;
        porItem.set(item, (porItem.get(item) || 0) + c);
        porArea.set(area, (porArea.get(area) || 0) + c);
      });
    });
    const tendencia = meses.slice(idx, idx + 6).reverse().map((m) => ({
      m, v: docs.filter((g) => g.mes === m && g.estado === 'clasificado').reduce((s, g) => s + costosLineas(g).reduce((a, b) => a + b, 0), 0)
    }));
    const maxT = Math.max(...tendencia.map((t) => t.v), 1);
    const barras = (mapa, lista) => {
      const filas = [...mapa.entries()].filter(([, v]) => v).sort((a, b) => b[1] - a[1]);
      const max = Math.max(...filas.map(([, v]) => Math.abs(v)), 1);
      return filas.length ? `<ul class="barras">${filas.map(([k, v]) => `
        <li><span class="barra-etq">${esc(nombreItem(lista, k) || 'Sin indicar')}</span>
            <span class="barra-pista"><span class="barra" style="width:${Math.max(2, Math.abs(v) / max * 100)}%"></span></span>
            <span class="barra-valor">${pesos(v)}</span></li>`).join('')}</ul>` : '<p class="texto-suave">Sin datos.</p>';
    };
    cuerpo.innerHTML = `
      ${pend.length ? `<p class="aviso aviso-suave">${pend.length} documento${pend.length > 1 ? 's' : ''} de este mes está${pend.length > 1 ? 'n' : ''} por clasificar y no se incluye${pend.length > 1 ? 'n' : ''}.</p>` : ''}
      <div class="resumen">
        <div class="dato"><span class="dato-etq">Gasto del mes ${info('Costo para la empresa: neto en facturas y total en boletas. Las notas de crédito restan.')}</span><span class="dato-valor">${pesos(total)}</span></div>
        <div class="dato"><span class="dato-etq">Compras a bodega</span><span class="dato-valor">${pesos(aBodega)}</span></div>
        <div class="dato"><span class="dato-etq">Gastos generales</span><span class="dato-valor">${pesos(total - aBodega)}</span></div>
        <div class="dato"><span class="dato-etq">IVA crédito fiscal ${info('El IVA de las facturas de compra, que se descuenta del IVA de las ventas en el formulario 29. Las boletas no dan crédito.')}</span><span class="dato-valor">${pesos(iva)}</span></div>
      </div>
      <div class="dos-columnas">
        <section class="panel"><h2>Por ítem</h2>${barras(porItem, 'itemsGasto')}</section>
        <section class="panel"><h2>Por área del negocio</h2>${barras(porArea, 'areasNegocio')}</section>
      </div>
      <section class="panel">
        <h2>Últimos seis meses</h2>
        <div class="columnas-mes">${tendencia.map((t) => `
          <div class="col-mes ${t.m === mes ? 'actual' : ''}">
            <span class="col-valor">${t.v ? pesos(t.v) : '—'}</span>
            <span class="col-pista"><span class="col-barra" style="height:${t.v ? Math.max(3, t.v / maxT * 100) : 0}%"></span></span>
            <span class="col-mes-etq">${nombreMes(t.m).split(' ')[0].slice(0, 3)}</span>
          </div>`).join('')}</div>
      </section>`;
  }
  cargarMes();
  return null;
}

// ================================================================ Alertas
function vistaAlertas(el) {
  el.innerHTML = '<div data-cuerpo><p class="texto-suave">Cargando…</p></div>';
  const cuerpo = $('[data-cuerpo]', el);
  async function cargarAlertas() {
    let lista;
    try { lista = await ultimosDocumentos('alertasPrecio', 60); } catch (e) { cuerpo.innerHTML = '<p class="texto-suave">No se pudo cargar. Revisa la conexión.</p>'; return; }
    if (!lista.length) { cuerpo.innerHTML = vacio('Sin alertas de precio', 'Cuando una compra traiga un insumo 10 % más caro o más barato que la vez anterior, aparecerá aquí, con las recetas que afecta.'); return; }
    const nuevas = lista.filter((a) => !a.visto).length;
    cuerpo.innerHTML = `
      ${nuevas ? `<div class="barra-herramientas"><span class="texto-suave">${nuevas} sin revisar</span><span class="espacio"></span><button class="btn btn-suave btn-chico" data-todas>Marcar todas como vistas</button></div>` : ''}
      <section class="panel tabla-panel"><ul class="filas">${lista.map((a) => `
        <li class="alerta ${a.visto ? 'vista' : ''}">
          <span class="alerta-flecha ${a.variacion > 0 ? 'sube' : 'baja'}">${a.variacion > 0 ? '▲' : '▼'} ${numero(Math.abs(a.variacion) * 100, 0)} %</span>
          <span class="fila-principal">
            <span class="fila-nombre">${esc(a.insumoNombre)}</span>
            <span class="fila-meta">
              <span>${pesosUnidad(a.anterior)} → <strong>${pesosUnidad(a.nuevo)}</strong> por ${esc(nombreUnidad(a.unidad))}</span>
              <span>${esc(a.proveedor)} · ${esc(TIPOS_DTE[a.tipoDoc] || '')} ${esc(a.folio)} · ${fechaCorta(a.fecha)}</span>
            </span>
            ${a.recetas?.length ? `<span class="fila-meta"><span>Afecta a: ${a.recetas.map(esc).join(', ')}</span></span>` : ''}
          </span>
          ${a.visto ? '' : `<button class="btn btn-suave btn-chico" data-visto="${esc(a.id)}">Visto</button>`}
        </li>`).join('')}</ul></section>`;
    const marcar = (ids) => {
      const lote = nuevoLote();
      ids.forEach((id) => lote.update(refDoc('alertasPrecio', id), { visto: true, ...firma() }));
      enviar(lote.commit(), { alFallar: fallo });
      setTimeout(cargarAlertas, 250);
    };
    $$('[data-visto]', cuerpo).forEach((b) => b.addEventListener('click', () => marcar([b.dataset.visto])));
    $('[data-todas]', cuerpo)?.addEventListener('click', () => marcar(lista.filter((a) => !a.visto).map((a) => a.id)));
  }
  cargarAlertas();
  return null;
}
