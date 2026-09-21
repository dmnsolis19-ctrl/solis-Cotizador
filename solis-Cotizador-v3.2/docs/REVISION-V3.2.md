# Revisión operacional v3.2

## Resultado

Esta versión refuerza los tres frentes priorizados para operación real: cotizaciones versionadas, control de inventario/compras/cobranza y trabajo técnico offline.

## Cambios aplicados

### Cotizaciones

- Los borradores ahora se pueden abrir y editar con todas sus partidas y condiciones comerciales.
- Las versiones enviadas continúan congeladas; una revisión copia cabecera y partidas en una operación atómica y vuelve a estado Borrador.
- La edición usa control optimista y una escritura condicional atómica en D1. Si otro dispositivo guardó primero, el segundo recibe un conflicto y no mezcla partidas.
- Los correlativos dejaron de depender solo de `count + 1`: `document_sequences` reserva números de forma atómica por cuenta, documento y año.

### Inventario, compras y cobranza

- Cada actualización de saldo y su movimiento de trazabilidad se escriben juntos y se condicionan al saldo leído. Una modificación concurrente se rechaza con HTTP 409.
- Todas las mutaciones revisadas incluyen el propietario autenticado en su condición de escritura.
- Solicitudes y partidas de compra se crean juntas; los correlativos de compra son atómicos.
- La creación de documentos de cobro vuelve a comprobar el saldo comercial dentro de la escritura.
- Registrar pagos, emitir y anular usan condiciones D1 atómicas para impedir sobrepagos o anulaciones que compitan con un pago.

### Trabajo offline

- La cola IndexedDB queda separada por usuario y admite creación y edición de cotizaciones, además del trabajo operativo ya soportado.
- El panel guarda una copia de lectura para poder abrir la aplicación sin red después de una sesión en línea.
- La interfaz permite inspeccionar la cola, ver el error, reintentar o descartar con confirmación.
- Las API y `/login` nunca se cachean. El shell autenticado se purga al cerrar sesión.
- No se permite cerrar sesión con cambios pendientes sin resolver.

### Plataforma y seguridad

- Se corrigió la validación de expiración de sesión.
- Se añadieron CSP, HSTS, política de permisos, protección de framing y `nosniff`.
- Fechas operativas y años documentales usan `America/Santiago`.
- Next.js, React, Vite y las herramientas Cloudflare quedaron actualizadas; `npm audit` informa cero vulnerabilidades conocidas.
- El instalador conserva permisos ejecutables y existe un único comando de verificación: `npm run check`.

## Validación ejecutada

- `npm run typecheck`: aprobado.
- `npm run lint`: aprobado.
- `npm run build`: aprobado para Worker/Vinext.
- `node --test --test-concurrency=1 tests/*.test.mjs`: 42 de 42 pruebas aprobadas.
- `npm audit`: 0 vulnerabilidades.
- `npm run db:generate`: esquema y migraciones sincronizados, sin cambios pendientes.

## Puesta en producción

1. Respaldar D1.
2. Instalar con `npm run install:ci`.
3. Ejecutar `npm run check`.
4. Aplicar las migraciones remotas, incluida `0014_pretty_emma_frost.sql`:

   ```bash
   npx wrangler d1 migrations apply DB --remote --config wrangler.production.jsonc
   ```

5. Publicar con el procedimiento de `docs/CLOUDFLARE.md`.
6. Hacer un piloto con dos usuarios y dos dispositivos: editar el mismo borrador, reservar el mismo material y registrar pagos simultáneos. El segundo cambio incompatible debe mostrar un conflicto y exigir actualización.
7. Verificar instalación PWA, apertura sin red, cola, reintento, descarte y purga al cerrar sesión.

## Siguiente etapa recomendada

Las acciones que cambian stock físico, compras, fotografías y firmas continúan exigiendo conexión deliberadamente. El siguiente incremento debería añadir pruebas de integración contra una D1/R2 temporal y pruebas E2E de los recorridos completos. También conviene dividir `app/cotizador-app.tsx` por módulos funcionales para reducir el costo de mantenimiento sin alterar el comportamiento.
