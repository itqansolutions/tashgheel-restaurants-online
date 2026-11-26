// Builds css/tw/<page>.css for every page. Run: npm run build:css
const fs = require('fs'), path = require('path');
const postcss = require('postcss'), tailwind = require('tailwindcss');
const { pages, custom } = require('./pages');
const root = path.join(__dirname, '..');
(async () => {
  for (const p of pages) {
    const c = custom[p] || { extend: {}, plugins: [] };
    const extra = path.join(__dirname, 'src', p + '.css');
    const input = '@tailwind base;\n@tailwind components;\n@tailwind utilities;\n' + (fs.existsSync(extra) ? fs.readFileSync(extra, 'utf8') : '');
    const cfg = { content: [path.join(root, p + '.html'), path.join(root, 'js/*.js')], darkMode: c.darkMode || 'media', theme: { extend: c.extend || {} }, plugins: c.plugins || [] };
    const out = await postcss([tailwind(cfg)]).process(input, { from: undefined });
    fs.writeFileSync(path.join(root, 'css/tw', p + '.css'), out.css);
    console.log(p, (out.css.length / 1024).toFixed(1) + ' KB');
  }
})();
