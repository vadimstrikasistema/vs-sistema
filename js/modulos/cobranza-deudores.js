// Cobranza → Por cobrar (todos los deudores), ficha de cobranza de un cliente
// y seguimiento de consignación.
import { estado, alCambiar, enviar, nombreItem } from '../datos.js';
import { esc, info, toast, $, $$, formulario, leerNumero, numero, pesos, hoyISO, fechaCorta } from '../ui.js';
import { nuevoLote, escucharDonde, documentosDonde } from '../stock.js';
import { vacio, avisoError, avisoGuardado, campoNumero } from '../comunes.js';
import { nombreCliente, sumarDias } from '../cobranza-core.js';
import {
  configCobranza, TONOS, TIPOS_DEUDA, TIPOS_GESTION, todasLasDeudas, deudores, siguientePaso, diasAtrasoDeuda,
  armarMensaje, registrarGestion
} from '../cobranza-gestion-core.js';
import { consignacionesAbiertas, piezasEnTienda, valorEnTienda, anotarVisita } from '../b2b-core.js';
import { ultimaVisita, liquidar, comprobante, detalleConsignacion } from './ventas-b2b.js';
import { pdfEstadoCuentaItems, compartirPDF, enlaceWhatsApp, telefonoWhatsApp } from '../pdf.js';
import { editarCliente } from './ventas.js';

const fallo = avisoError(toast);
const diasDesde = (iso) => (iso ? Math.round((new Date(`${hoyISO()}T12:00`) - new Date(`${iso}T12:00`)) / 86400000) : null);
const hace = (iso) => { const d = diasDesde(iso); return d === 0 ? 'hoy' : d === 1 ? 'ayer' : `hace ${d} días`; };
const textoAtraso = (d) => (d > 0 ? `${d} día${d === 1 ? '' : 's'} de atraso` : 'al día');
const ETQ_PASO = { amable: 'Toca: amable', firme: 'Toca: firme', ultimo: 'Toca: último aviso', llamar: 'Toca: llamar o visitar', promesa: 'Prometió pagar', esperar: 'Esperando' };
const CLASE_PASO = { amable: 'etiqueta-info', firme: 'etiqueta-alerta', ultimo: 'etiqueta-alerta', llamar: 'etiqueta-alerta', promesa: 'etiqueta-ok', esperar: 'etiqueta-suave' };

// Fuentes que no están en `estado`: facturas abiertas y ventas que quedaron debiendo.
export function escucharDeudas(alCambiar_) {
  const f = { facturas: [], ventas: [] };
  const des = [
    escucharDonde('facturas', 'abierta', '==', true, (l) => { f.facturas = l; alCambiar_(f); }),
    escucharDonde('ventas', 'deudaAbierta', '==', true, (l) => { f.ventas = l; alCambiar_(f); })
  ];
  return { fuentes: f, detener: () => des.forEach((u) => u()) };
}
export async function cargarDeudas() {
  const [facturas, ventas] = await Promise.all([
    documentosDonde('facturas', 'abierta', '==', true).catch(() => []),
    documentosDonde('ventas', 'deudaAbierta', '==', true).catch(() => [])
  ]);
  return { facturas, ventas };
}

