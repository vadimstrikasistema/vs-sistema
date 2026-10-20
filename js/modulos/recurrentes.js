// Gastos → Recurrentes: cuentas que se repiten y el registro de cada período.
import { estado, alCambiar, enviar, itemsActivos } from '../datos.js';
import { esc, info, toast, $, $$, formulario, leerNumero, numero, pesos, hoyISO, fechaCorta, rutValido, formatearRut, limpiarRut } from '../ui.js';
import { nuevoLote, documentosDonde } from '../stock.js';
import { opcionesLista, campoNumero, vacio, avisoError, avisoGuardado } from '../comunes.js';
import { mesDe, diasEntre } from '../gastos-core.js';
import { TIPOS_DTE } from '../xml-sii.js';
import {
  FRECUENCIAS, recurrentesActivos, periodoPendiente, vencimientoDe, registro, guardarRecurrente,
  registrarPeriodo, vincularPeriodo, periodos
} from '../recurrentes-core.js';
import { ICONOS } from '../iconos.js';

const fallo = avisoError(toast);
const nombrePeriodo = (ym) => { const [y, m] = ym.split('-').map(Number); const t = new Date(y, m - 1, 1).toLocaleDateString('es-CL', { month: 'long', year: 'numeric' }); return t.charAt(0).toUpperCase() + t.slice(1); };

function estadoPendiente(r, hoy = hoyISO()) {
  const p = periodoPendiente(r, hoy);
  if (!p) return { p: null, txt: 'Al día', clase: 'etiqueta-ok' };
  const v = vencimientoDe(r, p);
  const d = diasEntre(hoy, v);
  if (d < 0) return { p, v, txt: `Atrasado ${-d} día${d === -1 ? '' : 's'}`, clase: 'etiqueta-alerta' };
  if (d === 0) return { p, v, txt: 'Vence hoy', clase: 'etiqueta-alerta' };
  return { p, v, txt: d <= 7 ? `Vence en ${d} día${d === 1 ? '' : 's'}` : `Próximo: ${fechaCorta(v)}`, clase: d <= 7 ? 'etiqueta-info' : 'etiqueta-suave' };
}

