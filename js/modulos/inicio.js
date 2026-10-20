// Inicio: saludo, estado de la conexión y primeros pasos para dejar lista la base.
import { estado, alCambiar } from '../datos.js';
import { esc, fechaLarga, numero, pesos, hoyISO } from '../ui.js';
import { insumosActivos, bajoMinimo, escucharDonde } from '../stock.js';
import { nombreUnidad } from '../comunes.js';
import { ETAPAS } from '../piezas-core.js';
import { itemsAgenda, sumar } from '../agenda-core.js';
import { todasLasDeudas, deudores, configCobranza } from '../cobranza-gestion-core.js';
import { consignacionesAbiertas, ultimaVisita } from '../b2b-core.js';

function saludo() {
  const h = new Date().getHours();
  if (h < 6) return 'Buenas noches';
  if (h < 13) return 'Buenos días';
  if (h < 20) return 'Buenas tardes';
  return 'Buenas noches';
}

function pasos() {
  const e = estado.empresa || {};
  return [
    {
      hecho: Boolean(e.razonSocial && e.rut && e.giro),
      titulo: 'Completa los datos de la empresa',
      detalle: 'Razón social, RUT y giro. Aparecen en las órdenes de venta y en lo que se prepara para el SII.',
      ir: '#/configuracion/empresa'
    },
    {
      hecho: Boolean(e.direccion && e.comuna && (e.whatsapp || e.telefono)),
      titulo: 'Agrega dirección y contacto',
      detalle: 'Dirección, comuna y un WhatsApp o teléfono para los PDF que se envían a clientes.',
      ir: '#/configuracion/empresa'
    },
    {
      hecho: Boolean(localStorageSeguro('vs-listas-revisadas')),
      titulo: 'Revisa las listas',
      detalle: 'Tipos de insumo, categorías de pieza, canales de venta, áreas del negocio. Vienen con valores de ejemplo para ajustar a cómo trabaja el taller.',
      ir: '#/configuracion/listas'
    },
    {
      hecho: insumosActivos().length > 0,
      titulo: 'Crea los insumos del taller',
      detalle: 'Arcillas, materias primas de esmaltes, esmaltes comprados, embalaje. Con su unidad y, si lo sabes, su costo.',
      ir: '#/produccion/insumos'
    },
    {
      hecho: insumosActivos().some((i) => i.conMovimientos),
      titulo: 'Carga el inventario inicial',
      detalle: 'Lo que ya hay en el taller y cuánto vale. No crea gastos: solo deja la bodega al día.',
      ir: '#/inventario/bodega'
    }
  ];
}

// Resumen de gastos: se escucha mientras Inicio está abierto.
const resumenGastos = { porClasificar: [], porPagar: [], alertas: [], lotes: [], porCobrar: [], ventasHoy: [] };
function gastos() {
  const pend = resumenGastos.porClasificar.filter((g) => !g.anulado);
  const pp = resumenGastos.porPagar.filter((g) => !g.anulado);
  const hoy = hoyISO();
  const vencidas = pp.filter((g) => g.pago?.vencimiento && g.pago.vencimiento < hoy);
  const alertas = resumenGastos.alertas;
  if (!pend.length && !pp.length && !alertas.length) return '';
  const item = (n, texto, href, alerta = false) => `<li><a href="${href}">${texto}</a><span class="${alerta ? 'texto-alerta' : ''}">${n}</span></li>`;
  return `
        <section class="panel">
          <div class="panel-cabecera"><h2>Gastos</h2><a href="#/gastos/documentos" class="enlace-chico">Ver gastos</a></div>
          <ul class="lista-bajos">
            ${pend.length ? item(pend.length, 'Documentos por clasificar', '#/gastos/documentos', true) : ''}
            ${pp.length ? item(pesos(pp.reduce((s, g) => s + (g.total || 0), 0)), `Por pagar (${pp.length})`, '#/gastos/por-pagar') : ''}
            ${vencidas.length ? item(pesos(vencidas.reduce((s, g) => s + (g.total || 0), 0)), `Vencido (${vencidas.length})`, '#/gastos/por-pagar', true) : ''}
            ${alertas.length ? item(alertas.length, 'Alertas de precio sin revisar', '#/gastos/alertas', true) : ''}
          </ul>
        </section>`;
}