// ================================================================ Por cobrar
export function vistaDeudores(el, { pagoDialogo }) {
  const f = { texto: '', tipo: '' };
  el.innerHTML = `
    <div class="resumen" data-resumen></div>
    <div class="barra-herramientas">
      <input type="search" class="buscador" placeholder="Buscar cliente" aria-label="Buscar cliente">
      <select class="filtro" aria-label="Clientes"><option value="">Todos</option><option value="empresa">Empresas</option><option value="persona">Clientes finales</option></select>
      <span class="espacio"></span>
      <button class="btn btn-suave" data-cargar>Cargar XML</button>
      <button class="btn btn-primario" data-pago>Registrar pago</button>
    </div>
    <div data-lista></div>`;
  $('.buscador', el).addEventListener('input', (e) => { f.texto = e.target.value.toLowerCase(); pintar(); });
  $('.filtro', el).addEventListener('change', (e) => { f.tipo = e.target.value; pintar(); });
  $('[data-cargar]', el).addEventListener('click', () => { location.hash = '#/cobranza/facturas'; });
  $('[data-pago]', el).addEventListener('click', () => pagoDialogo());
  let fuentes = { facturas: [], ventas: [] };
  const lista = $('[data-lista]', el);
  function pintar() {
    const ds = deudores(todasLasDeudas(fuentes));
    const cons = consignacionesAbiertas();
    const diasC = configCobranza().diasConsignacion;
    const consAtras = cons.filter((c) => diasDesde(ultimaVisita(c)) >= diasC);
    const semana = sumarDias(hoyISO(), 7);
    const promesas = ds.filter((d) => d.paso.accion === 'promesa' && d.cliente.cobranza?.promesa?.fecha <= semana);
    const porHacer = ds.filter((d) => ['amable', 'firme', 'ultimo', 'llamar'].includes(d.paso.accion));
    $('[data-resumen]', el).innerHTML = `
      <div class="dato"><span class="dato-etq">Te deben ${info('Facturas abiertas, órdenes entregadas sin factura, ventas que quedaron debiendo, saldos de clases y encargos listos para retirar.')}</span><span class="dato-valor">${pesos(ds.reduce((s, d) => s + d.total, 0))}</span></div>
      <div class="dato ${ds.some((d) => d.vencido) ? 'dato-alerta' : ''}"><span class="dato-etq">Vencido</span><span class="dato-valor">${pesos(ds.reduce((s, d) => s + d.vencido, 0))}</span></div>
      <div class="dato ${porHacer.length ? 'dato-alerta' : ''}"><span class="dato-etq">Gestiones para hoy ${info('Clientes a los que toca escribir según la escalera: amable cuando vence, firme si no responde en ' + configCobranza().diasEntreTonos + ' días, y después el último aviso. Los plazos y los textos se cambian en Configuración → Cobranza.')}</span><span class="dato-valor">${porHacer.length}</span></div>
      <div class="dato"><span class="dato-etq">Promesas esta semana</span><span class="dato-valor">${promesas.length}</span></div>`;
    const q = f.texto.trim();
    const vis = ds.filter((d) => (!f.tipo || (f.tipo === 'empresa' ? d.cliente.tipo === 'empresa' : d.cliente.tipo !== 'empresa')) && (!q || nombreCliente(d.cliente).toLowerCase().includes(q)));
    const avisoCons = consAtras.length ? `<a class="aviso aviso-panel cob-aviso-cons" href="#/cobranza/consignacion">${consAtras.length} tienda${consAtras.length === 1 ? '' : 's'} con piezas en consignación sin visita hace ${diasC} días o más. Ver seguimiento ›</a>` : '';
    if (!ds.length) {
      lista.innerHTML = avisoCons + vacio('Nadie te debe nada', 'Aquí aparece todo lo que te deben: facturas, órdenes entregadas sin facturar, ventas que quedaron debiendo, saldos de clases y encargos listos para retirar. Por cliente, con lo que toca hacer para cobrarlo.', '<a class="btn btn-primario" href="#/cobranza/facturas">Cargar facturas emitidas</a>');
      return;
    }
    lista.innerHTML = `${avisoCons}<div class="deudores">${vis.map((d) => {
      const tipos = [...new Set(d.items.map((x) => x.tipo))];
      const g = d.cliente.cobranza || {};
      return `
      <article class="panel deudor ${d.diasMax > 30 ? 'deudor-grave' : d.diasMax > 0 ? 'deudor-atrasado' : ''}" data-cliente="${esc(d.id)}">
        <div class="deudor-cabeza">
          <div><h2><a href="#/cobranza/cliente/${esc(d.id)}" class="cob-nombre">${esc(nombreCliente(d.cliente))}</a></h2>
            <p class="texto-suave">${d.items.length} deuda${d.items.length === 1 ? '' : 's'} · ${tipos.map((t) => TIPOS_DEUDA[t]).join(', ')} · debe desde el ${fechaCorta(d.desde)}${d.diasMax > 0 ? ` · <span class="texto-alerta">${textoAtraso(d.diasMax)}</span>` : ''}</p></div>
          <span class="deudor-total">${pesos(d.total)}</span>
        </div>
        <p class="cob-paso"><span class="etiqueta ${CLASE_PASO[d.paso.accion]}">${ETQ_PASO[d.paso.accion]}</span> ${esc(d.paso.texto)}${g.ultimaGestion ? ` <span class="texto-tenue">Última gestión ${esc(hace(g.ultimaGestion.fecha))}.</span>` : ''}</p>
        <div class="deudor-acciones">
          <a class="btn btn-suave btn-chico" href="#/cobranza/cliente/${esc(d.id)}">Ver ficha</a>
          ${['amable', 'firme', 'ultimo'].includes(d.paso.accion) ? `<button class="btn btn-primario btn-chico" data-escribir>Escribir (${esc(TONOS[d.paso.accion].nombre.toLowerCase())})</button>` : '<button class="btn btn-suave btn-chico" data-escribir>Escribir</button>'}
          ${d.items.some((x) => x.cobrable) ? '<button class="btn btn-suave btn-chico" data-pagar>Registrar pago</button>' : ''}
        </div>
      </article>`;
    }).join('')}</div>`;
    $$('.deudor', lista).forEach((card) => {
      const d = vis.find((x) => x.id === card.dataset.cliente);
      $('[data-escribir]', card).addEventListener('click', () => mensajeDialogo(d));
      $('[data-pagar]', card)?.addEventListener('click', () => pagoDialogo(d.id));
    });
  }
  const s = escucharDeudas((x) => { fuentes = x; pintar(); });
  const des = alCambiar(pintar);
  pintar();
  return () => { s.detener(); des(); };
}

