// Producción: insumos (catálogo de materiales) y recetas de esmaltes, engobes y pastas.
// Piezas, quemas y lotes llegan en la entrega 2c.
import { estado, alCambiar, enviar, firma, itemsActivos, nombreItem } from '../datos.js';
import {
  esc, info, toast, $, $$, formulario, confirmar, leerNumero, numero, pesos, pesosUnidad, hoyISO, fechaCorta
} from '../ui.js';
import {
  costoActual, costoPromedio, insumosActivos, bajoMinimo, esMasa, aGramos, desdeGramos, valorSalida,
  agregarMovimiento, agregarAnulacion, nuevoLote, refNueva, refDoc, documentosPorCampo
} from '../stock.js';
import {
  opcionesLista, opcionesInsumos, nombreUnidad, campoNumero, vacio, pestanas, avisoError, avisoGuardado
} from '../comunes.js';
import { ICONOS } from '../iconos.js';
import { vistaPiezas, vistaLotes, vistaQuemas } from './produccion-piezas.js';

const PEST = [['insumos', 'Insumos'], ['recetas', 'Recetas'], ['piezas', 'Piezas'], ['lotes', 'Lotes'], ['quemas', 'Quemas']];
const fallo = avisoError(toast);

export default {
  render(el, { sub }) {
    const actual = PEST.some(([k]) => k === sub) ? sub : 'insumos';
    el.innerHTML = `
      <header class="pagina-cabecera">
        <h1>Producción</h1>
        <p class="pagina-bajada">${actual === 'recetas'
          ? 'Esmaltes, engobes y pastas que se preparan en el taller. Al preparar una receta, sus materias primas salen de bodega y entra lo preparado.'
          : actual === 'insumos'
            ? 'Todos los materiales del taller: arcillas, materias primas, esmaltes, embalaje. Aquí se definen; el stock se ve en Inventario.'
            : actual === 'piezas' ? 'Cada pieza o serie con lo que lleva, su costo y su margen.'
              : actual === 'lotes' ? 'Las piezas en proceso, por etapa. Al avanzar se descuentan los materiales y se anota lo que se pierde.'
                : 'Cada quema con su energía, lo que salió de cada lote y cómo se repartió el costo.'}</p>
      </header>
      ${pestanas('produccion', PEST, actual)}
      <div id="prod-cuerpo"></div>`;
    const cuerpo = $('#prod-cuerpo', el);
    if (actual === 'insumos') return vistaInsumos(cuerpo);
    if (actual === 'recetas') return vistaRecetas(cuerpo);
    if (actual === 'piezas') return vistaPiezas(cuerpo);
    if (actual === 'lotes') return vistaLotes(cuerpo);
    if (actual === 'quemas') return vistaQuemas(cuerpo);
    return null;
  }
};

// ================================================================ Insumos
function vistaInsumos(el) {
  const f = { texto: '', tipo: '', archivados: false };
  el.innerHTML = `
    <div class="barra-herramientas">
      <input type="search" class="buscador" placeholder="Buscar insumo" aria-label="Buscar insumo">
      <select class="filtro" aria-label="Filtrar por tipo"><option value="">Todos los tipos</option>${opcionesLista('tiposInsumo')}</select>
      <label class="interruptor"><input type="checkbox" data-archivados><span>Archivados</span></label>
      <span class="espacio"></span>
      <button class="btn btn-primario" data-nuevo>${ICONOS.mas2}<span>Nuevo insumo</span></button>
    </div>
    <div data-lista></div>`;
  $('.buscador', el).addEventListener('input', (e) => { f.texto = e.target.value; pintar(); });
  $('.filtro', el).addEventListener('change', (e) => { f.tipo = e.target.value; pintar(); });
  $('[data-archivados]', el).addEventListener('change', (e) => { f.archivados = e.target.checked; pintar(); });
  $('[data-nuevo]', el).addEventListener('click', () => editarInsumo());

  const lista = $('[data-lista]', el);
  function pintar() {
    const norm = (t) => t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    const q = norm(f.texto.trim());
    const todos = Object.values(estado.insumos);
    const vis = todos
      .filter((i) => (f.archivados ? i.archivado : !i.archivado))
      .filter((i) => !f.tipo || i.tipo === f.tipo)
      .filter((i) => !q || norm(i.nombre).includes(q))
      .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));

    if (!todos.length) {
      lista.innerHTML = vacio('Todavía no hay insumos',
        'Parte por los materiales que más usa el taller: las arcillas, las materias primas de los esmaltes y el embalaje. Después podrás cargar cuánto hay en Inventario.',
        '<button class="btn btn-primario" data-nuevo2>Crear el primer insumo</button>');
      $('[data-nuevo2]', lista)?.addEventListener('click', () => editarInsumo());
      return;
    }
    if (!vis.length) { lista.innerHTML = vacio('Sin resultados', 'Prueba con otra búsqueda o cambia el filtro.'); return; }

    const grupos = new Map();
    vis.forEach((i) => {
      const t = nombreItem('tiposInsumo', i.tipo);
      if (!grupos.has(t)) grupos.set(t, []);
      grupos.get(t).push(i);
    });
    lista.innerHTML = [...grupos.entries()].sort((a, b) => a[0].localeCompare(b[0], 'es')).map(([t, items]) => `
      <section class="panel tabla-panel">
        <h2 class="grupo-titulo">${esc(t)} <span class="lista-cuenta">${items.length}</span></h2>
        <ul class="filas">
          ${items.map((i) => `
            <li><button class="fila" data-id="${esc(i.id)}">
              <span class="fila-principal">
                <span class="fila-nombre">${esc(i.nombre)}</span>
                <span class="fila-meta">
                  ${i.elaborado ? '<span class="etiqueta">Elaborado</span>' : ''}
                  ${bajoMinimo(i) ? '<span class="etiqueta etiqueta-alerta">Stock bajo</span>' : ''}
                  ${(i.formatos || []).length ? `<span>${i.formatos.length} formato${i.formatos.length > 1 ? 's' : ''} de compra</span>` : ''}
                </span>
              </span>
              <span class="fila-dato"><span class="fila-etq">Stock</span>${numero(i.stock || 0)} ${esc(nombreUnidad(i.unidad))}</span>
              <span class="fila-dato"><span class="fila-etq">Costo</span>${costoActual(i) ? `${pesosUnidad(costoActual(i))}/${esc(nombreUnidad(i.unidad))}` : '<span class="texto-tenue">Sin costo</span>'}</span>
            </button></li>`).join('')}
        </ul>
      </section>`).join('');
    $$('.fila', lista).forEach((b) => b.addEventListener('click', () => editarInsumo(estado.insumos[b.dataset.id])));
  }
  pintar();
  return alCambiar(pintar);
}

