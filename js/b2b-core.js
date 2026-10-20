// Ventas a empresas: órdenes de venta (OV), consignaciones con liquidación
// y el paso a factura. Los precios a tiendas son netos (sin IVA).
//
// Flujo:
//   OV directa:     se crea → se entrega (salen las piezas del stock) → se factura.
//   Consignación:   se entrega (salen del stock y quedan «en la tienda») →
//                   se liquida: lo vendido pasa a una OV ya entregada, lo que
//                   no se vendió sigue en la tienda o vuelve al taller.
//   Facturar:       se juntan una o varias OV de un cliente, se emite la factura
//                   en el SII y se anota el folio: queda como cuenta por cobrar.
import { estado, firma } from './datos.js';
import { limpiarRut, formatearRut } from './ui.js';
import { refNueva, refDoc, documentosDonde } from './stock.js';
import { movimientoPieza, costoFicha } from './piezas-core.js';
import { mesDe } from './gastos-core.js';
import { configVentas } from './ventas-core.js';
import { sumarDias, nombreCliente } from './cobranza-core.js';

export const IVA = 0.19;
export const ivaDe = (neto) => Math.round(neto * IVA);

export const etiquetaOV = (o) => `OV ${o.numero}`;
export const etiquetaConsignacion = (c) => `Consignación ${c.numero}`;

// Correlativo: el mayor número usado + 1. Sirve sin señal porque las órdenes
// se escuchan completas; Vadim trabaja solo, así que no hay choques.
export function siguienteNumero(coleccion) {
  const nums = Object.values(estado[coleccion] || {}).map((x) => Number(x.numero) || 0);
  return (nums.length ? Math.max(...nums) : 0) + 1;
}

// Precio neto para un cliente: el último que se le cobró por esa pieza, o el
// precio a tiendas de la ficha.
export function precioCliente(cliente, piezaId) {
  const p = estado.piezas[piezaId];
  const recordado = cliente?.precios?.[piezaId];
  if (recordado > 0) return recordado;
  return p?.precioB2B || (p?.precioB2C ? Math.round(p.precioB2C / 1.19) : 0);
}

const costoReferencia = (piezaId) => {
  const p = estado.piezas[piezaId];
  if (!p) return 0;
  const total = (p.stock || 0) + (p.stockSegunda || 0);
  return total > 0 && p.valorStock > 0 ? p.valorStock / total : p.costoUltimo || costoFicha(p).total || 0;
};

export function totalesLineas(lineas) {
  const neto = Math.round(lineas.reduce((s, l) => s + l.cantidad * l.precio, 0));
  const iva = ivaDe(neto);
  return { neto, iva, total: neto + iva };
}

const datosCliente = (c) => ({
  clienteId: c.id, clienteNombre: nombreCliente(c), razonSocial: c.razonSocial || c.nombre || '',
  rutCliente: c.rut || '', rutLimpio: c.rutLimpio || limpiarRut(c.rut || '')
});

// Revisa que alcance el stock (solo si el control de stock está encendido).
export function faltaStock(lineas) {
  if (!configVentas().controlarStock) return null;
  const pedido = new Map();
  lineas.filter((l) => l.piezaId).forEach((l) => {
    const k = `${l.piezaId}|${l.calidad || 'primera'}`;
    pedido.set(k, (pedido.get(k) || 0) + l.cantidad);
  });
  for (const [k, n] of pedido) {
    const [id, cal] = k.split('|');
    const p = estado.piezas[id];
    const hay = cal === 'segunda' ? p?.stockSegunda || 0 : p?.stock || 0;
    if (n > hay) return `No alcanza el stock de «${p?.nombre}»${cal === 'segunda' ? ' de segunda' : ''}: hay ${hay} y pides ${n}.`;
  }
  return null;
}

// Guarda en el cliente los precios usados, para proponerlos la próxima vez.
function recordarPrecios(lote, cliente, lineas) {
  const precios = { ...(estado.clientes[cliente.id]?.precios || cliente.precios || {}) };
  let cambia = false;
  lineas.filter((l) => l.piezaId && l.precio > 0).forEach((l) => {
    if (precios[l.piezaId] !== l.precio) { precios[l.piezaId] = l.precio; cambia = true; }
  });
  if (cambia) {
    lote.update(refDoc('clientes', cliente.id), { precios, ...firma() });
    if (estado.clientes[cliente.id]) estado.clientes[cliente.id].precios = precios;
  }
}

