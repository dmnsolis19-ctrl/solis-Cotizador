# SOLIS Cotizador PWA

Aplicación empresarial para cotizaciones, órdenes de trabajo, ejecución en terreno, inventario, compras, cobros y rentabilidad. Se ejecuta sobre Cloudflare Workers, usa D1 para datos estructurados y R2 para documentos y evidencias.

## Prerequisites

- Node.js `>=22.13.0`
- Linux with `flock`, `curl`, and GNU `timeout`

## Arquitectura

- Next.js 16, React 19 y Vinext/Vite.
- Cloudflare Workers con bindings `DB` (D1) y `BUCKET` (R2).
- Drizzle ORM y migraciones SQL versionadas en `drizzle/`.
- PWA instalable y cola offline en IndexedDB.
- Autenticación propia con correo y contraseña, PBKDF2-SHA-256, sesiones seguras y bloqueo de intentos.

## Acceso inicial

Cuando D1 no contiene usuarios, `/login` muestra el formulario para crear la primera cuenta administradora. Después de configurarla, solo permite iniciar sesión. Los administradores crean las demás cuentas y sus contraseñas iniciales desde **Usuarios y roles**.

Las contraseñas nunca se guardan en texto visible. Las sesiones vencen a las ocho horas y se almacenan como hashes; la cookie es `HttpOnly`, `Secure` y `SameSite=Strict`.

## Diagnostic Commands

- `npm run install:ci`: perform the one bounded lockfile install
- `npm run dev`: start the Vite/Vinext development server
- `npm run build`: build the deployable Sites artifact
- `npm run start`: start the built Vinext application
- `npm test`: build and verify the rendered development-preview metadata
- `npm run db:generate`: generate Drizzle migrations after schema changes

Use build commands for targeted diagnosis after a remote failure, not as part of the normal checkpoint path.

The timeout defaults can be overridden for a controlled canary with `SITES_INSTALL_TIMEOUT`, `SITES_INSTALL_KILL_AFTER`, `SITES_BUILD_TIMEOUT`, and `SITES_BUILD_KILL_AFTER`. A timeout fails the command; the helpers never retry an unchanged install or build.

## Learn More