// ================================================================ Mensaje (con tono y estado de cuenta)
export async function mensajeDialogo(d, { elegidos = null } = {}) {
  const cfg = configCobranza();
  const cliente = estado.clientes[d.id] || d.cliente;
  const tel = telefonoWhatsApp(cliente.whatsapp);
  const sugerido = ['amable', 'firme', 'ultimo'].includes(d.paso.accion) ? d.paso.accion : (d.cliente.cobranza?.ultimoMensaje?.tono === 'amable' ? 'firme' : 'amable');
  const items = d.items.filter((x) => !elegidos || elegidos.includes(x.id));
  await formulario({
    titulo: `Escribir a ${nombreCliente(cliente)}`, ancho: true, textoGuardar: tel ? 'Abrir WhatsApp' : 'Abrir WhatsApp sin número',
    cuerpo: `
      <p class="cob-paso"><span class="etiqueta ${CLASE_PASO[d.paso.accion]}">${ETQ_PASO[d.paso.accion]}</span> ${esc(d.paso.texto)}</p>
      <div class="segmentado" role="radiogroup" aria-label="Tono">
        ${Object.entries(TONOS).map(([k, t]) => `<label><input type="radio" name="tono" value="${k}" ${k === sugerido ? 'checked' : ''}><span>${t.paso}. ${esc(t.nombre)}</span></label>`).join('')}
      </div>
      <h3>Qué incluir</h3>
      <ul class="lista-bajos cob-elegir">${items.map((x) => `<li><label class="interruptor"><input type="checkbox" name="deuda" value="${esc(x.id)}" checked><span>${esc(x.etiqueta)} <span class="texto-tenue">${fechaCorta(x.fecha)}${diasAtrasoDeuda(x) ? ` · ${diasAtrasoDeuda(x)} días` : ''}</span></span></label><span>${pesos(x.saldo)}</span></li>`).join('')}</ul>
      <label class="campo"><span class="campo-etiqueta">Mensaje ${info('Sale de la plantilla del tono elegido; puedes cambiarlo antes de enviarlo. Las plantillas se editan en Configuración → Cobranza.')}</span><textarea name="texto" rows="9"></textarea></label>
      <label class="interruptor"><input type="checkbox" name="conPdf"><span>Adjuntar el estado de cuenta de lo marcado, en PDF</span></label>
      ${tel ? `<p class="texto-suave">Se abre el chat con ${esc(cliente.whatsapp)}. Queda anotado en su ficha de cobranza.</p>` : `<p class="aviso aviso-suave">Este cliente no tiene WhatsApp: se abrirá WhatsApp para que elijas el chat. <button type="button" class="btn-enlace" data-editar>Agregar su número</button></p>`}`,
    montar(dlg, form) {
      const v = () => {
        const marcados = $$('input[name=deuda]:checked', dlg).map((i) => i.value);
        form.texto.value = armarMensaje(cfg.plantillas[form.tono.value], { cliente, items: items.filter((x) => marcados.includes(x.id)) });
      };
      $$('input[name=tono], input[name=deuda]', dlg).forEach((i) => i.addEventListener('change', v));
      $('[data-editar]', dlg)?.addEventListener('click', () => editarCliente(estado.clientes[d.id]));
      v();
    },
    async guardar(form, dlg) {
      const marcados = $$('input[name=deuda]:checked', dlg).map((i) => i.value);
      const sel = items.filter((x) => marcados.includes(x.id));
      if (!sel.length) return 'Marca al menos una deuda.';
      const texto = form.texto.value.trim();
      if (!texto) return 'El mensaje está vacío.';
      if (form.conPdf.checked) {
        try {
          const blob = await pdfEstadoCuentaItems(cliente, sel.map((x) => ({ ...x, dias: diasAtrasoDeuda(x) })));
          await compartirPDF(blob, `Estado de cuenta ${nombreCliente(cliente)}.pdf`, texto, cliente.whatsapp);
        } catch (e) { console.error(e); return 'No se pudo generar el PDF. Revisa la conexión la primera vez que lo usas.'; }
      } else window.open(enlaceWhatsApp(cliente.whatsapp, texto), '_blank', 'noopener');
      const lote = nuevoLote();
      registrarGestion(lote, cliente, { tipo: 'mensaje', tono: form.tono.value, texto, items: sel });
      enviar(lote.commit(), { alGuardar: avisoGuardado(toast, `Mensaje ${TONOS[form.tono.value].nombre.toLowerCase()} anotado`), alFallar: fallo });
      return null;
    }
  });
}

