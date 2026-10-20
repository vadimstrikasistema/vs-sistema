// Configuración: datos de la empresa, costeo, listas editables y sistema.
import {
  estado, alCambiar, enviar, guardarEmpresa, guardarCosteo,
  validarNombre, agregarItem, renombrarItem, cambiarVisibilidad, moverItem
} from '../datos.js';
import { auth } from '../firebase.js';
import { APP_VERSION, SCHEMA_VERSION, CORREOS_PERMITIDOS } from '../config.js';
import { esc, info, toast, dialogo, $, $$, rutValido, formatearRut } from '../ui.js';
import { ICONOS } from '../iconos.js';

const PESTANAS = [
  ['empresa', 'Empresa'],
  ['costeo', 'Costeo'],
  ['listas', 'Listas'],
  ['sistema', 'Sistema']
];

const avisoGuardado = (que) => (enLinea) =>
  toast(enLinea ? `${que} guardado.` : `${que} guardado en este equipo. Se sincroniza al volver la señal.`);
const avisoError = (e) =>
  toast(e?.code === 'permission-denied'
    ? 'No se guardó: esta cuenta no tiene permiso para escribir.'
    : 'No se pudo guardar. Revisa la conexión e intenta de nuevo.', 'error');

export default {
  render(el, { sub }) {
    const pestana = PESTANAS.some(([k]) => k === sub) ? sub : 'empresa';
    el.innerHTML = `
      <header class="pagina-cabecera">
        <h1>Configuración</h1>
      </header>
      <nav class="pestanas" aria-label="Secciones de configuración">
        ${PESTANAS.map(([k, t]) => `<a href="#/configuracion/${k}" class="pestana ${k === pestana ? 'activa' : ''}" ${k === pestana ? 'aria-current="page"' : ''}>${t}</a>`).join('')}
      </nav>
      <div id="conf-cuerpo"></div>`;
    const cuerpo = $('#conf-cuerpo', el);
    const secciones = { empresa, costeo, listas, sistema };
    return secciones[pestana](cuerpo);
  }
};

// ---------------------------------------------------------------- Empresa
const CAMPOS_EMPRESA = [
  ['nombreFantasia', 'Nombre de fantasía', 'text', 'Como aparece en la app, los PDF y los mensajes.'],
  ['razonSocial', 'Razón social', 'text', 'Tal como está inscrita en el SII. Va en los datos para facturar.'],
  ['rut', 'RUT de la empresa', 'text', null],
  ['giro', 'Giro', 'text', 'La actividad registrada en el SII, por ejemplo «Fabricación de productos de cerámica».'],
  ['direccion', 'Dirección', 'text', null],
  ['comuna', 'Comuna', 'text', null],
  ['ciudad', 'Ciudad', 'text', null],
  ['correo', 'Correo de contacto', 'email', null],
  ['telefono', 'Teléfono', 'tel', null],
  ['whatsapp', 'WhatsApp', 'tel', 'Con código de país, por ejemplo +56 9 1234 5678. Se usa para el botón de WhatsApp en los PDF.'],
  ['instagram', 'Instagram', 'text', 'Solo el usuario, sin @.']
];

