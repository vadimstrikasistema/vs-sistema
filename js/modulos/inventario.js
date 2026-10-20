// Inventario: lo que hay en bodega, ajustes, inventario inicial y conteo físico.
// Las piezas terminadas, en proceso y en consignación llegan en la entrega 2c.
import { estado, alCambiar, enviar, firma, itemsActivos, nombreItem } from '../datos.js';
import { esc, info, toast, $, $$, formulario, confirmar, leerNumero, numero, pesos, pesosUnidad, hoyISO, fechaCorta } from '../ui.js';
import {
  costoActual, costoPromedio, insumosActivos, bajoMinimo, TIPOS_MOV, agregarMovimiento, agregarAnulacion,
  nuevoLote, refNueva, movimientosDeInsumo, ultimosMovimientos
} from '../stock.js';
import { opcionesLista, opcionesInsumos, nombreUnidad, campoNumero, vacio, pestanas, avisoError, avisoGuardado } from '../comunes.js';
import { editarInsumo } from './produccion.js';
import { ETAPAS, movimientoPieza, costoFicha } from '../piezas-core.js';
import { escucharDonde, documentosPorCampo, refDoc } from '../stock.js';

const PEST = [['bodega', 'Bodega'], ['movimientos', 'Movimientos'], ['piezas', 'Piezas']];
const fallo = avisoError(toast);
const MOTIVOS_FIJOS = ['inventario-inicial', 'conteo-fisico'];
const ANULABLES = ['inicial', 'ajuste', 'conteo'];

export default {
  render(el, { sub }) {
    const actual = PEST.some(([k]) => k === sub) ? sub : 'bodega';
    el.innerHTML = `
      <header class="pagina-cabecera">
        <h1>Inventario</h1>
        <p class="pagina-bajada">${actual === 'movimientos'
          ? 'Cada entrada y salida de bodega, con fecha, motivo y quién la hizo. Nada se borra: lo que se corrige queda como anulación.'
          : actual === 'piezas' ? 'Piezas terminadas, en proceso y en consignación.'
            : 'Cuánto hay de cada material y cuánto vale.'}</p>
      </header>
      ${pestanas('inventario', PEST, actual)}
      <div id="inv-cuerpo"></div>`;
    const c = $('#inv-cuerpo', el);
    if (actual === 'bodega') return vistaBodega(c);
    if (actual === 'movimientos') return vistaMovimientos(c);
    return vistaPiezasInv(c);
  }
};

// ================================================================ Bodega
function vistaBodega(el) {
  const f = { texto: '', tipo: '', bajo: false };
  el.innerHTML = `
    <div class="resumen" data-resumen></div>
    <div class="barra-herramientas">
      <input type="search" class="buscador" placeholder="Buscar insumo" aria-label="Buscar insumo">
      <select class="filtro" aria-label="Filtrar por tipo"><option value="">Todos los tipos</option>${opcionesLista('tiposInsumo')}</select>
      <label class="interruptor"><input type="checkbox" data-bajo><span>Solo stock bajo</span></label>
      <span class="espacio"></span>
      <div class="grupo-botones">
        <button class="btn btn-suave" data-accion="inicial">Inventario inicial</button>
        <button class="btn btn-suave" data-accion="conteo">Conteo físico</button>
        <button class="btn btn-primario" data-accion="ajuste">Ajuste</button>
      </div>
    </div>
    <div data-lista></div>`;
  $('.buscador', el).addEventListener('input', (e) => { f.texto = e.target.value; pintar(); });
  $('.filtro', el).addEventListener('change', (e) => { f.tipo = e.target.value; pintar(); });
  $('[data-bajo]', el).addEventListener('change', (e) => { f.bajo = e.target.checked; pintar(); });
  $$('[data-accion]', el).forEach((b) => b.addEventListener('click', () => {
    if (!insumosActivos().length) { toast('Primero crea los insumos en Producción → Insumos.', 'aviso'); return; }
    ({ inicial: inventarioInicial, conteo: conteoFisico, ajuste: () => ajuste() })[b.dataset.accion]();
  }));

  const lista = $('[data-lista]', el);
  function pintar() {
    const activos = insumosActivos();
    const valor = activos.reduce((s, i) => s + (i.valorStock || 0), 0);
    const bajos = activos.filter(bajoMinimo);
    const sinCosto = activos.filter((i) => (i.stock || 0) > 0 && !costoActual(i));
    $('[data-resumen]', el).innerHTML = `
      <div class="dato"><span class="dato-etq">Valor en bodega ${info('Lo que costó lo que hay en bodega, a costo promedio. Sale de las compras, el inventario inicial y los ajustes.')}</span><span class="dato-valor">${pesos(valor)}</span></div>
      <div class="dato"><span class="dato-etq">Insumos</span><span class="dato-valor">${activos.length}</span></div>
      <div class="dato ${bajos.length ? 'dato-alerta' : ''}"><span class="dato-etq">Con stock bajo</span><span class="dato-valor">${bajos.length}</span></div>
      ${sinCosto.length ? `<div class="dato dato-alerta"><span class="dato-etq">Con stock pero sin costo ${info('Tienen cantidad en bodega pero ningún costo. Las recetas y piezas que los usan saldrán más baratas de lo que son. Agrega un costo de referencia en Producción → Insumos.')}</span><span class="dato-valor">${sinCosto.length}</span></div>` : ''}`;

    if (!activos.length) {
      lista.innerHTML = vacio('La bodega está vacía', 'Primero crea los insumos en Producción. Después, carga lo que ya tienes en el taller con «Inventario inicial».',
        '<a class="btn btn-primario" href="#/produccion/insumos">Crear insumos</a>');
      return;
    }
    const norm = (t) => t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    const q = norm(f.texto.trim());
    const vis = activos.filter((i) => (!f.tipo || i.tipo === f.tipo) && (!q || norm(i.nombre).includes(q)) && (!f.bajo || bajoMinimo(i)));
    if (!vis.length) { lista.innerHTML = vacio('Sin resultados', f.bajo ? 'Ningún insumo está bajo su mínimo.' : 'Prueba con otra búsqueda o cambia el filtro.'); return; }
    const nuncaCargado = activos.every((i) => !i.conMovimientos);
    lista.innerHTML = `
      ${nuncaCargado ? `<section class="panel aviso-panel"><p><strong>¿Ya tienes materiales en el taller?</strong> Cárgalos de una vez con «Inventario inicial». No crea gastos: solo deja registrado lo que hay y cuánto vale.</p></section>` : ''}
      <section class="panel tabla-panel">
        <ul class="filas">
          ${vis.map((i) => `
            <li><button class="fila" data-id="${esc(i.id)}">
              <span class="fila-principal">
                <span class="fila-nombre">${esc(i.nombre)}</span>
                <span class="fila-meta">
                  <span>${esc(nombreItem('tiposInsumo', i.tipo))}</span>
                  ${bajoMinimo(i) ? `<span class="etiqueta etiqueta-alerta">Bajo el mínimo de ${numero(i.stockMinimo)}</span>` : ''}
                  ${(i.stock || 0) < 0 ? '<span class="etiqueta etiqueta-alerta">Negativo</span>' : ''}
                </span>
              </span>
              <span class="fila-dato fila-dato-fuerte"><span class="fila-etq">Stock</span>${numero(i.stock || 0)} ${esc(nombreUnidad(i.unidad))}</span>
              <span class="fila-dato"><span class="fila-etq">Valor</span>${pesos(i.valorStock || 0)}</span>
            </button></li>`).join('')}
        </ul>
      </section>`;
    $$('.fila', lista).forEach((b) => b.addEventListener('click', () => detalleInsumo(estado.insumos[b.dataset.id])));
  }
  pintar();
  return alCambiar(pintar);
}

