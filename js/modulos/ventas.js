// Ventas: venta rápida y ferias (clientes finales), órdenes de venta,
// consignación y facturación (empresas), y la ficha de clientes.
import { estado, alCambiar, enviar, firma } from '../datos.js';
import { esc, info, toast, $, $$, formulario, rutValido, formatearRut, limpiarRut, fechaCorta } from '../ui.js';
import { nuevoLote, refNueva, refDoc } from '../stock.js';
import { pestanas, vacio, avisoError, avisoGuardado } from '../comunes.js';
import { CONDICIONES, nombreCliente, clientePorRut } from '../cobranza-core.js';
import { ICONOS } from '../iconos.js';
import { vistaVentaRapida, vistaHistorial, vistaFerias, vistaAnalisis } from './venta-rapida.js';
import { vistaOrdenes, vistaConsignacion, vistaPorFacturar } from './ventas-b2b.js';

const PEST = [['venta-rapida', 'Venta rápida'], ['historial', 'Historial'], ['ferias', 'Ferias'], ['analisis', 'Análisis'], ['ordenes', 'Órdenes'], ['consignacion', 'Consignación'], ['por-facturar', 'Por facturar'], ['clientes', 'Clientes']];
const fallo = avisoError(toast);
const norm = (t) => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

export default {
  render(el, { sub }) {
    const actual = PEST.some(([k]) => k === sub) ? sub : 'venta-rapida';
    el.innerHTML = `
      <header class="pagina-cabecera">
        <h1>Ventas</h1>
        <p class="pagina-bajada">${{
          clientes: 'Tiendas, cafeterías y profesionales a los que facturas, y clientes finales que quieres recordar.',
          'venta-rapida': 'Ventas en feria, en el taller o por Instagram, pieza por pieza. Funciona sin señal.',
          historial: 'Todas las ventas directas, día por día.',
          ferias: 'Cada feria con sus fechas, costos y resultado.',
          analisis: 'Qué se vende, dónde, cómo se paga y a qué hora.',
          ordenes: 'Pedidos de tiendas y cafeterías, con PDF para mandar por WhatsApp.',
          consignacion: 'Piezas que dejaste en tiendas para que las vendan, y sus liquidaciones.',
          'por-facturar': 'Órdenes entregadas sin factura, listas para el facturador del SII.'
        }[actual]}</p>
      </header>
      ${pestanas('ventas', PEST, actual)}
      <div id="ven-cuerpo"></div>`;
    const c = $('#ven-cuerpo', el);
    if (actual === 'clientes') return vistaClientes(c);
    if (actual === 'venta-rapida') return vistaVentaRapida(c);
    if (actual === 'historial') return vistaHistorial(c);
    if (actual === 'ferias') return vistaFerias(c);
    if (actual === 'analisis') return vistaAnalisis(c);
    if (actual === 'ordenes') return vistaOrdenes(c);
    if (actual === 'consignacion') return vistaConsignacion(c);
    if (actual === 'por-facturar') return vistaPorFacturar(c);
    return null;
  }
};

