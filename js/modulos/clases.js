// Clases: cursos y talleres con sesiones, alumnos, pagos y materiales.
import { estado, alCambiar, enviar, itemsActivos, nombreItem } from '../datos.js';
import { esc, info, toast, $, $$, formulario, confirmar, leerNumero, numero, pesos, hoyISO, fechaCorta } from '../ui.js';
import { nuevoLote } from '../stock.js';
import { opcionesInsumos, nombreUnidad, campoNumero, vacio, avisoError, avisoGuardado } from '../comunes.js';
import { nombreCliente } from '../cobranza-core.js';
import { enlaceWhatsApp } from '../pdf.js';
import {
  alumnosActivos, sesionesVivas, pagadoAlumno, precioAlumno, saldoAlumno, resumenCurso, generarSesiones,
  crearCurso, actualizarCurso, agregarAlumno, pagarAlumno, anularPagoAlumno, retirarAlumno, usarMaterial,
  anularMaterial, actualizarSesion, nuevaKey
} from '../clases-core.js';
import { editarCliente } from './ventas.js';
import { ICONOS } from '../iconos.js';

const fallo = avisoError(toast);
const curso = (id) => estado.cursos[id];
const diaLargo = (iso) => { const t = new Date(`${iso}T12:00`).toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long' }); return t.charAt(0).toUpperCase() + t.slice(1); };
const horario = (s) => (s.hora ? `${s.hora}${s.horaFin ? `–${s.horaFin}` : ''}` : '');
const medios = (actual = '') => itemsActivos('mediosPago').map((m) => `<label><input type="radio" name="medio" value="${esc(m.id)}" ${m.id === actual ? 'checked' : ''}><span>${esc(m.nombre)}</span></label>`).join('');
const guardar = (fn, msj) => { const lote = nuevoLote(); fn(lote); enviar(lote.commit(), { alGuardar: avisoGuardado(toast, msj), alFallar: fallo }); };

export default {
  render(el, { sub }) {
    if (sub) return vistaCurso(el, sub);
    return vistaLista(el);
  }
};

// ================================================================ Lista
function vistaLista(el) {
  let ver = 'activos';
  el.innerHTML = `
    <header class="pagina-cabecera">
      <h1>Clases</h1>
      <p class="pagina-bajada">Ciclos de clases y talleres: sesiones, alumnos, pagos y materiales.</p>
    </header>
    <div class="resumen" data-resumen></div>
    <div class="barra-herramientas">
      <select class="filtro" aria-label="Mostrar"><option value="activos">En curso</option><option value="terminados">Terminados</option></select>
      <span class="espacio"></span>
      <button class="btn btn-primario" data-nuevo>${ICONOS.mas2}<span>Nuevo curso</span></button>
    </div>
    <div data-lista></div>`;
  $('.filtro', el).addEventListener('change', (e) => { ver = e.target.value; pintar(); });
  $('[data-nuevo]', el).addEventListener('click', () => editarCurso());
  const lista = $('[data-lista]', el);
  function pintar() {
    const todos = Object.values(estado.cursos).filter((c) => !c.anulado);
    const act = todos.filter((c) => c.estado !== 'terminado');
    const rs = act.map(resumenCurso);
    const proximas = act.map((c) => ({ c, s: resumenCurso(c).proxima })).filter((x) => x.s).sort((a, b) => (a.s.fecha + a.s.hora).localeCompare(b.s.fecha + b.s.hora));
    $('[data-resumen]', el).innerHTML = `
      <div class="dato"><span class="dato-etq">Cursos en marcha</span><span class="dato-valor">${act.length}</span></div>
      <div class="dato"><span class="dato-etq">Alumnos</span><span class="dato-valor">${rs.reduce((s, r) => s + r.alumnos, 0)}</span></div>
      <div class="dato ${rs.some((r) => r.porCobrar) ? 'dato-alerta' : ''}"><span class="dato-etq">Por cobrar</span><span class="dato-valor">${pesos(rs.reduce((s, r) => s + r.porCobrar, 0))}</span></div>
      <div class="dato"><span class="dato-etq">Próxima clase</span><span class="dato-valor dato-texto">${proximas[0] ? `${esc(fechaCorta(proximas[0].s.fecha))}${proximas[0].s.hora ? ` · ${esc(proximas[0].s.hora)}` : ''}` : '—'}</span></div>`;
    if (!todos.length) {
      lista.innerHTML = vacio('Todavía no hay clases', 'Crea un curso (un ciclo de varias sesiones) o un taller de un día: sus sesiones aparecen en la Agenda, anotas a los alumnos y sus pagos, y los materiales que usas salen de la bodega. Al final ves cuánto dejó cada curso.', '<button class="btn btn-primario" data-nuevo2>Crear el primer curso</button>');
      $('[data-nuevo2]', lista).addEventListener('click', () => editarCurso());
      return;
    }
    const vis = (ver === 'activos' ? act : todos.filter((c) => c.estado === 'terminado')).sort((a, b) => ((resumenCurso(a).proxima?.fecha) || '9').localeCompare((resumenCurso(b).proxima?.fecha) || '9'));
    if (!vis.length) { lista.innerHTML = vacio(ver === 'activos' ? 'No hay cursos en marcha' : 'Sin cursos terminados', ver === 'activos' ? 'Crea uno nuevo o revisa los terminados.' : 'Cuando termines un curso, aparecerá aquí con su resultado.'); return; }
    lista.innerHTML = `<div class="tarjetas cl-tarjetas">${vis.map((c) => {
      const r = resumenCurso(c);
      return `<a class="tarjeta tarjeta-accion cl-tarjeta" href="#/clases/${esc(c.id)}">
        <span class="tarjeta-tipo">${c.tipo === 'taller' ? 'Taller' : 'Ciclo'} · ${r.sesiones} sesi${r.sesiones === 1 ? 'ón' : 'ones'}</span>
        <span class="tarjeta-nombre">${esc(c.nombre)}</span>
        <span class="texto-suave">${r.proxima ? `Próxima: ${esc(diaLargo(r.proxima.fecha))}${r.proxima.hora ? ` · ${esc(horario(r.proxima))}` : ''}` : c.estado === 'terminado' ? 'Terminado' : 'Sin sesiones por venir'}</span>
        <dl class="tarjeta-datos">
          <div><dt>Alumnos</dt><dd>${r.alumnos}${c.cupos ? ` de ${c.cupos}` : ''}</dd></div>
          <div><dt>Cobrado</dt><dd>${pesos(r.cobrado)}</dd></div>
          <div><dt>Por cobrar</dt><dd class="${r.porCobrar ? 'texto-alerta' : ''}">${pesos(r.porCobrar)}</dd></div>
        </dl>
      </a>`;
    }).join('')}</div>`;
  }
  pintar();
  return alCambiar(pintar);
}

// ================================================================ Crear o editar un curso
export async function editarCurso(c = null, { fecha = hoyISO() } = {}) {
  const d = c || { nombre: '', tipo: 'ciclo', precio: null, cupos: null, lugar: 'Taller', descripcion: '', otrosCostos: 0 };
  let creado = null;
  await formulario({
    titulo: c ? `Editar ${c.nombre}` : 'Nuevo curso o taller', ancho: true, textoGuardar: c ? 'Guardar cambios' : 'Crear',
    cuerpo: `
      <div class="segmentado" role="radiogroup">
        <label><input type="radio" name="tipo" value="ciclo" ${d.tipo !== 'taller' ? 'checked' : ''}><span>Ciclo de varias sesiones</span></label>
        <label><input type="radio" name="tipo" value="taller" ${d.tipo === 'taller' ? 'checked' : ''}><span>Taller de un día</span></label>
      </div>
      <div class="campos">
        <label class="campo campo-ancho"><span class="campo-etiqueta">Nombre <span class="req">*</span></span><input name="nombre" value="${esc(d.nombre)}" maxlength="80" placeholder="Ej.: Esmaltes · grupo martes, Torno para principiantes"></label>
        ${campoNumero('precio', 'Precio por alumno, con IVA', d.precio ? numero(d.precio, 0) : '', { sufijo: '$', ayuda: info('Lo que paga cada alumno por el curso completo (o por el taller). Puede pagar en partes. A un alumno puedes ponerle otro precio al inscribirlo.') })}
        ${campoNumero('cupos', 'Cupos', d.cupos || '', { sufijo: 'alumnos', placeholder: 'Opcional' })}
        <label class="campo"><span class="campo-etiqueta">Lugar</span><input name="lugar" value="${esc(d.lugar || '')}" maxlength="80"></label>
        ${c ? campoNumero('otrosCostos', 'Otros costos del curso', d.otrosCostos ? numero(d.otrosCostos, 0) : '', { sufijo: '$', ayuda: info('Lo que gastaste para el curso y no salió de bodega: quemas de las piezas de los alumnos, herramientas que les entregaste, colación. Se resta del resultado.') }) : ''}
      </div>
      ${c ? '' : `
      <h3>Sesiones ${info('Se crean todas de una vez y aparecen en la Agenda. Después puedes mover, agregar o cancelar sesiones una por una.')}</h3>
      <div class="campos">
        <label class="campo"><span class="campo-etiqueta">Primera sesión <span class="req">*</span></span><input type="date" name="desde" value="${esc(fecha)}"></label>
        <label class="campo"><span class="campo-etiqueta">Hora</span><input type="time" name="hora" value="10:00"></label>
        <label class="campo"><span class="campo-etiqueta">Hasta las</span><input type="time" name="horaFin" value="12:00"></label>
        <label class="campo" data-ciclo><span class="campo-etiqueta">Cuántas sesiones</span><input type="number" name="cantidad" min="1" max="52" value="6"></label>
        <label class="campo" data-ciclo><span class="campo-etiqueta">Cada</span><select name="cada"><option value="7">Semana</option><option value="14">Dos semanas</option></select></label>
      </div>`}
      <label class="campo campo-ancho"><span class="campo-etiqueta">Descripción</span><textarea name="descripcion" rows="2" maxlength="500" placeholder="Qué se aprende, qué incluye (pasta, esmaltes, quemas)">${esc(d.descripcion || '')}</textarea></label>`,
    montar(dlg, form) {
      const v = () => $$('[data-ciclo]', dlg).forEach((x) => { x.hidden = form.tipo.value === 'taller'; });
      $$('input[name=tipo]', dlg).forEach((r) => r.addEventListener('change', v));
      v();
    },
    guardar(form) {
      const nombre = form.nombre.value.trim();
      if (!nombre) return 'Escribe el nombre del curso.';
      const precio = leerNumero(form.precio.value) || 0;
      const cupos = Math.round(leerNumero(form.cupos.value) || 0) || null;
      const datos = { nombre, tipo: form.tipo.value, precio, cupos, lugar: form.lugar.value.trim(), descripcion: form.descripcion.value.trim() };
      const lote = nuevoLote();
      if (c) {
        actualizarCurso(lote, c, { ...datos, otrosCostos: leerNumero(form.otrosCostos.value) || 0 });
        enviar(lote.commit(), { alGuardar: avisoGuardado(toast, 'Curso guardado'), alFallar: fallo });
        return null;
      }
      if (!form.desde.value) return 'Elige la fecha de la primera sesión.';
      const cantidad = datos.tipo === 'taller' ? 1 : Math.max(1, Math.min(52, Math.round(Number(form.cantidad.value) || 1)));
      creado = crearCurso(lote, { ...datos, sesiones: generarSesiones({ desde: form.desde.value, cantidad, hora: form.hora.value, horaFin: form.horaFin.value, cadaDias: Number(form.cada.value) || 7 }) });
      enviar(lote.commit(), { alGuardar: avisoGuardado(toast, `«${nombre}» creado con ${cantidad} sesi${cantidad === 1 ? 'ón' : 'ones'} en la Agenda`), alFallar: fallo });
      return null;
    }
  });
  if (creado) location.hash = `#/clases/${creado.id}`;
}

// ================================================================ Detalle de un curso
function vistaCurso(el, id) {
  function pintar() {
    const c = curso(id);
    if (!c) { el.innerHTML = vacio('Buscando el curso…', 'Si no aparece, puede que se haya anulado.', '<a class="btn btn-suave" href="#/clases">Volver a Clases</a>'); return; }
    const r = resumenCurso(c);
    const hoy = hoyISO();
    const al = c.alumnos || [];
    const pagos = al.some((a) => (a.pagos || []).some((p) => !p.anulado));
    el.innerHTML = `
      <a href="#/clases" class="enlace-chico cl-volver">← Clases</a>
      <header class="pagina-cabecera cl-cabecera">
        <div><h1>${esc(c.nombre)}</h1>
          <p class="pagina-bajada">${c.tipo === 'taller' ? 'Taller de un día' : 'Ciclo de clases'}${c.lugar ? ` · ${esc(c.lugar)}` : ''}${c.precio ? ` · ${pesos(c.precio)} por alumno` : ''}${c.estado === 'terminado' ? ' · <strong>Terminado</strong>' : ''}${c.anulado ? ' · <strong>Anulado</strong>' : ''}</p></div>
        ${c.anulado ? '' : `<div class="grupo-botones">
          <button class="btn btn-suave btn-chico" data-editar>Editar</button>
          <button class="btn btn-suave btn-chico" data-terminar>${c.estado === 'terminado' ? 'Reabrir' : 'Terminar curso'}</button>
          ${pagos ? '' : '<button class="btn btn-peligro btn-chico" data-anular>Anular</button>'}
        </div>`}
      </header>
      ${c.descripcion ? `<p class="texto-suave">${esc(c.descripcion)}</p>` : ''}
      <div class="resumen">
        <div class="dato"><span class="dato-etq">Alumnos</span><span class="dato-valor">${r.alumnos}${c.cupos ? ` de ${c.cupos}` : ''}</span></div>
        <div class="dato"><span class="dato-etq">Cobrado</span><span class="dato-valor">${pesos(r.cobrado)}</span></div>
        <div class="dato ${r.porCobrar ? 'dato-alerta' : ''}"><span class="dato-etq">Por cobrar</span><span class="dato-valor">${pesos(r.porCobrar)}</span></div>
        <div class="dato"><span class="dato-etq">Resultado ${info('Lo cobrado sin IVA, menos los materiales que salieron de bodega y los otros costos del curso (se anotan en Editar).')}</span><span class="dato-valor ${r.resultado < 0 ? 'texto-alerta' : ''}">${pesos(r.resultado)}</span></div>
      </div>
      <div class="cl-columnas">
        <section class="panel">
          <div class="panel-cabecera"><h2>Alumnos</h2>${c.anulado ? '' : '<button class="btn btn-primario btn-chico" data-alumno>Inscribir</button>'}</div>
          ${al.length ? `<ul class="filas cl-filas">${al.map((a) => `
            <li><button class="fila ${a.retirado ? 'fila-anulada' : ''}" data-a="${esc(a.key)}">
              <span class="fila-principal"><span class="fila-nombre">${esc(a.nombre)}</span>
                <span class="fila-meta"><span>Pagó ${pesos(pagadoAlumno(a))} de ${pesos(precioAlumno(c, a))}</span>${a.retirado ? '<span class="etiqueta etiqueta-suave">Retirado</span>' : saldoAlumno(c, a) ? `<span class="etiqueta etiqueta-alerta">Debe ${pesos(saldoAlumno(c, a))}</span>` : '<span class="etiqueta etiqueta-ok">Al día</span>'}</span></span>
            </button></li>`).join('')}</ul>` : '<p class="texto-suave">Todavía no hay alumnos. Inscríbelos con su WhatsApp para recordarles las clases.</p>'}
        </section>
        <section class="panel">
          <div class="panel-cabecera"><h2>Sesiones</h2>${c.anulado ? '' : '<button class="btn btn-suave btn-chico" data-sesion>Agregar sesión</button>'}</div>
          <ul class="ag-lista">${sesionesVivas(c).map((s, i) => `
            <li><button class="ag-item ag-clase ${s.hecha || s.fecha < hoy ? 'ag-hecho' : ''}" data-s="${esc(s.key)}">
              <span class="ag-hora">${i + 1}</span>
              <span class="ag-texto"><span class="ag-titulo">${esc(diaLargo(s.fecha))}${s.hora ? ` · ${esc(horario(s))}` : ''}</span><span class="ag-sub">${esc(s.tema || 'Sin tema anotado')}${(s.asistencia || []).length ? ` · asistieron ${s.asistencia.length}` : ''}</span></span>
              ${s.fecha === hoy ? '<span class="etiqueta etiqueta-info">Hoy</span>' : ''}
            </button></li>`).join('') || '<li class="texto-suave">Sin sesiones.</li>'}</ul>
        </section>
        <section class="panel">
          <div class="panel-cabecera"><h2>Materiales</h2>${c.anulado ? '' : '<button class="btn btn-suave btn-chico" data-material>Usar material</button>'}</div>
          ${(c.materiales || []).length ? `<ul class="lista-bajos">${c.materiales.map((m) => `<li class="${m.anulado ? 'tachado' : ''}"><span>${fechaCorta(m.fecha)} · ${numero(m.cantidad)} ${esc(nombreUnidad(m.unidad))} de ${esc(m.nombre)}</span><span>${pesos(m.costo)} ${m.anulado ? '' : `<button class="btn-enlace" data-anular-mat="${esc(m.key)}">Anular</button>`}</span></li>`).join('')}
            <li><strong>Total materiales</strong><strong>${pesos(r.materiales)}</strong></li></ul>`
            : `<p class="texto-suave">Anota la pasta, los esmaltes y lo que usen los alumnos: sale de la bodega con su costo. ${info('Si preparas un esmalte para la clase, prepáralo en Producción → Recetas y después anótalo aquí como material usado.')}</p>`}
          ${c.otrosCostos ? `<p class="texto-suave">Otros costos: ${pesos(c.otrosCostos)}</p>` : ''}
        </section>
      </div>`;
    $('[data-editar]', el)?.addEventListener('click', () => editarCurso(c));
    $('[data-terminar]', el)?.addEventListener('click', async () => {
      const terminar = c.estado !== 'terminado';
      if (terminar && r.porCobrar && !(await confirmar('Terminar curso', `Todavía hay ${pesos(r.porCobrar)} por cobrar. El curso pasa a Terminados igual, y los saldos siguen visibles en él.`, 'Terminar'))) return;
      guardar((l) => actualizarCurso(l, c, { estado: terminar ? 'terminado' : 'abierto' }), terminar ? 'Curso terminado' : 'Curso reabierto');
    });
    $('[data-anular]', el)?.addEventListener('click', async () => {
      if (!(await confirmar('Anular curso', `«${esc(c.nombre)}» y sus sesiones dejan de aparecer en la Agenda. Nada se borra.`, 'Anular', true))) return;
      guardar((l) => actualizarCurso(l, c, { anulado: true }), 'Curso anulado');
      location.hash = '#/clases';
    });
    $('[data-alumno]', el)?.addEventListener('click', () => inscribir(c));
    $('[data-sesion]', el)?.addEventListener('click', () => nuevaSesion(c));
    $('[data-material]', el)?.addEventListener('click', () => material(c));
    $$('[data-a]', el).forEach((b) => b.addEventListener('click', () => detalleAlumno(c, c.alumnos.find((a) => a.key === b.dataset.a))));
    $$('[data-s]', el).forEach((b) => b.addEventListener('click', () => dialogoSesion(c.id, b.dataset.s)));
    $$('[data-anular-mat]', el).forEach((b) => b.addEventListener('click', async () => {
      const m = c.materiales.find((x) => x.key === b.dataset.anularMat);
      if (!(await confirmar('Anular material', `${numero(m.cantidad)} ${esc(nombreUnidad(m.unidad))} de ${esc(m.nombre)} vuelven a la bodega.`, 'Anular', true))) return;
      guardar((l) => anularMaterial(l, c, m), 'Material anulado');
    }));
  }
  pintar();
  return alCambiar(pintar);
}

// ---------------------------------------------------------------- Alumnos
async function inscribir(c) {
  const ya = new Set(alumnosActivos(c).map((a) => a.clienteId));
  const personas = Object.values(estado.clientes).filter((x) => !x.archivado && !ya.has(x.id)).sort((a, b) => nombreCliente(a).localeCompare(nombreCliente(b), 'es'));
  await formulario({
    titulo: `Inscribir en ${c.nombre}`, textoGuardar: 'Inscribir',
    cuerpo: `
      <label class="campo"><span class="campo-etiqueta">Alumno <span class="req">*</span> ${info('Los alumnos son clientes finales: con su WhatsApp puedes recordarles las clases. Si es nuevo, créalo con «Nuevo».')}</span>
        <span class="con-boton"><select name="cliente"><option value="">Elige…</option>${personas.map((x) => `<option value="${esc(x.id)}">${esc(nombreCliente(x))}</option>`).join('')}</select>
        <button type="button" class="btn btn-suave btn-chico" data-nuevo-cliente>Nuevo</button></span></label>
      ${campoNumero('precio', 'Precio para este alumno', c.precio ? numero(c.precio, 0) : '', { sufijo: '$', ayuda: info('Cámbialo si tiene un precio distinto: un descuento, una beca, si se inscribe a mitad de ciclo.') })}`,
    montar(dlg, form) {
      $('[data-nuevo-cliente]', dlg).addEventListener('click', async () => {
        const n = await editarCliente(null, { tipoInicial: 'persona' });
        if (!n) return;
        estado.clientes[n.id] = { ...n, ...(estado.clientes[n.id] || {}) };
        form.cliente.insertAdjacentHTML('beforeend', `<option value="${esc(n.id)}">${esc(nombreCliente(n))}</option>`);
        form.cliente.value = n.id;
      });
    },
    guardar(form) {
      const cl = estado.clientes[form.cliente.value];
      if (!cl) return 'Elige al alumno.';
      if (c.cupos && alumnosActivos(c).length >= c.cupos) return `El curso tiene ${c.cupos} cupos y ya están todos tomados. Sube los cupos en «Editar» si quieres sumar a alguien más.`;
      const precio = leerNumero(form.precio.value) || 0;
      guardar((l) => agregarAlumno(l, curso(c.id), { id: cl.id, nombre: nombreCliente(cl), whatsapp: cl.whatsapp }, precio !== c.precio ? precio : null), `${nombreCliente(cl)} inscrito`);
      return null;
    }
  });
}

async function detalleAlumno(c0, a0) {
  const c = curso(c0.id); const a = c.alumnos.find((x) => x.key === a0.key);
  const tel = a.whatsapp || estado.clientes[a.clienteId]?.whatsapp;
  await formulario({
    titulo: a.nombre, textoGuardar: '',
    extra: a.retirado ? '' : `${saldoAlumno(c, a) ? '<button type="button" class="btn btn-primario" data-pagar>Registrar pago</button>' : ''}${tel ? '<button type="button" class="btn btn-suave" data-wa>WhatsApp</button>' : ''}<button type="button" class="btn btn-peligro" data-retirar>Retirar</button>`,
    cuerpo: `
      <ul class="lista-bajos">
        <li><span>Precio</span><span>${pesos(precioAlumno(c, a))}</span></li>
        <li><span>Pagado</span><span>${pesos(pagadoAlumno(a))}</span></li>
        <li><strong>Saldo</strong><strong>${pesos(saldoAlumno(c, a))}</strong></li>
      </ul>
      <h3>Pagos ${info('Cada pago queda como una venta del canal «Clases», con su medio de pago y su boleta. Así aparece en el análisis de ventas.')}</h3>
      ${(a.pagos || []).length ? `<ul class="lista-bajos">${a.pagos.map((p) => `<li class="${p.anulado ? 'tachado' : ''}"><span>${fechaCorta(p.fecha)} · ${esc(nombreItem('mediosPago', p.medio))}</span><span>${pesos(p.monto)} ${p.anulado ? '' : `<button type="button" class="btn-enlace" data-anular-pago="${esc(p.key)}">Anular</button>`}</span></li>`).join('')}</ul>` : '<p class="texto-suave">Sin pagos todavía.</p>'}
      ${a.retirado ? `<p class="aviso">Se retiró el ${fechaCorta(a.retiradoEn)}.</p>` : ''}`,
    montar(dlg, form, cerrar) {
      $('[data-pagar]', dlg)?.addEventListener('click', () => { cerrar(); pagoAlumno(c, a); });
      $('[data-wa]', dlg)?.addEventListener('click', () => window.open(enlaceWhatsApp(tel, `Hola ${a.nombre.split(' ')[0]}, `), '_blank', 'noopener'));
      $('[data-retirar]', dlg)?.addEventListener('click', async () => {
        if (!(await confirmar('Retirar alumno', `${esc(a.nombre)} deja de contar en el curso. Sus pagos siguen registrados.`, 'Retirar', true))) return;
        guardar((l) => retirarAlumno(l, c, a), 'Alumno retirado'); cerrar();
      });
      $$('[data-anular-pago]', dlg).forEach((b) => b.addEventListener('click', async () => {
        const p = a.pagos.find((x) => x.key === b.dataset.anularPago);
        if (!(await confirmar('Anular pago', `El pago de ${pesos(p.monto)} queda anulado, y también su venta.`, 'Anular', true))) return;
        guardar((l) => anularPagoAlumno(l, c, a, p), 'Pago anulado'); cerrar();
      }));
    }
  });
}

async function pagoAlumno(c, a) {
  const saldo = saldoAlumno(c, a);
  await formulario({
    titulo: `Pago de ${a.nombre}`, textoGuardar: 'Registrar pago',
    cuerpo: `
      <p class="texto-suave">Saldo: <strong>${pesos(saldo)}</strong></p>
      ${campoNumero('monto', 'Monto', numero(saldo, 0), { sufijo: '$' })}
      <div class="campo"><span class="campo-etiqueta">Medio de pago</span><div class="segmentado segmentado-chico">${medios(itemsActivos('mediosPago').find((m) => m.id === 'transferencia')?.id || itemsActivos('mediosPago')[0]?.id)}</div></div>
      <label class="campo"><span class="campo-etiqueta">Fecha</span><input type="date" name="fecha" value="${hoyISO()}" max="${hoyISO()}"></label>
      <div class="vr-boleta"><label class="interruptor"><input type="checkbox" name="boleta"><span>Emití boleta</span></label><input name="folio" inputmode="numeric" maxlength="20" placeholder="Folio" aria-label="Folio" class="input-folio"></div>`,
    guardar(form) {
      const monto = Math.round(leerNumero(form.monto.value) || 0);
      if (!(monto > 0)) return 'Escribe el monto.';
      if (monto > saldo) return `El pago no puede ser mayor que el saldo (${pesos(saldo)}).`;
      const folio = form.folio.value.trim();
      guardar((l) => pagarAlumno(l, curso(c.id), a, { monto, medio: form.medio.value, fecha: form.fecha.value || hoyISO(), boleta: { emitida: form.boleta.checked || Boolean(folio), folio } }), `Pago de ${pesos(monto)} registrado`);
      return null;
    }
  });
}

// ---------------------------------------------------------------- Sesiones
async function nuevaSesion(c) {
  const ult = sesionesVivas(c).slice(-1)[0];
  await formulario({
    titulo: 'Agregar sesión', textoGuardar: 'Agregar',
    cuerpo: `<div class="campos">
      <label class="campo"><span class="campo-etiqueta">Día</span><input type="date" name="fecha" value="${hoyISO()}"></label>
      <label class="campo"><span class="campo-etiqueta">Hora</span><input type="time" name="hora" value="${esc(ult?.hora || '')}"></label>
      <label class="campo"><span class="campo-etiqueta">Hasta las</span><input type="time" name="horaFin" value="${esc(ult?.horaFin || '')}"></label>
      <label class="campo campo-ancho"><span class="campo-etiqueta">Tema</span><input name="tema" maxlength="100"></label></div>`,
    guardar(form) {
      if (!form.fecha.value) return 'Elige el día.';
      const s = { key: nuevaKey(), fecha: form.fecha.value, hora: form.hora.value, horaFin: form.horaFin.value, tema: form.tema.value.trim(), hecha: false, cancelada: false, asistencia: [] };
      guardar((l) => actualizarCurso(l, curso(c.id), { sesiones: [...curso(c.id).sesiones, s] }), `Sesión del ${fechaCorta(s.fecha)} agregada`);
      return null;
    }
  });
}

function mensajeRecordatorio(c, s, a) {
  const d = Math.round((new Date(`${s.fecha}T12:00`) - new Date(`${hoyISO()}T12:00`)) / 86400000);
  const cuando = d === 0 ? 'hoy' : d === 1 ? 'mañana' : `el ${diaLargo(s.fecha).toLowerCase()}`;
  return `Hola ${a.nombre.split(' ')[0]}, te recuerdo la clase de ${c.nombre} ${cuando}${s.hora ? ` a las ${s.hora}` : ''}${c.lugar ? ` en ${c.lugar.toLowerCase() === 'taller' ? 'el taller' : c.lugar}` : ''}.${s.tema ? ` Vamos a ver: ${s.tema}.` : ''}${saldoAlumno(c, a) ? ` Queda un saldo de ${pesos(saldoAlumno(c, a))}.` : ''} ¡Nos vemos!`;
}

export async function dialogoSesion(cursoId, key) {
  const c = curso(cursoId); const s = c?.sesiones.find((x) => x.key === key);
  if (!s) return;
  const al = alumnosActivos(c);
  const n = sesionesVivas(c).findIndex((x) => x.key === key) + 1;
  await formulario({
    titulo: `${c.nombre} · sesión ${n}`, ancho: true, textoGuardar: s.hecha ? 'Guardar' : 'Guardar y marcar hecha',
    extra: '<button type="button" class="btn btn-peligro" data-cancelar>Cancelar sesión</button>',
    cuerpo: `
      <div class="campos">
        <label class="campo"><span class="campo-etiqueta">Día</span><input type="date" name="fecha" value="${esc(s.fecha)}"></label>
        <label class="campo"><span class="campo-etiqueta">Hora</span><input type="time" name="hora" value="${esc(s.hora || '')}"></label>
        <label class="campo"><span class="campo-etiqueta">Hasta las</span><input type="time" name="horaFin" value="${esc(s.horaFin || '')}"></label>
        <label class="campo campo-ancho"><span class="campo-etiqueta">Tema</span><input name="tema" value="${esc(s.tema || '')}" maxlength="100" placeholder="Ej.: preparar un esmalte de ceniza"></label>
      </div>
      <h3>Alumnos ${info('Marca quién vino. Con el botón de WhatsApp le mandas a cada uno el recordatorio de la clase, con el saldo si debe algo.')}</h3>
      ${al.length ? `<ul class="lista-bajos cl-asistencia">${al.map((a) => {
        const tel = a.whatsapp || estado.clientes[a.clienteId]?.whatsapp;
        return `<li><label class="interruptor"><input type="checkbox" name="asis" value="${esc(a.key)}" ${(s.asistencia || []).includes(a.key) ? 'checked' : ''}><span>${esc(a.nombre)}${saldoAlumno(c, a) ? ` <span class="texto-alerta">· debe ${pesos(saldoAlumno(c, a))}</span>` : ''}</span></label>
          ${tel ? `<a class="btn btn-suave btn-chico" target="_blank" rel="noopener" href="${esc(enlaceWhatsApp(tel, mensajeRecordatorio(c, s, a)))}">Recordar</a>` : '<span class="texto-tenue">Sin WhatsApp</span>'}</li>`;
      }).join('')}</ul>` : '<p class="texto-suave">Todavía no hay alumnos inscritos.</p>'}`,
    montar(dlg, form, cerrar) {
      $('[data-cancelar]', dlg).addEventListener('click', async () => {
        if (!(await confirmar('Cancelar sesión', 'La sesión deja de aparecer en el curso y en la Agenda.', 'Cancelar sesión', true))) return;
        guardar((l) => actualizarSesion(l, curso(cursoId), key, { cancelada: true }), 'Sesión cancelada'); cerrar();
      });
    },
    guardar(form, dlg) {
      if (!form.fecha.value) return 'Elige el día.';
      const asistencia = $$('input[name=asis]:checked', dlg).map((x) => x.value);
      guardar((l) => actualizarSesion(l, curso(cursoId), key, { fecha: form.fecha.value, hora: form.hora.value, horaFin: form.horaFin.value, tema: form.tema.value.trim(), asistencia, hecha: true }), 'Sesión guardada');
      return null;
    }
  });
}

// ---------------------------------------------------------------- Materiales
async function material(c) {
  await formulario({
    titulo: 'Material usado en la clase', textoGuardar: 'Descontar de bodega',
    cuerpo: `
      <label class="campo"><span class="campo-etiqueta">Material <span class="req">*</span></span><select name="insumo">${opcionesInsumos('')}</select></label>
      <div class="campos">
        ${campoNumero('cantidad', 'Cantidad', '', { sufijo: '·' })}
        <label class="campo"><span class="campo-etiqueta">Fecha</span><input type="date" name="fecha" value="${hoyISO()}" max="${hoyISO()}"></label>
      </div>
      <p class="texto-suave" data-costo></p>`,
    montar(dlg, form) {
      const v = () => {
        const ins = estado.insumos[form.insumo.value];
        const suf = form.cantidad.parentElement.querySelector('.sufijo');
        if (suf) suf.textContent = ins ? nombreUnidad(ins.unidad) : '';
        const q = leerNumero(form.cantidad.value);
        const prom = ins && ins.stock > 0 ? ins.valorStock / ins.stock : ins?.costoUltimo || 0;
        $('[data-costo]', dlg).textContent = ins ? `Hay ${numero(ins.stock || 0)} ${nombreUnidad(ins.unidad)} en bodega.${q > 0 ? ` Costo aproximado: ${pesos(q * prom)}.` : ''}` : '';
      };
      form.insumo.addEventListener('change', v); form.cantidad.addEventListener('input', v); v();
    },
    guardar(form) {
      const ins = estado.insumos[form.insumo.value];
      if (!ins) return 'Elige el material.';
      const q = leerNumero(form.cantidad.value);
      if (!(q > 0)) return 'Escribe la cantidad.';
      guardar((l) => usarMaterial(l, curso(c.id), { insumoId: ins.id, cantidad: q, fecha: form.fecha.value || hoyISO() }), `${numero(q)} ${nombreUnidad(ins.unidad)} de ${ins.nombre} descontados`);
      return null;
    }
  });
}
