// Lógica de gastos: importación de XML, duplicados, aprendizaje por proveedor,
// clasificación de líneas (insumo que suma stock o gasto general) y alertas de precio.
import { estado, firma } from './datos.js';
import { limpiarRut, formatearRut, hoyISO } from './ui.js';
import {
  agregarMovimiento, agregarAnulacion, nuevoLote, refNueva, refDoc, documentosDonde, costoActual
} from './stock.js';
import { leerArchivoXML, leerDTEs, factorProrrateo, esBoleta, esExenta, signoDoc, TIPOS_DTE } from './xml-sii.js';

export const ITEM_INSUMOS = 'materia-prima-e-insumos';
export const AREA_DEFECTO = 'produccion-propia';
const UMBRAL_ALERTA = 0.10; // 10 %: variación de precio que genera alerta
const VECES_PARA_AUTO = 2;  // clasificaciones iguales para clasificar sola la próxima

export const claveItem = (nombre) => String(nombre || '')
  .toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 60) || 'item';

export const mesDe = (fecha) => (fecha || hoyISO()).slice(0, 7);

const sumarDias = (iso, dias) => {
  const [y, m, d] = iso.split('-').map(Number);
  const f = new Date(y, m - 1, d + dias);
  return `${f.getFullYear()}-${String(f.getMonth() + 1).padStart(2, '0')}-${String(f.getDate()).padStart(2, '0')}`;
};
export const diasEntre = (a, b) => {
  const [y1, m1, d1] = a.split('-').map(Number);
  const [y2, m2, d2] = b.split('-').map(Number);
  return Math.round((new Date(y2, m2 - 1, d2) - new Date(y1, m1 - 1, d1)) / 86400000);
};

// ---------------------------------------------------------------- Montos
// Calcula los totales de un gasto ingresado a mano a partir de sus líneas.
export function totalesManual(tipoDoc, lineas) {
  const suma = lineas.reduce((s, l) => s + (l.monto || 0), 0);
  const t = Number(tipoDoc);
  if (esExenta(t)) return { neto: 0, exento: suma, iva: 0, total: suma };
  if (esBoleta(t) || t === 0) {
    const neto = t === 0 ? suma : Math.round(suma / 1.19);
    return { neto, exento: 0, iva: t === 0 ? 0 : suma - neto, total: suma };
  }
  const iva = Math.round(suma * 0.19);
  return { neto: suma, exento: 0, iva, total: suma + iva };
}

// Costo para la empresa de cada línea: neto en facturas (el IVA es crédito
// fiscal), todo lo pagado en boletas. Las notas de crédito restan.
export function costosLineas(gasto) {
  const factor = gasto.origen === 'xml' ? factorProrrateo(gasto) : 1;
  const signo = signoDoc(gasto.tipoDoc);
  return gasto.lineas.map((l) => signo * (l.monto || 0) * factor);
}

// IVA que se puede usar como crédito fiscal (solo facturas).
export const ivaCredito = (g) => (esBoleta(g.tipoDoc) || Number(g.tipoDoc) === 0 ? 0 : signoDoc(g.tipoDoc) * (g.iva || 0));

// ---------------------------------------------------------------- Aprendizaje
// Sugerencia para una línea según lo que se hizo antes con ese proveedor.
export function sugerencia(rutLimpio, nombreLinea) {
  const prov = estado.proveedores[rutLimpio];
  if (!prov) return null;
  const item = prov.items?.[claveItem(nombreLinea)];
  if (item) {
    if (item.clase === 'insumo' && !estado.insumos[item.insumoId]) return null;
    return { ...item, origen: 'item' };
  }
  if (prov.defecto) return { clase: 'gasto', itemGasto: prov.defecto.itemGasto, area: prov.defecto.area, veces: 0, origen: 'proveedor' };
  return null;
}

