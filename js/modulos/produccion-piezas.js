// Producción → Piezas, Lotes y Quemas.
import { estado, alCambiar, enviar, firma, itemsActivos, nombreItem } from '../datos.js';
import {
  esc, info, toast, $, $$, formulario, dialogo, leerNumero, numero, pesos, pesosUnidad, hoyISO, fechaCorta
} from '../ui.js';
import { nuevoLote, refDoc, escucharDonde, documentosDonde, ultimosDocumentos, insumosActivos, costoActual } from '../stock.js';
import { opcionesLista, opcionesInsumos, nombreUnidad, campoNumero, vacio, avisoError, avisoGuardado } from '../comunes.js';
import {
  TAMANOS, puntosDe, horno, costoFicha, precioNeto, margen, ETAPAS, costoLote, crearLote, registrarSecado,
  registrarEsmaltado, terminarLote, registrarQuema, anularLote, costoEnergia, costoQuemaEstimado, refPieza, enUnidadDe,
  hornoPorId, kwhTipico, kwhEnergia, valorVenta, costoPorPunto
} from '../piezas-core.js';
import { diasEntre } from '../gastos-core.js';
import { ICONOS } from '../iconos.js';

const fallo = avisoError(toast);
const pct = (x) => (x == null ? '—' : `${numero(x * 100, 0)} %`);
const norm = (t) => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

// Lotes en proceso, compartidos por las tres vistas mientras están abiertas.
let lotesActivos = [];

// ================================================================ Piezas (fichas)
export function vistaPiezas(el) {
  const f = { texto: '', cat: '', archivadas: false };
  el.innerHTML = `
    <div class="barra-herramientas">
      <input type="search" class="buscador" placeholder="Buscar pieza" aria-label="Buscar pieza">
      <select class="filtro" aria-label="Categoría"><option value="">Todas las categorías</option>${opcionesLista('categoriasPieza')}</select>
      <label class="interruptor"><input type="checkbox" data-arch><span>Archivadas</span></label>
      <span class="espacio"></span>
      <button class="btn btn-primario" data-nueva>${ICONOS.mas2}<span>Nueva ficha</span></button>
    </div>
    <div data-lista></div>`;
  $('.buscador', el).addEventListener('input', (e) => { f.texto = e.target.value; pintar(); });
  $('.filtro', el).addEventListener('change', (e) => { f.cat = e.target.value; pintar(); });
  $('[data-arch]', el).addEventListener('change', (e) => { f.archivadas = e.target.checked; pintar(); });
  $('[data-nueva]', el).addEventListener('click', () => editarFicha());
  const lista = $('[data-lista]', el);

  function pintar() {
    const todas = Object.values(estado.piezas);
    if (!todas.length) {
      lista.innerHTML = vacio('Todavía no hay fichas de pieza',
        'Una ficha dice con qué se hace una pieza: cuánta pasta, cuánto esmalte, cuántas horas y su tamaño en el horno. Con eso la app calcula su costo y su margen. Una serie se repite; una pieza única tiene su propio precio.',
        '<button class="btn btn-primario" data-nueva2>Crear la primera ficha</button>');
      $('[data-nueva2]', lista)?.addEventListener('click', () => editarFicha());
      return;
    }
    const q = norm(f.texto.trim());
    const vis = todas.filter((p) => Boolean(p.archivado) === f.archivadas && (!f.cat || p.categoria === f.cat) && (!q || norm(p.nombre).includes(q)))
      .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
    if (!vis.length) { lista.innerHTML = vacio('Sin resultados', 'Prueba con otra búsqueda o cambia el filtro.'); return; }
    lista.innerHTML = `<p class="texto-suave nota-lista">Costo estimado de una pieza con los precios de hoy: pasta, esmaltes, otros insumos, horas y su parte de las quemas, sin mermas. ${info('El costo real de cada lote, con lo que se pierde en el camino, se ve en Lotes al terminar.')}</p>
      <div class="tarjetas">${vis.map((p) => {
      const c = costoFicha(p);
      const enProceso = lotesActivos.filter((l) => l.piezaId === p.id).reduce((s, l) => s + l.cantidadActual, 0);
      const m = margen(precioNeto(p), c.total);
      return `
        <article class="tarjeta">
          <button class="tarjeta-cuerpo" data-editar="${esc(p.id)}">
            <span class="tarjeta-tipo">${p.tipo === 'unica' ? 'Pieza única' : 'Serie'} · ${esc(nombreItem('categoriasPieza', p.categoria))} · ${esc(p.tamano)}</span>
            <span class="tarjeta-nombre">${esc(p.nombre)}</span>
            <span class="tarjeta-detalle">${p.tipo === 'unica'
              ? esc({ disponible: 'Disponible', reservada: 'Reservada', vendida: 'Vendida', 'sin-stock': 'Sin terminar' }[p.estadoUnica] || 'En proceso o sin hacer')
              : `${numero(p.stock || 0, 0)} de primera${p.stockSegunda ? ` · ${numero(p.stockSegunda, 0)} de segunda` : ''}${enProceso ? ` · ${enProceso} en proceso` : ''}`}</span>
            <dl class="tarjeta-datos">
              <div><dt>Costo</dt><dd>${pesos(c.total)}</dd></div>
              <div><dt>Precio</dt><dd>${p.precioB2C ? pesos(p.precioB2C) : '—'}</dd></div>
              <div><dt>Margen</dt><dd class="${m != null && m < 0.3 ? 'texto-alerta' : ''}">${p.precioB2C ? pct(m) : '—'}</dd></div>
            </dl>
          </button>
          ${p.archivado || (p.tipo === 'unica' && p.loteCreado) ? '' : `<button class="btn btn-suave tarjeta-accion" data-lote="${esc(p.id)}">${p.tipo === 'unica' ? 'Empezar pieza' : 'Nuevo lote'}</button>`}
        </article>`;
    }).join('')}</div>`;
    $$('[data-editar]', lista).forEach((b) => b.addEventListener('click', () => editarFicha(estado.piezas[b.dataset.editar])));
    $$('[data-lote]', lista).forEach((b) => b.addEventListener('click', () => nuevoLoteDialogo(estado.piezas[b.dataset.lote])));
  }
  const des = [alCambiar(pintar), escucharDonde('lotes', 'estado', '==', 'en-proceso', (l) => { lotesActivos = l; pintar(); })];
  pintar();
  return () => des.forEach((u) => u());
}

function filaInsumo(tipo, item, unidadEtq) {
  const div = document.createElement('div');
  div.className = 'formato-fila';
  div.dataset.fila = tipo;
  div.innerHTML = `
    <select data-fi aria-label="Insumo">${opcionesInsumos(item.insumoId || '')}</select>
    <span class="con-sufijo"><input data-fc inputmode="decimal" value="${item.cantidad != null && item.cantidad !== '' ? esc(numero(item.cantidad, 3)) : ''}" placeholder="Cantidad" aria-label="Cantidad por pieza"><span class="sufijo" data-fu>${esc(unidadEtq(item.insumoId))}</span></span>
    <button type="button" class="btn-icono" aria-label="Quitar">✕</button>`;
  div.querySelector('button').addEventListener('click', () => { div.remove(); div.dispatchEvent(new Event('input', { bubbles: true })); });
  div.querySelector('[data-fi]').addEventListener('change', (e) => { div.querySelector('[data-fu]').textContent = unidadEtq(e.target.value); });
  return div;
}

