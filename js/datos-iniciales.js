// Valores con los que parte el sistema la primera vez que se abre.
// Después todo se edita desde Configuración; este archivo no se vuelve a usar.

// Cada lista se guarda como un documento en la colección `listas`.
// Los registros guardan el `id` del ítem, nunca el nombre: así, al renombrar
// un ítem, todos los registros muestran el nombre nuevo sin tocarlos.
// `fijo: true` = el sistema depende de ese ítem; no se puede ocultar.

const lista = (nombre, descripcion, nombres, fijos = []) => ({
  nombre,
  descripcion,
  items: nombres.map((n, i) => ({
    id: slug(n),
    nombre: n,
    activo: true,
    orden: i,
    ...(fijos.includes(n) ? { fijo: true } : {})
  }))
});

export function slug(texto) {
  return texto
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 40) || 'item';
}

// El orden de este objeto es el orden en que aparecen en Configuración.
// Tipos de evento de la agenda, con su color. Los ids se fijan a mano porque
// los eventos ya guardados los usan.
export const COLORES_AGENDA = {
  cobalto: 'Cobalto', celadon: 'Celadón', ocre: 'Ocre', arcilla: 'Arcilla', rosa: 'Rosa', carbon: 'Carbón', gris: 'Gris'
};
export const TIPOS_EVENTO_INICIALES = {
  nombre: 'Tipos de evento de la agenda',
  descripcion: 'Para los eventos que agregas en la Agenda. Cada tipo tiene su color en el calendario.',
  items: [
    ['entrega', 'Entrega', 'cobalto'], ['clase', 'Clase o taller', 'celadon'], ['quema', 'Quema', 'arcilla'],
    ['compra', 'Compra o retiro', 'gris'], ['reunion', 'Reunión', 'gris'], ['otro', 'Otro', 'gris']
  ].map(([id, nombre, color], orden) => ({ id, nombre, color, activo: true, orden, ...(id === 'otro' ? { fijo: true } : {}) }))
};

export const LISTAS_INICIALES = {
  tiposInsumo: lista(
    'Tipos de insumo',
    'Para agrupar los materiales en bodega e inventario.',
    ['Arcilla y pasta', 'Materia prima de esmalte', 'Esmalte', 'Engobe', 'Óxido y pigmento', 'Embalaje', 'Herramienta y consumible']
  ),
  unidades: lista(
    'Unidades',
    'Cómo se mide cada insumo. Las recetas y el stock usan estas unidades.',
    ['kg', 'g', 'L', 'ml', 'unidad']
  ),
  categoriasPieza: lista(
    'Categorías de pieza',
    'Para ordenar el catálogo, la venta rápida y los informes.',
    ['Tazas', 'Platos', 'Bowls', 'Fuentes', 'Jarros y botellas', 'Floreros', 'Lámparas', 'Decoración']
  ),
  canalesVenta: lista(
    'Canales de venta',
    'Dónde se hizo cada venta. Feria y Clases son fijos porque se enlazan con sus módulos.',
    ['Feria', 'Taller abierto', 'Instagram', 'WhatsApp', 'Tienda online', 'Clases'],
    ['Feria', 'Clases']
  ),
  mediosPago: lista(
    'Medios de pago',
    'Para ventas, cobros y gastos.',
    ['Efectivo', 'Débito', 'Crédito', 'Transferencia']
  ),
  areasNegocio: lista(
    'Áreas del negocio',
    'Cada gasto y cada venta se asigna a un área. Con esto sale el resultado por área.',
    ['Producción propia', 'Clases y talleres', 'Encargos', 'Reventa de materiales', 'Ferias', 'Consignación']
  ),
  itemsGasto: lista(
    'Ítems de gasto',
    'Qué tipo de gasto es. Energía del horno es fijo porque se usa para costear las quemas.',
    ['Materia prima e insumos', 'Energía del horno', 'Arriendo', 'Servicios básicos', 'Embalaje', 'Transporte', 'Puestos de feria', 'Herramientas y equipos', 'Publicidad', 'Otros'],
    ['Materia prima e insumos', 'Energía del horno']
  ),
  tiposEvento: TIPOS_EVENTO_INICIALES,
  motivosMerma: lista(
    'Motivos de merma',
    'Por qué se perdió una pieza en alguna etapa de producción.',
    ['Grieta en secado', 'Rotura en bizcocho', 'Defecto de esmalte', 'Se pegó a la placa', 'Rotura al manipular']
  ),
  motivosAjuste: lista(
    'Motivos de ajuste de inventario',
    'Ingresos o salidas de bodega sin documento de compra. Inventario inicial y Conteo físico son fijos.',
    ['Inventario inicial', 'Conteo físico', 'Regalo o donación', 'Sobrante de taller', 'Pérdida', 'Vencido o en mal estado'],
    ['Inventario inicial', 'Conteo físico']
  )
};

export const EMPRESA_INICIAL = {
  nombreFantasia: 'Vadim Strika',
  razonSocial: '',
  rut: '',
  giro: '',
  direccion: '',
  comuna: '',
  ciudad: '',
  correo: '',
  telefono: '',
  whatsapp: '',
  instagram: 'vadim_strika',
  datosTransferencia: ''
};

export const COSTEO_INICIAL = {
  metodo: 'ultima', // 'ultima' = última compra · 'promedio' = promedio ponderado
  iva: 19
};
