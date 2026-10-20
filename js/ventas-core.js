// Lógica de ventas directas (feria, taller, Instagram): cada venta pieza por
// pieza, con su medio de pago, comisión, boleta y el costo de lo vendido.
import { estado, firma } from './datos.js';
import { hoyISO } from './ui.js';
import { nuevoLote, refNueva, refDoc } from './stock.js';
import { movimientoPieza, costoFicha } from './piezas-core.js';
import { mesDe } from './gastos-core.js';

export const VENTAS_INICIAL = {
  controlarStock: false,   // apagado mientras no esté cargado el inventario de piezas
  comisiones: {},          // id del medio de pago → % de comisión (máquinas de tarjeta)
  recordarBoleta: true
};
export const configVentas = () => ({ ...VENTAS_INICIAL, ...(estado.ventas || {}) });
export const comisionDe = (medio) => Number(configVentas().comisiones?.[medio] || 0);

export const horaActual = () => {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

// Costo de una pieza vendida: el costo real del último lote o, si no hay, el estimado de la ficha.
export function costoPieza(piezaId) {
  const p = estado.piezas[piezaId];
  if (!p) return 0;
  return p.costoUltimo || costoFicha(p).total || 0;
}

export const precioDe = (p, calidad) => (calidad === 'segunda' ? p.precioSegunda || p.precioB2C || 0 : p.precioB2C || 0);

// Totales de un carrito.
export function totalesCarrito(lineas, medio, descuentoGlobal = 0) {
  const bruto = lineas.reduce((s, l) => s + l.cantidad * l.precio, 0);
  const descuento = Math.min(bruto, Math.max(0, descuentoGlobal || 0));
  const total = Math.max(0, bruto - descuento);
  const neto = Math.round(total / 1.19);
  const comision = Math.round(total * comisionDe(medio) / 100);
  return { bruto, descuento, total, neto, iva: total - neto, comision };
}

// Registra una venta. Si la línea tiene ficha, descuenta la pieza del stock
// (aunque quede negativo cuando el control de stock está apagado).
export function registrarVenta(lote, { lineas, medio, canal, feriaId = null, cliente = null, fecha, hora, boleta, nota = '', descuento = 0 }) {
  const vRef = refNueva('ventas');
  const ref = { tipo: 'venta', id: vRef.id };
  const t = totalesCarrito(lineas, medio, descuento);
  const movs = [];
  const lineasDoc = lineas.map((l) => {
    const costo = l.piezaId ? costoPieza(l.piezaId) : 0;
    if (l.piezaId && estado.piezas[l.piezaId]) {
      movs.push(movimientoPieza(lote, { piezaId: l.piezaId, calidad: l.calidad || 'primera', cantidad: -l.cantidad, tipo: 'venta', fecha, ref, nota: feriaId ? 'Venta en feria' : 'Venta directa' }));
    }
    return {
      piezaId: l.piezaId || null, nombre: l.nombre, calidad: l.calidad || 'primera', cantidad: l.cantidad,
      precio: l.precio, subtotal: l.cantidad * l.precio, costoUnitario: costo,
      categoria: l.piezaId ? estado.piezas[l.piezaId]?.categoria || null : null
    };
  });
  const costo = lineasDoc.reduce((s, l) => s + l.costoUnitario * l.cantidad, 0);
  const datos = {
    fecha, mes: mesDe(fecha), hora, creadoMs: Date.now(), canal, feriaId, medio,
    clienteId: cliente?.id || null, clienteNombre: cliente?.nombre || '',
    lineas: lineasDoc, piezas: lineasDoc.reduce((s, l) => s + l.cantidad, 0),
    ...t, costo, comisionPct: comisionDe(medio),
    boleta: { emitida: Boolean(boleta?.emitida), folio: boleta?.folio || '' },
    nota, movs, anulado: false, ...firma()
  };
  lote.set(vRef, datos);
  return { id: vRef.id, ...datos };
}

export function anularVenta(lote, v, motivo = '') {
  v.lineas.forEach((l) => {
    if (l.piezaId && estado.piezas[l.piezaId]) {
      movimientoPieza(lote, { piezaId: l.piezaId, calidad: l.calidad, cantidad: l.cantidad, costoUnitario: l.costoUnitario || null, tipo: 'anulacion', fecha: v.fecha, ref: { tipo: 'venta', id: v.id }, nota: 'Anulación de venta' });
    }
  });
  lote.update(refDoc('ventas', v.id), { anulado: true, motivoAnulacion: motivo, anuladoEn: Date.now(), ...firma() });
}

export function marcarBoleta(lote, v, folio) {
  lote.update(refDoc('ventas', v.id), { boleta: { emitida: true, folio: folio || '' }, ...firma() });
}

// ---------------------------------------------------------------- Resúmenes
export function resumenVentas(ventas) {
  const vs = ventas.filter((v) => !v.anulado);
  const suma = (k) => vs.reduce((s, v) => s + (v[k] || 0), 0);
  const porMedio = new Map(); const porCanal = new Map(); const porPieza = new Map(); const porHora = new Map(); const porDia = new Map();
  vs.forEach((v) => {
    porMedio.set(v.medio, (porMedio.get(v.medio) || 0) + v.total);
    porCanal.set(v.canal, (porCanal.get(v.canal) || 0) + v.total);
    porDia.set(v.fecha, (porDia.get(v.fecha) || 0) + v.total);
    const h = (v.hora || '00:00').slice(0, 2);
    porHora.set(h, (porHora.get(h) || 0) + v.total);
    v.lineas.forEach((l) => {
      const k = l.piezaId || `sin-ficha:${l.nombre}`;
      const x = porPieza.get(k) || { nombre: l.nombre, cantidad: 0, total: 0 };
      x.cantidad += l.cantidad; x.total += l.subtotal;
      porPieza.set(k, x);
    });
  });
  const total = suma('total');
  const neto = suma('neto');
  const costo = suma('costo');
  const comision = suma('comision');
  return {
    ventas: vs.length, piezas: suma('piezas'), total, neto, iva: suma('iva'), costo, comision,
    margen: neto - costo - comision,
    sinBoleta: vs.filter((v) => !v.boleta?.emitida),
    porMedio, porCanal, porPieza, porHora, porDia
  };
}

export const feriaDeHoy = (ferias, hoy = hoyISO()) => ferias.find((f) => !f.cerrada && f.fechaInicio <= hoy && hoy <= (f.fechaFin || f.fechaInicio));

export { nuevoLote };