async function editarFicha(p = null) {
  const nueva = !p;
  const d = p || {
    nombre: '', tipo: 'serie', categoria: itemsActivos('categoriasPieza')[0]?.id || '', tamano: 'S', pastaId: '', pastaKg: null,
    esmaltes: [], sinEsmalte: false, otros: [], horas: null, precioB2C: null, precioB2B: null, notas: ''
  };
  const pastas = (i) => !i.elaborado || i.tipo === 'arcilla-y-pasta';
  const cuerpo = `
    <div class="campos">
      <label class="campo campo-ancho"><span class="campo-etiqueta">Nombre <span class="req">*</span></span>
        <input name="nombre" value="${esc(d.nombre)}" maxlength="80" placeholder="Ej.: Taza nube, Aguatero maebyong" autocomplete="off"></label>
      <div class="campo campo-ancho"><span class="campo-etiqueta">Tipo ${info('Serie: una pieza que repites, con una sola ficha y un precio. Pieza única: una sola, con su propio precio y estado (disponible, reservada, vendida).')}</span>
        <div class="segmentado" role="radiogroup">
          <label><input type="radio" name="tipo" value="serie" ${d.tipo !== 'unica' ? 'checked' : ''} ${!nueva ? 'disabled' : ''}><span>Serie</span></label>
          <label><input type="radio" name="tipo" value="unica" ${d.tipo === 'unica' ? 'checked' : ''} ${!nueva ? 'disabled' : ''}><span>Pieza única</span></label>
        </div></div>
      <label class="campo"><span class="campo-etiqueta">Categoría</span><select name="categoria">${opcionesLista('categoriasPieza', d.categoria)}</select></label>
      <div class="campo"><span class="campo-etiqueta">Tamaño en el horno ${info('Cuánto espacio ocupa en el horno: S 1 punto, M 2, L 4, XL 8. El costo de cada quema se reparte según los puntos. Ej.: taza de café S, plato de fondo L, fuente XL.')}</span>
        <div class="segmentado segmentado-chico" role="radiogroup">
          ${Object.keys(TAMANOS).map((k) => `<label><input type="radio" name="tamano" value="${k}" ${d.tamano === k ? 'checked' : ''}><span>${k}</span></label>`).join('')}
        </div></div>
    </div>

    <fieldset class="bloque"><legend>Materiales por pieza ${info('Lo que lleva UNA pieza. Son estimados: no hace falta pesar cada vez. La pasta es el peso de la arcilla cruda que usas, con recortes; el esmalte, los gramos de esmalte seco.')}</legend>
      <div class="campos">
        <label class="campo"><span class="campo-etiqueta">Pasta o arcilla</span><select name="pastaId">${opcionesInsumos(d.pastaId || '', { filtro: pastas, vacio: 'Sin pasta' })}</select></label>
        ${campoNumero('pastaKg', 'Pasta por pieza', d.pastaKg != null ? numero(d.pastaKg, 3) : '', { sufijo: 'kg', placeholder: 'Ej.: 0,45' })}
      </div>
      <label class="interruptor"><input type="checkbox" name="sinEsmalte" ${d.sinEsmalte ? 'checked' : ''}><span>Sin esmalte: se termina después del bizcocho</span></label>
      <div data-con-esmalte>
        <p class="sub-etiqueta">Esmaltes y engobes, en gramos por pieza</p>
        <div data-esmaltes></div>
        <button type="button" class="btn btn-suave btn-chico" data-agregar="esmalte">${ICONOS.mas2}<span>Agregar esmalte</span></button>
      </div>
      <p class="sub-etiqueta">Otros insumos ${info('Embalaje, corcho, llaves, cables de lámpara: se descuentan al terminar el lote, solo por las piezas que salieron bien. La cantidad va en la unidad del insumo.')}</p>
      <div data-otros></div>
      <button type="button" class="btn btn-suave btn-chico" data-agregar="otro">${ICONOS.mas2}<span>Agregar insumo</span></button>
    </fieldset>

    <div class="campos">
      ${campoNumero('horas', 'Horas de trabajo por pieza', d.horas != null ? numero(d.horas, 2) : '', { sufijo: 'h', placeholder: 'Ej.: 0,5', ayuda: info(`Torno, retorneado, asas, esmaltado y terminaciones de UNA pieza. Se valoriza a ${pesos(horno().valorHora || 0)} la hora (Configuración → Horno y trabajo).`) })}
      <span></span>
      ${campoNumero('precioB2C', 'Precio de venta con IVA', d.precioB2C != null ? numero(d.precioB2C, 0) : '', { sufijo: '$', ayuda: info('El precio para clientes finales, en feria o por Instagram. El margen se calcula sobre el neto (precio ÷ 1,19).') })}
      ${campoNumero('precioB2B', 'Precio a tiendas, neto', d.precioB2B != null ? numero(d.precioB2B, 0) : '', { sufijo: '$', ayuda: info('El precio sin IVA para tiendas y cafeterías, en órdenes de venta y consignación.') })}
      ${campoNumero('precioSegunda', 'Precio de segunda, con IVA', d.precioSegunda != null ? numero(d.precioSegunda, 0) : '', { sufijo: '$', placeholder: 'Opcional', ayuda: info('Para las piezas con defectos menores. Si lo dejas vacío, se usa el precio normal.') })}
      ${d.tipo === 'unica' && !nueva ? `<label class="campo"><span class="campo-etiqueta">Estado</span><select name="estadoUnica">${[['disponible', 'Disponible'], ['reservada', 'Reservada'], ['vendida', 'Vendida'], ['sin-stock', 'Sin terminar']].map(([k, t]) => `<option value="${k}" ${d.estadoUnica === k ? 'selected' : ''}>${t}</option>`).join('')}</select></label>` : ''}
    </div>
    <div class="desglose" data-desglose></div>
    <label class="campo"><span class="campo-etiqueta">Notas</span><textarea name="notas" rows="2" maxlength="500" placeholder="Medidas, cono, cómo se esmalta…">${esc(d.notas || '')}</textarea></label>`;

  const extra = nueva ? '' : `<button type="button" class="btn btn-suave" data-archivar>${d.archivado ? 'Reactivar' : 'Archivar'}</button>`;
  await formulario({
    titulo: nueva ? 'Nueva ficha de pieza' : d.nombre, cuerpo, extra, ancho: true,
    textoGuardar: nueva ? 'Crear ficha' : 'Guardar cambios',
    montar(dlg, form, cerrar) {
      const etqG = () => 'g';
      const etqU = (id) => { const u = estado.insumos[id]?.unidad; return !u ? '' : u === 'unidad' ? 'u' : nombreUnidad(u); };
      const cajaE = $('[data-esmaltes]', dlg);
      const cajaO = $('[data-otros]', dlg);
      (d.esmaltes || []).forEach((e) => cajaE.append(filaInsumo('esmalte', { insumoId: e.insumoId, cantidad: e.gramos }, etqG)));
      (d.otros || []).forEach((o) => cajaO.append(filaInsumo('otro', o, etqU)));
      $$('[data-agregar]', dlg).forEach((b) => b.addEventListener('click', () => {
        const tipo = b.dataset.agregar;
        (tipo === 'esmalte' ? cajaE : cajaO).append(filaInsumo(tipo, {}, tipo === 'esmalte' ? etqG : etqU));
      }));
      const calcular = () => {
        const x = leerFicha(form, dlg, d);
        $('[data-con-esmalte]', dlg).hidden = x.sinEsmalte;
        const c = costoFicha(x);
        const mC = margen(precioNeto(x), c.total);
        const mB = margen(x.precioB2B || 0, c.total);
        $('[data-desglose]', dlg).innerHTML = `
          <div class="desglose-fila"><span>Pasta</span><span>${pesos(c.pasta)}</span></div>
          <div class="desglose-fila"><span>Esmaltes</span><span>${pesos(c.esmalte)}</span></div>
          <div class="desglose-fila"><span>Otros insumos</span><span>${pesos(c.otros)}</span></div>
          <div class="desglose-fila"><span>Horas</span><span>${pesos(c.horas)}</span></div>
          <div class="desglose-fila"><span>Quemas, tamaño ${esc(x.tamano)} ${info(`${puntosDe(x.tamano)} punto${puntosDe(x.tamano) > 1 ? 's' : ''} a ${pesos(costoPorPunto(!x.sinEsmalte))} por punto${x.sinEsmalte ? ', solo bizcocho' : ', bizcocho y esmalte'}, con los hornos llenos. Cambia los consumos y capacidades en Configuración → Horno y trabajo.`)}</span><span>${pesos(c.quemas)}</span></div>
          <div class="desglose-fila desglose-total"><span>Costo por pieza</span><span>${pesos(c.total)}</span></div>
          ${x.precioB2C ? `<div class="desglose-fila"><span>Margen venta directa (neto ${pesos(precioNeto(x))})</span><span class="${mC < 0.3 ? 'texto-alerta' : 'entra'}">${pct(mC)}</span></div>` : ''}
          ${x.precioB2B ? `<div class="desglose-fila"><span>Margen a tiendas</span><span class="${mB < 0.3 ? 'texto-alerta' : 'entra'}">${pct(mB)}</span></div>` : ''}
          <p class="texto-tenue">Sin mermas. El costo real de cada lote suma las piezas que se pierden.</p>`;
      };
      dlg.addEventListener('input', calcular);
      dlg.addEventListener('change', calcular);
      calcular();
      $('[data-archivar]', dlg)?.addEventListener('click', () => {
        enviar(nuevoLote().update(refDoc('piezas', d.id), { archivado: !d.archivado, ...firma() }).commit(), {
          alGuardar: avisoGuardado(toast, d.archivado ? 'Ficha reactivada' : 'Ficha archivada'), alFallar: fallo
        });
        cerrar();
      });
    },
    guardar(form, dlg) {
      const x = leerFicha(form, dlg, d);
      if (!x.nombre) return 'Escribe el nombre de la pieza.';
      const rep = Object.values(estado.piezas).find((o) => o.id !== d.id && !o.archivado && norm(o.nombre) === norm(x.nombre));
      if (rep) return `Ya existe una ficha llamada «${rep.nombre}».`;
      if (x.pastaId && !(x.pastaKg > 0)) return 'Indica cuántos kg de pasta lleva cada pieza.';
      if (!x.pastaId && x.pastaKg) return 'Elige la pasta o arcilla.';
      for (const e of x.esmaltes) if (!e.insumoId || !(e.gramos > 0)) return 'Cada esmalte necesita su insumo y los gramos por pieza.';
      for (const o of x.otros) if (!o.insumoId || !(o.cantidad > 0)) return 'Cada insumo adicional necesita su cantidad por pieza.';
      for (const k of ['horas', 'precioB2C', 'precioB2B', 'precioSegunda']) if (Number.isNaN(x[k]) || x[k] < 0) return 'Revisa las horas y los precios: deben ser números positivos.';
      const datos = { ...x };
      delete datos.id;
      const lote = nuevoLote();
      if (nueva) lote.set(refPieza(), { ...datos, stock: 0, stockSegunda: 0, valorStock: 0, archivado: false, estadoUnica: x.tipo === 'unica' ? 'sin-stock' : null, creadoMs: Date.now(), ...firma() });
      else lote.update(refDoc('piezas', d.id), { ...datos, ...firma() });
      enviar(lote.commit(), { alGuardar: avisoGuardado(toast, nueva ? `Ficha «${x.nombre}» creada` : 'Ficha guardada'), alFallar: fallo });
      return null;
    }
  });
}

