// Capa de datos: preparación inicial, escucha de configuración y listas,
// y guardado. Los módulos leen desde `estado` y se suscriben con `alCambiar`.
import {
  db, auth, collection, doc, getDoc, onSnapshot, setDoc, writeBatch, serverTimestamp
} from './firebase.js';
import { SCHEMA_VERSION, APP_VERSION } from './config.js';
import { LISTAS_INICIALES, EMPRESA_INICIAL, COSTEO_INICIAL, slug } from './datos-iniciales.js';

export const estado = {
  empresa: null,
  costeo: null,
  sistema: null,
  listas: {},       // clave → { nombre, descripcion, items[] }
  insumos: {},      // id → insumo (incluye su stock y valor guardados)
  recetas: {},      // id → receta
  piezas: {},       // id → ficha de pieza (con su stock de terminadas)
  horno: null,      // config/horno: energía, precios, capacidad, valor hora
  clientes: {},     // id → cliente (empresas y clientes finales)
  ferias: {},       // id → feria
  ventas: null,     // config/ventas: control de stock, comisiones
  ordenes: {},      // id → orden de venta a empresas
  consignaciones: {}, // id → entrega en consignación
  encargos: {},     // id → encargo de un cliente, con sus abonos
  eventos: {},      // id → evento de la agenda (entregas, clases, quemas…)
  recurrentes: {},  // id → gasto que se repite (luz, arriendo…), con sus períodos registrados
  proveedores: {},  // rut sin puntos → proveedor, con lo aprendido de sus facturas
  listo: false
};

const oyentes = new Set();
export function alCambiar(fn) {
  oyentes.add(fn);
  return () => oyentes.delete(fn);
}
const avisar = () => oyentes.forEach((fn) => { try { fn(estado); } catch (e) { console.error(e); } });

// Marca de auditoría que llevan todos los documentos que se escriben.
export const firma = () => ({
  actualizado: serverTimestamp(),
  actualizadoPor: auth.currentUser?.email || ''
});

// Primera vez: crea configuración y listas con los valores iniciales.
// Requiere conexión. Las veces siguientes no escribe nada.
export async function prepararBase() {
  const ref = doc(db, 'config', 'sistema');
  let snap;
  try {
    snap = await getDoc(ref);
  } catch (e) {
    if (e?.code === 'unavailable') {
      throw new Error('sin-conexion-primera-vez');
    }
    throw e;
  }
  if (snap.exists()) {
    const datos = snap.data();
    // Actualización de estructura: cada versión solo agrega, nunca borra.
    if ((datos.schemaVersion ?? 1) < SCHEMA_VERSION) {
      await setDoc(ref, { schemaVersion: SCHEMA_VERSION, migradoConApp: APP_VERSION, ...firma() }, { merge: true });
      datos.schemaVersion = SCHEMA_VERSION;
    }
    return datos;
  }

  const b = writeBatch(db);
  const f = firma();
  b.set(ref, { schemaVersion: SCHEMA_VERSION, creadoConApp: APP_VERSION, creado: serverTimestamp(), ...f });
  b.set(doc(db, 'config', 'empresa'), { ...EMPRESA_INICIAL, ...f });
  b.set(doc(db, 'config', 'costeo'), { ...COSTEO_INICIAL, ...f });
  Object.entries(LISTAS_INICIALES).forEach(([clave, l], i) => {
    b.set(doc(db, 'listas', clave), { ...l, orden: i, ...f });
  });
  await b.commit();
  return { schemaVersion: SCHEMA_VERSION };
}

let desuscribir = [];
export function escuchar() {
  detener();
  desuscribir.push(onSnapshot(collection(db, 'config'), (qs) => {
    qs.forEach((d) => { estado[d.id] = d.data(); });
    estado.listo = Boolean(estado.empresa && estado.costeo);
    avisar();
  }, errorEscucha));
  desuscribir.push(onSnapshot(collection(db, 'listas'), (qs) => {
    const listas = {};
    qs.forEach((d) => { listas[d.id] = d.data(); });
    estado.listas = listas;
    avisar();
  }, errorEscucha));
  // Insumos y recetas son pocos (decenas o cientos): se escuchan completos.
  // Los movimientos, que crecen todo el tiempo, se consultan solo cuando se miran.
  desuscribir.push(onSnapshot(collection(db, 'insumos'), (qs) => {
    const m = {};
    qs.forEach((d) => { m[d.id] = { id: d.id, ...d.data() }; });
    estado.insumos = m;
    avisar();
  }, errorEscucha));
  desuscribir.push(onSnapshot(collection(db, 'piezas'), (qs) => {
    const m = {};
    qs.forEach((d) => { m[d.id] = { id: d.id, ...d.data() }; });
    estado.piezas = m;
    avisar();
  }, errorEscucha));
  desuscribir.push(onSnapshot(collection(db, 'ferias'), (qs) => {
    const m = {};
    qs.forEach((d) => { m[d.id] = { id: d.id, ...d.data() }; });
    estado.ferias = m;
    avisar();
  }, errorEscucha));
  desuscribir.push(onSnapshot(collection(db, 'clientes'), (qs) => {
    const m = {};
    qs.forEach((d) => { m[d.id] = { id: d.id, ...d.data() }; });
    estado.clientes = m;
    avisar();
  }, errorEscucha));
  desuscribir.push(onSnapshot(collection(db, 'proveedores'), (qs) => {
    const m = {};
    qs.forEach((d) => { m[d.id] = { id: d.id, ...d.data() }; });
    estado.proveedores = m;
    avisar();
  }, errorEscucha));
  // Órdenes, consignaciones, encargos y eventos: son decenas al año, se escuchan completos.
  for (const col of ['ordenes', 'consignaciones', 'encargos', 'eventos', 'recurrentes']) {
    desuscribir.push(onSnapshot(collection(db, col), (qs) => {
      const m = {};
      qs.forEach((d) => { m[d.id] = { id: d.id, ...d.data() }; });
      estado[col] = m;
      avisar();
    }, errorEscucha));
  }
  desuscribir.push(onSnapshot(collection(db, 'recetas'), (qs) => {
    const m = {};
    qs.forEach((d) => { m[d.id] = { id: d.id, ...d.data() }; });
    estado.recetas = m;
    avisar();
  }, errorEscucha));
}

