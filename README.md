# Vadim Strika · Sistema del taller

Sistema de gestión del taller de cerámica Vadim Strika: producción por etapas y quemas, inventario, ventas (directas, ferias, consignación, empresas), facturación en el portal gratuito del SII, cobranza y gastos.

- **App:** https://vadimstrikasistema.github.io/vs-sistema/
- **Frontend:** HTML, CSS y JavaScript sin compilación, publicado en GitHub Pages e instalable en celular y computador.
- **Datos:** Firebase Firestore (plan gratuito Spark), con caché local para trabajar sin señal.
- **Acceso:** Firebase Authentication con correo y contraseña, más una lista de correos permitidos.

Versión actual: **0.6.0** (Fase 3, entrega 3b: venta rápida, ferias y análisis).

---

## Instalación (una sola vez)

### 1. Subir los archivos a GitHub

1. Abre el repositorio `vadimstrikasistema/vs-sistema`.
2. **Add file → Upload files** y arrastra **el contenido** de esta carpeta (no la carpeta misma): `index.html` tiene que quedar en la raíz del repositorio.
3. Escribe un mensaje como «Fase 1: base» y pulsa **Commit changes**.

### 2. Activar GitHub Pages

1. En el repositorio: **Settings → Pages**.
2. **Source:** Deploy from a branch · **Branch:** `main` · carpeta `/ (root)` · **Save**.
3. En uno o dos minutos la app queda en https://vadimstrikasistema.github.io/vs-sistema/

### 3. Publicar las reglas de seguridad

**Sin este paso la app no puede leer ni guardar nada.**

1. Firebase → **Firestore Database → Reglas**.
2. Borra lo que haya, pega el contenido completo de `firestore.rules` y pulsa **Publicar**.

### 4. Revisar Authentication

1. **Authentication → Método de acceso:** Correo electrónico/contraseña activado.
2. **Authentication → Usuarios:** una cuenta por cada correo permitido (Agregar usuario).
3. **Authentication → Configuración → Dominios autorizados:** agregar `vadimstrikasistema.github.io`.
4. **Authentication → Configuración → Acciones del usuario:** si aparece «Habilitar creación (registro)», desmárcala para que nadie pueda crearse una cuenta solo.

### 5. Primer ingreso

Entra a la app con una de las cuentas. La primera vez (con internet) la app crea la configuración y las listas con valores iniciales. Después, en **Inicio** aparecen los primeros pasos: completar los datos de la empresa y revisar las listas.

Para instalarla como app: en el celular, menú del navegador → **Agregar a pantalla de inicio**; en el computador, el ícono de instalar en la barra de direcciones de Chrome o Edge.

---

## Agregar o quitar un usuario

Hay que hacerlo en tres lugares, para que coincidan:

1. **Firebase → Authentication → Usuarios:** crear la cuenta (o desactivarla para quitar el acceso).
2. **`js/config.js`:** agregar o quitar el correo en `CORREOS_PERMITIDOS`.
3. **`firestore.rules`:** agregar o quitar el mismo correo en la función `permitido()`, y volver a **Publicar** las reglas en Firebase.

Si alguien olvida su contraseña, en la pantalla de ingreso escribe su correo y pulsa «Olvidé mi contraseña».

## Publicar una versión nueva

1. Subir los archivos cambiados al repositorio.
2. Cada versión cambia `APP_VERSION` en `js/config.js`, `VERSION` en `sw.js` y el `?v=` de `index.html` y `sw.js`, para que los equipos descarguen lo nuevo.
3. Si la versión trae colecciones nuevas, también sube `SCHEMA_VERSION` y, si cambian, se publican las reglas.
4. En cada equipo: **Configuración → Sistema → Buscar actualización**, o simplemente recargar.

Cada versión **agrega** campos y colecciones; nunca modifica ni borra los que ya existen, así no se pierden datos.

---

## Reglas del sistema

Estas decisiones se respetan en todas las fases:

