# SOLIS Cotizador v3.8.1 — formato comercial de referencia

Esta actualización adapta el generador de cotizaciones al formato del PDF SOLIS proporcionado por el propietario. Conserva las funciones de v3.8.0 y no requiere migraciones nuevas desde v3.7.2 o v3.8.0. No se ha desplegado ni subido a GitHub desde esta sesión.

## Diseño del PDF

- A4, logo arriba a la izquierda, empresa/servicios/dirección y línea azul.
- Título COTIZACIÓN y proyecto debajo.
- Ficha en recuadros: cliente, RUT, contacto, revisión, teléfono, dirección, fecha, número, validez, control y correo.
- Oferta económica con cabecera azul, líneas finas y filas alternadas; descripción con nombre destacado y detalle debajo, cantidades/unidades centradas e importes a la derecha.
- Resumen compacto a la derecha con neto, IVA y total; solo incorpora subtotal bruto y descuento si existe un descuento monetario efectivo. No cambia cálculos, precios ni impuestos.
- Condiciones comerciales, observaciones, exclusiones/validación cuando correspondan, datos de pago y firmas.
- Encabezado repetido y numeración en todas las páginas; filas cortas y datos bancarios se conservan juntos cuando caben. Los textos extensos continúan en páginas nuevas.

La tipografía está incrustada para que el PDF sea consistente entre dispositivos. Se reproduce la estructura y el estilo del adjunto, sin depender de las fuentes instaladas en quien lo abre. El campo Control muestra el estado real de la versión; no se fija el texto de borrador que aparecía en la referencia enviada.

## Configurar los datos bancarios

En **Tu empresa**, complete y guarde:

- Cargo del representante, si quiere mostrarlo bajo su nombre.
- Titular y RUT de la cuenta.
- Banco, tipo y número de cuenta.
- Correo para comprobantes.

El número de cuenta se guarda como texto para conservar ceros iniciales. Si el RUT o correo de pago quedan vacíos, se usa el RUT/correo comercial de la empresa. La sección se muestra cuando hay titular, banco, tipo o número de cuenta. Si deja todos esos datos vacíos, se omite la sección.

No se cargaron automáticamente en producción los datos personales, bancarios o del cliente del documento adjunto. La muestra descargable usa los datos de esa referencia para comparar el diseño; la aplicación utiliza la configuración guardada y el cliente de cada cotización.

## Actualizar en GitHub y Cloudflare

1. Respalde el código y la base D1, y sincronice los cambios offline pendientes.
2. Descomprima el ZIP y copie **todo su contenido a la raíz del repositorio**, con las carpetas completas. Mantenga sus bindings, nombres y credenciales propios de Cloudflare.
3. Confirme los cambios en la rama conectada a Cloudflare y revise que el despliegue corresponda a ese commit. La versión del paquete será **3.8.1**. No hay dependencias nuevas ni cambios del árbol fijado en el lockfile.
4. Con internet, actualice y vuelva a abrir la PWA para recibir la caché `v381`. No borre datos del sitio con operaciones pendientes.
5. Complete **Tu empresa** y guarde los datos de pago.
6. Abra una cotización, entre en sus documentos y pulse **Generar PDF**. Debe estar congelada para emitir el documento controlado. Descargue la **última emisión** generada.

Los PDF anteriores de R2 no se reemplazan ni se remaquetan al descargar; conservarlos permite mantener la trazabilidad. No hace falta duplicar la cotización ni crear una revisión comercial solo para generar una nueva emisión documental.

Verificación opcional del paquete: `node scripts/verify-distribution.mjs`. El manifiesto contiene tamaños y SHA-256; las diferencias de configuración propia deben revisarse deliberadamente. La instalación exacta de producción sigue pendiente de verificar en el entorno habitual: consulte VALIDACION_V3_8_1.md.
