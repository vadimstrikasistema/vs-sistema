// Empresas: ventas a tiendas, cafeterías y profesionales. Órdenes de venta,
// consignación, facturación con el SII, sus clientes y el análisis por tienda.
import { $ } from '../ui.js';
import { pestanas } from '../comunes.js';
import { vistaOrdenes, vistaConsignacion, vistaPorFacturar, vistaAnalisisEmpresas } from './ventas-b2b.js';
import { vistaClientes } from './ventas.js';

const PEST = [['ordenes', 'Órdenes'], ['consignacion', 'Consignación'], ['por-facturar', 'Por facturar'], ['clientes', 'Clientes'], ['analisis', 'Análisis']];
const BAJADA = {
  ordenes: 'Pedidos de tiendas y cafeterías, con PDF para mandar por WhatsApp.',
  consignacion: 'Piezas que dejaste en tiendas para que las vendan, y sus liquidaciones.',
  'por-facturar': 'Órdenes entregadas sin factura, listas para el facturador del SII.',
  clientes: 'Tiendas, cafeterías y profesionales: RUT, giro, dirección, contacto y plazo de pago.',
  analisis: 'Cuánto te compra cada tienda, cuánto vende en consignación, su margen y lo que te debe.'
};

export default {
  render(el, { sub }) {
    const actual = PEST.some(([k]) => k === sub) ? sub : 'ordenes';
    el.innerHTML = `
      <header class="pagina-cabecera">
        <h1>Empresas</h1>
        <p class="pagina-bajada">${BAJADA[actual]}</p>
      </header>
      ${pestanas('empresas', PEST, actual)}
      <div id="emp-cuerpo"></div>`;
    const c = $('#emp-cuerpo', el);
    return ({ ordenes: vistaOrdenes, consignacion: vistaConsignacion, 'por-facturar': vistaPorFacturar, analisis: vistaAnalisisEmpresas, clientes: (x) => vistaClientes(x, { tipo: 'empresa' }) })[actual](c);
  }
};
