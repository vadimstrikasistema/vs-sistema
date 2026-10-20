// Gastos recurrentes: cuentas que llegan cada cierto tiempo (luz, arriendo,
// internet, contador). Cada período se registra como un gasto normal, así
// entra al análisis y al IVA; el recurrente solo recuerda cuándo toca y
// qué períodos ya están anotados.
import { estado, firma } from './datos.js';
import { refNueva, refDoc } from './stock.js';
import { hoyISO, limpiarRut, formatearRut } from './ui.js';
import { aplicarClasificacion, mesDe } from './gastos-core.js';

export const FRECUENCIAS = { 1: 'Mensual', 2: 'Cada 2 meses', 3: 'Cada 3 meses', 6: 'Cada 6 meses', 12: 'Anual' };

const mesNum = (ym) => { const [y, m] = ym.split('-').map(Number); return y * 12 + (m - 1); };
const deNum = (n) => `${Math.floor(n / 12)}-${String((n % 12) + 1).padStart(2, '0')}`;
const ultimoDia = (ym) => { const [y, m] = ym.split('-').map(Number); return new Date(y, m, 0).getDate(); };
export const vencimientoDe = (r, periodo) => `${periodo}-${String(Math.min(Number(r.dia) || 1, ultimoDia(periodo))).padStart(2, '0')}`;
export const recurrentesActivos = () => Object.values(estado.recurrentes || {}).filter((r) => r.activo !== false);

// Períodos (YYYY-MM) en que toca pagar, entre dos meses (incluidos).
export function periodos(r, desdeYM, hastaYM) {
  const n = Number(r.frecuencia) || 1;
  const ini = mesNum(r.inicio);
  const r0 = [];
  for (let m = Math.max(mesNum(desdeYM), ini); m <= mesNum(hastaYM); m++) if ((m - ini) % n === 0) r0.push(deNum(m));
  return r0;
}

export const registro = (r, periodo) => r.registros?.[periodo] || null;

// El período que toca atender ahora: el más antiguo sin registrar desde que se creó el recurrente, o el próximo.
export function periodoPendiente(r, hoy = hoyISO()) {
  const desde = r.creadoMes && r.creadoMes > r.inicio ? r.creadoMes : r.inicio;
  const hasta = deNum(mesNum(mesDe(hoy)) + 12);
  return periodos(r, desde, hasta).find((p) => !registro(r, p)) || null;
}

export function guardarRecurrente(lote, r, datos) {
  if (r?.id) { lote.update(refDoc('recurrentes', r.id), { ...datos, ...firma() }); return r.id; }
  const ref = refNueva('recurrentes');
  lote.set(ref, { ...datos, activo: true, registros: {}, creadoMes: mesDe(hoyISO()), creadoMs: Date.now(), ...firma() });
  return ref.id;
}

// Registra el gasto de un período. `pagado`: si ya se pagó (con fecha y medio) o queda por pagar.
// Devuelve el id del gasto creado.
export function registrarPeriodo(lote, r, { periodo, tipoDoc, folio = '', fecha, total, pagado, fechaPago, medio = '', notas = '' }) {
  const t = Number(tipoDoc);
  const esFact = t === 33;
  const neto = esFact ? Math.round(total / 1.19) : t === 39 ? Math.round(total / 1.19) : total;
  const iva = t === 33 || t === 39 ? total - neto : 0;
  const id = refNueva('gastos').id;
  const gasto = {
    id, origen: 'manual', tipoDoc: t, folio: t === 0 ? '' : folio, fecha, mes: mesDe(fecha),
    rutProveedor: r.rutProveedor ? formatearRut(r.rutProveedor) : '', rutLimpio: r.rutProveedor ? limpiarRut(r.rutProveedor) : '',
    proveedor: r.proveedor || r.nombre, neto, exento: 0, iva, total,
    pagoEstado: pagado ? 'pagado' : 'por-pagar',
    pago: pagado ? { fecha: fechaPago || fecha, medio } : { vencimiento: vencimientoDe(r, periodo) },
    notas, recurrenteId: r.id, periodo
  };
  const lineas = [{ nombre: r.nombre, cantidad: 1, monto: esFact ? neto : total, clase: 'gasto', itemGasto: r.itemGasto, area: r.area }];
  const res = aplicarClasificacion(lote, gasto, lineas);
  const docData = { ...gasto, ...res };
  delete docData.id; delete docData.alertas;
  lote.set(refDoc('gastos', id), { ...docData, anulado: false, creadoMs: Date.now(), ...firma() });
  marcarRegistro(lote, r, periodo, { gastoId: id, total, estado: pagado ? 'pagado' : 'por-pagar' });
  return id;
}

// Vincula un período con un gasto que ya estaba cargado (por ejemplo, el XML de la factura).
export function vincularPeriodo(lote, r, periodo, g) {
  lote.update(refDoc('gastos', g.id), { recurrenteId: r.id, periodo, ...firma() });
  marcarRegistro(lote, r, periodo, { gastoId: g.id, total: g.total, estado: g.pagoEstado === 'por-pagar' ? 'por-pagar' : 'pagado' });
}

export function marcarRegistro(lote, r, periodo, datos) {
  const registros = { ...(r.registros || {}), [periodo]: { ...datos, fecha: hoyISO() } };
  lote.update(refDoc('recurrentes', r.id), { registros, ...firma() });
  if (estado.recurrentes?.[r.id]) estado.recurrentes[r.id].registros = registros;
}

// Quita el registro de un período (cuando se anula su gasto).
export function liberarPeriodo(lote, r, periodo) {
  const registros = { ...(r.registros || {}) };
  delete registros[periodo];
  lote.update(refDoc('recurrentes', r.id), { registros, ...firma() });
}
