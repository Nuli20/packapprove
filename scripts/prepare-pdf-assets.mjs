import {cp,mkdir,copyFile} from 'node:fs/promises';
await mkdir('public/pdf-assets',{recursive:true});
for(const folder of ['wasm','cmaps','standard_fonts'])await cp(`node_modules/pdfjs-dist/${folder}`,`public/pdf-assets/${folder}`,{recursive:true});
await copyFile('node_modules/pdfjs-dist/build/pdf.worker.min.mjs','public/pdf.worker.min.mjs');
console.log('Prepared local PDF.js worker, font/CMap and WASM assets from the pinned dependency.');
