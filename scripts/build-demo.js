// Construit une version de démonstration du site en un seul fichier HTML,
// sans serveur : demo/index.html (catalogue intégré, API simulée dans le navigateur).
// Usage : node scripts/build-demo.js

const fs = require('fs');
const path = require('path');
const { categories, products, cities, currencies, SERVICE_FEE_RATE, FREE_DELIVERY_FROM } = require('../data/catalog');

const root = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

const html = read('public/index.html');
let body = html.slice(html.indexOf('<body>') + 6, html.indexOf('</body>'));
body = body.replace('<script src="/app.js"></script>', '');
body = body.replace(
  '<div class="footer-bottom">',
  '<div class="footer-bottom">Version de démonstration : les paiements sont simulés. Espace admin : <a href="#/admin" style="display:inline">#/admin</a> (clé « admin-panier »).<br>'
);

const catalog = { categories, products, cities, currencies, serviceFeeRate: SERVICE_FEE_RATE, freeDeliveryFrom: FREE_DELIVERY_FROM };
const safeJson = JSON.stringify(catalog).replace(/</g, '\\u003c');

const demoCss = `
:root { color-scheme: light; }
body { background: var(--bg); color: var(--ink); }
.header { top: env(safe-area-inset-top, 0px); }
body::before { content: ""; position: fixed; inset: 0 0 auto; height: env(safe-area-inset-top, 0px); z-index: 10; background: #fff; }
@media (prefers-reduced-motion: reduce) { *, *::before, *::after { animation: none !important; transition: none !important; } }
`;

const out = `<title>Panier du Pays</title>
<meta name="description" content="Depuis l'étranger, achetez vivres, vêtements, chaussures, cadeaux et paniers pour votre famille au Cameroun.">
<style>
${read('public/styles.css')}
${demoCss}
</style>
${body.trim()}
<script>window.PDP_CATALOG = ${safeJson};</script>
<script>
${read('demo/api-mock.js')}
</script>
<script>
${read('public/app.js')}
</script>
`;

fs.writeFileSync(path.join(root, 'demo', 'index.html'), out);
console.log(`demo/index.html généré (${Math.round(out.length / 1024)} Ko)`);
