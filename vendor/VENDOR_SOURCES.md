# Componentes de etiquetas y lectura de códigos

Código obtenido desde los repositorios oficiales para generar/leer códigos sin depender de un servicio web. No se agregan paquetes npm ni se modifican versiones de dependencias. Recuperado el 22 de octubre de 2026. Los SHA indicados son identificadores Git del archivo original, no del archivo adaptado.

| Archivo local | Fuente oficial | Git blob original | Licencia |
| --- | --- | --- | --- |
| qrcodegen.ts | https://github.com/nayuki/QR-Code-generator/blob/master/typescript-javascript/qrcodegen.ts | c4191ac0b5f8a24d87fd9340ceaa2d3b07d0231a | MIT, cabecera conservada |
| code128-constants.ts | https://github.com/lindell/JsBarcode/blob/master/src/barcodes/CODE128/constants.js | 10846cae57a3038043b5b67d502c7c74f086f852 | MIT, JsBarcode-LICENSE.txt |
| JsBarcode-LICENSE.txt | https://github.com/lindell/JsBarcode/blob/master/MIT-LICENSE.txt | c376a529d569f67e426fede5cd26f33e5af3f90d | MIT |
| jsqr.mjs | https://github.com/cozmo/jsQR/blob/master/dist/jsQR.js | 99ea9df26907009e5553233ffe03c529c1521739 | Apache-2.0, jsQR-LICENSE.txt |
| jsQR-LICENSE.txt | https://github.com/cozmo/jsQR/blob/master/LICENSE | 8f71f43fee3f78649d238238cbde51e6d7055c82 | Apache-2.0 |

Adaptaciones locales:

- qrcodegen: se exportan las tres declaraciones del namespace para importación TypeScript. El algoritmo se conserva; se retiran espacios al final de línea.
- Code 128: se conservan las constantes originales, con extensión TypeScript; lib/material-labels.ts implementa la codificación Code 128 B y su checksum usando esos patrones.
- jsQR: la envoltura UMD se sustituye por una función y exportación ES module. Los identificadores internos `module` y `exports` pasan a `bundleModule` y `bundleExports` para evitar que el transformador CommonJS de Vinext interprete el paquete interno como exportaciones del archivo exterior. Se conserva el algoritmo de decodificación. El cambio se identifica en la cabecera del archivo.

Las pruebas rasterizan el SVG generado, lo decodifican con el lector real y comprueban su contenido. También se verificó el lector ya compilado, mediante cálculo local sin navegador ni cámara. Esto no sustituye una prueba de impresión, lente y dispositivo.