// ---------------------------------------------------------------- Detalle e historial
const etiquetaMov = (m) => {
  if (m.tipo === 'ajuste' || m.tipo === 'inicial' || m.tipo === 'conteo') {
    const mot = m.motivo ? nombreItem('motivosAjuste', m.motivo) : TIPOS_MOV[m.tipo];
    return m.tipo === 'ajuste' ? `Ajuste · ${mot}` : TIPOS_MOV[m.tipo];
  }
  return TIPOS_MOV[m.tipo] || m.tipo;
};

const filaMov = (m, conInsumo = false) => `
  <li class="mov ${m.anulado ? 'anulado' : ''}">
    <span class="mov-fecha">${fechaCorta(m.fecha)}</span>
    <span class="mov-desc">
      ${conInsumo ? `<strong>${esc(m.insumoNombre)}</strong>` : ''}
      <span>${esc(etiquetaMov(m))}${m.nota ? ` · ${esc(m.nota)}` : ''}</span>
      <span class="texto-tenue mov-quien">${esc((m.actualizadoPor || '').split('@')[0])}</span>
    </span>
    <span class="mov-cant ${m.cantidad >= 0 ? 'entra' : 'sale'}">${m.cantidad >= 0 ? '+' : '−'}${numero(Math.abs(m.cantidad))} ${esc(nombreUnidad(m.unidad))}</span>
    <span class="mov-valor">${pesos(Math.abs(m.valor || 0))}</span>
    <span class="mov-acc">${m.anulado ? '<span class="etiqueta etiqueta-suave">Anulado</span>'
      : ANULABLES.includes(m.tipo) ? `<button type="button" class="btn-enlace" data-anular="${esc(m.id)}">Anular</button>` : ''}</span>
  </li>`;

async function anularMovimiento(m) {
  const ok = await confirmar('Anular movimiento',
    `Se registra el movimiento contrario (${m.cantidad >= 0 ? '−' : '+'}${numero(Math.abs(m.cantidad))} ${esc(nombreUnidad(m.unidad))} de «${esc(m.insumoNombre)}») y este queda marcado como anulado. Nada se borra.`,
    'Anular', true);
  if (!ok) return false;
  const lote = nuevoLote();
  agregarAnulacion(lote, m, `Anula ${etiquetaMov(m).toLowerCase()} del ${fechaCorta(m.fecha)}`);
  enviar(lote.commit(), { alGuardar: avisoGuardado(toast, 'Movimiento anulado'), alFallar: fallo });
  return true;
}

