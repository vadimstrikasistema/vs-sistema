// PDF y WhatsApp: se arma el PDF en el navegador (sin servidor) y se comparte.
// En el celular abre el menú Compartir con el PDF y el mensaje; en el
// computador descarga el PDF y abre el chat de WhatsApp con el mensaje.
import { estado } from './datos.js';
import { pesos, fechaCorta, hoyISO } from './ui.js';

let cargando = null;
export function cargarJsPDF() {
  if (window.jspdf?.jsPDF) return Promise.resolve(window.jspdf.jsPDF);
  if (!cargando) {
    cargando = new Promise((ok, mal) => {
      const s = document.createElement('script');
      s.src = new URL('vendor/jspdf.umd.min.js', import.meta.url).href;
      s.onload = () => ok(window.jspdf.jsPDF);
      s.onerror = () => { cargando = null; mal(new Error('No se pudo cargar el generador de PDF.')); };
      document.head.append(s);
    });
  }
  return cargando;
}

// Teléfono chileno a formato internacional para wa.me (solo dígitos).
export function telefonoWhatsApp(tel) {
  let d = String(tel || '').replace(/\D/g, '');
  if (!d) return '';
  if (d.length === 9 && d.startsWith('9')) d = `56${d}`;
  if (d.length === 8) d = `569${d}`;
  return d;
}

export const enlaceWhatsApp = (tel, texto) => {
  const t = telefonoWhatsApp(tel);
  return `https://wa.me/${t}?text=${encodeURIComponent(texto)}`;
};

// Comparte un PDF con un mensaje. Devuelve 'compartido', 'descargado' o 'cancelado'.
// Nombre de archivo sin tildes ni símbolos: algunos navegadores descartan
// el nombre si trae caracteres especiales.
export const nombreSeguro = (n) => n.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\w .()-]+/g, '').replace(/\s+/g, ' ').trim();

