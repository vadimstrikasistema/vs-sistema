// Agenda: junta en un calendario todo lo que tiene fecha en el taller.
// Los eventos propios (entregas, clases, quemas…) viven en `eventos`; el resto
// se lee de donde ya está: ferias, encargos, órdenes por entregar y facturas
// por cobrar. Así nada se anota dos veces.
import { estado, firma } from './datos.js';
import { refNueva, refDoc } from './stock.js';
import { hoyISO, pesos } from './ui.js';
import { saldo } from './cobranza-core.js';
import { encargoActivo, saldoEncargo, resumenEncargo } from './encargos-core.js';
import { recurrentesActivos, periodos, registro, vencimientoDe } from './recurrentes-core.js';
import { todasLasDeudas, deudores, configCobranza, TONOS } from './cobranza-gestion-core.js';
import { consignacionesAbiertas, ultimaVisita } from './b2b-core.js';

// Los tipos de evento son una lista editable (Configuración → Listas), cada uno con su color.
export function tipoEvento(id) {
  const it = estado.listas.tiposEvento?.items.find((i) => i.id === id);
  return { nombre: it?.nombre || id || 'Evento', clase: `ag-c-${it?.color || 'gris'}` };
}
export const tiposEventoActivos = () => (estado.listas.tiposEvento?.items || []).filter((i) => i.activo).sort((a, b) => a.orden - b.orden);

// Colores de lo que viene de otros módulos.
export const CLASE_ORIGEN = { feria: 'ag-feria', encargo: 'ag-entrega', orden: 'ag-entrega', cobro: 'ag-cobro', pago: 'ag-pago' };

// ---------------------------------------------------------------- Fechas
export const aISO = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export const deISO = (iso) => { const [y, m, d] = iso.split('-').map(Number); return new Date(y, m - 1, d); };
export const sumar = (iso, dias) => { const d = deISO(iso); d.setDate(d.getDate() + dias); return aISO(d); };
export const diasEntreISO = (a, b) => Math.round((deISO(b) - deISO(a)) / 86400000);

// Semanas (lunes a domingo) que cubren el mes de `iso`.
export function semanasDelMes(iso) {
  const d = deISO(iso);
  const primero = new Date(d.getFullYear(), d.getMonth(), 1);
  const inicio = new Date(primero);
  inicio.setDate(1 - ((primero.getDay() + 6) % 7));
  const semanas = [];
  const c = new Date(inicio);
  do {
    const s = [];
    for (let i = 0; i < 7; i++) { s.push(aISO(c)); c.setDate(c.getDate() + 1); }
    semanas.push(s);
  } while (c.getMonth() === d.getMonth());
  return semanas;
}

// ---------------------------------------------------------------- Eventos propios
export function guardarEvento(lote, ev, datos) {
  if (ev?.id) { lote.update(refDoc('eventos', ev.id), { ...datos, ...firma() }); return ev.id; }
  const ref = refNueva('eventos');
  lote.set(ref, { ...datos, hecho: false, anulado: false, creadoMs: Date.now(), ...firma() });
  return ref.id;
}
export const marcarHecho = (lote, ev, hecho) => lote.update(refDoc('eventos', ev.id), { hecho, ...firma() });
export const anularEvento = (lote, ev) => lote.update(refDoc('eventos', ev.id), { anulado: true, anuladoEn: Date.now(), ...firma() });

