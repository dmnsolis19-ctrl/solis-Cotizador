# Validación v3.8.2

Fecha operacional: 28/10/2026 (America/Santiago). Base recuperada del ZIP completo v3.8.1 entregado al propietario. Los 320 archivos del manifiesto anterior se verificaron correctamente; incluyendo el manifiesto, la base contiene 321 archivos. La versión actual del package.json en GitHub es 3.8.1 y el archivo quote-flow coincide en Git blob SHA con la base recuperada (`e892167b10e297624573027d9317109e86c5ffd7`). No se afirma una comparación nueva de todo el árbol remoto.

## Diagnóstico y corrección

Se reprodujeron dos fallos antes de editar: creación con 500 partidas y revisión de 500 partidas existentes, ambos con el error `D1_ERROR: too many SQL variables`. El adaptador de pruebas ejecuta las migraciones reales en SQLite y rechaza cualquier consulta con más de 100 valores enlazados.

La creación pasa a INSERT SELECT desde una matriz JSON enlazada. La revisión usa INSERT SELECT desde las partidas de la cotización y cuenta originales. Las dos consultas de partidas requieren cuatro valores enlazados cada una y siguen dentro del batch transaccional que inserta la cabecera. No se cambia el límite de 500 partidas ni se fragmenta la operación en transacciones independientes.

Las tres pruebas nuevas verifican creación/replay de 500 líneas con comillas, apóstrofes y decimales; revisión de 500 líneas con campos completos, listas y exclusión de datos de otra cuenta; y rollback de ambas rutas cuando una escritura de partidas falla deliberadamente. Se conserva la versión de origen congelada y la nueva nace como borrador.

## Controles

- TypeScript estricto: correcto.
- ESLint: correcto, sin advertencias de aplicación.
- Compilación Vinext/Vite: correcta; recursos offline y configuración de Cloudflare generados. Se mantiene el aviso previo de tamaño de un chunk de cliente.
- Suite completa: 149 pruebas correctas, sin fallos ni omitidas. Salida en PRUEBAS_V3_8_2.txt.
- Lockfile coherente: 42 dependencias directas y 887 entradas verificadas. Solo cambia la versión raíz a 3.8.2; no se añadieron paquetes.
- El ZIP completo conserva los 321 archivos de la base y agrega documentación/manifiesto de la corrección. El propio manifiesto nuevo se excluye de sus huellas.

## Alcance del entorno

La instalación limpia exacta del lockfile no pudo completarse: el intento normal de descargar Vinext recibió HTTP 403. Se usó el conjunto disponible en la caché local, sin modificar las versiones de producción: Vinext 1.0.0-beta.5, Vite 8.0.13, Cloudflare Vite plugin 1.37.1, Wrangler 4.92.0, Next 16.3.4, React/React DOM 19.2.6 y TypeScript 5.9.3. Las versiones fijadas siguen siendo las documentadas en VALIDACION_V3_8_1.md.

Las pruebas reproducen consultas, parámetros y transacciones mediante SQLite y un adaptador D1; no equivalen a una ejecución contra la base de producción de Cloudflare. La instalación exacta y el despliegue remoto deben verificarse en el entorno habitual. No se accedió a D1/R2 reales, no se enviaron mensajes, no se cambió el PDF y no se desplegó ni hizo push desde esta sesión. No se realizó una prueba de navegador para este arreglo del servidor.
