# SOLIS Cotizador v3.6.1: corrección del formulario de cotización

Base: v3.6.0 completa, coincidente con `main` de GitHub en el commit `558c4c0011a4c954c94813ab37127b9d25fd2c01`, consultado el 20/10/2026. No se publicó ni desplegó automáticamente.

## Problema corregido

Al crear una cotización, las actualizaciones del componente principal podían volver a ejecutar el efecto que inicializaba el formulario. Como ese efecto dependía de objetos de configuración y de una función que se recreaba al renderizar, se vaciaban cliente, proyecto, partidas y condiciones comerciales. En edición, el mismo efecto podía volver a cargar el borrador y reemplazar lo escrito sin guardar. La clave del diálogo también dependía del descuento, lo que podía provocar un desmontaje al cambiar esa configuración.

Ahora el editor se monta al abrir la ventana. Una nueva cotización toma la configuración existente en ese momento; las actualizaciones de fondo no la reinician. El borrador se carga por su identificador y la función de apertura/cierre es estable. La clave depende de usuario y cotización, no de precios o descuentos. Los pedidos de carga se cancelan al cerrar para que una respuesta tardía no afecte otro formulario.

Cerrar o cancelar una cotización nueva sigue descartando el formulario sin guardar. Esta corrección evita los reinicios involuntarios durante la edición; no agrega autoguardado de un formulario no confirmado.

## Actualización manual

1. Guarde/sincronice los cambios pendientes y haga una copia del proyecto actual.
2. Descomprima `SOLIS_Cotizador_v3.6.1_completo.zip` y suba el contenido completo de `solis-Cotizador/` a la raíz del repositorio, incluidas sus carpetas.
3. Conserve sus bindings, secretos y datos de Cloudflare. No se modificaron D1, R2 ni permisos.
4. **Sobre v3.6.0 no necesita una migración nueva.** Si viene de v3.5, sigue siendo necesaria la migración `0015_little_war_machine.sql` de v3.6, según la guía anterior.
5. El verificador `node scripts/verify-distribution.mjs` ahora usa `docs/ARCHIVOS_V3_6_1.json`. Revise por separado diferencias de configuración que haya conservado deliberadamente.
6. Compile/verifique en su entorno con las dependencias fijadas. El despliegue lo realiza usted mediante su procedimiento habitual.
7. Después de actualizar la aplicación, recargue y compruebe que la interfaz muestre **v3.6.1**. Se cambia la versión del caché PWA sin borrar IndexedDB ni la cola offline. No borre datos del navegador para forzar la actualización si tiene operaciones pendientes.

Prueba de uso: cree una cotización, seleccione cliente, escriba proyecto, agregue un material y cambie sus cantidades; espere al menos un minuto y alterne entre pestañas. Los datos deben conservarse. Repita con un borrador existente y guarde al terminar. Abra una cotización nueva después de cerrar la anterior para comprobar que comienza con campos nuevos.

## Validación realizada

- Se reprodujo el problema ejecutando **el componente real** y sus manejadores con un controlador de hooks en memoria: antes del arreglo desaparecía el proyecto y se recargaba el borrador.
- Cuatro pruebas de regresión cubren cotización nueva con cliente/proyecto/material y actualizaciones repetidas; edición de borrador sin recargar cambios locales; nueva apertura con ajustes vigentes y cancelación de cargas tardías; montaje y clave estables del diálogo.
- `npm run typecheck`, `npm run lint` y `npm run build`: correctos.
- Suite completa: **88 pruebas correctas, 0 fallos, 0 omitidas**. Registro `docs/PRUEBAS_V3_6_1.tap`.
- `git diff --check`: correcto. ZIP completo verificado por tamaño, integridad del archivo y SHA-256 de sus entradas.

Las pruebas se ejecutaron con las dependencias disponibles en caché del entorno anterior: Vinext 1.0.0-beta.5, Vite 8.0.13, Cloudflare Vite plugin 1.37.1, Wrangler 4.92.0, Next.js 16.3.4, React 19.2.6 y TypeScript 5.9.3, en Node 24.19.0. Se conservaron las versiones fijadas del proyecto y su lockfile, cambiando solo la versión de la aplicación. La instalación limpia exacta sigue pendiente por la restricción de acceso al registro npm documentada en `VALIDACION_V3_6.md`.

No se realizó una prueba interactiva en navegador; el acceso de QA fue rechazado anteriormente y no se intentó eludirlo. El controlador de hooks prueba la vida del estado y los efectos del diálogo, no el teclado o la presentación visual de un navegador real. No se accedió a D1/R2 de producción.
