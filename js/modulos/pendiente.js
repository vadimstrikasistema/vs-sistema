// Pantalla para los módulos que llegan en fases siguientes.
import { esc } from '../ui.js';

export function crearPendiente({ titulo, fase, resumen, puntos }) {
  return {
    render(el) {
      el.innerHTML = `
        <header class="pagina-cabecera">
          <h1>${esc(titulo)}</h1>
          <p class="pagina-bajada">${esc(resumen)}</p>
        </header>
        <section class="panel pendiente">
          <p class="pendiente-fase">Llega en ${String(fase).length > 1 ? 'la entrega' : 'la fase'} ${fase}</p>
          <ul class="lista-puntos">
            ${puntos.map((p) => `<li>${esc(p)}</li>`).join('')}
          </ul>
        </section>`;
    }
  };
}