function leerFicha(form, dlg, d) {
  const n = (k) => (form.elements[k]?.value.trim() ? leerNumero(form.elements[k].value) : null);
  const filas = (tipo) => $$(`[data-fila="${tipo}"]`, dlg).map((f) => ({ insumoId: f.querySelector('[data-fi]').value, cantidad: leerNumero(f.querySelector('[data-fc]').value) }))
    .filter((f) => f.insumoId || Number.isFinite(f.cantidad));
  const sinEsmalte = form.sinEsmalte.checked;
  return {
    id: d.id,
    nombre: form.nombre.value.trim(),
    tipo: d.id ? d.tipo : form.tipo.value,
    categoria: form.categoria.value,
    tamano: form.tamano.value || 'S',
    pastaId: form.pastaId.value || null,
    pastaKg: n('pastaKg'),
    sinEsmalte,
    esmaltes: sinEsmalte ? [] : filas('esmalte').map((f) => ({ insumoId: f.insumoId, gramos: f.cantidad })),
    otros: filas('otro'),
    horas: n('horas'),
    precioB2C: n('precioB2C'),
    precioB2B: n('precioB2B'),
    precioSegunda: n('precioSegunda'),
    notas: form.notas.value.trim(),
    ...(form.estadoUnica ? { estadoUnica: form.estadoUnica.value } : {})
  };
}

