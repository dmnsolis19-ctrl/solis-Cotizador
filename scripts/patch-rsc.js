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
                console.log('Found reference in:', full);
                code = code.replaceAll('from "__vite_rsc_assets_manifest.js"', 'from "./__vite_rsc_assets_manifest.js"')
                           .replaceAll("from '__vite_rsc_assets_manifest.js'", "from './__vite_rsc_assets_manifest.js'")
                           .replaceAll('__vite_rsc_assets_manifest.js', './__vite_rsc_assets_manifest.js');
                fs.writeFileSync(full, code, 'utf8');
                const mp = path.join(dir, '__vite_rsc_assets_manifest.js');
                fs.writeFileSync(mp, 'export default {};', 'utf8');
                console.log('Created manifest at:', mp);
            }
        }
    });
}
scan('./dist');
fs.writeFileSync('./dist/__vite_rsc_assets_manifest.js', 'export default {};', 'utf8');
console.log('Enhanced patch completed.');