export async function compartirPDF(blob, nombreOriginal, texto, telefono) {
  const nombreArchivo = nombreSeguro(nombreOriginal);
  const archivo = new File([blob], nombreArchivo, { type: 'application/pdf' });
  const tactil = window.matchMedia?.('(pointer: coarse)').matches;
  if (tactil && navigator.canShare?.({ files: [archivo] })) {
    try {
      await navigator.share({ files: [archivo], text: texto, title: nombreArchivo });
      return 'compartido';
    } catch (e) {
      if (e?.name === 'AbortError') return 'cancelado';
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = nombreArchivo; document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
  if (telefono || texto) window.open(enlaceWhatsApp(telefono, texto), '_blank', 'noopener');
  return 'descargado';
}

// ---------------------------------------------------------------- Estado de cuenta
const COBALTO = [42, 61, 143];
const TINTA = [43, 40, 37];
const SUAVE = [110, 102, 94];

export async function pdfEstadoCuenta(cliente, facturas, { diasAtraso, saldo, etiquetaFactura }) {
  const JsPDF = await cargarJsPDF();
  const doc = new JsPDF({ unit: 'mm', format: 'a4' });
  const e = estado.empresa || {};
  const W = 210, M = 18;
  let y = 22;
  doc.setTextColor(...COBALTO); doc.setFont('helvetica', 'bold'); doc.setFontSize(18);
  doc.text(e.nombreFantasia || 'Vadim Strika', M, y);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(...SUAVE);
  y += 6;
  [e.razonSocial, e.rut && `RUT ${e.rut}`, [e.direccion, e.comuna].filter(Boolean).join(', '), [e.correo, e.whatsapp || e.telefono].filter(Boolean).join(' · ')]
    .filter(Boolean).forEach((l) => { doc.text(l, M, y); y += 4.5; });
  doc.setTextColor(...TINTA); doc.setFont('helvetica', 'bold'); doc.setFontSize(14);
  doc.text('Estado de cuenta', W - M, 22, { align: 'right' });
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(...SUAVE);
  doc.text(`Al ${fechaCorta(hoyISO())}`, W - M, 28, { align: 'right' });

  y = Math.max(y, 44) + 4;
  doc.setDrawColor(227, 217, 203); doc.line(M, y, W - M, y); y += 8;
  doc.setTextColor(...TINTA); doc.setFont('helvetica', 'bold'); doc.setFontSize(11);
  doc.text(cliente.razonSocial || cliente.nombre || 'Cliente', M, y); y += 5;
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(...SUAVE);
  [cliente.rut && `RUT ${cliente.rut}`, cliente.giro, [cliente.direccion, cliente.comuna].filter(Boolean).join(', ')].filter(Boolean).forEach((l) => { doc.text(l, M, y); y += 4.5; });
  y += 6;

  const cols = [M, M + 46, M + 76, M + 106, M + 130, W - M];
  const cab = ['Documento', 'Emisión', 'Vencimiento', 'Días', 'Total', 'Saldo'];
  doc.setFillColor(244, 239, 231); doc.rect(M, y - 5, W - 2 * M, 8, 'F');
  doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(...TINTA);
  cab.forEach((t, i) => doc.text(t, i >= 3 ? cols[i] + (i === 5 ? 0 : 20) : cols[i], y, { align: i >= 3 ? 'right' : 'left' }));
  y += 8;
  doc.setFont('helvetica', 'normal');
  let total = 0;
  facturas.forEach((f) => {
    if (y > 270) { doc.addPage(); y = 22; }
    const d = diasAtraso(f);
    const s = saldo(f);
    total += s;
    doc.setTextColor(...TINTA);
    doc.text(etiquetaFactura(f), cols[0], y);
    doc.text(fechaCorta(f.fecha), cols[1], y);
    doc.text(fechaCorta(f.vencimiento), cols[2], y);
    if (d > 0) doc.setTextColor(140, 74, 82);
    doc.text(d > 0 ? `${d} de atraso` : 'Al día', cols[3] + 20, y, { align: 'right' });
    doc.setTextColor(...TINTA);
    doc.text(pesos(f.total), cols[4] + 20, y, { align: 'right' });
    doc.text(pesos(s), cols[5], y, { align: 'right' });
    y += 7;
  });
  doc.setDrawColor(207, 194, 176); doc.line(M, y - 3, W - M, y - 3); y += 4;
  doc.setFont('helvetica', 'bold'); doc.setFontSize(11);
  doc.text('Total adeudado', cols[4] - 20, y);
  doc.text(pesos(total), cols[5], y, { align: 'right' });
  y += 14;
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(...SUAVE);
  if (e.datosTransferencia) doc.text(doc.splitTextToSize(`Datos para transferir: ${e.datosTransferencia}`, W - 2 * M), M, y);
  return doc.output('blob');
}

// ---------------------------------------------------------------- Documentos a empresas
// Cabecera común: datos del taller a la izquierda, título y número a la derecha,
// y el cliente debajo. Devuelve la altura donde sigue el contenido.
function cabecera(doc, { titulo, numero, fecha, cliente, extraCliente = [] }) {
  const e = estado.empresa || {};
  const W = 210, M = 18;
  let y = 22;
  doc.setTextColor(...COBALTO); doc.setFont('helvetica', 'bold'); doc.setFontSize(18);
  doc.text(e.nombreFantasia || 'Vadim Strika', M, y);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(...SUAVE);
  y += 6;
  [e.razonSocial, e.rut && `RUT ${e.rut}`, [e.direccion, e.comuna].filter(Boolean).join(', '), [e.correo, e.whatsapp || e.telefono].filter(Boolean).join(' · ')]
    .filter(Boolean).forEach((l) => { doc.text(l, M, y); y += 4.5; });
  doc.setTextColor(...TINTA); doc.setFont('helvetica', 'bold'); doc.setFontSize(14);
  doc.text(titulo, W - M, 22, { align: 'right' });
  doc.setFontSize(11); doc.setTextColor(...COBALTO);
  doc.text(`N° ${numero}`, W - M, 28, { align: 'right' });
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(...SUAVE);
  doc.text(fechaCorta(fecha), W - M, 33, { align: 'right' });
  y = Math.max(y, 44) + 4;
  doc.setDrawColor(227, 217, 203); doc.line(M, y, W - M, y); y += 8;
  doc.setTextColor(...TINTA); doc.setFont('helvetica', 'bold'); doc.setFontSize(11);
  doc.text(cliente.razonSocial || cliente.nombre || 'Cliente', M, y); y += 5;
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(...SUAVE);
  [cliente.rut && `RUT ${cliente.rut}`, cliente.giro, [cliente.direccion, cliente.comuna].filter(Boolean).join(', '), cliente.contacto && `Contacto: ${cliente.contacto}`, ...extraCliente]
    .filter(Boolean).forEach((l) => { doc.text(l, M, y); y += 4.5; });
  return y + 6;
}

// Tabla simple: columnas [{ t, x, align }], filas de textos.
function tabla(doc, y, cols, filas) {
  const W = 210, M = 18;
  doc.setFillColor(244, 239, 231); doc.rect(M, y - 5, W - 2 * M, 8, 'F');
  doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(...TINTA);
  cols.forEach((c) => doc.text(c.t, c.x, y, { align: c.align || 'left' }));
  y += 8;
  doc.setFont('helvetica', 'normal');
  filas.forEach((f) => {
    if (y > 268) { doc.addPage(); y = 22; }
    const nombre = doc.splitTextToSize(String(f[0]), cols[1].x - cols[0].x - 22);
    doc.setTextColor(...TINTA);
    doc.text(nombre, cols[0].x, y);
    f.slice(1).forEach((v, i) => doc.text(String(v), cols[i + 1].x, y, { align: cols[i + 1].align || 'left' }));
    y += 6 * Math.max(1, nombre.length) - (nombre.length > 1 ? 1 : 0);
  });
  doc.setDrawColor(207, 194, 176); doc.line(M, y - 3, W - M, y - 3);
  return y + 4;
}

function pie(doc, y, lineas) {
  const W = 210, M = 18;
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(...SUAVE);
  lineas.filter(Boolean).forEach((l) => {
    const t = doc.splitTextToSize(l, W - 2 * M);
    if (y + t.length * 4.5 > 285) { doc.addPage(); y = 22; }
    doc.text(t, M, y); y += t.length * 4.5 + 2;
  });
  return y;
}

const W_ = 210, M_ = 18;
const COLS_VENTA = [{ t: 'Pieza', x: M_ }, { t: 'Cant.', x: 128, align: 'right' }, { t: 'Precio neto', x: 156, align: 'right' }, { t: 'Subtotal', x: W_ - M_, align: 'right' }];

export async function pdfOrden(o, cliente) {
  const JsPDF = await cargarJsPDF();
  const doc = new JsPDF({ unit: 'mm', format: 'a4' });
  let y = cabecera(doc, {
    titulo: 'Orden de venta', numero: o.numero, fecha: o.fecha, cliente: { ...cliente, rut: cliente.rut || o.rutCliente },
    extraCliente: [o.consignacionNumero ? `Piezas vendidas en consignación N° ${o.consignacionNumero}` : '']
  });
  y = tabla(doc, y, COLS_VENTA, o.lineas.map((l) => [`${l.nombre}${l.calidad === 'segunda' ? ' (segunda)' : ''}`, l.cantidad, pesos(l.precio), pesos(l.subtotal)]));
  const fila = (t, v, fuerte = false) => {
    doc.setFont('helvetica', fuerte ? 'bold' : 'normal'); doc.setFontSize(fuerte ? 11 : 9); doc.setTextColor(...TINTA);
    doc.text(t, 156, y, { align: 'right' }); doc.text(v, W_ - M_, y, { align: 'right' }); y += fuerte ? 7 : 5.5;
  };
  fila('Neto', pesos(o.neto)); fila('IVA 19%', pesos(o.iva)); fila('Total', pesos(o.total), true);
  y += 6;
  const e = estado.empresa || {};
  const plazo = Number(o.condicionDias ?? 30);
  pie(doc, y, [
    'Esta orden no es una factura. La factura electrónica se emite en el SII con referencia a esta orden (nota de pedido).',
    `Condición de pago: ${plazo ? `${plazo} días desde la factura` : 'contado'}.`,
    e.datosTransferencia ? `Datos para transferir: ${e.datosTransferencia}` : '',
    o.nota ? `Nota: ${o.nota}` : ''
  ]);
  return doc.output('blob');
}

// Comprobante de lo que quedó en la tienda (no es una guía de despacho del SII).
export async function pdfConsignacion(c, cliente, { enTienda }) {
  const JsPDF = await cargarJsPDF();
  const doc = new JsPDF({ unit: 'mm', format: 'a4' });
  let y = cabecera(doc, { titulo: 'Piezas en consignación', numero: c.numero, fecha: hoyISO(), cliente: { ...cliente, rut: cliente.rut || c.rutCliente }, extraCliente: [`Entregada desde el ${fechaCorta(c.fecha)}`] });
  const ls = c.lineas.filter((l) => enTienda(l) > 0);
  y = tabla(doc, y, [{ t: 'Pieza', x: M_ }, { t: 'Entregadas', x: 112, align: 'right' }, { t: 'En la tienda', x: 140, align: 'right' }, { t: 'Precio neto', x: 166, align: 'right' }, { t: 'Valor', x: W_ - M_, align: 'right' }],
    ls.map((l) => [`${l.nombre}${l.calidad === 'segunda' ? ' (segunda)' : ''}`, l.entregadas, enTienda(l), pesos(l.precio), pesos(enTienda(l) * l.precio)]));
  const n = ls.reduce((s, l) => s + enTienda(l), 0);
  const v = ls.reduce((s, l) => s + enTienda(l) * l.precio, 0);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(...TINTA);
  doc.text(`${n} pieza${n === 1 ? '' : 's'} en la tienda`, M_, y);
  doc.text(`${pesos(v)} + IVA`, W_ - M_, y, { align: 'right' });
  y += 12;
  y = pie(doc, y, [
    'Las piezas siguen siendo del taller hasta que se venden. En cada liquidación se factura lo vendido y lo que no se vendió sigue en consignación o vuelve al taller.',
    'Este documento es un comprobante de entrega; no es una guía de despacho del SII.',
    c.nota ? `Nota: ${c.nota}` : ''
  ]);
  y += 16;
  doc.setDrawColor(...SUAVE);
  doc.line(M_, y, M_ + 60, y); doc.line(W_ - M_ - 60, y, W_ - M_, y);
  doc.setFontSize(8); doc.setTextColor(...SUAVE);
  doc.text('Entrega', M_, y + 4); doc.text('Recibe', W_ - M_ - 60, y + 4);
  return doc.output('blob');
}