export function vistaRecurrentes(el) {
  el.innerHTML = `
    <div class="resumen" data-resumen></div>
    <div class="barra-herramientas">
      <label class="interruptor"><input type="checkbox" data-arch><span>Ver archivados</span></label>
      <span class="espacio"></span>
      <button class="btn btn-primario" data-nuevo>${ICONOS.mas2}<span>Nueva cuenta</span></button>
    </div>
    <div data-lista></div>`;
  let verArch = false;
  $('[data-arch]', el).addEventListener('change', (e) => { verArch = e.target.checked; pintar(); });
  $('[data-nuevo]', el).addEventListener('click', () => editarRecurrente());
  const lista = $('[data-lista]', el);
  function pintar() {
    const todos = Object.values(estado.recurrentes || {});
    const act = recurrentesActivos();
    const mes = mesDe(hoyISO());
    const delMes = act.filter((r) => periodos(r, mes, mes).length);
    const pagadoMes = delMes.reduce((s, r) => s + (registro(r, mes)?.total || 0), 0);
    const pend = delMes.filter((r) => !registro(r, mes));
    $('[data-resumen]', el).innerHTML = `
      <div class="dato"><span class="dato-etq">Cuentas este mes</span><span class="dato-valor">${delMes.length}</span></div>
      <div class="dato"><span class="dato-etq">Estimado del mes ${info('La suma de los montos aproximados de las cuentas que tocan este mes. Sirve para saber cuánto necesitas tener.')}</span><span class="dato-valor">${pesos(delMes.reduce((s, r) => s + (r.montoEstimado || 0), 0))}</span></div>
      <div class="dato"><span class="dato-etq">Registrado este mes</span><span class="dato-valor">${pesos(pagadoMes)}</span></div>
      <div class="dato ${pend.some((r) => diasEntre(hoyISO(), vencimientoDe(r, mes)) < 0) ? 'dato-alerta' : ''}"><span class="dato-etq">Por registrar</span><span class="dato-valor">${pend.length}</span></div>`;
    if (!todos.length) {
      lista.innerHTML = vacio('Sin cuentas recurrentes', 'Anota las cuentas que llegan cada mes o cada cierto tiempo, como la luz del horno, el arriendo, internet o el contador. La app te las recuerda en la Agenda y, al registrar cada una, queda como gasto con su ítem y su área.', '<button class="btn btn-primario" data-nuevo2>Anotar la primera cuenta</button>');
      $('[data-nuevo2]', lista)?.addEventListener('click', () => editarRecurrente());
      return;
    }
    const vis = (verArch ? todos.filter((r) => r.activo === false) : act).sort((a, b) => (estadoPendiente(a).v || '9').localeCompare(estadoPendiente(b).v || '9'));
    if (!vis.length) { lista.innerHTML = vacio(verArch ? 'Sin archivadas' : 'Sin cuentas activas', verArch ? 'No hay cuentas archivadas.' : 'Todas las cuentas están archivadas.'); return; }
    lista.innerHTML = `<section class="panel tabla-panel"><ul class="filas">${vis.map((r) => {
      const e = estadoPendiente(r);
      const ult = Object.entries(r.registros || {}).sort((a, b) => b[0].localeCompare(a[0]))[0];
      return `
      <li class="fila-con-accion"><button class="fila" data-id="${esc(r.id)}">
        <span class="fila-principal"><span class="fila-nombre">${esc(r.nombre)}</span>
          <span class="fila-meta"><span>${esc(FRECUENCIAS[r.frecuencia] || 'Mensual')} · día ${esc(r.dia)}</span>${ult ? `<span>Última: ${esc(nombrePeriodo(ult[0]))} ${pesos(ult[1].total)}</span>` : ''}${r.activo === false ? '<span class="etiqueta etiqueta-suave">Archivada</span>' : `<span class="etiqueta ${e.clase}">${esc(e.txt)}</span>`}</span></span>
        <span class="fila-dato fila-dato-fuerte"><span class="fila-etq">Aprox.</span>${r.montoEstimado ? pesos(r.montoEstimado) : '—'}</span>
      </button>
      ${r.activo !== false && e.p ? `<button class="btn btn-primario btn-chico" data-registrar="${esc(r.id)}">Registrar ${esc(nombrePeriodo(e.p).split(' ')[0].toLowerCase())}</button>` : ''}</li>`;
    }).join('')}</ul></section>`;
    $$('.fila', lista).forEach((b) => b.addEventListener('click', () => editarRecurrente(estado.recurrentes[b.dataset.id])));
    $$('[data-registrar]', lista).forEach((b) => b.addEventListener('click', () => { const r = estado.recurrentes[b.dataset.registrar]; registrarDialogo(r, periodoPendiente(r)); }));
  }
  pintar();
  return alCambiar(pintar);
}

