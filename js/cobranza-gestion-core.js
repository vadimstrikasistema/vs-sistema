// Cobranza: todo lo que te deben, de quién, cuánto y desde cuándo, y la
// gestión para cobrarlo (mensajes con tres tonos, respuestas, promesas de pago).
//
// Las deudas no se guardan aparte: se leen de donde están (facturas abiertas,
// órdenes entregadas sin factura, ventas que quedaron debiendo, saldos de
// clases y encargos listos para retirar). Las gestiones sí se guardan, en
// `gestiones`, y el cliente lleva un resumen en `cobranza` para la lista.
import { estado, firma } from './datos.js';
import { refNueva, refDoc } from './stock.js';
import { hoyISO, pesos, fechaCorta } from './ui.js';
import { saldo as saldoFactura, etiquetaFactura, nombreCliente, sumarDias } from './cobranza-core.js';
import { alumnosActivos, saldoAlumno, sesionesVivas } from './clases-core.js';
import { abonado, saldoEncargo } from './encargos-core.js';

export const COBRANZA_INICIAL = {
  diasEntreTonos: 7,
  diasConsignacion: 30,
  plantillas: {
    amable: 'Hola {nombre}, ¿cómo estás? Te escribo de {taller} para recordarte que tenemos pendiente {detalle}.{transferencia}\n\nSi ya lo pagaste, avísame y lo marco. ¡Muchas gracias!',
    firme: 'Hola {nombre}. Te escribo de {taller} porque sigue pendiente {detalle}, con {dias} días de atraso.{transferencia}\n\nTe pido regularizarlo esta semana o contarme cuándo podrás hacerlo. Gracias.',
    ultimo: 'Hola {nombre}. Te escribo nuevamente de {taller} por {detalle}, que lleva {dias} días de atraso y no hemos tenido respuesta.{transferencia}\n\nNecesito que lo regularicemos antes del {plazo}. Si hay algún problema, conversemos. Gracias.',
    consignacion: 'Hola {nombre}, ¿cómo estás? Te escribo de {taller}: tienes {piezas} piezas mías en consignación desde el {desde}. ¿Coordinamos la liquidación? Me cuentas cuántas se vendieron y paso a reponer o retirar. ¡Gracias!'
  }
};
export const configCobranza = () => {
  const c = estado.cobranza || {};
  return { ...COBRANZA_INICIAL, ...c, plantillas: { ...COBRANZA_INICIAL.plantillas, ...(c.plantillas || {}) } };
};

export const TONOS = {
  amable: { nombre: 'Amable', paso: 1 },
  firme: { nombre: 'Firme', paso: 2 },
  ultimo: { nombre: 'Último aviso', paso: 3 }
};
export const TIPOS_DEUDA = {
  factura: 'Factura', orden: 'Sin facturar', venta: 'Venta', clase: 'Clases', encargo: 'Encargo'
};

const diasEntre = (a, b) => Math.round((new Date(`${b}T12:00`) - new Date(`${a}T12:00`)) / 86400000);
export const diasAtrasoDeuda = (d, hoy = hoyISO()) => (d.vencimiento ? Math.max(0, diasEntre(d.vencimiento, hoy)) : 0);

// ---------------------------------------------------------------- Deudas
// facturas: las abiertas (escucharDonde facturas abierta == true); ventas: las que quedaron debiendo.
export function todasLasDeudas({ facturas = [], ventas = [] } = {}) {
  const r = [];
  facturas.filter((f) => !f.anulada && f.abierta && saldoFactura(f) > 0 && Number(f.tipoDoc) !== 61).forEach((f) => r.push({
    tipo: 'factura', id: f.id, clienteId: f.clienteId, clienteNombre: f.clienteNombre, etiqueta: etiquetaFactura(f),
    fecha: f.fecha, vencimiento: f.vencimiento || f.fecha, total: f.total, saldo: saldoFactura(f), cobrable: true, ref: f
  }));
  Object.values(estado.ordenes || {}).filter((o) => !o.anulada && o.entregada && !o.facturada).forEach((o) => r.push({
    tipo: 'orden', id: o.id, clienteId: o.clienteId, clienteNombre: o.clienteNombre, etiqueta: `OV ${o.numero} · sin factura`,
    fecha: o.fechaEntrega || o.fecha, vencimiento: sumarDias(o.fechaEntrega || o.fecha, o.condicionDias ?? 30), total: o.total, saldo: o.total, cobrable: false, ref: o
  }));
  ventas.filter((v) => !v.anulado && v.deuda?.saldo > 0 && v.clienteId).forEach((v) => r.push({
    tipo: 'venta', id: v.id, clienteId: v.clienteId, clienteNombre: v.clienteNombre, etiqueta: `Venta del ${fechaCorta(v.fecha)}`,
    fecha: v.fecha, vencimiento: v.fecha, total: v.total, saldo: v.deuda.saldo, cobrable: true, ref: v
  }));
  Object.values(estado.cursos || {}).filter((c) => !c.anulado).forEach((c) => {
    const primera = sesionesVivas(c)[0]?.fecha || hoyISO();
    alumnosActivos(c).filter((a) => saldoAlumno(c, a) > 0 && a.clienteId).forEach((a) => r.push({
      tipo: 'clase', id: `${c.id}:${a.key}`, cursoId: c.id, alumnoKey: a.key, clienteId: a.clienteId, clienteNombre: a.nombre,
      etiqueta: `Clases · ${c.nombre}`, fecha: a.desde || primera, vencimiento: primera, total: (a.precio ?? c.precio) || 0, saldo: saldoAlumno(c, a), cobrable: true, ref: c
    }));
  });
  Object.values(estado.encargos || {}).filter((e) => e.estado === 'listo' && saldoEncargo(e) > 0).forEach((e) => {
    const listo = (e.historial || []).filter((h) => h.estado === 'listo').pop()?.fecha || e.fechaEntrega;
    r.push({
      tipo: 'encargo', id: e.id, clienteId: e.clienteId, clienteNombre: e.clienteNombre, etiqueta: `Encargo ${e.numero} · listo para retirar`,
      fecha: listo, vencimiento: e.fechaEntrega > listo ? e.fechaEntrega : listo, total: e.total, saldo: saldoEncargo(e), abonado: abonado(e), cobrable: true, ref: e
    });
  });
  return r;
}