- [vinext Documentation](https://github.com/cloudflare/vinext)
- [Drizzle D1 Guide](https://orm.drizzle.team/docs/get-started/d1-new)

## SOLIS Cotizador PWA v3.0

La v3.0 incorpora rentabilidad real por orden, comparación entre costo presupuestado y ejecutado, cierre con requisitos operativos, congelamiento del resultado económico e informe final PDF interno.

## SOLIS Cotizador PWA v3.1

La v3.1 agrega documentos internos de cobro, anticipos y avances, pagos parciales, vencimientos, saldos por proyecto y flujo de caja separado por moneda. Estos documentos no reemplazan los DTE tributarios del SII.

Esta aplicación ejecuta la interfaz y sus rutas API en Cloudflare Workers, conserva los datos estructurados en D1 y guarda documentos, evidencias y firmas en R2. Incluye clientes, biblioteca de precios, cálculo económico, migración `solis.cotizador.v1`, revisiones, aprobación, asignación y ejecución de órdenes.

- Emite cotizaciones comerciales y órdenes de trabajo en PDF.
- Conserva un historial documental versionado con huella SHA-256.
- Administra proveedores y prepara órdenes de compra con costos, descuento, impuesto y aprobación independiente.
- Permite recepciones parciales y valoriza inventario por costo promedio ponderado.
- Carga el costo real a la orden solo cuando el material se entrega al trabajo; las devoluciones lo reversan.
- Emite órdenes de compra PDF internas, versionadas y almacenadas en Cloudflare R2.
- Protege cada descarga mediante identidad, cuenta y permiso del rol.
- Excluye costos internos, utilidad, margen y contingencias del PDF comercial.
- Conserva clientes, ítems, cotizaciones y cambios de órdenes en una cola IndexedDB cuando no hay internet.
- Sincroniza automáticamente al recuperar conexión y permite reintento manual.
- Registra en D1 un comprobante por UUID y huella del contenido para impedir duplicados por reintento.
- Usa cuatro roles: administrador, cotizador, supervisor y técnico.
- Verifica cada permiso en las rutas del servidor; ocultar un botón no es el mecanismo de seguridad.
- Registra usuario, rol, acción, entidad, fecha y detalle de los cambios sensibles en `audit_events`.
- El técnico recibe únicamente órdenes operativas y no recibe costos, márgenes, cotizaciones ni biblioteca de precios.
- Supervisor y administrador asignan cada orden a un técnico o supervisor activo, con prioridad y fecha de compromiso.
- El técnico dispone de **Mis trabajos**, indicadores de vencimiento y avisos internos de nuevas asignaciones.
- La pertenencia de la orden se valida en el servidor al consultar, editar, generar o descargar documentos.
- Las respuestas privadas de las API no se guardan en Cache Storage, evitando mezclar datos entre usuarios del mismo dispositivo.
- Cada orden dispone de checklist obligatorio u opcional, avance, horas, materiales, servicios y gastos reales.
- Supervisor y administrador pueden guardar el checklist de una orden como plantilla reutilizable por categoría; aplicarla siempre crea copias independientes y no altera la plantilla original.
- El técnico puede solicitar materiales directamente desde una actividad, indicando cantidad, unidad, urgencia, fecha requerida y justificación.
- Solicitud, aprobación, rechazo y entrega se mantienen separadas del material realmente consumido y de los costos de ejecución.
- Las solicitudes nuevas pueden quedar en la cola offline; aprobación, rechazo y entrega requieren conexión para evitar decisiones duplicadas.
- Administra múltiples bodegas, existencias físicas, reservas, stock disponible y mínimos de reposición.
- Cada entrada, ajuste, reserva, entrega y devolución genera un movimiento inmutable con usuario, fecha, referencia y saldo anterior/posterior.
- La aprobación de una necesidad no descuenta stock: primero se reserva y solo la entrega física rebaja existencias.
- Cuando el stock es parcial o insuficiente, se crea una solicitud de compra vinculada a la orden, actividad y material original.
- La recepción de una compra incrementa existencias y reserva automáticamente el material pendiente para la orden.
- Los técnicos pueden consultar disponibilidad y trazabilidad de sus órdenes, pero no ajustar inventario ni gestionar compras.
- Actividades y registros operativos pueden quedar en la cola IndexedDB; al recuperar conexión se validan nuevamente la identidad y la asignación.
- Fotografías JPG, PNG o WebP de hasta 8 MB se guardan en R2 y solo son visibles para usuarios autorizados sobre la orden.
- La recepción del cliente conserva nombre, cargo, observación, firma PNG, fecha y usuario que la capturó.
- El PDF operativo puede incorporar una página de ejecución con checklist, horas, registros, evidencias y conformidad vigente.
- Una firma dibujada en pantalla se presenta como aceptación operativa, no como firma electrónica avanzada certificada.
- Si existen actividades obligatorias, la orden no puede marcarse como completada mientras alguna continúe pendiente.
- Los nuevos PDF operativos omiten la venta aprobada; los PDF antiguos se marcan como `legacy` y no pueden descargarse con rol técnico.
- La primera identidad autenticada en una instalación vacía se registra como administrador; los usuarios posteriores deben crearse desde **Usuarios y roles**.

Agregar un usuario a D1 no amplía el acceso privado del Worker. El mismo correo también debe estar autorizado en la política de acceso del sitio. Si un rol se desactiva o una orden se reasigna mientras tiene operaciones offline, el servidor rechazará esas operaciones al sincronizar.

Para trasladarla a una cuenta propia de Cloudflare, consulte [docs/CLOUDFLARE.md](docs/CLOUDFLARE.md).