// Guarda lo aprendido de un gasto clasificado (en el mismo lote).
function aprender(lote, gasto, lineas) {
  if (!gasto.rutLimpio) return;
  const prev = estado.proveedores[gasto.rutLimpio] || {};
  const items = { ...(prev.items || {}) };
  lineas.forEach((l) => {
    const k = claveItem(l.nombre);
    const ant = items[k];
    const nuevo = l.clase === 'insumo'
      ? { clase: 'insumo', insumoId: l.insumoId, factor: l.factor, formato: l.formato || '' }
      : { clase: 'gasto', itemGasto: l.itemGasto, area: l.area };
    const igual = ant && ant.clase === nuevo.clase && (nuevo.clase === 'insumo'
      ? ant.insumoId === nuevo.insumoId && ant.factor === nuevo.factor
      : ant.itemGasto === nuevo.itemGasto && ant.area === nuevo.area);
    items[k] = { ...nuevo, nombre: l.nombre, veces: igual ? (ant.veces || 1) + 1 : 1 };
  });
  const gastoLinea = [...lineas].reverse().find((l) => l.clase === 'gasto');
  lote.set(refDoc('proveedores', gasto.rutLimpio), {
    rut: gasto.rutProveedor,
    nombre: gasto.proveedor,
    giro: gasto.giroProveedor || prev.giro || '',
    items,
    defecto: gastoLinea ? { itemGasto: gastoLinea.itemGasto, area: gastoLinea.area } : (prev.defecto || null),
    documentos: (prev.documentos || 0) + 1,
    ultimaFecha: gasto.fecha,
    ...firma()
  }, { merge: true });
  estado.proveedores[gasto.rutLimpio] = { ...prev, items };
}

// ---------------------------------------------------------------- Clasificar
// Valida y completa las líneas: cantidad que entra a bodega y costo unitario.
export function prepararLineas(gasto, lineas) {
  const costos = costosLineas({ ...gasto, lineas });
  return lineas.map((l, i) => {
    const costo = costos[i];
    if (l.clase === 'insumo') {
      const cantidadInsumo = (l.cantidad || 0) * (l.factor || 0);
      return { ...l, costo, cantidadInsumo, costoUnitario: cantidadInsumo ? Math.abs(costo) / cantidadInsumo : 0 };
    }
    return { ...l, costo };
  });
}

export function validarLineas(gasto, lineas) {
  if (!lineas.length) return 'El gasto no tiene líneas.';
  for (const [i, l] of lineas.entries()) {
    const nom = l.nombre || `la línea ${i + 1}`;
    if (!l.clase) return `Falta clasificar «${nom}»: ¿es un insumo que entra a bodega o un gasto general?`;
    if (l.clase === 'insumo') {
      if (signoDoc(gasto.tipoDoc) < 0) return `Las notas de crédito se clasifican como gasto. Si devolviste material, registra la salida con un ajuste en Inventario.`;
      if (!estado.insumos[l.insumoId]) return `Elige a qué insumo corresponde «${nom}».`;
      if (!(l.factor > 0)) return `Indica cuántas unidades del insumo trae «${nom}».`;
      if (!(l.cantidad > 0)) return `La cantidad de «${nom}» debe ser mayor que cero.`;
    } else {
      if (!l.itemGasto) return `Elige el ítem de gasto de «${nom}».`;
      if (!l.area) return `Elige el área del negocio de «${nom}».`;
    }
  }
  return null;
}

