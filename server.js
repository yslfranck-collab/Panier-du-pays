// Panier du Pays — serveur Node.js sans dépendance externe.
// Lance : node server.js   (puis ouvrir http://localhost:3000)

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { categories, products, cities, currencies, SERVICE_FEE_RATE, FREE_DELIVERY_FROM } = require('./data/catalog');

const PORT = Number(process.env.PORT) || 3000;
const ADMIN_KEY = process.env.ADMIN_KEY || 'admin-panier';
const DB_FILE = process.env.DB_FILE || path.join(__dirname, 'data', 'db.json');
const PUBLIC_DIR = path.join(__dirname, 'public');

const productById = new Map(products.map((x) => [x.id, x]));

// ---------------------------------------------------------------- stockage
function loadDb() {
  try {
    return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
  } catch {
    return { orders: [], sharedCarts: [] };
  }
}
let db = loadDb();
function saveDb() {
  const tmp = DB_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
  fs.renameSync(tmp, DB_FILE);
}

// ---------------------------------------------------------------- utilitaires
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function code(len) {
  const bytes = crypto.randomBytes(len);
  let out = '';
  for (let i = 0; i < len; i++) out += ALPHABET[bytes[i] % ALPHABET.length];
  return out;
}

function str(v, max = 300) {
  return typeof v === 'string' ? v.trim().slice(0, max) : '';
}

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

// Recalcule toujours les prix côté serveur à partir du catalogue.
function priceItems(rawItems) {
  if (!Array.isArray(rawItems) || rawItems.length === 0) throw new HttpError(400, 'Le panier est vide.');
  if (rawItems.length > 100) throw new HttpError(400, 'Trop d\'articles dans le panier.');
  return rawItems.map((raw) => {
    const prod = productById.get(raw && raw.id);
    if (!prod) throw new HttpError(400, `Article inconnu : ${raw && raw.id}`);
    const qty = Math.floor(Number(raw.qty));
    if (!Number.isFinite(qty) || qty < 1 || qty > 99) throw new HttpError(400, 'Quantité invalide.');
    let option = null;
    let unit = prod.price;
    if (prod.options) {
      const opt = prod.options.find((o) => o.label === raw.option) || prod.options[0];
      option = opt.label;
      if (opt.price) unit = opt.price;
    }
    return { id: prod.id, name: prod.name, emoji: prod.emoji, option, optionLabel: prod.optionLabel, qty, unit, total: unit * qty };
  });
}

function quote(rawItems, cityName) {
  const items = priceItems(rawItems);
  const subtotal = items.reduce((s, i) => s + i.total, 0);
  const city = cities.find((c) => c.name === cityName) || null;
  const delivery = !city ? 0 : subtotal >= FREE_DELIVERY_FROM ? 0 : city.fee;
  const service = Math.round(subtotal * SERVICE_FEE_RATE);
  return { items, subtotal, delivery, service, total: subtotal + delivery + service, city: city && city.name, deliveryDelay: city && city.days };
}

const STATUSES = {
  en_attente: 'En attente de paiement',
  payee: 'Payée',
  preparation: 'En préparation',
  livraison: 'En cours de livraison',
  livree: 'Livrée',
  annulee: 'Annulée',
};

function publicOrder(o) {
  return { ...o, statusLabel: STATUSES[o.status] || o.status };
}

// ---------------------------------------------------------------- API
async function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => {
      data += chunk;
      if (data.length > 1e6) {
        reject(new HttpError(413, 'Requête trop volumineuse.'));
        req.destroy();
      }
    });
    req.on('end', () => {
      if (!data) return resolve({});
      try {
        resolve(JSON.parse(data));
      } catch {
        reject(new HttpError(400, 'JSON invalide.'));
      }
    });
    req.on('error', reject);
  });
}

function requireAdmin(req) {
  if (req.headers['x-admin-key'] !== ADMIN_KEY) throw new HttpError(401, 'Accès administrateur refusé.');
}