- **Nada con historia se borra.** Lo que tiene movimientos se archiva; compras, lotes, ventas y documentos se anulan, y la anulación revierte stock y costos. Las reglas de Firestore no permiten eliminar documentos.
- **Todo cambio queda firmado** con quién y cuándo (`actualizadoPor`, `actualizado`).
- **El stock es la suma de movimientos.** Cada compra, lote, venta, ajuste o merma es un movimiento con fecha, tipo, cantidad, ubicación y referencia. Se guarda además un resumen por insumo y por pieza para leer barato; si alguna vez se descuadra, se recalcula desde los movimientos.
- **Todo se edita desde la app.** Nadie trabaja directo en la base de datos.
- **Listas editables:** los registros guardan el `id` del ítem, no su nombre. Renombrar cambia el nombre en todos los registros; ocultar lo saca de los selectores pero los registros antiguos lo siguen mostrando. Los ítems marcados como fijos no se pueden ocultar porque el sistema depende de ellos.
- **Costeo:** por última compra (por defecto) o promedio ponderado. Con factura el costo es el neto (el IVA es crédito fiscal); con boleta, todo lo pagado.
- **Sin señal:** la app sigue funcionando y guarda en el equipo; al volver la conexión sincroniza sola. La primera vez en cada equipo se necesita internet.
- **Notas explicativas (i)** en cada campo o flujo que no se entiende solo.
- **Stock de insumos:** cada insumo guarda su `stock` y su `valorStock`, que se actualizan con cada movimiento en el mismo lote de escritura (funciona sin señal). Las salidas salen a costo promedio, para que el valor de la bodega cuadre; las recetas y piezas se costean con el método elegido en Configuración.
- **Inventario inicial, ajustes y conteos no son gastos.** Solo corrigen cuánto hay y lo que vale. Las compras con documento entran por Gastos (entrega 2b).
- **Recetas por porcentaje:** la base suma 100 % y las adiciones (colorantes, opacificantes) van sobre la base. Lo preparado entra a bodega como un insumo elaborado con el nombre de la receta. Editar una receta no cambia las preparaciones anteriores.
- **Gastos:** un XML cargado queda «por clasificar» y no mueve stock hasta que se clasifica cada línea. Insumo a bodega suma stock según el formato («2 sacos de 25 kg» = 50 kg) al costo neto en facturas o total pagado en boletas; los descuentos globales se reparten en las líneas. Gasto general lleva ítem y área.
- **Duplicados:** mismo RUT + tipo + folio no se vuelve a ingresar. Mismo RUT y monto, otro folio y fecha a 7 días o menos se marca como posible duplicado.
- **Aprendizaje:** la app recuerda cómo se clasificó cada producto de cada proveedor y lo sugiere la próxima vez. Cuando todas las líneas de una factura ya se clasificaron igual dos veces, se clasifica sola y queda marcada para revisar.
- **Alertas de precio:** si un insumo llega 10 % más caro o más barato que la última vez, se crea una alerta con las recetas que lo usan.
- **Piezas y lotes:** una ficha dice con qué se hace una pieza; su costo es un estimado con los precios de hoy. Un lote es una tanda real: al crearlo descuenta la pasta y suma las horas; en el secado se anotan las grietas y la arcilla puede volver a bodega; al esmaltar descuenta el esmalte; al terminar descuenta los otros insumos (embalaje) solo por las piezas buenas y suma las piezas a stock. Las piezas que se pierden reparten su costo entre las que quedan, así el costo por pieza es el real del taller.
- **Quemas:** se registran al abrir el horno, con los lotes que iban y lo que salió. Su costo (kWh, horas × potencia, kg de gas o costo directo; si no hay dato, el estimado) se reparte según los puntos: S 1, M 2, L 4, XL 8. Una quema registrada no se modifica.
- **Cobranza:** cada factura emitida queda por cobrar desde su XML o a mano; si el cliente no existe se crea con los datos del XML. El vencimiento sale del XML o del plazo de pago del cliente. Un pago se reparte entre las facturas del cliente, de la más antigua a la más nueva, y puede cubrir varias o parte de una. Una nota de crédito descuenta de la factura que corrige. Los pagos solo se anulan; una factura con pagos no se puede anular hasta anular sus pagos.
- **Ventas directas:** pieza por pieza, con canal, feria, medio de pago, boleta y folio. Si la pieza tiene ficha, se descuenta del stock (primera o segunda). Con el control de stock apagado se vende igual y el stock puede quedar negativo hasta el conteo de piezas. Cada venta guarda el costo de lo vendido (costo real del último lote o el estimado de la ficha) y la comisión del medio de pago. Las ventas no se modifican: se anota la boleta o se anulan, y la anulación devuelve las piezas.
- **Movimientos inmutables:** las reglas de Firestore no dejan cambiar un movimiento; solo marcarlo como anulado, y la anulación crea el movimiento contrario.

