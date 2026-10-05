// Vite çıktısını (dist/) tek bir HTML dosyasına gömer.
//   node scripts/build-single.mjs            -> dist/gym-tycoon.html (bağımsız, tam sayfa)
//   node scripts/build-single.mjs --fragment <çıktı>  -> doctype/head/body etiketsiz parça (gömülü önizleme için)
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');
let html = readFileSync(join(dist, 'index.html'), 'utf8');

const css = [];
html = html.replace(/<link rel="stylesheet"[^>]*href="\.\/([^"]+)"[^>]*>/g, (_, p) => {
  css.push(readFileSync(join(dist, p), 'utf8'));
  return '';
});
let js = '';
html = html.replace(/<script type="module"[^>]*src="\.\/([^"]+)"[^>]*><\/script>/g, (_, p) => {
  js += readFileSync(join(dist, p), 'utf8');
  return '';
});
js = js.replace(/<\/script/gi, '<\\/script');
const style = `<style>\n${css.join('\n')}\n</style>`;
const script = `<script type="module">\n${js}\n</script>`;

const args = process.argv.slice(2);
if (args[0] === '--fragment') {
  const title = (html.match(/<title>[\s\S]*?<\/title>/) || ['<title>Gym Tycoon 3D</title>'])[0];
  const body = html.match(/<body>([\s\S]*)<\/body>/)[1];
  const out = `${title}\n${style}\n${body}\n${script}\n`;
  writeFileSync(args[1], out);
  console.log('fragment ->', args[1], (out.length / 1024).toFixed(0) + ' KB');
} else {
  const out = html.replace('</head>', `${style}\n</head>`).replace('</body>', `${script}\n</body>`);
  const file = join(dist, 'gym-tycoon.html');
  writeFileSync(file, out);
  console.log('single file ->', file, (out.length / 1024).toFixed(0) + ' KB');
}