function vistaClientes(el) {
  const f = { texto: '', tipo: '', archivados: false };
  el.innerHTML = `
    <div class="barra-herramientas">
      <input type="search" class="buscador" placeholder="Buscar por nombre o RUT" aria-label="Buscar cliente">
      <select class="filtro" aria-label="Tipo"><option value="">Todos</option><option value="empresa">Empresas</option><option value="persona">Clientes finales</option></select>
      <label class="interruptor"><input type="checkbox" data-arch><span>Archivados</span></label>
      <span class="espacio"></span>
      <button class="btn btn-primario" data-nuevo>${ICONOS.mas2}<span>Nuevo cliente</span></button>
    </div>
    <div data-lista></div>`;
  $('.buscador', el).addEventListener('input', (e) => { f.texto = e.target.value; pintar(); });
  $('.filtro', el).addEventListener('change', (e) => { f.tipo = e.target.value; pintar(); });
  $('[data-arch]', el).addEventListener('change', (e) => { f.archivados = e.target.checked; pintar(); });
  $('[data-nuevo]', el).addEventListener('click', () => editarCliente());
  const lista = $('[data-lista]', el);
  function pintar() {
    const todos = Object.values(estado.clientes);
    if (!todos.length) {
      lista.innerHTML = vacio('Todavía no hay clientes', 'Crea las tiendas y cafeterías a las que facturas. También se crean solos al cargar en Cobranza los XML de las facturas emitidas.', '<button class="btn btn-primario" data-nuevo2>Crear el primer cliente</button>');
      $('[data-nuevo2]', lista)?.addEventListener('click', () => editarCliente());
      return;
    }
    const q = norm(f.texto.trim());
    const qr = limpiarRut(f.texto);
    const vis = todos.filter((c) => Boolean(c.archivado) === f.archivados && (!f.tipo || c.tipo === f.tipo)
      && (!q || norm(nombreCliente(c)).includes(q) || norm(c.razonSocial).includes(q) || (qr.length > 3 && (c.rutLimpio || '').includes(qr))))
      .sort((a, b) => nombreCliente(a).localeCompare(nombreCliente(b), 'es'));
    if (!vis.length) { lista.innerHTML = vacio('Sin resultados', 'Prueba con otra búsqueda o cambia el filtro.'); return; }
    lista.innerHTML = `<section class="panel tabla-panel"><ul class="filas">${vis.map((c) => `
      <li><button class="fila" data-id="${esc(c.id)}">
        <span class="fila-principal"><span class="fila-nombre">${esc(nombreCliente(c))}</span>
          <span class="fila-meta">
            <span>${c.tipo === 'persona' ? 'Cliente final' : esc(c.rut || 'Empresa')}</span>
            ${c.tipo === 'empresa' ? `<span>${esc(CONDICIONES.find(([d]) => d === (c.condicionDias ?? 30))?.[1] || `${c.condicionDias} días`)}</span>` : ''}
            ${c.whatsapp ? '<span>WhatsApp</span>' : ''}
            ${c.ultimoRecordatorio ? `<span>Último recordatorio ${fechaCorta(c.ultimoRecordatorio.fecha)}</span>` : ''}
          </span></span>
      </button></li>`).join('')}</ul></section>`;
    $$('.fila', lista).forEach((b) => b.addEventListener('click', () => editarCliente(estado.clientes[b.dataset.id])));
  }
  pintar();
  return alCambiar(pintar);
}