// Aplica la clasificación: movimientos de stock, alertas de precio y aprendizaje.
// Si el gasto ya estaba clasificado, primero revierte su stock anterior.
export function aplicarClasificacion(lote, gasto, lineasEntrada, { automatico = false } = {}) {
  const lineas = prepararLineas(gasto, lineasEntrada);
  if (gasto.movs?.length) gasto.movs.forEach((m) => agregarAnulacion(lote, m, `Reclasificación de ${TIPOS_DTE[gasto.tipoDoc] || 'gasto'} ${gasto.folio || ''}`.trim()));
  const ref = { tipo: 'gasto', id: gasto.id };
  const movs = [];
  const alertas = [];
  lineas.filter((l) => l.clase === 'insumo').forEach((l) => {
    const ins = estado.insumos[l.insumoId];
    const anterior = ins.costoUltimo ?? ins.costoRef ?? null;
    if (anterior && l.costoUnitario) {
      const variacion = (l.costoUnitario - anterior) / anterior;
      if (Math.abs(variacion) >= UMBRAL_ALERTA) alertas.push({ ins, anterior, nuevo: l.costoUnitario, variacion });
    }
    movs.push(agregarMovimiento(lote, {
      insumoId: ins.id, cantidad: l.cantidadInsumo, tipo: 'compra', fecha: gasto.fecha,
      costoUnitario: l.costoUnitario, actualizaCosto: true, ref,
      nota: `${gasto.proveedor || ''} · ${TIPOS_DTE[gasto.tipoDoc] || ''} ${gasto.folio || ''}`.trim()
    }));
  });
  alertas.forEach((a) => {
    const recetas = Object.values(estado.recetas)
      .filter((r) => !r.archivado && (r.ingredientes || []).some((i) => i.insumoId === a.ins.id))
      .map((r) => r.nombre);
    lote.set(refNueva('alertasPrecio'), {
      insumoId: a.ins.id, insumoNombre: a.ins.nombre, unidad: a.ins.unidad,
      anterior: a.anterior, nuevo: a.nuevo, variacion: a.variacion,
      proveedor: gasto.proveedor || '', gastoId: gasto.id, tipoDoc: gasto.tipoDoc, folio: gasto.folio || '',
      fecha: gasto.fecha, recetas, visto: false, creadoMs: Date.now(), ...firma()
    });
  });
  aprender(lote, gasto, lineas);
  return {
    lineas: lineas.map(({ ...l }) => l),
    movs,
    estado: 'clasificado',
    automatico,
    revisado: !automatico,
    alertas: alertas.length
  };
}

export function anularGasto(lote, gasto, motivo = '') {
  (gasto.movs || []).forEach((m) => agregarAnulacion(lote, m, `Anulación de ${TIPOS_DTE[gasto.tipoDoc] || 'gasto'} ${gasto.folio || ''}`.trim()));
  lote.update(refDoc('gastos', gasto.id), { anulado: true, motivoAnulacion: motivo, anuladoEn: Date.now(), movs: [], ...firma() });
}

// ---------------------------------------------------------------- Duplicados
// Mismo RUT + tipo + folio = ya ingresado. Mismo RUT y total, fecha cercana
// y otro folio = posible duplicado (aviso, no bloquea).
export async function buscarDuplicados(rutLimpio, tipoDoc, folio, total, fecha, idActual = null) {
  if (!rutLimpio) return { mismo: null, posible: null };
  const previos = (await documentosDonde('gastos', 'rutLimpio', '==', rutLimpio)).filter((g) => !g.anulado && g.id !== idActual);
  const mismo = previos.find((g) => Number(g.tipoDoc) === Number(tipoDoc) && String(g.folio) === String(folio)) || null;
  const posible = mismo ? null : previos.find((g) => g.total === total && String(g.folio) !== String(folio) && Math.abs(diasEntre(g.fecha, fecha)) <= 7) || null;
  return { mismo, posible };
}

