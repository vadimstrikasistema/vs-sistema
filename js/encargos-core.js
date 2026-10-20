// Encargos: un cliente pide piezas para una fecha y deja un abono.
// Estados: pendiente → en el taller → listo → entregado (o anulado).
// Los abonos quedan en el encargo; al entregar se registra la venta completa
// (con cada abono y el saldo como partes del pago) y las piezas salen del stock.
import { estado, firma } from './datos.js';
import { refNueva, refDoc } from './stock.js';
import { registrarVenta } from './ventas-core.js';
import { nombreCliente } from './cobranza-core.js';
import { hoyISO } from './ui.js';

export const ESTADOS_ENCARGO = {
  pendiente: { nombre: 'Por empezar', clase: 'etiqueta-info' },
  taller: { nombre: 'En el taller', clase: 'etiqueta-info' },
  listo: { nombre: 'Listo para entregar', clase: 'etiqueta-ok' },
  entregado: { nombre: 'Entregado', clase: 'etiqueta-suave' },
  anulado: { nombre: 'Anulado', clase: 'etiqueta-suave' }
};

export const etiquetaEncargo = (e) => `Encargo ${e.numero}`;
export const totalEncargo = (lineas) => Math.round(lineas.reduce((s, l) => s + l.cantidad * l.precio, 0));
export const abonado = (e) => (e.abonos || []).filter((a) => !a.devuelto).reduce((s, a) => s + a.monto, 0);
export const saldoEncargo = (e) => Math.max(0, (e.total || 0) - abonado(e));
export const encargoActivo = (e) => !['entregado', 'anulado'].includes(e.estado);
export const atrasado = (e, hoy = hoyISO()) => encargoActivo(e) && e.fechaEntrega && e.fechaEntrega < hoy;
export const resumenEncargo = (e) => e.lineas.map((l) => `${l.cantidad > 1 ? `${l.cantidad} × ` : ''}${l.nombre}`).join(', ');
export const encargosActivos = () => Object.values(estado.encargos).filter(encargoActivo);

function siguienteNumero() {
  const ns = Object.values(estado.encargos).map((e) => Number(e.numero) || 0);
  return (ns.length ? Math.max(...ns) : 0) + 1;
}

const limpiar = (lineas) => lineas.map((l) => ({
  piezaId: l.piezaId || null, nombre: l.nombre.trim(), calidad: l.calidad || 'primera',
  cantidad: l.cantidad, precio: Math.round(l.precio), subtotal: Math.round(l.cantidad * l.precio)
}));

// abono: { monto, medio, fecha } o null
export function crearEncargo(lote, { cliente, fecha, fechaEntrega, canal, lineas, nota = '', abono = null }) {
  const ref = refNueva('encargos');
  const ls = limpiar(lineas);
  const datos = {
    numero: siguienteNumero(), fecha, fechaEntrega, canal,
    clienteId: cliente.id, clienteNombre: nombreCliente(cliente),
    lineas: ls, total: totalEncargo(ls), nota,
    abonos: abono?.monto > 0 ? [{ ...abono, creadoMs: Date.now() }] : [],
    estado: 'pendiente', historial: [{ fecha, estado: 'pendiente' }],
    ventaId: null, creadoMs: Date.now(), ...firma()
  };
  lote.set(ref, datos);
  const e = { id: ref.id, ...datos };
  estado.encargos[e.id] = e;
  return e;
}

export function editarEncargo(lote, e, { fechaEntrega, canal, lineas, nota }) {
  const ls = limpiar(lineas);
  lote.update(refDoc('encargos', e.id), { fechaEntrega, canal, lineas: ls, total: totalEncargo(ls), nota, ...firma() });
}

export function agregarAbono(lote, e, { monto, medio, fecha }) {
  lote.update(refDoc('encargos', e.id), { abonos: [...(e.abonos || []), { monto, medio, fecha, creadoMs: Date.now() }], ...firma() });
}

export function cambiarEstado(lote, e, nuevo, fecha = hoyISO()) {
  lote.update(refDoc('encargos', e.id), { estado: nuevo, historial: [...(e.historial || []), { fecha, estado: nuevo }], ...firma() });
}

// Entrega: el saldo se paga con `medio`. Se registra la venta completa con cada abono como una parte del pago.
export function entregarEncargo(lote, e, { fecha, medio, boleta }) {
  const saldo = saldoEncargo(e);
  const pagos = [
    ...(e.abonos || []).filter((a) => !a.devuelto).map((a) => ({ medio: a.medio, monto: a.monto, fecha: a.fecha })),
    ...(saldo > 0 ? [{ medio, monto: saldo, fecha }] : [])
  ];
  const principal = pagos.slice().sort((a, b) => b.monto - a.monto)[0]?.medio || medio;
  const cliente = estado.clientes[e.clienteId] ? { id: e.clienteId, nombre: e.clienteNombre } : null;
  const v = registrarVenta(lote, {
    lineas: e.lineas.map((l) => ({ ...l })), medio: principal, canal: e.canal, cliente, fecha, hora: '',
    boleta, nota: `${etiquetaEncargo(e)}${e.nota ? ` · ${e.nota}` : ''}`, pagos, encargoId: e.id
  });
  lote.update(refDoc('encargos', e.id), {
    estado: 'entregado', fechaEntregado: fecha, ventaId: v.id,
    historial: [...(e.historial || []), { fecha, estado: 'entregado' }], ...firma()
  });
  return v;
}

export function anularEncargo(lote, e, { devolverAbono = false, motivo = '' } = {}) {
  const abonos = (e.abonos || []).map((a) => (devolverAbono ? { ...a, devuelto: true } : a));
  lote.update(refDoc('encargos', e.id), {
    estado: 'anulado', abonos, motivoAnulacion: motivo, anuladoEn: Date.now(),
    historial: [...(e.historial || []), { fecha: hoyISO(), estado: 'anulado' }], ...firma()
  });
}
