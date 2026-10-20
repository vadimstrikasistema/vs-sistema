// Clases y talleres: un curso tiene sesiones (aparecen en la Agenda), alumnos
// con sus pagos (cada pago se registra como venta del canal «Clases») y los
// materiales que se usan (salen de bodega a costo promedio).
import { estado, firma } from './datos.js';
import { refNueva, refDoc, agregarMovimiento, agregarAnulacion } from './stock.js';
import { registrarVenta, anularVenta } from './ventas-core.js';
import { hoyISO } from './ui.js';

let nk = 0;
export const nuevaKey = () => `k${Date.now().toString(36)}${(nk++).toString(36)}`;
const sumarDias = (iso, d) => { const [y, m, dd] = iso.split('-').map(Number); const f = new Date(y, m - 1, dd + d); return `${f.getFullYear()}-${String(f.getMonth() + 1).padStart(2, '0')}-${String(f.getDate()).padStart(2, '0')}`; };

export const cursosActivos = () => Object.values(estado.cursos || {}).filter((c) => !c.anulado && c.estado !== 'terminado');
export const alumnosActivos = (c) => (c.alumnos || []).filter((a) => !a.retirado);
export const sesionesVivas = (c) => (c.sesiones || []).filter((s) => !s.cancelada).sort((a, b) => (a.fecha + (a.hora || '')).localeCompare(b.fecha + (b.hora || '')));
export const pagadoAlumno = (a) => (a.pagos || []).filter((p) => !p.anulado).reduce((s, p) => s + p.monto, 0);
export const precioAlumno = (c, a) => (a.precio ?? c.precio) || 0;
export const saldoAlumno = (c, a) => (a.retirado ? 0 : Math.max(0, precioAlumno(c, a) - pagadoAlumno(a)));
export const costoMateriales = (c) => (c.materiales || []).filter((m) => !m.anulado).reduce((s, m) => s + (m.costo || 0), 0);

export function resumenCurso(c) {
  const al = alumnosActivos(c);
  const cobrado = (c.alumnos || []).reduce((s, a) => s + pagadoAlumno(a), 0);
  const porCobrar = al.reduce((s, a) => s + saldoAlumno(c, a), 0);
  const materiales = costoMateriales(c);
  const otros = c.otrosCostos || 0;
  const ses = sesionesVivas(c);
  const hoy = hoyISO();
  return {
    alumnos: al.length, cobrado, porCobrar, materiales, otros,
    neto: Math.round(cobrado / 1.19), resultado: Math.round(cobrado / 1.19) - materiales - otros,
    sesiones: ses.length, hechas: ses.filter((s) => s.hecha || s.fecha < hoy).length,
    proxima: ses.find((s) => s.fecha >= hoy) || null
  };
}

// Sesiones semanales desde una fecha.
export function generarSesiones({ desde, cantidad, hora = '', horaFin = '', cadaDias = 7 }) {
  return Array.from({ length: cantidad }, (_, i) => ({ key: nuevaKey(), fecha: sumarDias(desde, i * cadaDias), hora, horaFin, tema: '', hecha: false, cancelada: false, asistencia: [] }));
}

function siguienteNumero() {
  const ns = Object.values(estado.cursos || {}).map((c) => Number(c.numero) || 0);
  return (ns.length ? Math.max(...ns) : 0) + 1;
}

export function crearCurso(lote, datos) {
  const ref = refNueva('cursos');
  const c = { numero: siguienteNumero(), ...datos, alumnos: [], materiales: [], otrosCostos: 0, estado: 'abierto', anulado: false, creadoMs: Date.now(), ...firma() };
  lote.set(ref, c);
  const r = { id: ref.id, ...c };
  if (estado.cursos) estado.cursos[r.id] = r;
  return r;
}

export function actualizarCurso(lote, c, cambios) {
  lote.update(refDoc('cursos', c.id), { ...cambios, ...firma() });
  if (estado.cursos?.[c.id]) Object.assign(estado.cursos[c.id], cambios);
}

export function agregarAlumno(lote, c, cliente, precio = null) {
  const a = { key: nuevaKey(), clienteId: cliente.id, nombre: cliente.nombre, whatsapp: cliente.whatsapp || '', precio, pagos: [], retirado: false, desde: hoyISO() };
  actualizarCurso(lote, c, { alumnos: [...(c.alumnos || []), a] });
  return a;
}

// Un pago de un alumno: se registra como venta del canal Clases.
export function pagarAlumno(lote, c, a, { monto, medio, fecha, boleta }) {
  const v = registrarVenta(lote, {
    lineas: [{ piezaId: null, nombre: `Clases · ${c.nombre}`, cantidad: 1, precio: monto }],
    medio, canal: 'clases', cliente: { id: a.clienteId, nombre: a.nombre }, fecha, hora: '', boleta,
    nota: `${c.nombre} · ${a.nombre}`, cursoId: c.id
  });
  const alumnos = c.alumnos.map((x) => (x.key === a.key ? { ...x, pagos: [...(x.pagos || []), { key: nuevaKey(), fecha, monto, medio, ventaId: v.id }] } : x));
  actualizarCurso(lote, c, { alumnos });
  return v;
}

export function anularPagoAlumno(lote, c, a, pago) {
  anularVenta(lote, { id: pago.ventaId, fecha: pago.fecha, lineas: [{ piezaId: null }] }, 'Pago de clase anulado');
  const alumnos = c.alumnos.map((x) => (x.key === a.key ? { ...x, pagos: x.pagos.map((p) => (p.key === pago.key ? { ...p, anulado: true } : p)) } : x));
  actualizarCurso(lote, c, { alumnos });
}

export function retirarAlumno(lote, c, a) {
  actualizarCurso(lote, c, { alumnos: c.alumnos.map((x) => (x.key === a.key ? { ...x, retirado: true, retiradoEn: hoyISO() } : x)) });
}

// Material usado: sale de bodega con su costo.
export function usarMaterial(lote, c, { insumoId, cantidad, fecha, nota = '' }) {
  const m = agregarMovimiento(lote, { insumoId, cantidad: -cantidad, tipo: 'clase', fecha, ref: { tipo: 'curso', id: c.id }, nota: nota || c.nombre });
  const mat = { key: nuevaKey(), fecha, insumoId, nombre: m.insumoNombre, unidad: m.unidad, cantidad, costo: Math.round(Math.abs(m.valor)), mov: m };
  actualizarCurso(lote, c, { materiales: [...(c.materiales || []), mat] });
}

export function anularMaterial(lote, c, mat) {
  agregarAnulacion(lote, mat.mov, `Material de ${c.nombre} anulado`);
  actualizarCurso(lote, c, { materiales: c.materiales.map((x) => (x.key === mat.key ? { ...x, anulado: true } : x)) });
}

export function actualizarSesion(lote, c, key, cambios) {
  actualizarCurso(lote, c, { sesiones: c.sesiones.map((s) => (s.key === key ? { ...s, ...cambios } : s)) });
}
