# Actualización SOLIS Cotizador v3.4

Base: repositorio `dmnsolis19-ctrl/solis-Cotizador`, commit `60d71e4ea3c9440d9bd98bcb6d73176290ba952c`.

## Actualizar desde v3.3

1. Conserve una copia de su proyecto y un respaldo de D1. Mantenga su configuración de Cloudflare y sus secretos de entorno.
2. Incorpore los archivos de esta distribución en una rama de su repositorio. También puede aplicar el parche incluido a la versión base con `git apply --check` y después `git apply`.
3. Ejecute `npm ci`, `npm run typecheck`, `npm run lint` y `npm test` en su entorno con acceso al registro de paquetes. El archivo de dependencias mantiene las versiones originales; solo cambia la versión de la aplicación.
4. Publique mediante su integración de GitHub con Cloudflare, o utilice `scripts/deploy-cloudflare.ps1` en Windows como indica `docs/CLOUDFLARE.md`.
5. Actualice la PWA y compruebe el flujo con una cotización de prueba antes de usarla con clientes.

No hay migraciones nuevas en v3.4. Las listas se guardan en `quotes.payload_json` y los globales calculados en `quote_items`. Los borradores anteriores siguen siendo editables. Las copias offline usan las operaciones de sincronización existentes y se vuelven a validar en el servidor.

## Preparar una cotización

1. Cree o edite una cotización en borrador.
2. Agregue sus partidas normales, por ejemplo mano de obra, programación, puesta en marcha o traslados.
3. En **Listas de materiales y partidas globales**, pulse **Nueva lista**, o seleccione una estructura por especialidad y pulse **Agregar estructura**.
4. Complete el título interno y el título que verá el cliente. Las estructuras incluyen un material inicial que debe reemplazarse o completarse; no son dimensionamientos técnicos.
5. Agregue materiales manualmente o desde la biblioteca de la misma moneda. Complete descripción, cantidad, unidad y costo neto. En el desplegable de detalle puede registrar especificación, marca/modelo, proveedor y fecha del precio.
6. Seleccione el cálculo del precio comercial del grupo:
   - **Igual al costo:** suma de los costos de materiales.
   - **Costo + recargo:** costo multiplicado por `1 + recargo / 100`.
   - **Margen sobre venta:** incorpora gastos generales, contingencia y descuento global para alcanzar el margen del grupo. Recargo y margen tienen fórmulas distintas.
   - **Precio manual:** venta neta del grupo antes del descuento global e IVA.
7. Guarde el borrador. Cada lista genera una sola partida comercial de cantidad 1 y unidad `gl`. No agregue otra partida manual para cobrar el mismo suministro.

Puede guardar precios por confirmar para solicitar cotizaciones. Un valor cero confirmado representa un costo cero deliberado; un valor pendiente representa información aún sin confirmar. Modificar el costo de un material vuelve a dejarlo pendiente. Confirme todos los precios antes de congelar la oferta.

El margen automático se refiere al grupo y considera los porcentajes generales vigentes; las partidas manuales pueden hacer que el margen de toda la oferta difiera. El recargo se aplica al costo directo y puede no cubrir gastos generales si se fija muy bajo.

## Solicitar precios a proveedores

1. Abra **Flujo comercial** de la cotización guardada. No necesita aprobarla ni crear una orden de trabajo.
2. En **Solicitar precios a proveedores**, seleccione las listas que enviará.
3. Elija si desea consolidar artículos. Solo se agrupan coincidencias exactas de código, descripción, especificación, marca/modelo y unidad; se conservan los títulos de origen.
4. Descargue el PDF o el CSV para Excel. El CSV usa separador de punto y coma y codificación UTF-8 con BOM; incluye columnas vacías para precio del proveedor, plazo y observaciones.
5. Ingrese el correo o teléfono del proveedor y prepare el mensaje. Adjunte el archivo antes de enviarlo, o prepare el PDF y use **Compartir PDF** si el dispositivo lo permite.
6. Registre las respuestas actualizando los costos del borrador y confirmando sus precios. El comparador de múltiples ofertas de proveedores queda para una siguiente actualización.

Estos archivos no contienen costo interno, precio de venta, margen ni contactos de sus proveedores de referencia. La solicitud no constituye una orden de compra. Los archivos corresponden a los datos guardados de la revisión seleccionada; guarde los cambios antes de exportarlos.

## Compartir una cotización con el cliente

Congele la revisión, genere el PDF comercial y pulse el botón **Compartir** junto a ese archivo. Revise destinatario, teléfono, asunto y mensaje. Puede descargar el PDF, usar la función de compartir del dispositivo, abrir WhatsApp o preparar un correo.

Abrir WhatsApp o el cliente de correo no adjunta automáticamente el PDF y no confirma el envío. La función nativa de compartir depende del navegador y del sistema operativo. Los enlaces privados `/api/documents/...` requieren sesión y no se envían al cliente.

Las revisiones anteriores mantienen sus listas y precios. Para cambiar una oferta congelada, cree una revisión y edite su borrador.

## Activar el envío directo de correo con PDF

Esta función es opcional. Requiere tener habilitado Cloudflare Email Sending, el dominio de correo configurado y un remitente autorizado. Según la documentación consultada el 20 de octubre de 2026, Email Sending está en beta y el envío a destinatarios arbitrarios requiere Workers Paid. Compruebe disponibilidad y condiciones en su cuenta.

En `wrangler.production.jsonc`, agregue a nivel raíz y con los datos reales de su empresa:

```json
"send_email": [{ "name": "EMAIL" }],
"vars": { "EMAIL_FROM": "cotizaciones@su-dominio.cl" }
```

No copie el ejemplo literalmente si no controla ese remitente. El script `prepare-cloudflare-deploy.mjs` conserva estos campos al preparar la configuración generada. Para un flujo de despliegue diferente, mantenga también el binding `EMAIL` y la variable `EMAIL_FROM` en la configuración efectiva del Worker. No requiere claves secretas dentro del navegador.

Cuando la función esté configurada, el diálogo de compartir mostrará **Enviar correo con PDF**. Revise los datos y marque la autorización del envío. Solo se acepta el PDF comercial de una revisión congelada. Los documentos internos de costos y cierres no pueden enviarse por esta ruta.

El sistema reserva un identificador antes de llamar al servicio y evita reenviar el mismo intento. Un resultado aceptado indica aceptación por el servicio, no entrega final ni lectura. Si el resultado es incierto, revise los registros de Cloudflare antes de crear otro envío. Hay un límite de diez reservas de envío por minuto y cuenta. Los adjuntos se limitan a 3 MiB para dejar espacio dentro del límite total del servicio.

Referencias oficiales:

- https://developers.cloudflare.com/email-service/
- https://developers.cloudflare.com/email-service/api/send-emails/workers-api/
- https://developers.cloudflare.com/email-service/get-started/send-emails/
- https://faq.whatsapp.com/5913398998672934/

## Alcance de esta actualización

Incluye listas/globales, exportación de solicitud de precios, estructuras por especialidad y compartir/enviar PDFs comerciales. No incorpora WhatsApp Business API, enlaces públicos de aceptación ni comparación automática de ofertas de proveedores. Tampoco publica por sí misma cambios en GitHub o Cloudflare.

Se recomienda probar un flujo completo: borrador con dos listas, solicitud al proveedor, actualización de costos, confirmación de precios, congelamiento, PDF comercial, revisión y edición de la nueva versión.
