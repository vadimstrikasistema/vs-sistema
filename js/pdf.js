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
