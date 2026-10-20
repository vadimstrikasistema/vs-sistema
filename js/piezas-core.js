// Lógica de piezas: costo teórico de una ficha, lotes que avanzan por etapas
// con mermas, quemas cuyo costo se reparte según el tamaño de cada pieza,
// y stock de piezas terminadas (primera y segunda).
import { estado, firma } from './datos.js';
import {
  costoActual, valorSalida, aGramos, desdeGramos, agregarMovimiento, agregarAnulacion,
  refNueva, refDoc
} from './stock.js';
import { db, serverTimestamp, increment, doc, collection } from './firebase.js';

// ---------------------------------------------------------------- Tamaños y horno
export const TAMANOS = {
  S: { nombre: 'S · chica', puntos: 1, ejemplo: 'taza de café, cuenco' },
  M: { nombre: 'M · mediana', puntos: 2, ejemplo: 'taza grande, plato de postre' },
  L: { nombre: 'L · grande', puntos: 4, ejemplo: 'plato de fondo, florero' },
  XL: { nombre: 'XL · muy grande', puntos: 8, ejemplo: 'fuente, jarra, lámpara' }
};
export const puntosDe = (tam) => TAMANOS[tam]?.puntos ?? 1;

// Valores de partida. Vadim tiene tres hornos eléctricos; su promedio
// medido es 278 kWh por quema de bizcocho y 558 kWh por quema de esmalte.
export const HORNO_INICIAL = {
  energia: 'electrico',      // electrico | gas
  precioKwh: 180,            // $ por kWh, de la boleta de luz
  hornos: [
    { id: 'h1', nombre: 'Horno 1', kwhBizcocho: 278, kwhEsmalte: 558, capacidadPuntos: 40 },
    { id: 'h2', nombre: 'Horno 2', kwhBizcocho: 278, kwhEsmalte: 558, capacidadPuntos: 40 },
    { id: 'h3', nombre: 'Horno 3', kwhBizcocho: 278, kwhEsmalte: 558, capacidadPuntos: 40 }
  ],
  precioGasKg: 2000,         // $ por kg de gas
  gasKgBizcocho: 6,
  gasKgEsmalte: 8,
  valorHora: 0,              // $ por hora de trabajo
  reciclaArcilla: true
};
export const horno = () => {
  const h = { ...HORNO_INICIAL, ...(estado.horno || {}) };
  if (!Array.isArray(h.hornos) || !h.hornos.length) h.hornos = HORNO_INICIAL.hornos;
  return h;
};
export const hornoPorId = (id) => horno().hornos.find((x) => x.id === id) || horno().hornos[0];

// Consumo típico de un horno para un tipo de quema.
export const kwhTipico = (hornoId, tipo) => {
  const x = hornoPorId(hornoId);
  return tipo === 'bizcocho' ? x.kwhBizcocho || 0 : x.kwhEsmalte || 0;
};

// Costo de energía estimado de una quema típica en ese horno.
export function costoQuemaEstimado(tipo, hornoId = null) {
  const h = horno();
  if (h.energia === 'gas') return (tipo === 'bizcocho' ? h.gasKgBizcocho : h.gasKgEsmalte) * h.precioGasKg;
  return kwhTipico(hornoId, tipo) * h.precioKwh;
}

// Costo de las dos quemas por punto, promediando los hornos: sirve para el
// costo estimado de una ficha, que no sabe en qué horno se va a cocer.
export function costoPorPunto(conEsmalte = true) {
  const hs = horno().hornos.filter((x) => x.capacidadPuntos > 0);
  if (!hs.length) return 0;
  return hs.reduce((s, x) => s + (costoQuemaEstimado('bizcocho', x.id) + (conEsmalte ? costoQuemaEstimado('esmalte', x.id) : 0)) / x.capacidadPuntos, 0) / hs.length;
}

