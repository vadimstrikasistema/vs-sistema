// Lector de documentos tributarios electrónicos (DTE) del SII.
// Acepta un DTE suelto o un EnvioDTE con varios documentos, que es lo que
// entrega el SII al descargar facturas recibidas. No necesita servidor.

export const TIPOS_DTE = {
  33: 'Factura',
  34: 'Factura exenta',
  39: 'Boleta',
  41: 'Boleta exenta',
  46: 'Factura de compra',
  52: 'Guía de despacho',
  56: 'Nota de débito',
  61: 'Nota de crédito',
  0: 'Sin documento'
};

// Facturas: los montos de las líneas son netos y el IVA es crédito fiscal.
// Boletas: los montos incluyen IVA y el costo es todo lo pagado.
export const esFactura = (t) => [33, 46, 56, 61].includes(Number(t));
export const esBoleta = (t) => [39, 41].includes(Number(t));
export const esExenta = (t) => [34, 41].includes(Number(t));
export const signoDoc = (t) => (Number(t) === 61 ? -1 : 1);

// Lee el archivo respetando su codificación: muchos XML del SII vienen en
// ISO-8859-1 y leídos como UTF-8 las tildes y la ñ se rompen.
export async function leerArchivoXML(archivo) {
  const buf = await archivo.arrayBuffer();
  const cabeza = new TextDecoder('ascii').decode(buf.slice(0, 200));
  const m = /encoding=["']([\w-]+)["']/i.exec(cabeza);
  const cod = (m?.[1] || 'utf-8').toLowerCase();
  let texto;
  try {
    texto = new TextDecoder(cod === 'iso-8859-1' || cod === 'latin1' ? 'iso-8859-1' : cod).decode(buf);
  } catch {
    texto = new TextDecoder('utf-8').decode(buf);
  }
  return texto;
}

// Busca hijos por nombre sin importar el espacio de nombres.
const hijos = (el, nombre) => (el ? [...el.children].filter((c) => c.localName === nombre) : []);
const hijo = (el, nombre) => hijos(el, nombre)[0] || null;
const texto = (el, nombre) => hijo(el, nombre)?.textContent.trim() ?? '';
const num = (el, nombre) => {
  const t = texto(el, nombre);
  return t === '' ? null : Number(t);
};
const todos = (raiz, nombre) => [...raiz.getElementsByTagNameNS('*', nombre)];

export function leerDTEs(xmlTexto, nombreArchivo = '') {
  const doc = new DOMParser().parseFromString(xmlTexto, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length) {
    throw new Error(`«${nombreArchivo}» no es un XML válido.`);
  }
  // Los «Documento» que nos interesan son los que tienen Encabezado.
  const documentos = todos(doc, 'Documento').filter((d) => hijo(d, 'Encabezado'));
  if (!documentos.length) {
    throw new Error(`«${nombreArchivo}» no contiene facturas ni boletas del SII.`);
  }
  return documentos.map((d) => leerDocumento(d, nombreArchivo));
}

function leerDocumento(d, archivo) {
  const enc = hijo(d, 'Encabezado');
  const id = hijo(enc, 'IdDoc');
  const em = hijo(enc, 'Emisor');
  const rec = hijo(enc, 'Receptor');
  const tot = hijo(enc, 'Totales');
  const tipo = num(id, 'TipoDTE');

  const lineas = hijos(d, 'Detalle').map((det, i) => {
    const codigo = hijo(det, 'CdgItem');
    return {
      n: num(det, 'NroLinDet') ?? i + 1,
      codigo: codigo ? texto(codigo, 'VlrCodigo') : '',
      nombre: texto(det, 'NmbItem') || `Línea ${i + 1}`,
      descripcion: texto(det, 'DscItem'),
      cantidad: num(det, 'QtyItem') ?? 1,
      unidadXml: texto(det, 'UnmdItem'),
      precio: num(det, 'PrcItem'),
      descuento: num(det, 'DescuentoMonto') ?? 0,
      exenta: texto(det, 'IndExe') === '1',
      monto: num(det, 'MontoItem') ?? 0
    };
  });

  // Descuentos y recargos globales: se reparten en las líneas al costear.
  const globales = hijos(d, 'DscRcgGlobal').map((g) => ({
    tipo: texto(g, 'TpoMov'), // D descuento, R recargo
    valor: num(g, 'ValorDR') ?? 0,
    enPorcentaje: texto(g, 'TpoValor') === '%'
  }));

  const referencias = hijos(d, 'Referencia').map((r) => ({
    tipo: texto(r, 'TpoDocRef'),
    folio: texto(r, 'FolioRef'),
    fecha: texto(r, 'FchRef'),
    razon: texto(r, 'RazonRef')
  }));

  const otrosImp = hijos(tot, 'ImptoReten').reduce((s, x) => s + (num(x, 'MontoImp') || 0), 0);

  return {
    archivo,
    tipoDoc: tipo,
    folio: texto(id, 'Folio'),
    fecha: texto(id, 'FchEmis'),
    vencimiento: texto(id, 'FchVenc'),
    formaPago: num(id, 'FmaPago'), // 1 contado, 2 crédito, 3 sin costo
    rutProveedor: texto(em, 'RUTEmisor'),
    proveedor: texto(em, 'RznSoc') || texto(em, 'RznSocEmisor'),
    giroProveedor: texto(em, 'GiroEmis') || texto(em, 'GiroEmisor'),
    rutReceptor: texto(rec, 'RUTRecep'),
    neto: num(tot, 'MntNeto') ?? 0,
    exento: num(tot, 'MntExe') ?? 0,
    iva: num(tot, 'IVA') ?? 0,
    otrosImpuestos: otrosImp,
    total: num(tot, 'MntTotal') ?? 0,
    lineas,
    globales,
    referencias
  };
}

// Factor para llevar la suma de las líneas a la base de costo del documento:
// neto + exento en facturas (incluye descuentos globales), total en boletas.
export function factorProrrateo(dte) {
  const suma = dte.lineas.reduce((s, l) => s + (l.monto || 0), 0);
  if (!suma) return 1;
  const base = esBoleta(dte.tipoDoc) ? dte.total : (dte.neto || 0) + (dte.exento || 0);
  return base ? base / suma : 1;
}