async function detalleInsumo(ins) {
  const prom = costoPromedio(ins);
  const cuerpo = `
    <div class="resumen resumen-chico">
      <div class="dato"><span class="dato-etq">Stock</span><span class="dato-valor">${numero(ins.stock || 0)} ${esc(nombreUnidad(ins.unidad))}</span></div>
      <div class="dato"><span class="dato-etq">Valor</span><span class="dato-valor">${pesos(ins.valorStock || 0)}</span></div>
      <div class="dato"><span class="dato-etq">Costo que usa la app ${info(`Según el método de Configuración → Costeo (${estado.costeo?.metodo === 'promedio' ? 'promedio ponderado' : 'última compra'}). Es el que usan recetas y piezas.`)}</span><span class="dato-valor">${costoActual(ins) ? `${pesosUnidad(costoActual(ins))}/${esc(nombreUnidad(ins.unidad))}` : '—'}</span></div>
    </div>
    <dl class="datos-fijos compacto">
      <div><dt>Última compra o ingreso</dt><dd>${ins.costoUltimo != null ? `${pesosUnidad(ins.costoUltimo)}/${esc(nombreUnidad(ins.unidad))}${ins.fechaUltimoCosto ? ` · ${fechaCorta(ins.fechaUltimoCosto)}` : ''}` : '—'}</dd></div>
      <div><dt>Promedio en bodega</dt><dd>${prom != null ? `${pesosUnidad(prom)}/${esc(nombreUnidad(ins.unidad))}` : '—'}</dd></div>
      <div><dt>Stock mínimo</dt><dd>${ins.stockMinimo ? `${numero(ins.stockMinimo)} ${esc(nombreUnidad(ins.unidad))}` : 'Sin aviso'}</dd></div>
    </dl>
    <h3>Movimientos</h3>
    <div data-hist><p class="texto-suave">Cargando…</p></div>`;
  await formulario({
    titulo: ins.nombre, cuerpo, ancho: true, textoGuardar: '',
    extra: `<button type="button" class="btn btn-suave" data-editar>Editar insumo</button><button type="button" class="btn btn-suave" data-ajustar>Ajustar</button>`,
    async montar(dlg, form, cerrar) {
      $('[data-editar]', dlg).addEventListener('click', () => { cerrar(); editarInsumo(ins); });
      $('[data-ajustar]', dlg).addEventListener('click', () => { cerrar(); ajuste(ins.id); });
      const caja = $('[data-hist]', dlg);
      try {
        const movs = await movimientosDeInsumo(ins.id);
        if (!movs.length) { caja.innerHTML = '<p class="texto-suave">Sin movimientos todavía.</p>'; return; }
        caja.innerHTML = `<ul class="movs">${movs.slice(0, 100).map((m) => filaMov(m)).join('')}</ul>`;
        $$('[data-anular]', caja).forEach((b) => b.addEventListener('click', async () => {
          if (await anularMovimiento(movs.find((m) => m.id === b.dataset.anular))) cerrar();
        }));
      } catch (e) {
        console.error(e);
        caja.innerHTML = '<p class="texto-suave">No se pudo cargar el historial. Revisa la conexión.</p>';
      }
    }
  });
}