// Respuesta, promesa de pago, llamada, visita o nota.
export async function anotarDialogo(d, tipoInicial = 'respuesta') {
  const cliente = estado.clientes[d.id] || d.cliente;
  await formulario({
    titulo: `Anotar · ${nombreCliente(cliente)}`, textoGuardar: 'Anotar',
    cuerpo: `
      <div class="segmentado segmentado-chico" role="radiogroup">
        ${['respuesta', 'promesa', 'llamada', 'visita', 'nota'].map((k) => `<label><input type="radio" name="tipo" value="${k}" ${k === tipoInicial ? 'checked' : ''}><span>${TIPOS_GESTION[k]}</span></label>`).join('')}
      </div>
      <div class="campos" data-promesa>
        <label class="campo"><span class="campo-etiqueta">Pagará el <span class="req">*</span></span><input type="date" name="fechaPromesa" min="${hoyISO()}"></label>
        ${campoNumero('montoPromesa', 'Monto', numero(d.total, 0), { sufijo: '$' })}
      </div>
      <label class="campo"><span class="campo-etiqueta">Qué dijo o qué pasó</span><textarea name="texto" rows="3" maxlength="1000" placeholder="Ej.: dice que paga el viernes con transferencia"></textarea></label>
      <p class="texto-suave">${info('Una respuesta o una llamada reinicia el plazo para el siguiente tono. Una promesa detiene los recordatorios hasta su fecha; si pasa sin pago, toca el tono firme.')} Queda en el historial de cobranza del cliente.</p>`,
    montar(dlg, form) {
      const v = () => { $('[data-promesa]', dlg).hidden = form.tipo.value !== 'promesa'; };
      $$('input[name=tipo]', dlg).forEach((r) => r.addEventListener('change', v)); v();
    },
    guardar(form) {
      const tipo = form.tipo.value;
      let promesa = null;
      if (tipo === 'promesa') {
        if (!form.fechaPromesa.value) return 'Escribe la fecha en que prometió pagar.';
        promesa = { fecha: form.fechaPromesa.value, monto: leerNumero(form.montoPromesa.value) || null };
      }
      const lote = nuevoLote();
      registrarGestion(lote, cliente, { tipo, texto: form.texto.value.trim(), items: d.items, promesa });
      enviar(lote.commit(), { alGuardar: avisoGuardado(toast, tipo === 'promesa' ? `Promesa de pago para el ${fechaCorta(promesa.fecha)}: aparece en la Agenda` : 'Anotado'), alFallar: fallo });
      return null;
    }
  });
}