## Estructura de datos

| Colección | Documento | Contenido |
|---|---|---|
| `config` | `sistema` | `schemaVersion`, cuándo y con qué versión se creó |
| `config` | `empresa` | Nombre de fantasía, razón social, RUT, giro, dirección, contacto |
| `config` | `costeo` | Método de costeo (`ultima` o `promedio`) e IVA |
| `config` | `horno` | Energía (eléctrico o gas), precio del kWh y del gas, `hornos[]` (nombre, kWh promedio de bizcocho y de esmalte, capacidad en puntos), valor de la hora de trabajo, si se recicla la arcilla |
| `listas` | una por lista | `nombre`, `descripcion`, `items[]` con `id`, `nombre`, `activo`, `orden` y `fijo` |
| `insumos` | uno por material | `nombre`, `tipo`, `unidad`, `stockMinimo`, `formatos[]`, `costoRef`, `costoUltimo`, y el resumen `stock` y `valorStock`. `elaborado` y `recetaId` si lo produce una receta. `archivado` |
| `recetas` | una por receta | `nombre`, `tipo` (esmalte, engobe, pasta, otro), `ingredientes[]` con `insumoId`, `pct` y `adicion`, `insumoId` del resultado, `notas` |
| `movimientos` | uno por entrada o salida | `fecha`, `tipo` (inicial, ajuste, conteo, preparacion, compra, anulacion), `insumoId`, `cantidad` con signo, `costoUnitario`, `valor`, `motivo`, `ref` al documento que lo originó, `anulado` |
| `preparaciones` | una por vez que se prepara una receta | receta, base seca, ingredientes pesados con su costo, cantidad resultante, costo unitario y los movimientos que generó |
| `conteos` | uno por conteo físico | fecha, lo contado y la diferencia por insumo |
| `gastos` | uno por factura, boleta o gasto sin documento | `origen` (xml o manual), `tipoDoc` (33, 34, 39, 61, 0…), `folio`, `fecha`, `mes`, `rutProveedor`, `rutLimpio`, `proveedor`, `neto`, `exento`, `iva`, `total`, `lineas[]` con su clase (`insumo` con `insumoId` y `factor`, o `gasto` con `itemGasto` y `area`), `estado` (por-clasificar o clasificado), `pagoEstado`, `pago`, `movs` (stock que generó), `automatico`, `revisado`, `anulado` |
| `proveedores` | uno por RUT (sin puntos) | nombre, giro y lo aprendido: `items` (cómo se clasificó cada producto y cuántas veces igual) y `defecto` para líneas nuevas |
| `piezas` | una por ficha (serie o pieza única) | `nombre`, `tipo`, `categoria`, `tamano` (S, M, L, XL), `pastaId` y `pastaKg`, `esmaltes[]` (insumo y gramos por pieza), `sinEsmalte`, `otros[]`, `horas`, `precioB2C` (con IVA), `precioB2B` (neto), y el resumen `stock`, `stockSegunda`, `valorStock`, `costoUltimo`; `estadoUnica` en piezas únicas |
| `lotes` | uno por tanda de piezas | pieza, `cantidadInicial`, `cantidadActual`, `etapa` (modelado, seco, bizcochado, esmaltado, terminado), `estado`, `historial[]` de cada etapa con lo que entró, salió y se perdió (y por qué), costos acumulados (`costoPasta`, `costoEsmalte`, `costoOtros`, `costoHoras`, `costoQuemas`, `creditoReciclaje`), al terminar `primera`, `segunda`, `costoUnitario`, y los movimientos que generó |
| `quemas` | una por quema | `tipo` (bizcocho o esmalte), fecha, cono, `energia` y `costo`, `puntos` y `ocupacion`, y por lote: piezas, puntos, costo asignado y lo que salió |
| `movPiezas` | uno por entrada o salida de piezas terminadas | pieza, `calidad` (primera o segunda), `cantidad` con signo, costo, `tipo` (produccion, ajuste, venta, venta-b2b, consignacion, devolucion, anulacion), motivo, `ref`, `anulado` |
| `clientes` | uno por cliente | `tipo` (empresa o persona), `rut`, `rutLimpio`, `razonSocial`, `nombre` (del local), `giro`, `direccion`, `comuna`, `contacto`, `whatsapp`, `correo`, `instagram`, `condicionDias` (plazo de pago), `ultimoRecordatorio`, `notas`, `archivado` |
| `facturas` | una por documento emitido (cuenta por cobrar) | `origen` (xml o manual), `tipoDoc` (33, 34, 61, 0 sin documento), `folio`, `fecha`, `mes`, `vencimiento`, cliente, `neto`, `iva`, `total`, `lineas`, `referencias`, `pagado`, `estado` (pendiente, parcial, pagada, anulada, nota-credito), `abierta`, `aplicadaA` en notas de crédito; `ordenIds` y `ordenNumeros` si viene de órdenes de venta |
| `pagos` | uno por pago recibido | cliente, `fecha`, `medio`, `referencia`, `monto`, `aplicaciones[]` (factura y monto), `tipo` (pago o nota-credito), `anulado` |
| `ventas` | una por venta directa | `fecha`, `mes`, `hora`, `canal`, `feriaId`, `medio`, cliente, `lineas[]` (pieza o sin ficha, `calidad`, cantidad, precio con IVA, `costoUnitario`), `descuento`, `total`, `neto`, `iva`, `comision`, `costo`, `boleta` (`emitida`, `folio`), `movs` (salidas de piezas), `pagos[]` y `encargoId` si viene de un encargo, `anulado` |
| `ferias` | una por feria | `nombre`, `lugar`, `fechaInicio`, `fechaFin`, `costoPuesto`, `otrosCostos`, `notas`, `cerrada` |
| `config` | `ventas` | `controlarStock`, `comisiones` por medio de pago, `recordarBoleta` |
| `ordenes` | una por orden de venta a empresas | `numero` (correlativo), `fecha`, `mes`, cliente (`clienteId`, `razonSocial`, `rutCliente`, `rutLimpio`), `condicionDias`, `origen` (directa o consignacion), `consignacionId` y `consignacionNumero`, `lineas[]` (pieza, `calidad`, cantidad, precio neto, `subtotal`, `costoUnitario`), `neto`, `iva`, `total`, `costo`, `entregada`, `fechaEntrega`, `fechaCompromiso`, `facturada`, `facturaId`, `folio`, `fechaFactura`, `nota`, `anulada` |
| `consignaciones` | una por tienda con piezas en consignación | `numero`, `fecha`, cliente, `lineas[]` (`key`, pieza, `calidad`, precio neto, `costoUnitario`, `entregadas`, `vendidas`, `devueltas`, `perdidas`), `entregas[]`, `liquidaciones[]` (fecha, vendidas, vuelven, vuelven dañadas, perdidas y su costo, `ordenId`), `cerrada`, `nota`, `anulada` |
| `encargos` | uno por encargo de un cliente | `numero`, `fecha`, `fechaEntrega`, `canal`, cliente, `lineas[]` (pieza o sin ficha, cantidad, precio con IVA), `total`, `nota`, `abonos[]` (`monto`, `medio`, `fecha`, `devuelto`), `estado` (pendiente, taller, listo, entregado, anulado), `historial[]`, `ventaId`, `fechaEntregado` |
| `eventos` | uno por evento propio de la agenda | `titulo`, `tipo` (entrega, clase, quema, compra, reunion, otro), `lugar`, `fecha`, `fechaFin`, `hora`, `horaFin`, `nota`, `hecho`, `anulado` |
| `alertasPrecio` | una por cambio de precio de 10 % o más | insumo, costo anterior y nuevo, variación, proveedor, documento, recetas afectadas, `visto` |