// Lo que viene en la semana, desde la Agenda.
function semana() {
  const hoy = hoyISO();
  const its = itemsAgenda(hoy, sumar(hoy, 6), { facturas: resumenGastos.porCobrar, gastos: resumenGastos.porPagar, ventasDeuda: resumenGastos.ventasDeuda || [] }).filter((it) => !(it.origen === 'evento' && it.hecho) && !(it.origen === 'feria' && it.hecho));
  if (!its.length) return '';
  const dia = (iso) => { const d = Math.round((new Date(`${iso}T12:00`) - new Date(`${hoy}T12:00`)) / 86400000); return d === 0 ? 'Hoy' : d === 1 ? 'Mañana' : new Date(`${iso}T12:00`).toLocaleDateString('es-CL', { weekday: 'short', day: 'numeric' }); };
  return `
        <section class="panel">
          <div class="panel-cabecera"><h2>Esta semana</h2><a href="#/agenda" class="enlace-chico">Ver agenda</a></div>
          <ul class="lista-bajos">${its.slice(0, 8).map((it) => `<li><a href="#/agenda">${esc(it.titulo)}</a><span class="${it.alerta ? 'texto-alerta' : ''}">${it.alerta ? 'Atrasado' : esc(dia(it.fecha))}${it.hora ? ` · ${esc(it.hora)}` : ''}</span></li>`).join('')}
            ${its.length > 8 ? `<li><a href="#/agenda">Y ${its.length - 8} más</a><span></span></li>` : ''}</ul>
        </section>`;
}

const feriaHoy = () => Object.values(estado.ferias || {}).find((f) => !f.cerrada && f.fechaInicio <= hoyISO() && hoyISO() <= (f.fechaFin || f.fechaInicio));

function ventasHoy() {
  const vs = resumenGastos.ventasHoy.filter((v) => !v.anulado);
  const total = vs.reduce((s, v) => s + (v.total || 0), 0);
  const sinBoleta = vs.filter((v) => !v.boleta?.emitida).length;
  return `
        <section class="panel">
          <div class="panel-cabecera"><h2>Ventas de hoy</h2><span class="grupo-botones">${feriaHoy() ? '<a href="#/feria" class="btn btn-suave btn-chico">Modo feria</a>' : ''}<a href="#/ventas/venta-rapida" class="btn btn-primario btn-chico">Vender</a></span></div>
          ${vs.length ? `<ul class="lista-bajos">
            <li><a href="#/ventas/historial">${vs.length} venta${vs.length > 1 ? 's' : ''}, ${vs.reduce((s, v) => s + (v.piezas || 0), 0)} piezas</a><span>${pesos(total)}</span></li>
            ${sinBoleta ? `<li><a href="#/ventas/venta-rapida">Sin boleta</a><span class="texto-alerta">${sinBoleta}</span></li>` : ''}
          </ul>` : '<p class="texto-suave">Todavía no hay ventas hoy.</p>'}
        </section>`;
}

