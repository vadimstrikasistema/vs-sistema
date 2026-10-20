# Vadim Strika · Sistema del taller

Sistema de gestión del taller de cerámica Vadim Strika: producción por etapas y quemas, inventario, ventas (directas, ferias, consignación, empresas), facturación en el portal gratuito del SII, cobranza y gastos.

- **App:** https://vadimstrikasistema.github.io/vs-sistema/
- **Frontend:** HTML, CSS y JavaScript sin compilación, publicado en GitHub Pages e instalable en celular y computador.
- **Datos:** Firebase Firestore (plan gratuito Spark), con caché local para trabajar sin señal.
- **Acceso:** Firebase Authentication con correo y contraseña, más una lista de correos permitidos.

Versión actual: **0.1.0** (Fase 1, base).

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

## Estructura de datos

| Colección | Documento | Contenido |
|---|---|---|
| `config` | `sistema` | `schemaVersion`, cuándo y con qué versión se creó |
| `config` | `empresa` | Nombre de fantasía, razón social, RUT, giro, dirección, contacto |
| `config` | `costeo` | Método de costeo (`ultima` o `promedio`) e IVA |
| `listas` | una por lista | `nombre`, `descripcion`, `items[]` con `id`, `nombre`, `activo`, `orden` y `fijo` |

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
2. **Producción, inventario y gastos** · insumos y formatos, recetas de esmaltes, engobes y pastas, fichas de pieza con costo, compras por XML del SII o a mano que suman stock, inventario inicial y ajustes, quemas y lotes por etapa con mermas.
3. **Ventas y cobranza** · venta rápida y ferias, clientes, consignaciones con liquidación, órdenes de venta con PDF y WhatsApp, por facturar con el favorito que rellena el facturador del SII, encargos con abono, cobranza y pagos.
4. **Agenda y clases** · calendario con quemas, ferias, clases, entregas y compromisos de pago.

## Historial de versiones

### 0.1.0 · Fase 1, base
- Ingreso con correo y contraseña, lista de correos permitidos y recuperación de contraseña.
- Reglas de Firestore: solo usuarios permitidos, escrituras firmadas, sin borrados.
- Preparación automática de la base en el primer ingreso.
- Configuración: datos de la empresa con validación de RUT, método de costeo, listas editables (agregar, renombrar, ordenar, ocultar) y versión de app y datos.
- Inicio con primeros pasos y plan de fases.
- Funciona sin señal e instalable en celular y computador.
- Identidad visual con el logo y la paleta del taller.
