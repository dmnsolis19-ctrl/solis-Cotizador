const fs = require('fs');
const path = require('path');

const manifestContent = 
const asset = { chunks: [], file: 'assets/main.js', name: 'main', src: 'main' };
const proxy = new Proxy({
    'app/layout.tsx': asset,
    'app/page.tsx': asset
}, {
    get(target, prop) {
        if (prop === '__esModule') return true;
        if (prop === 'default' || prop === 'manifest') return proxy;
        if (target[prop]) return target[prop];
        return asset;
    }
});
export default proxy;
export const manifest = proxy;
\;

function locateAndPatch(dir) {
    if (!fs.existsSync(dir)) return;
    fs.readdirSync(dir, { withFileTypes: true }).forEach(e => {
        const full = path.join(dir, e.name);
        if (e.isDirectory()) {
            locateAndPatch(full);
        } else if (e.name === 'index.js' || e.name === 'worker.js') {
            const targetDir = path.dirname(full);
            const manifestPath = path.join(targetDir, '__vite_rsc_assets_manifest.js');
            fs.writeFileSync(manifestPath, manifestContent, 'utf8');
            console.log('Advanced Proxy manifest placed at:', manifestPath);
        }
    });
}

locateAndPatch('./dist');
fs.writeFileSync('./dist/__vite_rsc_assets_manifest.js', manifestContent, 'utf8');
console.log('RSC advanced proxy patch completed.');