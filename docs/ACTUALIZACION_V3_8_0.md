# SOLIS Cotizador v3.8.0 — actualización y uso

Entrega de código fuente para actualizar el repositorio existente y su pipeline de Cloudflare. No se ha publicado desde esta sesión. Conserva el formato PDF v3.7.2, los datos existentes y las dependencias fijadas.

## Actualizar desde v3.7.2

1. Respalde el repositorio y exporte su base D1 antes de actualizar.
2. Descomprima el ZIP y copie **todo su contenido** en la raíz del repositorio, conservando las carpetas `app`, `components`, `lib`, `vendor`, `public`, `scripts`, `docs`, etc. Evite una carpeta adicional dentro de la raíz. Suba también las nuevas rutas API y los archivos de `vendor` con sus licencias. No basta con subir `cotizador-app.tsx`.
3. Preserve su configuración propia de Cloudflare: nombre de Worker, identificadores D1/R2, secretos y bindings `DB`/`BUCKET`. No sustituya identificadores reales por ejemplos.
4. Opcionalmente ejecute `node scripts/verify-distribution.mjs`. Comprueba las huellas de la entrega; una configuración propia distinta debe revisarse deliberadamente.
5. Confirme el commit en la rama conectada con Cloudflare. Mantenga los comandos de construcción y despliegue que ya funcionan en producción. Compruebe el resultado del despliegue para ese commit.
6. La versión raíz del paquete es `3.8.0` y la caché PWA usa `v380`. Con conexión, cierre otras ventanas de la PWA, actualice y vuelva a abrir. Evite borrar los datos del sitio si hay cambios offline pendientes.

No hay migraciones nuevas en v3.8.0. Una instalación anterior a v3.6 debe completar las migraciones previas descritas en sus guías. La compilación local se validó con dependencias disponibles en caché; la instalación limpia de las versiones exactas del lockfile debe comprobarse en Cloudflare (véase VALIDACION_V3_8_0.md).

## Eliminar cotizaciones creadas por error

En **Cotizaciones**, pulse **Eliminar** en un borrador y confirme. Se mueve a la **Papelera** y puede restaurarse conservando sus partidas y datos. No borra correlativos ni los reutiliza. Requiere permiso de escritura y conexión.

Solo admite borradores sin congelar y sin órdenes de trabajo, documentos emitidos, cobros o revisiones descendientes. Las cotizaciones enviadas/aprobadas mantienen su trazabilidad. Una edición desde otro dispositivo puede rechazar la operación: actualice y revise antes de reintentar. Los registros que aún solo existen offline deben sincronizarse primero.

## Eliminar clientes creados por error

En **Clientes**, pulse **Eliminar** y confirme. Queda inactivo y desaparece de la lista activa. Puede recuperarlo desde la papelera de clientes. Las cotizaciones y sus vínculos históricos se conservan. La restauración se bloquea si ya hay otro cliente activo con el mismo RUT normalizado.

La papelera muestra como máximo los 100 registros eliminados más recientes de cada tipo. No permite borrado físico definitivo.

## Etiquetas y escáner de materiales

En **Inventario**, abra **Escáner, etiquetas y entrada rápida de inventario**. Solo aparece para usuarios con gestión de inventario.

1. Seleccione un material de la biblioteca y el formato **QR** o **Code 128**. Descargue las etiquetas. Si no selecciona uno, se incluyen los primeros 100 materiales de la lista cargada.
2. Abra el HTML descargado e imprima al 100%, verificando primero una etiqueta. Es autónomo: no carga imágenes, scripts ni servicios externos. Las barras se imprimen a una columna para mantener legibilidad.
3. El QR usa el identificador estable `SOLIS-MAT:<id>`. Code 128 usa el código de biblioteca, con caracteres ASCII imprimibles y hasta 48 caracteres. Asigne códigos únicos; un código duplicado se rechaza al buscarlo.
4. Pulse **Abrir cámara** y permita su uso. El QR tiene decodificador local de respaldo. Las barras por cámara dependen de los formatos del navegador/dispositivo. También puede escribir el código o utilizar un lector USB/Bluetooth que escriba y envíe Enter.
5. Escanear solo selecciona el material; nunca aumenta existencias por sí mismo. La imagen se procesa en el dispositivo, sin subir fotografías. La cámara se detiene al encontrar un código o salir/ocultar la pantalla.

