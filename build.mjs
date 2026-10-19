import {mkdir,copyFile} from 'node:fs/promises';
await mkdir('dist',{recursive:true});
for(const file of ['index.html','style.css','app.js','crypto.js','config.js','_headers','logo.png','plans.js','website.js','remember-session.js','device-crypto.js','device-unlock.js','install.js','sw.js','manifest.webmanifest','icon-192.png','icon-512.png','icon-maskable.png'])await copyFile(file,'dist/'+file);
console.log('Static site built in dist/.');
