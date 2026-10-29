# SOLIS Cotizador v3.8.2 — corrección de parámetros D1

## Qué corrige

La operación Crear revisión copiaba las partidas con un INSERT de múltiples filas. Cada partida aportaba diez parámetros; más de diez partidas superaban los 100 parámetros permitidos por consulta en Cloudflare D1. El guardado inicial de una cotización tenía el mismo patrón. El mensaje visible era `D1_ERROR: too many SQL variables`.

La v3.8.2 cambia ambas escrituras:

- Creación: una matriz JSON enlazada como parámetro alimenta el INSERT con `json_each`, conservando textos, orden y valores numéricos almacenados como texto.
- Revisión: un INSERT SELECT copia las partidas existentes directamente en la base, limitado a la cuenta y cotización de origen.
- Ambas operaciones conservan cabecera y partidas en un mismo batch transaccional, con solo cuatro parámetros en la consulta de partidas, independientemente de su cantidad. No se realizan cientos de llamadas separadas.

Se mantiene el límite funcional existente de 500 partidas comerciales. Las listas internas, títulos, notas, importes, revisiones históricas y el formato PDF v3.8.1 se conservan. No se modifican precios ni datos de producción desde esta entrega.

## Actualizar

1. Respalde el código y la base D1; sincronice los cambios offline pendientes.
2. Descomprima el ZIP y copie su contenido completo a la raíz del repositorio GitHub, conservando sus valores propios de configuración de Cloudflare, bindings y secretos. No cree una carpeta adicional dentro de la raíz.
3. Confirme los cambios en la rama vinculada a Cloudflare y compruebe que el despliegue de ese commit termine correctamente. La versión del paquete es **3.8.2**.
4. Actualice y vuelva a abrir la PWA con conexión; la nueva caché usa `v382`. No borre datos locales con operaciones pendientes.
5. Vuelva a cargar Cotizaciones, compruebe si ya existe la revisión que quería crear y, si no existe, vuelva a pulsar **Crear revisión** una vez.

No necesita borrar la cotización original ni ejecutar migraciones nuevas desde v3.8.1. No se ha desplegado automáticamente ni se han cambiado registros en D1/R2 de producción.

Los archivos esenciales de la corrección son `app/api/quotes/route.ts` y `app/api/quote-flow/route.ts`. El ZIP completo incluye además versión, caché, pruebas y documentación. Puede verificar la integridad con `node scripts/verify-distribution.mjs`.

## Verificación

Se reprodujo el fallo original con el límite de 100 parámetros aplicado al adaptador de pruebas, antes de modificar las rutas. Tras la corrección pasan la creación y revisión de 500 partidas, con conservación de decimales, textos con comillas y apóstrofes, datos internos y aislamiento por cuenta. También se prueba rollback de cabecera y partidas al provocar una falla durante la escritura.

La validación local y sus limitaciones se detallan en VALIDACION_V3_8_2.md. La instalación exacta del lockfile y la ejecución remota final corresponden al entorno habitual de Cloudflare.

Fuentes técnicas: https://developers.cloudflare.com/d1/platform/limits/ y https://orm.drizzle.team/docs/insert (sección Insert into select).
