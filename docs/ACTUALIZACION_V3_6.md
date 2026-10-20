# SOLIS Cotizador v3.6.0: actualización y uso

Base: repositorio `dmnsolis19-ctrl/solis-Cotizador`, rama `main`, commit `f6f33b5034301b9c9f0ace532c733b4aee5d9fe6`, recuperado el 20/10/2026. Los 236 archivos originales se descargaron y verificaron contra sus tamaños y hashes Git. Esta distribución contiene las carpetas completas y las modificaciones nuevas. No es el ZIP v3.5 renombrado.

**Estado:** código comprobado con tipos, lint, compilación y pruebas automatizadas en las versiones disponibles localmente. La instalación exacta con el lockfile y la revisión visual en navegadores de teléfono/tablet/escritorio están pendientes. Lea `VALIDACION_V3_6.md` antes de actualizar producción. No se hicieron commits remotos, publicaciones ni despliegues.

## Antes de reemplazar archivos

1. Sincronice los cambios pendientes de los dispositivos y guarde una copia del proyecto anterior.
2. Respalde D1 y conserve R2, sus bindings y los secretos existentes. No borre ni recree esos recursos.
3. Descomprima el ZIP. Dentro de `solis-Cotizador/` están la raíz y **todas las subcarpetas**, incluidas `app`, `components`, `lib`, `data`, `db`, `drizzle`, `public`, `scripts`, `tests`, `vendor` y `docs`.
4. Copie el contenido completo dentro de la carpeta del proyecto, conservando sus archivos locales de entorno y sus datos. No cree una segunda carpeta `solis-Cotizador/solis-Cotizador`.
5. Compruebe sus valores de `wrangler.production.jsonc` y `.openai/hosting.json` antes de subirlos. Los archivos incluidos conservan la configuración encontrada en GitHub; no sustituyen los secretos de Cloudflare.

No se incluyen `node_modules`, bases de desarrollo, credenciales ni `dist`: se generan en su entorno. El ZIP es el proyecto fuente completo, no una exportación de su D1/R2 de producción.

Para comprobar que se copiaron también las carpetas, ejecute `node scripts/verify-distribution.mjs` desde el proyecto extraído. Contrasta tamaños y SHA-256 con `docs/ARCHIVOS_V3_6.json`. Después de subir a GitHub, puede repetirlo en una descarga nueva. Si conservó una configuración propia, el verificador señalará esas diferencias: revíselas por separado. El manifiesto describe esta entrega y no se actualiza automáticamente cuando usted modifica archivos.

## Instalar, migrar y comprobar

El flujo de compilación existente requiere Node >=22.13 y Bash con GNU timeout. En Windows use WSL para `npm run check`; para Wrangler desde PowerShell puede usar `npx.cmd`. No ejecute el despliegue durante las comprobaciones.

```bash
npm ci
```

Desde su entorno autenticado de Cloudflare, cambie el nombre de la base si su instalación usa otro:

```bash
npx wrangler d1 export solis-cotizador-db --remote --config wrangler.production.jsonc --output backup-solis-d1-v35.sql
npx wrangler d1 migrations list solis-cotizador-db --remote --config wrangler.production.jsonc
```

Primero aplique las migraciones en una base de ensayo con una copia de sus datos. Para una v3.5 íntegra, la única migración nueva es:

`drizzle/0015_little_war_machine.sql`

Crea `catalog_bundles`, `supplier_comparisons` y sus índices; agrega `purchase_requests.dispatch_net` con valor inicial `0`. No elimina tablas ni modifica precios, usuarios, empresa o cotizaciones. El snapshot y el diario de Drizzle también están incluidos.

Una vez verificado el respaldo y la base objetivo:

```bash
npx wrangler d1 migrations apply solis-cotizador-db --remote --config wrangler.production.jsonc
npm run check
```

Si faltan migraciones anteriores, revise el estado real; no marque migraciones como aplicadas manualmente ni vuelva a importar el respaldo de escritorio para actualizar. `db:generate` no es un paso de instalación: la migración ya está generada.

La subida manual a GitHub y cualquier despliegue posterior los realiza usted. Revise si su repositorio tiene acciones o integración de Cloudflare que se activen al subir archivos. Esta entrega no creó ni ejecutó ninguna.

## Excel / CSV