function nombreRepetido(nombre, idActual) {
  const n = nombre.trim().toLowerCase();
  return Object.values(estado.insumos).find((i) => i.id !== idActual && !i.archivado && i.nombre.trim().toLowerCase() === n);
}

export async function editarInsumo(ins = null, { tipoInicial = '' } = {}) {
  const nuevo = !ins;
  const d = ins || { nombre: '', tipo: tipoInicial || itemsActivos('tiposInsumo')[0]?.id, unidad: 'kg', stockMinimo: 0, formatos: [], notas: '' };
  const bloqueaUnidad = Boolean(ins?.conMovimientos);
  const prom = ins ? costoPromedio(ins) : null;

  const cuerpo = `
    <div class="campos">
      <label class="campo campo-ancho">
        <span class="campo-etiqueta">Nombre <span class="req">*</span></span>
        <input name="nombre" value="${esc(d.nombre)}" maxlength="80" autocomplete="off" placeholder="Ej.: Arcilla gres blanca, Feldespato potásico" ${d.elaborado ? 'readonly' : ''}>
        ${d.elaborado ? '<small class="texto-suave">Este insumo lo crea una receta. Su nombre se cambia desde la receta.</small>' : ''}
      </label>
      <label class="campo">
        <span class="campo-etiqueta">Tipo <span class="req">*</span></span>
        <select name="tipo">${opcionesLista('tiposInsumo', d.tipo)}</select>
      </label>
      <label class="campo">
        <span class="campo-etiqueta">Unidad <span class="req">*</span> ${info('En qué se mide el stock. Las recetas por porcentaje solo aceptan insumos en kg o g. Una vez que el insumo tiene movimientos, la unidad no se puede cambiar, porque el stock dejaría de cuadrar.')}</span>
        <select name="unidad" ${bloqueaUnidad || d.elaborado ? 'disabled' : ''}>${opcionesLista('unidades', d.unidad)}</select>
      </label>
      ${campoNumero('stockMinimo', 'Stock mínimo', d.stockMinimo ? numero(d.stockMinimo, 3) : '', {
        ayuda: info('Cuando el stock baje de esta cantidad, el insumo aparece como «Stock bajo» en Inicio e Inventario. Déjalo vacío si no quieres aviso.'),
        sufijo: nombreUnidad(d.unidad), placeholder: 'Sin aviso'
      })}
    </div>

    ${d.elaborado ? '' : `
    <fieldset class="bloque">
      <legend>Costo ${info('El costo real sale de las compras (Gastos) y del inventario inicial. El costo de referencia sirve mientras tanto, para que las recetas ya muestren cuánto cuestan. Con factura, usa el precio neto: el IVA es crédito fiscal. Con boleta, el total pagado.')}</legend>
      ${ins?.costoUltimo != null || prom != null ? `
        <dl class="datos-fijos compacto">
          ${ins.costoUltimo != null ? `<div><dt>Última compra o ingreso</dt><dd>${pesosUnidad(ins.costoUltimo)}/${esc(nombreUnidad(d.unidad))}${ins.fechaUltimoCosto ? ` <span class="texto-tenue">· ${fechaCorta(ins.fechaUltimoCosto)}</span>` : ''}</dd></div>` : ''}
          ${prom != null ? `<div><dt>Promedio de lo que hay en bodega</dt><dd>${pesosUnidad(prom)}/${esc(nombreUnidad(d.unidad))}</dd></div>` : ''}
        </dl>` : ''}
      <div class="campos">
        ${campoNumero('costoRef', 'Costo de referencia por unidad', d.costoRef != null ? numero(d.costoRef, 4) : '', { sufijo: `$/${nombreUnidad(d.unidad)}`, placeholder: 'Opcional' })}
        <div class="calculadora">
          <p class="calculadora-titulo">Calculadora ${info('Si sabes cuánto pagaste por un envase y cuánto trae, la app calcula el costo por unidad. Ej.: saco de 25 kg a $18.000 → $720/kg.')}</p>
          <div class="calculadora-campos">
            <input type="text" inputmode="decimal" data-calc-precio placeholder="Precio $" aria-label="Precio del envase">
            <span>÷</span>
            <input type="text" inputmode="decimal" data-calc-cant placeholder="Trae" aria-label="Cuánto trae el envase">
            <button type="button" class="btn btn-suave btn-chico" data-calc>Usar</button>
          </div>
        </div>
      </div>
    </fieldset>

    <fieldset class="bloque">
      <legend>Formatos de compra ${info('Cómo viene el insumo en las facturas: «Saco 25 kg», «Bolsa 1 kg», «Caja 50 unidades». Al cargar una compra en Gastos, la app convierte los formatos a la unidad del insumo: 2 sacos de 25 kg suman 50 kg al stock.')}</legend>
      <div data-formatos></div>
      <button type="button" class="btn btn-suave btn-chico" data-agregar-formato>${ICONOS.mas2}<span>Agregar formato</span></button>
    </fieldset>`}

    <label class="campo">
      <span class="campo-etiqueta">Notas</span>
      <textarea name="notas" rows="2" maxlength="500" placeholder="Proveedor habitual, marca, cuidados de almacenamiento…">${esc(d.notas || '')}</textarea>
    </label>`;

  const extra = !nuevo && !d.elaborado
    ? `<button type="button" class="btn btn-suave" data-archivar>${d.archivado ? 'Reactivar' : 'Archivar'}</button>`
    : '';

  await formulario({
    titulo: nuevo ? 'Nuevo insumo' : d.nombre,
    cuerpo, extra, ancho: true,
    textoGuardar: nuevo ? 'Crear insumo' : 'Guardar cambios',
    montar(dlg, form, cerrar) {
      const caja = $('[data-formatos]', dlg);
      const filaFormato = (fm = { nombre: '', cantidad: '' }) => {
        const li = document.createElement('div');
        li.className = 'formato-fila';
        li.innerHTML = `
          <input data-fn placeholder="Ej.: Saco 25 kg" value="${esc(fm.nombre)}" aria-label="Nombre del formato" maxlength="60">
          <span class="con-sufijo"><input data-fc inputmode="decimal" placeholder="Trae" value="${fm.cantidad !== '' ? esc(numero(fm.cantidad, 4)) : ''}" aria-label="Cuánto trae"><span class="sufijo" data-fu>${esc(nombreUnidad(form.unidad.value))}</span></span>
          <button type="button" class="btn-icono" aria-label="Quitar formato">✕</button>`;
        li.querySelector('button').addEventListener('click', () => li.remove());
        caja.append(li);
      };
      if (caja) {
        (d.formatos || []).forEach(filaFormato);
        $('[data-agregar-formato]', dlg).addEventListener('click', () => { filaFormato(); caja.lastElementChild.querySelector('input').focus(); });
        $('[data-calc]', dlg).addEventListener('click', () => {
          const p = leerNumero($('[data-calc-precio]', dlg).value);
          const c = leerNumero($('[data-calc-cant]', dlg).value);
          if (!(p > 0) || !(c > 0)) { toast('Escribe el precio y cuánto trae el envase.', 'error'); return; }
          form.costoRef.value = numero(p / c, 4);
        });
      }
      form.unidad.addEventListener('change', () => {
        $$('[data-fu]', dlg).forEach((s) => { s.textContent = nombreUnidad(form.unidad.value); });
        $$('.sufijo', dlg).forEach((s) => { if (s.textContent.startsWith('$/')) s.textContent = `$/${nombreUnidad(form.unidad.value)}`; });
        const sufMin = form.stockMinimo.nextElementSibling;
        if (sufMin) sufMin.textContent = nombreUnidad(form.unidad.value);
      });
      $('[data-archivar]', dlg)?.addEventListener('click', async () => {
        if (!d.archivado && (d.stock || 0) > 0) {
          const ok = await confirmar('Archivar insumo', `«${esc(d.nombre)}» todavía tiene ${numero(d.stock)} ${esc(nombreUnidad(d.unidad))} en bodega. Al archivarlo deja de aparecer en listas y recetas nuevas, pero su historial se mantiene. ¿Archivar igual?`, 'Archivar');
          if (!ok) return;
        }
        enviar(nuevoLote().update(refDoc('insumos', d.id), { archivado: !d.archivado, ...firma() }).commit(), {
          alGuardar: avisoGuardado(toast, d.archivado ? 'Insumo reactivado' : 'Insumo archivado. Puedes verlo con el filtro «Archivados»'),
          alFallar: fallo
        });
        cerrar();
      });
    },
    guardar(form, dlg) {
      const nombre = form.nombre.value.trim();
      if (!nombre) return 'Escribe el nombre del insumo.';
      const rep = nombreRepetido(nombre, d.id);
      if (rep) return `Ya existe un insumo llamado «${rep.nombre}».`;
      const unidad = form.unidad.disabled ? d.unidad : form.unidad.value;
      const min = form.stockMinimo.value.trim() ? leerNumero(form.stockMinimo.value) : 0;
      if (Number.isNaN(min) || min < 0) return 'El stock mínimo debe ser un número positivo.';
      const datos = { nombre, tipo: form.tipo.value, unidad, stockMinimo: min, notas: form.notas.value.trim() };
      if (!d.elaborado) {
        const cr = form.costoRef.value.trim() ? leerNumero(form.costoRef.value) : null;
        if (cr != null && (Number.isNaN(cr) || cr < 0)) return 'El costo de referencia debe ser un número positivo.';
        datos.costoRef = cr;
        const formatos = [];
        for (const fila of $$('.formato-fila', dlg)) {
          const fn = fila.querySelector('[data-fn]').value.trim();
          const fcTxt = fila.querySelector('[data-fc]').value.trim();
          if (!fn && !fcTxt) continue;
          const fc = leerNumero(fcTxt);
          if (!fn) return 'Cada formato necesita un nombre, por ejemplo «Saco 25 kg».';
          if (!(fc > 0)) return `Indica cuánto trae el formato «${fn}».`;
          formatos.push({ nombre: fn, cantidad: fc });
        }
        datos.formatos = formatos;
      }
      const lote = nuevoLote();
      if (nuevo) {
        lote.set(refNueva('insumos'), { ...datos, stock: 0, valorStock: 0, archivado: false, elaborado: false, creadoMs: Date.now(), ...firma() });
      } else {
        lote.update(refDoc('insumos', d.id), { ...datos, ...firma() });
      }
      enviar(lote.commit(), { alGuardar: avisoGuardado(toast, nuevo ? `«${nombre}» creado` : 'Cambios guardados'), alFallar: fallo });
      return null;
    }
  });
}

