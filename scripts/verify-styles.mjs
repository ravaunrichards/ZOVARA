import {readFile} from 'node:fs/promises';
import path from 'node:path';
const root=process.cwd();const reg=JSON.parse(await readFile(path.join(root,'assets/styles/registry.json'),'utf8'));
const ids=new Set(reg.styles.map(s=>s.id));const dims=reg.combinationDimensions;const expected=dims.palettes.length*dims.materials.length*dims.shapes.length*dims.motion.length;
const errors=[];if(reg.count!==reg.styles.length)errors.push('count property does not match styles');if(reg.styles.length!==1000||expected!==1000)errors.push(`expected 1000 styles, got ${reg.styles.length} and dimensional product ${expected}`);if(ids.size!==reg.styles.length)errors.push('duplicate style IDs');for(const s of reg.styles){if(!s.id||!s.palette||!s.material||!s.shape||!s.motion||s.validated!==true)errors.push(`invalid style ${s.id}`);}
if(errors.length){console.error(errors.join('\n'));process.exit(1);}console.log(`PASS ${reg.styles.length} unique validated style combinations; ${dims.palettes.length} palettes × ${dims.materials.length} materials × ${dims.shapes.length} shapes × ${dims.motion.length} motion modes.`);
