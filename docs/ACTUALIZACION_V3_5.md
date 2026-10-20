# SOLIS Cotizador v3.5.0

Esta distribución actualiza el proyecto existente en GitHub y Cloudflare. Incluye el código completo, no solamente los archivos modificados. No publica automáticamente en ninguna cuenta.

## Actualizar su instalación

1. Descargue y descomprima `SOLIS_Cotizador_v3_5_Completo.zip`.
2. Copie el **contenido** de `solis-Cotizador/` sobre la raíz de su copia del repositorio. La raíz es donde están `package.json`, `app/`, `components/` y `lib/`. Conserve su configuración real de Cloudflare y los secretos del Worker.
3. Suba a la rama de producción de GitHub los archivos y carpetas completos. No suba el ZIP como archivo y no cree una carpeta adicional dentro del proyecto. Incluya los archivos nuevos; cambiar solamente `app/cotizador-app.tsx` provocaría nuevamente errores de dependencias ausentes.
4. Si trabaja con Git en su computador, revise `git status`, ejecute `git add .`, cree un commit y use `git push`. No necesita subir `node_modules`, `dist` ni archivos de contraseñas.
5. En un entorno con acceso al registro de paquetes, ejecute `npm ci` y `npm run check`.
6. La integración existente de Cloudflare debe compilar el commit nuevo con `npm run build` y usar su despliegue habitual de Workers. Compruebe que el despliegue de producción terminó correctamente y corresponde al commit recién subido. Un build fallido conserva la versión anterior en servicio.
7. Abra la aplicación con internet, espere a que termine de cargar y vuelva a abrirla para que tome el service worker nuevo. La aplicación debe mostrar **v3.5.0**. Antes de usarla con clientes, haga una cotización de prueba y genere un PDF nuevo.

No hay migraciones nuevas sobre una instalación v3.4 con las migraciones existentes aplicadas. Se conservan las tablas, D1 y R2. No reinstale la base ni borre datos del navegador si tiene operaciones pendientes de sincronizar. Los documentos ya emitidos conservan sus bytes: para obtener el formato nuevo, genere una nueva versión del PDF.

`docs/ARCHIVOS_V3_5.json` enumera todos los archivos de la entrega y sus huellas SHA-256. `docs/CLOUDFLARE.md` conserva las instrucciones de instalación inicial; una actualización no requiere crear otro Worker ni otra base.

## Empresa, logo y diseño

En **Empresa y documentos**, el administrador puede modificar razón social, RUT, giro, dirección, representante, teléfono, correo y correo del contador. Puede cargar un logo PNG, JPEG o WebP; se adapta para usarlo en pantalla y en los nuevos PDF. **Restaurar SOLIS** recupera el logo incluido.

La barra lateral y el acceso usan directamente el archivo del logo, sin depender de la optimización de imágenes del framework. El PDF incorpora su propia copia del logo y fuentes tipográficas. La interfaz usa azul para las acciones principales, tablas más legibles y campos numéricos consistentes.

## Cotización y listas globales

La cotización comercial usa papel A4 blanco, identificación del cliente y proyecto, tabla de oferta azul, subtotal, descuento, neto, IVA, total, condiciones comerciales, validación técnica, exclusiones, observaciones y espacios de firma. Las descripciones extensas continúan en páginas adicionales.

En el borrador puede completar **Validación técnica** y **Exclusiones del alcance**. La validación permite indicar las condiciones que deben confirmarse en terreno; no sustituye un cálculo o revisión profesional.

Cada lista mantiene un título interno y otro para el cliente. Por ejemplo, puede desglosar cables, protecciones y EMT en **Materiales de corriente alterna**, y mostrar un único global **Suministro de materiales de corriente alterna**. No agregue otra partida manual para cobrar los mismos materiales.

Los costos internos, recargos y proveedores de referencia se conservan separados de la oferta del cliente. Antes de congelar la revisión debe confirmar los precios pendientes. Para cambiar una oferta congelada, cree una revisión nueva.

En **Solicitar precios a proveedores** puede seleccionar listas, consolidar artículos técnicamente idénticos y descargar PDF o CSV sin sus costos ni precios de venta. La generación es local y funciona sin conexión cuando los datos ya están en el dispositivo. Si usa un borrador pendiente de sincronizar, se indica expresamente en pantalla. Guarde los cambios del editor antes de exportar.