Listas iniciales: tipos de insumo, unidades, categorías de pieza, canales de venta, medios de pago, áreas del negocio, ítems de gasto, motivos de merma y motivos de ajuste de inventario.

## Archivos

```
index.html              punto de entrada
manifest.webmanifest    instalación como app
sw.js                   guarda la app en el equipo para abrir sin señal
firestore.rules         reglas de seguridad (se publican en Firebase)
css/app.css             estilos y paleta
js/config.js            versión, configuración de Firebase y correos permitidos
js/firebase.js          conexión con Firebase y caché offline
js/datos.js             preparación inicial, lectura y guardado
js/datos-iniciales.js   valores con que parte el sistema
js/ui.js                utilidades de interfaz (avisos, diálogos, RUT)
js/iconos.js            íconos
js/app.js               ingreso, menú y navegación
js/b2b-core.js          órdenes de venta, consignación y paso a factura
js/favorito-sii.js      favorito que rellena el facturador gratuito del SII
js/encargos-core.js     encargos con abono
js/agenda-core.js       todo lo que tiene fecha, para la agenda
js/modulos/             una pantalla por módulo
fonts/, img/            tipografías y logo (incluidos para funcionar sin señal)
```

---

## Plan por fases

1. **Base** · acceso, reglas de seguridad, Configuración y listas editables. ✔
2. **Producción, inventario y gastos**, en tres entregas:
   - **2a** · insumos con formatos de compra y calculadora de costo, recetas de esmaltes, engobes y pastas por porcentaje, preparación que descuenta y suma stock, bodega con inventario inicial, ajustes, conteo físico e historial. ✔
   - **2b** · gastos con XML del SII o a mano; cada línea como insumo (suma stock) o gasto general, con aprendizaje por proveedor, duplicados, alertas de precio, por pagar y análisis mensual. ✔ Pendiente para más adelante: conciliación con la cartola del banco, cuentas recurrentes y foto de boletas.
   - **2c** · fichas de pieza (pasta, esmalte, horas, tamaño S, M, L, XL en el horno) con costo y margen, lotes por etapa con mermas y reciclaje de arcilla, quemas con horno eléctrico o a gas y costo repartido, piezas de primera y de segunda, inventario de piezas con ajustes. ✔ Pendiente: fotos de las piezas (requiere decidir dónde guardarlas) y quemas programadas en la Agenda (fase 4).
