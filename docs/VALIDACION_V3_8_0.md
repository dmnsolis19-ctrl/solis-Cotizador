# Validación de SOLIS Cotizador v3.8.0

Fecha: 22/10/2026. Base consultada en GitHub: `bfdfc89c2cce36c29f103a54e892ac3d7828b97a`, repositorio `dmnsolis19-ctrl/solis-Cotizador`. Antes de editar, los 292 archivos locales de la base coincidían en Git blob SHA con el árbol remoto; no había archivos AGENTS.md. No se modificó ni publicó el repositorio remoto.

## Controles ejecutados

- TypeScript estricto: correcto.
- ESLint de aplicación: correcto. Se excluye el código externo conservado en vendor; las adaptaciones propias de aplicación sí se comprueban.
- Compilación Vinext/Vite: correcta, cinco etapas; configuración generada de Cloudflare y recursos offline preparados. El chunk lazy del lector QR aparece en `offline-assets.json`.
- Suite completa: **144 pruebas correctas, sin fallos ni omitidas**. Registro de salida: `PRUEBAS_V3_8_0.txt`.
- Lockfile coherente: 42 dependencias directas y 887 entradas verificadas. Solo cambia la versión raíz de 3.7.2 a 3.8.0; el árbol fijado se conserva.
- `git diff --check`: correcto.
- La entrega incluye un manifiesto SHA-256 por archivo y un verificador. No se incluyen node_modules, compilaciones, credenciales, base local ni herramientas de trabajo.

## Evidencia de las nuevas funciones

Las pruebas ejecutan las rutas reales de papelera y recepción con SQLite, las migraciones existentes y una interfaz D1 simulada con límite de 100 parámetros y batch transaccional. Verifican borrado recuperable, conservación de partidas y campos adicionales, bloqueo de documentos vinculados, cotizaciones congeladas, aislamiento entre cuentas, permisos, RUT duplicado y rechazo de revisiones obsoletas.

En inventario se prueban costo promedio, conservación de reservas/mínimos, monedas y materiales válidos, reintento con el mismo identificador, peticiones concurrentes con identificadores iguales y distintos, y rollback ante un fallo deliberado del saldo. El resultado es una sola recepción por identificador.

Las pruebas de componentes ejecutan manejadores y hooks en memoria: filtros persistentes, historial explícito, eliminación limitada a borradores, contacto enlazado por ID, texto editable sin enviar mensajes, ausencia de importes comerciales para técnicos, lote offline persistente, bloqueo de doble clic, recuperación tras respuesta perdida y el nombre exacto del control de revisión en la confirmación/restauración de papelera.

El generador QR se rasteriza y se decodifica con el lector real, incluyendo Unicode. Se verifican checksum Code 128, resolución inequívoca de materiales, escape HTML y ausencia de precios en etiquetas. También se importó y ejecutó el chunk QR ya compilado para decodificar una etiqueta generada, sin navegador ni cámara. Las pruebas anteriores del PDF, cotizaciones, sincronización, compras, costos y cobros se mantienen.

## Alcance y límites

- No se realizó QA visual con DOM/navegador ni cámara física. La autorización del navegador de QA al sitio local se había rechazado; no se intentó eludir esa decisión con otra superficie. Quedan pendientes teléfono/tablet reales, teclado, permiso de cámara, enfoque y etiquetas impresas.
- Las tarjetas y controles adaptables compilan y sus manejadores se prueban; no se afirma medición visual en todos los anchos.
- Las recepciones físicas y la papelera requieren conexión. El lote puede prepararse offline, pero no se confirma automáticamente al reconectar.
- Sin instalación limpia exacta de producción: este entorno no pudo descargar los paquetes fijados por restricciones de red. Se usó el conjunto disponible en caché descrito abajo. El build remoto de Cloudflare y `npm ci` con el lockfile exacto quedan pendientes en el entorno habitual.
- No se accedió a D1/R2 de producción, no se enviaron mensajes reales, no se modificaron precios de mercado ni se cambió el generador PDF v3.7.2. Los expedientes para contador y documentos internos conservan su alcance previo; esta versión no incorpora emisión fiscal automática ante el SII.

| Dependencia | Fijada en entrega | Usada localmente |
| --- | --- | --- |
| Vinext | 0.0.50 | 1.0.0-beta.5 |
| Vite | 8.3.0 | 8.0.13 |
| Cloudflare Vite plugin | 1.56.0 | 1.37.1 |
| Wrangler | 4.135.0 | 4.92.0 |
| Next.js | 16.3.5 | 16.3.4 |
| React / React DOM | 19.3.0 | 19.2.6 |
| TypeScript | 5.9.3 | 5.9.3 |

Consulte ACTUALIZACION_V3_8_0.md para uso, actualización y comprobaciones en el entorno de producción. El paso a producción sigue bajo control del propietario.