// ---------------------------------------------------------------- Ajuste
async function ajuste(insumoId = '') {
  const motivos = itemsActivos('motivosAjuste').filter((m) => !MOTIVOS_FIJOS.includes(m.id));
  const cuerpo = `
    <p class="texto-suave">Para entradas o salidas de bodega que no vienen de una compra ni de producción. ${info('Un ajuste no crea un gasto ni aparece en el IVA: solo corrige cuánto hay. Las compras con boleta o factura se registran en Gastos, que suma el stock solo.')}</p>
    <div class="campos">
      <label class="campo campo-ancho">
        <span class="campo-etiqueta">Insumo <span class="req">*</span></span>
        <select name="insumo">${opcionesInsumos(insumoId)}</select>
      </label>
      <div class="campo campo-ancho">
        <span class="campo-etiqueta">Tipo de ajuste</span>
        <div class="segmentado" role="radiogroup">
          <label><input type="radio" name="sentido" value="ingreso" checked><span>Ingreso a bodega</span></label>
          <label><input type="radio" name="sentido" value="salida"><span>Salida de bodega</span></label>
        </div>
      </div>
      ${campoNumero('cantidad', 'Cantidad', '', { requerido: true, sufijo: '—' })}
      <label class="campo">
        <span class="campo-etiqueta">Motivo <span class="req">*</span></span>
        <select name="motivo"><option value="">Elige un motivo</option>${motivos.map((m) => `<option value="${esc(m.id)}">${esc(m.nombre)}</option>`).join('')}</select>
      </label>
      <div data-costo class="campo-ancho">
        ${campoNumero('costo', 'Costo por unidad', '', { sufijo: '$', ayuda: info('Cuánto vale cada unidad que entra, para valorizar la bodega. Si lo regalaron, igual conviene poner lo que costaría comprarlo: así las piezas que lo usan quedan bien costeadas.') })}
      </div>
      <label class="campo">
        <span class="campo-etiqueta">Fecha</span>
        <input type="date" name="fecha" value="${hoyISO()}" max="${hoyISO()}">
      </label>
      <label class="campo">
        <span class="campo-etiqueta">Nota</span>
        <input name="nota" maxlength="200" placeholder="Opcional">
      </label>
    </div>
    <p class="texto-suave" data-previa></p>`;
  await formulario({
    titulo: 'Ajuste de inventario', cuerpo, textoGuardar: 'Registrar ajuste',
    montar(dlg, form) {
      const sufCant = form.cantidad.nextElementSibling;
      const sufCosto = form.costo.nextElementSibling;
      const previa = () => {
        const ins = estado.insumos[form.insumo.value];
        const u = ins ? nombreUnidad(ins.unidad) : '';
        if (sufCant) sufCant.textContent = u;
        if (sufCosto) sufCosto.textContent = ins ? `$/${u}` : '$';
        const ingreso = form.sentido.value === 'ingreso';
        $('[data-costo]', dlg).hidden = !ingreso;
        if (ins && ingreso && !form.costo.dataset.tocado) form.costo.value = costoActual(ins) ? numero(costoActual(ins), 4) : '';
        const c = leerNumero(form.cantidad.value);
        $('[data-previa]', dlg).textContent = ins && c > 0
          ? `Stock actual: ${numero(ins.stock || 0)} ${u} → quedará en ${numero((ins.stock || 0) + (ingreso ? c : -c))} ${u}.`
          : ins ? `Stock actual: ${numero(ins.stock || 0)} ${u}.` : '';
      };
      form.costo.addEventListener('input', () => { form.costo.dataset.tocado = '1'; });
      form.insumo.addEventListener('change', () => { delete form.costo.dataset.tocado; previa(); });
      dlg.addEventListener('input', previa);
      dlg.addEventListener('change', previa);
      previa();
    },
    guardar(form) {
      const ins = estado.insumos[form.insumo.value];
      if (!ins) return 'Elige el insumo.';
      const c = leerNumero(form.cantidad.value);
      if (!(c > 0)) return 'Escribe una cantidad mayor que cero.';
      if (!form.motivo.value) return 'Elige el motivo del ajuste.';
      const ingreso = form.sentido.value === 'ingreso';
      let costo = null;
      if (ingreso) {
        costo = form.costo.value.trim() ? leerNumero(form.costo.value) : 0;
        if (Number.isNaN(costo) || costo < 0) return 'El costo debe ser un número positivo, o 0.';
      }
      const lote = nuevoLote();
      agregarMovimiento(lote, {
        insumoId: ins.id, cantidad: ingreso ? c : -c, tipo: 'ajuste', fecha: form.fecha.value || hoyISO(),
        costoUnitario: costo, actualizaCosto: false, motivo: form.motivo.value, nota: form.nota.value.trim()
      });
      enviar(lote.commit(), { alGuardar: avisoGuardado(toast, `Ajuste registrado: ${ingreso ? '+' : '−'}${numero(c)} ${nombreUnidad(ins.unidad)} de ${ins.nombre}`), alFallar: fallo });
      return null;
    }
  });
}

// ---------------------------------------------------------------- Inventario inicial
async function inventarioInicial() {
  const lista = insumosActivos();
  const algunoCargado = lista.some((i) => i.conMovimientos);
  const cuerpo = `
    <p class="texto-suave">Anota lo que ya hay en el taller. Deja en blanco lo que no tengas. ${info('No crea gastos ni aparece en el IVA: solo registra la cantidad y lo que vale. El costo por unidad es lo que pagaste o pagarías hoy; si no lo sabes exacto, una buena estimación basta y después las compras lo irán actualizando.')}</p>
    ${algunoCargado ? '<p class="aviso aviso-suave">Algunos insumos ya tienen movimientos (marcados abajo). Si vuelves a cargarlos aquí, la cantidad se <strong>suma</strong> a lo que ya hay. Para corregir lo que hay, usa «Conteo físico».</p>' : ''}
    <label class="campo campo-fecha">
      <span class="campo-etiqueta">Fecha del inventario</span>
      <input type="date" name="fecha" value="${hoyISO()}" max="${hoyISO()}">
    </label>
    <div class="tabla-scroll">
      <table class="tabla tabla-entrada">
        <thead><tr><th>Insumo</th><th class="num">Cantidad</th><th class="num">Costo por unidad</th><th class="num">Valor</th></tr></thead>
        <tbody>
          ${lista.map((i) => `
            <tr data-id="${esc(i.id)}">
              <td><span class="celda-nombre">${esc(i.nombre)}</span>${i.conMovimientos ? ' <span class="etiqueta">Ya cargado</span>' : ''}<span class="celda-sub">${esc(nombreItem('tiposInsumo', i.tipo))}</span></td>
              <td class="num"><span class="con-sufijo"><input data-c inputmode="decimal" aria-label="Cantidad de ${esc(i.nombre)}"><span class="sufijo">${esc(nombreUnidad(i.unidad))}</span></span></td>
              <td class="num"><span class="con-sufijo"><input data-p inputmode="decimal" value="${costoActual(i) ? esc(numero(costoActual(i), 4)) : ''}" aria-label="Costo por unidad de ${esc(i.nombre)}"><span class="sufijo">$/${esc(nombreUnidad(i.unidad))}</span></span></td>
              <td class="num" data-v>—</td>
            </tr>`).join('')}
        </tbody>
        <tfoot><tr><th colspan="3">Total</th><th class="num" data-total>$0</th></tr></tfoot>
      </table>
    </div>`;
  await formulario({
    titulo: 'Inventario inicial', cuerpo, ancho: true, textoGuardar: 'Guardar inventario',
    montar(dlg) {
      const recalcular = () => {
        let total = 0;
        $$('tbody tr', dlg).forEach((tr) => {
          const c = leerNumero($('[data-c]', tr).value);
          const p = leerNumero($('[data-p]', tr).value);
          const v = c > 0 && p >= 0 ? c * p : NaN;
          $('[data-v]', tr).textContent = Number.isFinite(v) ? pesos(v) : '—';
          if (Number.isFinite(v)) total += v;
        });
        $('[data-total]', dlg).textContent = pesos(total);
      };
      dlg.addEventListener('input', recalcular);
    },
    guardar(form, dlg) {
      const filas = [];
      for (const tr of $$('tbody tr', dlg)) {
        const ct = $('[data-c]', tr).value.trim();
        if (!ct) continue;
        const ins = estado.insumos[tr.dataset.id];
        const c = leerNumero(ct);
        if (!(c > 0)) return `La cantidad de «${ins.nombre}» debe ser mayor que cero.`;
        const pt = $('[data-p]', tr).value.trim();
        const p = leerNumero(pt);
        if (!pt || Number.isNaN(p) || p < 0) return `Falta el costo por unidad de «${ins.nombre}». Si no lo sabes, escribe una estimación.`;
        filas.push({ ins, c, p });
      }
      if (!filas.length) return 'Escribe la cantidad de al menos un insumo.';
      const fecha = form.fecha.value || hoyISO();
      const lote = nuevoLote();
      filas.forEach(({ ins, c, p }) => agregarMovimiento(lote, {
        insumoId: ins.id, cantidad: c, tipo: 'inicial', fecha, costoUnitario: p, actualizaCosto: true, motivo: 'inventario-inicial'
      }));
      enviar(lote.commit(), { alGuardar: avisoGuardado(toast, `Inventario inicial guardado: ${filas.length} insumo${filas.length > 1 ? 's' : ''}`), alFallar: fallo });
      return null;
    }
  });
}

