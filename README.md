# Vadim Strika · Sistema del taller

Sistema de gestión del taller de cerámica Vadim Strika: producción por etapas y quemas, inventario, ventas (directas, ferias, consignación, empresas), facturación en el portal gratuito del SII, cobranza y gastos.

- **App:** https://vadimstrikasistema.github.io/vs-sistema/
- **Frontend:** HTML, CSS y JavaScript sin compilación, publicado en GitHub Pages e instalable en celular y computador.
- **Datos:** Firebase Firestore (plan gratuito Spark), con caché local para trabajar sin señal.
- **Acceso:** Firebase Authentication con correo y contraseña, más una lista de correos permitidos.

Versión actual: **0.2.0** (Fase 2, entrega 2a: insumos, recetas y bodega).

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
- **Movimientos inmutables:** las reglas de Firestore no dejan cambiar un movimiento; solo marcarlo como anulado, y la anulación crea el movimiento contrario.

## Estructura de datos

| Colección | Documento | Contenido |
|---|---|---|
| `config` | `sistema` | `schemaVersion`, cuándo y con qué versión se creó |
| `config` | `empresa` | Nombre de fantasía, razón social, RUT, giro, dirección, contacto |
| `config` | `costeo` | Método de costeo (`ultima` o `promedio`) e IVA |
| `listas` | una por lista | `nombre`, `descripcion`, `items[]` con `id`, `nombre`, `activo`, `orden` y `fijo` |
| `insumos` | uno por material | `nombre`, `tipo`, `unidad`, `stockMinimo`, `formatos[]`, `costoRef`, `costoUltimo`, y el resumen `stock` y `valorStock`. `elaborado` y `recetaId` si lo produce una receta. `archivado` |
| `recetas` | una por receta | `nombre`, `tipo` (esmalte, engobe, pasta, otro), `ingredientes[]` con `insumoId`, `pct` y `adicion`, `insumoId` del resultado, `notas` |
| `movimientos` | uno por entrada o salida | `fecha`, `tipo` (inicial, ajuste, conteo, preparacion, compra, anulacion), `insumoId`, `cantidad` con signo, `costoUnitario`, `valor`, `motivo`, `ref` al documento que lo originó, `anulado` |
| `preparaciones` | una por vez que se prepara una receta | receta, base seca, ingredientes pesados con su costo, cantidad resultante, costo unitario y los movimientos que generó |
| `conteos` | uno por conteo físico | fecha, lo contado y la diferencia por insumo |

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
js/modulos/             una pantalla por módulo
fonts/, img/            tipografías y logo (incluidos para funcionar sin señal)
```

---

## Plan por fases

1. **Base** · acceso, reglas de seguridad, Configuración y listas editables. ✔
2. **Producción, inventario y gastos**, en tres entregas:
   - **2a** · insumos con formatos de compra y calculadora de costo, recetas de esmaltes, engobes y pastas por porcentaje, preparación que descuenta y suma stock, bodega con inventario inicial, ajustes, conteo físico e historial. ✔
   - **2b** · gastos con XML del SII o a mano; cada línea como insumo (suma stock) o gasto general, con aprendizaje por proveedor, duplicados y alertas de precio.
   - **2c** · fichas de pieza (pasta, esmalte, horas, tamaño S, M, L, XL en el horno), quemas con horno eléctrico o a gas, lotes por etapa con mermas, piezas de segunda, inventario de piezas.
3. **Ventas y cobranza** · venta rápida y ferias, clientes, consignaciones con liquidación, órdenes de venta con PDF y WhatsApp, por facturar con el favorito que rellena el facturador del SII, encargos con abono, cobranza y pagos.
4. **Agenda y clases** · calendario con quemas, ferias, clases, entregas y compromisos de pago.

## Historial de versiones

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
