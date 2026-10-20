# Validación de SOLIS Cotizador v3.6.0

Fecha: 20/10/2026. Base de GitHub: `f6f33b5034301b9c9f0ace532c733b4aee5d9fe6` (`main`). Cambios locales; no se publicó ni desplegó.

## Auditoría de la base

Se recuperaron los 236 archivos del árbol completo de GitHub, incluidas carpetas. Se verificaron el tamaño y el SHA Git de cada archivo descargado. No había archivos `AGENTS.md` en ese árbol.

La base declara v3.5.0 en `package.json` y contiene efectivamente:

| Función | Archivos comprobados |
| --- | --- |
| Listas internas y partida global por lista | `lib/material-groups.ts`, `components/material-groups-editor.tsx`, API de cotizaciones y materiales |
| PDF blanco/azul, logo y empresa | `lib/pdf-documents.ts`, `lib/company-settings.ts`, `components/company-settings-panel.tsx` |
| 196 referencias eléctricas con fuentes | `data/chile-price-references.json`, `lib/price-reference.ts`, API y panel de referencias |
| Solicitud a proveedores y materiales por OT | `components/quote-materials-panel.tsx`, `components/order-materials-panel.tsx`, sus API y funciones PDF/CSV |
| Expediente interno para contador | `app/api/accounting/route.ts`, `lib/accounting.ts`, `components/accounting-panel.tsx` |
| Lectura y cola offline por usuario | `lib/offline-queue.ts`, `lib/offline-records.ts`, `app/api/sync/route.ts`, `public/sw.js` |

Las migraciones 0000–0014 y sus metadatos están presentes. No se reconstruyó una entrega solo con archivos de la raíz.

## Comprobaciones automatizadas

- `npm run typecheck`: correcto.
- `npm run lint`: correcto.
- `npm run build`: correcto, Worker y recursos offline preparados. No es un despliegue.
- Suite completa: **84 pruebas correctas, 0 fallos, 0 omitidas**. Registro: `PRUEBAS_V3_6.tap`.
- `git diff --check`: correcto.
- Se aplicaron todas las migraciones a SQLite real de ensayo mediante `node:sqlite`; los adaptadores de prueba conservan el límite de 100 parámetros enlazados por consulta D1.

Las 16 pruebas nuevas cubren:

1. CSV con BOM, comillas, separadores y saltos de línea; plantilla y archivo XLSX generado.
2. Validación de códigos repetidos, unidades, moneda, IVA y precios.
3. Vista previa sin escrituras y confirmación separada; normalización de IVA incluido a neto.
4. Acciones agregar/actualizar y conservación de campos adicionales.
5. Rechazo sin cambios parciales por filas inválidas o versiones obsoletas.
6. Reversión de toda la transacción ante fallo intermedio o edición concurrente.
7. Lotes de 200 filas, límite de parámetros y separación por cuenta/permisos.
8. Persistencia y control de concurrencia de conjuntos.
9. Copias independientes de conjuntos, cantidades editadas y exclusión de doble cobro al aplicar.
10. Cálculo de horas/personas, traslado, transporte y viáticos, separando costo y venta.
11. Comparación por presentación completa, sobrantes, despacho único, IVA, disponibilidad, moneda y vigencia.
12. Preparación de compra sin aprobarla ni alterar cotizaciones aprobadas.
13. Reintentos sin sumar presentaciones otra vez y bloqueo de compras aprobadas.
14. Sincronización idempotente de conjuntos/comparadores y permisos.
15. Conservación del origen del conjunto en la cotización y al reabrirla offline; bloqueo de edición de cotización aprobada.
16. PDF de compra con despacho y condiciones extensas completas.

## Archivos y PDF

La plantilla XLSX generada se abrió con `openpyxl`: una hoja `Biblioteca`, 14 columnas, encabezados correctos y fila de ejemplo. Su ZIP y XML son legibles. La carga XLSX de la interfaz usa DOMParser/DecompressionStream del navegador; su flujo interactivo no pudo probarse en navegador. No se declara compatible con `.xls` binario: debe convertirse a `.xlsx` o CSV UTF-8.

El PDF de compra se generó con las funciones reales de la aplicación: 12 partidas, despacho y condiciones extensas. Se abrió con Poppler/pdfplumber, se renderizaron e inspeccionaron las tres páginas y se comprobó que el despacho y la última condición están presentes, sin caracteres fuera de página. Los PDF de muestra fueron temporales y no constituyen una oferta real.