// kWh y costo de energía de una quema registrada.
export function kwhEnergia(e) {
  if (!e) return 0;
  if (e.modo === 'promedio') return e.kwh ?? kwhTipico(e.hornoId, e.tipo);
  if (e.modo === 'remarcador') return Math.max(0, (e.fin || 0) - (e.inicio || 0));
  if (e.modo === 'kwh') return e.kwh || 0;
  return 0;
}
export function costoEnergia(e) {
  if (!e) return 0;
  if (e.modo === 'directo') return e.costo || 0;
  if (e.modo === 'gas') return (e.gasKg || 0) * (e.precioGasKg ?? horno().precioGasKg);
  return kwhEnergia(e) * (e.precioKwh ?? horno().precioKwh);
}

// Valor de venta de las piezas (precio con IVA de la ficha).
export function valorVenta(piezaId, primera, segunda = 0) {
  const f = estado.piezas[piezaId];
  if (!f?.precioB2C) return 0;
  return primera * f.precioB2C + segunda * (f.precioSegunda || f.precioB2C);
}

// ---------------------------------------------------------------- Etapas
export const ETAPAS = {
  modelado: { nombre: 'Modelado y secado', corto: 'secando', orden: 1 },
  seco: { nombre: 'Seco, espera bizcocho', corto: 'esperando bizcocho', orden: 2 },
  bizcochado: { nombre: 'Bizcochado, espera esmalte', corto: 'esperando esmalte', orden: 3 },
  esmaltado: { nombre: 'Esmaltado, espera quema', corto: 'esperando quema de esmalte', orden: 4 },
  terminado: { nombre: 'Terminado', corto: 'terminado', orden: 5 }
};

// ---------------------------------------------------------------- Costo de una ficha
// Costo por pieza con los costos actuales: pasta, esmaltes, otros insumos,
// horas de trabajo y la parte de dos quemas según su tamaño.
export function costoFicha(f) {
  const h = horno();
  const pasta = estado.insumos[f.pastaId];
  const cPasta = pasta && f.pastaKg ? valorUnitario(pasta, f.pastaKg, 'kg') : 0;
  const cEsm = (f.esmaltes || []).reduce((s, e) => {
    const ins = estado.insumos[e.insumoId];
    return s + (ins && e.gramos ? valorUnitario(ins, e.gramos, 'g') : 0);
  }, 0);
  const cOtros = (f.otros || []).reduce((s, o) => {
    const ins = estado.insumos[o.insumoId];
    return s + (ins && o.cantidad ? costoActual(ins) * o.cantidad : 0);
  }, 0);
  const cHoras = (f.horas || 0) * (h.valorHora || 0);
  const cQuemas = costoPorPunto(!f.sinEsmalte) * puntosDe(f.tamano);
  const total = cPasta + cEsm + cOtros + cHoras + cQuemas;
  return { pasta: cPasta, esmalte: cEsm, otros: cOtros, horas: cHoras, quemas: cQuemas, total };
}

// Costo de una cantidad expresada en kg o g de un insumo medido en su propia unidad.
function valorUnitario(ins, cant, enUnidad) {
  const c = costoActual(ins);
  if (ins.unidad === enUnidad) return c * cant;
  if (['g', 'kg'].includes(ins.unidad) && ['g', 'kg'].includes(enUnidad)) {
    return c * desdeGramos(aGramos(cant, enUnidad), ins.unidad);
  }
  return c * cant;
}
// Cantidad en la unidad del insumo.
export function enUnidadDe(ins, cant, enUnidad) {
  if (ins.unidad === enUnidad) return cant;
  if (['g', 'kg'].includes(ins.unidad) && ['g', 'kg'].includes(enUnidad)) return desdeGramos(aGramos(cant, enUnidad), ins.unidad);
  return cant;
}

export const precioNeto = (f) => (f.precioB2C ? f.precioB2C / 1.19 : 0);
export const margen = (precioNetoV, costo) => (precioNetoV > 0 ? (precioNetoV - costo) / precioNetoV : null);