function empresa(el) {
  let sucio = false;
  const pintar = () => {
    if (sucio) return;
    const e = estado.empresa || {};
    el.innerHTML = `
      <form class="panel formulario" id="form-empresa" novalidate>
        <h2>Datos de la empresa</h2>
        <div class="campos">
          ${CAMPOS_EMPRESA.map(([k, l, t, ayuda]) => `
            <label class="campo ${['direccion', 'giro', 'razonSocial'].includes(k) ? 'campo-ancho' : ''}">
              <span class="campo-etiqueta">${esc(l)} ${ayuda ? info(ayuda) : ''}</span>
              <input name="${k}" type="${t}" value="${esc(e[k] || '')}" autocomplete="off" ${k === 'rut' ? 'inputmode="text" placeholder="12.345.678-9"' : ''}>
              ${k === 'rut' ? '<small class="campo-error" id="rut-error" hidden>El RUT no es válido. Revisa el dígito verificador.</small>' : ''}
            </label>`).join('')}
        </div>
        <div class="formulario-pie">
          <button class="btn btn-primario" type="submit">Guardar datos</button>
        </div>
      </form>`;
    const f = $('#form-empresa', el);
    f.addEventListener('input', () => { sucio = true; });
    const rut = f.elements.rut;
    rut.addEventListener('blur', () => {
      if (rut.value.trim()) rut.value = formatearRut(rut.value);
      $('#rut-error', el).hidden = !rut.value.trim() || rutValido(rut.value);
    });
    f.addEventListener('submit', (ev) => {
      ev.preventDefault();
      const datos = Object.fromEntries(new FormData(f));
      Object.keys(datos).forEach((k) => { datos[k] = datos[k].trim(); });
      if (datos.rut && !rutValido(datos.rut)) {
        $('#rut-error', el).hidden = false;
        rut.focus();
        return;
      }
      datos.rut = datos.rut ? formatearRut(datos.rut) : '';
      datos.instagram = datos.instagram.replace(/^@/, '');
      if (!datos.nombreFantasia) datos.nombreFantasia = 'Vadim Strika';
      sucio = false;
      enviar(guardarEmpresa(datos), { alGuardar: avisoGuardado('Datos de la empresa'), alFallar: avisoError });
    });
  };
  pintar();
  return alCambiar(pintar);
}

// ---------------------------------------------------------------- Costeo
function costeo(el) {
  const pintar = () => {
    const c = estado.costeo || { metodo: 'ultima', iva: 19 };
    el.innerHTML = `
      <section class="panel">
        <h2>Costo de los insumos</h2>
        <p class="texto-suave">Define con qué valor se costean los insumos en las recetas y en las piezas.</p>
        <div class="opciones" role="radiogroup" aria-label="Método de costeo">
          <label class="opcion ${c.metodo === 'ultima' ? 'elegida' : ''}">
            <input type="radio" name="metodo" value="ultima" ${c.metodo === 'ultima' ? 'checked' : ''}>
            <span class="opcion-titulo">Última compra</span>
            <span class="opcion-detalle">Cada insumo vale lo que costó la última vez que se compró. Refleja al tiro las alzas de precio. Recomendado.</span>
          </label>
          <label class="opcion ${c.metodo === 'promedio' ? 'elegida' : ''}">
            <input type="radio" name="metodo" value="promedio" ${c.metodo === 'promedio' ? 'checked' : ''}>
            <span class="opcion-titulo">Promedio ponderado</span>
            <span class="opcion-detalle">Promedia el costo de lo que hay en bodega según cuánto se compró a cada precio. Suaviza los saltos de precio.</span>
          </label>
        </div>
        <dl class="datos-fijos">
          <div><dt>IVA ${info('Con factura, el costo del insumo es el neto: el IVA es crédito fiscal. Con boleta, el costo es todo lo pagado. Siempre se registra el total pagado y la app calcula.')}</dt><dd>${esc(c.iva)} %</dd></div>
        </dl>
      </section>`;
    $$('input[name="metodo"]', el).forEach((r) => r.addEventListener('change', async () => {
      if (r.value === c.metodo) return;
      const ok = await dialogo({
        titulo: 'Cambiar método de costeo',
        cuerpo: `<p>Desde ahora los costos se calcularán con <strong>${r.value === 'ultima' ? 'última compra' : 'promedio ponderado'}</strong>. Los costos ya registrados en ventas pasadas no cambian.</p>`,
        botones: [{ texto: 'Cancelar', valor: false }, { texto: 'Cambiar método', valor: true }]
      });
      if (ok?.valor) {
        enviar(guardarCosteo({ metodo: r.value }), { alGuardar: avisoGuardado('Método de costeo'), alFallar: avisoError });
      } else {
        pintar();
      }
    }));
  };
  pintar();
  return alCambiar(pintar);
}