// ---------------------------------------------------------------- Órdenes de venta
function sacarDelStock(lote, lineas, { tipo, fecha, ref, nota }) {
  return lineas.map((l) => {
    if (!l.piezaId || !estado.piezas[l.piezaId]) return { ...l, costoUnitario: l.costoUnitario || 0 };
    const m = movimientoPieza(lote, { piezaId: l.piezaId, calidad: l.calidad || 'primera', cantidad: -l.cantidad, tipo, fecha, ref, nota });
    return { ...l, costoUnitario: Math.abs(m.valor / l.cantidad) || 0, movId: m.id };
  });
}

const limpiarLinea = (l) => ({
  piezaId: l.piezaId || null, nombre: l.nombre, calidad: l.calidad || 'primera', cantidad: l.cantidad,
  precio: Math.round(l.precio), subtotal: Math.round(l.cantidad * l.precio),
  costoUnitario: l.costoUnitario ?? (l.piezaId ? costoReferencia(l.piezaId) : 0), ...(l.movId ? { movId: l.movId } : {}), ...(l.key ? { key: l.key } : {})
});

// lineas: [{ piezaId, nombre, calidad, cantidad, precio (neto) }]
export function crearOrden(lote, { cliente, fecha, lineas, entregar = true, nota = '', origen = 'directa', consignacion = null, fechaCompromiso = null }) {
  const oRef = refNueva('ordenes');
  const numero = siguienteNumero('ordenes');
  const ref = { tipo: 'orden', id: oRef.id };
  let ls = lineas;
  if (entregar && origen === 'directa') ls = sacarDelStock(lote, lineas, { tipo: 'venta-b2b', fecha, ref, nota: `OV ${numero}` });
  const lineasDoc = ls.map(limpiarLinea);
  const t = totalesLineas(lineasDoc);
  const datos = {
    numero, fecha, mes: mesDe(fecha), creadoMs: Date.now(), ...datosCliente(cliente),
    condicionDias: cliente.condicionDias ?? 30, origen,
    consignacionId: consignacion?.id || null, consignacionNumero: consignacion?.numero || null,
    lineas: lineasDoc, piezas: lineasDoc.reduce((s, l) => s + l.cantidad, 0), ...t,
    costo: Math.round(lineasDoc.reduce((s, l) => s + l.costoUnitario * l.cantidad, 0)),
    entregada: Boolean(entregar), fechaEntrega: entregar ? fecha : null, fechaCompromiso: entregar ? null : fechaCompromiso,
    facturada: false, facturaId: null, folio: '', nota, anulada: false, ...firma()
  };
  lote.set(oRef, datos);
  recordarPrecios(lote, cliente, lineasDoc);
  const o = { id: oRef.id, ...datos };
  if (estado.ordenes) estado.ordenes[o.id] = o; // para que el correlativo siga si se crean varias seguidas
  return o;
}

export function entregarOrden(lote, o, fecha) {
  const ls = sacarDelStock(lote, o.lineas, { tipo: 'venta-b2b', fecha, ref: { tipo: 'orden', id: o.id }, nota: etiquetaOV(o) }).map(limpiarLinea);
  const costo = Math.round(ls.reduce((s, l) => s + l.costoUnitario * l.cantidad, 0));
  lote.update(refDoc('ordenes', o.id), { entregada: true, fechaEntrega: fecha, lineas: ls, costo, ...firma() });
}

// Anula una OV. Si salió del stock, las piezas vuelven. Si vino de una
// consignación, las piezas vuelven a contar como «en la tienda».
export function anularOrden(lote, o, motivo = '') {
  if (o.facturada) throw new Error('Esta orden ya está facturada. Primero anula la factura en Cobranza (con una nota de crédito en el SII).');
  if (o.origen === 'directa' && o.entregada) {
    o.lineas.forEach((l) => {
      if (l.piezaId && estado.piezas[l.piezaId]) movimientoPieza(lote, { piezaId: l.piezaId, calidad: l.calidad, cantidad: l.cantidad, costoUnitario: l.costoUnitario || null, tipo: 'anulacion', fecha: o.fechaEntrega || o.fecha, ref: { tipo: 'orden', id: o.id }, nota: `Anulación ${etiquetaOV(o)}`, actualizaCosto: false });
    });
  }
  if (o.origen === 'consignacion' && o.consignacionId) {
    const c = estado.consignaciones[o.consignacionId];
    if (c) {
      const lineas = c.lineas.map((x) => ({ ...x }));
      o.lineas.forEach((l) => {
        const x = lineas.find((y) => y.key === l.key) || lineas.find((y) => y.piezaId === l.piezaId && y.calidad === l.calidad && y.nombre === l.nombre);
        if (x) x.vendidas = Math.max(0, (x.vendidas || 0) - l.cantidad);
      });
      lote.update(refDoc('consignaciones', c.id), { lineas, cerrada: false, ...firma() });
    }
  }
  lote.update(refDoc('ordenes', o.id), { anulada: true, motivoAnulacion: motivo, anuladaEn: Date.now(), ...firma() });
}

