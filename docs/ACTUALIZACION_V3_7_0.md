# SOLIS Cotizador v3.7.0 — biblioteca Metalcon

Proyecto completo para actualización manual, basado en v3.6.3. Agrega 56 referencias y listas iniciales para presupuestar trabajos con perfiles galvanizados. No se publicó ni desplegó automáticamente.

## Contenido

En **Biblioteca → Explorar Metalcon** encontrará:

- 18 referencias de perfiles estructurales C, U y omega, diferenciadas por sección, espesor, largo y perforación cuando corresponde.
- 10 referencias de tabiques y esquineros no portantes.
- 4 referencias para cielos: portantes, perfil AT y conector TI.
- 7 fijaciones, cotizadas por tornillo individual.
- 2 partidas de anclajes y arriostres que deben especificarse con los planos.
- 6 placas de yeso-cartón u OSB, cotizadas por plancha/tablero.
- 4 complementos genéricos de aislación, membrana y terminaciones, con especificación pendiente.
- 5 alcances propios de mano de obra: estructura portante por hora, perfilería de tabique/cielo por m2 y placas/juntas por cara. No contienen tarifas de mercado.

**No se inventaron precios.** Los costos, precios de venta, proveedor y fecha de precio no vienen cargados en las referencias técnicas. La aplicación calcula su venta desde el costo neto que usted ingrese y el recargo que elija; ese resultado se puede editar después en la biblioteca.

## Uso

1. Abra **Biblioteca → Explorar Metalcon**. Busque por familia o elija una lista inicial: muro portante, tabique interior o cielo.
2. Marque las referencias que necesita. Ingrese sus **costos netos CLP por la unidad indicada**. Una barra es `un`, no un metro; una plancha es `un`, no un m2; un tornillo/conector es `un`, no una caja. El fleje y la cinta se cotizan por metro; aislación/membrana por m2; compuesto de juntas por kg.
3. Defina recargo de venta, proveedor/trabajador y fecha de sus precios. Pulse **Validar antes de agregar**. Revise la vista previa y confirme las referencias nuevas.
4. Los códigos existentes se omiten y **conservan sus precios y datos**. Para actualizarlos, use Editar en la biblioteca o la importación general en modo Actualizar.
5. Para repetir un trabajo, ajuste las cantidades de las referencias seleccionadas, ponga un nombre al conjunto y pulse **Guardar conjunto**. Todas deben existir previamente en su biblioteca con costos y precios propios, CLP y la unidad indicada.
6. Al crear una cotización, use **Aplicar conjunto reutilizable**. Las partidas se copian con identificadores de origen, cantidades editables y protección contra aplicar el mismo conjunto dos veces. Los conjuntos quedan bajo la nueva especialidad **Construcción**.
7. Puede usar también la estructura de listas internas **Construcción en Metalcon** para separar perfilería, anclajes/arriostres, tabiques/cielos y placas/aislación, manteniendo una partida global por lista ante el cliente.

Las listas iniciales contienen **1 unidad por ítem** para iniciar una selección editable. No son rendimientos por m2, kits completos de construcción ni cálculos de cantidades automáticos. Puede cambiar perfiles, quitar o agregar ítems y definir cantidades desde los planos.

### CSV

**CSV para completar precios** descarga las referencias seleccionadas o filtradas, con las mismas 14 columnas de la importación general. Complete `costo`, `venta` y `fecha` antes de importarlo; los campos vacíos son intencionales. Los valores se expresan netos y la plantilla indica CLP e IVA 19%; revise el tratamiento de su operación antes de importar. No hay conversión automática de monedas.

### Estructuras portantes

Esta biblioteca sirve para preparar presupuestos. No dimensiona estructuras ni define luces, cargas, separaciones, conexiones o capacidad de anclajes. Los perfiles de tabique de 0,5 mm no se ofrecen como sustitutos de perfiles portantes. Las referencias de anclajes, flejes, aislación y membranas genéricas requieren especificación del proyecto. El revestimiento o placa aislada no certifica el comportamiento del sistema completo.

## Fuentes y alcance de las referencias

Cada ficha muestra la fuente y su edición. La fecha **20/10/2026** es de revisión técnica, no de vigencia de precio ni de stock. Los códigos `MC-...` son internos de SOLIS; no se presentan como códigos de producto del fabricante.