// Agrupa por cliente y ordena por urgencia (más atraso, luego más monto).
export function deudores(deudas, hoy = hoyISO()) {
  const m = new Map();
  deudas.forEach((d) => {
    if (!m.has(d.clienteId)) m.set(d.clienteId, []);
    m.get(d.clienteId).push(d);
  });
  return [...m.entries()].map(([id, items]) => {
    const cliente = estado.clientes[id] || { id, nombre: items[0].clienteNombre };
    items.sort((a, b) => (a.vencimiento || '').localeCompare(b.vencimiento || ''));
    const total = items.reduce((s, d) => s + d.saldo, 0);
    const vencido = items.filter((d) => diasAtrasoDeuda(d, hoy) > 0).reduce((s, d) => s + d.saldo, 0);
    const diasMax = Math.max(0, ...items.map((d) => diasAtrasoDeuda(d, hoy)));
    const desde = items.map((d) => d.fecha).filter(Boolean).sort()[0];
    const x = { cliente, id, items, total, vencido, diasMax, desde };
    x.paso = siguientePaso(x, hoy);
    return x;
  }).sort((a, b) => (b.paso.urgente - a.paso.urgente) || (b.diasMax - a.diasMax) || (b.total - a.total));
}

// ---------------------------------------------------------------- Escalera
// Decide qué toca con un deudor, según sus deudas vencidas y las gestiones
// hechas desde que venció la más antigua. Devuelve
// { accion: 'esperar'|'promesa'|'amable'|'firme'|'ultimo'|'llamar', texto, fecha, urgente }.
export function siguientePaso(deudor, hoy = hoyISO()) {
  const cfg = configCobranza();
  const vencidas = deudor.items.filter((d) => diasAtrasoDeuda(d, hoy) > 0);
  const g = deudor.cliente.cobranza || {};
  if (!vencidas.length) {
    const prox = deudor.items.map((d) => d.vencimiento).filter(Boolean).sort()[0];
    return { accion: 'esperar', texto: prox ? `Nada vencido todavía: lo primero vence el ${fechaCorta(prox)}.` : 'Nada vencido todavía.', fecha: prox, urgente: 0 };
  }
  const desde = vencidas.map((d) => d.vencimiento).sort()[0];
  const vigente = (x) => x && x.fecha >= desde;
  const msj = vigente(g.ultimoMensaje) ? g.ultimoMensaje : null;
  const resp = vigente(g.ultimaRespuesta) ? g.ultimaRespuesta : null;
  const prom = g.promesa && g.promesa.creada >= desde ? g.promesa : null;
  if (prom && prom.fecha >= hoy) {
    return { accion: 'promesa', texto: `Prometió pagar${prom.monto ? ` ${pesos(prom.monto)}` : ''} el ${fechaCorta(prom.fecha)}.`, fecha: sumarDias(prom.fecha, 1), urgente: 0 };
  }
  if (prom && prom.fecha < hoy && (!msj || msj.fecha <= prom.fecha)) {
    const tono = msj && TONOS[msj.tono]?.paso >= 2 ? 'ultimo' : 'firme';
    return { accion: tono, texto: `No cumplió lo que prometió para el ${fechaCorta(prom.fecha)}.`, fecha: hoy, urgente: 2 };
  }
  if (!msj) return { accion: 'amable', texto: `Venció hace ${diasEntre(desde, hoy)} día${diasEntre(desde, hoy) === 1 ? '' : 's'} y todavía no le has escrito.`, fecha: hoy, urgente: 1 };
  const siguiente = { amable: 'firme', firme: 'ultimo', ultimo: 'llamar' }[msj.tono] || 'firme';
  const base = resp && resp.fecha >= msj.fecha ? resp.fecha : msj.fecha;
  const cuando = sumarDias(base, cfg.diasEntreTonos);
  const hace = diasEntre(msj.fecha, hoy);
  const quePaso = `Le escribiste (${TONOS[msj.tono]?.nombre.toLowerCase() || 'mensaje'}) hace ${hace} día${hace === 1 ? '' : 's'}${resp && resp.fecha >= msj.fecha ? ' y respondió' : ', sin respuesta'}`;
  if (hoy >= cuando) {
    return { accion: siguiente, texto: `${quePaso}. ${siguiente === 'llamar' ? 'Ya pasó el último aviso: conviene llamar o visitar.' : `Toca el tono ${TONOS[siguiente].nombre.toLowerCase()}.`}`, fecha: cuando, urgente: siguiente === 'llamar' ? 3 : 2 };
  }
  return { accion: 'esperar', texto: `${quePaso}. Si no paga, el ${fechaCorta(cuando)} toca ${siguiente === 'llamar' ? 'llamar' : `el tono ${TONOS[siguiente].nombre.toLowerCase()}`}.`, fecha: cuando, urgente: 0, siguiente };
}

