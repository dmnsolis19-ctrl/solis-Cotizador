const fs = require('fs');
const path = require('path');
function scan(dir) {
    if (!fs.existsSync(dir)) return;
    fs.readdirSync(dir, { withFileTypes: true }).forEach(e => {
        const full = path.join(dir, e.name);
        if (e.isDirectory()) {
            scan(full);
        } else if (e.name.endsWith('.js') || e.name.endsWith('.mjs')) {
            let code = fs.readFileSync(full, 'utf8');
            if (code.includes('__vite_rsc_assets_manifest')) {
                console.log('Neutralizing manifest import in:', full);
                // Reemplaza la importación estática por un objeto vacío local
                code = code.replace(/import\s+(\w+)\s+from\s+['"][^'"]*__vite_rsc_assets_manifest\.js['"];?/g, 'const  = {};');
                code = code.replace(/import\s*\(['"][^'"]*__vite_rsc_assets_manifest\.js['"]\)/g, 'Promise.resolve({ default: {} })');
                // Fallback para cualquier otra referencia suelta
                code = code.replaceAll('__vite_rsc_assets_manifest.js', './__vite_rsc_assets_manifest.js');
                fs.writeFileSync(full, code, 'utf8');
            }
        }
    });
}
scan('./dist');
fs.writeFileSync('./dist/__vite_rsc_assets_manifest.js', 'export default {};', 'utf8');
console.log('Manifest import neutralized successfully.');