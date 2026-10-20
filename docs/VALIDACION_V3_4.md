# Validación de SOLIS Cotizador v3.4

Fecha: 20 de octubre de 2026.

## Resultados

- `npm run check`: finalizó con código 0. Incluye comprobación TypeScript estricta, ESLint, compilación Vinext/Cloudflare y las 55 pruebas automatizadas.
- Integración de rutas con SQLite en memoria y las migraciones originales: creación/edición de listas, recálculo de globales, reapertura sin duplicación, rechazo de ediciones concurrentes, bloqueo por precios pendientes, revisiones independientes, aislamiento entre cuentas y autorización.
- Exportación: CSV sin costos y protección frente a fórmulas; selección de listas válida; PDF multipágina con especificaciones completas y sin costos.
- Correo: configuración obligatoria, documento comercial controlado, rechazo de perfiles internos y un solo envío para reintentos del mismo identificador. El servicio de correo se simuló; no se enviaron correos reales.
- Render del editor mediante React en servidor y revisión visual del PDF de muestra.
- Después del control completo se ajustó la preparación de PDF para descartar archivos preparados con una selección anterior de listas y se simplificó el adaptador SQLite de las pruebas para evitar métodos de versiones recientes de Node. Se repitieron tipos, lint de los archivos afectados y las pruebas de integración.

## Condiciones del entorno

El registro de paquetes rechazó la descarga de la instalación exacta con HTTP 403. Se utilizó una instalación local de validación reconstruida desde la caché disponible. Varias versiones difieren del archivo de dependencias del proyecto, entre ellas:

| Componente | Proyecto | Validación local |
|---|---|---|
| Vinext | 0.0.50 | 1.0.0-beta.5 |
| Next.js | 16.3.5 | 16.3.4 |
| React | 19.3.0 | 19.2.8 |
| Vite | 8.3.0 | 8.2.1 |
| Wrangler | 4.135.0 | 4.124.0 |

No se incorporó esa instalación de caché a la distribución ni se cambiaron las dependencias declaradas. `package-lock.json` solo cambia la versión de la aplicación a 3.4.0. Antes de publicar, debe repetirse `npm ci` y `npm run check` en el entorno normal con las versiones exactas del proyecto.

No se validó una instancia desplegada en Cloudflare. El entorno no dispone del ejecutable Chromium para pruebas interactivas de escritorio/móvil; no se afirma una prueba visual en navegador real. No se hicieron cambios remotos en GitHub ni en Cloudflare.