// ---------------------------------------------------------------- Todo lo que tiene fecha
// Devuelve [{ fecha, hora, titulo, sub, clase, origen, id, hecho, alerta }] entre `desde` y `hasta` (incluidos).
export function itemsAgenda(desde, hasta, { facturas = [], gastos = [], ventasDeuda = [], hoy = hoyISO() } = {}) {
  const r = [];
  const dentro = (f) => f && f >= desde && f <= hasta;
  Object.values(estado.eventos).filter((e) => !e.anulado).forEach((e) => {
    const fin = e.fechaFin && e.fechaFin > e.fecha ? e.fechaFin : e.fecha;
    for (let f = e.fecha; f <= fin; f = sumar(f, 1)) {
      if (!dentro(f)) continue;
      r.push({ fecha: f, hora: e.hora ? `${e.hora}${e.horaFin ? `–${e.horaFin}` : ''}` : '', titulo: e.titulo, sub: [tipoEvento(e.tipo).nombre, e.lugar].filter(Boolean).join(' · '), clase: tipoEvento(e.tipo).clase, origen: 'evento', id: e.id, hecho: Boolean(e.hecho), alerta: !e.hecho && f < hoy && e.tipo === 'entrega' });
    }
  });
  Object.values(estado.ferias).forEach((x) => {
    const fin = x.fechaFin || x.fechaInicio;
    for (let f = x.fechaInicio; f && f <= fin; f = sumar(f, 1)) {
      if (dentro(f)) r.push({ fecha: f, hora: '', titulo: x.nombre, sub: ['Feria', x.lugar].filter(Boolean).join(' · '), clase: CLASE_ORIGEN.feria, origen: 'feria', id: x.id, hecho: f < hoy });
    }
  });
  Object.values(estado.encargos).filter(encargoActivo).forEach((e) => {
    // Un encargo atrasado se muestra hoy, para que no se pierda en el pasado.
    const f = e.fechaEntrega < hoy ? hoy : e.fechaEntrega;
    if (!dentro(f)) return;
    r.push({ fecha: f, hora: '', titulo: `Entregar encargo · ${e.clienteNombre}`, sub: `${resumenEncargo(e)}${saldoEncargo(e) ? ` · saldo ${pesos(saldoEncargo(e))}` : ''}`, clase: CLASE_ORIGEN.encargo, origen: 'encargo', id: e.id, alerta: e.fechaEntrega < hoy });
  });
  Object.values(estado.ordenes).filter((o) => !o.anulada && !o.entregada && o.fechaCompromiso).forEach((o) => {
    const f = o.fechaCompromiso < hoy ? hoy : o.fechaCompromiso;
    if (dentro(f)) r.push({ fecha: f, hora: '', titulo: `Entregar OV ${o.numero} · ${o.clienteNombre}`, sub: `${o.piezas} pieza${o.piezas === 1 ? '' : 's'}`, clase: CLASE_ORIGEN.orden, origen: 'orden', id: o.id, alerta: o.fechaCompromiso < hoy });
  });
  facturas.filter((f) => f.abierta && !f.anulada && f.vencimiento && saldo(f) > 0).forEach((f) => {
    if (dentro(f.vencimiento)) r.push({ fecha: f.vencimiento, hora: '', titulo: `Vence factura ${f.folio || ''} · ${f.clienteNombre}`, sub: `Por cobrar ${pesos(saldo(f))}`, clase: CLASE_ORIGEN.cobro, origen: 'cobro', id: f.id, alerta: f.vencimiento < hoy });
  });
  // Gastos por pagar (facturas a crédito, cuentas registradas sin pagar). Los vencidos se muestran hoy.
  gastos.filter((g) => !g.anulado && g.pagoEstado === 'por-pagar' && g.pago?.vencimiento).forEach((g) => {
    const f = g.pago.vencimiento < hoy ? hoy : g.pago.vencimiento;
    if (dentro(f)) r.push({ fecha: f, hora: '', titulo: `Pagar ${g.proveedor}`, sub: `${g.folio ? `Folio ${g.folio} · ` : ''}${pesos(g.total)}`, clase: CLASE_ORIGEN.pago, origen: 'gasto', id: g.id, gasto: g, alerta: g.pago.vencimiento < hoy });
  });
  // Cuentas que se repiten: cada período sin registrar. Las atrasadas (desde que se creó el recurrente) se muestran hoy.
  recurrentesActivos().forEach((x) => {
    const desdeYM = (x.creadoMes && x.creadoMes > x.inicio ? x.creadoMes : x.inicio);
    periodos(x, desdeYM < desde.slice(0, 7) ? desdeYM : desde.slice(0, 7), hasta.slice(0, 7)).forEach((per) => {
      const reg = registro(x, per);
      const venc = vencimientoDe(x, per);
      if (reg) {
        if (dentro(venc) && reg.estado === 'pagado') r.push({ fecha: venc, hora: '', titulo: `Pagar ${x.nombre}`, sub: 'Pagado', clase: CLASE_ORIGEN.pago, origen: 'recurrente', id: x.id, periodo: per, hecho: true });
        return; // si quedó por pagar, ya aparece como gasto por pagar
      }
      const f = venc < hoy ? hoy : venc;
      if (dentro(f)) r.push({ fecha: f, hora: '', titulo: `Pagar ${x.nombre}`, sub: x.montoEstimado ? `Alrededor de ${pesos(x.montoEstimado)}` : 'Cuenta del mes', clase: CLASE_ORIGEN.pago, origen: 'recurrente', id: x.id, periodo: per, alerta: venc < hoy });
    });
  });
  // Cobranza: promesas de pago y la próxima gestión de cada deudor.
  deudores(todasLasDeudas({ facturas, ventas: ventasDeuda }), hoy).forEach((d) => {
    const nombre = d.cliente.nombre || d.cliente.razonSocial || d.items[0]?.clienteNombre;
    const p = d.paso;
    if (p.accion === 'promesa') {
      const pr = d.cliente.cobranza.promesa;
      if (dentro(pr.fecha)) r.push({ fecha: pr.fecha, hora: '', titulo: `Promesa de pago · ${nombre}`, sub: pr.monto ? `Dijo que paga ${pesos(pr.monto)}` : 'Dijo que paga este día', clase: 'ag-cobro', origen: 'gestion', id: d.id });
    } else if (['amable', 'firme', 'ultimo', 'llamar'].includes(p.accion)) {
      if (dentro(hoy)) r.push({ fecha: hoy, hora: '', titulo: p.accion === 'llamar' ? `Llamar o visitar a ${nombre}` : `Escribir a ${nombre} (${TONOS[p.accion].nombre.toLowerCase()})`, sub: `Debe ${pesos(d.total)}`, clase: 'ag-cobro', origen: 'gestion', id: d.id, alerta: p.urgente >= 2 });
    } else if (p.accion === 'esperar' && p.siguiente && p.fecha && dentro(p.fecha)) {
      r.push({ fecha: p.fecha, hora: '', titulo: p.siguiente === 'llamar' ? `Llamar a ${nombre} si no ha pagado` : `Si no paga: escribir a ${nombre} (${TONOS[p.siguiente].nombre.toLowerCase()})`, sub: `Debe ${pesos(d.total)}`, clase: 'ag-cobro', origen: 'gestion', id: d.id });
    }
  });
  // Consignación: pedir la liquidación cuando pasan los días sin visita.
  const diasC = configCobranza().diasConsignacion;
  consignacionesAbiertas().forEach((c) => {
    const toca = sumar(ultimaVisita(c), diasC);
    const f = toca < hoy ? hoy : toca;
    if (dentro(f)) r.push({ fecha: f, hora: '', titulo: `Pedir liquidación · ${c.clienteNombre}`, sub: `Consignación sin visita desde el ${ultimaVisita(c).split('-').reverse().join('-')}`, clase: 'ag-cobro', origen: 'consig', id: c.id, alerta: toca < hoy });
  });
  // Sesiones de clases y talleres.
  Object.values(estado.cursos || {}).filter((c) => !c.anulado).forEach((c) => {
    const vivas = (c.sesiones || []).filter((x) => !x.cancelada).sort((a, b) => (a.fecha + (a.hora || '')).localeCompare(b.fecha + (b.hora || '')));
    const alumnos = (c.alumnos || []).filter((a) => !a.retirado).length;
    vivas.forEach((x, i) => {
      if (!dentro(x.fecha)) return;
      r.push({ fecha: x.fecha, hora: x.hora ? `${x.hora}${x.horaFin ? `–${x.horaFin}` : ''}` : '', titulo: `Clase · ${c.nombre}`, sub: [`Sesión ${i + 1} de ${vivas.length}`, `${alumnos} alumno${alumnos === 1 ? '' : 's'}`, x.tema].filter(Boolean).join(' · '), clase: 'ag-clase', origen: 'sesion', id: c.id, key: x.key, hecho: Boolean(x.hecha) || x.fecha < hoy });
    });
  });
  return r.sort((a, b) => a.fecha.localeCompare(b.fecha) || (a.hora || '99').localeCompare(b.hora || '99') || a.titulo.localeCompare(b.titulo, 'es'));
}