// ================================================================ Ficha de cobranza de un cliente
export function fichaCliente(el, id, { pagoDialogo, abrirFactura }) {
  let fuentes = { facturas: [], ventas: [] };
  let gestiones = [];
  let pagos = [];
  const elegidos = new Set();
  async function cargarHistorial() {
    [gestiones, pagos] = await Promise.all([
      documentosDonde('gestiones', 'clienteId', '==', id).catch(() => []),
      documentosDonde('pagos', 'clienteId', '==', id).catch(() => [])
    ]);
    pintar();
  }
  function pintar() {
    const cliente = estado.clientes[id];
    if (!cliente) { el.innerHTML = vacio('Buscando el cliente…', '', '<a class="btn btn-suave" href="#/cobranza">Volver a Cobranza</a>'); return; }
    const d = deudores(todasLasDeudas(fuentes).filter((x) => x.clienteId === id))[0] || { id, cliente, items: [], total: 0, vencido: 0, diasMax: 0, paso: siguientePaso({ cliente, items: [] }) };
    const cons = consignacionesAbiertas().filter((c) => c.clienteId === id);
    const hist = [
      ...gestiones.filter((g) => !g.anulado).map((g) => ({ fecha: g.fecha, ms: g.creadoMs, tipo: g.tipo, txt: `${TIPOS_GESTION[g.tipo] || g.tipo}${g.tono ? ` · ${TONOS[g.tono]?.nombre.toLowerCase()}` : ''}${g.promesa ? ` para el ${fechaCorta(g.promesa.fecha)}${g.promesa.monto ? ` (${pesos(g.promesa.monto)})` : ''}` : ''}`, detalle: g.texto, monto: g.tipo === 'mensaje' ? g.total : null })),
      ...pagos.filter((p) => !p.anulado).map((p) => ({ fecha: p.fecha, ms: p.creadoMs, tipo: 'pago', txt: `${p.tipo === 'nota-credito' ? 'Nota de crédito' : 'Pago'} · ${esc(p.medio === 'nota-credito' ? '' : nombreItem('mediosPago', p.medio))}`, detalle: p.referencia, monto: p.monto }))
    ].sort((a, b) => b.fecha.localeCompare(a.fecha) || (b.ms || 0) - (a.ms || 0));
    const tel = cliente.whatsapp;
    el.innerHTML = `
      <a href="#/cobranza" class="enlace-chico cl-volver">← Cobranza</a>
      <header class="pagina-cabecera cl-cabecera">
        <div><h1>${esc(nombreCliente(cliente))}</h1>
          <p class="pagina-bajada">${cliente.tipo === 'empresa' ? `${esc(cliente.rut || '')}${cliente.contacto ? ` · ${esc(cliente.contacto)}` : ''}` : 'Cliente final'}${tel ? ` · WhatsApp ${esc(tel)}` : ' · <span class="texto-alerta">sin WhatsApp</span>'}</p></div>
        <div class="grupo-botones"><button class="btn btn-suave btn-chico" data-editar>Editar datos</button></div>
      </header>
      <div class="resumen">
        <div class="dato"><span class="dato-etq">Debe</span><span class="dato-valor">${pesos(d.total)}</span></div>
        <div class="dato ${d.vencido ? 'dato-alerta' : ''}"><span class="dato-etq">Vencido</span><span class="dato-valor">${pesos(d.vencido)}</span></div>
        <div class="dato"><span class="dato-etq">Desde</span><span class="dato-valor dato-texto">${d.desde ? fechaCorta(d.desde) : '—'}</span></div>
        <div class="dato"><span class="dato-etq">Atraso mayor</span><span class="dato-valor">${d.diasMax ? `${d.diasMax} días` : '—'}</span></div>
      </div>
      <section class="panel cob-proximo ${['firme', 'ultimo', 'llamar'].includes(d.paso.accion) ? 'cob-urgente' : ''}">
        <h2>Lo que toca</h2>
        <p><span class="etiqueta ${CLASE_PASO[d.paso.accion]}">${ETQ_PASO[d.paso.accion]}</span> ${esc(d.paso.texto)}</p>
        <div class="grupo-botones">
          ${d.items.length ? `<button class="btn ${['amable', 'firme', 'ultimo'].includes(d.paso.accion) ? 'btn-primario' : 'btn-suave'}" data-escribir>Escribir${['amable', 'firme', 'ultimo'].includes(d.paso.accion) ? ` (${esc(TONOS[d.paso.accion].nombre.toLowerCase())})` : ''}</button>` : ''}
          ${d.items.some((x) => x.cobrable) ? '<button class="btn btn-suave" data-pagar>Registrar pago</button>' : ''}
          <button class="btn btn-suave" data-anotar="respuesta">Respondió</button>
          <button class="btn btn-suave" data-anotar="promesa">Prometió pagar</button>
          <button class="btn btn-suave" data-anotar="llamada">Llamé / visité</button>
          ${d.items.length ? '<button class="btn btn-suave" data-pdf>Estado de cuenta</button>' : ''}
        </div>
      </section>
      <section class="panel">
        <div class="panel-cabecera"><h2>Qué debe</h2><span class="texto-tenue">${info('Marca las deudas para escribir o hacer el estado de cuenta solo de esas. Si no marcas ninguna, se usan todas.')}</span></div>
        ${d.items.length ? `<ul class="filas cob-deudas">${d.items.map((x) => `
          <li class="fila-con-accion"><label class="cob-marca"><input type="checkbox" data-elegir="${esc(x.id)}" ${elegidos.has(x.id) ? 'checked' : ''} aria-label="Elegir ${esc(x.etiqueta)}"></label>
            <button class="fila" data-abrir="${esc(x.id)}">
              <span class="fila-principal"><span class="fila-nombre">${esc(x.etiqueta)}</span>
                <span class="fila-meta"><span class="etiqueta etiqueta-suave">${TIPOS_DEUDA[x.tipo]}</span><span>${fechaCorta(x.fecha)}</span><span class="${diasAtrasoDeuda(x) ? 'texto-alerta' : ''}">${diasAtrasoDeuda(x) ? textoAtraso(diasAtrasoDeuda(x)) : `vence el ${fechaCorta(x.vencimiento)}`}</span>${x.cobrable ? '' : '<span class="texto-tenue">Primero hay que facturarla</span>'}</span></span>
              <span class="fila-dato fila-dato-fuerte"><span class="fila-etq">Saldo</span>${pesos(x.saldo)}</span>
            </button></li>`).join('')}</ul>` : '<p class="texto-suave">No debe nada.</p>'}
      </section>
      ${cons.length ? `<section class="panel"><div class="panel-cabecera"><h2>En consignación</h2></div>
        <ul class="lista-bajos">${cons.map((c) => `<li><span>${piezasEnTienda(c)} piezas · ${pesos(valorEnTienda(c))} neto · última visita ${esc(hace(ultimaVisita(c)))}</span><button class="btn-enlace" data-cons="${esc(c.id)}">Ver</button></li>`).join('')}</ul></section>` : ''}
      <section class="panel">
        <h2>Historial de cobranza</h2>
        ${hist.length ? `<ul class="cob-historial">${hist.map((h) => `<li class="cob-h-${esc(h.tipo)}"><span class="cob-h-fecha">${fechaCorta(h.fecha)}</span><span class="cob-h-texto"><strong>${h.txt}</strong>${h.detalle ? `<span class="texto-suave">${esc(h.detalle.length > 160 ? `${h.detalle.slice(0, 160)}…` : h.detalle)}</span>` : ''}</span><span class="cob-h-monto">${h.monto ? pesos(h.monto) : ''}</span></li>`).join('')}</ul>` : '<p class="texto-suave">Todavía no hay gestiones. Cada mensaje, respuesta, promesa o pago queda anotado aquí.</p>'}
      </section>`;
    const sel = () => (elegidos.size ? d.items.filter((x) => elegidos.has(x.id)).map((x) => x.id) : null);
    $('[data-editar]', el).addEventListener('click', () => editarCliente(cliente));
    $('[data-escribir]', el)?.addEventListener('click', () => mensajeDialogo(d, { elegidos: sel() }).then(() => setTimeout(cargarHistorial, 300)));
    $('[data-pagar]', el)?.addEventListener('click', () => pagoDialogo(id).then(() => setTimeout(cargarHistorial, 300)));
    $$('[data-anotar]', el).forEach((b) => b.addEventListener('click', () => anotarDialogo(d, b.dataset.anotar).then(() => setTimeout(cargarHistorial, 300))));
    $('[data-pdf]', el)?.addEventListener('click', async () => {
      const items = d.items.filter((x) => !elegidos.size || elegidos.has(x.id));
      toast('Preparando el estado de cuenta…');
      try {
        const blob = await pdfEstadoCuentaItems(cliente, items.map((x) => ({ ...x, dias: diasAtrasoDeuda(x) })));
        await compartirPDF(blob, `Estado de cuenta ${nombreCliente(cliente)}.pdf`, `Hola, te envío el estado de cuenta de ${estado.empresa?.nombreFantasia || 'Vadim Strika'}: ${pesos(items.reduce((s, x) => s + x.saldo, 0))}.`, cliente.whatsapp);
      } catch (e) { console.error(e); toast('No se pudo generar el PDF.', 'error'); }
    });
    $$('[data-elegir]', el).forEach((c) => c.addEventListener('change', () => { if (c.checked) elegidos.add(c.dataset.elegir); else elegidos.delete(c.dataset.elegir); }));
    $$('[data-abrir]', el).forEach((b) => b.addEventListener('click', () => {
      const x = d.items.find((y) => y.id === b.dataset.abrir);
      if (x.tipo === 'factura') abrirFactura(x.ref);
      else if (x.tipo === 'orden') location.hash = '#/empresas/por-facturar';
      else if (x.tipo === 'clase') location.hash = `#/clases/${x.cursoId}`;
      else if (x.tipo === 'encargo') location.hash = '#/ventas/encargos';
      else pagoDialogo(id);
    }));
    $$('[data-cons]', el).forEach((b) => b.addEventListener('click', () => detalleConsignacion(estado.consignaciones[b.dataset.cons])));
  }
  const s = escucharDeudas((x) => { fuentes = x; pintar(); });
  const des = alCambiar(pintar);
  pintar(); cargarHistorial();
  return () => { s.detener(); des(); };
}