WhatsApp y **Preparar correo** abren un mensaje con texto. Adjunte el archivo descargado antes de enviarlo. **Compartir PDF** utiliza la función del dispositivo cuando está disponible. Abrir el mensaje no confirma que se haya enviado.

## Biblioteca de materiales de Chile

La sección **Catálogo eléctrico de Chile** contiene 196 referencias consultadas el 20/10/2026, entre ellas:

- Protecciones AC y DC, diferenciales y contactores.
- Conductores de 2,5, 4, 6 y 10 mm², incluyendo referencias fotovoltaicas.
- EMT de 20, 25, 32 y 40 mm y accesorios.
- Cajas estancas, gabinetes metálicos y plásticos, tableros modulares.
- Amarras, bases adhesivas, prensaestopas, punteras y borneras.
- Soportes, barras roscadas, pernos, tuercas, golillas, tarugos y anclajes.

Cada referencia conserva proveedor, enlace de producto o categoría, fecha, presentación de venta e indicación de IVA. Se calcula el costo neto por unidad de uso; una bolsa de 100 unidades se divide por 100 y un rollo vendido como metros se normaliza según su presentación. La tienda puede exigir comprar el envase completo. Los tramos EMT se mantienen como tramos de 3 m.

Si la fuente no permite confirmar el IVA, debe elegir explícitamente cómo tratarlo antes de importar. El recargo propuesto es editable y no equivale a margen sobre venta. Las referencias existentes en su biblioteca no se sobrescriben al importarlas otra vez. Puede editar su costo, venta, proveedor, fuente y fecha desde la biblioteca propia.

Son precios de referencia fechados, sujetos a stock, cambios, despacho y confirmación de variantes. **No existe actualización automática de precios desde las tiendas.** Pasados 30 días se señalan como referencias antiguas. Verifique tensión, corriente, sección, polos, capacidad de corte, dimensiones, compatibilidad y certificación del modelo antes de comprar; la biblioteca no dimensiona una instalación.

El Excel `Precios_Electricos_Chile_2026-10-20.xlsx` contiene la misma lista, enlaces, notas y fórmulas editables de costo neto por unidad y venta propuesta. Filtrar o modificar ese Excel no modifica D1: el catálogo de la PWA se administra dentro de la aplicación.

## Materiales por orden de trabajo

Abra la orden y busque **Materiales para ejecutar la orden**. Descargue el PDF o CSV con cantidades, especificaciones, agrupación por título y espacios para registrar entrega, recepción y observaciones. El documento no expone costos ni precios de venta.

El presupuesto aprobado y las solicitudes de terreno se muestran por separado para evitar sumar dos veces una necesidad. La solicitud no demuestra consumo ni entrega física; inventario y ejecución mantienen sus registros propios.

Para llevar el documento a terreno sin internet, abra este apartado una vez con conexión. La copia corresponde a la fecha de consulta que aparece en pantalla. Sincronice las solicitudes locales y actualice el apartado antes de emitir el listado definitivo.

## Solicitar facturas al contador

1. Configure el RUT y datos reales de su empresa y el correo del contador en **Empresa y documentos**.
2. Complete en el cliente RUT, giro, dirección, comuna y ciudad.
3. Emita un documento de cobro en **Cobros**. Abra su detalle y la sección del contador.
4. Revise destinatario, tipo de documento, concepto, neto, IVA, total y observaciones. Prepare el expediente.
5. Descargue PDF, CSV y JSON; abra su correo y adjúntelos, o use el envío directo si el servicio está configurado.
6. Cuando el contador emita el DTE, registre su folio y fecha en el expediente.

El expediente usa el importe del cobro seleccionado. Por ejemplo, un anticipo no vuelve a facturar el total de la cotización. Se admite CLP con IVA 19% o una operación exenta; otros casos deben revisarse con el contador. El sistema prepara un tipo 33 o 34 según el impuesto registrado, pero el contador debe confirmar la procedencia tributaria.

La solicitud y el folio registrado son **controles internos**. No constituyen factura, DTE, timbraje, validación del SII ni certificación de pago. La emisión real se realiza en el SII o en el sistema autorizado que utilice su contador. No se solicitan ni se almacenan sus claves tributarias o certificado digital en la PWA.