- Cintac: [familias de perfiles y accesorios](https://www.cintac.cl/perfiles-y-accesorios-metalcon/) y [muros estructurales](https://www.cintac.cl/muros-estructurales/).
- Cintac: tablas indexadas de los manuales de diseño de 2020/2023 y del catálogo general 2025, según los enlaces de cada ficha. Algunas URLs antiguas redirigen actualmente al sitio principal; confirme el suministro vigente con el fabricante. No se atribuye a la edición 2026 una tabla histórica.
- Cintac: [Metalcon Cielos, julio 2026](https://www.cintac.cl/wp-content/uploads/2026/08/Metalcon/metalcon%20cielos%202026%20web.pdf), revisado directamente. El perfil AT se identifica sin afirmar espesor: la nomenclatura y la tabla del documento difieren entre 0,5 y 0,42 mm, lo que se advierte en su ficha.
- Volcán: fichas de placas ST 10 y 12,5 mm, RH 12,5 mm y RF 12,5 mm, enlazadas por separado.
- LP Chile: [OSB Protec](https://lpchile.cl/producto/lp-osb-apa-protec/) de 9,5 y 11,1 mm.
- Los alcances genéricos y de mano de obra fueron definidos para este presupuesto SOLIS, con precio y especificación propios; no son un catálogo tarifario del fabricante.

Datos: `data/metalcon-references.json`. Funciones de preparación, CSV y conjuntos: `lib/metalcon.ts`.

## Actualización manual

1. Guarde y sincronice sus cambios pendientes y conserve una copia del proyecto actual.
2. Descomprima `SOLIS_Cotizador_v3.7.0_completo.zip` y suba **todo el contenido de `solis-Cotizador/`**, incluidas las carpetas **`data/`, `components/`, `lib/`, `app/`, `scripts/`, `tests/` y `docs/`**. No actualice solo la raíz.
3. Reemplace juntos `package.json` y `package-lock.json`. Se conserva la corrección de `tailwind-merge 3.6.0`; no se modificó ninguna dependencia ni se añadieron paquetes.
4. Conserve secretos, bindings e identificadores de Cloudflare. Desde v3.6 no hay una migración nueva. Desde v3.5 sigue siendo necesaria `0015_little_war_machine.sql`, según su guía.
5. Ejecute `node scripts/verify-dependency-lock.mjs` y `node scripts/verify-distribution.mjs`. El manifiesto actual es `docs/ARCHIVOS_V3_7_0.json`.
6. Compile y despliegue por su procedimiento habitual. Después, compruebe **v3.7.0**. El caché cambia a `v370`, conservando IndexedDB y la cola offline. No borre datos del navegador con operaciones pendientes.

No se modificaron la configuración de empresa, los datos existentes, las cotizaciones aprobadas, los permisos o los recursos D1/R2. La carga de referencias es una operación explícita del usuario mediante la importación existente; no se escriben automáticamente al abrir la aplicación.

## Validación

- `npm run check:lockfile`, `npm run typecheck`, `npm run lint` y `npm run build`: correctos.
- Suite completa: **114 pruebas correctas, 0 fallos, 0 omitidas**. Registro `PRUEBAS_V3_7_0.tap`.
- Siete nuevas pruebas verifican las 56 referencias, CSV sin precios ficticios, conversión de precios propios, importación de todas las referencias, conservación de precios/empresa/cotizaciones aprobadas, conjuntos independientes y repetición offline sin duplicados ni acceso entre cuentas.
- Tres nuevas pruebas ejecutan el componente y sus manejadores con hooks en memoria: consulta sin escrituras, conservación de precios en actualizaciones de fondo, vista previa y confirmación separadas y guardado de conjuntos en la cola offline.
- Se mantienen las pruebas de formularios, entrada numérica, generación PDF, permisos, cierre de órdenes y coherencia del lockfile.
- El lockfile solo cambia la versión de la aplicación; se verificó igualdad del árbol de dependencias respecto de v3.6.3. Se conservaron sin cambios los generadores PDF, el componente numérico, la base de datos y la importación transaccional.
- `git diff --check` correcto. ZIP completo y huellas SHA-256 de todas sus entradas verificados.

**Límites:** los controles usan las dependencias disponibles en caché documentadas en las guías v3.6.2 y v3.6.3. La instalación limpia completa con todas las versiones exactas y el build remoto de Cloudflare no se verificaron aquí. La interfaz nueva usa tarjetas y rejillas adaptables, pero **no se pudo validar visualmente ni con teclado real en teléfono, tablet o escritorio**: el navegador de QA continúa bloqueado por autorización. Los ensayos del componente no equivalen a una prueba con DOM/navegador. No se accedió a D1/R2 de producción.
