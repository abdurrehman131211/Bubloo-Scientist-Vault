import {mkdir,copyFile} from 'node:fs/promises';
await mkdir('dist',{recursive:true});
for(const file of ['index.html','style.css','app.js','crypto.js','config.js','_headers'])await copyFile(file,'dist/'+file);
console.log('Static site built in dist/.');
