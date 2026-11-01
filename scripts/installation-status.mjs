import {readFile} from 'node:fs/promises';
try{const s=JSON.parse(await readFile(new URL('../state/installation.json',import.meta.url),'utf8'));console.log(JSON.stringify({pendingCreation:s.pendingCreation||null,workflows:{ingress:s.ingress||null,worker:s.worker||null,adminApi:s['admin-api']||null}},null,2));}catch{console.error('No se encontró estado válido de instalación.');process.exitCode=1;}