3. **Ventas y cobranza**, en tres entregas:
   - **3a** · clientes y cobranza: facturas emitidas desde el XML o a mano, notas de crédito, pagos en efectivo o transferencia, recordatorios por WhatsApp y estado de cuenta en PDF. ✔
   - **3b** · venta rápida pieza por pieza, también sin señal, con boleta y folio, cierre del día, ferias con su resultado, historial y análisis; vender sin inventario cargado hasta enero. ✔
   - **3c** · órdenes de venta con PDF por WhatsApp, consignaciones con liquidación y facturación con el favorito del facturador del SII, conectadas con la cobranza. ✔ Pendiente: confirmar los nombres de campo del facturador con el favorito que ya usa el taller, y guía de despacho para consignación si hace falta.
4. **Agenda y encargos**:
   - **4a** · encargos con abono y agenda con eventos propios (clases, quemas, entregas), ferias, encargos, órdenes por entregar y vencimientos de cobro. ✔
   - Siguen: gastos recurrentes y por pagar en la agenda, clases con alumnos, contactos de feria con QR, modo feria y conteo de piezas (enero).

## Historial de versiones

### 0.8.0 · Entrega 4a: encargos y agenda
- **Ventas → Encargos:** piezas a pedido (con ficha o sin ella) con precio con IVA, detalles, fecha de entrega y uno o varios abonos con su medio de pago. Estados: por empezar, en el taller, listo y entregado; aviso por WhatsApp cuando está listo, con el saldo y los datos de transferencia. Al entregar se cobra el saldo y se registra la venta completa, con cada abono como parte del pago, y las piezas salen del stock. Si se anula la venta, el encargo vuelve a «listo». Al anular un encargo se anota si se devolvió el abono.
- **Ventas:** una venta pagada en partes muestra cada pago y el análisis la reparte por medio de pago.
- **Agenda:** calendario del mes (con puntos de color en el celular), el día elegido y los próximos 14 días. Eventos propios (clase, quema, entrega, compra, reunión) con horario y varios días; marcar hecho o quitar. Aparecen solos las ferias, los encargos (los atrasados, hoy), las órdenes por entregar con su fecha y los vencimientos de las facturas por cobrar. Desde un día se agrega un evento, un encargo o una feria.
- **Órdenes:** fecha de entrega comprometida cuando no se entrega al crearla.
- **Inicio:** lo de esta semana.
- **Reglas de Firestore nuevas** para encargos y eventos. **Hay que volver a publicarlas.**
- Estructura de datos versión 8.

