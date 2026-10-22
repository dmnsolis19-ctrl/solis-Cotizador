# Validación v3.7.1

Fecha: 22/10/2026. Base: `0f4cdc590ab3d6528be27a6aea748d4730af5d84`, GitHub `dmnsolis19-ctrl/solis-Cotizador`.

Se recuperaron los 282 archivos de la base. Antes de modificarla se comprobó el manifiesto de la distribución v3.7.0: 281 archivos, además del manifiesto mismo. No había instrucciones AGENTS.md en el árbol. Se mantuvieron las carpetas completas.

## Resultado

- Lockfile: coherente, 42 dependencias directas y 887 entradas verificadas. El árbol de dependencias no cambió; solo la versión raíz pasa de 3.7.0 a 3.7.1.
- TypeScript: correcto.
- ESLint: correcto.
- Compilación Vinext/Vite: correcta; recursos offline y configuración generada de Cloudflare preparados. Se conserva un aviso previo sobre tamaño de un chunk del cliente.
- Suite completa: **119 pruebas correctas, 0 fallos, 0 omitidas**. Registro: `PRUEBAS_V3_7_1.tap`.
- `git diff --check`: correcto.
- Integridad de distribución: cada archivo de la entrega tiene tamaño y SHA-256 en `ARCHIVOS_V3_7_1.json`, excepto ese manifiesto. El verificador apunta a la versión nueva.

Las cinco pruebas nuevas ejecutan:

1. Lecturas de archivo que terminan fuera de orden y un segundo archivo inválido: solo quedan las filas del último archivo válido seleccionado; una nueva carga inválida retira la anterior.
2. Vista previa y confirmación separadas, bloqueo síncrono de clics repetidos, estados esperados y resumen del resultado.
3. Filtrado de filas inválidas, bloqueo del guardado y retiro de la confirmación al fallar una nueva validación.
4. Exportación CSV de revisión: número de fila, decimales, costo cero, saltos de línea, separadores y escape de fórmulas.
5. Arranque real de los dos scripts bajo Bash con archivos sin permiso de ejecución. Se usa una envoltura de entorno de prueba y se detiene antes de instalar/compilar para aislar esta regresión.

Los ensayos del componente ejecutan sus manejadores y hooks en memoria. El lector de archivo se simula para controlar el orden de respuestas; las pruebas existentes del importador validan formatos y transacciones. Esto no equivale a interacción con DOM ni a una prueba visual del lector XLSX en un teléfono.

Se mantienen las 114 pruebas anteriores de cotizaciones, copias de conjuntos, importación, permisos por cuenta, sincronización, compras, costos, cobros, materiales, documentos PDF y Metalcon. No se cambió su implementación de negocio para hacer pasar los ensayos.

## Dependencias del entorno

El comando inicial de instalación reveló un error de permisos de arranque: el script se relanzaba como ejecutable pese a estar almacenado con modo 0644. Se corrigió usando Bash explícito. Al ejecutar el cuerpo del instalador, la descarga exacta de Vinext recibió HTTP 403.

Se instaló en un directorio de ensayo separado el conjunto disponible en caché. La entrega conserva el paquete y lockfile de producción, sin sustituir sus versiones por las de ensayo.

| Paquete | Fijado en la entrega | Usado localmente |
| --- | --- | --- |
| Vinext | 0.0.50 | 1.0.0-beta.5 |
| Vite | 8.3.0 | 8.0.13 |
| Cloudflare Vite plugin | 1.56.0 | 1.37.1 |
| Wrangler | 4.135.0 | 4.92.0 |
| Next.js | 16.3.5 | 16.3.4 |
| React / React DOM | 19.3.0 | 19.2.6 |
| TypeScript | 5.9.3 | 5.9.3 |

Node local: 24.19.0. Debe completar `npm ci` y `npm run check` con las versiones exactas en su entorno habitual antes de producción. No se presenta esta ejecución como un build remoto de Cloudflare.

## Límites

- La extensión de navegador no tenía contexto conectado y el navegador de QA rechazó la autorización al sitio local. No se intentó otra superficie para eludir ese rechazo. Revisión visual en 360×800, 768×1024 y escritorio pendiente, incluido teclado móvil y desplazamiento.
- Los estilos nuevos tienen tarjetas bajo el punto de adaptación `md`, tabla desplazable por encima, nombres con salto de línea y botones largos adaptables. Se verificó su compilación, sin mediciones de viewport real.
- No se cambió el generador PDF; no se afirma una nueva comparación visual contra las imágenes antiguas, que no están disponibles en este chat.
- No se consultaron ni actualizaron precios de mercado en esta entrega; se conserva la fuente y fecha de los catálogos existentes.
- No se accedió a D1/R2 de producción, no se enviaron correos y no se realizó un despliegue.