const routes = [
  ['GET', /^\/api\/catalog$/, () => ({
    categories, products, cities, currencies, serviceFeeRate: SERVICE_FEE_RATE, freeDeliveryFrom: FREE_DELIVERY_FROM,
  })],

  ['POST', /^\/api\/quote$/, async (req) => {
    const body = await readBody(req);
    return quote(body.items, body.city);
  }],

  // Panier partagé : créé au Cameroun, validé/payé par un proche à l'étranger.
  ['POST', /^\/api\/shared-carts$/, async (req) => {
    const body = await readBody(req);
    const q = quote(body.items, body.recipient && body.recipient.city);
    const requesterName = str(body.requester && body.requester.name, 80);
    if (!requesterName) throw new HttpError(400, 'Indiquez votre nom.');
    const cart = {
      code: code(6),
      createdAt: new Date().toISOString(),
      status: 'en_attente',
      requester: {
        name: requesterName,
        phone: str(body.requester.phone, 30),
        payerName: str(body.requester.payerName, 80),
      },
      message: str(body.message, 600),
      recipient: {
        name: str(body.recipient && body.recipient.name, 80) || requesterName,
        phone: str(body.recipient && body.recipient.phone, 30) || str(body.requester.phone, 30),
        city: q.city || '',
        quarter: str(body.recipient && body.recipient.quarter, 120),
        address: str(body.recipient && body.recipient.address, 300),
      },
      items: q.items.map(({ id, option, qty }) => ({ id, option, qty })),
      orderId: null,
    };
    db.sharedCarts.push(cart);
    saveDb();
    return { code: cart.code };
  }],

  ['GET', /^\/api\/shared-carts\/([A-Z0-9]{4,12})$/, (req, m) => {
    const cart = db.sharedCarts.find((c) => c.code === m[1].toUpperCase());
    if (!cart) throw new HttpError(404, 'Panier partagé introuvable.');
    const order = cart.orderId ? db.orders.find((o) => o.id === cart.orderId) : null;
    return { ...cart, quote: quote(cart.items, cart.recipient.city), order: order && publicOrder(order) };
  }],

  ['POST', /^\/api\/orders$/, async (req) => {
    const body = await readBody(req);
    const r = body.recipient || {};
    const payer = body.payer || {};
    const recipient = {
      name: str(r.name, 80), phone: str(r.phone, 30), city: str(r.city, 60),
      quarter: str(r.quarter, 120), address: str(r.address, 300), date: str(r.date, 20),
    };
    if (!recipient.name || !recipient.phone || !recipient.city) throw new HttpError(400, 'Nom, téléphone et ville du bénéficiaire sont obligatoires.');
    if (!cities.find((c) => c.name === recipient.city)) throw new HttpError(400, 'Ville de livraison inconnue.');
    const payerInfo = { name: str(payer.name, 80), email: str(payer.email, 120), phone: str(payer.phone, 30), country: str(payer.country, 60) };
    if (!payerInfo.name || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(payerInfo.email)) throw new HttpError(400, 'Nom et e-mail valides du payeur obligatoires.');
    const method = ['carte', 'paypal', 'orange_money', 'mtn_momo', 'virement'].includes(body.paymentMethod) ? body.paymentMethod : null;
    if (!method) throw new HttpError(400, 'Moyen de paiement invalide.');

    let shared = null;
    if (body.sharedCode) {
      shared = db.sharedCarts.find((c) => c.code === String(body.sharedCode).toUpperCase());
      if (!shared) throw new HttpError(404, 'Panier partagé introuvable.');
      if (shared.orderId) throw new HttpError(409, 'Ce panier a déjà été payé.');
    }

    const q = quote(body.items, recipient.city);
    const now = new Date().toISOString();
    const order = {
      id: 'PDP-' + code(6),
      createdAt: now,
      // Paiement simulé : à remplacer par un vrai prestataire (voir README).
      status: method === 'virement' ? 'en_attente' : 'payee',
      paymentMethod: method,
      currency: currencies[body.currency] ? body.currency : 'XAF',
      recipient,
      payer: payerInfo,
      giftMessage: str(body.giftMessage, 600),
      anonymous: Boolean(body.anonymous),
      sharedCode: shared ? shared.code : null,
      ...q,
      history: [{ status: method === 'virement' ? 'en_attente' : 'payee', at: now }],
    };
    db.orders.push(order);
    if (shared) {
      shared.orderId = order.id;
      shared.status = 'payee';
    }
    saveDb();
    return publicOrder(order);
  }],

  ['GET', /^\/api\/orders\/(PDP-[A-Z0-9]{6})$/i, (req, m) => {
    const order = db.orders.find((o) => o.id === m[1].toUpperCase());
    if (!order) throw new HttpError(404, 'Commande introuvable.');
    return publicOrder(order);
  }],

  ['GET', /^\/api\/admin\/orders$/, (req) => {
    requireAdmin(req);
    return { orders: db.orders.slice().reverse().map(publicOrder), sharedCarts: db.sharedCarts.slice().reverse(), statuses: STATUSES };
  }],

  ['PATCH', /^\/api\/admin\/orders\/(PDP-[A-Z0-9]{6})$/i, async (req, m) => {
    requireAdmin(req);
    const body = await readBody(req);
    const order = db.orders.find((o) => o.id === m[1].toUpperCase());
    if (!order) throw new HttpError(404, 'Commande introuvable.');
    if (!STATUSES[body.status]) throw new HttpError(400, 'Statut invalide.');
    order.status = body.status;
    order.history.push({ status: body.status, at: new Date().toISOString() });
    saveDb();
    return publicOrder(order);
  }],
];

// ---------------------------------------------------------------- fichiers statiques
const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.ico': 'image/x-icon', '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
};

function serveStatic(req, res, pathname) {
  let file = path.normalize(path.join(PUBLIC_DIR, decodeURIComponent(pathname)));
  if (!file.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    return res.end();
  }
  if (pathname === '/' || !fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(PUBLIC_DIR, 'index.html');
  res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
}

function send(res, status, obj) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(obj));
}

const server = http.createServer(async (req, res) => {
  const { pathname } = new URL(req.url, 'http://localhost');
  if (!pathname.startsWith('/api/')) return serveStatic(req, res, pathname);
  const route = routes.find(([method, re]) => method === req.method && re.test(pathname));
  if (!route) return send(res, 404, { error: 'Route inconnue.' });
  try {
    send(res, 200, await route[2](req, pathname.match(route[1])));
  } catch (err) {
    if (!(err instanceof HttpError)) console.error(err);
    send(res, err.status || 500, { error: err.status ? err.message : 'Erreur interne du serveur.' });
  }
});

if (require.main === module) {
  server.listen(PORT, () => console.log(`Panier du Pays : http://localhost:${PORT}`));
}

module.exports = { server, quote };