// ================================================================ Recetas
const TIPOS_RECETA = {
  esmalte: { nombre: 'Esmalte', tipoInsumo: 'esmalte', unidad: 'g' },
  engobe: { nombre: 'Engobe', tipoInsumo: 'engobe', unidad: 'g' },
  pasta: { nombre: 'Pasta', tipoInsumo: 'arcilla-y-pasta', unidad: 'kg' },
  otro: { nombre: 'Otro', tipoInsumo: null, unidad: 'g' }
};

// Costo por gramo de una receta con los costos actuales de sus ingredientes.
export function costoReceta(rec) {
  const ings = rec.ingredientes || [];
  const totalPct = ings.reduce((s, i) => s + (i.pct || 0), 0);
  if (!totalPct) return { porGramo: 0, faltan: [] };
  let suma = 0;
  const faltan = [];
  ings.forEach((i) => {
    const ins = estado.insumos[i.insumoId];
    const c = ins ? costoActual(ins) : 0;
    if (!c) faltan.push(ins?.nombre || 'insumo eliminado');
    if (ins && esMasa(ins.unidad)) suma += i.pct * (c / aGramos(1, ins.unidad));
  });
  return { porGramo: suma / totalPct, faltan };
}

function vistaRecetas(el) {
  let archivadas = false;
  el.innerHTML = `
    <div class="barra-herramientas">
      <label class="interruptor"><input type="checkbox" data-archivadas><span>Archivadas</span></label>
      <span class="espacio"></span>
      <button class="btn btn-primario" data-nueva>${ICONOS.mas2}<span>Nueva receta</span></button>
    </div>
    <div data-lista></div>`;
  $('[data-nueva]', el).addEventListener('click', () => editarReceta());
  $('[data-archivadas]', el).addEventListener('change', (e) => { archivadas = e.target.checked; pintar(); });
  const lista = $('[data-lista]', el);

  function pintar() {
    const todas = Object.values(estado.recetas);
    const vis = todas.filter((r) => Boolean(r.archivado) === archivadas).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
    if (!todas.length) {
      const sinMasa = !insumosActivos().some((i) => esMasa(i.unidad) && !i.elaborado);
      lista.innerHTML = vacio('Todavía no hay recetas',
        sinMasa
          ? 'Primero crea en Insumos las materias primas que usa la receta (feldespato, sílice, caolín, colorantes), en kg o g.'
          : 'Una receta se escribe en porcentajes, como en la libreta del taller. Al prepararla, la app descuenta cada materia prima de bodega y suma lo preparado.',
        sinMasa ? '<a class="btn btn-primario" href="#/produccion/insumos">Ir a Insumos</a>' : '<button class="btn btn-primario" data-nueva2>Escribir la primera receta</button>');
      $('[data-nueva2]', lista)?.addEventListener('click', () => editarReceta());
      return;
    }
    if (!vis.length) { lista.innerHTML = vacio(archivadas ? 'No hay recetas archivadas' : 'No hay recetas activas', ''); return; }
    lista.innerHTML = `<div class="tarjetas">${vis.map((r) => {
      const { porGramo, faltan } = costoReceta(r);
      const res = estado.insumos[r.insumoId];
      const base = (r.ingredientes || []).filter((i) => !i.adicion).reduce((s, i) => s + i.pct, 0);
      return `
        <article class="tarjeta">
          <button class="tarjeta-cuerpo" data-editar="${esc(r.id)}">
            <span class="tarjeta-tipo">${esc(TIPOS_RECETA[r.tipo]?.nombre || 'Receta')}</span>
            <span class="tarjeta-nombre">${esc(r.nombre)}</span>
            <span class="tarjeta-detalle">${(r.ingredientes || []).length} ingredientes${Math.abs(base - 100) > 0.01 ? ` · <span class="texto-alerta">base suma ${numero(base)} %</span>` : ''}</span>
            <dl class="tarjeta-datos">
              <div><dt>Costo por kg</dt><dd>${porGramo ? pesos(porGramo * 1000) : '—'}${faltan.length ? ` <span class="texto-alerta" title="${esc(`Falta costo para: ${faltan.join(', ')}`)}">incompleto</span>` : ''}</dd></div>
              <div><dt>En bodega</dt><dd>${res ? `${numero(res.stock || 0)} ${esc(nombreUnidad(res.unidad))}` : '—'}</dd></div>
            </dl>
          </button>
          ${r.archivado ? '' : `<button class="btn btn-suave tarjeta-accion" data-preparar="${esc(r.id)}">Preparar</button>`}
        </article>`;
    }).join('')}</div>`;
    $$('[data-editar]', lista).forEach((b) => b.addEventListener('click', () => editarReceta(estado.recetas[b.dataset.editar])));
    $$('[data-preparar]', lista).forEach((b) => b.addEventListener('click', () => prepararReceta(estado.recetas[b.dataset.preparar])));
  }
  pintar();
  return alCambiar(pintar);
}

