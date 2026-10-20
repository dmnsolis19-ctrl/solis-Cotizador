# Validación de SOLIS Cotizador v3.5.0

Fecha: 20 de octubre de 2026. Base de trabajo: distribución v3.4 completa. El repositorio remoto se consultó en el commit `e51063d2dcc95a0117d0e69a31cfbfdaccf85f24`. Esta entrega no se ha publicado en GitHub ni Cloudflare.

## Resultado comprobado

- `npm run typecheck`: correcto.
- `npm run lint`: correcto.
- `npm run build`: correcto; rutas nuevas incluidas y 14 recursos en el manifiesto offline generado. Configuración de Worker, D1 y R2 preparada.
- `node --test --test-concurrency=1 --test-reporter=tap tests/*.test.mjs`: **68 pruebas correctas, 0 fallos, 0 omitidas**. El reporte se conserva en `docs/PRUEBAS_V3_5.tap`.
- `git diff --check`: correcto.
- PDF: generación con las funciones reales de la aplicación, apertura con Poppler, extracción con pdfplumber y revisión visual de las páginas renderizadas. Cotización normal A4 de una página; prueba extensa de siete páginas; materiales de orden y solicitud contable de una página. No se detectó texto fuera del área de página.
- Excel: 196 referencias, fuentes y notas por fila, fórmulas recalculadas, comprobación de cambio de un precio y restauración, sin errores de fórmula detectados y revisión visual de la hoja.

Las pruebas nuevas comprueban, entre otros casos:

- Conversión de precio por bolsa/rollo a costo unitario, tratamiento explícito de IVA desconocido, importación por lotes compatible con el límite de parámetros de D1 y conservación de precios propios existentes.
- Configuración de empresa limitada a administrador, conservación de campos anteriores y rechazo de ediciones concurrentes obsoletas.
- Acceso a materiales de órdenes por cuenta y asignación del técnico, sin costos internos en la respuesta.
- Expediente contable por el importe del cobro, anticipo independiente del total de la oferta, una solicitud activa por cobro, control de folios duplicados y de reintentos de correo.
- Reserva de sincronización antes de mutar datos, reintentos idempotentes y rechazo de operaciones originadas en la sesión de otro usuario.
- Escrituras IndexedDB que esperan a confirmar la transacción, conservación de la cola tras fallas de red, conflictos que detienen operaciones dependientes, copias de lectura aisladas y prohibición de usar una copia para eludir un error 403.
- Reapertura de ejecución con cambios locales sin duplicar registros ni exponer costos a técnicos; reapertura del borrador sin confundir partidas manuales y globales.
- PDF con logo y fuentes incrustadas, paginación de alcances extensos y términos completos, exportaciones sin precios internos y protección de CSV frente a fórmulas.

## Entorno y límite de la validación

El registro npm no estuvo accesible desde este entorno. Se usaron paquetes disponibles localmente para compilar y probar. **No es una instalación limpia con las mismas versiones exactas de `package-lock.json`.** Las versiones fijadas en el proyecto se conservaron; el único cambio de versión en los archivos de paquetes es el de la aplicación, de 3.4.0 a 3.5.0.

| Paquete | Fijado en el proyecto | Disponible y usado localmente |
| --- | --- | --- |
| Vinext | 0.0.50 | 1.0.0-beta.5 |
| Vite | 8.3.0 | 8.2.1 |
| Cloudflare Vite plugin | 1.56.0 | 1.53.0 |
| Wrangler | 4.135.0 | 4.124.0 |
| Next.js | 16.3.5 | 16.3.4 |
| React | 19.3.0 | 19.2.8 |
| TypeScript | 5.9.3 | 5.9.3 |

Node local: 24.19.0. Las pruebas API usan SQLite real con las migraciones del proyecto y adaptadores de D1, identidad y correo. No se conectaron a su D1/R2 de producción, a un servicio real de correo ni al SII.

No hubo navegador interactivo disponible para validar visualmente la interfaz o instalar la PWA en un teléfono real. La revisión visual corresponde a los PDF y al Excel. El comportamiento offline se prueba con un adaptador de IndexedDB y respuestas de red controladas; Background Sync con la aplicación cerrada requiere comprobación en el navegador de destino.

Antes de usar esta versión en producción, debe completarse `npm ci` y `npm run check` con las versiones fijadas y el flujo de prueba de `ACTUALIZACION_V3_5.md` en el Worker real. No se afirma que la entrega ya esté desplegada.

## Datos y servicios externos

Los precios son referencias públicas fechadas del 20/10/2026, no un convenio comercial ni precios garantizados. El archivo JSON y el Excel conservan los enlaces de consulta. Las tiendas pueden modificar IVA indicado, stock, presentaciones y variantes. No se implementa rastreo automático de sus sitios.

Los datos de los PDF de muestra son de demostración y no forman una oferta válida. El documento del contador es una solicitud interna, no una factura ni DTE. Registrar un folio no lo valida ante el SII. Los envíos reales requieren configurar un servicio y revisar destinatario; las pruebas no enviaron mensajes.