// ---------------------------------------------------------------- Movimientos de piezas
// Igual que los insumos: cada entrada o salida de piezas terminadas es un
// movimiento, y la ficha guarda `stock`, `stockSegunda` y `valorStock`.
export function movimientoPieza(lote, { piezaId, calidad = 'primera', cantidad, costoUnitario = null, tipo, fecha, motivo = null, nota = '', ref = null }) {
  const p = estado.piezas[piezaId];
  const total = (p.stock || 0) + (p.stockSegunda || 0);
  const prom = total > 0 && p.valorStock > 0 ? p.valorStock / total : (p.costoUltimo || 0);
  const unit = cantidad > 0 ? (costoUnitario ?? p.costoUltimo ?? 0) : prom;
  const valor = cantidad * unit;
  const mref = refNueva('movPiezas');
  lote.set(mref, {
    fecha, creadoMs: Date.now(), creado: serverTimestamp(), tipo, piezaId, piezaNombre: p.nombre, calidad,
    cantidad, costoUnitario: unit, valor, motivo, nota, ref, anulado: false, ...firma()
  });
  const campo = calidad === 'segunda' ? 'stockSegunda' : 'stock';
  const cambios = { [campo]: increment(cantidad), valorStock: increment(valor), ...firma() };
  if (cantidad > 0 && costoUnitario != null) cambios.costoUltimo = costoUnitario;
  if (p.tipo === 'unica' && cantidad > 0) cambios.estadoUnica = 'disponible';
  if (p.tipo === 'unica' && cantidad < 0 && (p.stock || 0) + (p.stockSegunda || 0) + cantidad <= 0) cambios.estadoUnica = 'sin-stock';
  lote.update(refDoc('piezas', piezaId), cambios);
  p[campo] = (p[campo] || 0) + cantidad;
  p.valorStock = (p.valorStock || 0) + valor;
  return { id: mref.id, piezaId, calidad, cantidad, valor };
}

// ---------------------------------------------------------------- Lotes
export function costoLote(l) {
  return (l.costoPasta || 0) + (l.costoEsmalte || 0) + (l.costoOtros || 0) + (l.costoHoras || 0) + (l.costoQuemas || 0) - (l.creditoReciclaje || 0);
}

// Crea un lote: descuenta la pasta y anota las horas de trabajo.
export function crearLote(lote, { ficha, cantidad, fecha, nota = '' }) {
  const lRef = refNueva('lotes');
  const ref = { tipo: 'lote', id: lRef.id };
  const movs = [];
  let costoPasta = 0;
  const pasta = estado.insumos[ficha.pastaId];
  if (pasta && ficha.pastaKg) {
    const cant = enUnidadDe(pasta, ficha.pastaKg * cantidad, 'kg');
    costoPasta = valorSalida(pasta, cant);
    movs.push(agregarMovimiento(lote, { insumoId: pasta.id, cantidad: -cant, tipo: 'produccion', fecha, ref, nota: `Lote de ${cantidad} × ${ficha.nombre}` }));
  }
  const costoHoras = (ficha.horas || 0) * cantidad * (horno().valorHora || 0);
  const datos = {
    piezaId: ficha.id, piezaNombre: ficha.nombre, tamano: ficha.tamano, puntosPieza: puntosDe(ficha.tamano),
    cantidadInicial: cantidad, cantidadActual: cantidad, fechaInicio: fecha, etapa: 'modelado', estado: 'en-proceso',
    costoPasta, costoEsmalte: 0, costoOtros: 0, costoHoras, costoQuemas: 0, creditoReciclaje: 0,
    pastaKgPieza: ficha.pastaKg || 0, pastaId: ficha.pastaId || null,
    historial: [{ etapa: 'modelado', fecha, entran: cantidad, salen: cantidad, merma: 0, nota }],
    movs, primera: 0, segunda: 0, merma: 0, anulado: false, creadoMs: Date.now(), ...firma()
  };
  lote.set(lRef, datos);
  return { id: lRef.id, ...datos };
}