const insumoParaReceta = (resultadoId) => (i) => esMasa(i.unidad) && i.id !== resultadoId;

async function editarReceta(rec = null) {
  const nueva = !rec;
  const d = rec || { nombre: '', tipo: 'esmalte', ingredientes: [], notas: '' };
  const res = rec ? estado.insumos[rec.insumoId] : null;

  const cuerpo = `
    <div class="campos">
      <label class="campo campo-ancho">
        <span class="campo-etiqueta">Nombre <span class="req">*</span></span>
        <input name="nombre" value="${esc(d.nombre)}" maxlength="80" autocomplete="off" placeholder="Ej.: Cobalto moteado cono 6">
      </label>
      <label class="campo">
        <span class="campo-etiqueta">Tipo</span>
        <select name="tipo" ${nueva ? '' : 'disabled'}>${Object.entries(TIPOS_RECETA).map(([k, t]) => `<option value="${k}" ${k === d.tipo ? 'selected' : ''}>${t.nombre}</option>`).join('')}</select>
      </label>
      <label class="campo">
        <span class="campo-etiqueta">Lo preparado se mide en ${info('Al preparar la receta, lo que resulta entra a bodega como un insumo elaborado con el mismo nombre, en esta unidad. Así las piezas pueden usarlo y se descuenta.')}</span>
        <select name="unidad" ${nueva ? '' : 'disabled'}>
          ${['g', 'kg'].map((u) => `<option value="${u}" ${(res?.unidad || TIPOS_RECETA[d.tipo].unidad) === u ? 'selected' : ''}>${u}</option>`).join('')}
        </select>
      </label>
    </div>

    <fieldset class="bloque">
      <legend>Ingredientes ${info('Escribe la receta en porcentajes, como en la libreta. La base (feldespato, sílice, caolín…) debería sumar 100 %. Los colorantes y opacificantes se marcan como «Adición»: van sobre el 100 %, por ejemplo 2 % de óxido de cobalto. Solo aparecen insumos en kg o g.')}</legend>
      <div class="ingredientes-cabeza"><span>Insumo</span><span>%</span><span>Adición</span><span></span></div>
      <div data-ings></div>
      <button type="button" class="btn btn-suave btn-chico" data-agregar-ing>${ICONOS.mas2}<span>Agregar ingrediente</span></button>
      <div class="resumen-receta" data-resumen></div>
    </fieldset>

    <label class="campo">
      <span class="campo-etiqueta">Notas ${info('Temperatura o cono, cómo se aplica, densidad, cuánta agua lleva, resultados de pruebas.')}</span>
      <textarea name="notas" rows="3" maxlength="1000" placeholder="Cono 6, atmósfera oxidante. Tamizar en malla 80.">${esc(d.notas || '')}</textarea>
    </label>
    ${rec ? '<div data-historial class="historial"><p class="texto-suave">Cargando preparaciones…</p></div>' : ''}`;

  const extra = nueva ? '' : `<button type="button" class="btn btn-suave" data-archivar>${d.archivado ? 'Reactivar' : 'Archivar'}</button>`;

  await formulario({
    titulo: nueva ? 'Nueva receta' : d.nombre,
    cuerpo, extra, ancho: true,
    textoGuardar: nueva ? 'Crear receta' : 'Guardar cambios',
    montar(dlg, form, cerrar) {
      const caja = $('[data-ings]', dlg);
      const resumen = $('[data-resumen]', dlg);
      const actualizar = () => {
        const ings = leerIngredientes(dlg).filter((i) => i.pct > 0);
        const base = ings.filter((i) => !i.adicion).reduce((s, i) => s + (i.pct || 0), 0);
        const adic = ings.filter((i) => i.adicion).reduce((s, i) => s + (i.pct || 0), 0);
        const { porGramo } = costoReceta({ ingredientes: ings.filter((i) => i.insumoId) });
        resumen.innerHTML = `
          <span class="${ings.length && Math.abs(base - 100) > 0.01 ? 'texto-alerta' : ''}">Base: <strong>${numero(base)} %</strong></span>
          <span>Adiciones: <strong>${numero(adic)} %</strong></span>
          <span>Costo: <strong>${porGramo ? `${pesos(porGramo * 1000)}/kg` : '—'}</strong></span>`;
      };
      const fila = (ing = { insumoId: '', pct: '', adicion: false }) => {
        const div = document.createElement('div');
        div.className = 'ing-fila';
        div.innerHTML = `
          <select data-ii aria-label="Insumo">${opcionesInsumos(ing.insumoId, { filtro: insumoParaReceta(d.insumoId) })}</select>
          <input data-ip inputmode="decimal" value="${ing.pct !== '' ? esc(numero(ing.pct, 3)) : ''}" placeholder="%" aria-label="Porcentaje">
          <label class="ing-adicion"><input type="checkbox" data-ia ${ing.adicion ? 'checked' : ''}><span class="solo-movil">Adición</span></label>
          <button type="button" class="btn-icono" aria-label="Quitar ingrediente">✕</button>`;
        div.querySelector('button').addEventListener('click', () => { div.remove(); actualizar(); });
        div.addEventListener('input', actualizar);
        div.addEventListener('change', actualizar);
        caja.append(div);
      };
      (d.ingredientes || []).forEach(fila);
      if (!(d.ingredientes || []).length) { fila(); fila(); fila(); }
      $('[data-agregar-ing]', dlg).addEventListener('click', () => { fila(); caja.lastElementChild.querySelector('select').focus(); });
      form.tipo.addEventListener('change', () => { form.unidad.value = TIPOS_RECETA[form.tipo.value].unidad; });
      actualizar();

      $('[data-archivar]', dlg)?.addEventListener('click', () => {
        const lote = nuevoLote();
        lote.update(refDoc('recetas', d.id), { archivado: !d.archivado, ...firma() });
        if (res) lote.update(refDoc('insumos', res.id), { archivado: !d.archivado, ...firma() });
        enviar(lote.commit(), { alGuardar: avisoGuardado(toast, d.archivado ? 'Receta reactivada' : 'Receta archivada'), alFallar: fallo });
        cerrar();
      });

      if (rec) cargarHistorial(rec, $('[data-historial]', dlg), cerrar);
    },
    guardar(form, dlg) {
      const nombre = form.nombre.value.trim();
      if (!nombre) return 'Escribe el nombre de la receta.';
      const repR = Object.values(estado.recetas).find((r) => r.id !== d.id && !r.archivado && r.nombre.trim().toLowerCase() === nombre.toLowerCase());
      if (repR) return `Ya existe una receta llamada «${repR.nombre}».`;
      const repI = nombreRepetido(nombre, d.insumoId);
      if (repI) return `Ya existe un insumo llamado «${repI.nombre}». La receta crea un insumo con su mismo nombre; usa otro nombre.`;
      const ings = leerIngredientes(dlg).filter((i) => i.insumoId || i.pct);
      if (!ings.length) return 'Agrega al menos un ingrediente.';
      for (const i of ings) {
        if (!i.insumoId) return 'Hay un porcentaje sin insumo. Elige el insumo o borra la fila.';
        if (!(i.pct > 0)) return `Escribe el porcentaje de «${estado.insumos[i.insumoId]?.nombre}».`;
      }
      const ids = ings.map((i) => i.insumoId);
      if (new Set(ids).size !== ids.length) return 'Un insumo aparece dos veces. Junta sus porcentajes en una sola fila.';
      const datos = { nombre, ingredientes: ings, notas: form.notas.value.trim() };
      const lote = nuevoLote();
      if (nueva) {
        const tipo = form.tipo.value;
        const tipoIns = TIPOS_RECETA[tipo].tipoInsumo;
        const tipoValido = itemsActivos('tiposInsumo').some((t) => t.id === tipoIns) ? tipoIns : itemsActivos('tiposInsumo')[0]?.id;
        const rRef = refNueva('recetas');
        const iRef = refNueva('insumos');
        lote.set(iRef, {
          nombre, tipo: tipoValido, unidad: form.unidad.value, stockMinimo: 0, formatos: [], notas: '',
          stock: 0, valorStock: 0, archivado: false, elaborado: true, recetaId: rRef.id, creadoMs: Date.now(), ...firma()
        });
        lote.set(rRef, { ...datos, tipo, insumoId: iRef.id, archivado: false, creadoMs: Date.now(), ...firma() });
      } else {
        lote.update(refDoc('recetas', d.id), { ...datos, ...firma() });
        if (res && res.nombre !== nombre) lote.update(refDoc('insumos', res.id), { nombre, ...firma() });
      }
      enviar(lote.commit(), {
        alGuardar: avisoGuardado(toast, nueva ? `Receta «${nombre}» creada. Ya puedes prepararla` : 'Receta guardada. Las preparaciones anteriores no cambian'),
        alFallar: fallo
      });
      return null;
    }
  });
}

