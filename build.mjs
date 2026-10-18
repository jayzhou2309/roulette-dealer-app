import { readFileSync, writeFileSync } from 'node:fs';
const r = (f) => readFileSync(new URL(f, import.meta.url), 'utf8');
const out = r('./src/app.html')
  .replace('/*STYLES*/', () => r('./src/styles.css'))
  .replace('/*CORE*/', () => r('./src/core.js'))
  .replace('/*APP*/', () => r('./src/app.js'));
writeFileSync(new URL('./dist/index.html', import.meta.url), out);
console.log(`dist/index.html ${(out.length / 1024).toFixed(1)} KB`);