export async function editarRecurrente(r = null) {
  const d = r || { nombre: '', proveedor: '', rutProveedor: '', itemGasto: '', area: '', montoEstimado: null, dia: 10, frecuencia: 1, inicio: mesDe(hoyISO()), tipoDoc: 33, medio: 'transferencia', nota: '' };
  await formulario({
    titulo: r ? r.nombre : 'Nueva cuenta recurrente', ancho: true, textoGuardar: r ? 'Guardar cambios' : 'Crear cuenta',
    extra: r ? `<button type="button" class="btn btn-suave" data-archivar>${r.activo === false ? 'Reactivar' : 'Archivar'}</button>` : '',
    cuerpo: `<div class="campos">
      <label class="campo"><span class="campo-etiqueta">Nombre <span class="req">*</span></span><input name="nombre" value="${esc(d.nombre)}" maxlength="80" placeholder="Ej.: Luz del taller, Arriendo, Internet"></label>
      <label class="campo"><span class="campo-etiqueta">Proveedor</span><input name="proveedor" value="${esc(d.proveedor || '')}" maxlength="100" placeholder="Ej.: CGE, dueño del local"></label>
      <label class="campo"><span class="campo-etiqueta">RUT del proveedor ${info('Si te emite factura o boleta, con el RUT la app reconoce el XML cuando lo subas y aprende cómo clasificarlo.')}</span><input name="rut" value="${esc(d.rutProveedor || '')}" placeholder="76.123.456-7" autocomplete="off"></label>
      <label class="campo"><span class="campo-etiqueta">Documento que llega</span><select name="tipoDoc">${[33, 34, 39, 0].map((t) => `<option value="${t}" ${Number(d.tipoDoc) === t ? 'selected' : ''}>${esc(TIPOS_DTE[t])}</option>`).join('')}</select></label>
      <label class="campo"><span class="campo-etiqueta">Ítem de gasto <span class="req">*</span></span><select name="itemGasto">${opcionesLista('itemsGasto', d.itemGasto, { vacio: 'Elige el ítem' })}</select></label>
      <label class="campo"><span class="campo-etiqueta">Área <span class="req">*</span></span><select name="area">${opcionesLista('areasNegocio', d.area, { vacio: 'Elige el área' })}</select></label>
      <label class="campo"><span class="campo-etiqueta">Cada cuánto</span><select name="frecuencia">${Object.entries(FRECUENCIAS).map(([k, t]) => `<option value="${k}" ${Number(d.frecuencia) === Number(k) ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
      <label class="campo"><span class="campo-etiqueta">Día de vencimiento ${info('El día del mes en que hay que pagarla. Si el mes es más corto, se usa el último día.')}</span><input name="dia" type="number" min="1" max="31" value="${esc(d.dia)}"></label>
      <label class="campo"><span class="campo-etiqueta">Desde ${info('El primer mes en que toca. Para las cuentas cada 2, 3, 6 o 12 meses, desde aquí se cuentan los meses.')}</span><input name="inicio" type="month" value="${esc(d.inicio)}"></label>
      ${campoNumero('montoEstimado', 'Monto aproximado, total', d.montoEstimado ? numero(d.montoEstimado, 0) : '', { sufijo: '$', ayuda: info('Lo que suele llegar, con IVA. Se propone al registrar y sirve para estimar el mes.') })}
      <label class="campo"><span class="campo-etiqueta">Medio de pago habitual</span><select name="medio">${opcionesLista('mediosPago', d.medio || '', { vacio: 'Sin indicar' })}</select></label>
      <label class="campo campo-ancho"><span class="campo-etiqueta">Notas</span><input name="nota" value="${esc(d.nota || '')}" maxlength="200" placeholder="Ej.: número de cliente, cuenta para transferir"></label>
    </div>`,
    montar(dlg, form, cerrar) {
      $('[data-archivar]', dlg)?.addEventListener('click', () => {
        const lote = nuevoLote(); guardarRecurrente(lote, r, { activo: r.activo === false });
        enviar(lote.commit(), { alGuardar: avisoGuardado(toast, r.activo === false ? 'Cuenta reactivada' : 'Cuenta archivada'), alFallar: fallo }); cerrar();
      });
    },
    guardar(form) {
      const nombre = form.nombre.value.trim();
      if (!nombre) return 'Escribe el nombre de la cuenta.';
      if (!form.itemGasto.value || !form.area.value) return 'Elige el ítem de gasto y el área.';
      const rut = form.rut.value.trim();
      if (rut && !rutValido(rut)) return 'El RUT del proveedor no es válido.';
      const dia = Math.round(Number(form.dia.value));
      if (!(dia >= 1 && dia <= 31)) return 'El día de vencimiento debe estar entre 1 y 31.';
      if (!form.inicio.value) return 'Indica desde qué mes.';
      const datos = {
        nombre, proveedor: form.proveedor.value.trim(), rutProveedor: rut ? formatearRut(rut) : '', rutLimpio: rut ? limpiarRut(rut) : '',
        tipoDoc: Number(form.tipoDoc.value), itemGasto: form.itemGasto.value, area: form.area.value,
        frecuencia: Number(form.frecuencia.value), dia, inicio: form.inicio.value,
        montoEstimado: leerNumero(form.montoEstimado.value) || null, medio: form.medio.value, nota: form.nota.value.trim()
      };
      const lote = nuevoLote(); guardarRecurrente(lote, r, datos);
      enviar(lote.commit(), { alGuardar: avisoGuardado(toast, r ? 'Cuenta guardada' : `«${nombre}» agregada: aparecerá en la Agenda`), alFallar: fallo });
      return null;
    }
  });
}

// Registrar el gasto de un período: anotarlo (pagado o por pagar) o vincular un gasto ya cargado.
export async function registrarDialogo(r, periodo) {
  if (!periodo) { toast('Esta cuenta está al día.'); return; }
  const venc = vencimientoDe(r, periodo);
  let candidatos = [];
  try {
    candidatos = (r.rutLimpio ? await documentosDonde('gastos', 'rutLimpio', '==', r.rutLimpio) : [])
      .filter((g) => !g.anulado && !g.recurrenteId && Math.abs(diasEntre(g.fecha, venc)) <= 45);
  } catch { candidatos = []; }
  const doc = Number(r.tipoDoc);
  await formulario({
    titulo: `${r.nombre} · ${nombrePeriodo(periodo)}`, textoGuardar: 'Registrar',
    cuerpo: `
      <p class="texto-suave">Vence el ${fechaCorta(venc)}. Queda como gasto en ${esc(estado.listas.itemsGasto?.items.find((i) => i.id === r.itemGasto)?.nombre || 'su ítem')}, con su IVA si es factura.</p>
      ${candidatos.length ? `
      <div class="segmentado" role="radiogroup">
        <label><input type="radio" name="modo" value="nuevo" checked><span>Anotarlo ahora</span></label>
        <label><input type="radio" name="modo" value="vincular"><span>Ya lo cargué</span></label>
      </div>
      <label class="campo" data-vincular hidden><span class="campo-etiqueta">Documento cargado ${info('Facturas de este proveedor que subiste en Gastos (por ejemplo, el XML del SII) y que no están asociadas a otro mes.')}</span>
        <select name="gasto">${candidatos.map((g) => `<option value="${esc(g.id)}">${esc(TIPOS_DTE[g.tipoDoc] || 'Documento')} ${esc(g.folio || '')} · ${fechaCorta(g.fecha)} · ${pesos(g.total)}</option>`).join('')}</select></label>` : '<input type="hidden" name="modo" value="nuevo">'}
      <div class="campos" data-nuevo>
        <label class="campo"><span class="campo-etiqueta">Documento</span><select name="tipoDoc">${[33, 34, 39, 0].map((t) => `<option value="${t}" ${doc === t ? 'selected' : ''}>${esc(TIPOS_DTE[t])}</option>`).join('')}</select></label>
        <label class="campo" data-folio><span class="campo-etiqueta">Folio</span><input name="folio" inputmode="numeric" maxlength="20"></label>
        <label class="campo"><span class="campo-etiqueta">Fecha del documento</span><input type="date" name="fecha" value="${hoyISO()}" max="${hoyISO()}"></label>
        ${campoNumero('total', 'Total, con IVA', r.montoEstimado ? numero(r.montoEstimado, 0) : '', { sufijo: '$', requerido: true })}
        <div class="segmentado campo-ancho" role="radiogroup">
          <label><input type="radio" name="pagado" value="si" checked><span>Ya lo pagué</span></label>
          <label><input type="radio" name="pagado" value="no"><span>Queda por pagar</span></label>
        </div>
        <label class="campo" data-pago><span class="campo-etiqueta">Fecha de pago</span><input type="date" name="fechaPago" value="${hoyISO()}" max="${hoyISO()}"></label>
        <label class="campo" data-pago><span class="campo-etiqueta">Medio de pago</span><select name="medio">${opcionesLista('mediosPago', r.medio || '', { vacio: 'Sin indicar' })}</select></label>
      </div>`,
    montar(dlg, form) {
      const v = () => {
        const vincular = form.modo.value === 'vincular';
        if ($('[data-vincular]', dlg)) $('[data-vincular]', dlg).hidden = !vincular;
        $('[data-nuevo]', dlg).hidden = vincular;
        $('[data-folio]', dlg).hidden = Number(form.tipoDoc.value) === 0;
        $$('[data-pago]', dlg).forEach((x) => { x.hidden = form.pagado.value !== 'si'; });
      };
      $$('input[type=radio], select', dlg).forEach((x) => x.addEventListener('change', v));
      v();
    },
    guardar(form) {
      const lote = nuevoLote();
      if (form.modo.value === 'vincular') {
        const g = candidatos.find((x) => x.id === form.gasto.value);
        vincularPeriodo(lote, r, periodo, g);
        enviar(lote.commit(), { alGuardar: avisoGuardado(toast, `${r.nombre} de ${nombrePeriodo(periodo).toLowerCase()} vinculada`), alFallar: fallo });
        return null;
      }
      const total = Math.round(leerNumero(form.total.value) || 0);
      if (!(total > 0)) return 'Escribe el total de la cuenta.';
      const t = Number(form.tipoDoc.value);
      if (t !== 0 && !r.rutProveedor) return 'Para registrar una factura o boleta, agrega el RUT del proveedor en la cuenta. O elige «Sin documento».';
      if (t !== 0 && !form.folio.value.trim()) return 'Escribe el folio del documento.';
      const pagado = form.pagado.value === 'si';
      registrarPeriodo(lote, r, { periodo, tipoDoc: t, folio: form.folio.value.trim(), fecha: form.fecha.value || hoyISO(), total, pagado, fechaPago: form.fechaPago.value, medio: form.medio.value });
      enviar(lote.commit(), { alGuardar: avisoGuardado(toast, `${r.nombre}: ${pesos(total)} ${pagado ? 'pagado' : 'por pagar'}`), alFallar: fallo });
      return null;
    }
  });
}