// ================================================================ Lotes
async function nuevoLoteDialogo(fichaInicial = null) {
  const fichas = Object.values(estado.piezas).filter((p) => !p.archivado && !(p.tipo === 'unica' && p.loteCreado)).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  if (!fichas.length) { toast('Primero crea una ficha de pieza.', 'aviso'); return; }
  const cuerpo = `
    <p class="texto-suave">Un lote son las piezas que haces juntas y avanzan por las mismas etapas. Al crearlo se descuenta la pasta de bodega.</p>
    <div class="campos">
      <label class="campo campo-ancho"><span class="campo-etiqueta">Pieza</span>
        <select name="pieza">${fichas.map((p) => `<option value="${esc(p.id)}" ${p.id === fichaInicial?.id ? 'selected' : ''}>${esc(p.nombre)}${p.tipo === 'unica' ? ' (única)' : ''}</option>`).join('')}</select></label>
      ${campoNumero('cantidad', 'Piezas', '', { requerido: true, sufijo: 'u', placeholder: 'Ej.: 12' })}
      <label class="campo"><span class="campo-etiqueta">Fecha</span><input type="date" name="fecha" value="${hoyISO()}" max="${hoyISO()}"></label>
      <label class="campo campo-ancho"><span class="campo-etiqueta">Nota</span><input name="nota" maxlength="200" placeholder="Opcional: encargo, prueba de esmalte…"></label>
    </div>
    <p class="texto-suave" data-previa></p>`;
  await formulario({
    titulo: 'Nuevo lote', cuerpo, textoGuardar: 'Crear lote',
    montar(dlg, form) {
      const previa = () => {
        const p = estado.piezas[form.pieza.value];
        if (p?.tipo === 'unica') { form.cantidad.value = '1'; form.cantidad.readOnly = true; } else form.cantidad.readOnly = false;
        const c = leerNumero(form.cantidad.value) || 0;
        const pasta = estado.insumos[p?.pastaId];
        const kg = (p?.pastaKg || 0) * c;
        const falta = pasta && enUnidadDe(pasta, kg, 'kg') > (pasta.stock || 0);
        $('[data-previa]', dlg).innerHTML = !p || !c ? '' : `${pasta ? `Usa <strong>${numero(kg, 2)} kg</strong> de ${esc(pasta.nombre)} (hay ${numero(pasta.stock || 0)} ${esc(nombreUnidad(pasta.unidad))})${falta ? ' <span class="texto-alerta">· no alcanza según el sistema</span>' : ''}. ` : 'La ficha no tiene pasta. '}${p.horas ? `${numero(p.horas * c, 1)} horas de trabajo. ` : ''}`;
      };
      dlg.addEventListener('input', previa);
      dlg.addEventListener('change', previa);
      previa();
    },
    guardar(form) {
      const p = estado.piezas[form.pieza.value];
      const c = p.tipo === 'unica' ? 1 : leerNumero(form.cantidad.value);
      if (!(c > 0) || !Number.isInteger(c)) return 'La cantidad de piezas debe ser un número entero mayor que cero.';
      const lote = nuevoLote();
      crearLote(lote, { ficha: p, cantidad: c, fecha: form.fecha.value || hoyISO(), nota: form.nota.value.trim() });
      if (p.tipo === 'unica') lote.update(refDoc('piezas', p.id), { loteCreado: true, ...firma() });
      enviar(lote.commit(), { alGuardar: avisoGuardado(toast, `Lote creado: ${c} × ${p.nombre}`), alFallar: fallo });
      return null;
    }
  });
}

const accionesEtapa = (l) => {
  const f = estado.piezas[l.piezaId];
  if (l.etapa === 'modelado') return [['secado', 'Registrar secado', true]];
  if (l.etapa === 'seco') return [['crudo', 'Esmaltar en crudo', false]];
  if (l.etapa === 'bizcochado') return f?.sinEsmalte ? [['terminar', 'Terminar', true], ['esmaltar', 'Esmaltar', false]] : [['esmaltar', 'Esmaltar', true], ['terminar', 'Terminar sin esmalte', false]];
  return [];
};
const esperaQuema = (l) => (l.etapa === 'seco' ? 'Entra en la próxima quema de bizcocho' : l.etapa === 'esmaltado' ? 'Entra en la próxima quema de esmalte' : '');

export function vistaLotes(el) {
  let terminados = false;
  let viejos = [];
  el.innerHTML = `
    <div class="barra-herramientas">
      <label class="interruptor"><input type="checkbox" data-term><span>Ver terminados</span></label>
      <span class="espacio"></span>
      <button class="btn btn-suave" data-quema>Registrar quema</button>
      <button class="btn btn-primario" data-nuevo>${ICONOS.mas2}<span>Nuevo lote</span></button>
    </div>
    <div data-lista></div>`;
  $('[data-nuevo]', el).addEventListener('click', () => nuevoLoteDialogo());
  $('[data-quema]', el).addEventListener('click', () => quemaDialogo());
  $('[data-term]', el).addEventListener('change', async (e) => {
    terminados = e.target.checked;
    if (terminados) {
      try { viejos = (await documentosDonde('lotes', 'estado', '==', 'terminado')).sort((a, b) => (b.fechaFin || '').localeCompare(a.fechaFin || '')).slice(0, 60); } catch { viejos = []; }
    }
    pintar();
  });
  const lista = $('[data-lista]', el);
  function pintar() {
    if (terminados) {
      lista.innerHTML = viejos.length ? `<section class="panel tabla-panel"><ul class="filas">${viejos.map((l) => `
        <li><button class="fila" data-id="${esc(l.id)}">
          <span class="fila-principal"><span class="fila-nombre">${esc(l.piezaNombre)}</span>
            <span class="fila-meta"><span>${fechaCorta(l.fechaInicio)} → ${fechaCorta(l.fechaFin)}</span><span>${l.cantidadInicial} hechas · ${l.primera || 0} de primera${l.segunda ? ` · ${l.segunda} de segunda` : ''}${l.merma ? ` · ${l.merma} perdidas` : ''}</span></span></span>
          <span class="fila-dato fila-dato-fuerte"><span class="fila-etq">Costo real c/u</span>${l.costoUnitario ? pesos(l.costoUnitario) : '—'}</span>
        </button></li>`).join('')}</ul></section>` : vacio('Sin lotes terminados', 'Los lotes aparecen aquí cuando sale su última quema.');
      $$('.fila', lista).forEach((b) => b.addEventListener('click', () => detalleLote(viejos.find((l) => l.id === b.dataset.id))));
      return;
    }
    const activos = lotesActivos.filter((l) => !l.anulado);
    if (!activos.length) {
      lista.innerHTML = vacio('No hay lotes en proceso',
        Object.keys(estado.piezas).length ? 'Cuando empieces a tornear o modelar, crea un lote: la app sigue las piezas por secado, bizcocho, esmaltado y quema de esmalte, con lo que se pierde en cada etapa.' : 'Primero crea las fichas de tus piezas en la pestaña Piezas.',
        Object.keys(estado.piezas).length ? '<button class="btn btn-primario" data-nuevo2>Crear el primer lote</button>' : '<a class="btn btn-primario" href="#/produccion/piezas">Ir a Piezas</a>');
      $('[data-nuevo2]', lista)?.addEventListener('click', () => nuevoLoteDialogo());
      return;
    }
    const etapas = ['modelado', 'seco', 'bizcochado', 'esmaltado'];
    lista.innerHTML = `<div class="etapas">${etapas.map((k) => {
      const ls = activos.filter((l) => l.etapa === k).sort((a, b) => a.fechaInicio.localeCompare(b.fechaInicio));
      const n = ls.reduce((s, l) => s + l.cantidadActual, 0);
      return `
        <section class="etapa">
          <h2 class="etapa-titulo">${esc(ETAPAS[k].nombre)} <span class="lista-cuenta">${n} pieza${n === 1 ? '' : 's'}</span></h2>
          ${ls.length ? ls.map((l) => `
            <article class="lote">
              <button class="lote-cuerpo" data-id="${esc(l.id)}">
                <span class="lote-nombre">${l.cantidadActual} × ${esc(l.piezaNombre)}</span>
                <span class="lote-meta">Desde el ${fechaCorta(l.fechaInicio)} · ${diasEntre(l.fechaInicio, hoyISO())} días${l.merma ? ` · ${l.merma} perdida${l.merma > 1 ? 's' : ''}` : ''}</span>
                ${esperaQuema(l) ? `<span class="lote-meta lote-espera">${esc(esperaQuema(l))}</span>` : ''}
              </button>
              <div class="lote-acciones">${accionesEtapa(l).map(([a, t, prim]) => `<button class="btn ${prim ? 'btn-primario' : 'btn-suave'} btn-chico" data-accion="${a}" data-lote="${esc(l.id)}">${esc(t)}</button>`).join('')}</div>
            </article>`).join('') : '<p class="texto-tenue etapa-vacia">Nada aquí.</p>'}
        </section>`;
    }).join('')}</div>`;
    $$('.lote-cuerpo', lista).forEach((b) => b.addEventListener('click', () => detalleLote(activos.find((l) => l.id === b.dataset.id))));
    $$('[data-accion]', lista).forEach((b) => b.addEventListener('click', () => {
      const l = activos.find((x) => x.id === b.dataset.lote);
      ({ secado: secadoDialogo, crudo: esmaltadoDialogo, esmaltar: esmaltadoDialogo, terminar: terminarDialogo })[b.dataset.accion](l);
    }));
  }
  const des = [alCambiar(pintar), escucharDonde('lotes', 'estado', '==', 'en-proceso', (l) => { lotesActivos = l; pintar(); })];
  pintar();
  return () => des.forEach((u) => u());
}

