# Validación v3.8.1

Fecha: 22/10/2026. Base local: entrega v3.8.0, commit `a06e7ee`. Se conservan sus 315 archivos. No se hizo push a GitHub ni despliegue en Cloudflare.

## Resultado

- TypeScript estricto y ESLint: correctos, sin advertencias de aplicación.
- Compilación de cinco etapas Vinext/Vite: correcta; 16 recursos estáticos offline y configuración generada de Cloudflare preparados.
- Suite completa: **146 pruebas correctas, 0 fallos, 0 omitidas**. Salida en `PRUEBAS_V3_8_1.txt`.
- Lockfile: solo cambia la versión raíz de 3.8.0 a 3.8.1; no hay paquetes nuevos ni cambios del árbol fijado.
- Comprobación de espacios y huellas de distribución completada antes del empaquetado.

## PDF: comparación y revisión

Se leyó y renderizó el PDF de referencia proporcionado por el propietario y se comparó con la muestra que genera la función real `buildQuotePdf`. Se adaptaron encabezado, ficha, tabla económica, totales, condiciones, observaciones, pago y firmas.

Se renderizaron e inspeccionaron las dos páginas de la muestra, la cotización normal de una página y las tres páginas del caso de texto extenso. No se encontraron textos cortados, superpuestos o fuera de márgenes. También se extrajo el texto para comprobar totales y firmas. El resumen del ensayo está en `VALIDACION_PDF_V3_8_1.json`.

Las pruebas automáticas comprueban:

- Estilo azul de la referencia, resumen a la derecha, ausencia de filas de descuento cero y firmas en una página en un caso comercial compacto.
- Importes grandes en CLP/USD/EUR/UF sin colisiones ni desborde.
- Todos los campos del cliente, revisión real, control de borrador/congelada y datos de pago sin una cuenta bancaria fija en el código.
- Ceros iniciales del número de cuenta, correo válido, límites de longitud y compatibilidad con nombres de campos bancarios anteriores. Vaciar un campo canónico no recupera por error un alias bancario antiguo.
- Guardado de los nuevos datos mediante la API existente, bajo sus permisos y control de concurrencia.
- Retención completa y separación de texto en ocho generadores de documentos ante campos largos. Los documentos distintos de cotizaciones conservan su estilo anterior.

La muestra usa los datos del adjunto solo para demostrar el formato. Ni el PDF original ni los datos personales/bancarios de esa muestra están incluidos en el ZIP fuente. La configuración de producción no fue leída ni alterada. Se mantiene tipografía incrustada propia; no se afirma reproducción idéntica de los glifos o del espaciado de las fuentes no incrustadas del archivo original.

## Límites del entorno

La instalación exacta del lockfile continúa pendiente de verificar con `npm ci` en el entorno habitual. Se compiló y probó con el mismo conjunto disponible en caché documentado en `VALIDACION_V3_8_0.md` (Vinext 1.0.0-beta.5/Vite 8.0.13, frente a 0.0.50/8.3.0 fijados para producción). Se conserva el lockfile de producción; no se cambiaron versiones para ocultar esta diferencia.

La inspección PDF sí se completó con renderizado local. No se realizó una prueba del formulario bancario mediante DOM/navegador ni una sesión de producción. Los campos usan el diseño adaptable existente; la cámara y el inventario conservan los límites documentados en v3.8.0. No se accedió a D1/R2 reales ni se enviaron correos.