export function detener() {
  desuscribir.forEach((u) => u());
  desuscribir = [];
}

function errorEscucha(e) {
  console.error('Error al escuchar datos', e);
  window.dispatchEvent(new CustomEvent('vs:error-datos', { detail: e }));
}

// Sin señal, Firestore guarda en el equipo y la promesa no se resuelve hasta
// volver a conectarse. Por eso no se espera: se confirma al tiro y solo se
// avisa si el servidor rechaza el cambio (por ejemplo, por las reglas).
export function enviar(promesa, { alGuardar, alFallar } = {}) {
  promesa.catch((e) => {
    console.error(e);
    alFallar?.(e);
  });
  alGuardar?.(navigator.onLine);
}

// ---------- Guardado de configuración ----------
export function guardarEmpresa(datos) {
  return setDoc(doc(db, 'config', 'empresa'), { ...datos, ...firma() }, { merge: true });
}

export function guardarVentas(datos) {
  return setDoc(doc(db, 'config', 'ventas'), { ...datos, ...firma() }, { merge: true });
}

export function guardarHorno(datos) {
  return setDoc(doc(db, 'config', 'horno'), { ...datos, ...firma() }, { merge: true });
}

export function guardarCosteo(datos) {
  return setDoc(doc(db, 'config', 'costeo'), { ...datos, ...firma() }, { merge: true });
}

// ---------- Listas editables ----------
// Ítems activos ordenados, para usar en selectores de otros módulos.
export function itemsActivos(clave) {
  return (estado.listas[clave]?.items || [])
    .filter((i) => i.activo)
    .sort((a, b) => a.orden - b.orden);
}

// Nombre de un ítem por su id (incluye ocultos, para mostrar registros antiguos).
export function nombreItem(clave, id) {
  return estado.listas[clave]?.items.find((i) => i.id === id)?.nombre ?? id;
}

function guardarItems(clave, items) {
  return setDoc(doc(db, 'listas', clave), { items, ...firma() }, { merge: true });
}

const normalizar = (t) => t.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

export function validarNombre(clave, nombre, idActual = null) {
  const n = nombre.trim();
  if (!n) return 'Escribe un nombre.';
  if (n.length > 60) return 'Usa 60 caracteres o menos.';
  const repetido = (estado.listas[clave]?.items || [])
    .find((i) => i.id !== idActual && normalizar(i.nombre) === normalizar(n));
  if (repetido) {
    return repetido.activo
      ? `Ya existe «${repetido.nombre}» en esta lista.`
      : `«${repetido.nombre}» ya existe pero está oculto. Muéstralo en vez de crearlo de nuevo.`;
  }
  return null;
}

export function agregarItem(clave, nombre) {
  const items = [...(estado.listas[clave]?.items || [])];
  let id = slug(nombre);
  const ids = new Set(items.map((i) => i.id));
  let n = 2;
  while (ids.has(id)) id = `${slug(nombre)}-${n++}`;
  const orden = items.reduce((m, i) => Math.max(m, i.orden), -1) + 1;
  items.push({ id, nombre: nombre.trim(), activo: true, orden });
  return guardarItems(clave, items);
}

export function renombrarItem(clave, id, nombre) {
  const items = estado.listas[clave].items.map((i) => (i.id === id ? { ...i, nombre: nombre.trim() } : i));
  return guardarItems(clave, items);
}

export function cambiarVisibilidad(clave, id, activo) {
  const items = estado.listas[clave].items.map((i) => {
    if (i.id !== id) return i;
    if (i.fijo && !activo) throw new Error('fijo');
    return { ...i, activo };
  });
  return guardarItems(clave, items);
}

export function moverItem(clave, id, direccion, incluirOcultos = false) {
  const items = [...estado.listas[clave].items].sort((a, b) => a.orden - b.orden);
  const pos = items.findIndex((i) => i.id === id);
  let destino = pos + direccion;
  while (destino >= 0 && destino < items.length && !incluirOcultos && !items[destino].activo) destino += direccion;
  if (destino < 0 || destino >= items.length) return Promise.resolve();
  [items[pos], items[destino]] = [items[destino], items[pos]];
  return guardarItems(clave, items.map((i, k) => ({ ...i, orden: k })));
}