// ================================================================ Seguimiento de consignación
export function vistaSeguimientoConsignacion(el) {
  el.innerHTML = '<div class="resumen" data-resumen></div><div data-lista></div>';
  const lista = $('[data-lista]', el);
  function pintar() {
    const dias = configCobranza().diasConsignacion;
    const cons = consignacionesAbiertas().map((c) => ({ c, ultima: ultimaVisita(c), dias: diasDesde(ultimaVisita(c)) })).sort((a, b) => b.dias - a.dias);
    const atras = cons.filter((x) => x.dias >= dias);
    $('[data-resumen]', el).innerHTML = `
      <div class="dato"><span class="dato-etq">Tiendas con piezas</span><span class="dato-valor">${cons.length}</span></div>
      <div class="dato ${atras.length ? 'dato-alerta' : ''}"><span class="dato-etq">Sin visita hace ${dias} días o más ${info('Cuenta desde la última entrega, liquidación o visita anotada. El plazo se cambia en Configuración → Cobranza.')}</span><span class="dato-valor">${atras.length}</span></div>
      <div class="dato"><span class="dato-etq">Valor en tiendas, neto</span><span class="dato-valor">${pesos(cons.reduce((s, x) => s + valorEnTienda(x.c), 0))}</span></div>`;
    if (!cons.length) { lista.innerHTML = vacio('Nada en consignación', 'Cuando dejes piezas en tiendas (Empresas → Consignación), aquí verás cuánto tiempo llevan sin liquidar o sin visita, y podrás pedir la liquidación por WhatsApp.'); return; }
    lista.innerHTML = `<div class="deudores">${cons.map(({ c, ultima, dias: d }) => `
      <article class="panel deudor ${d >= dias ? 'deudor-grave' : d >= dias * 0.7 ? 'deudor-atrasado' : ''}" data-id="${esc(c.id)}">
        <div class="deudor-cabeza">
          <div><h2>${esc(c.clienteNombre)}</h2>
            <p class="texto-suave">${piezasEnTienda(c)} piezas desde el ${fechaCorta(c.fecha)} · última visita ${esc(hace(ultima))}${(c.liquidaciones || []).length ? ` · ${c.liquidaciones.length} liquidaci${c.liquidaciones.length === 1 ? 'ón' : 'ones'}` : ' · nunca liquidada'}</p></div>
          <span class="deudor-total">${pesos(valorEnTienda(c))}</span>
        </div>
        ${d >= dias ? `<p class="cob-paso"><span class="etiqueta etiqueta-alerta">Toca: pedir liquidación</span> Pasaron ${d} días sin noticias de esta tienda.</p>` : ''}
        <div class="deudor-acciones">
          <button class="btn btn-${d >= dias ? 'primario' : 'suave'} btn-chico" data-pedir>Pedir liquidación</button>
          <button class="btn btn-suave btn-chico" data-visita>Anotar visita</button>
          <button class="btn btn-suave btn-chico" data-liquidar>Liquidar</button>
          <button class="btn btn-suave btn-chico" data-ver>Detalle</button>
        </div>
      </article>`).join('')}</div>`;
    $$('.deudor', lista).forEach((card) => {
      const c = estado.consignaciones[card.dataset.id];
      $('[data-pedir]', card).addEventListener('click', () => pedirLiquidacion(c));
      $('[data-visita]', card).addEventListener('click', () => visitaDialogo(c));
      $('[data-liquidar]', card).addEventListener('click', () => liquidar(c));
      $('[data-ver]', card).addEventListener('click', () => detalleConsignacion(c));
    });
  }
  pintar();
  return alCambiar(pintar);
}