const opcionesMerma = () => `<option value="">Motivo</option>${opcionesLista('motivosMerma')}`;

async function secadoDialogo(l) {
  const h = horno();
  await formulario({
    titulo: `Secado · ${l.cantidadActual} × ${l.piezaNombre}`,
    cuerpo: `
      <p class="texto-suave">¿Cuántas llegaron secas y sin grietas? Pasan a esperar la quema de bizcocho.</p>
      <div class="campos">
        ${campoNumero('buenas', 'Quedaron bien', String(l.cantidadActual), { sufijo: `de ${l.cantidadActual}` })}
        <label class="campo"><span class="campo-etiqueta">Fecha</span><input type="date" name="fecha" value="${hoyISO()}" max="${hoyISO()}"></label>
        <label class="campo" data-merma hidden><span class="campo-etiqueta">Por qué se perdieron</span><select name="motivo">${opcionesMerma()}</select></label>
        <label class="campo interruptor-campo" data-merma hidden><span class="campo-etiqueta">Arcilla ${info('Las piezas crudas agrietadas se pueden rehidratar. Si la reciclas, esa arcilla vuelve a bodega y su costo se descuenta del lote.')}</span>
          <span class="interruptor"><input type="checkbox" name="recicla" ${h.reciclaArcilla ? 'checked' : ''}><span>Se recicla y vuelve a bodega</span></span></label>
      </div>`,
    textoGuardar: 'Registrar secado',
    montar(dlg, form) {
      const v = () => { const b = leerNumero(form.buenas.value); $$('[data-merma]', dlg).forEach((x) => { x.hidden = !(b < l.cantidadActual); }); };
      form.buenas.addEventListener('input', v); v();
    },
    guardar(form) {
      const b = leerNumero(form.buenas.value);
      if (!Number.isInteger(b) || b < 0 || b > l.cantidadActual) return `Escribe un número entero entre 0 y ${l.cantidadActual}.`;
      if (b < l.cantidadActual && !form.motivo.value) return 'Elige por qué se perdieron.';
      const lote = nuevoLote();
      registrarSecado(lote, l, { buenas: b, motivo: form.motivo.value, recicla: form.recicla.checked, fecha: form.fecha.value || hoyISO() });
      enviar(lote.commit(), { alGuardar: avisoGuardado(toast, b ? `${b} piezas pasan a esperar bizcocho` : 'Lote cerrado: no quedaron piezas'), alFallar: fallo });
      return null;
    }
  });
}

async function esmaltadoDialogo(l) {
  const f = estado.piezas[l.piezaId];
  const esm = f?.esmaltes || [];
  const crudo = l.etapa === 'seco';
  await formulario({
    titulo: `Esmaltar · ${l.cantidadActual} × ${l.piezaNombre}`,
    cuerpo: `
      ${crudo ? `<p class="aviso aviso-info">Esmaltado en crudo (monococción): el lote se salta la quema de bizcocho y va directo a la quema de esmalte.</p>` : ''}
      <p class="texto-suave">Se descuenta de bodega el esmalte de la ficha para las ${l.cantidadActual} piezas. Puedes ajustar los gramos si esta vez fue distinto.</p>
      <div class="tabla-scroll"><table class="tabla tabla-entrada"><thead><tr><th>Esmalte</th><th class="num">g por pieza</th><th class="num">Total</th><th class="num">En bodega</th></tr></thead><tbody>
        ${esm.length ? esm.map((e, i) => { const ins = estado.insumos[e.insumoId]; return `<tr data-i="${i}"><td>${esc(ins?.nombre || 'Insumo no disponible')}</td>
          <td class="num"><span class="con-sufijo"><input data-g inputmode="decimal" value="${esc(numero(e.gramos, 2))}" aria-label="Gramos por pieza"><span class="sufijo">g</span></span></td>
          <td class="num" data-t>${numero(e.gramos * l.cantidadActual, 1)} g</td><td class="num">${ins ? `${numero(ins.stock || 0)} ${esc(nombreUnidad(ins.unidad))}` : '—'}</td></tr>`; }).join('') : '<tr><td colspan="4" class="texto-suave">La ficha no tiene esmaltes. Agrégalos en la ficha si quieres que se descuenten.</td></tr>'}
      </tbody></table></div>
      <label class="campo campo-fecha"><span class="campo-etiqueta">Fecha</span><input type="date" name="fecha" value="${hoyISO()}" max="${hoyISO()}"></label>`,
    textoGuardar: 'Registrar esmaltado',
    montar(dlg) {
      dlg.addEventListener('input', () => $$('tbody tr[data-i]', dlg).forEach((tr) => { $('[data-t]', tr).textContent = `${numero((leerNumero($('[data-g]', tr).value) || 0) * l.cantidadActual, 1)} g`; }));
    },
    guardar(form, dlg) {
      const esmaltes = $$('tbody tr[data-i]', dlg).map((tr) => ({ insumoId: esm[Number(tr.dataset.i)].insumoId, gramos: leerNumero($('[data-g]', tr).value) || 0 }));
      const lote = nuevoLote();
      registrarEsmaltado(lote, l, { fecha: form.fecha.value || hoyISO(), esmaltes });
      enviar(lote.commit(), { alGuardar: avisoGuardado(toast, 'Esmaltado registrado. El lote espera la quema de esmalte'), alFallar: fallo });
      return null;
    }
  });
}

async function terminarDialogo(l) {
  await formulario({
    titulo: `Terminar · ${l.cantidadActual} × ${l.piezaNombre}`,
    cuerpo: `
      <p class="texto-suave">Las piezas pasan a stock sin esmaltar. Separa las de segunda si hay.</p>
      <div class="campos">
        ${campoNumero('primera', 'De primera', String(l.cantidadActual), { sufijo: 'u' })}
        ${campoNumero('segunda', 'De segunda', '0', { sufijo: 'u', ayuda: info('Piezas con defectos menores que igual se venden, a otro precio.') })}
        <label class="campo"><span class="campo-etiqueta">Fecha</span><input type="date" name="fecha" value="${hoyISO()}" max="${hoyISO()}"></label>
      </div>`,
    textoGuardar: 'Pasar a stock',
    guardar(form) {
      const p1 = leerNumero(form.primera.value) || 0;
      const p2 = leerNumero(form.segunda.value) || 0;
      if (!Number.isInteger(p1) || !Number.isInteger(p2) || p1 < 0 || p2 < 0 || p1 + p2 > l.cantidadActual) return `Primera más segunda no puede pasar de ${l.cantidadActual}.`;
      const fecha = form.fecha.value || hoyISO();
      const lote = nuevoLote();
      const merma = l.cantidadActual - p1 - p2;
      const extra = { merma: (l.merma || 0) + merma, historial: [...l.historial, { etapa: 'terminación', fecha, entran: l.cantidadActual, salen: p1 + p2, segunda: p2, merma }] };
      const fin = terminarLote(lote, l, { primera: p1, segunda: p2, fecha, extra });
      lote.update(refDoc('lotes', l.id), { ...extra, ...fin, cantidadActual: p1 + p2, ...firma() });
      enviar(lote.commit(), { alGuardar: avisoGuardado(toast, `${p1 + p2} piezas pasan a stock`), alFallar: fallo });
      return null;
    }
  });
}