### 0.7.0 · Fase 3, entrega 3c: órdenes de venta, consignación y facturación
- **Ventas → Órdenes:** orden de venta a tiendas y cafeterías con correlativo (OV 1, OV 2…), precio neto a tiendas y el último precio cobrado a cada cliente; se entrega al crearla o después (ahí salen las piezas del stock); PDF con datos de transferencia para mandar por WhatsApp; margen; anulación que devuelve las piezas.
- **Ventas → Consignación:** entrega a una tienda (las piezas salen del stock y quedan «en la tienda»), más piezas a la misma consignación, comprobante en PDF con firmas, y liquidación: lo vendido pasa a una OV lista para facturar; lo que no se vendió sigue en la tienda o vuelve al taller (en buen estado, dañado como de segunda, o perdido).
- **Ventas → Por facturar:** órdenes entregadas sin factura, juntas por cliente; se eligen una o varias para una sola factura. «Preparar factura» copia los datos para el favorito, abre el facturador del SII y muestra cada dato para copiar a mano; la referencia es la nota de pedido (802) con el número de la OV. Al anotar el folio, la factura pasa a Cobranza con su vencimiento; si el XML ya estaba cargado, se vincula sin duplicar.
- **Favorito «VS → SII»:** primer clic escribe el RUT del cliente; segundo clic, el detalle (agrega líneas si faltan) y las referencias. Avisa lo que no pudo escribir y, si no encuentra los campos, ofrece la lista de la página para ajustarlo.
- **Cobranza:** la factura muestra sus órdenes; al anularla, las órdenes vuelven a «Por facturar».
- **Inventario:** piezas en consignación (cantidad y costo) y el nombre de cada movimiento en el historial de una pieza.
- **Inicio:** lo que hay por facturar y las tiendas con piezas en consignación.
- **Reglas de Firestore nuevas** para órdenes y consignaciones. **Hay que volver a publicarlas.**
- Estructura de datos versión 7.