// Secado: cuántas quedaron bien; las grietas se pueden reciclar a la bodega de pasta.
export function registrarSecado(lote, l, { buenas, motivo, recicla, fecha }) {
  const merma = l.cantidadActual - buenas;
  const cambios = {
    cantidadActual: buenas, etapa: buenas > 0 ? 'seco' : 'terminado', merma: (l.merma || 0) + merma,
    historial: [...l.historial, { etapa: 'secado', fecha, entran: l.cantidadActual, salen: buenas, merma, motivo: merma ? motivo : null, recicla: Boolean(recicla && merma) }],
    ...firma()
  };
  const movs = [...(l.movs || [])];
  if (merma > 0 && recicla && l.pastaId && estado.insumos[l.pastaId] && l.pastaKgPieza) {
    const pasta = estado.insumos[l.pastaId];
    const cant = enUnidadDe(pasta, l.pastaKgPieza * merma, 'kg');
    const unit = l.costoPasta / enUnidadDe(pasta, l.pastaKgPieza * l.cantidadInicial, 'kg');
    movs.push(agregarMovimiento(lote, {
      insumoId: pasta.id, cantidad: cant, tipo: 'reciclaje', fecha, costoUnitario: unit, ref: { tipo: 'lote', id: l.id },
      nota: `Recuperada de ${merma} ${l.piezaNombre} agrietadas`
    }));
    cambios.creditoReciclaje = (l.creditoReciclaje || 0) + cant * unit;
  }
  cambios.movs = movs;
  if (buenas === 0) Object.assign(cambios, { estado: 'terminado', fechaFin: fecha });
  lote.update(refDoc('lotes', l.id), cambios);
  return cambios;
}

// Esmaltado: descuenta los esmaltes de la ficha para las piezas del lote.
export function registrarEsmaltado(lote, l, { fecha, esmaltes }) {
  const ref = { tipo: 'lote', id: l.id };
  const movs = [...(l.movs || [])];
  let costo = 0;
  (esmaltes || []).forEach((e) => {
    const ins = estado.insumos[e.insumoId];
    if (!ins || !e.gramos) return;
    const cant = enUnidadDe(ins, e.gramos * l.cantidadActual, 'g');
    costo += valorSalida(ins, cant);
    movs.push(agregarMovimiento(lote, { insumoId: ins.id, cantidad: -cant, tipo: 'produccion', fecha, ref, nota: `Esmaltado de ${l.cantidadActual} × ${l.piezaNombre}` }));
  });
  const cambios = {
    etapa: 'esmaltado', costoEsmalte: (l.costoEsmalte || 0) + costo, movs,
    historial: [...l.historial, { etapa: 'esmaltado', fecha, entran: l.cantidadActual, salen: l.cantidadActual, merma: 0 }],
    ...firma()
  };
  lote.update(refDoc('lotes', l.id), cambios);
  return cambios;
}

// Termina un lote: las piezas que salieron bien entran a stock con su costo real.
// Lo que se perdió en el camino reparte su costo entre las que quedaron.
export function terminarLote(lote, l, { primera, segunda = 0, fecha, extra = {} }) {
  const datos = { ...l, ...extra };
  const ficha = estado.piezas[l.piezaId];
  // Otros insumos (embalaje) se descuentan al terminar, solo por las piezas buenas.
  const movs = [...(datos.movs || [])];
  let costoOtros = datos.costoOtros || 0;
  const unidades = primera + segunda;
  if (ficha && unidades > 0) {
    (ficha.otros || []).forEach((o) => {
      const ins = estado.insumos[o.insumoId];
      if (!ins || !o.cantidad) return;
      const cant = o.cantidad * unidades;
      costoOtros += valorSalida(ins, cant);
      movs.push(agregarMovimiento(lote, { insumoId: ins.id, cantidad: -cant, tipo: 'produccion', fecha, ref: { tipo: 'lote', id: l.id }, nota: `Terminación de ${unidades} × ${l.piezaNombre}` }));
    });
  }
  const total = costoLote({ ...datos, costoOtros });
  const unit = unidades ? total / unidades : 0;
  const movsPiezas = [];
  if (ficha && primera > 0) movsPiezas.push(movimientoPieza(lote, { piezaId: ficha.id, calidad: 'primera', cantidad: primera, costoUnitario: unit, tipo: 'produccion', fecha, ref: { tipo: 'lote', id: l.id } }));
  if (ficha && segunda > 0) movsPiezas.push(movimientoPieza(lote, { piezaId: ficha.id, calidad: 'segunda', cantidad: segunda, costoUnitario: unit, tipo: 'produccion', fecha, ref: { tipo: 'lote', id: l.id } }));
  return {
    etapa: 'terminado', estado: 'terminado', fechaFin: fecha, primera, segunda, costoOtros,
    costoTotal: total, costoUnitario: unit, movs, movsPiezas
  };
}