// ---------------------------------------------------------------- Consignación
export const enTienda = (l) => (l.entregadas || 0) - (l.vendidas || 0) - (l.devueltas || 0) - (l.perdidas || 0);
export const piezasEnTienda = (c) => c.lineas.reduce((s, l) => s + enTienda(l), 0);
export const valorEnTienda = (c) => c.lineas.reduce((s, l) => s + enTienda(l) * l.precio, 0);
export const costoEnTienda = (c) => c.lineas.reduce((s, l) => s + enTienda(l) * (l.costoUnitario || 0), 0);
export const consignacionesAbiertas = () => Object.values(estado.consignaciones).filter((c) => !c.anulada && !c.cerrada);

// Piezas de una ficha que están en consignación (en todas las tiendas).
export function consignadasDe(piezaId) {
  return consignacionesAbiertas().reduce((s, c) => s + c.lineas.filter((l) => l.piezaId === piezaId).reduce((t, l) => t + enTienda(l), 0), 0);
}

let nKey = 0;
const nuevaKey = () => `l${Date.now().toString(36)}${(nKey++).toString(36)}`;

function lineasEntregadas(lote, lineas, { fecha, ref, nota }) {
  return sacarDelStock(lote, lineas, { tipo: 'consignacion', fecha, ref, nota }).map((l) => ({
    key: nuevaKey(), piezaId: l.piezaId || null, nombre: l.nombre, calidad: l.calidad || 'primera',
    precio: Math.round(l.precio), costoUnitario: l.costoUnitario || 0, entregadas: l.cantidad, vendidas: 0, devueltas: 0, perdidas: 0
  }));
}

export function crearConsignacion(lote, { cliente, fecha, lineas, nota = '' }) {
  const cRef = refNueva('consignaciones');
  const numero = siguienteNumero('consignaciones');
  const ls = lineasEntregadas(lote, lineas, { fecha, ref: { tipo: 'consignacion', id: cRef.id }, nota: `Consignación ${numero}` });
  const datos = {
    numero, fecha, mes: mesDe(fecha), creadoMs: Date.now(), ...datosCliente(cliente),
    lineas: ls, entregas: [{ fecha, piezas: ls.reduce((s, l) => s + l.entregadas, 0) }], liquidaciones: [],
    cerrada: false, nota, anulada: false, ...firma()
  };
  lote.set(cRef, datos);
  recordarPrecios(lote, cliente, ls);
  const c = { id: cRef.id, ...datos };
  estado.consignaciones[c.id] = c;
  return c;
}

// Más piezas a una consignación abierta.
export function agregarAConsignacion(lote, c, { fecha, lineas }) {
  const nuevas = lineasEntregadas(lote, lineas, { fecha, ref: { tipo: 'consignacion', id: c.id }, nota: etiquetaConsignacion(c) });
  const todas = c.lineas.map((x) => ({ ...x }));
  nuevas.forEach((n) => {
    const igual = todas.find((x) => x.piezaId && x.piezaId === n.piezaId && x.calidad === n.calidad && x.precio === n.precio);
    if (igual) {
      // Promedia el costo de lo que hay en la tienda con lo nuevo.
      const antes = enTienda(igual);
      igual.costoUnitario = antes + n.entregadas > 0 ? (antes * (igual.costoUnitario || 0) + n.entregadas * n.costoUnitario) / (antes + n.entregadas) : n.costoUnitario;
      igual.entregadas += n.entregadas;
    } else todas.push(n);
  });
  lote.update(refDoc('consignaciones', c.id), {
    lineas: todas, cerrada: false,
    entregas: [...(c.entregas || []), { fecha, piezas: nuevas.reduce((s, l) => s + l.entregadas, 0) }], ...firma()
  });
  recordarPrecios(lote, estado.clientes[c.clienteId] || { id: c.clienteId }, nuevas);
}

