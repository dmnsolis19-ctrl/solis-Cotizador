#!/usr/bin/env bash
set -e
echo 'Starting verified build...'
npx vinext build

echo 'Applying RSC manifest patch...'
node -e "const fs=require('fs');const path=require('path');function patch(dir){if(!fs.existsSync(dir))return;fs.readdirSync(dir,{withFileTypes:true}).forEach(e=>{const p=path.join(dir,e.name);if(e.isDirectory())patch(p);else if(e.name.endsWith('.js')){let c=fs.readFileSync(p,'utf8');if(c.includes('__vite_rsc_assets_manifest.js')){c=c.replaceAll('__vite_rsc_assets_manifest.js','./__vite_rsc_assets_manifest.js');fs.writeFileSync(p,c);}}});fs.writeFileSync(path.join(dir,'__vite_rsc_assets_manifest.js'),'export default {};');}patch('./dist');console.log('RSC manifest patch applied successfully.');"
echo 'Build and patch completed.'