function leerIngredientes(dlg) {
  return $$('.ing-fila', dlg).map((f) => ({
    insumoId: f.querySelector('[data-ii]').value,
    pct: leerNumero(f.querySelector('[data-ip]').value) || 0,
    adicion: f.querySelector('[data-ia]').checked
  }));
}

async function cargarHistorial(rec, caja, cerrarEditor) {
  let preps = [];
  try {
    preps = (await documentosPorCampo('preparaciones', 'recetaId', rec.id)).sort((a, b) => b.fecha.localeCompare(a.fecha) || b.creadoMs - a.creadoMs);
  } catch (e) {
    caja.innerHTML = '<p class="texto-suave">No se pudo cargar el historial. Revisa la conexión.</p>';
    return;
  }
  if (!preps.length) { caja.innerHTML = '<p class="texto-suave">Esta receta todavía no se ha preparado.</p>'; return; }
  caja.innerHTML = `
    <h3>Preparaciones</h3>
    <ul class="historial-lista">
      ${preps.slice(0, 20).map((p) => `
        <li class="${p.anulado ? 'anulado' : ''}">
          <span>${fechaCorta(p.fecha)}</span>
          <span>${numero(p.resultado)} ${esc(p.unidadResultado)}</span>
          <span>${pesosUnidad(p.costoUnitario)}/${esc(p.unidadResultado)}</span>
          ${p.anulado ? '<span class="etiqueta etiqueta-suave">Anulada</span>' : `<button type="button" class="btn-enlace" data-anular="${esc(p.id)}">Anular</button>`}
        </li>`).join('')}
    </ul>`;
  $$('[data-anular]', caja).forEach((b) => b.addEventListener('click', async () => {
    const p = preps.find((x) => x.id === b.dataset.anular);
    const res = estado.insumos[rec.insumoId];
    const quedaria = (res?.stock || 0) - p.resultado;
    const ok = await confirmar('Anular preparación',
      `Las materias primas vuelven a bodega y se descuentan ${numero(p.resultado)} ${esc(p.unidadResultado)} de «${esc(rec.nombre)}».${quedaria < 0 ? ` <strong>Ojo:</strong> el stock de «${esc(rec.nombre)}» quedaría en ${numero(quedaria)}, porque parte ya se usó.` : ''} La preparación queda en el historial como anulada.`,
      'Anular preparación', true);
    if (!ok) return;
    const lote = nuevoLote();
    (p.movs || []).forEach((m) => agregarAnulacion(lote, m, 'Anulación de preparación'));
    lote.update(refDoc('preparaciones', p.id), { anulado: true, anuladoEn: Date.now(), ...firma() });
    enviar(lote.commit(), { alGuardar: avisoGuardado(toast, 'Preparación anulada'), alFallar: fallo });
    cerrarEditor();
  }));
}