// ---------------------------------------------------------------- Conteo físico
async function conteoFisico() {
  const lista = insumosActivos();
  const cuerpo = `
    <p class="texto-suave">Cuenta o pesa lo que hay en bodega y anótalo. Lo que dejes en blanco no se toca. Al guardar, la app crea un ajuste por cada diferencia. ${info('Las diferencias quedan como ajustes con motivo «Conteo físico». Lo que falta sale a costo promedio; lo que sobra entra al costo actual. No crea gastos.')}</p>
    <div class="campos">
      <label class="campo">
        <span class="campo-etiqueta">Tipo</span>
        <select data-filtro><option value="">Todos</option>${opcionesLista('tiposInsumo')}</select>
      </label>
      <label class="campo">
        <span class="campo-etiqueta">Fecha del conteo</span>
        <input type="date" name="fecha" value="${hoyISO()}" max="${hoyISO()}">
      </label>
    </div>
    <div class="tabla-scroll">
      <table class="tabla tabla-entrada">
        <thead><tr><th>Insumo</th><th class="num">Según sistema</th><th class="num">Contado</th><th class="num">Diferencia</th></tr></thead>
        <tbody>
          ${lista.map((i) => `
            <tr data-id="${esc(i.id)}" data-tipo="${esc(i.tipo)}">
              <td><span class="celda-nombre">${esc(i.nombre)}</span></td>
              <td class="num">${numero(i.stock || 0)} ${esc(nombreUnidad(i.unidad))}</td>
              <td class="num"><span class="con-sufijo"><input data-c inputmode="decimal" aria-label="Contado de ${esc(i.nombre)}"><span class="sufijo">${esc(nombreUnidad(i.unidad))}</span></span></td>
              <td class="num" data-d>—</td>
            </tr>`).join('')}
        </tbody>
      </table>
    </div>
    <p class="texto-suave" data-resumen></p>`;
  await formulario({
    titulo: 'Conteo físico', cuerpo, ancho: true, textoGuardar: 'Guardar conteo',
    montar(dlg) {
      $('[data-filtro]', dlg).addEventListener('change', (e) => {
        $$('tbody tr', dlg).forEach((tr) => { tr.hidden = Boolean(e.target.value) && tr.dataset.tipo !== e.target.value; });
      });
      dlg.addEventListener('input', () => {
        let n = 0;
        $$('tbody tr', dlg).forEach((tr) => {
          const ins = estado.insumos[tr.dataset.id];
          const t = $('[data-c]', tr).value.trim();
          const c = leerNumero(t);
          const cel = $('[data-d]', tr);
          if (!t || Number.isNaN(c)) { cel.textContent = '—'; cel.className = 'num'; return; }
          const d = c - (ins.stock || 0);
          if (Math.abs(d) > 1e-9) n++;
          cel.textContent = Math.abs(d) < 1e-9 ? 'Cuadra' : `${d > 0 ? '+' : '−'}${numero(Math.abs(d))}`;
          cel.className = `num ${Math.abs(d) < 1e-9 ? 'cuadra' : d > 0 ? 'entra' : 'sale'}`;
        });
        $('[data-resumen]', dlg).textContent = n ? `Se crearán ${n} ajuste${n > 1 ? 's' : ''}.` : '';
      });
    },
    guardar(form, dlg) {
      const difs = [];
      for (const tr of $$('tbody tr', dlg)) {
        const t = $('[data-c]', tr).value.trim();
        if (!t) continue;
        const ins = estado.insumos[tr.dataset.id];
        const c = leerNumero(t);
        if (Number.isNaN(c) || c < 0) return `Lo contado de «${ins.nombre}» debe ser un número, 0 o más.`;
        const d = c - (ins.stock || 0);
        if (Math.abs(d) > 1e-9) difs.push({ ins, d, c });
      }
      if (!difs.length) return 'No hay diferencias que registrar. Si todo cuadra, no hace falta guardar.';
      const fecha = form.fecha.value || hoyISO();
      const lote = nuevoLote();
      const cRef = refNueva('conteos');
      const ref = { tipo: 'conteo', id: cRef.id };
      const movs = difs.map(({ ins, d }) => agregarMovimiento(lote, {
        insumoId: ins.id, cantidad: d, tipo: 'conteo', fecha, costoUnitario: d > 0 ? costoActual(ins) : null,
        actualizaCosto: false, motivo: 'conteo-fisico', ref
      }));
      lote.set(cRef, { fecha, lineas: difs.map(({ ins, d, c }) => ({ insumoId: ins.id, nombre: ins.nombre, contado: c, diferencia: d })), movs, creadoMs: Date.now(), ...firma() });
      enviar(lote.commit(), { alGuardar: avisoGuardado(toast, `Conteo guardado: ${difs.length} ajuste${difs.length > 1 ? 's' : ''}`), alFallar: fallo });
      return null;
    }
  });
}