## Versiones del entorno

La instalación limpia `npm ci` del proyecto falló con HTTP 403 al acceder al registro npm. Para validar se instaló **en un directorio de ensayo separado** el conjunto disponible en caché. El `package.json` y el lockfile de la entrega conservan las dependencias originales: solo cambia la versión de la aplicación a 3.6.0. No se agregaron librerías externas para Excel.

| Paquete | Fijado en proyecto | Usado para comprobar |
| --- | --- | --- |
| Vinext | 0.0.50 | 1.0.0-beta.5 |
| Vite | 8.3.0 | 8.0.13 |
| Cloudflare Vite plugin | 1.56.0 | 1.37.1 |
| Wrangler | 4.135.0 | 4.92.0 |
| Next.js | 16.3.5 | 16.3.4 |
| React / React DOM | 19.3.0 | 19.2.6 |
| TypeScript | 5.9.3 | 5.9.3 |

Node: 24.19.0. Los resultados son válidos para este entorno de ensayo. **Debe completar `npm ci` y `npm run check` con las versiones exactas en su entorno antes de producción.**

## Interfaz: límite de comprobación y matriz pendiente

El acceso del navegador de QA a `http://terminal.local:4173` fue rechazado por el control de autorización. No se intentó eludir el rechazo con otro navegador o acceso indirecto. No fue posible medir desbordamientos ni ejecutar interacciones reales, instalar la PWA o usar el teclado de un teléfono.

Se revisaron los componentes y estilos y su compilación: puntos de adaptación, tarjetas de biblioteca/partidas en móvil, tablas desplazables, tamaños táctiles, cierre del menú, cabecera fija de conexión/pendientes y VisualViewport para ventanas. **Esto no equivale a una validación visual en dispositivos.**

| Tamaño | Revisión del código/compilación | Navegador visual/interactivo |
| --- | --- | --- |
| Teléfono 360×800 | Realizada | Pendiente |
| Tablet 768×1024 | Realizada | Pendiente |
| Escritorio 1440×900 | Realizada | Pendiente |

Pruebas manuales antes de actualizar producción:

- Abrir/cerrar menú y elegir sección; comprobar foco, conexión y pendientes con el menú cerrado.
- Crear y editar cliente, material, cotización y conjunto; acceder a los botones inferiores con el teclado del teléfono visible.
- Importar la plantilla XLSX editada desde Excel/LibreOffice y un CSV UTF-8; probar fecha numérica de Excel, celdas compartidas y fórmulas rechazadas. Confirmar que una fila inválida no guarda ninguna.
- Editar cantidades/costos en tarjetas de teléfono y desplazarse por tablas de compras en tablet; comprobar zoom y orientación horizontal.
- Comparar dos proveedores con rollos/bolsas, despacho y distintos plazos; guardar, recargar, elegir y preparar. Comprobar que la compra queda `Solicitada` y que la aprobación es una acción posterior.
- Abrir conjunto y comparador en línea, desconectar, guardar cambios, cerrar/reabrir y volver a conectar; revisar cola y resolución de conflictos.
- Verificar acceso de administrador, cotizador, supervisor y técnico con cuentas de ensayo; el técnico no debe recibir datos internos de biblioteca/compras.
- Reabrir una cotización aprobada, importar nuevos precios y editar un conjunto; comprobar que los valores y PDF aprobado permanecen iguales.

## Servicios externos y alcance

No se conectó a D1/R2 de producción, correo real ni SII. Las pruebas usan SQLite y servicios simulados. El expediente contable sigue siendo interno y no emite DTE.

La biblioteca de mano de obra contiene nueve referencias de proveedores concretos, con enlaces, fecha y alcance. Tres servicios con kit de tuberías tienen IVA no declarado por la fuente y lo mantienen pendiente hasta confirmarlo. No representan una tarifa nacional ni remuneraciones laborales. Los presupuestos de PLC/HMI/ingeniería usan tarifas propias declaradas por el usuario.

El comparador elige una oferta completa por orden, en la misma moneda. No divide una compra entre proveedores ni realiza conversiones automáticas. El despacho se guarda y aparece en el PDF; no se distribuye entre los costos unitarios de stock.

La migración nueva es aditiva, pero no se aplicó en su Cloudflare. El ZIP no es una declaración de que producción ya esté actualizada.