### 0.6.0 · Fase 3, entrega 3b: venta rápida, ferias y análisis
- **Ventas → Venta rápida:** grilla de piezas con búsqueda y categorías, «Otra pieza» para lo que no tiene ficha, carrito con cantidades, primera o segunda (con su precio), precio editable y descuento; medio de pago con su comisión; cliente final opcional; boleta y folio; otra fecha para pasar ventas del cuaderno. Funciona sin señal.
- **Ventas de hoy** y **Cierre del día:** total por medio de pago para cuadrar la caja, piezas vendidas y las ventas sin boleta para anotar sus folios.
- **Ventas → Ferias:** fechas, lugar, puesto y otros costos; resultado (ventas sin IVA menos costo de piezas, comisiones y costos), ventas por día y por hora, lo más vendido, «Vender aquí» y cierre.
- **Ventas → Historial** por día y **Análisis** del mes: por canal, por medio de pago, lo más vendido, por hora, ticket promedio y margen.
- **Configuración → Ventas:** controlar stock (apagado hasta cargar el inventario), comisión por medio de pago, recordar boletas.
- **Inicio:** ventas de hoy y las que quedaron sin boleta.
- Los montos negativos se muestran como −$.
- **Reglas de Firestore nuevas** para ventas, ferias y la configuración de ventas. **Hay que volver a publicarlas.**
- Estructura de datos versión 6.

### 0.5.0 · Fase 3, entrega 3a: clientes y cobranza
- **Ventas → Clientes:** empresas y profesionales (RUT, razón social, nombre del local, giro, contacto, WhatsApp, plazo de pago) y clientes finales (nombre, Instagram, notas).
- **Cobranza → Facturas:** carga de XML de facturas emitidas (crea los clientes que faltan y aplica las notas de crédito), factura a mano o deuda sin documento, detalle con sus pagos, anulación.
- **Cobranza → Por cobrar:** total, vencido y al día; una tarjeta por cliente con sus folios y días de atraso, la más atrasada primero.
- **Recordatorio por WhatsApp** en tono amable o firme, con los datos de transferencia y, si se quiere, el estado de cuenta en PDF. En el celular se comparte con el menú del teléfono; en el computador se descarga y se abre el chat.
- **Registrar pago** en efectivo o transferencia, repartido solo entre las facturas del cliente, con referencia. **Cobranza → Pagos** con lo cobrado en el mes y anulación.
- **Configuración → Empresa:** datos para transferencias.
- **Inicio:** por cobrar y vencido. En el celular, Cobranza pasa a la barra inferior e Inventario a «Más».
- El PDF se arma en el teléfono o el computador con jsPDF (`js/vendor`), sin servidor y sin señal.
- **Reglas de Firestore nuevas** para clientes, facturas y pagos. **Hay que volver a publicarlas.**
- Estructura de datos versión 5.

### 0.4.1 · Ajustes con los datos del taller
- Varios hornos (parte con tres eléctricos, 278 kWh por bizcocho y 558 kWh por esmalte), cada uno con su nombre, consumo promedio y capacidad.
- Al registrar una quema se elige el horno, y la energía se toma del promedio del horno, de la lectura del remarcador, de los kWh o de un costo directo.
- Cada quema muestra y guarda su valor vendible y su valor en merma, a precio de venta.
- Precio de segunda opcional en la ficha.

### 0.4.0 · Fase 2, entrega 2c: piezas, lotes y quemas
- **Producción → Piezas:** fichas de serie o pieza única con categoría, tamaño en el horno, pasta, esmaltes, otros insumos, horas y precios; desglose del costo y margen de venta directa y a tiendas.
- **Producción → Lotes:** tablero por etapa (modelado y secado, espera bizcocho, espera esmalte, esmaltado). Registrar secado con mermas y reciclaje, esmaltar (también en crudo), terminar sin esmalte, ver el recorrido y el costo real de cada lote, anular lotes en proceso.
- **Producción → Quemas:** registrar quemas de bizcocho y de esmalte con su energía, ocupación del horno, lo que salió de cada lote (primera, segunda, perdidas con motivo) y el costo repartido por tamaño.
- **Inventario → Piezas:** piezas de primera, de segunda, en proceso por etapa y valor; ajustes de piezas (incluye inventario inicial de piezas ya hechas) con historial y anulación.
- **Configuración → Horno y trabajo:** valor de la hora, energía del horno, precios, capacidad y reciclaje de arcilla, con el costo estimado de cada quema.
- **Inicio:** panel «En el taller» con las piezas por etapa.
- **Reglas de Firestore nuevas** para piezas, lotes, quemas, movimientos de piezas y la configuración del horno. **Hay que volver a publicarlas.**
- Estructura de datos versión 4 (se actualiza sola al entrar).