// ================================================================ Movimientos
function vistaMovimientos(el) {
  let n = 50;
  el.innerHTML = '<section class="panel tabla-panel" data-caja><p class="texto-suave relleno">Cargando…</p></section>';
  const caja = $('[data-caja]', el);
  async function cargar() {
    try {
      const movs = await ultimosMovimientos(n);
      if (!movs.length) { caja.innerHTML = vacio('Sin movimientos', 'Aquí aparecerán el inventario inicial, los ajustes, las preparaciones de recetas y, desde la entrega 2b, las compras.'); return; }
      caja.innerHTML = `<ul class="movs">${movs.map((m) => filaMov(m, true)).join('')}</ul>
        ${movs.length >= n ? '<div class="relleno centro"><button class="btn btn-suave" data-mas>Ver más</button></div>' : ''}`;
      $('[data-mas]', caja)?.addEventListener('click', () => { n += 50; cargar(); });
      $$('[data-anular]', caja).forEach((b) => b.addEventListener('click', async () => {
        if (await anularMovimiento(movs.find((m) => m.id === b.dataset.anular))) setTimeout(cargar, 300);
      }));
    } catch (e) {
      console.error(e);
      caja.innerHTML = '<p class="texto-suave relleno">No se pudieron cargar los movimientos. Revisa la conexión.</p>';
    }
  }
  cargar();
  return null;
}

// ================================================================ Piezas terminadas
function vistaPiezasInv(el) {
  let lotes = [];
  el.innerHTML = `
    <div class="resumen" data-resumen></div>
    <div data-proceso></div>
    <div class="barra-herramientas"><span class="espacio"></span><button class="btn btn-primario" data-ajuste>Ajuste de piezas</button></div>
    <div data-lista></div>`;
  $('[data-ajuste]', el).addEventListener('click', () => ajustePiezas());
  const pintar = () => {
    const fichas = Object.values(estado.piezas).filter((p) => !p.archivado).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
    const activos = lotes.filter((l) => !l.anulado);
    const primera = fichas.reduce((s, p) => s + (p.stock || 0), 0);
    const segunda = fichas.reduce((s, p) => s + (p.stockSegunda || 0), 0);
    const valor = fichas.reduce((s, p) => s + (p.valorStock || 0), 0);
    const proceso = activos.reduce((s, l) => s + l.cantidadActual, 0);
    $('[data-resumen]', el).innerHTML = `
      <div class="dato"><span class="dato-etq">Terminadas de primera</span><span class="dato-valor">${numero(primera, 0)}</span></div>
      <div class="dato"><span class="dato-etq">De segunda</span><span class="dato-valor">${numero(segunda, 0)}</span></div>
      <div class="dato"><span class="dato-etq">En proceso</span><span class="dato-valor">${numero(proceso, 0)}</span></div>
      <div class="dato"><span class="dato-etq">Valor de lo terminado ${info('Lo que costó hacer las piezas que hay en stock, con sus mermas, horas y quemas.')}</span><span class="dato-valor">${pesos(valor)}</span></div>`;
    const porEtapa = ['modelado', 'seco', 'bizcochado', 'esmaltado'].map((k) => {
      const ls = activos.filter((l) => l.etapa === k);
      const grupos = new Map();
      ls.forEach((l) => grupos.set(l.piezaNombre, (grupos.get(l.piezaNombre) || 0) + l.cantidadActual));
      return { k, txt: [...grupos.entries()].map(([n, c]) => `${c} ${n}`).join(', ') };
    }).filter((x) => x.txt);
    $('[data-proceso]', el).innerHTML = porEtapa.length ? `
      <section class="panel"><div class="panel-cabecera"><h2>En proceso</h2><a class="enlace-chico" href="#/produccion/lotes">Ver lotes</a></div>
        <ul class="lista-bajos">${porEtapa.map((x) => `<li><span>${esc(ETAPAS[x.k].nombre)}</span><span>${esc(x.txt)}</span></li>`).join('')}</ul></section>` : '';
    const lista = $('[data-lista]', el);
    if (!fichas.length) { lista.innerHTML = vacio('Sin piezas todavía', 'Crea las fichas en Producción → Piezas. Las que ya tienes hechas puedes cargarlas aquí con «Ajuste de piezas» y motivo «Inventario inicial».', '<a class="btn btn-primario" href="#/produccion/piezas">Crear fichas</a>'); return; }
    lista.innerHTML = `<section class="panel tabla-panel"><ul class="filas">${fichas.map((p) => {
      const enP = activos.filter((l) => l.piezaId === p.id).reduce((s, l) => s + l.cantidadActual, 0);
      return `<li><button class="fila" data-id="${esc(p.id)}">
        <span class="fila-principal"><span class="fila-nombre">${esc(p.nombre)}</span>
          <span class="fila-meta"><span>${esc(nombreItem('categoriasPieza', p.categoria))} · ${esc(p.tamano)}</span>${enP ? `<span>${enP} en proceso</span>` : ''}${p.tipo === 'unica' ? `<span class="etiqueta">${esc({ disponible: 'Disponible', reservada: 'Reservada', vendida: 'Vendida' }[p.estadoUnica] || 'Única')}</span>` : ''}</span></span>
        <span class="fila-dato fila-dato-fuerte"><span class="fila-etq">Primera</span>${numero(p.stock || 0, 0)}</span>
        <span class="fila-dato"><span class="fila-etq">Segunda</span>${numero(p.stockSegunda || 0, 0)}</span>
      </button></li>`;
    }).join('')}</ul></section>`;
    $$('.fila', lista).forEach((b) => b.addEventListener('click', () => detallePieza(estado.piezas[b.dataset.id])));
  };
  const des = [alCambiar(pintar), escucharDonde('lotes', 'estado', '==', 'en-proceso', (l) => { lotes = l; pintar(); })];
  pintar();
  return () => des.forEach((u) => u());
}

