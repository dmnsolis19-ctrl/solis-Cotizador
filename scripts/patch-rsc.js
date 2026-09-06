const fs = require('fs');
const path = require('path');

function locateAndPatch(dir) {
    if (!fs.existsSync(dir)) return;
    fs.readdirSync(dir, { withFileTypes: true }).forEach(e => {
        const full = path.join(dir, e.name);
        if (e.isDirectory()) {
            locateAndPatch(full);
        } else if (e.name === 'index.js' || e.name === 'worker.js') {
            const targetDir = path.dirname(full);
            const manifestPath = path.join(targetDir, '__vite_rsc_assets_manifest.js');
            fs.writeFileSync(manifestPath, 'export default {};', 'utf8');
            console.log('Manifiesto RSC colocado junto al servidor en:', manifestPath);
        }
    });
}

locateAndPatch('./dist');
// Resguardo en la raíz de dist por si acaso
fs.writeFileSync('./dist/__vite_rsc_assets_manifest.js', 'export default {};', 'utf8');
console.log('Parche de manifiesto aplicado correctamente.');