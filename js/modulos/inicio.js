// Inicio: saludo, estado de la conexión y primeros pasos para dejar lista la base.
import { estado, alCambiar } from '../datos.js';
import { esc, fechaLarga, numero, pesos, hoyISO } from '../ui.js';
import { insumosActivos, bajoMinimo, escucharDonde } from '../stock.js';
import { nombreUnidad } from '../comunes.js';
import { ETAPAS } from '../piezas-core.js';

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
const resumenGastos = { porClasificar: [], porPagar: [], alertas: [], lotes: [] };
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

        ${taller()}

        ${gastos()}

        ${bodega()}

        <section class="panel">
          <h2>Cómo sigue el sistema</h2>
          <ol class="fases">
            <li class="fase-hecha"><strong>Base</strong><span>Acceso, configuración y listas.</span></li>
            <li class="fase-hecha"><strong>Producción, inventario y gastos</strong><span>Insumos, recetas y bodega; gastos con XML o a mano que suman stock; piezas, lotes por etapa con mermas y quemas.</span></li>
            <li class="fase-actual"><strong>Ventas y cobranza</strong><span>Venta rápida y ferias, clientes, consignaciones, órdenes de venta, facturación en el SII y cobros.</span></li>
            <li><strong>Agenda y clases</strong><span>Calendario de quemas, ferias, clases, entregas y compromisos de pago.</span></li>
          </ol>
        </section>`;
    };
    pintar();
    const des = [
      alCambiar(pintar),
      escucharDonde('gastos', 'estado', '==', 'por-clasificar', (l) => { resumenGastos.porClasificar = l; pintar(); }),
      escucharDonde('gastos', 'pagoEstado', '==', 'por-pagar', (l) => { resumenGastos.porPagar = l; pintar(); }),
      escucharDonde('alertasPrecio', 'visto', '==', false, (l) => { resumenGastos.alertas = l; pintar(); }),
      escucharDonde('lotes', 'estado', '==', 'en-proceso', (l) => { resumenGastos.lotes = l; pintar(); })
    ];
    return () => des.forEach((u) => u());
  }
};