// ---------------------------------------------------------------- Listas
function listas(el) {
  try { localStorage.setItem('vs-listas-revisadas', '1'); } catch { /* sin almacenamiento */ }
  const abiertas = new Set();
  let verOcultos = false;

  const pintar = () => {
    const claves = Object.keys(estado.listas).sort((a, b) => (estado.listas[a].orden ?? 0) - (estado.listas[b].orden ?? 0));
    if (!claves.length) {
      el.innerHTML = '<section class="panel"><p class="texto-suave">Cargando listas…</p></section>';
      return;
    }
    el.innerHTML = `
      <section class="panel listas-intro">
        <p>Estas listas alimentan los selectores de toda la app. ${info('Renombrar un ítem cambia el nombre en todos los registros que lo usan. Ocultar lo saca de los selectores, pero los registros antiguos lo siguen mostrando. Nada se borra.')}</p>
        <label class="interruptor">
          <input type="checkbox" id="ver-ocultos" ${verOcultos ? 'checked' : ''}>
          <span>Mostrar ocultos</span>
        </label>
      </section>
      ${claves.map((k) => tarjetaLista(k, estado.listas[k])).join('')}`;

    $('#ver-ocultos', el).addEventListener('change', (e) => { verOcultos = e.target.checked; pintar(); });
    $$('details.lista', el).forEach((d) => d.addEventListener('toggle', () => {
      d.open ? abiertas.add(d.dataset.clave) : abiertas.delete(d.dataset.clave);
    }));
    $$('[data-accion]', el).forEach((b) => b.addEventListener('click', () => accion(b)));
    $$('form.agregar', el).forEach((f) => f.addEventListener('submit', (e) => {
      e.preventDefault();
      const clave = f.dataset.clave;
      const nombre = f.elements.nombre.value;
      const error = validarNombre(clave, nombre);
      if (error) { toast(error, 'error'); f.elements.nombre.focus(); return; }
      enviar(agregarItem(clave, nombre), { alGuardar: () => toast(`«${nombre.trim()}» agregado.`), alFallar: avisoError });
    }));
  };

  function tarjetaLista(clave, l) {
    const items = [...l.items].sort((a, b) => a.orden - b.orden);
    const visibles = items.filter((i) => verOcultos || i.activo);
    const ocultos = items.filter((i) => !i.activo).length;
    return `
      <details class="panel lista" data-clave="${clave}" ${abiertas.has(clave) ? 'open' : ''}>
        <summary>
          <span class="lista-nombre">${esc(l.nombre)}</span>
          <span class="lista-cuenta">${items.length - ocultos}${ocultos ? ` · ${ocultos} oculto${ocultos > 1 ? 's' : ''}` : ''}</span>
        </summary>
        <p class="texto-suave lista-desc">${esc(l.descripcion || '')}</p>
        <ul class="items">
          ${visibles.map((i, n) => `
            <li class="item ${i.activo ? '' : 'item-oculto'}">
              <span class="item-nombre">${esc(i.nombre)}${i.fijo ? ' <span class="etiqueta">Fijo</span>' : ''}${i.activo ? '' : ' <span class="etiqueta etiqueta-suave">Oculto</span>'}</span>
              <span class="item-acciones">
                <button class="btn-icono" data-accion="subir" data-clave="${clave}" data-id="${esc(i.id)}" aria-label="Subir ${esc(i.nombre)}" ${n === 0 ? 'disabled' : ''}>${ICONOS.arriba}</button>
                <button class="btn-icono" data-accion="bajar" data-clave="${clave}" data-id="${esc(i.id)}" aria-label="Bajar ${esc(i.nombre)}" ${n === visibles.length - 1 ? 'disabled' : ''}>${ICONOS.abajo}</button>
                <button class="btn-icono" data-accion="renombrar" data-clave="${clave}" data-id="${esc(i.id)}" aria-label="Renombrar ${esc(i.nombre)}">${ICONOS.lapiz}</button>
                ${i.fijo
                  ? `<span class="btn-icono deshabilitado" title="Ítem fijo: el sistema lo necesita">${ICONOS.candado}</span>`
                  : `<button class="btn-icono" data-accion="${i.activo ? 'ocultar' : 'mostrar'}" data-clave="${clave}" data-id="${esc(i.id)}" aria-label="${i.activo ? 'Ocultar' : 'Mostrar'} ${esc(i.nombre)}">${i.activo ? ICONOS.ojo : ICONOS.ojoTachado}</button>`}
              </span>
            </li>`).join('')}
        </ul>
        <form class="agregar" data-clave="${clave}">
          <input name="nombre" type="text" maxlength="60" placeholder="Nuevo ítem" aria-label="Nuevo ítem en ${esc(l.nombre)}" autocomplete="off">
          <button class="btn btn-suave" type="submit">${ICONOS.mas2}<span>Agregar</span></button>
        </form>
      </details>`;
  }

  async function accion(b) {
    const { accion: a, clave, id } = b.dataset;
    const item = estado.listas[clave].items.find((i) => i.id === id);
    if (a === 'subir' || a === 'bajar') {
      enviar(moverItem(clave, id, a === 'subir' ? -1 : 1, verOcultos), { alFallar: avisoError });
    } else if (a === 'ocultar' || a === 'mostrar') {
      enviar(cambiarVisibilidad(clave, id, a === 'mostrar'), {
        alGuardar: () => toast(a === 'ocultar' ? `«${item.nombre}» oculto. Puedes volver a mostrarlo cuando quieras.` : `«${item.nombre}» visible de nuevo.`),
        alFallar: avisoError
      });
    } else if (a === 'renombrar') {
      const r = await dialogo({
        titulo: 'Renombrar',
        cuerpo: `<label class="campo"><span class="campo-etiqueta">Nombre</span><input name="nombre" value="${esc(item.nombre)}" maxlength="60" required></label>
                 <p class="texto-suave">Todos los registros que usan «${esc(item.nombre)}» mostrarán el nombre nuevo.</p>`,
        botones: [{ texto: 'Cancelar', valor: false }, { texto: 'Guardar nombre', valor: true }]
      });
      if (!r?.valor) return;
      const nuevo = r.datos.nombre || '';
      if (nuevo.trim() === item.nombre) return;
      const error = validarNombre(clave, nuevo, id);
      if (error) { toast(error, 'error'); return; }
      enviar(renombrarItem(clave, id, nuevo), { alGuardar: () => toast('Nombre actualizado.'), alFallar: avisoError });
    }
  }

  pintar();
  return alCambiar(pintar);
}

