# SOLIS Cotizador v3.6.3 — corrección de instalación en Cloudflare

Esta entrega completa corrige el error `EUSAGE` de `npm ci` reportado por Cloudflare el 20/10/2026 a las 21:25, hora de Chile (21/10 a las 00:25 UTC). No se publicó ni desplegó automáticamente.

## Causa y corrección

`package.json` y la declaración raíz del lockfile exigían `tailwind-merge` **3.6.0**, pero la entrada instalada del lockfile decía **3.6.1**. Esa misma entrada ya apuntaba al archivo `tailwind-merge-3.6.0.tgz`. npm detectaba la diferencia y detenía la instalación antes de compilar.

Se corrigió únicamente el metadato de esa entrada a **3.6.0**. Se mantuvieron su URL de descarga y su integridad. Se verificaron además la huella SHA-512 y la versión interna del tarball 3.6.0 disponible en caché. No se actualizaron otras dependencias ni se regeneró el árbol con versiones distintas.

El desajuste estaba tanto en GitHub como en el ZIP v3.6.2. Las pruebas anteriores usaban dependencias instaladas en caché y no habían comprobado la coherencia completa de este lockfile. Esa validación fue insuficiente para detectar este bloqueo de instalación.

## Protección añadida

`npm run check:lockfile` ejecuta `scripts/verify-dependency-lock.mjs`. Comprueba los datos raíz, las declaraciones de dependencias, las versiones fijadas y la coherencia entre las versiones registradas y los nombres de sus tarballs de npm. No necesita instalar paquetes.

El instalador `npm run install:ci`, la compilación `npm run build` y la verificación `npm run check` ejecutan esta comprobación. Hay cuatro pruebas de regresión que incluyen el desajuste exacto informado por Cloudflare. La resolución completa de rangos y dependencias pares sigue a cargo de npm.

## Actualización manual

1. Guarde sus cambios y conserve una copia del proyecto actual.
2. Descomprima `SOLIS_Cotizador_v3.6.3_completo.zip` y suba **todo el contenido de `solis-Cotizador/`** a la raíz del repositorio, incluidas las carpetas. Asegúrese especialmente de reemplazar **ambos archivos** `package.json` y `package-lock.json` en la misma subida.
3. Conserve sus secretos, bindings e identificadores de Cloudflare. Esta corrección no cambia D1, R2, permisos ni datos existentes. Sobre v3.6 no hay una migración nueva; desde v3.5 sigue correspondiendo `0015_little_war_machine.sql`, según la guía v3.6.
4. Puede verificar los metadatos con `node scripts/verify-dependency-lock.mjs` y el proyecto completo con `node scripts/verify-distribution.mjs`.
5. En Cloudflare, repita el build usando el commit que contenga la subida completa. Puede mantener la instalación automática mediante `npm ci`/`npm clean-install`; no hace falta cambiar a `npm install` ni omitir el lockfile.
6. Si el registro vuelve a mostrar exactamente `lock file's tailwind-merge@3.6.1`, compruebe que está compilando el commit actualizado y que la raíz del proyecto contiene el lockfile nuevo. Esa versión ya no figura en la entrada de esta entrega.
7. Después de actualizar y desplegar por su procedimiento habitual, compruebe **v3.6.3** en la aplicación. El caché estático cambia a `v363`; se conserva IndexedDB. No borre los datos del navegador con operaciones pendientes de sincronizar.

Se mantienen las correcciones de cotizaciones que se borran, los PDF con texto completo y la edición numérica de v3.6.2. Consulte su guía para los detalles funcionales.

## Validación

- Comprobador de dependencias: **42 dependencias directas y 887 entradas bloqueadas**, sin incoherencias detectadas.
- `npm ci --dry-run --offline --ignore-scripts --no-audit --no-fund`: **correcto**, en una carpeta limpia con los dos archivos nuevos y sin `node_modules`. npm 11.9.0, Node 24.19.0. La simulación nativa verifica la resolución/coherencia sin descargar ni instalar los paquetes; no se presenta como una instalación completa.
- `npm run typecheck`, `npm run lint` y `npm run build`: correctos.
- Suite completa: **104 pruebas correctas, 0 fallos, 0 omitidas**. Registro `PRUEBAS_V3_6_3.tap`.
- Comparación con v3.6.2: el lockfile solo cambia la versión de la aplicación y el metadato erróneo de `tailwind-merge`. No se cambiaron URLs ni integridades.
- `git diff --check` correcto. ZIP completo y huellas de todas sus entradas verificados. Manifiesto actual `ARCHIVOS_V3_6_3.json`.

Resumen reproducible de dependencias: `DEPENDENCIAS_V3_6_3.json`.

**Límite:** no se ejecutó un build remoto de Cloudflare ni una instalación limpia completa con todas las versiones exactas del lockfile. El acceso al registro npm está restringido en este entorno. Tipos, lint, compilación y pruebas usaron las dependencias disponibles descritas en `ACTUALIZACION_V3_6_2.md`, donde también consta la prueba interactiva pendiente en navegador/teléfono/tablet. Esta entrega no cambia la interfaz ni los generadores de PDF, por lo que se conserva la revisión PDF de v3.6.2.