async function pedirLiquidacion(c) {
  const cliente = estado.clientes[c.clienteId] || { id: c.clienteId, nombre: c.clienteNombre };
  await formulario({
    titulo: `Pedir liquidación · ${c.clienteNombre}`, ancho: true, textoGuardar: 'Abrir WhatsApp',
    cuerpo: `
      <label class="campo"><span class="campo-etiqueta">Mensaje</span><textarea name="texto" rows="7"></textarea></label>
      <label class="interruptor"><input type="checkbox" name="conPdf" checked><span>Adjuntar el detalle de las piezas en la tienda, en PDF</span></label>`,
    montar(dlg, form) {
      form.texto.value = armarMensaje(configCobranza().plantillas.consignacion, { cliente, extra: { piezas: String(piezasEnTienda(c)), desde: fechaCorta(c.fecha) } });
    },
    async guardar(form) {
      const texto = form.texto.value.trim();
      if (form.conPdf.checked) {
        try { await comprobante(c, texto); } catch (e) { console.error(e); }
      } else window.open(enlaceWhatsApp(cliente.whatsapp, texto), '_blank', 'noopener');
      if (estado.clientes[c.clienteId]) {
        const lote = nuevoLote();
        registrarGestion(lote, cliente, { tipo: 'liquidacion', texto });
        enviar(lote.commit(), { alGuardar: avisoGuardado(toast, 'Pedido de liquidación anotado'), alFallar: fallo });
      }
      return null;
    }
  });
}

async function visitaDialogo(c) {
  await formulario({
    titulo: `Visita a ${c.clienteNombre}`, textoGuardar: 'Anotar visita',
    cuerpo: `
      <p class="texto-suave">Úsalo cuando pasaste por la tienda o hablaste con ellos, aunque no se haya vendido nada. Reinicia la cuenta de días.</p>
      <label class="campo"><span class="campo-etiqueta">Fecha</span><input type="date" name="fecha" value="${hoyISO()}" max="${hoyISO()}"></label>
      <label class="campo"><span class="campo-etiqueta">Qué pasó</span><input name="nota" maxlength="200" placeholder="Ej.: no vendieron nada, cambié las piezas de lugar"></label>`,
    guardar(form) {
      const lote = nuevoLote();
      anotarVisita(lote, c, { fecha: form.fecha.value || hoyISO(), nota: form.nota.value.trim() });
      const cl = estado.clientes[c.clienteId];
      if (cl) registrarGestion(lote, cl, { tipo: 'visita', fecha: form.fecha.value || hoyISO(), texto: form.nota.value.trim() });
      enviar(lote.commit(), { alGuardar: avisoGuardado(toast, 'Visita anotada'), alFallar: fallo });
      return null;
    }
  });
}
