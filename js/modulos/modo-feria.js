// Modo feria: pantalla completa para vender rápido. Botones grandes, sin menú,
// funciona sin señal y guarda las ventas igual que la venta rápida (con la feria
// de hoy), así el resumen de la feria sale solo.
import { estado, alCambiar, enviar, itemsActivos, nombreItem } from '../datos.js';
import { esc, toast, $, $$, formulario, leerNumero, pesos, hoyISO } from '../ui.js';
import { nuevoLote, escucharDonde } from '../stock.js';
import { campoNumero, avisoError } from '../comunes.js';
import { configVentas, comisionDe, horaActual, precioDe, totalesCarrito, registrarVenta, anularVenta, feriaDeHoy, resumenVentas } from '../ventas-core.js';
import { editarFeria } from './venta-rapida.js';
import { ICONOS } from '../iconos.js';

const fallo = avisoError(toast);
const norm = (t) => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const leerLS = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };
const guardarLS = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* sin almacenamiento */ } };

// El carrito sobrevive si se cierra la app sin querer (se guarda en el equipo).
const carrito = leerLS('vs-feria-carrito', { lineas: [], medio: '', boleta: false, folio: '' });
const guardarCarrito = () => guardarLS('vs-feria-carrito', carrito);

export default {
  render(el) {
    document.body.classList.add('modo-feria');
    const f = { texto: '', cat: '' };
    let delDia = [];
    let abierto = false;
    let ultima = null;
    if (!carrito.medio) carrito.medio = itemsActivos('mediosPago')[0]?.id || 'efectivo';
    el.innerHTML = `
      <div class="mf">
        <header class="mf-cabeza">
          <a href="#/ventas/venta-rapida" class="btn-icono mf-salir" aria-label="Salir del modo feria">✕</a>
          <div class="mf-feria" data-feria></div>
          <div class="mf-hoy" data-hoy></div>
        </header>
        <div class="mf-filtros">
          <input type="search" class="buscador" placeholder="Buscar pieza" aria-label="Buscar pieza">
          <div class="mf-cats" data-cats></div>
        </div>
        <div class="mf-grilla" data-grilla></div>
        <div class="mf-pie" data-pie></div>
        <div class="mf-hoja" data-hoja hidden></div>
        <div class="mf-listo" data-listo hidden></div>
      </div>`;
    $('.buscador', el).addEventListener('input', (e) => { f.texto = e.target.value; pintarGrilla(); });

    const feria = () => feriaDeHoy(Object.values(estado.ferias).filter((x) => !x.cerrada));
    function pintarCabeza() {
      const fe = feria();
      $('[data-feria]', el).innerHTML = fe
        ? `<span class="mf-nombre">${esc(fe.nombre)}</span><span class="mf-lugar">${esc(fe.lugar || 'Feria')}</span>`
        : '<span class="mf-nombre">Sin feria para hoy</span><button class="btn-enlace mf-crear" data-crear>Crear la feria de hoy</button>';
      $('[data-crear]', el)?.addEventListener('click', () => editarFeria(null, { fecha: hoyISO() }));
      const vs = delDia.filter((v) => !v.anulado && v.canal === 'feria' && (fe ? v.feriaId === fe.id : true));
      const r = resumenVentas(vs);
      $('[data-hoy]', el).innerHTML = `<span class="mf-hoy-etq">Hoy</span><strong>${pesos(r.total)}</strong><span class="mf-hoy-etq">${r.ventas} venta${r.ventas === 1 ? '' : 's'}</span>`;
    }

    function pintarGrilla() {
      const cats = itemsActivos('categoriasPieza').filter((c) => Object.values(estado.piezas).some((p) => !p.archivado && p.categoria === c.id));
      $('[data-cats]', el).innerHTML = cats.length > 1 ? `<button class="mf-cat ${!f.cat ? 'activa' : ''}" data-cat="">Todas</button>${cats.map((c) => `<button class="mf-cat ${f.cat === c.id ? 'activa' : ''}" data-cat="${esc(c.id)}">${esc(c.nombre)}</button>`).join('')}` : '';
      $$('[data-cat]', el).forEach((b) => b.addEventListener('click', () => { f.cat = b.dataset.cat; pintarGrilla(); }));
      const q = norm(f.texto.trim());
      const fichas = Object.values(estado.piezas).filter((p) => !p.archivado && !(p.tipo === 'unica' && p.estadoUnica === 'vendida'))
        .filter((p) => (!f.cat || p.categoria === f.cat) && (!q || norm(p.nombre).includes(q)))
        .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
      const g = $('[data-grilla]', el);
      g.innerHTML = `${fichas.map((p) => {
        const n = carrito.lineas.filter((l) => l.piezaId === p.id).reduce((s, l) => s + l.cantidad, 0);
        return `<button class="mf-pieza ${n ? 'en-carrito' : ''}" data-pieza="${esc(p.id)}">
          <span class="mf-pieza-nombre">${esc(p.nombre)}</span>
          <span class="mf-pieza-precio">${p.precioB2C ? pesos(p.precioB2C) : 'Sin precio'}</span>
          ${n ? `<span class="mf-cuenta">${n}</span>` : ''}
        </button>`;
      }).join('')}<button class="mf-pieza mf-otra" data-otra>${ICONOS.mas2}<span class="mf-pieza-nombre">Otra pieza</span></button>`;
      $$('[data-pieza]', g).forEach((b) => b.addEventListener('click', () => agregar(estado.piezas[b.dataset.pieza])));
      $('[data-otra]', g).addEventListener('click', otraPieza);
    }

    function agregar(p, calidad = 'primera') {
      const cv = configVentas();
      const stock = calidad === 'segunda' ? p.stockSegunda || 0 : p.stock || 0;
      const ya = carrito.lineas.filter((l) => l.piezaId === p.id && l.calidad === calidad).reduce((s, l) => s + l.cantidad, 0);
      if (cv.controlarStock && ya + 1 > stock) { toast(`No queda stock de ${p.nombre}.`, 'error'); return; }
      const l = carrito.lineas.find((x) => x.piezaId === p.id && x.calidad === calidad);
      if (l) l.cantidad++;
      else carrito.lineas.push({ key: `${p.id}-${calidad}-${Date.now()}`, piezaId: p.id, nombre: p.nombre, calidad, cantidad: 1, precio: precioDe(p, calidad) });
      if (!p.precioB2C) toast(`«${p.nombre}» no tiene precio: escríbelo en la venta.`, 'aviso');
      navigator.vibrate?.(15);
      guardarCarrito(); pintarTodo();
    }

    async function otraPieza() {
      await formulario({
        titulo: 'Otra pieza', textoGuardar: 'Agregar',
        cuerpo: `<div class="campos"><label class="campo campo-ancho"><span class="campo-etiqueta">Qué es</span><input name="nombre" maxlength="80"></label>${campoNumero('precio', 'Precio con IVA', '', { sufijo: '$' })}</div>`,
        guardar(form) {
          const n = form.nombre.value.trim(); const pr = leerNumero(form.precio.value);
          if (!n) return 'Escribe qué pieza es.';
          if (!(pr > 0)) return 'Escribe el precio.';
          carrito.lineas.push({ key: `otra-${Date.now()}`, piezaId: null, nombre: n, calidad: 'primera', cantidad: 1, precio: pr });
          guardarCarrito(); pintarTodo();
          return null;
        }
      });
    }

    function pintarPie() {
      const t = totalesCarrito(carrito.lineas, carrito.medio);
      const n = carrito.lineas.reduce((s, l) => s + l.cantidad, 0);
      $('[data-pie]', el).innerHTML = n
        ? `<button class="mf-ver" data-ver><span>${n} pieza${n === 1 ? '' : 's'}</span><strong>${pesos(t.total)}</strong><span class="mf-ver-accion">Cobrar ›</span></button>`
        : '<p class="mf-vacio">Toca las piezas para armar la venta.</p>';
      $('[data-ver]', el)?.addEventListener('click', () => { abierto = true; pintarHoja(); });
    }

    function pintarHoja() {
      const h = $('[data-hoja]', el);
      if (!abierto || !carrito.lineas.length) { h.hidden = true; abierto = false; return; }
      const t = totalesCarrito(carrito.lineas, carrito.medio);
      h.hidden = false;
      h.innerHTML = `
        <div class="mf-hoja-fondo" data-cerrar></div>
        <section class="mf-hoja-panel" role="dialog" aria-label="Venta">
          <div class="mf-hoja-cabeza"><h2>Venta</h2><button class="btn-icono" data-cerrar aria-label="Cerrar">✕</button></div>
          <ul class="mf-lineas">${carrito.lineas.map((l) => `
            <li data-key="${esc(l.key)}">
              <span class="mf-linea-nombre">${esc(l.nombre)}${l.calidad === 'segunda' ? ' <span class="etiqueta">2ª</span>' : ''}</span>
              <span class="mf-linea-datos">
                <button class="mf-mas" data-menos aria-label="Una menos">−</button><span class="mf-n">${l.cantidad}</span><button class="mf-mas" data-mas aria-label="Una más">+</button>
                ${l.piezaId ? `<button class="vr-calidad ${l.calidad === 'segunda' ? 'segunda' : ''}" data-calidad>${l.calidad === 'segunda' ? '2ª' : '1ª'}</button>` : '<span></span>'}
                <span class="con-sufijo mf-precio"><input data-precio inputmode="numeric" value="${l.precio ? l.precio.toLocaleString('es-CL') : ''}" aria-label="Precio"><span class="sufijo">$</span></span>
              </span>
            </li>`).join('')}</ul>
          <div class="mf-medios">${itemsActivos('mediosPago').map((m) => `<button class="mf-medio ${m.id === carrito.medio ? 'activo' : ''}" data-medio="${esc(m.id)}">${esc(m.nombre)}${comisionDe(m.id) ? `<small>${comisionDe(m.id)} %</small>` : ''}</button>`).join('')}</div>
          <div class="vr-boleta mf-boleta"><label class="interruptor"><input type="checkbox" data-boleta ${carrito.boleta ? 'checked' : ''}><span>Boleta</span></label><input data-folio inputmode="numeric" maxlength="20" placeholder="Folio" aria-label="Folio" value="${esc(carrito.folio || '')}" class="input-folio"></div>
          <button class="btn btn-primario mf-cobrar" data-cobrar>Cobrar ${pesos(t.total)}${t.comision ? ` <small>· comisión ${pesos(t.comision)}</small>` : ''}</button>
        </section>`;
      $$('[data-cerrar]', h).forEach((b) => b.addEventListener('click', () => { abierto = false; pintarHoja(); }));
      $$('li[data-key]', h).forEach((li) => {
        const l = carrito.lineas.find((x) => x.key === li.dataset.key);
        $('[data-mas]', li).addEventListener('click', () => { l.cantidad++; guardarCarrito(); pintarTodo(); });
        $('[data-menos]', li).addEventListener('click', () => { l.cantidad--; if (l.cantidad <= 0) carrito.lineas.splice(carrito.lineas.indexOf(l), 1); guardarCarrito(); pintarTodo(); });
        $('[data-calidad]', li)?.addEventListener('click', () => { l.calidad = l.calidad === 'segunda' ? 'primera' : 'segunda'; l.precio = precioDe(estado.piezas[l.piezaId], l.calidad); guardarCarrito(); pintarTodo(); });
        $('[data-precio]', li).addEventListener('change', (e) => { const v = leerNumero(e.target.value); if (v >= 0) l.precio = v; guardarCarrito(); pintarTodo(); });
      });
      $$('[data-medio]', h).forEach((b) => b.addEventListener('click', () => { carrito.medio = b.dataset.medio; guardarCarrito(); pintarHoja(); }));
      $('[data-boleta]', h).addEventListener('change', (e) => { carrito.boleta = e.target.checked; guardarCarrito(); });
      $('[data-folio]', h).addEventListener('input', (e) => { carrito.folio = e.target.value; if (e.target.value) { carrito.boleta = true; $('[data-boleta]', h).checked = true; } guardarCarrito(); });
      $('[data-cobrar]', h).addEventListener('click', cobrar);
    }

    function cobrar() {
      if (carrito.lineas.some((l) => !(l.precio > 0))) { toast('Hay piezas sin precio.', 'error'); return; }
      const fe = feria();
      const lote = nuevoLote();
      const v = registrarVenta(lote, {
        lineas: carrito.lineas, medio: carrito.medio, canal: 'feria', feriaId: fe?.id || null, fecha: hoyISO(), hora: horaActual(),
        boleta: { emitida: carrito.boleta || Boolean(carrito.folio), folio: carrito.folio || '' }
      });
      enviar(lote.commit(), { alFallar: fallo });
      ultima = v;
      delDia = [...delDia, v];
      Object.assign(carrito, { lineas: [], boleta: false, folio: '' });
      guardarCarrito();
      abierto = false;
      const listo = $('[data-listo]', el);
      listo.hidden = false;
      listo.innerHTML = `<div class="mf-listo-caja"><span class="mf-listo-check">✓</span><strong>${pesos(v.total)}</strong><span>${esc(nombreItem('mediosPago', v.medio))}${v.boleta.emitida ? ' · con boleta' : ''}</span>
        <button class="btn btn-suave btn-chico" data-deshacer>Deshacer</button></div>`;
      $('[data-deshacer]', listo).addEventListener('click', () => {
        const l2 = nuevoLote(); anularVenta(l2, ultima, 'Deshecha en el modo feria');
        enviar(l2.commit(), { alFallar: fallo });
        delDia = delDia.map((x) => (x.id === ultima.id ? { ...x, anulado: true } : x));
        carrito.lineas = ultima.lineas.map((l, i) => ({ ...l, key: `d${i}${Date.now()}` }));
        guardarCarrito(); listo.hidden = true; toast('Venta deshecha: las piezas volvieron al carrito.'); pintarTodo();
      });
      clearTimeout(cobrar.t); cobrar.t = setTimeout(() => { listo.hidden = true; }, 4000);
      pintarTodo();
    }

    function pintarTodo() { pintarCabeza(); pintarGrilla(); pintarPie(); pintarHoja(); }
    const des = [alCambiar(() => { pintarCabeza(); pintarGrilla(); }), escucharDonde('ventas', 'fecha', '==', hoyISO(), (l) => { delDia = l; pintarCabeza(); })];
    pintarTodo();
    return () => { des.forEach((u) => u()); document.body.classList.remove('modo-feria'); };
  }
};
