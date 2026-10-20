// Lógica de stock y costos de insumos.
//
// Regla del sistema: el stock es la suma de movimientos. Cada ingreso o salida
// queda como un documento en `movimientos`. Para no leer todos los movimientos
// cada vez, el insumo guarda además su `stock` y su `valorStock` (lo que vale
// lo que hay en bodega), y ambos se actualizan con `increment` en el mismo lote
// de escritura que el movimiento. `increment` funciona sin señal.
import {
  db, collection, doc, writeBatch, serverTimestamp, increment,
  query, where, orderBy, limit, getDocs, onSnapshot
} from './firebase.js';
import { estado, firma } from './datos.js';

// ---------- Unidades ----------
// Solo las unidades de masa se pueden usar en recetas por porcentaje.
const MASA = { g: 1, kg: 1000 };
export const esMasa = (unidad) => unidad in MASA;
// Convierte una cantidad en gramos a la unidad del insumo.
export const desdeGramos = (g, unidad) => g / MASA[unidad];
export const aGramos = (cant, unidad) => cant * MASA[unidad];

// ---------- Costos ----------
export const costoPromedio = (ins) =>
  ins.stock > 0 && ins.valorStock > 0 ? ins.valorStock / ins.stock : null;

// Costo por unidad según el método elegido en Configuración.
// Si no hay compras ni stock, usa el costo de referencia.
export function costoActual(ins) {
  if (!ins) return 0;
  const metodo = estado.costeo?.metodo || 'ultima';
  const prom = costoPromedio(ins);
  if (metodo === 'promedio' && prom != null) return prom;
  return ins.costoUltimo ?? prom ?? ins.costoRef ?? 0;
}

// Valor con que sale de bodega una cantidad: siempre a costo promedio, para
// que el valor de lo que queda en bodega cuadre con lo que realmente costó.
export function valorSalida(ins, cant) {
  const prom = costoPromedio(ins);
  const unit = prom ?? ins.costoUltimo ?? ins.costoRef ?? 0;
  return cant * unit;
}

export const insumosActivos = () =>
  Object.values(estado.insumos)
    .filter((i) => !i.archivado)
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));

export const bajoMinimo = (ins) =>
  !ins.archivado && ins.stockMinimo > 0 && (ins.stock || 0) < ins.stockMinimo;

// ---------- Movimientos ----------
export const TIPOS_MOV = {
  inicial: 'Inventario inicial',
  ajuste: 'Ajuste',
  conteo: 'Conteo físico',
  preparacion: 'Preparación de receta',
  compra: 'Compra',
  produccion: 'Producción de piezas',
  reciclaje: 'Arcilla reciclada',
  clase: 'Usado en clases',
  anulacion: 'Anulación'
};

// Agrega a un lote de escritura un movimiento y la actualización del insumo.
// `cantidad` va con signo: positiva entra a bodega, negativa sale.
// `costoUnitario` solo se usa en ingresos; las salidas salen a costo promedio.
// Devuelve los datos del movimiento (con su id), para poder anularlo después.
export function agregarMovimiento(lote, {
  insumoId, cantidad, tipo, fecha, costoUnitario = null, actualizaCosto = false,
  motivo = null, nota = '', ref = null
}) {
  const ins = estado.insumos[insumoId];
  if (!ins) throw new Error(`Insumo ${insumoId} no existe`);
  const entra = cantidad > 0;
  const valor = entra ? cantidad * (costoUnitario ?? costoActual(ins)) : -valorSalida(ins, -cantidad);
  const mref = doc(collection(db, 'movimientos'));
  const costoU = cantidad !== 0 ? Math.abs(valor / cantidad) : 0;
  lote.set(mref, {
    fecha,
    creadoMs: Date.now(),
    creado: serverTimestamp(),
    tipo,
    insumoId,
    insumoNombre: ins.nombre,
    unidad: ins.unidad,
    cantidad,
    costoUnitario: costoU,
    valor,
    motivo,
    nota,
    ref,
    anulado: false,
    ...firma()
  });
  const cambios = { stock: increment(cantidad), valorStock: increment(valor), conMovimientos: true, ...firma() };
  if (entra && actualizaCosto && costoUnitario != null) {
    cambios.costoUltimo = costoUnitario;
    cambios.fechaUltimoCosto = fecha;
  }
  lote.update(doc(db, 'insumos', insumoId), cambios);
  // Para que varios movimientos del mismo insumo en un lote calculen bien.
  ins.stock = (ins.stock || 0) + cantidad;
  ins.valorStock = (ins.valorStock || 0) + valor;
  return { id: mref.id, fecha, insumoId, insumoNombre: ins.nombre, unidad: ins.unidad, cantidad, costoUnitario: costoU, valor };
}