async function detalleLote(l) {
  const total = l.costoTotal ?? costoLote(l);
  const vivos = l.estado === 'terminado' ? (l.primera || 0) + (l.segunda || 0) : l.cantidadActual;
  const cuerpo = `
    <div class="resumen resumen-chico">
      <div class="dato"><span class="dato-etq">Etapa</span><span class="dato-valor">${esc(l.anulado ? 'Anulado' : ETAPAS[l.etapa]?.nombre || l.etapa)}</span></div>
      <div class="dato"><span class="dato-etq">Piezas</span><span class="dato-valor">${vivos} de ${l.cantidadInicial}</span></div>
      <div class="dato"><span class="dato-etq">Costo por pieza ${info('Todo lo que lleva el lote dividido por las piezas que siguen vivas: las que se pierden reparten su costo entre las que quedan.')}</span><span class="dato-valor">${vivos ? pesos(total / vivos) : '—'}</span></div>
    </div>
    <div class="desglose">
      <div class="desglose-fila"><span>Pasta</span><span>${pesos(l.costoPasta || 0)}</span></div>
      ${l.creditoReciclaje ? `<div class="desglose-fila"><span>Arcilla reciclada</span><span class="entra">−${pesos(l.creditoReciclaje)}</span></div>` : ''}
      <div class="desglose-fila"><span>Esmaltes</span><span>${pesos(l.costoEsmalte || 0)}</span></div>
      ${l.costoOtros ? `<div class="desglose-fila"><span>Otros insumos</span><span>${pesos(l.costoOtros)}</span></div>` : ''}
      <div class="desglose-fila"><span>Horas</span><span>${pesos(l.costoHoras || 0)}</span></div>
      <div class="desglose-fila"><span>Quemas</span><span>${pesos(l.costoQuemas || 0)}</span></div>
      <div class="desglose-fila desglose-total"><span>Total del lote</span><span>${pesos(total)}</span></div>
    </div>
    <h3>Recorrido</h3>
    <ol class="recorrido">${(l.historial || []).map((h) => `
      <li><span class="rec-etapa">${esc(h.etapa.charAt(0).toUpperCase() + h.etapa.slice(1))}</span>
        <span class="rec-fecha">${fechaCorta(h.fecha)}</span>
        <span class="rec-dato">${h.etapa === 'modelado' ? `${h.salen} piezas` : `${h.salen} de ${h.entran}${h.segunda ? ` (${h.segunda} de segunda)` : ''}${h.merma ? ` · <span class="sale">${h.merma} perdida${h.merma > 1 ? 's' : ''}${h.motivo ? `: ${esc(nombreItem('motivosMerma', h.motivo))}` : ''}</span>` : ''}${h.recicla ? ' · arcilla reciclada' : ''}`}</span></li>`).join('')}
    </ol>`;
  await formulario({
    titulo: `${l.cantidadInicial} × ${l.piezaNombre}`, cuerpo, ancho: true, textoGuardar: '',
    extra: l.estado === 'en-proceso' && !l.anulado ? '<button type="button" class="btn btn-peligro" data-anular>Anular lote</button>' : '',
    montar(dlg, form, cerrar) {
      $('[data-anular]', dlg)?.addEventListener('click', async () => {
        const r = await dialogo({
          titulo: 'Anular lote',
          cuerpo: '<p>La pasta y los esmaltes descontados vuelven a bodega. El lote queda en el historial como anulado. Lo que ya cargó de quemas anteriores no se reparte de nuevo.</p><label class="campo"><span class="campo-etiqueta">Motivo</span><input name="motivo" maxlength="200" placeholder="Ej.: creado por error"></label>',
          botones: [{ texto: 'Cancelar', valor: false }, { texto: 'Anular lote', valor: true, clase: 'btn-peligro' }]
        });
        if (!r?.valor) return;
        const lote = nuevoLote();
        anularLote(lote, l, r.datos.motivo || '');
        if (estado.piezas[l.piezaId]?.tipo === 'unica') lote.update(refDoc('piezas', l.piezaId), { loteCreado: false, ...firma() });
        enviar(lote.commit(), { alGuardar: avisoGuardado(toast, 'Lote anulado'), alFallar: fallo });
        cerrar();
      });
    }
  });
}

// ================================================================ Quemas
export function vistaQuemas(el) {
  el.innerHTML = `
    <div class="barra-herramientas"><span class="texto-suave" data-espera></span><span class="espacio"></span>
      <button class="btn btn-primario" data-nueva>${ICONOS.mas2}<span>Registrar quema</span></button></div>
    <div data-lista><p class="texto-suave">Cargando…</p></div>`;
  $('[data-nueva]', el).addEventListener('click', () => quemaDialogo().then(() => setTimeout(cargar, 300)));
  const lista = $('[data-lista]', el);
  const espera = () => {
    const n = (k) => lotesActivos.filter((l) => l.etapa === k && !l.anulado).reduce((s, l) => s + l.cantidadActual, 0);
    $('[data-espera]', el).textContent = `Esperando bizcocho: ${n('seco')} · esperando esmalte: ${n('esmaltado')}`;
  };
  async function cargar() {
    let qs = [];
    try { qs = await ultimosDocumentos('quemas', 60); } catch { lista.innerHTML = '<p class="texto-suave">No se pudo cargar. Revisa la conexión.</p>'; return; }
    if (!qs.length) { lista.innerHTML = vacio('Sin quemas registradas', 'Cuando abras el horno, registra la quema: qué lotes iban, cuántas piezas salieron bien y cuánta energía usó. El costo se reparte entre las piezas según su tamaño.'); return; }
    lista.innerHTML = `<section class="panel tabla-panel"><ul class="filas">${qs.sort((a, b) => b.fecha.localeCompare(a.fecha) || b.creadoMs - a.creadoMs).map((q) => {
      const piezas = q.lotes.reduce((s, x) => s + x.piezas, 0);
      const merma = q.lotes.reduce((s, x) => s + x.merma, 0);
      return `<li><button class="fila" data-id="${esc(q.id)}">
        <span class="fila-principal"><span class="fila-nombre">${q.tipo === 'bizcocho' ? 'Bizcocho' : 'Esmalte'}${q.hornoNombre ? ` · ${esc(q.hornoNombre)}` : ''}${q.cono ? ` · ${esc(q.cono)}` : ''}</span>
          <span class="fila-meta"><span>${fechaCorta(q.fecha)}</span>${q.tipo === 'esmalte' && q.valorVendible ? `<span>${pesos(q.valorVendible)} vendible${q.valorMerma ? ` · ${pesos(q.valorMerma)} en merma` : ''}</span>` : ''}<span>${piezas} piezas de ${q.lotes.length} lote${q.lotes.length > 1 ? 's' : ''}</span>${q.ocupacion != null ? `<span>Horno al ${pct(q.ocupacion)}</span>` : ''}${merma ? `<span class="texto-alerta">${merma} perdida${merma > 1 ? 's' : ''}</span>` : ''}</span></span>
        <span class="fila-dato fila-dato-fuerte"><span class="fila-etq">Energía</span>${pesos(q.costo)}</span>
      </button></li>`;
    }).join('')}</ul></section>`;
    $$('.fila', lista).forEach((b) => b.addEventListener('click', () => detalleQuema(qs.find((q) => q.id === b.dataset.id))));
  }
  const des = [escucharDonde('lotes', 'estado', '==', 'en-proceso', (l) => { lotesActivos = l; espera(); })];
  cargar();
  return () => des.forEach((u) => u());
}