Existe una solicitud activa por cobro. Antes de enviarla puede anularla con motivo y preparar otra. Después de un intento aceptado o incierto se bloquea el reenvío automático para evitar duplicados; revise el historial del servicio. La aceptación por el proveedor de correo no confirma entrega o lectura. El folio se registra una vez y se controla su repetición por emisor y tipo de documento.

### Configuración opcional del correo

El envío directo al contador admite Cloudflare Email Service o Resend. Necesita un dominio verificado y un remitente autorizado. Configure todo en el Worker; nunca ponga claves de servicio en el código del navegador.

Para Cloudflare, agregue a su configuración efectiva de despliegue los valores reales:

```json
"send_email": [{ "name": "EMAIL" }],
"vars": { "EMAIL_FROM": "cotizaciones@su-dominio.cl" }
```

Para Resend, configure la variable `EMAIL_FROM` y el secreto `RESEND_API_KEY`. El envío al contador usará este servicio si no existe el binding `EMAIL`. La ruta de envío comercial incorporada en v3.4 conserva su configuración de Cloudflare; esta alternativa Resend se incorpora al expediente contable.

Mantenga las variables y bindings ya existentes al agregar estos campos. Consulte las condiciones vigentes de los servicios antes de activarlos. La entrega no contiene credenciales reales y no se ha enviado ningún mensaje a su contador.

Referencias oficiales:

- https://developers.cloudflare.com/email-service/api/send-emails/workers-api/
- https://resend.com/docs/api-reference/emails/send-email
- https://www.sii.cl/servicios_online/1039-1183.html

## Trabajo sin conexión y sincronización

Abra e inicie sesión con internet por primera vez en cada dispositivo. La PWA guarda sus recursos estáticos, una copia privada del panel y los detalles consultados. Cada usuario tiene su propia cola y sus propias copias de lectura. Cerrar sesión elimina sus copias privadas locales; no borra los documentos de D1/R2.

Sin conexión puede consultar lo previamente cargado y guardar clientes, biblioteca, borradores, cambios operativos de órdenes, actividades, registros de ejecución y nuevas solicitudes de materiales. Una copia local se indica como pendiente hasta que Cloudflare la confirma. Los nuevos PDF de materiales se generan en el dispositivo con los datos disponibles.

Al recuperar conexión, la aplicación intenta sincronizar automáticamente. Mientras está abierta vuelve a comprobar la cola al recuperar el foco y cada 30 segundos. La sincronización con la aplicación cerrada depende de que el navegador admita Background Sync y de que la sesión siga vigente. No se puede garantizar en todos los teléfonos.

El servidor vuelve a validar usuario, permisos, asignación, versión y contenido. Un UUID estable y un comprobante previo al procesamiento impiden ejecutar de nuevo un reintento ya confirmado. Un conflicto o fallo permanente detiene los cambios posteriores para que revise **Revisar cola offline**. Un resultado incierto no se repite a ciegas. No descarte una operación sin comprobar primero qué llegó al servidor.

La cola local no sustituye un respaldo y no es colaboración simultánea sin conexión. Una sesión vencida requiere volver a iniciar sesión con internet. Para fotos, firmas, asignaciones, aprobaciones, inventario, pagos, emisión comercial controlada en R2 y envíos de correo se necesita conexión. No borre los datos del navegador con operaciones pendientes.

## Prueba recomendada después de publicar

1. Compruebe v3.5.0 y el logo; guarde los datos reales de su empresa.
2. Importe dos referencias y compruebe unidades, IVA, costo y recargo.
3. Cree un borrador con listas AC y DC; descargue su solicitud a proveedores.
4. Confirme precios, congele la cotización y emita un PDF nuevo. Revise datos, condiciones y totales.
5. Apruebe y cree una orden; consulte y descargue sus materiales.
6. Emita un cobro y prepare un expediente contable de prueba. No use envío real hasta revisar remitente y destinatario.
7. Abra los apartados que llevará a terreno, desconecte internet, cierre y abra la PWA, guarde un cambio permitido y reconecte. Confirme que desaparezca de la cola y aparezca una sola vez en el servidor.
