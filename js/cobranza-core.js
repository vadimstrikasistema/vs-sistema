// Lógica de cobranza: clientes, facturas emitidas (cuentas por cobrar),
// notas de crédito y pagos que cubren una o varias facturas.
import { estado, firma } from './datos.js';
import { limpiarRut, formatearRut, hoyISO } from './ui.js';
import { nuevoLote, refNueva, refDoc, documentosDonde } from './stock.js';
import { increment } from './firebase.js';
import { leerArchivoXML, leerDTEs, TIPOS_DTE, signoDoc } from './xml-sii.js';
import { diasEntre, mesDe } from './gastos-core.js';

export const CONDICIONES = [[0, 'Contado'], [15, '15 días'], [30, '30 días'], [45, '45 días'], [60, '60 días']];

export const sumarDias = (iso, dias) => {
  const [y, m, d] = iso.split('-').map(Number);
  const f = new Date(y, m - 1, d + Number(dias || 0));
  return `${f.getFullYear()}-${String(f.getMonth() + 1).padStart(2, '0')}-${String(f.getDate()).padStart(2, '0')}`;
};

export const nombreCliente = (c) => (c ? c.nombre || c.razonSocial || 'Sin nombre' : 'Cliente');
export const clientePorRut = (rutLimpio) => Object.values(estado.clientes).find((c) => c.rutLimpio && c.rutLimpio === rutLimpio);

// Saldo de una factura: total − pagado (las notas de crédito cuentan como pagado).
export const saldo = (f) => Math.max(0, Math.round((f.total || 0) - (f.pagado || 0)));
export const diasAtraso = (f, hoy = hoyISO()) => (f.vencimiento ? diasEntre(f.vencimiento, hoy) : 0);
export const etiquetaFactura = (f) => `${TIPOS_DTE[f.tipoDoc] || 'Documento'}${f.folio ? ` ${f.folio}` : ''}`;

function estadoTras(f, pagadoNuevo) {
  const s = (f.total || 0) - pagadoNuevo;
  if (s <= 0.5) return { estado: 'pagada', abierta: false };
  return { estado: pagadoNuevo > 0 ? 'parcial' : 'pendiente', abierta: true };
}

// ---------------------------------------------------------------- Clientes
export function datosClienteDesdeDTE(dte) {
  return {
    tipo: 'empresa',
    rut: formatearRut(dte.rutReceptor),
    rutLimpio: limpiarRut(dte.rutReceptor),
    razonSocial: dte.receptor || '',
    nombre: dte.receptor || '',
    giro: dte.giroReceptor || '',
    direccion: dte.direccionReceptor || '',
    comuna: dte.comunaReceptor || dte.ciudadReceptor || '',
    correo: dte.correoReceptor || '',
    contacto: dte.contactoReceptor || '',
    whatsapp: '',
    condicionDias: 30,
    notas: '',
    archivado: false
  };
}

// ---------------------------------------------------------------- Pagos
// aplicaciones: [{ factura, monto }]
export function registrarPago(lote, { cliente, fecha, medio, referencia = '', nota = '', aplicaciones, tipo = 'pago' }) {
  const pRef = refNueva('pagos');
  const total = aplicaciones.reduce((s, a) => s + a.monto, 0);
  aplicaciones.forEach(({ factura: f, monto }) => {
    const nuevo = (f.pagado || 0) + monto;
    lote.update(refDoc('facturas', f.id), { pagado: increment(monto), ...estadoTras(f, nuevo), ultimoPago: fecha, ...firma() });
    f.pagado = nuevo;
  });
  lote.set(pRef, {
    tipo, clienteId: cliente?.id || null, clienteNombre: nombreCliente(cliente), fecha, medio: medio || '', referencia, nota,
    monto: total, aplicaciones: aplicaciones.map(({ factura: f, monto }) => ({ facturaId: f.id, folio: f.folio || '', tipoDoc: f.tipoDoc, monto })),
    anulado: false, creadoMs: Date.now(), ...firma()
  });
  return pRef.id;
}

export function anularPago(lote, pago, facturasPorId, motivo = '') {
  pago.aplicaciones.forEach((a) => {
    const f = facturasPorId[a.facturaId];
    if (!f) return;
    const nuevo = (f.pagado || 0) - a.monto;
    lote.update(refDoc('facturas', f.id), { pagado: increment(-a.monto), ...estadoTras(f, nuevo), ...firma() });
    f.pagado = nuevo;
  });
  lote.update(refDoc('pagos', pago.id), { anulado: true, motivoAnulacion: motivo, anuladoEn: Date.now(), ...firma() });
}

// Reparte un monto entre facturas abiertas, de la más antigua a la más nueva.
export function repartir(monto, facturas) {
  let resto = monto;
  return facturas
    .slice()
    .sort((a, b) => (a.vencimiento || a.fecha).localeCompare(b.vencimiento || b.fecha))
    .map((f) => {
      const m = Math.max(0, Math.min(resto, saldo(f)));
      resto -= m;
      return { factura: f, monto: m };
    });
}

