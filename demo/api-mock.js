/* API simulée dans le navigateur pour la version de démonstration (sans serveur).
   Reprend les règles de server.js ; les données restent dans le navigateur du visiteur. */
(() => {
  'use strict';
  const C = window.PDP_CATALOG;
  const KEY = 'pdp_demo_db';
  let mem = { orders: [], sharedCarts: [] };
  const load = () => { try { return JSON.parse(localStorage.getItem(KEY)) || mem; } catch { return mem; } };
  const save = (db) => { mem = db; try { localStorage.setItem(KEY, JSON.stringify(db)); } catch { /* mémoire seule */ } };

  const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const code = (n) => Array.from(crypto.getRandomValues(new Uint8Array(n)), (b) => ALPHABET[b % ALPHABET.length]).join('');
  const str = (v, max = 300) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
  const fail = (message) => { throw new Error(message); };
  const byId = new Map(C.products.map((x) => [x.id, x]));
  const STATUSES = { en_attente: 'En attente de paiement', payee: 'Payée', preparation: 'En préparation', livraison: 'En cours de livraison', livree: 'Livrée', annulee: 'Annulée' };
  const pub = (o) => ({ ...o, statusLabel: STATUSES[o.status] || o.status });

  function priceItems(raw) {
    if (!Array.isArray(raw) || !raw.length) fail('Le panier est vide.');
    return raw.map((r) => {
      const p = byId.get(r && r.id) || fail('Article inconnu.');
      const qty = Math.floor(Number(r.qty));
      if (!(qty >= 1 && qty <= 99)) fail('Quantité invalide.');
      let option = null;
      let unit = p.price;
      if (p.options) {
        const o = p.options.find((x) => x.label === r.option) || p.options[0];
        option = o.label;
        if (o.price) unit = o.price;
      }
      return { id: p.id, name: p.name, emoji: p.emoji, option, optionLabel: p.optionLabel, qty, unit, total: unit * qty };
    });
  }
  function quote(raw, cityName) {
    const items = priceItems(raw);
    const subtotal = items.reduce((s, i) => s + i.total, 0);
    const city = C.cities.find((c) => c.name === cityName) || null;
    const delivery = !city ? 0 : subtotal >= C.freeDeliveryFrom ? 0 : city.fee;
    const service = Math.round(subtotal * C.serviceFeeRate);
    return { items, subtotal, delivery, service, total: subtotal + delivery + service, city: city && city.name, deliveryDelay: city && city.days };
  }

  const routes = [
    ['GET', /^\/api\/catalog$/, () => C],
    ['POST', /^\/api\/shared-carts$/, (b) => {
      const db = load();
      const q = quote(b.items, b.recipient && b.recipient.city);
      const name = str(b.requester && b.requester.name, 80) || fail('Indiquez votre nom.');
      const phone = str(b.requester.phone, 30);
      const cart = {
        code: code(6), createdAt: new Date().toISOString(), status: 'en_attente',
        requester: { name, phone, payerName: str(b.requester.payerName, 80) },
        message: str(b.message, 600),
        recipient: { name: str(b.recipient && b.recipient.name, 80) || name, phone: str(b.recipient && b.recipient.phone, 30) || phone, city: q.city || '', quarter: str(b.recipient && b.recipient.quarter, 120), address: '' },
        items: q.items.map(({ id, option, qty }) => ({ id, option, qty })), orderId: null,
      };
      db.sharedCarts.push(cart);
      save(db);
      return { code: cart.code };
    }],
    ['GET', /^\/api\/shared-carts\/([A-Z0-9]{4,12})$/, (b, m) => {
      const db = load();
      const cart = db.sharedCarts.find((c) => c.code === m[1].toUpperCase()) || fail('Panier partagé introuvable.');
      const order = cart.orderId && db.orders.find((o) => o.id === cart.orderId);
      return { ...cart, quote: quote(cart.items, cart.recipient.city), order: order ? pub(order) : null };
    }],
    ['POST', /^\/api\/orders$/, (b) => {
      const db = load();
      const r = b.recipient || {};
      const recipient = { name: str(r.name, 80), phone: str(r.phone, 30), city: str(r.city, 60), quarter: str(r.quarter, 120), address: str(r.address, 300), date: str(r.date, 20) };
      if (!recipient.name || !recipient.phone || !recipient.city) fail('Nom, téléphone et ville du bénéficiaire sont obligatoires.');
      const p = b.payer || {};
      const payer = { name: str(p.name, 80), email: str(p.email, 120), phone: str(p.phone, 30), country: str(p.country, 60) };
      if (!payer.name || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(payer.email)) fail('Nom et e-mail valides du payeur obligatoires.');
      let shared = null;
      if (b.sharedCode) {
        shared = db.sharedCarts.find((c) => c.code === b.sharedCode) || fail('Panier partagé introuvable.');
        if (shared.orderId) fail('Ce panier a déjà été payé.');
      }
      const now = new Date().toISOString();
      const status = b.paymentMethod === 'virement' ? 'en_attente' : 'payee';
      const order = {
        id: 'PDP-' + code(6), createdAt: now, status, paymentMethod: b.paymentMethod, currency: b.currency,
        recipient, payer, giftMessage: str(b.giftMessage, 600), anonymous: !!b.anonymous, sharedCode: shared ? shared.code : null,
        ...quote(b.items, recipient.city), history: [{ status, at: now }],
      };
      db.orders.push(order);
      if (shared) { shared.orderId = order.id; shared.status = 'payee'; }
      save(db);
      return pub(order);
    }],
    ['GET', /^\/api\/orders\/(PDP-[A-Z0-9]{6})$/i, (b, m) => pub(load().orders.find((o) => o.id === m[1].toUpperCase()) || fail('Commande introuvable.'))],
    ['GET', /^\/api\/admin\/orders$/, (b, m, h) => {
      if (h['x-admin-key'] !== 'admin-panier') fail('Clé incorrecte. En démonstration, la clé est : admin-panier');
      const db = load();
      return { orders: db.orders.slice().reverse().map(pub), sharedCarts: db.sharedCarts.slice().reverse(), statuses: STATUSES };
    }],
    ['PATCH', /^\/api\/admin\/orders\/(PDP-[A-Z0-9]{6})$/i, (b, m, h) => {
      if (h['x-admin-key'] !== 'admin-panier') fail('Accès administrateur refusé.');
      const db = load();
      const o = db.orders.find((x) => x.id === m[1].toUpperCase()) || fail('Commande introuvable.');
      if (!STATUSES[b.status]) fail('Statut invalide.');
      o.status = b.status;
      o.history.push({ status: b.status, at: new Date().toISOString() });
      save(db);
      return pub(o);
    }],
  ];

  window.PDP_API = async (path, opts = {}) => {
    const method = opts.method || 'GET';
    const route = routes.find(([m, re]) => m === method && re.test(path)) || fail('Route inconnue.');
    const body = JSON.parse(JSON.stringify(opts.body || {}));
    return route[2](body, path.match(route[1]), opts.headers || {});
  };
})();
