# SOLIS Cotizador v3.7.2 — PDF comercial más limpio

Actualización sobre v3.7.1. Se ajustó el PDF de cotización tomando como referencia la captura compartida el 22/10/2026: el resumen de totales celeste a todo el ancho y la cuadrícula azul se reemplazan por una composición más sobria.

## Presentación nueva

- Resumen económico de 320 puntos de ancho, alineado al margen derecho. Subtotal, descuento, neto e IVA sobre fondo blanco; solo el total tiene una banda gris tenue y una línea azul fina.
- Encabezado de partidas gris claro con texto oscuro. Filas blancas y separadores horizontales, sin cuadrícula vertical.
- Datos del cliente y condiciones comerciales sin rellenos celestes. Se conservan el logo, los títulos, las fuentes incrustadas y los datos comerciales.
- Espaciado y reserva de firmas calculados desde el texto real. La muestra con cinco partidas y condiciones normales cabe en una página, sin dejar las firmas aisladas en otra. Los documentos con más contenido siguen usando las páginas necesarias.
- Se conservan los importes recibidos por el generador; no se recalculan ni modifican precios, IVA, descuentos o datos guardados por este cambio visual.

Los demás tipos de documento mantienen su presentación. La utilidad de filas admite ahora alineación horizontal y reglas sin caja, pero conserva su comportamiento anterior para las llamadas existentes.

## Cómo actualizar

1. Sincronice los cambios pendientes de los dispositivos y conserve su copia de respaldo.
2. Descomprima `SOLIS_Cotizador_v3.7.2_completo.zip` y copie **todo el contenido de `solis-Cotizador/`** al repositorio. Incluya las carpetas; no suba únicamente el ZIP ni cree otra carpeta anidada.
3. Conserve los secretos, bindings e identificadores existentes de Cloudflare. Este cambio no requiere nuevas migraciones respecto de v3.7.1. Si su versión es anterior a v3.6, revise la migración pendiente en su guía.
4. Compruebe con `node scripts/verify-dependency-lock.mjs` y `node scripts/verify-distribution.mjs`.
5. Suba a GitHub por su procedimiento habitual y revise el despliegue de Cloudflare. El comando continúa siendo `npm run build`; compruebe la versión visible **3.7.2**. El caché estático cambia a `v372` sin borrar IndexedDB.
6. Abra una cotización congelada y emita **una nueva versión de su documento PDF** desde el apartado de documentos. Descargue la versión recién creada.

**Los PDF ya emitidos permanecen como estaban.** Son documentos históricos almacenados en R2: actualizar el código no reemplaza ni cambia sus archivos. Descargar una emisión anterior seguirá mostrando el formato anterior. No hace falta cambiar los valores ni aprobar otra revisión comercial para emitir un nuevo documento con el mismo contenido congelado.

## Muestra y comprobaciones

Se entrega una muestra ilustrativa generada por el mismo código de la aplicación. No es una cotización real y no actualiza los precios del proyecto.

Se renderizó e inspeccionó la muestra de una página y una cotización de cuatro páginas con campos y descripciones extensos. Se comprobaron totales, saltos, firmas y ausencia de texto cortado/superpuesto. Las pruebas nuevas verifican que el resumen queda a la derecha, que las superficies son neutras, que la muestra normal incluye las firmas en una página y que importes grandes en CLP, USD, EUR y UF respetan los márgenes.

Pasaron **121 pruebas**, tipos, lint y compilación. El resultado de la suite completa está en `PRUEBAS_V3_7_2.tap`. La validación local utiliza las dependencias en caché documentadas en `VALIDACION_V3_7_1.md`; el árbol bloqueado de producción no se modificó. La instalación limpia con las versiones exactas y el despliegue remoto siguen pendientes de su entorno. No se accedió a D1/R2 de producción ni se enviaron documentos a clientes.
