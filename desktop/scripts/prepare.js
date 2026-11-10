// Builds desktop/app from the repo's index.html: bundles Firebase + fonts so the app starts with no internet.
// Run automatically by npm start / dist / release. Your index.html is never modified.
const fs = require('fs'), path = require('path');
const root = path.resolve(__dirname, '..');
const src = process.env.INDEX_PATH ? path.resolve(process.env.INDEX_PATH) : path.resolve(root, '..', 'index.html');
const out = path.join(root, 'app');
const nm = p => path.join(root, 'node_modules', p);
if (!fs.existsSync(src)) { console.error('index.html not found at ' + src + '  (set INDEX_PATH if it lives elsewhere)'); process.exit(1); }

fs.rmSync(out, { recursive: true, force: true });
['vendor', 'fonts'].forEach(d => fs.mkdirSync(path.join(out, d), { recursive: true }));

// 1) Firebase SDK (same version the web app uses)
['app', 'auth', 'firestore'].forEach(n => fs.copyFileSync(nm(`firebase/firebase-${n}-compat.js`), path.join(out, 'vendor', `firebase-${n}-compat.js`)));

// 2) Fonts (Inter + Sora, latin) so the look is identical offline
let css = '';
const fonts = [['inter', 'Inter', [400, 500, 600, 700]], ['sora', 'Sora', [400, 600, 700]]];
fonts.forEach(([pk, fam, ws]) => ws.forEach(w => {
  const f = `${pk}-latin-${w}-normal.woff2`;
  fs.copyFileSync(nm(`@fontsource/${pk}/files/${f}`), path.join(out, 'fonts', f));
  css += `@font-face{font-family:'${fam}';font-style:normal;font-weight:${w};font-display:swap;src:url(${f}) format('woff2')}\n`;
}));
fs.writeFileSync(path.join(out, 'fonts', 'fonts.css'), css);

// 3) Patch a COPY of index.html
let h = fs.readFileSync(src, 'utf8'), n = 0;
h = h.replace(/https:\/\/www\.gstatic\.com\/firebasejs\/[\d.]+\/(firebase-(?:app|auth|firestore)-compat\.js)/g, (_, f) => { n++; return 'vendor/' + f; });
if (n !== 3) { console.error('Expected 3 Firebase script tags, found ' + n + '. index.html changed; update scripts/prepare.js'); process.exit(1); }
const g = /<link href="https:\/\/fonts\.googleapis\.com\/css2[^"]*" rel="stylesheet">/;
if (g.test(h)) h = h.replace(g, '<link rel="stylesheet" href="fonts/fonts.css">'); else console.warn('Google Fonts link not found (skipped)');
h = h.replace("font-src https://fonts.gstatic.com data:", "font-src 'self' https://fonts.gstatic.com data:");
fs.writeFileSync(path.join(out, 'index.html'), h);

// 4) Icons / misc files that sit next to index.html
fs.readdirSync(path.dirname(src)).filter(f => /^(icon-.*\.png|apple-touch-icon\.png|favicon\.ico)$/i.test(f))
  .forEach(f => fs.copyFileSync(path.join(path.dirname(src), f), path.join(out, f)));
fs.copyFileSync(path.join(root, 'build', 'icon.png'), path.join(out, 'icon.png'));
console.log('app/ ready (' + Math.round(h.length / 1024) + ' KB index.html)');
