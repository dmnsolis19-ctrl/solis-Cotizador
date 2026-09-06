const fs = require('fs');
const path = require('path');

// Buscar recursivamente dónde está index.js o los archivos del servidor en dist y colocar el manifiesto al lado
function placeManifest(dir) {
    if (!fs.existsSync(dir)) return;
    fs.readdirSync(dir, { withFileTypes: true }).forEach(e => {
        const full = path.join(dir, e.name);
        if (e.isDirectory()) {
            placeManifest(full);
        } else if (e.name === 'index.js' || e.name === 'worker.js') {
            const targetDir = path.dirname(full);
            fs.writeFileSync(path.join(targetDir, '__vite_rsc_assets_manifest.js'), 'export default {};', 'utf8');
            console.log('Placed manifest directly next to:', full);
        }
    });
}
placeManifest('./dist');
// Resguardo global en la raíz de dist
fs.writeFileSync('./dist/__vite_rsc_assets_manifest.js', 'export default {};', 'utf8');