// ---------------------------------------------------------------- Quemas
// Registra una quema ya hecha con lo que salió de cada lote.
// filas: [{ lote, bien, segunda, motivo }]
export function registrarQuema(lote, { tipo, fecha, cono, energia, nota, filas, hornoId = null }) {
  const costo = costoEnergia(energia);
  const puntos = filas.reduce((s, f) => s + f.lote.cantidadActual * (f.lote.puntosPieza || 1), 0);
  const qRef = refNueva('quemas');
  const detalle = filas.map((f) => {
    const l = f.lote;
    const pts = l.cantidadActual * (l.puntosPieza || 1);
    const parte = puntos ? costo * pts / puntos : 0;
    const salen = f.bien + (f.segunda || 0);
    const merma = l.cantidadActual - salen;
    const hist = [...l.historial, { etapa: tipo === 'bizcocho' ? 'bizcocho' : 'quema de esmalte', fecha, entran: l.cantidadActual, salen, segunda: f.segunda || 0, merma, motivo: merma ? f.motivo : null, quemaId: qRef.id }];
    let cambios = {
      costoQuemas: (l.costoQuemas || 0) + parte, merma: (l.merma || 0) + merma, historial: hist,
      quemas: [...(l.quemas || []), qRef.id], ...firma()
    };
    if (tipo === 'bizcocho') {
      cambios = { ...cambios, cantidadActual: f.bien, etapa: f.bien > 0 ? 'bizcochado' : 'terminado' };
      if (f.bien === 0) Object.assign(cambios, { estado: 'terminado', fechaFin: fecha, primera: 0, segunda: 0 });
    } else {
      const fin = terminarLote(lote, l, { primera: f.bien, segunda: f.segunda || 0, fecha, extra: cambios });
      cambios = { ...cambios, ...fin, cantidadActual: salen };
    }
    lote.update(refDoc('lotes', l.id), cambios);
    return {
      loteId: l.id, pieza: l.piezaNombre, tamano: l.tamano, piezas: l.cantidadActual, puntos: pts, costo: parte,
      bien: f.bien, segunda: f.segunda || 0, merma, motivo: merma ? f.motivo : null,
      valorVendible: valorVenta(l.piezaId, f.bien, f.segunda || 0), valorMerma: valorVenta(l.piezaId, merma)
    };
  });
  const hx = hornoPorId(hornoId);
  const capacidad = hx?.capacidadPuntos || 0;
  lote.set(qRef, {
    tipo, fecha, cono: cono || '', hornoId: hx?.id || null, hornoNombre: hx?.nombre || '',
    energia, kwh: kwhEnergia(energia), costo, puntos, ocupacion: capacidad ? puntos / capacidad : null,
    valorVendible: detalle.reduce((s2, x) => s2 + x.valorVendible, 0), valorMerma: detalle.reduce((s2, x) => s2 + x.valorMerma, 0),
    lotes: detalle, nota: nota || '', creadoMs: Date.now(), ...firma()
  });
  return { id: qRef.id, costo, puntos, detalle };
}

// Anula un lote en proceso: las materias primas vuelven a bodega.
export function anularLote(lote, l, motivo = '') {
  (l.movs || []).forEach((m) => agregarAnulacion(lote, m, `Anulación del lote de ${l.piezaNombre}`));
  lote.update(refDoc('lotes', l.id), { anulado: true, estado: 'anulado', motivoAnulacion: motivo, movs: [], anuladoEn: Date.now(), ...firma() });
}

export const refPieza = () => doc(collection(db, 'piezas'));