// Liquidación. filas: [{ key, vendidas, vuelven, vuelvenSegunda, perdidas }]
// Devuelve la OV creada con lo vendido (o null si no se vendió nada).
export function liquidarConsignacion(lote, c, { fecha, filas, nota = '' }) {
  const cliente = estado.clientes[c.clienteId] || { id: c.clienteId, nombre: c.clienteNombre, rut: c.rutCliente, rutLimpio: c.rutLimpio, razonSocial: c.razonSocial };
  const lineas = c.lineas.map((x) => ({ ...x }));
  const ref = { tipo: 'consignacion', id: c.id };
  const vendidas = [];
  const resumen = { vendidas: 0, vuelven: 0, vuelvenSegunda: 0, perdidas: 0, valorPerdidas: 0 };
  for (const f of filas) {
    const l = lineas.find((x) => x.key === f.key);
    if (!l) continue;
    const v = f.vendidas || 0, b = f.vuelven || 0, s = f.vuelvenSegunda || 0, p = f.perdidas || 0;
    if (v + b + s + p > enTienda(l)) throw new Error(`En «${l.nombre}» anotaste más piezas de las que hay en la tienda (${enTienda(l)}).`);
    if (v) vendidas.push({ key: l.key, piezaId: l.piezaId, nombre: l.nombre, calidad: l.calidad, cantidad: v, precio: l.precio, costoUnitario: l.costoUnitario });
    const vuelve = (n, calidad) => {
      if (!n || !l.piezaId || !estado.piezas[l.piezaId]) return;
      movimientoPieza(lote, { piezaId: l.piezaId, calidad, cantidad: n, costoUnitario: l.costoUnitario || 0, tipo: 'devolucion', fecha, ref, nota: calidad === 'segunda' && l.calidad !== 'segunda' ? `${etiquetaConsignacion(c)} · vuelve dañada` : etiquetaConsignacion(c), actualizaCosto: false });
    };
    vuelve(b, l.calidad);
    vuelve(s, 'segunda');
    l.vendidas = (l.vendidas || 0) + v;
    l.devueltas = (l.devueltas || 0) + b + s;
    l.perdidas = (l.perdidas || 0) + p;
    Object.assign(resumen, { vendidas: resumen.vendidas + v, vuelven: resumen.vuelven + b, vuelvenSegunda: resumen.vuelvenSegunda + s, perdidas: resumen.perdidas + p, valorPerdidas: resumen.valorPerdidas + p * (l.costoUnitario || 0) });
  }
  if (!resumen.vendidas && !resumen.vuelven && !resumen.vuelvenSegunda && !resumen.perdidas) throw new Error('Anota al menos una pieza vendida, devuelta o perdida.');
  let orden = null;
  if (vendidas.length) {
    orden = crearOrden(lote, { cliente, fecha, lineas: vendidas, entregar: true, origen: 'consignacion', consignacion: c, nota: nota || `Liquidación de ${etiquetaConsignacion(c)}` });
  }
  const cerrada = lineas.every((l) => enTienda(l) <= 0);
  lote.update(refDoc('consignaciones', c.id), {
    lineas, cerrada,
    liquidaciones: [...(c.liquidaciones || []), { fecha, ...resumen, valorPerdidas: Math.round(resumen.valorPerdidas), ordenId: orden?.id || null, ordenNumero: orden?.numero || null, nota }],
    ...firma()
  });
  return { orden, resumen, cerrada };
}

// Anula una consignación recién hecha (mientras no tenga liquidaciones): las piezas vuelven al stock.
export function anularConsignacion(lote, c, motivo = '') {
  if ((c.liquidaciones || []).length) throw new Error('Esta consignación ya tiene liquidaciones. Para cerrarla, liquida lo que queda como «vuelven al taller».');
  c.lineas.forEach((l) => {
    if (l.piezaId && estado.piezas[l.piezaId]) movimientoPieza(lote, { piezaId: l.piezaId, calidad: l.calidad, cantidad: l.entregadas, costoUnitario: l.costoUnitario || 0, tipo: 'anulacion', fecha: c.fecha, ref: { tipo: 'consignacion', id: c.id }, nota: `Anulación ${etiquetaConsignacion(c)}`, actualizaCosto: false });
  });
  lote.update(refDoc('consignaciones', c.id), { anulada: true, cerrada: true, motivoAnulacion: motivo, anuladaEn: Date.now(), ...firma() });
}

// ---------------------------------------------------------------- Facturar
export const porFacturar = () => Object.values(estado.ordenes).filter((o) => !o.anulada && o.entregada && !o.facturada);
export const porEntregar = () => Object.values(estado.ordenes).filter((o) => !o.anulada && !o.entregada);