En **Biblioteca → Importar biblioteca desde Excel / CSV**:

1. Descargue la plantilla Excel `.xlsx` o CSV. Reemplace la fila de ejemplo.
2. Use máximo 200 filas, 3 MB y la primera hoja visible. Para `.xls`, guarde primero como `.xlsx`; CSV debe ser UTF-8. Las fórmulas deben pegarse como valores.
3. Columnas: `codigo`, `tipo`, `categoria`, `nombre`, `descripcion`, `unidad`, `costo`, `venta`, `moneda`, `iva`, `tasa_iva`, `proveedor`, `fuente`, `fecha`.
4. `tipo`: `Material`, `Mano de obra` o `Servicio`. Unidades: `un`, `m`, `m2`, `m3`, `kg`, `l`, `h`, `hh`, `dia`, `gl`, `punto`, `kit`, `par`, `rollo`, `caja`. Para comprar rollos de cable use preferentemente unidad `m`; el comparador registra los metros por rollo.
5. Precios por unidad de la fila. Use `12500.50` o `12500,50`, sin separador de miles. No escriba `$`. Monedas: `CLP`, `USD`, `EUR`, `UF`; no se convierten.
6. `iva`: `neto`, `incluido` o `exento`; `tasa_iva` debe ser explícita (por ejemplo `19`; `0` para exento). Costo y venta se interpretan con el mismo tratamiento de IVA y se guardan netos. Si el costo y la venta tienen tratamientos distintos, normalícelos a neto antes de subir. La cotización mantiene su IVA global: revíselo al usar referencias exentas y no mezcle tratamientos sin revisar el cálculo.
7. `fecha`: `AAAA-MM-DD`. Códigos nuevos se normalizan en mayúsculas; se detectan duplicados sin distinguir mayúsculas y espacios laterales.
8. Elija **Agregar** o **Actualizar**. Agregar omite existentes; actualizar omite códigos nuevos. Actualizar reemplaza los campos de la plantilla para esos códigos, conservando los campos adicionales del registro.
9. Revise la vista previa y confirme. Si una fila es inválida, no se aplica ninguna. Si cambia la biblioteca entre vista previa y guardado, se rechaza y se solicita otra vista previa. La escritura por lote es atómica.

La importación requiere conexión para contrastar los códigos actuales. No usa el importador del respaldo de escritorio y no toca empresa, clientes, órdenes, cotizaciones o ajustes económicos.

## Conjuntos reutilizables

En **Biblioteca → Conjuntos por especialidad**, elija nombre, especialidad y moneda. Agregue materiales/servicios de la biblioteca, ajuste cantidades, costo y venta y guarde. Puede editar el conjunto o actualizar expresamente sus precios desde la biblioteca. Cada conjunto conserva su propia copia de precios.

En **Nueva cotización / Editar borrador → Aplicar conjunto reutilizable**, elija el conjunto y revise las cantidades antes de copiarlo. Las filas comerciales se guardan independientes, con identificación de origen en el payload. Aplicar otra vez el mismo conjunto se bloquea; se omiten códigos ya presentes o incluidos en listas internas. Edite la cantidad de la partida existente. La aplicación no crea también una partida global: así evita cobrar los mismos materiales en dos representaciones.

Los cambios posteriores del conjunto o de la biblioteca no recalculan cotizaciones existentes. Las versiones aprobadas/congeladas siguen protegidas por la API. Las partidas manuales que el usuario cree deliberadamente deben revisarse como parte del presupuesto.

La consulta offline usa la última copia cargada por usuario; los guardados pasan por la cola persistente. Al sincronizar, un cambio concurrente requiere revisión.

## Mano de obra y servicios de Chile

En **Biblioteca → Mano de obra Chile y cálculo por cuadrilla** encontrará nueve referencias públicas, con fuente, fecha 20/10/2026, unidad, alcance, cobertura e IVA. Las referencias son precios de venta de proveedores concretos en la Región Metropolitana, no promedios de todo Chile ni salarios de técnicos.

Los servicios de climatización que incluyen soportes o tuberías están identificados como servicios con materiales. Las ofertas que no explicitan IVA requieren confirmarlo antes de agregarlas. Para cada referencia debe ingresar **su costo interno neto**, distinto del precio público. Se normaliza la venta a neto; no se asigna una remuneración inventada al trabajador.

