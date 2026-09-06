const fs = require('fs');
const path = require('path');
function patchDir(dir) {
    if (!fs.existsSync(dir)) return;
    fs.readdirSync(dir, { withFileTypes: true }).forEach(entry => {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            patchDir(fullPath);
        } else if (entry.name.endsWith('.js')) {
            let content = fs.readFileSync(fullPath, 'utf8');
            if (content.includes('__vite_rsc_assets_manifest.js')) {
                content = content.replaceAll('__vite_rsc_assets_manifest.js', './__vite_rsc_assets_manifest.js');
                fs.writeFileSync(fullPath, content);
            }
        }
    });
    fs.writeFileSync(path.join(dir, '__vite_rsc_assets_manifest.js'), 'export default {};');
}
patchDir('./dist');
console.log('Manifiesto RSC aplicado en todo dist.');