// ---------------------------------------------------------------- Sistema
function sistema(el) {
  const pintar = () => {
    const esquema = estado.sistema?.schemaVersion;
    const coincide = esquema === SCHEMA_VERSION;
    const usuario = auth.currentUser?.email || '';
    el.innerHTML = `
      <section class="panel">
        <h2>Versión</h2>
        <dl class="datos-fijos">
          <div><dt>App</dt><dd>${esc(APP_VERSION)}</dd></div>
          <div><dt>Estructura de datos ${info('La versión de cómo están ordenados los datos en Firestore. Debe coincidir con la que espera la app.')}</dt><dd>${esquema ?? '—'} <span class="texto-suave">(la app espera ${SCHEMA_VERSION})</span></dd></div>
        </dl>
        ${esquema != null && !coincide ? `<p class="aviso">${esquema > SCHEMA_VERSION
          ? 'Los datos son de una versión más nueva que esta app. Pulsa «Buscar actualización» o recarga la página.'
          : 'Los datos son de una versión anterior. La app los actualizará al abrir la próxima fase.'}</p>` : ''}
        <div class="formulario-pie">
          <button class="btn btn-suave" id="actualizar">Buscar actualización</button>
        </div>
      </section>
      <section class="panel">
        <h2>Cuenta</h2>
        <dl class="datos-fijos">
          <div><dt>Sesión iniciada como</dt><dd>${esc(usuario)}</dd></div>
          <div><dt>Usuarios con acceso ${info('Para agregar a alguien: crea su cuenta en Firebase (Authentication → Usuarios) y agrega su correo en config.js y en las reglas de Firestore. El README explica los pasos.')}</dt>
            <dd>${CORREOS_PERMITIDOS.map(esc).join('<br>')}</dd></div>
        </dl>
        <div class="formulario-pie">
          <button class="btn btn-peligro" id="salir">Cerrar sesión</button>
        </div>
      </section>`;
    $('#salir', el).addEventListener('click', () => window.dispatchEvent(new Event('vs:salir')));
    $('#actualizar', el).addEventListener('click', async () => {
      const reg = await navigator.serviceWorker?.getRegistration();
      if (reg) await reg.update().catch(() => {});
      toast('Buscando actualización…');
      setTimeout(() => location.reload(), 900);
    });
  };
  pintar();
  return alCambiar(pintar);
}