// ---------------------------------------------------------------- Mensajes
export function detalleDeudas(items) {
  const linea = (d) => `• ${d.etiqueta}${d.fecha ? ` del ${fechaCorta(d.fecha)}` : ''}: ${pesos(d.saldo)}${diasAtrasoDeuda(d) > 0 ? ` (${diasAtrasoDeuda(d)} días)` : ''}`;
  if (items.length === 1) {
    const d = items[0];
    const que = d.tipo === 'factura' ? `la ${d.etiqueta.toLowerCase()} del ${fechaCorta(d.fecha)}` : d.tipo === 'clase' ? `el saldo de ${d.etiqueta.toLowerCase()}` : d.tipo === 'encargo' ? `el saldo de tu encargo, que ya está listo para retirar` : d.tipo === 'orden' ? `la orden de venta ${d.ref.numero} del ${fechaCorta(d.fecha)}` : `la compra del ${fechaCorta(d.fecha)}`;
    return `${que} por ${pesos(d.saldo)}`;
  }
  return `estos pagos:\n${items.map(linea).join('\n')}\nTotal: ${pesos(items.reduce((s, d) => s + d.saldo, 0))}`;
}

export function armarMensaje(plantilla, { cliente, items = [], extra = {} }) {
  const e = estado.empresa || {};
  const nombre = (cliente.contacto || cliente.nombre || cliente.razonSocial || '').split(' ')[0] || 'Hola';
  const dias = Math.max(0, ...items.map((d) => diasAtrasoDeuda(d)));
  const vals = {
    nombre, taller: e.nombreFantasia || 'Vadim Strika', detalle: detalleDeudas(items),
    total: pesos(items.reduce((s, d) => s + d.saldo, 0)), dias: String(dias),
    transferencia: e.datosTransferencia ? `\n\nDatos para transferir: ${e.datosTransferencia}` : '',
    plazo: fechaCorta(sumarDias(hoyISO(), 5)), ...extra
  };
  return plantilla.replace(/\{(\w+)\}/g, (m, k) => (k in vals ? vals[k] : m));
}

// ---------------------------------------------------------------- Gestiones
// tipo: mensaje | respuesta | promesa | llamada | visita | nota
export function registrarGestion(lote, cliente, { tipo, fecha = hoyISO(), tono = null, texto = '', items = [], promesa = null }) {
  const ref = refNueva('gestiones');
  const datos = {
    clienteId: cliente.id, clienteNombre: nombreCliente(cliente), fecha, tipo, tono, texto: texto.slice(0, 2000),
    deudas: items.map((d) => ({ tipo: d.tipo, id: d.id, etiqueta: d.etiqueta, saldo: d.saldo })), total: items.reduce((s, d) => s + d.saldo, 0),
    promesa, creadoMs: Date.now(), anulado: false, ...firma()
  };
  lote.set(ref, datos);
  const c = { ...((estado.clientes[cliente.id] || cliente).cobranza || {}) };
  c.ultimaGestion = { fecha, tipo };
  if (tipo === 'mensaje') c.ultimoMensaje = { fecha, tono };
  if (tipo === 'respuesta' || tipo === 'llamada' || tipo === 'visita') c.ultimaRespuesta = { fecha };
  if (tipo === 'promesa') { c.promesa = { ...promesa, creada: fecha }; c.ultimaRespuesta = { fecha }; }
  if (estado.clientes[cliente.id]) {
    lote.update(refDoc('clientes', cliente.id), { cobranza: c, ...firma() });
    estado.clientes[cliente.id].cobranza = c;
  }
  return { id: ref.id, ...datos };
}

export const TIPOS_GESTION = {
  mensaje: 'Mensaje', liquidacion: 'Pidió la liquidación', respuesta: 'Respondió', promesa: 'Prometió pagar', llamada: 'Llamada', visita: 'Visita', nota: 'Nota', pago: 'Pago'
};
