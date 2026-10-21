# SOLIS Cotizador v3.6.2

Proyecto completo para actualización manual. Incluye las funciones de v3.6.0, el arreglo de cotizaciones de v3.6.1 y las correcciones de PDF y campos numéricos de esta entrega. No se publicó ni desplegó automáticamente.

## Correcciones

- **La cotización conserva lo escrito:** las actualizaciones de fondo de clientes, biblioteca, conexión o configuración ya no reinician el editor. Se conservan cliente, proyecto, partidas y condiciones mientras se edita. La carga de un borrador no se repite por cambios de objetos o funciones del componente principal. Cerrar o cancelar sigue descartando los cambios sin guardar; no se añadió autoguardado de formularios nuevos.
- **PDF completos:** los cuadros, columnas y encabezados se calculan con las métricas de las fuentes incrustadas. El texto se ajusta al ancho y los bloques largos continúan en páginas nuevas. Se conservan los saltos de línea. La cotización y la compra repiten sus encabezados de tabla al continuar. Las cifras también se ajustan a sus columnas.
- **Sin límites que oculten registros:** órdenes de trabajo, cobros y cierres ya no descartan actividades, registros, solicitudes, pagos ni notas por límites de líneas o cantidades. La conformidad operativa incluye sus observaciones y el informe enumera las evidencias registradas.
- **Campos numéricos:** el cero se selecciona al entrar al campo para poder reemplazarlo. Si un teclado conserva un cero a la izquierda, se elimina al escribir dígitos. Se puede borrar completamente mientras se edita sin que reaparezca un cero en cada pulsación. Se mantienen decimales, mínimos, máximos, validación nativa y valores que provengan de una selección externa. Al salir, un campo cuyo estado numérico sea cero vuelve a mostrar cero; los campos de texto numérico que aceptan vacío permanecen vacíos. El teclado solicitado al dispositivo es decimal.

La corrección de PDF cambia la presentación de las descargas nuevas. No recalcula precios ni modifica cotizaciones aprobadas, costos congelados, configuración de empresa o datos de producción. Se conservan Cloudflare, D1, R2, permisos y cola offline. No se accedió a D1/R2 de producción.

## Actualización manual

1. Guarde y sincronice las operaciones pendientes; conserve una copia del proyecto actual.
2. Descomprima `SOLIS_Cotizador_v3.6.2_completo.zip`. Suba **todo el contenido** de `solis-Cotizador/` a la raíz de su repositorio, incluidas `app/`, `components/`, `lib/`, `public/`, `db/`, `drizzle/`, `scripts/`, `tests/` y `docs/`.
3. Conserve sus bindings, identificadores de recursos, secretos y datos de Cloudflare.
4. **Desde v3.6.0 o v3.6.1 no hay una migración nueva.** Desde v3.5 sigue siendo necesaria la migración aditiva `drizzle/0015_little_war_machine.sql`, documentada en `ACTUALIZACION_V3_6.md`. No vuelva a inicializar ni reemplace su base de datos.
5. Ejecute `node scripts/verify-distribution.mjs` para verificar los archivos con `docs/ARCHIVOS_V3_6_2.json`. Las diferencias de configuraciones propias conservadas deben revisarse por separado.
6. Instale y verifique con las dependencias fijadas del proyecto en su entorno. El despliegue sigue siendo manual por su procedimiento habitual.
7. Recargue la PWA y compruebe que aparezca **v3.6.2**. El caché estático cambia a `v362`; IndexedDB y su cola se conservan. No borre datos del navegador si tiene operaciones pendientes.

## Comprobación de uso después de actualizar

- Cree una cotización, seleccione cliente, escriba un proyecto y agregue materiales. Espere un minuto y alterne entre pestañas: los datos deben conservarse. Repita con un borrador existente y guarde.
- En cantidad, costo y precio, reemplace `0` por `2500`, borre el valor y escriba otro; compruebe también `0.5` en un campo que permita decimales. Use el separador decimal que acepte el navegador del dispositivo.
- Descargue una cotización y una compra con nombres y condiciones largos. Compruebe el final de cada texto, los totales, las páginas y la impresión. Descargue también órdenes, cobros, cierre y solicitudes cuando corresponda.
- Repita la navegación y edición en teléfono, tablet y escritorio. Verifique el teclado numérico, la conexión y los pendientes de sincronización.

## Verificación de esta entrega

- `npm run typecheck`, `npm run lint` y `npm run build`: correctos.
- **100 pruebas correctas, 0 fallos, 0 omitidas**. Registro: `PRUEBAS_V3_6_2.tap`.
- Se conservaron las cuatro pruebas del formulario que se borra y se añadieron cuatro para edición numérica y ocho para los PDF. Estas doce pruebas nuevas fallan con los componentes de v3.6.1 y pasan con las correcciones.
- Se generaron **10 PDF y 32 páginas**, renderizadas con Poppler y revisadas visualmente. Se verificaron además los caracteres con pdfplumber: ninguno fuera de los márgenes comprobados. Los casos incluyen nombres largos, varias páginas de alcance y condiciones, 25 actividades, 20 registros, 27 solicitudes y 20 pagos. Resumen y huellas: `VALIDACION_PDF_V3_6_2.json`.
- Para reproducir los diez documentos de prueba: `node scripts/qa-pdfs.mjs`. Se guardan por defecto en `work/pdf-qa/`; puede indicar otra carpeta como argumento. Poppler y pdfplumber fueron herramientas externas de QA, no dependencias de ejecución de la PWA.
- `git diff --check` correcto. El ZIP y todas sus entradas se verificaron con SHA-256. No se incluyen `node_modules`, compilados ni datos de producción.

### Límites de la validación

Las pruebas usaron las dependencias disponibles en caché: Vinext 1.0.0-beta.5, Vite 8.0.13, Cloudflare Vite plugin 1.37.1, Wrangler 4.92.0, Next.js 16.3.4, React 19.2.6 y TypeScript 5.9.3, en Node 24.19.0. Se preservaron las declaraciones de dependencias y el lockfile original; solo cambia la versión de la aplicación. La instalación limpia con las versiones exactas fijadas sigue pendiente por la restricción de acceso al registro npm descrita en `VALIDACION_V3_6.md`.

**No se realizó una prueba interactiva en navegador ni con el teclado real de un teléfono/tablet.** El navegador de QA fue rechazado por la autorización del entorno; no se intentó eludir ese bloqueo. Las pruebas de los campos y del diálogo ejecutan sus componentes y manejadores reales con hooks en memoria, sin DOM. La revisión visual realizada aquí corresponde a los PDF renderizados, no a una afirmación de validación visual de la PWA en todos los dispositivos.
