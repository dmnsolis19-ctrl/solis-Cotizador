# Despliegue en Cloudflare

SOLIS Cotizador debe ejecutarse como un **Cloudflare Worker** con una base **D1** y un bucket **R2**. No debe publicarse como HTML estático: las rutas `/api/*`, la identidad y la persistencia requieren Worker.

## Recursos requeridos

1. Una cuenta de Cloudflare.
2. Node.js 22.13 o superior.
3. Wrangler autenticado.
4. Una base D1 con binding lógico `DB`.
5. Un bucket R2 con binding lógico `BUCKET`.
6. Un Worker para la aplicación.

## Secuencia recomendada

```bash
npx wrangler login
npx wrangler d1 create solis-cotizador-db
npx wrangler r2 bucket create solis-cotizador-documents
```

Copie el `database_id` retornado a la configuración Wrangler de la cuenta de destino. El binding debe llamarse exactamente `DB`.

Antes de la primera publicación, aplique las migraciones en orden:

```bash
npx wrangler d1 migrations apply solis-cotizador-db --remote
```

Vinext recomienda desplegar su adaptación Cloudflare con:

```bash
npx @vinext/cloudflare deploy
```

El dominio personalizado se asocia después al Worker desde **Workers & Pages → Custom domains**. Mantenga D1, R2 y el Worker en la misma cuenta. No exponga el bucket públicamente: las descargas pasan por `/api/documents/:publicId`, donde se valida el propietario autenticado.

## Modelo documental

La tabla `document_snapshots` conserva versión, propietario, entidad de origen, nombre, tamaño y SHA-256. R2 conserva los bytes del PDF. Cada nueva emisión crea otra versión y no sobrescribe archivos anteriores.

## Sincronización offline

El dispositivo guarda temporalmente las operaciones pendientes en IndexedDB. Cuando regresa la conexión, `/api/sync` procesa clientes, ítems de biblioteca, cotizaciones y actualizaciones de órdenes. La tabla `sync_receipts` conserva el UUID de operación, tipo, propietario, huella del contenido y resultado. Un reintento con el mismo UUID y contenido devuelve el resultado anterior; reutilizar el UUID con otros datos se rechaza.

La cola del dispositivo no sustituye a D1: solo es un almacenamiento transitorio hasta que Cloudflare confirma la operación. Antes de borrar datos del navegador o desinstalar la PWA, compruebe que el contador de pendientes sea cero.

Por seguridad multiusuario, el service worker no guarda respuestas de `/api/*` en Cache Storage. La asignación, los avisos y los permisos siempre se vuelven a consultar en D1. Una actualización operativa ya abierta puede quedar en la cola offline, pero asignar o reasignar responsables requiere conexión.

En v2.8, la creación y actualización de actividades, los registros de horas y materiales y las nuevas solicitudes de abastecimiento utilizan la misma cola offline con comprobantes idempotentes. Las reservas, entradas, entregas, devoluciones, compras, aplicación de plantillas, fotografías y firmas requieren conexión y solo se consideran guardadas después de la confirmación del servidor. Esta restricción evita que dos dispositivos modifiquen el mismo saldo físico sin validación central.

## Identidad, roles y auditoría

La PWA usa la identidad autenticada enviada por la plataforma en `oai-authenticated-user-email`. No mantiene contraseñas propias. La tabla `app_users` vincula ese correo con la cuenta SOLIS y uno de cuatro roles:

- **Administrador:** configuración completa, usuarios, importaciones y auditoría.
- **Cotizador:** clientes, biblioteca, cotizaciones, revisiones y PDF comercial; no aprueba.
- **Supervisor:** operación comercial, aprobación, asignación de órdenes, documentos y auditoría; no administra usuarios.
- **Técnico:** consulta y actualización exclusivamente de sus órdenes asignadas, además del PDF operativo; no recibe información económica interna.

Las notificaciones de v2.5 son internas: se muestran en la campana de la PWA cuando una orden se asigna o reasigna. No son correos ni notificaciones push. La tabla `user_notifications` conserva destinatario, entidad, fecha y estado de lectura.

## Ejecución en terreno

`work_order_activities` y `work_order_costs` conservan el checklist y los movimientos reales. `work_order_evidence` y `work_order_signoffs` guardan solamente metadatos; las imágenes permanecen privadas en R2 y se entregan mediante rutas que vuelven a validar rol, cuenta y asignación.

La conformidad dibujada en la PWA es una aceptación operativa trazable. No debe describirse como firma electrónica avanzada ni sustituye requisitos contractuales que exijan un proveedor de firma certificado.

Los PDF de órdenes creados desde v2.4 usan el perfil `operational_v2` y omiten la venta aprobada. Los documentos anteriores conservan el perfil `legacy`: administradores y supervisores pueden descargarlos, pero el rol técnico debe generar una nueva versión operativa para evitar exponer información comercial histórica.

La política de acceso de Cloudflare/Sites y `app_users` son dos controles distintos: el primero permite entrar al Worker y el segundo determina qué puede hacer la persona dentro de la aplicación. El correo debe estar autorizado en ambos. Todas las operaciones sensibles se atribuyen a la identidad del servidor y se conservan en `audit_events`; no se acepta como identidad un nombre escrito por el navegador.

## Reglas de operación

- No modifique migraciones ya aplicadas.
- Respalde D1 antes de migraciones importantes o importaciones masivas.
- No exponga costos internos en documentos públicos.
- Use secretos de Cloudflare para futuras credenciales.
- `solis.cotizador.v1` es un mecanismo de migración, no de sincronización bidireccional.

Referencias oficiales:

- https://developers.cloudflare.com/workers/wrangler/configuration/
- https://developers.cloudflare.com/d1/
- https://developers.cloudflare.com/r2/
- https://github.com/cloudflare/vinext