async function detallePieza(p) {
  await formulario({
    titulo: p.nombre, ancho: true, textoGuardar: '',
    extra: '<button type="button" class="btn btn-suave" data-ajustar>Ajustar</button>',
    cuerpo: `
      <div class="resumen resumen-chico">
        <div class="dato"><span class="dato-etq">De primera</span><span class="dato-valor">${numero(p.stock || 0, 0)}</span></div>
        <div class="dato"><span class="dato-etq">De segunda</span><span class="dato-valor">${numero(p.stockSegunda || 0, 0)}</span></div>
        <div class="dato"><span class="dato-etq">Costo real del último lote</span><span class="dato-valor">${p.costoUltimo ? pesos(p.costoUltimo) : '—'}</span></div>
      </div>
      <h3>Movimientos</h3><div data-hist><p class="texto-suave">Cargando…</p></div>`,
    async montar(dlg, form, cerrar) {
      $('[data-ajustar]', dlg).addEventListener('click', () => { cerrar(); ajustePiezas(p.id); });
      const caja = $('[data-hist]', dlg);
      try {
        const movs = (await documentosPorCampo('movPiezas', 'piezaId', p.id)).sort((a, b) => b.fecha.localeCompare(a.fecha) || b.creadoMs - a.creadoMs);
        if (!movs.length) { caja.innerHTML = '<p class="texto-suave">Sin movimientos todavía.</p>'; return; }
        caja.innerHTML = `<ul class="movs">${movs.slice(0, 100).map((m) => `
          <li class="mov ${m.anulado ? 'anulado' : ''}">
            <span class="mov-fecha">${fechaCorta(m.fecha)}</span>
            <span class="mov-desc"><span>${esc(m.tipo === 'produccion' ? 'Sale del horno' : m.tipo === 'anulacion' ? 'Anulación' : `Ajuste · ${nombreItem('motivosAjuste', m.motivo)}`)}${m.calidad === 'segunda' ? ' · de segunda' : ''}${m.nota ? ` · ${esc(m.nota)}` : ''}</span>
              <span class="texto-tenue mov-quien">${esc((m.actualizadoPor || '').split('@')[0])}</span></span>
            <span class="mov-cant ${m.cantidad >= 0 ? 'entra' : 'sale'}">${m.cantidad >= 0 ? '+' : '−'}${numero(Math.abs(m.cantidad), 0)} u</span>
            <span class="mov-valor">${pesos(Math.abs(m.valor || 0))}</span>
            <span class="mov-acc">${m.anulado ? '<span class="etiqueta etiqueta-suave">Anulado</span>' : m.tipo === 'ajuste' ? `<button type="button" class="btn-enlace" data-anular="${esc(m.id)}">Anular</button>` : ''}</span>
          </li>`).join('')}</ul>`;
        $$('[data-anular]', caja).forEach((b) => b.addEventListener('click', async () => {
          const m = movs.find((x) => x.id === b.dataset.anular);
          if (!(await confirmar('Anular ajuste', `Se registra el movimiento contrario (${m.cantidad >= 0 ? '−' : '+'}${Math.abs(m.cantidad)} u) y este queda anulado.`, 'Anular', true))) return;
          const lote = nuevoLote();
          const contra = movimientoPieza(lote, { piezaId: p.id, calidad: m.calidad, cantidad: -m.cantidad, costoUnitario: m.cantidad < 0 ? m.costoUnitario : null, tipo: 'anulacion', fecha: m.fecha, ref: { tipo: 'movPieza', id: m.id } });
          lote.update(refDoc('movPiezas', m.id), { anulado: true, anuladoEn: Date.now(), anulacionId: contra.id, ...firma() });
          enviar(lote.commit(), { alGuardar: avisoGuardado(toast, 'Ajuste anulado'), alFallar: fallo });
          cerrar();
        }));
      } catch (e) {
        console.error(e);
        caja.innerHTML = '<p class="texto-suave">No se pudo cargar el historial. Revisa la conexión.</p>';
      }
    }
  });
}