function cobranza() {
  const ds = deudores(todasLasDeudas({ facturas: resumenGastos.porCobrar, ventas: resumenGastos.ventasDeuda || [] }));
  const ovs = Object.values(estado.ordenes || {}).filter((o) => !o.anulada && o.entregada && !o.facturada);
  const diasC = configCobranza().diasConsignacion;
  const consAtras = consignacionesAbiertas().filter((c) => Math.round((new Date(`${hoyISO()}T12:00`) - new Date(`${ultimaVisita(c)}T12:00`)) / 86400000) >= diasC);
  if (!ds.length && !ovs.length && !consAtras.length) return '';
  const total = ds.reduce((s2, d) => s2 + d.total, 0);
  const vencido = ds.reduce((s2, d) => s2 + d.vencido, 0);
  const tocan = ds.filter((d) => ['amable', 'firme', 'ultimo', 'llamar'].includes(d.paso.accion));
  return `
        <section class="panel">
          <div class="panel-cabecera"><h2>Cobranza</h2><a href="#/cobranza/por-cobrar" class="enlace-chico">Ver por cobrar</a></div>
          <ul class="lista-bajos">
            ${ds.length ? `<li><a href="#/cobranza/por-cobrar">Te deben, ${ds.length} cliente${ds.length > 1 ? 's' : ''}</a><span>${pesos(total)}</span></li>` : ''}
            ${vencido ? `<li><a href="#/cobranza/por-cobrar">Vencido</a><span class="texto-alerta">${pesos(vencido)}</span></li>` : ''}
            ${tocan.length ? `<li><a href="#/cobranza/por-cobrar">Toca escribir hoy</a><span class="texto-alerta">${tocan.map((d) => esc(d.cliente.nombre || d.cliente.razonSocial || '')).slice(0, 3).join(', ')}${tocan.length > 3 ? '…' : ''}</span></li>` : ''}
            ${ovs.length ? `<li><a href="#/empresas/por-facturar">Por facturar, ${ovs.length} orden${ovs.length > 1 ? 'es' : ''}</a><span class="texto-alerta">${pesos(ovs.reduce((s2, o) => s2 + o.total, 0))}</span></li>` : ''}
            ${consAtras.length ? `<li><a href="#/cobranza/consignacion">Consignación sin visita hace ${diasC} días o más</a><span class="texto-alerta">${consAtras.length} tienda${consAtras.length > 1 ? 's' : ''}</span></li>` : ''}
          </ul>
        </section>`;
}

function taller() {
  const ls = resumenGastos.lotes.filter((l) => !l.anulado);
  if (!ls.length) return '';
  const filas = ['modelado', 'seco', 'bizcochado', 'esmaltado'].map((k) => {
    const n = ls.filter((l) => l.etapa === k).reduce((s, l) => s + l.cantidadActual, 0);
    return n ? `<li><a href="#/produccion/lotes">${esc(ETAPAS[k].nombre)}</a><span>${n} pieza${n > 1 ? 's' : ''}</span></li>` : '';
  }).join('');
  return `
        <section class="panel">
          <div class="panel-cabecera"><h2>En el taller</h2><a href="#/produccion/lotes" class="enlace-chico">Ver lotes</a></div>
          <ul class="lista-bajos">${filas}</ul>
        </section>`;
}

function bodega() {
  const activos = insumosActivos();
  if (!activos.length) {
    return `
        <section class="panel">
          <h2>Bodega</h2>
          <p class="texto-suave">Todavía no hay insumos. Crea las arcillas, materias primas y esmaltes en <a href="#/produccion/insumos">Producción → Insumos</a> y después carga lo que ya tienes con el inventario inicial.</p>
        </section>`;
  }
  const bajos = activos.filter(bajoMinimo);
  return `
        <section class="panel">
          <div class="panel-cabecera">
            <h2>Bodega</h2>
            <a href="#/inventario/bodega" class="enlace-chico">Ver inventario</a>
          </div>
          ${bajos.length ? `
            <p class="texto-suave">Bajo el stock mínimo:</p>
            <ul class="lista-bajos">
              ${bajos.slice(0, 8).map((i) => `<li><span>${esc(i.nombre)}</span><span class="texto-alerta">${numero(i.stock || 0)} de ${numero(i.stockMinimo)} ${esc(nombreUnidad(i.unidad))}</span></li>`).join('')}
            </ul>` : '<p class="texto-suave">Ningún insumo está bajo su mínimo.</p>'}
        </section>`;
}