async function detalleQuema(q) {
  await formulario({
    titulo: `Quema de ${q.tipo === 'bizcocho' ? 'bizcocho' : 'esmalte'} · ${fechaCorta(q.fecha)}`, textoGuardar: '', ancho: true,
    cuerpo: `
      <div class="resumen resumen-chico">
        <div class="dato"><span class="dato-etq">Energía</span><span class="dato-valor">${pesos(q.costo)}</span></div>
        <div class="dato"><span class="dato-etq">Ocupación</span><span class="dato-valor">${q.ocupacion != null ? pct(q.ocupacion) : '—'}</span></div>
        <div class="dato"><span class="dato-etq">Puntos cargados</span><span class="dato-valor">${numero(q.puntos, 0)}</span></div>
        ${q.valorVendible != null ? `<div class="dato"><span class="dato-etq">Valor vendible ${info('Lo que vale a precio de venta lo que salió bien (de segunda, a su precio de segunda). En una quema de bizcocho es lo que valdrán esas piezas al terminarlas.')}</span><span class="dato-valor">${pesos(q.valorVendible)}</span></div>
        <div class="dato ${q.valorMerma ? 'dato-alerta' : ''}"><span class="dato-etq">Valor en merma</span><span class="dato-valor">${pesos(q.valorMerma || 0)}</span></div>` : ''}
      </div>
      ${q.hornoNombre || q.kwh ? `<p class="texto-suave">${esc(q.hornoNombre || '')}${q.kwh ? ` · ${numero(q.kwh, 1)} kWh${q.energia?.modo === 'promedio' ? ' (promedio del horno)' : q.energia?.modo === 'remarcador' ? ` (remarcador ${numero(q.energia.inicio, 1)} → ${numero(q.energia.fin, 1)})` : ''}` : ''}</p>` : ''}
      <div class="tabla-scroll"><table class="tabla"><thead><tr><th>Lote</th><th class="num">Piezas</th><th class="num">Puntos</th><th class="num">Costo</th><th class="num">Salieron</th></tr></thead><tbody>
        ${q.lotes.map((x) => `<tr><td>${esc(x.pieza)} <span class="texto-tenue">${esc(x.tamano)}</span></td><td class="num">${x.piezas}</td><td class="num">${x.puntos}</td><td class="num">${pesos(x.costo)}</td>
          <td class="num">${x.bien}${x.segunda ? ` + ${x.segunda} de 2ª` : ''}${x.merma ? ` <span class="sale">−${x.merma}</span>` : ''}</td></tr>`).join('')}
      </tbody></table></div>
      ${q.nota ? `<p class="texto-suave">${esc(q.nota)}</p>` : ''}
      <p class="texto-tenue">Una quema registrada no se modifica. Si algo quedó mal, corrige las piezas con un ajuste en Inventario → Piezas.</p>`
  });
}

