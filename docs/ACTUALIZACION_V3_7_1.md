# SOLIS Cotizador v3.7.1 — importación de precios

Entrega completa basada en GitHub `dmnsolis19-ctrl/solis-Cotizador`, commit `0f4cdc590ab3d6528be27a6aea748d4730af5d84`. Fecha de preparación: 22/10/2026. No se subió código ni se desplegó en Cloudflare.

## Cambios de esta entrega

- Vista previa con tarjetas en teléfono y tabla desplazable en pantallas amplias.
- Filtro de filas inválidas y descarga del informe de revisión CSV, con fila original, código, resultado, costo/venta netos, moneda y observaciones. El informe es para revisar; para reimportar debe corregir el archivo original de 14 columnas.
- Nombre y cantidad de filas del archivo cargado visibles; errores persistentes en pantalla. Las filas se mantienen sin importar hasta confirmar.
- Lecturas de archivo protegidas contra resultados fuera de orden. Si vuelve a elegir un archivo inválido, se retira la carga anterior. Puede volver a seleccionar el mismo archivo una vez corregido.
- Bloqueo de clics repetidos mientras se envía una solicitud. Una validación fallida retira la confirmación anterior.
- Botones largos con texto adaptable, incluido el de confirmar cambios.
- Corrección del arranque de instalación/compilación: los scripts se ejecutan explícitamente con Bash y no dependen de conservar permisos de ejecución al copiar/subir archivos.
- Versión visible 3.7.1 y renovación del caché de recursos de la PWA. Se conserva IndexedDB y la cola pendiente.

No se modificaron los datos de precios, su fecha de consulta, el generador PDF, las rutas de negocio ni las migraciones. Permanecen los módulos de v3.7.0: referencias eléctricas y Metalcon, mano de obra, importación Excel/CSV, conjuntos, comparación de proveedores, cotizaciones, OT, compras, expediente al contador y funciones offline. Las referencias con fuente/fecha siguen siendo orientativas; Metalcon requiere precios propios. No hay emisión directa de facturas SII.

## Actualizar GitHub y Cloudflare

1. Sincronice primero los cambios pendientes en cada dispositivo. Guarde una copia del proyecto anterior y un respaldo de sus datos por el procedimiento que utiliza actualmente.
2. Descomprima `SOLIS_Cotizador_v3.7.1_completo.zip`. Abra `solis-Cotizador/`: esta es la raíz del proyecto, donde están `package.json`, `app/`, `components/`, `lib/`, `data/`, `drizzle/`, `public/`, `scripts/` y las demás carpetas.
3. Copie **todo el contenido** sobre su proyecto. No suba el ZIP como único archivo ni cree una carpeta adicional dentro del repositorio. Subir solo `package.json` o solo `app/` reproduce el error de dependencias locales ausentes.
4. Conserve sus secretos, variables, bindings e identificadores existentes de Cloudflare. Revise `wrangler.production.jsonc` si ha cambiado su configuración desde la última subida. Este archivo conserva los valores de la base de GitHub.
5. Para revisar que tiene todas las carpetas, ejecute desde la raíz:

   ```bash
   node scripts/verify-dependency-lock.mjs
   node scripts/verify-distribution.mjs
   ```

   Si conserva configuraciones propias, el segundo comando señalará esas diferencias: revíselas expresamente.

6. Suba los archivos a GitHub por su procedimiento habitual. Con GitHub Desktop, copie sobre la carpeta del repositorio, revise los cambios, cree un commit y haga Push. Si utiliza la web de GitHub, compruebe que cada carpeta haya quedado en su ubicación correcta. Si realiza varias subidas, espere a que el repositorio esté completo antes de evaluar el despliegue final.
7. Si su integración GitHub–Cloudflare tiene despliegues automáticos activos, esa subida puede iniciarlos. Esta entrega no modificó la integración. Revise que el despliegue use el commit final y termine correctamente; el comando de compilación sigue siendo `npm run build`.
8. Abra la plataforma y compruebe **v3.7.1**. Espere a que termine la sincronización y vuelva a abrir la PWA para cargar los recursos nuevos. No borre los datos del navegador si hay operaciones pendientes.

No hay migraciones nuevas desde v3.7.0 ni v3.6. Si viene desde v3.5 o anterior, consulte `ACTUALIZACION_V3_6.md`: sigue siendo necesaria la migración `0015_little_war_machine.sql` para conjuntos y comparadores, además de las anteriores que falten. No borre/recree D1 o R2 para actualizar.

## Cargar sus precios

1. Entre en **Biblioteca de precios → Importar biblioteca desde Excel / CSV**.
2. Descargue la plantilla y sustituya la fila de ejemplo. Hasta 200 filas, primera hoja visible y archivo de hasta 3 MB. `.xls` debe guardarse como `.xlsx`; para CSV use UTF-8.
3. Complete las 14 columnas originales. Costo y venta por la unidad indicada; moneda explícita; fecha `AAAA-MM-DD`; IVA `neto`, `incluido` o `exento` y su tasa. No hay conversión de moneda.
4. Seleccione el archivo y **Agregar códigos nuevos** o **Actualizar códigos existentes**. Actualizar sustituye los campos de la plantilla para esos códigos; conserva los campos adicionales.
5. Pulse **Validar y previsualizar**. Revise los totales. Use **Solo inválidas** y **Descargar revisión CSV** si encuentra errores. Corrija el archivo original y selecciónelo nuevamente.
6. Pulse **Confirmar cambios en biblioteca**. La validación/importación requiere internet y permiso de escritura. Si hay una fila inválida, no se guarda ninguna. Los controles de concurrencia y la transacción del servidor se conservan.

No se modifican las cotizaciones ya creadas por cambiar precios de biblioteca. Revise y edite expresamente cada borrador que quiera actualizar.

## Validación y límites

Consulte `VALIDACION_V3_7_1.md` y el registro `PRUEBAS_V3_7_1.tap`.

La compilación y las pruebas locales usan las dependencias disponibles en caché; el paquete y el lockfile entregados mantienen las versiones de GitHub. La instalación exacta se bloqueó con HTTP 403 al descargar Vinext. Antes de producción debe completarse `npm ci` y `npm run check` con esas versiones en su entorno habitual.

La revisión visual/interactiva en navegador fue rechazada por el control de autorización. Se probaron los manejadores del componente y la compilación de estilos; eso no equivale a verificar teléfono/tablet reales. No se accedió a D1/R2 de producción ni se enviaron correos.
