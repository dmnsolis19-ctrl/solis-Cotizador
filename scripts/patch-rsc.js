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
                console.log('Stripping and mocking manifest in:', full);
                const lines = code.split('\n');
                // Filtramos cualquier línea que intente importar el manifiesto faltante
                const filtered = lines.filter(line => !line.includes('__vite_rsc_assets_manifest'));
                // Inyectamos un objeto vacío al inicio del archivo para satisfacer cualquier referencia
                filtered.unshift('const __vite_rsc_assets_manifest = {};');
                code = filtered.join('\n');
                fs.writeFileSync(full, code, 'utf8');
                
                // Creamos el archivo físico por seguridad en la misma carpeta
                const mp = path.join(dir, '__vite_rsc_assets_manifest.js');
                fs.writeFileSync(mp, 'export default {};', 'utf8');
            }
        }
    });
}
scan('./dist');
console.log('Robust manifest patch completed.');