async function quemaDialogo() {
  let lotes = lotesActivos;
  if (!lotes.length) { try { lotes = await documentosDonde('lotes', 'estado', '==', 'en-proceso'); } catch { lotes = []; } }
  const h = horno();
  const cuerpo = `
    <p class="texto-suave">Registra la quema cuando abras el horno: qué lotes iban y cuántas piezas salieron bien.</p>
    <div class="campos">
      <div class="campo campo-ancho"><span class="campo-etiqueta">Tipo de quema</span>
        <div class="segmentado" role="radiogroup">
          <label><input type="radio" name="tipo" value="bizcocho" checked><span>Bizcocho</span></label>
          <label><input type="radio" name="tipo" value="esmalte"><span>Esmalte</span></label>
        </div></div>
      <label class="campo"><span class="campo-etiqueta">Fecha</span><input type="date" name="fecha" value="${hoyISO()}" max="${hoyISO()}"></label>
      <label class="campo"><span class="campo-etiqueta">Horno</span><select name="horno">${h.hornos.map((x) => `<option value="${esc(x.id)}">${esc(x.nombre)}</option>`).join('')}</select></label>
      <label class="campo"><span class="campo-etiqueta">Cono o temperatura</span><input name="cono" maxlength="40" placeholder="Ej.: cono 06, 1240 °C"></label>
    </div>
    <fieldset class="bloque"><legend>Energía ${info('Cómo saber cuánto costó la quema. Si no anotas nada, se usa el consumo promedio del horno. Lo más exacto es leer el remarcador antes y después.')}</legend>
      <div class="segmentado segmentado-chico" role="radiogroup">
        ${h.energia === 'gas' ? `<label><input type="radio" name="modo" value="gas" checked><span>Gas usado</span></label>` : `
        <label><input type="radio" name="modo" value="promedio" checked><span>Promedio del horno</span></label>
        <label><input type="radio" name="modo" value="remarcador"><span>Remarcador</span></label>
        <label><input type="radio" name="modo" value="kwh"><span>kWh</span></label>`}
        <label><input type="radio" name="modo" value="directo"><span>Costo directo</span></label>
      </div>
      <div class="campos">
        <div data-m="remarcador" class="campo-ancho dos">${campoNumero('inicio', 'Lectura antes de encender', '', { sufijo: 'kWh' })}${campoNumero('fin', 'Lectura al apagar', '', { sufijo: 'kWh' })}</div>
        <div data-m="kwh">${campoNumero('kwh', 'Consumo', '', { sufijo: 'kWh', ayuda: info(`Se valoriza a ${pesos(h.precioKwh)} el kWh.`) })}</div>
        <div data-m="gas">${campoNumero('gasKg', 'Gas usado', '', { sufijo: 'kg', ayuda: info(`Se valoriza a ${pesos(h.precioGasKg)} el kg.`) })}</div>
        <div data-m="directo">${campoNumero('costo', 'Costo de la quema', '', { sufijo: '$' })}</div>
        <p class="texto-suave campo-ancho" data-costo></p>
      </div>
    </fieldset>
    <div data-lotes></div>
    <label class="campo"><span class="campo-etiqueta">Nota</span><input name="nota" maxlength="200" placeholder="Opcional: curva, ubicación de las piezas, resultados"></label>`;

  await formulario({
    titulo: 'Registrar quema', cuerpo, ancho: true, textoGuardar: 'Registrar quema',
    montar(dlg, form) {
      const pintarLotes = () => {
        const tipo = form.tipo.value;
        const elegibles = lotes.filter((l) => !l.anulado && l.etapa === (tipo === 'bizcocho' ? 'seco' : 'esmaltado'));
        const caja = $('[data-lotes]', dlg);
        if (!elegibles.length) {
          caja.innerHTML = `<p class="aviso aviso-suave">No hay lotes ${tipo === 'bizcocho' ? 'secos esperando bizcocho' : 'esmaltados esperando quema'}. ${tipo === 'bizcocho' ? 'Registra primero el secado en Lotes.' : 'Registra primero el esmaltado en Lotes.'}</p>`;
          return;
        }
        caja.innerHTML = `
          <div class="tabla-scroll"><table class="tabla tabla-entrada"><thead><tr><th>Va</th><th>Lote</th><th class="num">Salieron bien</th>${tipo === 'esmalte' ? '<th class="num">De segunda</th>' : ''}<th>Si se perdieron</th></tr></thead><tbody>
            ${elegibles.map((l) => `<tr data-id="${esc(l.id)}">
              <td><input type="checkbox" data-va checked aria-label="Incluir ${esc(l.piezaNombre)}"></td>
              <td><span class="celda-nombre">${l.cantidadActual} × ${esc(l.piezaNombre)}</span><span class="celda-sub">Tamaño ${esc(l.tamano)} · ${l.cantidadActual * (l.puntosPieza || 1)} puntos</span></td>
              <td class="num"><span class="con-sufijo"><input data-bien inputmode="numeric" value="${l.cantidadActual}" aria-label="Salieron bien"><span class="sufijo">u</span></span></td>
              ${tipo === 'esmalte' ? `<td class="num"><span class="con-sufijo"><input data-seg inputmode="numeric" value="0" aria-label="De segunda"><span class="sufijo">u</span></span></td>` : ''}
              <td><select data-mot aria-label="Motivo de la merma">${opcionesMerma()}</select></td></tr>`).join('')}
          </tbody></table></div>
          <p class="texto-suave" data-ocup></p>`;
      };
      const recalcular = () => {
        const modo = form.modo.value;
        $$('[data-m]', dlg).forEach((x) => { x.hidden = x.dataset.m !== modo; });
        const e = leerEnergia(form);
        const tipo = form.tipo.value;
        const c = costoEnergia(e);
        const kwh = kwhEnergia(e);
        $('[data-costo]', dlg).innerHTML = c
          ? `Costo de la quema: <strong>${pesos(c)}</strong>${kwh ? ` (${numero(kwh, 1)} kWh${e.modo === 'promedio' ? `, promedio de ${esc(hornoPorId(form.horno.value).nombre)}` : ''})` : ''}`
          : `Sin dato: se usará el estimado de ${pesos(costoQuemaEstimado(tipo, form.horno.value))}.`;
        let pts = 0, vend = 0, perd = 0;
        $$('[data-lotes] tbody tr', dlg).forEach((tr) => {
          const l = lotes.find((x) => x.id === tr.dataset.id);
          if (!$('[data-va]', tr).checked) return;
          pts += l.cantidadActual * (l.puntosPieza || 1);
          const bien = leerNumero($('[data-bien]', tr).value) || 0;
          const seg = tr.querySelector('[data-seg]') ? leerNumero($('[data-seg]', tr).value) || 0 : 0;
          vend += valorVenta(l.piezaId, bien, seg);
          perd += valorVenta(l.piezaId, Math.max(0, l.cantidadActual - bien - seg));
        });
        const cap = hornoPorId(form.horno.value)?.capacidadPuntos || 0;
        const oc = $('[data-ocup]', dlg);
        if (oc) oc.innerHTML = `${pts} puntos cargados${cap ? `: horno al ${pct(pts / cap)}` : ''}${c && pts ? ` · ${pesos(c / pts)} por punto` : ''}.${vend || perd ? ` Valor vendible <strong>${pesos(vend)}</strong>${perd ? ` · en merma <strong class="texto-alerta">${pesos(perd)}</strong>` : ''}.` : ''}`;
      };
      $$('input[name=tipo]', dlg).forEach((r) => r.addEventListener('change', () => { pintarLotes(); recalcular(); }));
      dlg.addEventListener('input', recalcular);
      dlg.addEventListener('change', recalcular);
      pintarLotes();
      recalcular();
    },
    guardar(form, dlg) {
      const tipo = form.tipo.value;
      const energia = leerEnergia(form);
      const filas = [];
      for (const tr of $$('[data-lotes] tbody tr', dlg)) {
        if (!$('[data-va]', tr).checked) continue;
        const l = lotes.find((x) => x.id === tr.dataset.id);
        const bien = leerNumero($('[data-bien]', tr).value);
        const seg = tipo === 'esmalte' ? leerNumero($('[data-seg]', tr).value) || 0 : 0;
        if (!Number.isInteger(bien) || !Number.isInteger(seg) || bien < 0 || seg < 0 || bien + seg > l.cantidadActual) return `En «${l.piezaNombre}», lo que salió no puede pasar de ${l.cantidadActual}.`;
        const motivo = $('[data-mot]', tr).value;
        if (bien + seg < l.cantidadActual && !motivo) return `Elige por qué se perdieron piezas de «${l.piezaNombre}».`;
        filas.push({ lote: l, bien, segunda: seg, motivo });
      }
      if (!filas.length) return 'Marca al menos un lote que fue en esta quema.';
      if (energia.modo === 'remarcador' && !(energia.fin > energia.inicio)) return 'La lectura al apagar debe ser mayor que la lectura antes de encender.';
      if (!costoEnergia(energia)) { energia.estimado = true; energia.modo = 'directo'; energia.costo = costoQuemaEstimado(tipo, form.horno.value); }
      const lote = nuevoLote();
      const r = registrarQuema(lote, { tipo, fecha: form.fecha.value || hoyISO(), cono: form.cono.value.trim(), energia, nota: form.nota.value.trim(), filas, hornoId: form.horno.value });
      const salen = r.detalle.reduce((s, x) => s + x.bien + x.segunda, 0);
      enviar(lote.commit(), {
        alGuardar: avisoGuardado(toast, tipo === 'bizcocho' ? `Quema registrada: ${salen} piezas pasan a esperar esmalte` : `Quema registrada: ${salen} piezas pasan a stock`),
        alFallar: fallo
      });
      return null;
    }
  });
}

function leerEnergia(form) {
  const modo = form.modo.value;
  const h = horno();
  const n = (k) => leerNumero(form.elements[k].value) || 0;
  const hornoId = form.horno.value;
  const tipo = form.tipo.value;
  if (modo === 'promedio') return { modo, hornoId, tipo, kwh: kwhTipico(hornoId, tipo), precioKwh: h.precioKwh };
  if (modo === 'remarcador') return { modo, inicio: n('inicio'), fin: n('fin'), precioKwh: h.precioKwh };
  if (modo === 'kwh') return { modo, kwh: n('kwh'), precioKwh: h.precioKwh };
  if (modo === 'gas') return { modo, gasKg: n('gasKg'), precioGasKg: h.precioGasKg };
  return { modo: 'directo', costo: n('costo') };
}

export { nuevoLoteDialogo };
