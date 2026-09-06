const fs = require('fs');
const path = require('path');
function walk(d) {
    let r = [];
    if (!fs.existsSync(d)) return r;
    fs.readdirSync(d).forEach(f => {
        f = path.join(d, f);
        if (fs.statSync(f).isDirectory()) r = r.concat(walk(f));
        else if (f.endsWith('.js')) r.push(f);
    });
    return r;
}
walk('./dist').forEach(f => {
    let d = fs.readFileSync(f, 'utf8');
    if (d.includes('__vite_rsc_assets_manifest.js')) {
        d = d.replaceAll('__vite_rsc_assets_manifest.js', './__vite_rsc_assets_manifest.js');
        fs.writeFileSync(f, d);
        fs.writeFileSync(path.join(path.dirname(f), '__vite_rsc_assets_manifest.js'), 'export default {};');
        console.log('Manifiesto RSC auto-generado en:', f);
    }
});
