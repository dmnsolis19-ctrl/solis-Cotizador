const fs = require('fs');
const path = require('path');

// Crear manifiesto en la raíz y en dist por seguridad absoluta
['./', './dist', './dist/client'].forEach(dir => {
    if (fs.existsSync(dir) || dir === './') {
        try {
            fs.writeFileSync(path.join(dir, '__vite_rsc_assets_manifest.js'), 'export default {};', 'utf8');
            console.log('Manifest placed at:', path.resolve(dir, '__vite_rsc_assets_manifest.js'));
        } catch (e) {}
    }
});