// ---------------------------------------------------------------- Facturas emitidas desde XML
// Crea una factura por documento nuevo emitido por la empresa. Crea el cliente
// si su RUT no existe. Una nota de crédito descuenta del saldo de la factura
// que referencia.
export async function importarEmitidas(archivos) {
  const r = { nuevas: [], repetidas: [], ajenas: [], errores: [], clientesNuevos: 0, notas: 0, promesa: Promise.resolve() };
  const rutEmpresa = limpiarRut(estado.empresa?.rut || '');
  if (!rutEmpresa) { r.errores.push('Primero escribe el RUT de la empresa en Configuración → Empresa: con él la app reconoce las facturas emitidas por el taller.'); return r; }
  const dtes = [];
  for (const a of archivos) {
    try { dtes.push(...leerDTEs(await leerArchivoXML(a), a.name)); } catch (e) { r.errores.push(e.message || `No se pudo leer «${a.name}».`); }
  }
  const lote = nuevoLote();
  const clientesCreados = {};
  const nuevasPorClave = {};
  // Primero las facturas, después las notas de crédito (pueden referenciar una factura del mismo archivo).
  dtes.sort((a, b) => (Number(a.tipoDoc) === 61) - (Number(b.tipoDoc) === 61));
  for (const dte of dtes) {
    const etiqueta = `${TIPOS_DTE[dte.tipoDoc] || `Documento ${dte.tipoDoc}`} ${dte.folio}`;
    if (limpiarRut(dte.rutProveedor) !== rutEmpresa) { r.ajenas.push(`${etiqueta} de ${dte.proveedor}: no la emitió el taller; si es una compra, cárgala en Gastos.`); continue; }
    if ([39, 41, 52].includes(Number(dte.tipoDoc))) { r.ajenas.push(`${etiqueta}: ${Number(dte.tipoDoc) === 52 ? 'las guías de despacho' : 'las boletas'} no se cobran aquí.`); continue; }
    const rutCli = limpiarRut(dte.rutReceptor);
    const previas = await documentosDonde('facturas', 'rutLimpio', '==', rutCli);
    const clave = `${dte.tipoDoc}-${dte.folio}`;
    if (previas.some((f) => `${f.tipoDoc}-${f.folio}` === clave && !f.anulada) || nuevasPorClave[`${rutCli}-${clave}`]) { r.repetidas.push(`${etiqueta} de ${dte.receptor}`); continue; }
    let cliente = clientePorRut(rutCli) || clientesCreados[rutCli];
    if (!cliente) {
      const cRef = refNueva('clientes');
      cliente = { id: cRef.id, ...datosClienteDesdeDTE(dte) };
      lote.set(cRef, { ...datosClienteDesdeDTE(dte), creadoMs: Date.now(), ...firma() });
      clientesCreados[rutCli] = cliente;
      r.clientesNuevos++;
    }
    const fRef = refNueva('facturas');
    const esNC = Number(dte.tipoDoc) === 61;
    const venc = dte.vencimiento && dte.vencimiento !== dte.fecha ? dte.vencimiento
      : Number(dte.formaPago) === 1 ? dte.fecha : sumarDias(dte.fecha, cliente.condicionDias ?? 30);
    const datos = {
      origen: 'xml', tipoDoc: dte.tipoDoc, folio: dte.folio, fecha: dte.fecha, mes: mesDe(dte.fecha), vencimiento: esNC ? dte.fecha : venc,
      clienteId: cliente.id, clienteNombre: nombreCliente(cliente), rutCliente: formatearRut(dte.rutReceptor), rutLimpio: rutCli,
      neto: dte.neto, exento: dte.exento, iva: dte.iva, total: dte.total,
      lineas: dte.lineas.map((l) => ({ nombre: l.nombre, cantidad: l.cantidad, precio: l.precio, monto: l.monto })),
      referencias: dte.referencias, formaPago: dte.formaPago || null,
      pagado: 0, estado: esNC ? 'nota-credito' : 'pendiente', abierta: !esNC, anulada: false, archivo: dte.archivo,
      creadoMs: Date.now(), ...firma()
    };
    if (esNC) {
      // Busca la factura que corrige y le descuenta el monto.
      const ref = (dte.referencias || []).find((x) => Number(x.tipo) === 33 || Number(x.tipo) === 34);
      const objetivo = ref && (Object.values(nuevasPorClave).find((f) => f.rutLimpio === rutCli && String(f.folio) === String(ref.folio))
        || previas.find((f) => String(f.folio) === String(ref.folio) && !f.anulada));
      datos.aplicadaA = objetivo ? { facturaId: objetivo.id, folio: objetivo.folio } : null;
      lote.set(fRef, datos);
      if (objetivo && saldo(objetivo) > 0) {
        registrarPago(lote, { cliente, fecha: dte.fecha, medio: 'nota-credito', referencia: `NC ${dte.folio}`, aplicaciones: [{ factura: objetivo, monto: Math.min(dte.total, saldo(objetivo)) }], tipo: 'nota-credito' });
        r.notas++;
      }
    } else {
      lote.set(fRef, datos);
      nuevasPorClave[`${rutCli}-${clave}`] = { id: fRef.id, ...datos };
    }
    r.nuevas.push(`${etiqueta} a ${nombreCliente(cliente)}`);
  }
  if (r.nuevas.length) r.promesa = lote.commit();
  return r;
}

export function crearFacturaManual(lote, datos) {
  const fRef = refNueva('facturas');
  lote.set(fRef, { ...datos, origen: 'manual', pagado: 0, estado: 'pendiente', abierta: true, anulada: false, creadoMs: Date.now(), ...firma() });
  return fRef.id;
}

export function anularFactura(lote, f, motivo = '') {
  lote.update(refDoc('facturas', f.id), { anulada: true, abierta: false, estado: 'anulada', motivoAnulacion: motivo, anuladaEn: Date.now(), ...firma() });
}

export const signo = signoDoc;