async function ajustePiezas(piezaId = '') {
  const fichas = Object.values(estado.piezas).filter((p) => !p.archivado).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  if (!fichas.length) { toast('Primero crea las fichas en Producción → Piezas.', 'aviso'); return; }
  const motivos = itemsActivos('motivosAjuste').filter((m) => m.id !== 'conteo-fisico');
  await formulario({
    titulo: 'Ajuste de piezas', textoGuardar: 'Registrar ajuste',
    cuerpo: `
      <p class="texto-suave">Para piezas terminadas que entran o salen sin pasar por un lote ni una venta: las que ya tenías hechas (inventario inicial), una que se rompió en bodega, un regalo. ${info('Las piezas que entran necesitan un costo por unidad para valorizar el stock. Viene precargado con el costo de la ficha; cámbialo si sabes el real.')}</p>
      <div class="campos">
        <label class="campo campo-ancho"><span class="campo-etiqueta">Pieza</span><select name="pieza">${fichas.map((p) => `<option value="${esc(p.id)}" ${p.id === piezaId ? 'selected' : ''}>${esc(p.nombre)}</option>`).join('')}</select></label>
        <div class="campo campo-ancho"><div class="segmentado" role="radiogroup">
          <label><input type="radio" name="sentido" value="ingreso" checked><span>Entran</span></label>
          <label><input type="radio" name="sentido" value="salida"><span>Salen</span></label>
        </div></div>
        <div class="campo campo-ancho"><div class="segmentado segmentado-chico" role="radiogroup">
          <label><input type="radio" name="calidad" value="primera" checked><span>De primera</span></label>
          <label><input type="radio" name="calidad" value="segunda"><span>De segunda</span></label>
        </div></div>
        ${campoNumero('cantidad', 'Piezas', '', { requerido: true, sufijo: 'u' })}
        <label class="campo"><span class="campo-etiqueta">Motivo <span class="req">*</span></span><select name="motivo"><option value="">Elige un motivo</option>${motivos.map((m) => `<option value="${esc(m.id)}">${esc(m.nombre)}</option>`).join('')}</select></label>
        <div data-costo class="campo-ancho">${campoNumero('costo', 'Costo por pieza', '', { sufijo: '$' })}</div>
        <label class="campo"><span class="campo-etiqueta">Fecha</span><input type="date" name="fecha" value="${hoyISO()}" max="${hoyISO()}"></label>
        <label class="campo"><span class="campo-etiqueta">Nota</span><input name="nota" maxlength="200" placeholder="Opcional"></label>
      </div>`,
    montar(dlg, form) {
      const v = () => {
        const p = estado.piezas[form.pieza.value];
        $('[data-costo]', dlg).hidden = form.sentido.value !== 'ingreso';
        if (!form.costo.dataset.tocado) form.costo.value = numero(p.costoUltimo || costoFicha(p).total, 0);
      };
      form.costo.addEventListener('input', () => { form.costo.dataset.tocado = '1'; });
      form.pieza.addEventListener('change', () => { delete form.costo.dataset.tocado; });
      dlg.addEventListener('change', v);
      v();
    },
    guardar(form) {
      const p = estado.piezas[form.pieza.value];
      const c = leerNumero(form.cantidad.value);
      if (!Number.isInteger(c) || c <= 0) return 'Escribe un número entero de piezas.';
      if (!form.motivo.value) return 'Elige el motivo del ajuste.';
      const ingreso = form.sentido.value === 'ingreso';
      const calidad = form.calidad.value;
      const hay = calidad === 'segunda' ? (p.stockSegunda || 0) : (p.stock || 0);
      if (!ingreso && c > hay) return `Solo hay ${hay} de ${calidad}.`;
      const costo = ingreso ? leerNumero(form.costo.value) : null;
      if (ingreso && !(costo >= 0)) return 'Escribe el costo por pieza.';
      const lote = nuevoLote();
      movimientoPieza(lote, { piezaId: p.id, calidad, cantidad: ingreso ? c : -c, costoUnitario: ingreso ? costo : null, tipo: 'ajuste', fecha: form.fecha.value || hoyISO(), motivo: form.motivo.value, nota: form.nota.value.trim() });
      enviar(lote.commit(), { alGuardar: avisoGuardado(toast, `Ajuste registrado: ${ingreso ? '+' : '−'}${c} ${p.nombre}`), alFallar: fallo });
      return null;
    }
  });
}