export async function editarCliente(c = null, { tipoInicial = 'empresa', alCrear } = {}) {
  const nuevo = !c;
  const d = c || { tipo: tipoInicial, rut: '', razonSocial: '', nombre: '', giro: '', direccion: '', comuna: '', contacto: '', whatsapp: '', correo: '', instagram: '', condicionDias: 30, notas: '' };
  const campo = (k, l, extra = '', ancho = false) => `<label class="campo ${ancho ? 'campo-ancho' : ''}" data-campo="${k}"><span class="campo-etiqueta">${l}</span><input name="${k}" value="${esc(d[k] || '')}" autocomplete="off" ${extra}></label>`;
  const cuerpo = `
    <div class="segmentado" role="radiogroup">
      <label><input type="radio" name="tipo" value="empresa" ${d.tipo !== 'persona' ? 'checked' : ''}><span>Empresa o profesional</span></label>
      <label><input type="radio" name="tipo" value="persona" ${d.tipo === 'persona' ? 'checked' : ''}><span>Cliente final</span></label>
    </div>
    <div class="campos">
      <div data-empresa class="campos campo-ancho">
        <label class="campo"><span class="campo-etiqueta">RUT <span class="req">*</span></span><input name="rut" value="${esc(d.rut || '')}" placeholder="76.123.456-7" autocomplete="off"><small class="campo-error" data-rut-error hidden>RUT no válido.</small></label>
        ${campo('razonSocial', 'Razón social <span class="req">*</span>')}
        ${campo('nombre', `Nombre del local ${info('Como lo conoces: «Café Lumbre», «Tienda Barro». Es el nombre que se ve en las listas. Si lo dejas vacío, se usa la razón social.')}`)}
        ${campo('giro', 'Giro')}
        ${campo('direccion', 'Dirección')}
        ${campo('comuna', 'Comuna')}
        ${campo('contacto', `Contacto ${info('Quién recibe los pedidos o paga las facturas.')}`)}
        <label class="campo"><span class="campo-etiqueta">Plazo de pago ${info('Días que tiene para pagar desde la fecha de la factura. Se usa para calcular el vencimiento y los días de atraso cuando la factura no trae fecha de vencimiento.')}</span>
          <select name="condicionDias">${CONDICIONES.map(([v, t]) => `<option value="${v}" ${(d.condicionDias ?? 30) === v ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
      </div>
      <div data-persona class="campos campo-ancho">
        ${campo('nombrePersona', 'Nombre <span class="req">*</span>')}
        ${campo('instagram', 'Instagram', 'placeholder="usuario, sin @"')}
      </div>
      ${campo('whatsapp', `WhatsApp ${info('Con código de país o con el 9 adelante: +56 9 1234 5678. Se usa para mandar recordatorios y documentos.')}`, 'inputmode="tel" placeholder="+56 9 1234 5678"')}
      ${campo('correo', 'Correo', 'type="email"')}
      <label class="campo campo-ancho"><span class="campo-etiqueta">Notas</span><textarea name="notas" rows="2" maxlength="500" placeholder="Qué le gusta, cómo prefiere que le avisen, horarios de recepción…">${esc(d.notas || '')}</textarea></label>
    </div>`;
  const extra = nuevo ? '' : `<button type="button" class="btn btn-suave" data-archivar>${d.archivado ? 'Reactivar' : 'Archivar'}</button>`;
  let creado = null;
  await formulario({
    titulo: nuevo ? 'Nuevo cliente' : nombreCliente(d), cuerpo, extra, ancho: true,
    textoGuardar: nuevo ? 'Crear cliente' : 'Guardar cambios',
    montar(dlg, form, cerrar) {
      // El nombre de un cliente final usa su propio campo.
      form.nombrePersona.value = d.tipo === 'persona' ? d.nombre || '' : '';
      const v = () => {
        const emp = form.tipo.value === 'empresa';
        $('[data-empresa]', dlg).hidden = !emp;
        $('[data-persona]', dlg).hidden = emp;
      };
      $$('input[name=tipo]', dlg).forEach((r) => r.addEventListener('change', v));
      v();
      form.rut.addEventListener('blur', () => {
        if (form.rut.value.trim()) form.rut.value = formatearRut(form.rut.value);
        $('[data-rut-error]', dlg).hidden = !form.rut.value.trim() || rutValido(form.rut.value);
      });
      $('[data-archivar]', dlg)?.addEventListener('click', () => {
        enviar(nuevoLote().update(refDoc('clientes', d.id), { archivado: !d.archivado, ...firma() }).commit(), { alGuardar: avisoGuardado(toast, d.archivado ? 'Cliente reactivado' : 'Cliente archivado'), alFallar: fallo });
        cerrar();
      });
    },
    guardar(form) {
      const tipo = form.tipo.value;
      const v = (k) => form.elements[k].value.trim();
      let datos;
      if (tipo === 'empresa') {
        const rut = v('rut');
        if (!rut || !rutValido(rut)) return 'Escribe un RUT válido.';
        if (!v('razonSocial')) return 'Escribe la razón social.';
        const otro = clientePorRut(limpiarRut(rut));
        if (otro && otro.id !== d.id) return `Ya existe un cliente con ese RUT: ${nombreCliente(otro)}.`;
        datos = { tipo, rut: formatearRut(rut), rutLimpio: limpiarRut(rut), razonSocial: v('razonSocial'), nombre: v('nombre') || v('razonSocial'), giro: v('giro'), direccion: v('direccion'), comuna: v('comuna'), contacto: v('contacto'), condicionDias: Number(form.condicionDias.value) };
      } else {
        if (!v('nombrePersona')) return 'Escribe el nombre.';
        datos = { tipo, nombre: v('nombrePersona'), instagram: v('instagram').replace(/^@/, ''), rut: '', rutLimpio: '' };
      }
      Object.assign(datos, { whatsapp: v('whatsapp'), correo: v('correo'), notas: v('notas') });
      const lote = nuevoLote();
      if (nuevo) {
        const ref = refNueva('clientes');
        lote.set(ref, { ...datos, archivado: false, creadoMs: Date.now(), ...firma() });
        creado = { id: ref.id, ...datos };
      } else lote.update(refDoc('clientes', d.id), { ...datos, ...firma() });
      enviar(lote.commit(), { alGuardar: avisoGuardado(toast, nuevo ? `Cliente «${datos.nombre}» creado` : 'Cliente guardado'), alFallar: fallo });
      return null;
    }
  });
  if (creado) alCrear?.(creado);
  return creado;
}