Para PLC/HMI, ingeniería, puesta en marcha y fotovoltaica use la estimación propia: roles, personas, horas por persona, costo interno y venta por hora; horas de traslado por persona; transporte total; días de viáticos por persona y sus importes. Todo se calcula en neto. Los campos de tarifa comienzan en cero y requieren confirmación expresa. La estimación se guarda como servicio global en biblioteca, con el desglose interno en el payload; el PDF del cliente usa el alcance de la partida, sin las tarifas internas.

No se encontraron/establecieron tarifas públicas homogéneas de PLC/HMI, ingeniería o puesta en marcha en esta entrega. Sus tarifas se definen mediante presupuestos propios, no extrapolando salarios ni inventando precios de mercado. No se hace rastreo automático de fuentes.

## Comparar proveedores y preparar compra

1. Use una solicitud de compra en estado **Solicitada**, generada desde el flujo de materiales/inventario. Registre antes los proveedores en **Proveedores**.
2. Abra **Inventario y compras → Comparador de proveedores** y seleccione la compra.
3. Agregue ofertas completas para ese mismo listado. Ingrese referencia, moneda, vigencia, entrega, despacho neto total, descuento sobre materiales e IVA.
4. Por cada partida indique presentación (rollo/bolsa/etc.), cantidad en la unidad base por presentación, precio neto por presentación y cantidad disponible en unidades base. Stock y cantidades a pedido deben estar confirmados.
5. El comparador redondea a bultos completos y muestra compra real, sobrantes y costo total. Ejemplo: 12 m requeridos, rollos de 10 m → compra 20 m, sobrante 8 m. Despacho se suma una sola vez por oferta y recibe el mismo impuesto configurado; el descuento no se aplica al despacho.
6. Confirme condiciones y elija una oferta. El resumen ordena ofertas válidas de la misma moneda por total; entrega y vigencia permanecen visibles. No se elige automáticamente ni se mezclan monedas. Cada OC corresponde a un proveedor; esta versión no divide automáticamente un listado entre proveedores.
7. Guarde el comparador. Puede descargar un **borrador OC CSV**. Para preparar la compra guardada necesita conexión, una oferta vigente y la compra sin aprobar. Se conservan los requerimientos originales para no sumar bultos otra vez en un reintento.
8. **Preparar compra para aprobación** actualiza cantidades/costos y despacho de la solicitud existente. **No aprueba, envía ni emite automáticamente** la compra. Continúe con el flujo habitual de aprobación y PDF en Compras.

Las ofertas se pueden consultar y guardar por la cola offline; la preparación, aprobación y movimientos de existencias requieren conexión. Las compras aprobadas no se modifican desde el comparador. El despacho es un gasto de la compra; la valorización de stock conserva el costo de materiales y no distribuye ese flete entre unidades.

## Pantallas y ventanas

Se mantiene el menú plegable y se cierra al elegir una sección en teléfono. Biblioteca y editor de partidas usan tarjetas en pantalla estrecha; las demás tablas tienen desplazamiento horizontal con acceso por teclado. Los controles táctiles tienen altura mínima 44 px; los campos usan 16 px para evitar el zoom automático del teléfono.

Las ventanas usan la altura del área visible mediante VisualViewport y `dvh`, con desplazamiento interno cuando aparece el teclado. La conexión y cantidad pendiente permanecen en la cabecera fija, con una etiqueta accesible que indica ambos estados. El caché de recursos PWA cambia a v36; no se borra IndexedDB ni la cola de cambios.

**La revisión visual real en teléfono, tablet y escritorio no pudo ejecutarse por bloqueo de acceso del navegador.** Antes de producción, complete las comprobaciones manuales del informe de validación en 360×800, 768×1024 y 1440×900, incluyendo el teclado real del teléfono.

## Si necesita volver a v3.5

Conserve el respaldo de código anterior y los documentos existentes de R2. La migración es aditiva: v3.5 puede ignorar las tablas/columna nuevas. No elimine tablas ni restaure D1 indiscriminadamente: eso perdería cambios posteriores. Antes de volver, revise las compras con despacho y cantidades de presentación completa, porque la interfaz v3.5 no muestra el campo de despacho nuevo. Los datos nuevos de conjuntos/comparadores permanecerán en D1.