La cámara requiere HTTPS, permiso y hardware compatible. El lector de respaldo se descarga la primera vez que se abre el escáner con conexión. Para usarlo offline, abra previamente esta función y cargue la biblioteca. Las etiquetas no incluyen precios ni costos internos. No se incorpora un catálogo externo de códigos de fabricante: los códigos deben corresponder a los guardados en su biblioteca.

## Recibir inventario por lotes

Seleccione material, bodega activa, **cantidad en la unidad de biblioteca**, costo unitario neto en CLP y referencia de guía/factura/inventario. Por ejemplo, si cable está en metros, un rollo de 100 m se ingresa como 100; el costo es por metro. El precio precargado es una referencia editable, no una verificación del costo real.

Pulse **Agregar al lote** para cada ingreso y luego **Confirmar entradas pendientes**. El lote admite 100 filas. Cada recepción conserva un identificador único: repetir la misma fila después de un corte de conexión no vuelve a sumar stock. Las filas confirmadas quedan marcadas y solo se reintentan las pendientes o con error. Cada recepción actualiza saldo y costo promedio ponderado, conservando mínimos y reservas, con movimiento y registro de auditoría.

**Si el resultado es incierto, reintente esa misma fila. No la retire y cree otra:** una nueva fila representa otra recepción. Ocultar una confirmada solo la quita del lote visual; no revierte el movimiento. Las devoluciones/ajustes siguen sus flujos existentes.

Las compras con orden de compra deben recibirse desde **Compras**, para enlazar cantidades, reservas y trazabilidad. Este lote es una entrada directa de inventario y no concilia una orden de compra.

## Trabajo offline

Puede preparar el lote, usar los datos de biblioteca ya cargados y generar etiquetas sin conexión. El borrador se guarda en IndexedDB, aislado por usuario en el dispositivo. Cerrar sesión purga la copia privada; no cierre sesión ni borre datos del navegador con un lote pendiente.

**Confirmar entradas y usar la papelera requiere conexión.** Las entradas de escáner no se agregan automáticamente a la cola de movimientos físicos. La cola previa de clientes/cotizaciones y operaciones compatibles conserva su sincronización existente al recuperar red. Una sesión vencida requiere autenticarse antes de confirmar.

## Seguimiento comercial y panel

- Cotizaciones: búsqueda sin tildes por palabras, estado, cliente, moneda, fechas, vigencia, orden y exportación CSV de los resultados. Por defecto muestra la revisión más reciente de cada cotización; puede incluir el historial.
- Vigencia: usa fecha de emisión y plazo guardado. El último día es inclusivo. Si falta el plazo original, se indica sin información. No cambia estados automáticamente.
- Seguimiento: prepara un mensaje editable y permite copiar o abrir correo/WhatsApp con el contacto del cliente vinculado. El usuario revisa y envía; no hay envíos automáticos, seguimiento de lectura ni adjuntos automáticos. Adjunte manualmente el PDF cuando corresponda.
- Panel: montos netos separados por moneda y revisión, ofertas por vencer/vencidas y órdenes con compromiso pendiente. Los técnicos no reciben importes comerciales.

Los indicadores se calculan sobre la ventana cargada por el panel: hasta 100 versiones de cotización y 100 órdenes. No son un informe histórico global ni facturación efectiva. Si la última revisión es borrador, una aprobación de una revisión anterior no se suma como aprobación de la última.

## Teléfono y tablet

Cotizaciones usa tarjetas hasta pantallas amplias; clientes, existencias y cotizaciones recientes adaptan sus tablas a tarjetas según el ancho disponible, también cuando la barra lateral reduce el espacio. Se mejoran tamaños de controles y campos táctiles. Los demás listados conservan desplazamiento horizontal cuando lo necesitan.

La validación automática cubre lógica, APIs y controladores de componentes. Quedan pendientes la revisión visual en teléfono/tablet físicos, permisos reales de cámara y prueba de etiquetas impresas. No se presenta esta entrega como una certificación de compatibilidad con todos los equipos.
