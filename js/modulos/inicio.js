// Inicio: saludo, estado de la conexión y primeros pasos para dejar lista la base.
import { estado, alCambiar } from '../datos.js';
import { esc, fechaLarga } from '../ui.js';

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
    }
  ];
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

        <section class="panel">
          <h2>Cómo sigue el sistema</h2>
          <ol class="fases">
            <li class="fase-actual"><strong>Base</strong><span>Acceso, configuración y listas. Es esta versión.</span></li>
            <li><strong>Producción, inventario y gastos</strong><span>Insumos, recetas de esmaltes y piezas, compras por XML o a mano que suman stock, quemas, lotes por etapa con mermas.</span></li>
            <li><strong>Ventas y cobranza</strong><span>Venta rápida y ferias, clientes, consignaciones, órdenes de venta, facturación en el SII y cobros.</span></li>
            <li><strong>Agenda y clases</strong><span>Calendario de quemas, ferias, clases, entregas y compromisos de pago.</span></li>
          </ol>
        </section>`;
    };
    pintar();
    return alCambiar(pintar);
  }
};