function localStorageSeguro(clave) {
  try { return localStorage.getItem(clave); } catch { return null; }
}

export default {
  render(el) {
    const pintar = () => {
      const p = pasos();
      const pendientes = p.filter((x) => !x.hecho).length;
      const nombre = estado.empresa?.nombreFantasia || 'Vadim Strika';
      el.innerHTML = `
        <header class="pagina-cabecera inicio-cabecera">
          <p class="inicio-fecha">${esc(fechaLarga())}</p>
          <h1>${saludo()}</h1>
          <p class="pagina-bajada">Sistema de gestión de ${esc(nombre)}.</p>
        </header>

        <section class="panel">
          <div class="panel-cabecera">
            <h2>Primeros pasos</h2>
            <span class="contador ${pendientes ? '' : 'contador-ok'}">${pendientes ? `${pendientes} pendiente${pendientes > 1 ? 's' : ''}` : 'Todo listo'}</span>
          </div>
          <ol class="pasos">
            ${p.map((x) => `
              <li class="paso ${x.hecho ? 'paso-hecho' : ''}">
                <span class="paso-marca" aria-hidden="true"></span>
                <div>
                  <a href="${x.ir}" class="paso-titulo">${esc(x.titulo)}</a>
                  <p>${esc(x.detalle)}</p>
                </div>
              </li>`).join('')}
          </ol>
        </section>

        ${semana()}

        ${ventasHoy()}

        ${cobranza()}

        ${taller()}

        ${gastos()}

        ${bodega()}

        <section class="panel">
          <h2>Cómo sigue el sistema</h2>
          <ol class="fases">
            <li class="fase-hecha"><strong>Base</strong><span>Acceso, configuración y listas.</span></li>
            <li class="fase-hecha"><strong>Producción, inventario y gastos</strong><span>Insumos, recetas y bodega; gastos con XML o a mano que suman stock; piezas, lotes por etapa con mermas y quemas.</span></li>
            <li class="fase-hecha"><strong>Ventas y cobranza</strong><span>Clientes y cobranza; venta rápida, ferias y análisis; órdenes de venta, consignación y facturación en el SII.</span></li>
            <li class="fase-hecha"><strong>Agenda y encargos</strong><span>Calendario con entregas, ferias, clases, quemas, cobros y pagos; encargos con abono; cuentas recurrentes.</span></li>
            <li class="fase-actual"><strong>Inventario de piezas</strong><span>Conteo de piezas en enero; con eso se puede encender el control de stock.</span></li>
            <li><strong>Lo que sigue</strong><span>Clases con alumnos, modo feria y contactos de feria con QR.</span></li>
          </ol>
        </section>`;
    };
    pintar();
    const des = [
      alCambiar(pintar),
      escucharDonde('gastos', 'estado', '==', 'por-clasificar', (l) => { resumenGastos.porClasificar = l; pintar(); }),
      escucharDonde('gastos', 'pagoEstado', '==', 'por-pagar', (l) => { resumenGastos.porPagar = l; pintar(); }),
      escucharDonde('alertasPrecio', 'visto', '==', false, (l) => { resumenGastos.alertas = l; pintar(); }),
      escucharDonde('lotes', 'estado', '==', 'en-proceso', (l) => { resumenGastos.lotes = l; pintar(); }),
      escucharDonde('facturas', 'abierta', '==', true, (l) => { resumenGastos.porCobrar = l; pintar(); }),
      escucharDonde('ventas', 'deudaAbierta', '==', true, (l) => { resumenGastos.ventasDeuda = l; pintar(); }),
      escucharDonde('ventas', 'fecha', '==', hoyISO(), (l) => { resumenGastos.ventasHoy = l; pintar(); })
    ];
    return () => des.forEach((u) => u());
  }
};