### 0.3.0 · Fase 2, entrega 2b: gastos
- **Gastos → Documentos:** carga de XML del SII (uno o varios archivos, con varias facturas cada uno, en ISO-8859-1 o UTF-8), arrastrando o eligiendo archivos. Detecta facturas ya ingresadas, posibles duplicados, facturas emitidas por la propia empresa y facturas a otro RUT.
- **Clasificación por línea:** insumo a bodega (con su formato de compra y el costo resultante) o gasto general (ítem y área), con «aplicar a todas». Muestra el alza o baja de precio antes de guardar.
- **Gasto a mano:** factura, factura exenta, boleta, nota de crédito o sin documento; RUT, proveedor y folio obligatorios con documento; completa el proveedor si el RUT ya es conocido.
- **Aprendizaje por proveedor** y clasificación automática para revisar.
- **Por pagar:** facturas a crédito por vencimiento, con vencidas y próximas 7 días, y «Marcar pagado».
- **Análisis:** gasto del mes, compras a bodega, gastos generales, IVA crédito fiscal, por ítem, por área y últimos seis meses.
- **Alertas de precio** con recetas afectadas.
- **Inicio:** documentos por clasificar, por pagar, vencido y alertas sin revisar.
- **Reglas de Firestore nuevas** para gastos, proveedores y alertas de precio. **Hay que volver a publicarlas.**
- Estructura de datos versión 3 (se actualiza sola al entrar).

### 0.2.0 · Fase 2, entrega 2a: insumos, recetas y bodega
- **Producción → Insumos:** catálogo por tipo con búsqueda, unidad, stock mínimo, formatos de compra, costo de referencia con calculadora (precio ÷ contenido) y archivo.
- **Producción → Recetas:** recetas por porcentaje con adiciones, costo por kg en vivo, aviso si la base no suma 100 %. Preparar una receta calcula cuánto pesar de cada ingrediente, descuenta de bodega y suma lo preparado; se puede anular.
- **Inventario → Bodega:** stock y valor por insumo, avisos de stock bajo y de insumos sin costo, historial por insumo, ajustes con motivo, inventario inicial en una sola tabla y conteo físico que crea los ajustes de las diferencias.
- **Inventario → Movimientos:** todas las entradas y salidas, con anulación.
- **Inicio:** pasos para crear insumos y cargar el inventario inicial, y aviso de stock bajo.
- **Reglas de Firestore nuevas** para insumos, recetas, movimientos, preparaciones y conteos. **Hay que volver a publicarlas.**
- Estructura de datos versión 2 (se actualiza sola al entrar).

### 0.1.3 · Ícono circular
- Ícono de la app con el logo original: círculo blanco, aro gris y letras negras. Versión adaptable para Android y iPhone.

### 0.1.2 · Menú en loza
- Barra lateral y barra inferior en un loza más oscuro que el fondo, con el ítem seleccionado en blanco y texto cobalto. El rosa esmalte queda para avisos.

### 0.1.1 · Ajustes de diseño
- Tipografía única, Instrument Sans, más limpia.
- Paleta reducida: cobalto para acciones, rosa esmalte en el menú con selector claro (cambiado en 0.1.2), ocre gres y celadón de apoyo, fondos blanco y loza; carbón solo en el texto.
- Ícono de la app en cobalto (cambiado en 0.1.3).

### 0.1.0 · Fase 1, base
- Ingreso con correo y contraseña, lista de correos permitidos y recuperación de contraseña.
- Reglas de Firestore: solo usuarios permitidos, escrituras firmadas, sin borrados.
- Preparación automática de la base en el primer ingreso.
- Configuración: datos de la empresa con validación de RUT, método de costeo, listas editables (agregar, renombrar, ordenar, ocultar) y versión de app y datos.
- Inicio con primeros pasos y plan de fases.
- Funciona sin señal e instalable en celular y computador.
- Identidad visual con el logo y la paleta del taller.
