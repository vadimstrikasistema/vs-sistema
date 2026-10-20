// Íconos de línea, dibujados a mano para la app. Usan currentColor.
const svg = (d) => `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;

export const ICONOS = {
  inicio: svg('<path d="M4 11.5 12 5l8 6.5"/><path d="M6.5 10v9h11v-9"/><path d="M10 19v-5h4v5"/>'),
  agenda: svg('<rect x="4" y="5.5" width="16" height="14" rx="2"/><path d="M4 10h16M8.5 3.5v4M15.5 3.5v4"/><circle cx="12" cy="14.5" r="1.2"/>'),
  clases: svg('<path d="M3.5 9 12 5l8.5 4L12 13z"/><path d="M7 11v4.5c1.5 1.3 3.2 2 5 2s3.5-.7 5-2V11"/><path d="M20.5 9v5"/>'),
  empresas: svg('<path d="M4 9.5 5.5 5h13L20 9.5"/><path d="M4 9.5a2.7 2.7 0 0 0 5.3 0 2.7 2.7 0 0 0 5.4 0 2.7 2.7 0 0 0 5.3 0"/><path d="M5.5 11.5V19h13v-7.5"/><path d="M10 19v-4h4v4"/>'),
  ventas: svg('<path d="M5 8h14l-1.3 10.2a2 2 0 0 1-2 1.8H8.3a2 2 0 0 1-2-1.8z"/><path d="M9 8V6.5a3 3 0 0 1 6 0V8"/>'),
  cobranza: svg('<rect x="3.5" y="6.5" width="17" height="11" rx="2"/><circle cx="12" cy="12" r="2.4"/><path d="M7 9.5v5M17 9.5v5"/>'),
  produccion: svg('<path d="M8 4.5h8"/><path d="M9 4.5c0 3-3 4.5-3 9a6 6 0 0 0 12 0c0-4.5-3-6-3-9"/><path d="M7 13.5c2 1 8 1 10 0"/>'),
  inventario: svg('<path d="M4 8.5 12 4l8 4.5v7L12 20l-8-4.5z"/><path d="M4 8.5 12 13l8-4.5M12 13v7"/>'),
  gastos: svg('<path d="M7 3.5h10v17l-2.5-1.6L12 20.5l-2.5-1.6L7 20.5z"/><path d="M9.5 8h5M9.5 11.5h5M9.5 15h3"/>'),
  configuracion: svg('<circle cx="12" cy="12" r="2.8"/><path d="M12 3.5v2.2M12 18.3v2.2M20.5 12h-2.2M5.7 12H3.5M18 6l-1.6 1.6M7.6 16.4 6 18M18 18l-1.6-1.6M7.6 7.6 6 6"/>'),
  mas: svg('<circle cx="6" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="18" cy="12" r="1.3"/>'),
  salir: svg('<path d="M14 5.5H6.5v13H14"/><path d="M11 12h9M17 8.5l3.5 3.5-3.5 3.5"/>'),
  arriba: svg('<path d="M12 18V6M7 11l5-5 5 5"/>'),
  abajo: svg('<path d="M12 6v12M7 13l5 5 5-5"/>'),
  lapiz: svg('<path d="M5 19l1-4 9.5-9.5a2.1 2.1 0 0 1 3 3L9 18z"/><path d="M14 7l3 3"/>'),
  ojo: svg('<path d="M2.5 12S6 6 12 6s9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6z"/><circle cx="12" cy="12" r="2.5"/>'),
  ojoTachado: svg('<path d="M4 4l16 16"/><path d="M9.5 6.4A9.7 9.7 0 0 1 12 6c6 0 9.5 6 9.5 6a16 16 0 0 1-2.6 3.3M6.3 7.9A16 16 0 0 0 2.5 12s3.5 6 9.5 6a9 9 0 0 0 3.4-.6"/>'),
  candado: svg('<rect x="5.5" y="10.5" width="13" height="9" rx="2"/><path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5"/>'),
  mas2: svg('<path d="M12 5v14M5 12h14"/>'),
  nube: svg('<path d="M7 18h10a4 4 0 0 0 .6-8A5.5 5.5 0 0 0 7 11a3.5 3.5 0 0 0 0 7z"/>'),
  nubeTachada: svg('<path d="M4 4l16 16"/><path d="M17.6 10A5.5 5.5 0 0 0 9 7.2M7 11a3.5 3.5 0 0 0 0 7h10"/>')
};