// ---------------------------------------------------------------- Importar XML
// Lee los archivos y crea un gasto «por clasificar» por cada documento nuevo.
// Si todas las líneas de un proveedor ya se clasificaron igual dos veces,
// el documento se clasifica solo y queda marcado para revisar.
export async function importarArchivos(archivos) {
  const r = { nuevos: [], repetidos: [], noGasto: [], errores: [], automaticos: 0, posibles: 0, promesa: Promise.resolve() };
  const rutEmpresa = limpiarRut(estado.empresa?.rut || '');
  const vistos = new Set();
  for (const archivo of archivos) {
    let dtes;
    try {
      dtes = leerDTEs(await leerArchivoXML(archivo), archivo.name);
    } catch (e) {
      r.errores.push(e.message || `No se pudo leer «${archivo.name}».`);
      continue;
    }
    for (const dte of dtes) {
      const rutLimpio = limpiarRut(dte.rutProveedor);
      const etiqueta = `${TIPOS_DTE[dte.tipoDoc] || `Documento ${dte.tipoDoc}`} ${dte.folio} de ${dte.proveedor}`;
      if (rutEmpresa && rutLimpio === rutEmpresa) { r.noGasto.push(`${etiqueta}: lo emitió tu empresa, es una venta. Cárgalo en Cobranza → Facturas.`); continue; }
      if (Number(dte.tipoDoc) === 52) { r.noGasto.push(`${etiqueta}: las guías de despacho no son gasto; se registra la factura.`); continue; }
      const clave = `${rutLimpio}-${dte.tipoDoc}-${dte.folio}`;
      if (vistos.has(clave)) continue;
      vistos.add(clave);
      const { mismo, posible } = await buscarDuplicados(rutLimpio, dte.tipoDoc, dte.folio, dte.total, dte.fecha);
      if (mismo) { r.repetidos.push(etiqueta); continue; }
      const ajenoReceptor = rutEmpresa && dte.rutReceptor && limpiarRut(dte.rutReceptor) !== rutEmpresa;
      r.nuevos.push({ dte, rutLimpio, posible, ajenoReceptor });
    }
  }
  if (!r.nuevos.length) return r;

  const lote = nuevoLote();
  for (const { dte, rutLimpio, posible, ajenoReceptor } of r.nuevos) {
    const gRef = refNueva('gastos');
    const credito = Number(dte.formaPago) === 2;
    const gasto = {
      id: gRef.id,
      origen: 'xml',
      tipoDoc: dte.tipoDoc,
      folio: dte.folio,
      fecha: dte.fecha,
      mes: mesDe(dte.fecha),
      rutProveedor: formatearRut(dte.rutProveedor),
      rutLimpio,
      proveedor: dte.proveedor,
      giroProveedor: dte.giroProveedor,
      rutReceptor: dte.rutReceptor,
      neto: dte.neto, exento: dte.exento, iva: dte.iva, otrosImpuestos: dte.otrosImpuestos, total: dte.total,
      lineas: dte.lineas.map((l) => {
        const s = sugerencia(rutLimpio, l.nombre);
        return {
          n: l.n, nombre: l.nombre, descripcion: l.descripcion, codigo: l.codigo, cantidad: l.cantidad,
          unidadXml: l.unidadXml, precio: l.precio, monto: l.monto, exenta: l.exenta,
          clase: s?.clase || null,
          insumoId: s?.clase === 'insumo' ? s.insumoId : null,
          factor: s?.clase === 'insumo' ? s.factor : null,
          formato: s?.formato || '',
          itemGasto: s?.clase === 'gasto' ? s.itemGasto : null,
          area: s?.clase === 'gasto' ? s.area : null,
          sugerida: Boolean(s),
          confiable: Boolean(s && s.origen === 'item' && (s.veces || 0) >= VECES_PARA_AUTO)
        };
      }),
      globales: dte.globales,
      referencias: dte.referencias,
      formaPago: dte.formaPago,
      pagoEstado: credito ? 'por-pagar' : 'pagado',
      pago: credito
        ? { vencimiento: dte.vencimiento || sumarDias(dte.fecha, 30) }
        : { fecha: dte.fecha, medio: '' },
      estado: 'por-clasificar',
      posibleDuplicado: posible ? { id: posible.id, folio: posible.folio, fecha: posible.fecha } : null,
      receptorDistinto: Boolean(ajenoReceptor),
      archivo: dte.archivo,
      anulado: false,
      notas: '',
      creadoMs: Date.now()
    };
    if (posible) r.posibles++;
    let datos = { ...gasto };
    if (!posible && !ajenoReceptor && gasto.lineas.length && gasto.lineas.every((l) => l.confiable)) {
      const res = aplicarClasificacion(lote, gasto, gasto.lineas, { automatico: true });
      datos = { ...datos, ...res };
      r.automaticos++;
    }
    delete datos.id;
    lote.set(gRef, { ...datos, ...firma() });
  }
  // No se espera la escritura: sin señal quedaría esperando hasta reconectar.
  r.promesa = lote.commit();
  return r;
}