async function prepararReceta(rec) {
  const res = estado.insumos[rec.insumoId];
  if (!res) { toast('La receta no tiene su insumo de resultado. Edítala y vuelve a guardarla.', 'error'); return; }
  const cuerpo = `
    <p class="texto-suave">Indica cuánta base seca vas a pesar. La app calcula cada ingrediente, los descuenta de bodega y suma lo preparado a «${esc(res.nombre)}».</p>
    <div class="campos">
      ${campoNumero('base', 'Base seca a preparar', '', { sufijo: 'g', requerido: true, placeholder: 'Ej.: 1000', ayuda: info('El peso de la base (lo que suma 100 %). Las adiciones se calculan sobre este peso: con 1.000 g de base y 2 % de óxido, van 20 g de óxido.') })}
      <label class="campo">
        <span class="campo-etiqueta">Fecha</span>
        <input type="date" name="fecha" value="${hoyISO()}" max="${hoyISO()}">
      </label>
    </div>
    <div class="tabla-scroll">
      <table class="tabla">
        <thead><tr><th>Ingrediente</th><th class="num">%</th><th class="num">Pesar</th><th class="num">En bodega</th><th class="num">Costo</th></tr></thead>
        <tbody data-tabla></tbody>
        <tfoot data-pie></tfoot>
      </table>
    </div>
    <div class="campos">
      ${campoNumero('resultado', 'Cantidad que resultó', '', { sufijo: nombreUnidad(res.unidad), placeholder: 'Igual al total', ayuda: info('Por defecto es la suma de todo lo pesado. Si se perdió material al tamizar o mezclar, escribe lo que realmente quedó: el costo se reparte en esa cantidad.') })}
      <label class="campo">
        <span class="campo-etiqueta">Nota</span>
        <input name="nota" maxlength="200" placeholder="Opcional">
      </label>
    </div>
    <p class="aviso aviso-suave" data-faltante hidden></p>`;

  let calculo = null;
  await formulario({
    titulo: `Preparar ${rec.nombre}`,
    cuerpo, ancho: true, textoGuardar: 'Registrar preparación',
    montar(dlg, form) {
      const calcular = () => {
        const base = leerNumero(form.base.value) || 0;
        const filas = (rec.ingredientes || []).map((i) => {
          const ins = estado.insumos[i.insumoId];
          const gramos = base * i.pct / 100;
          const cant = ins && esMasa(ins.unidad) ? desdeGramos(gramos, ins.unidad) : 0;
          const valor = ins ? valorSalida(ins, cant) : 0;
          return { i, ins, gramos, cant, valor, falta: ins ? cant > (ins.stock || 0) + 1e-9 : true };
        });
        const totalG = filas.reduce((s, f) => s + f.gramos, 0);
        const totalV = filas.reduce((s, f) => s + f.valor, 0);
        calculo = { base, filas, totalG, totalV };
        $('[data-tabla]', dlg).innerHTML = filas.map((f) => `
          <tr class="${f.falta && base ? 'fila-alerta' : ''}">
            <td>${esc(f.ins?.nombre || 'Insumo no disponible')}${f.i.adicion ? ' <span class="etiqueta">Adición</span>' : ''}</td>
            <td class="num">${numero(f.i.pct, 3)}</td>
            <td class="num"><strong>${base ? `${numero(f.gramos, 1)} g` : '—'}</strong></td>
            <td class="num">${f.ins ? `${numero(aGramos(f.ins.stock || 0, f.ins.unidad), 0)} g` : '—'}</td>
            <td class="num">${base ? pesos(f.valor) : '—'}</td>
          </tr>`).join('');
        $('[data-pie]', dlg).innerHTML = `<tr><th colspan="2">Total</th><th class="num">${base ? `${numero(totalG, 1)} g` : '—'}</th><th></th><th class="num">${base ? pesos(totalV) : '—'}</th></tr>`;
        form.resultado.placeholder = base ? numero(desdeGramos(totalG, res.unidad), 3) : 'Igual al total';
        const faltan = filas.filter((f) => f.falta && f.ins);
        const av = $('[data-faltante]', dlg);
        av.hidden = !(base && faltan.length);
        av.innerHTML = `Según el sistema no alcanza: ${faltan.map((f) => esc(f.ins.nombre)).join(', ')}. Si de verdad lo tienes, puedes registrar igual (el stock quedará negativo) y corregirlo después con un ajuste o un conteo en Inventario.`;
      };
      form.base.addEventListener('input', calcular);
      calcular();
    },
    guardar(form) {
      const { base, filas, totalG, totalV } = calculo;
      if (!(base > 0)) return 'Escribe cuánta base seca vas a preparar.';
      if (filas.some((f) => !f.ins)) return 'Un ingrediente ya no existe. Edita la receta antes de prepararla.';
      const resultado = form.resultado.value.trim() ? leerNumero(form.resultado.value) : desdeGramos(totalG, res.unidad);
      if (!(resultado > 0)) return 'La cantidad que resultó debe ser mayor que cero.';
      const fecha = form.fecha.value || hoyISO();
      const lote = nuevoLote();
      const pRef = refNueva('preparaciones');
      const ref = { tipo: 'preparacion', id: pRef.id };
      const movs = filas.map((f) => agregarMovimiento(lote, {
        insumoId: f.ins.id, cantidad: -f.cant, tipo: 'preparacion', fecha, ref, nota: `Para ${rec.nombre}`
      }));
      const costoU = totalV / resultado;
      movs.push(agregarMovimiento(lote, {
        insumoId: res.id, cantidad: resultado, tipo: 'preparacion', fecha, costoUnitario: costoU, actualizaCosto: true, ref,
        nota: form.nota.value.trim()
      }));
      lote.set(pRef, {
        recetaId: rec.id, recetaNombre: rec.nombre, fecha, base,
        ingredientes: filas.map((f) => ({ insumoId: f.ins.id, nombre: f.ins.nombre, pct: f.i.pct, adicion: f.i.adicion, cantidad: f.cant, unidad: f.ins.unidad, valor: f.valor })),
        resultado, unidadResultado: res.unidad, costoTotal: totalV, costoUnitario: costoU,
        movs, nota: form.nota.value.trim(), anulado: false, creadoMs: Date.now(), ...firma()
      });
      enviar(lote.commit(), {
        alGuardar: avisoGuardado(toast, `Preparación registrada: +${numero(resultado)} ${nombreUnidad(res.unidad)} de ${rec.nombre}`),
        alFallar: fallo
      });
      return null;
    }
  });
}