// Junta las líneas de varias OV en el detalle de una factura (misma pieza y precio = una línea).
export function detalleFactura(ordenes) {
  const m = new Map();
  ordenes.forEach((o) => o.lineas.forEach((l) => {
    const nombre = `${l.nombre}${l.calidad === 'segunda' ? ' (segunda)' : ''}`;
    const k = `${nombre}|${l.precio}`;
    const x = m.get(k) || { nombre, cantidad: 0, precio: l.precio };
    x.cantidad += l.cantidad;
    m.set(k, x);
  }));
  const lineas = [...m.values()].map((x) => ({ ...x, monto: x.cantidad * x.precio }));
  return { lineas, ...totalesLineas(lineas) };
}

const fechaSII = (iso) => (iso ? iso.split('-').reverse().join('-') : '');

// Lo que el favorito del SII necesita para rellenar el facturador.
export function datosParaSII(ordenes, cliente) {
  const d = detalleFactura(ordenes);
  const rut = formatearRut(cliente.rut || ordenes[0].rutCliente || '');
  const [num, dv] = rut.replace(/\./g, '').split('-');
  return {
    v: 1, rut: num || '', dv: dv || '', rutCompleto: rut,
    razonSocial: cliente.razonSocial || cliente.nombre || '', giro: cliente.giro || '',
    direccion: cliente.direccion || '', comuna: cliente.comuna || '', ciudad: cliente.ciudad || cliente.comuna || '',
    contacto: cliente.contacto || '', correo: cliente.correo || '',
    lineas: d.lineas.map((l) => ({ nombre: l.nombre.slice(0, 80), cantidad: l.cantidad, precio: l.precio })),
    referencias: ordenes.map((o) => ({ tipo: '802', folio: String(o.numero), fecha: fechaSII(o.fecha), razon: `Nota de pedido OV ${o.numero}` })),
    neto: d.neto, iva: d.iva, total: d.total
  };
}

export const codigoParaSII = (datos) => `VS1:${JSON.stringify(datos)}`;

// Anota el folio de la factura emitida en el SII. Crea la cuenta por cobrar
// (o se vincula con la que ya existe si el XML se cargó antes) y marca las OV.
export async function registrarFactura(lote, { ordenes, cliente, folio, fecha }) {
  const rutLimpio = cliente.rutLimpio || limpiarRut(cliente.rut || '');
  const previas = rutLimpio ? await documentosDonde('facturas', 'rutLimpio', '==', rutLimpio) : [];
  const existente = previas.find((f) => String(f.folio) === String(folio) && Number(f.tipoDoc) === 33 && !f.anulada);
  const d = detalleFactura(ordenes);
  const ordenIds = ordenes.map((o) => o.id);
  let facturaId;
  if (existente) {
    facturaId = existente.id;
    lote.update(refDoc('facturas', existente.id), { ordenIds: [...new Set([...(existente.ordenIds || []), ...ordenIds])], ordenNumeros: [...new Set([...(existente.ordenNumeros || []), ...ordenes.map((o) => o.numero)])], ...firma() });
  } else {
    const fRef = refNueva('facturas');
    facturaId = fRef.id;
    lote.set(fRef, {
      origen: 'ov', tipoDoc: 33, folio: String(folio), fecha, mes: mesDe(fecha),
      vencimiento: sumarDias(fecha, cliente.condicionDias ?? 30),
      clienteId: cliente.id, clienteNombre: nombreCliente(cliente), rutCliente: formatearRut(cliente.rut || ''), rutLimpio,
      neto: d.neto, exento: 0, iva: d.iva, total: d.total,
      lineas: d.lineas.map((l) => ({ nombre: l.nombre, cantidad: l.cantidad, precio: l.precio, monto: l.monto })),
      referencias: ordenes.map((o) => ({ tipo: '802', folio: String(o.numero), fecha: o.fecha })),
      ordenIds, ordenNumeros: ordenes.map((o) => o.numero),
      pagado: 0, estado: 'pendiente', abierta: true, anulada: false, creadoMs: Date.now(), ...firma()
    });
  }
  ordenes.forEach((o) => lote.update(refDoc('ordenes', o.id), { facturada: true, facturaId, folio: String(folio), fechaFactura: fecha, ...firma() }));
  return { facturaId, vinculada: Boolean(existente), diferencia: existente ? Math.round(existente.total - d.total) : 0 };
}