// Anula un movimiento: crea el movimiento contrario y marca el original.
// No borra nada; el historial muestra ambos.
export function agregarAnulacion(lote, mov, motivoAnulacion = '') {
  const contrario = doc(collection(db, 'movimientos'));
  lote.set(contrario, {
    fecha: mov.fecha,
    creadoMs: Date.now(),
    creado: serverTimestamp(),
    tipo: 'anulacion',
    insumoId: mov.insumoId,
    insumoNombre: mov.insumoNombre,
    unidad: mov.unidad,
    cantidad: -mov.cantidad,
    costoUnitario: mov.costoUnitario,
    valor: -mov.valor,
    motivo: null,
    nota: motivoAnulacion,
    ref: { tipo: 'movimiento', id: mov.id },
    anulado: false,
    ...firma()
  });
  lote.update(doc(db, 'movimientos', mov.id), {
    anulado: true, anuladoEn: serverTimestamp(), anulacionId: contrario.id, ...firma()
  });
  lote.update(doc(db, 'insumos', mov.insumoId), {
    stock: increment(-mov.cantidad), valorStock: increment(-mov.valor), ...firma()
  });
  const ins = estado.insumos[mov.insumoId];
  if (ins) { ins.stock = (ins.stock || 0) - mov.cantidad; ins.valorStock = (ins.valorStock || 0) - mov.valor; }
}

export const nuevoLote = () => writeBatch(db);

// Historial de un insumo (consulta puntual, no queda escuchando).
export async function movimientosDeInsumo(insumoId) {
  const qs = await getDocs(query(collection(db, 'movimientos'), where('insumoId', '==', insumoId)));
  const lista = [];
  qs.forEach((d) => lista.push({ id: d.id, ...d.data() }));
  return lista.sort((a, b) => (b.fecha.localeCompare(a.fecha)) || (b.creadoMs - a.creadoMs));
}

export async function ultimosMovimientos(n = 50) {
  const qs = await getDocs(query(collection(db, 'movimientos'), orderBy('creadoMs', 'desc'), limit(n)));
  const lista = [];
  qs.forEach((d) => lista.push({ id: d.id, ...d.data() }));
  return lista;
}

export async function documentosPorCampo(coleccion, campo, valor) {
  const qs = await getDocs(query(collection(db, coleccion), where(campo, '==', valor)));
  const lista = [];
  qs.forEach((d) => lista.push({ id: d.id, ...d.data() }));
  return lista;
}

export const refNueva = (coleccion) => doc(collection(db, coleccion));
export const refDoc = (coleccion, id) => doc(db, coleccion, id);

// Escucha en vivo los documentos de una colección que cumplen campo == valor
// (o campo op valor). Devuelve la función para dejar de escuchar.
export function escucharDonde(coleccion, campo, op, valor, alRecibir) {
  return onSnapshot(query(collection(db, coleccion), where(campo, op, valor)), (qs) => {
    const lista = [];
    qs.forEach((d) => lista.push({ id: d.id, ...d.data() }));
    alRecibir(lista);
  }, (e) => console.error('Error al escuchar', coleccion, e));
}

export async function documentosDonde(coleccion, campo, op, valor) {
  const qs = await getDocs(query(collection(db, coleccion), where(campo, op, valor)));
  const lista = [];
  qs.forEach((d) => lista.push({ id: d.id, ...d.data() }));
  return lista;
}

export async function ultimosDocumentos(coleccion, n = 50) {
  const qs = await getDocs(query(collection(db, coleccion), orderBy('creadoMs', 'desc'), limit(n)));
  const lista = [];
  qs.forEach((d) => lista.push({ id: d.id, ...d.data() }));
  return lista;
}
