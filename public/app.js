/* Panier du Pays — application monopage (sans framework). */
(() => {
  'use strict';

  // ================================================================ état
  const S = {
    catalog: null,
    cart: load('pdp_cart', []), // [{ id, option, qty }]
    favs: load('pdp_favs', []),
    currency: load('pdp_currency', guessCurrency()),
    orders: load('pdp_orders', []), // numéros des commandes passées sur cet appareil
    shared: load('pdp_shared', []), // codes des paniers partagés créés sur cet appareil
    checkoutSource: null, // { sharedCode, items, recipient } quand on paie un panier partagé
  };

  function load(key, fallback) {
    try {
      const v = JSON.parse(localStorage.getItem(key));
      return v == null ? fallback : v;
    } catch {
      return fallback;
    }
  }
  function save(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* stockage indisponible */ }
  }
  function guessCurrency() {
    const lang = (navigator.language || 'fr-FR').toUpperCase();
    if (/-(US)$/.test(lang)) return 'USD';
    if (/-(CA)$/.test(lang)) return 'CAD';
    if (/-(GB)$/.test(lang)) return 'GBP';
    if (/-(CH)$/.test(lang)) return 'CHF';
    if (/-(CM)$/.test(lang)) return 'XAF';
    return 'EUR';
  }

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const app = $('#app');

  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // ================================================================ API
  async function api(path, opts = {}) {
    const res = await fetch(path, {
      method: opts.method || 'GET',
      headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) },
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Une erreur est survenue.');
    return data;
  }

  // ================================================================ prix
  function money(xaf, cur = S.currency) {
    const c = S.catalog.currencies[cur] || S.catalog.currencies.XAF;
    const v = xaf / c.rate;
    if (cur === 'XAF') return Math.round(v).toLocaleString('fr-FR').replace(/ | /g, ' ') + ' FCFA';
    const n = v.toLocaleString('fr-FR', { minimumFractionDigits: c.decimals, maximumFractionDigits: c.decimals });
    return ['€', 'CHF'].includes(c.symbol) ? `${n} ${c.symbol}` : `${c.symbol}${n}`;
  }
  const dual = (xaf) => (S.currency === 'XAF' ? money(xaf) : `${money(xaf)} · ${money(xaf, 'XAF')}`);
  const pct = (prod) => (prod.oldPrice ? Math.round((1 - prod.price / prod.oldPrice) * 100) : 0);
  const kfmt = (n) => (n >= 1000 ? (n / 1000).toFixed(1).replace('.0', '').replace('.', ',') + 'k' : String(n));

  function unitPrice(prod, optLabel) {
    if (!prod.options) return prod.price;
    const o = prod.options.find((x) => x.label === optLabel) || prod.options[0];
    return o.price || prod.price;
  }

  // prix barré cohérent avec l'option choisie (même remise que le prix de base)
  function oldUnit(prod, optLabel) {
    if (!prod.oldPrice) return null;
    return Math.round((unitPrice(prod, optLabel) * prod.oldPrice) / prod.price / 100) * 100;
  }

  // ================================================================ produits
  const byId = (id) => S.catalog.products.find((x) => x.id === id);
  const catOf = (slug) => S.catalog.categories.find((c) => c.slug === slug);
  const bg = (prod) => {
    const c = catOf(prod.cat);
    return `background:linear-gradient(160deg, ${c ? c.color : '#f4f4f4'} 0%, #fafafa 100%)`;
  };
  const stars = (r) => '★★★★★'.slice(0, Math.round(r)) + '☆☆☆☆☆'.slice(0, 5 - Math.round(r));

  function card(prod, { flash = false } = {}) {
    const off = pct(prod);
    const fav = S.favs.includes(prod.id);
    const tags = [];
    if (off) tags.push(`<span class="tag">-${off}%</span>`);
    else if (prod.tags.includes('new')) tags.push('<span class="tag new">Nouveau</span>');
    else if (prod.tags.includes('best')) tags.push('<span class="tag best">Top vente</span>');
    const soldPct = Math.min(95, 40 + (prod.sold % 55));
    return `
      <article class="card">
        <div class="card-media">
          <a href="#/produit/${prod.id}" class="card-img" style="${bg(prod)}" aria-label="${esc(prod.name)}">
            <span class="emoji">${prod.emoji}</span>
            ${tags.join('')}
          </a>
          <button class="fav" data-fav="${prod.id}" aria-label="Ajouter aux favoris">${fav ? '❤️' : '🤍'}</button>
          <button class="quick-add" data-quick="${prod.id}" aria-label="Ajouter au panier">+</button>
        </div>
        <a href="#/produit/${prod.id}" class="card-name">${esc(prod.name)}</a>
        <div class="price-row">
          <span class="price ${off ? 'sale' : ''}">${money(prod.price)}</span>
          ${prod.oldPrice ? `<span class="old">${money(prod.oldPrice)}</span>` : ''}
        </div>
        ${flash
          ? `<div class="sold-bar"><i style="width:${soldPct}%"></i></div><div class="meta">${soldPct}% déjà vendus</div>`
          : `<div class="meta"><span class="stars">${stars(prod.rating)}</span><span>(${kfmt(prod.reviews)})</span><span>· ${kfmt(prod.sold)} vendus</span></div>`}
      </article>`;
  }

  // ================================================================ panier & favoris
  function cartCount() { return S.cart.reduce((s, i) => s + i.qty, 0); }
  function cartSubtotal(items = S.cart) {
    return items.reduce((s, i) => {
      const prod = byId(i.id);
      return prod ? s + unitPrice(prod, i.option) * i.qty : s;
    }, 0);
  }
  function persistCart() {
    S.cart = S.cart.filter((i) => byId(i.id));
    save('pdp_cart', S.cart);
    const n = cartCount();
    [$('#cart-count'), $('#tab-cart-count')].forEach((b) => { b.textContent = n > 99 ? '99+' : n; b.hidden = n === 0; });
  }
  function addToCart(id, option, qty = 1) {
    const prod = byId(id);
    if (!prod) return;
    const opt = prod.options ? (option || prod.options[0].label) : null;
    const line = S.cart.find((i) => i.id === id && i.option === opt);
    if (line) line.qty = Math.min(99, line.qty + qty);
    else S.cart.push({ id, option: opt, qty });
    persistCart();
    toast(`✓ ${prod.name} ajouté au panier`);
  }
  function toggleFav(id) {
    const i = S.favs.indexOf(id);
    if (i >= 0) S.favs.splice(i, 1); else S.favs.push(id);
    save('pdp_favs', S.favs);
    $$(`[data-fav="${id}"]`).forEach((b) => { b.textContent = b.classList.contains('fav-lg') ? (i >= 0 ? '🤍' : '❤️') : (i >= 0 ? '🤍' : '❤️'); });
    toast(i >= 0 ? 'Retiré des favoris' : '❤️ Ajouté aux favoris');
    if (location.hash.startsWith('#/favoris')) render();
  }

  // ================================================================ interface commune
  let toastTimer;
  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), 2200);
  }
  function openModal(html) {
    $('#modal-body').innerHTML = html;
    $('#modal').hidden = false;
    document.body.style.overflow = 'hidden';
  }
  function closeModal() {
    $('#modal').hidden = true;
    document.body.style.overflow = '';
  }
  $('#modal').addEventListener('click', (e) => { if (e.target.closest('[data-close]')) closeModal(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModal(); });

  function quickAdd(id) {
    const prod = byId(id);
    if (!prod.options) return addToCart(id, null, 1);
    openModal(`
      <div style="display:flex;gap:14px;align-items:center">
        <div class="cart-thumb" style="${bg(prod)};width:80px">${prod.emoji}</div>
        <div><h2>${esc(prod.name)}</h2><div class="price sale" id="qa-price">${money(unitPrice(prod))}</div></div>
      </div>
      <div class="opt-label">${esc(prod.optionLabel || 'Option')}</div>
      <div class="opts" id="qa-opts">${optionButtons(prod, prod.options[0].label)}</div>
      <button class="btn btn-block" style="margin-top:20px" id="qa-add">Ajouter au panier</button>
      <p class="hint" style="margin-top:10px"><a class="link" href="#/produit/${prod.id}" data-close>Voir la fiche complète</a></p>`);
    let sel = prod.options[0].label;
    $('#qa-opts').addEventListener('click', (e) => {
      const b = e.target.closest('[data-opt]');
      if (!b) return;
      sel = b.dataset.opt;
      $('#qa-opts').innerHTML = optionButtons(prod, sel);
      $('#qa-price').textContent = money(unitPrice(prod, sel));
    });
    $('#qa-add').addEventListener('click', () => { addToCart(id, sel, 1); closeModal(); });
  }
  function optionButtons(prod, selected) {
    return prod.options.map((o) => `<button class="opt ${o.label === selected ? 'active' : ''}" data-opt="${esc(o.label)}">${esc(o.label)}${o.price && o.price !== prod.price ? `<small>${money(o.price)}</small>` : ''}</button>`).join('');
  }

  // délégation globale : favoris, ajout rapide
  document.addEventListener('click', (e) => {
    const fav = e.target.closest('[data-fav]');
    if (fav) { e.preventDefault(); return toggleFav(fav.dataset.fav); }
    const qa = e.target.closest('[data-quick]');
    if (qa) { e.preventDefault(); return quickAdd(qa.dataset.quick); }
  });

  // ================================================================ en-tête
  function setupHeader() {
    const cur = $('#currency');
    cur.innerHTML = Object.keys(S.catalog.currencies).map((k) => `<option value="${k}" ${k === S.currency ? 'selected' : ''}>${k === 'XAF' ? 'FCFA' : k}</option>`).join('');
    cur.addEventListener('change', () => { S.currency = cur.value; save('pdp_currency', S.currency); render(); });

    $('#cat-nav').innerHTML = [
      '<a href="#/" data-nav="home">Accueil</a>',
      '<a href="#/flash" data-nav="flash" class="hot">⚡ Ventes Flash</a>',
      ...S.catalog.categories.map((c) => `<a href="#/categorie/${c.slug}" data-nav="${c.slug}">${esc(c.name)}</a>`),
      '<a href="#/panier-partage" data-nav="partage">🤝 Panier partagé</a>',
    ].join('');

    $('#search-form').addEventListener('submit', (e) => {
      e.preventDefault();
      const q = $('#search-input').value.trim();
      location.hash = q ? `#/recherche/${encodeURIComponent(q)}` : '#/';
    });

    const msgs = [
      '🚚 Livraison offerte dès 50 000 FCFA d\'achat',
      '📸 Photo de la remise du colis envoyée sur WhatsApp',
      '🇨🇲 Livraison à Yaoundé et Douala en 24 h',
      '🤝 Nouveau : votre famille compose le panier, vous payez d\'où vous êtes',
      '💳 Carte, PayPal, Orange Money et MTN MoMo acceptés',
    ];
    let k = 0;
    setInterval(() => { k = (k + 1) % msgs.length; $('#promo-bar').innerHTML = `<span>${msgs[k]}</span>`; }, 4000);
    $('#promo-bar').innerHTML = `<span>${msgs[0]}</span>`;
    $('#year').textContent = new Date().getFullYear();
  }

  function setActiveNav(key, tab) {
    $$('#cat-nav a').forEach((a) => a.classList.toggle('active', a.dataset.nav === key));
    $$('.tabbar a').forEach((a) => a.classList.toggle('active', a.dataset.tab === tab));
  }

  // ================================================================ pages
  let timers = [];
  function clearTimers() { timers.forEach(clearInterval); timers = []; }

  function countdownHtml() { return '<span class="countdown" data-countdown>Se termine dans <b>00</b>:<b>00</b>:<b>00</b></span>'; }
  function startCountdowns() {
    const tick = () => {
      const now = new Date();
      const end = new Date(now); end.setHours(24, 0, 0, 0);
      let s = Math.max(0, Math.floor((end - now) / 1000));
      const h = String(Math.floor(s / 3600)).padStart(2, '0'); s %= 3600;
      const m = String(Math.floor(s / 60)).padStart(2, '0');
      const sec = String(s % 60).padStart(2, '0');
      $$('[data-countdown]').forEach((el) => { el.innerHTML = `Se termine dans <b>${h}</b>:<b>${m}</b>:<b>${sec}</b>`; });
    };
    tick();
    timers.push(setInterval(tick, 1000));
  }

  // ---------------------------------------------------------------- accueil
  function pageHome() {
    setActiveNav('home', 'home');
    const P = S.catalog.products;
    const flash = P.filter((x) => x.tags.includes('flash')).sort((a, b) => pct(b) - pct(a));
    const paniers = P.filter((x) => x.cat === 'paniers');
    const best = P.filter((x) => x.tags.includes('best')).sort((a, b) => b.sold - a.sold);
    const slides = [
      { bg: 'linear-gradient(120deg,#0b5d46,#119b72)', small: 'NOUVEAU · PANIER PARTAGÉ', h: 'Ils choisissent au pays,<br>vous validez d\'ici.', p: 'Votre famille compose son panier au Cameroun et vous envoie le lien. Vous payez en un clic.', cta: 'Découvrir', href: '#/panier-partage', art: '🤝' },
      { bg: 'linear-gradient(120deg,#b3121f,#f2542d)', small: 'FÊTES DE FIN D\'ANNÉE', h: 'Jusqu\'à -30 %<br>sur les paniers de fête', p: 'Poulets, riz, boissons et cadeaux livrés à la maison pour Noël et le Nouvel An.', cta: 'J\'en profite', href: '#/produit/panier-noel', art: '🎄' },
      { bg: 'linear-gradient(120deg,#1c1c1c,#4a4a4a)', small: 'DU MARCHÉ À LA MAISON', h: 'Le marché du pays,<br>livré en 24 h', p: 'Manioc, plantain, ndolè, viande fraîche : achetés le matin, livrés le jour même.', cta: 'Faire le marché', href: '#/categorie/vivres', art: '🍌' },
    ];
    app.innerHTML = `
      <section class="hero" id="hero">
        ${slides.map((s, i) => `
          <div class="slide ${i === 0 ? 'active' : ''}" style="background:${s.bg}">
            <div class="slide-text">
              <small>${s.small}</small>
              <h1>${s.h}</h1>
              <p>${s.p}</p>
              <a class="btn btn-white" href="${s.href}">${s.cta} →</a>
            </div>
            <div class="slide-art">${s.art}</div>
          </div>`).join('')}
        <div class="hero-dots">${slides.map((_, i) => `<button data-slide="${i}" class="${i === 0 ? 'active' : ''}" aria-label="Diapositive ${i + 1}"></button>`).join('')}</div>
      </section>

      <section class="section">
        <div class="cat-circles">
          ${S.catalog.categories.map((c) => `<a class="cat-circle" href="#/categorie/${c.slug}"><span style="background:${c.color}">${c.emoji}</span>${esc(c.name)}</a>`).join('')}
        </div>
      </section>

      <section class="section flash">
        <div class="section-head">
          <div class="flash-title"><h2>⚡ Ventes Flash</h2>${countdownHtml()}</div>
          <a href="#/flash">Tout voir ›</a>
        </div>
        <div class="h-scroll">${flash.map((x) => card(x, { flash: true })).join('')}</div>
      </section>

      <section class="section">
        <div class="section-head"><h2>Comment ça marche ?</h2><a href="#/comment-ca-marche">En savoir plus ›</a></div>
        ${stepsHtml()}
      </section>

      <section class="section">
        <div class="section-head"><h2>🧺 Paniers tout prêts</h2><a href="#/categorie/paniers">Tout voir ›</a></div>
        <div class="h-scroll">${paniers.map((x) => card(x)).join('')}</div>
      </section>

      <section class="section">${shareCtaHtml()}</section>

      <section class="section">
        <div class="section-head"><h2>🔥 Les plus offerts</h2><a href="#/meilleures-ventes">Tout voir ›</a></div>
        <div class="h-scroll">${best.slice(0, 12).map((x) => card(x)).join('')}</div>
      </section>

      <section class="section">
        <div class="section-head"><h2>Pour vous</h2></div>
        <div class="grid" id="for-you"></div>
        <div style="text-align:center;margin-top:20px"><button class="btn btn-outline" id="more">Voir plus d'articles</button></div>
      </section>

      <section class="section">${trustHtml()}</section>`;

    // carrousel
    let cur = 0;
    const go = (i) => {
      cur = i;
      $$('.slide').forEach((s, k) => s.classList.toggle('active', k === i));
      $$('.hero-dots button').forEach((b, k) => b.classList.toggle('active', k === i));
    };
    $('.hero-dots').addEventListener('click', (e) => { const b = e.target.closest('[data-slide]'); if (b) go(+b.dataset.slide); });
    timers.push(setInterval(() => go((cur + 1) % slides.length), 5500));
    startCountdowns();

    // "Pour vous" : mélange stable du catalogue, chargé par pages
    const mixed = P.slice().sort((a, b) => hash(a.id) - hash(b.id));
    let shown = 0;
    const more = () => {
      const next = mixed.slice(shown, shown + 20);
      $('#for-you').insertAdjacentHTML('beforeend', next.map((x) => card(x)).join(''));
      shown += next.length;
      $('#more').hidden = shown >= mixed.length;
    };
    $('#more').addEventListener('click', more);
    more();
  }
  function hash(s) { let h = 7; for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) % 100003; return h; }

  function stepsHtml() {
    return `<div class="steps">
      <div class="step"><div class="step-num">1</div><h3>Choisissez</h3><p>Vivres, habits, chaussures, cadeaux… ou un panier tout prêt. Prix affichés dans votre devise.</p></div>
      <div class="step"><div class="step-num">2</div><h3>Indiquez le bénéficiaire</h3><p>Nom, téléphone, ville et quartier de votre proche au Cameroun.</p></div>
      <div class="step"><div class="step-num">3</div><h3>Payez d'où vous êtes</h3><p>Carte bancaire, PayPal ou Mobile Money. Paiement 100 % sécurisé.</p></div>
      <div class="step"><div class="step-num">4</div><h3>On livre au pays</h3><p>Livraison en 24 h à Yaoundé et Douala, photo de la remise envoyée sur WhatsApp.</p></div>
    </div>`;
  }
  function shareCtaHtml() {
    return `<div class="share-cta">
      <div>
        <h2>Le panier partagé 🤝</h2>
        <p>Maman sait mieux que personne ce dont la maison a besoin. Elle compose son panier sur Panier du Pays au Cameroun, vous envoie le lien par WhatsApp, et vous n'avez plus qu'à valider et payer depuis Paris, Montréal ou Berlin.</p>
        <a class="btn btn-white" href="#/panier-partage">Comment ça marche ?</a>
      </div>
      <div class="share-visual">
        <figure>🧺<figcaption>Composé au pays</figcaption></figure><i>→ 📲 →</i><figure>💳<figcaption>Payé à l'étranger</figcaption></figure>
      </div>
      <div class="flag"></div>
    </div>`;
  }
  function trustHtml() {
    return `<div class="trust">
      <div><span>🔒</span><span><b>Paiement sécurisé</b>Carte, PayPal, Mobile Money</span></div>
      <div><span>🚚</span><span><b>Livraison 24–96 h</b>Dans tout le Cameroun</span></div>
      <div><span>📸</span><span><b>Preuve de livraison</b>Photo envoyée sur WhatsApp</span></div>
      <div><span>💬</span><span><b>Service client</b>7 j/7 en français et en anglais</span></div>
    </div>`;
  }

  // ---------------------------------------------------------------- listes
  function pageList({ title, products, navKey, crumbs, tab = 'categories', subtitle = '' }) {
    setActiveNav(navKey, tab);
    let filter = 'all';
    let sort = 'reco';
    app.innerHTML = `
      <div class="breadcrumb"><a href="#/">Accueil</a> › ${crumbs}</div>
      <h1 class="page-title">${title}</h1>
      ${subtitle ? `<p class="muted" style="margin:0">${subtitle}</p>` : ''}
      <div class="toolbar">
        <div class="chips" id="chips">
          <button class="chip active" data-f="all">Tout</button>
          <button class="chip" data-f="promo">Promotions</button>
          <button class="chip" data-f="new">Nouveautés</button>
          <button class="chip" data-f="best">Top ventes</button>
          <button class="chip" data-f="lt10">Moins de ${money(10000)}</button>
        </div>
        <select class="select" id="sort" aria-label="Trier">
          <option value="reco">Recommandé</option>
          <option value="asc">Prix croissant</option>
          <option value="desc">Prix décroissant</option>
          <option value="sold">Plus vendus</option>
          <option value="rating">Mieux notés</option>
          <option value="off">Plus grosse remise</option>
        </select>
      </div>
      <div class="grid" id="list"></div>`;
    const draw = () => {
      let list = products.slice();
      if (filter === 'promo') list = list.filter((x) => x.oldPrice);
      if (filter === 'new') list = list.filter((x) => x.tags.includes('new'));
      if (filter === 'best') list = list.filter((x) => x.tags.includes('best'));
      if (filter === 'lt10') list = list.filter((x) => x.price < 10000);
      const sorters = {
        asc: (a, b) => a.price - b.price, desc: (a, b) => b.price - a.price, sold: (a, b) => b.sold - a.sold,
        rating: (a, b) => b.rating - a.rating, off: (a, b) => pct(b) - pct(a),
      };
      if (sorters[sort]) list.sort(sorters[sort]);
      $('#list').outerHTML = list.length
        ? `<div class="grid" id="list">${list.map((x) => card(x)).join('')}</div>`
        : '<div id="list" class="empty"><div class="big">🔎</div><h2>Aucun article</h2><p>Essayez un autre filtre.</p></div>';
    };
    $('#chips').addEventListener('click', (e) => {
      const b = e.target.closest('[data-f]');
      if (!b) return;
      filter = b.dataset.f;
      $$('#chips .chip').forEach((c) => c.classList.toggle('active', c === b));
      draw();
    });
    $('#sort').addEventListener('change', (e) => { sort = e.target.value; draw(); });
    draw();
  }

  function pageCategory(slug) {
    const c = catOf(slug);
    if (!c) return pageNotFound();
    pageList({ title: `${c.emoji} ${esc(c.name)}`, products: S.catalog.products.filter((x) => x.cat === slug), navKey: slug, crumbs: esc(c.name) });
  }
  function pageFlash() {
    pageList({ title: '⚡ Ventes Flash', products: S.catalog.products.filter((x) => x.tags.includes('flash')), navKey: 'flash', crumbs: 'Ventes Flash', subtitle: 'Les prix les plus bas, renouvelés chaque jour à minuit.' });
    $('.page-title').insertAdjacentHTML('afterend', `<div style="margin:6px 0">${countdownHtml()}</div>`);
    startCountdowns();
  }
  function pageSearch(q) {
    const norm = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    const words = norm(q).split(/\s+/).filter(Boolean);
    const list = S.catalog.products.filter((x) => {
      const hay = norm(`${x.name} ${x.description} ${(catOf(x.cat) || {}).name} ${(x.contents || []).join(' ')} ${x.origin}`);
      return words.every((w) => hay.includes(w));
    });
    $('#search-input').value = q;
    pageList({ title: `Résultats pour « ${esc(q)} »`, products: list, navKey: '', crumbs: 'Recherche', subtitle: `${list.length} article(s) trouvé(s)`, tab: 'home' });
  }
  function pageCategories() {
    setActiveNav('', 'categories');
    app.innerHTML = `<h1 class="page-title">Toutes les catégories</h1>
      <div class="section">${S.catalog.categories.map((c) => {
        const items = S.catalog.products.filter((x) => x.cat === c.slug);
        return `<div class="section">
          <div class="section-head"><h2>${c.emoji} ${esc(c.name)}</h2><a href="#/categorie/${c.slug}">${items.length} articles ›</a></div>
          <div class="h-scroll">${items.slice(0, 8).map((x) => card(x)).join('')}</div></div>`;
      }).join('')}</div>`;
  }
  function pageFavs() {
    setActiveNav('', 'favoris');
    const list = S.favs.map(byId).filter(Boolean);
    app.innerHTML = `<h1 class="page-title">Mes favoris</h1>` + (list.length
      ? `<p class="muted">${list.length} article(s)</p><div class="grid">${list.map((x) => card(x)).join('')}</div>`
      : '<div class="empty"><div class="big">🤍</div><h2>Aucun favori pour l\'instant</h2><p>Touchez le cœur d\'un article pour le retrouver ici.</p><a class="btn" href="#/">Découvrir les articles</a></div>');
  }

  // ---------------------------------------------------------------- fiche produit
  function pageProduct(id) {
    const prod = byId(id);
    if (!prod) return pageNotFound();
    const c = catOf(prod.cat);
    setActiveNav(prod.cat, 'categories');
    let opt = prod.options ? prod.options[0].label : null;
    let qty = 1;
    const off = pct(prod);
    const related = S.catalog.products.filter((x) => x.cat === prod.cat && x.id !== prod.id).slice(0, 10);
    const angles = [prod.emoji, c.emoji, '🎁'];
    const reviewers = [
      ['Christelle, Lyon', 'Ma mère a reçu la commande le lendemain, tout était frais. Merci pour la photo !'],
      ['Junior, Montréal', 'Très pratique, le livreur a appelé mon frère avant d\'arriver. Je recommande.'],
      ['Aïcha, Bruxelles', 'Qualité au rendez-vous, et le message cadeau a fait pleurer ma grand-mère 😅'],
    ];
    app.innerHTML = `
      <div class="breadcrumb"><a href="#/">Accueil</a> › <a href="#/categorie/${c.slug}">${esc(c.name)}</a> › ${esc(prod.name)}</div>
      <div class="product">
        <div class="gallery">
          <div class="thumbs">${angles.map((a, i) => `<button style="${bg(prod)}" class="${i === 0 ? 'active' : ''}" data-thumb="${a}">${a}</button>`).join('')}</div>
          <div class="main-img" style="${bg(prod)}"><span id="main-emoji">${prod.emoji}</span>${off ? `<span class="tag" style="top:14px;font-size:13px">-${off}%</span>` : ''}</div>
        </div>
        <div class="p-info">
          <h1>${esc(prod.name)}</h1>
          <div class="meta" style="font-size:13px"><span class="stars">${stars(prod.rating)}</span> <b style="color:var(--ink)">${prod.rating.toFixed(1)}</b> · ${kfmt(prod.reviews)} avis · ${kfmt(prod.sold)} vendus</div>
          <div class="p-price">
            <span class="price ${off ? 'sale' : ''}" id="p-price">${money(unitPrice(prod, opt))}</span>
            ${prod.oldPrice ? `<span class="old" id="p-old">${money(oldUnit(prod, opt))}</span><span class="off">-${off}%</span>` : ''}
            <span class="conv" id="p-conv">${S.currency !== 'XAF' ? `soit ${money(unitPrice(prod, opt), 'XAF')} au Cameroun` : 'Prix au Cameroun'}</span>
          </div>
          ${prod.options ? `<div class="opt-label">${esc(prod.optionLabel || 'Option')} : <span id="opt-name" class="muted">${esc(opt)}</span></div><div class="opts" id="opts">${optionButtons(prod, opt)}</div>` : ''}
          <div class="opt-label">Quantité</div>
          <div class="qty"><button data-q="-1" aria-label="Moins">−</button><span id="qty">1</span><button data-q="1" aria-label="Plus">+</button></div>
          <div class="p-actions">
            <button class="btn btn-sale" id="add">Ajouter au panier</button>
            <button class="fav-lg" data-fav="${prod.id}" aria-label="Favori">${S.favs.includes(prod.id) ? '❤️' : '🤍'}</button>
          </div>
          <div class="info-box">
            <div><span>📍</span><span><b>Provenance</b>${esc(prod.origin)}</span></div>
            <div><span>🚚</span><span><b>Livraison au Cameroun</b>24 h à Yaoundé et Douala · 48–96 h dans les autres villes · offerte dès ${money(S.catalog.freeDeliveryFrom)}</span></div>
            <div><span>🎁</span><span><b>Message cadeau gratuit</b>Ajoutez un mot pour votre proche lors de la commande</span></div>
            <div><span>🤝</span><span><b>Vous êtes au Cameroun ?</b>Ajoutez cet article au panier et envoyez-le à un proche pour qu'il paie.</span></div>
          </div>
          ${prod.contents ? `<div class="opt-label">Contenu du panier</div><ul class="contents">${prod.contents.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}
          <div class="opt-label">Description</div>
          <p class="desc">${esc(prod.description || `${prod.name}, sélectionné avec soin par notre équipe au Cameroun et livré directement chez votre proche.`)}</p>
          <div class="opt-label">Avis clients (${kfmt(prod.reviews)})</div>
          <div class="reviews">${reviewers.map(([who, txt], i) => `<div class="review"><div class="review-head"><span><span class="stars">★★★★★</span> ${who}</span><span>il y a ${i * 3 + 2} jours</span></div><div>${txt}</div></div>`).join('')}</div>
        </div>
      </div>
      ${related.length ? `<section class="section"><div class="section-head"><h2>Vous aimerez aussi</h2></div><div class="grid">${related.map((x) => card(x)).join('')}</div></section>` : ''}`;

    const refresh = () => {
      const u = unitPrice(prod, opt);
      $('#p-price').textContent = money(u * qty);
      if ($('#p-old')) $('#p-old').textContent = money(oldUnit(prod, opt) * qty);
      if (S.currency !== 'XAF') $('#p-conv').textContent = `soit ${money(u * qty, 'XAF')} au Cameroun`;
      $('#qty').textContent = qty;
    };
    $('.thumbs').addEventListener('click', (e) => {
      const b = e.target.closest('[data-thumb]');
      if (!b) return;
      $('#main-emoji').textContent = b.dataset.thumb;
      $$('.thumbs button').forEach((x) => x.classList.toggle('active', x === b));
    });
    if (prod.options) {
      $('#opts').addEventListener('click', (e) => {
        const b = e.target.closest('[data-opt]');
        if (!b) return;
        opt = b.dataset.opt;
        $('#opts').innerHTML = optionButtons(prod, opt);
        $('#opt-name').textContent = opt;
        refresh();
      });
    }
    $('.qty').addEventListener('click', (e) => {
      const b = e.target.closest('[data-q]');
      if (!b) return;
      qty = Math.max(1, Math.min(99, qty + Number(b.dataset.q)));
      refresh();
    });
    $('#add').addEventListener('click', () => addToCart(prod.id, opt, qty));
  }

  // ---------------------------------------------------------------- panier
  function totalsFor(items, cityName) {
    const subtotal = cartSubtotal(items);
    const city = S.catalog.cities.find((c) => c.name === cityName);
    const delivery = !city ? null : subtotal >= S.catalog.freeDeliveryFrom ? 0 : city.fee;
    const service = Math.round(subtotal * S.catalog.serviceFeeRate);
    return { subtotal, delivery, service, total: subtotal + (delivery || 0) + service };
  }
  function summaryRows(t, { cityKnown = false } = {}) {
    return `
      <div class="sum-row"><span>Sous-total</span><span>${money(t.subtotal)}</span></div>
      <div class="sum-row"><span>Livraison</span><span>${t.delivery == null || !cityKnown ? 'selon la ville' : t.delivery === 0 ? '<span class="free">Offerte</span>' : money(t.delivery)}</span></div>
      <div class="sum-row"><span>Frais de service (${Math.round(S.catalog.serviceFeeRate * 100)} %)</span><span>${money(t.service)}</span></div>
      <div class="sum-row total"><span>Total</span><span>${money(t.total)}</span></div>
      ${S.currency !== 'XAF' ? `<div class="sum-row" style="font-size:12px"><span>Équivalent</span><span>${money(t.total, 'XAF')}</span></div>` : ''}`;
  }
  function freeShipHtml(subtotal) {
    const goal = S.catalog.freeDeliveryFrom;
    if (subtotal >= goal) return '<div class="free-ship">🎉 La livraison est <b>offerte</b> pour ce panier !</div>';
    return `<div class="free-ship">Plus que <b>${money(goal - subtotal)}</b> pour la livraison offerte<div class="bar"><i style="width:${(subtotal / goal) * 100}%"></i></div></div>`;
  }

  function pageCart() {
    setActiveNav('', 'panier');
    if (!S.cart.length) {
      app.innerHTML = `<h1 class="page-title">Mon panier</h1>
        <div class="empty"><div class="big">🛍️</div><h2>Votre panier est vide</h2><p>Faites plaisir à vos proches au Cameroun en quelques clics.</p><a class="btn" href="#/">Commencer mes achats</a></div>
        <section class="section"><div class="section-head"><h2>Les plus offerts</h2></div><div class="h-scroll">${S.catalog.products.filter((x) => x.tags.includes('best')).map((x) => card(x)).join('')}</div></section>`;
      return;
    }
    const t = totalsFor(S.cart);
    app.innerHTML = `
      <h1 class="page-title">Mon panier (${cartCount()})</h1>
      <div class="cart-layout">
        <div>
          ${freeShipHtml(t.subtotal)}
          ${S.cart.map((i, k) => {
            const prod = byId(i.id);
            const u = unitPrice(prod, i.option);
            return `<div class="cart-item">
              <a href="#/produit/${prod.id}" class="cart-thumb" style="${bg(prod)}">${prod.emoji}</a>
              <div>
                <h3><a href="#/produit/${prod.id}">${esc(prod.name)}</a></h3>
                ${i.option ? `<span class="opt-pill">${esc(prod.optionLabel || 'Option')} : ${esc(i.option)}</span>` : ''}
                <div class="price-row" style="margin-top:6px"><span class="price ${prod.oldPrice ? 'sale' : ''}">${money(u)}</span></div>
              </div>
              <div class="cart-item-right">
                <div class="qty"><button data-line="${k}" data-d="-1" aria-label="Moins">−</button><span>${i.qty}</span><button data-line="${k}" data-d="1" aria-label="Plus">+</button></div>
                <b>${money(u * i.qty)}</b>
                <button class="remove" data-remove="${k}">Supprimer</button>
              </div>
            </div>`;
          }).join('')}
          <p style="margin-top:14px"><a class="link" href="#/">← Continuer mes achats</a></p>
        </div>
        <aside class="summary">
          <h3>Récapitulatif</h3>
          ${summaryRows(t)}
          <a class="btn btn-sale btn-block" href="#/commande">Commander et payer</a>
          <div class="or">— ou —</div>
          <button class="btn btn-green btn-block" id="share-btn">🤝 Faire payer par un proche</button>
          <p class="hint">Vous êtes au Cameroun ? Envoyez ce panier à un proche à l'étranger : il le valide et le paie.</p>
        </aside>
      </div>`;
    app.addEventListener('click', cartClicks);
    $('#share-btn').addEventListener('click', openShareModal);
  }
  function cartClicks(e) {
    if (!location.hash.startsWith('#/panier')) return app.removeEventListener('click', cartClicks);
    const d = e.target.closest('[data-d]');
    const r = e.target.closest('[data-remove]');
    if (d) {
      const line = S.cart[+d.dataset.line];
      line.qty = Math.max(1, Math.min(99, line.qty + Number(d.dataset.d)));
    } else if (r) {
      S.cart.splice(+r.dataset.remove, 1);
      toast('Article supprimé');
    } else return;
    persistCart();
    app.removeEventListener('click', cartClicks);
    pageCart();
  }

  function cityOptions(selected) {
    return `<option value="">— Choisir la ville —</option>` + S.catalog.cities.map((c) => `<option ${c.name === selected ? 'selected' : ''}>${esc(c.name)}</option>`).join('');
  }

  function openShareModal() {
    openModal(`
      <h2>🤝 Faire payer ce panier par un proche</h2>
      <p class="muted" style="margin-top:0">Nous créons un lien unique. Envoyez-le par WhatsApp à la personne qui va payer (en France, au Canada, aux USA…).</p>
      <form id="share-form" class="fields">
        <div class="field"><label>Votre nom *</label><input name="name" required maxlength="80" placeholder="Ex. Maman Brigitte"></div>
        <div class="field"><label>Votre téléphone *</label><input name="phone" required maxlength="30" placeholder="6XX XX XX XX" inputmode="tel"></div>
        <div class="field"><label>Ville de livraison *</label><select name="city" required>${cityOptions()}</select></div>
        <div class="field"><label>Quartier</label><input name="quarter" maxlength="120" placeholder="Ex. Bastos, Akwa, Biyem-Assi"></div>
        <div class="field full"><label>Qui va payer ?</label><input name="payerName" maxlength="80" placeholder="Ex. Mon fils Patrick"></div>
        <div class="field full"><label>Petit message</label><textarea name="message" maxlength="600" placeholder="Bonjour mon fils, voici ce qu'il faut pour la maison ce mois-ci. Que Dieu te bénisse 🙏"></textarea></div>
        <button class="btn btn-green btn-block field full" type="submit">Créer le lien de paiement</button>
      </form>`);
    $('#share-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const f = new FormData(e.target);
      const btn = $('button[type=submit]', e.target);
      btn.disabled = true;
      btn.textContent = 'Création…';
      try {
        const r = await api('/api/shared-carts', {
          method: 'POST',
          body: {
            items: S.cart,
            requester: { name: f.get('name'), phone: f.get('phone'), payerName: f.get('payerName') },
            recipient: { city: f.get('city'), quarter: f.get('quarter') },
            message: f.get('message'),
          },
        });
        S.shared.unshift(r.code);
        save('pdp_shared', S.shared.slice(0, 20));
        S.cart = [];
        persistCart();
        closeModal();
        location.hash = `#/partage/${r.code}?nouveau=1`;
      } catch (err) {
        toast(err.message);
        btn.disabled = false;
        btn.textContent = 'Créer le lien de paiement';
      }
    });
  }

  // ---------------------------------------------------------------- panier partagé (vue du payeur)
  async function pageShared(codeStr, params) {
    setActiveNav('partage', 'panier');
    app.innerHTML = '<div class="empty"><div class="big">⏳</div><p>Chargement du panier…</p></div>';
    let cart;
    try {
      cart = await api(`/api/shared-carts/${encodeURIComponent(codeStr)}`);
    } catch (err) {
      app.innerHTML = `<div class="empty"><div class="big">🔗</div><h2>Lien introuvable</h2><p>${esc(err.message)}</p><a class="btn" href="#/">Retour à l'accueil</a></div>`;
      return;
    }
    const link = `${location.origin}/#/partage/${cart.code}`;
    const isNew = params.get('nouveau') === '1';
    const q = cart.quote;
    const waText = `Bonjour${cart.requester.payerName ? ' ' + cart.requester.payerName : ''} 👋 J'ai préparé un panier sur Panier du Pays (${money(q.total, 'XAF')}). Tu peux le voir et le payer ici : ${link}`;
    const paid = cart.status === 'payee';
    app.innerHTML = `
      ${isNew ? `<div class="success"><div class="big">🎉</div><h1>Votre panier est prêt !</h1><p class="muted">Envoyez maintenant le lien à la personne qui va payer.</p></div>
        <div class="box" style="max-width:640px;margin:0 auto 20px">
          <div class="share-link"><code>${esc(link)}</code><button class="btn btn-sm" id="copy">Copier</button></div>
          <div style="display:flex;gap:10px;margin-top:12px;flex-wrap:wrap">
            <a class="btn btn-wa" style="flex:1" target="_blank" rel="noopener" href="https://wa.me/?text=${encodeURIComponent(waText)}">Envoyer sur WhatsApp</a>
            <a class="btn btn-outline" style="flex:1" href="sms:?&body=${encodeURIComponent(waText)}">Envoyer par SMS</a>
          </div>
          <p class="hint" style="margin-top:10px">Code du panier : <b>${cart.code}</b> · Gardez ce lien pour suivre le paiement.</p>
        </div>` : ''}
      <div class="breadcrumb"><a href="#/">Accueil</a> › Panier partagé ${cart.code}</div>
      <h1 class="page-title">${paid ? '✅ Panier payé' : `🧺 Panier préparé par ${esc(cart.requester.name)}`}</h1>
      <div class="cart-layout">
        <div>
          ${cart.message ? `<div class="opt-label">Message de ${esc(cart.requester.name)}</div><div class="quote-bubble">${esc(cart.message)}</div>` : ''}
          <div class="opt-label">Livraison prévue</div>
          <div class="info-box"><div><span>📍</span><span><b>${esc(cart.recipient.name)} · ${esc(cart.recipient.phone)}</b>${esc(cart.recipient.city || 'Ville à préciser')}${cart.recipient.quarter ? ', ' + esc(cart.recipient.quarter) : ''}</span></div></div>
          <div class="opt-label">Articles (${q.items.reduce((s, i) => s + i.qty, 0)})</div>
          ${q.items.map((i) => {
            const prod = byId(i.id);
            return `<div class="cart-item">
              <a href="#/produit/${i.id}" class="cart-thumb" style="${prod ? bg(prod) : ''}">${i.emoji}</a>
              <div><h3>${esc(i.name)}</h3>${i.option ? `<span class="opt-pill">${esc(i.optionLabel || 'Option')} : ${esc(i.option)}</span>` : ''}<div class="muted" style="margin-top:6px">${money(i.unit)} × ${i.qty}</div></div>
              <div class="cart-item-right"><b>${money(i.total)}</b></div></div>`;
          }).join('')}
        </div>
        <aside class="summary">
          <h3>Total à payer</h3>
          <div class="sum-row"><span>Sous-total</span><span>${money(q.subtotal)}</span></div>
          <div class="sum-row"><span>Livraison ${q.city ? `(${esc(q.city)})` : ''}</span><span>${q.delivery === 0 && q.city ? '<span class="free">Offerte</span>' : money(q.delivery)}</span></div>
          <div class="sum-row"><span>Frais de service</span><span>${money(q.service)}</span></div>
          <div class="sum-row total"><span>Total</span><span>${money(q.total)}</span></div>
          ${S.currency !== 'XAF' ? `<div class="sum-row" style="font-size:12px"><span>Équivalent</span><span>${money(q.total, 'XAF')}</span></div>` : ''}
          ${paid
            ? `<div class="notice green">Ce panier a été payé. Commande <b>${esc(cart.orderId)}</b> — ${esc(cart.order ? cart.order.statusLabel : '')}.</div>
               <a class="btn btn-block" href="#/commande/${esc(cart.orderId)}">Suivre la livraison</a>`
            : `<button class="btn btn-sale btn-block" id="pay-shared">Valider et payer ce panier</button>
               <button class="btn btn-outline btn-block" id="edit-shared">Modifier avant de payer</button>
               <p class="hint">🔒 Paiement sécurisé par carte, PayPal ou Mobile Money. ${esc(cart.requester.name)} sera prévenu(e) dès le paiement.</p>`}
        </aside>
      </div>`;
    if ($('#copy')) {
      $('#copy').addEventListener('click', async () => {
        try { await navigator.clipboard.writeText(link); toast('Lien copié ✓'); } catch { toast(link); }
      });
    }
    if (!paid) {
      $('#pay-shared').addEventListener('click', () => {
        S.checkoutSource = { sharedCode: cart.code, items: cart.items, recipient: cart.recipient, requester: cart.requester };
        location.hash = '#/commande';
      });
      $('#edit-shared').addEventListener('click', () => {
        // on charge les articles dans le panier du payeur ; il pourra en ajouter/retirer
        cart.items.forEach((i) => {
          const line = S.cart.find((x) => x.id === i.id && x.option === i.option);
          if (line) line.qty = Math.max(line.qty, i.qty); else S.cart.push({ ...i });
        });
        persistCart();
        save('pdp_prefill', { recipient: cart.recipient, from: cart.requester.name });
        toast('Articles ajoutés à votre panier');
        location.hash = '#/panier';
      });
    }
  }

  // ---------------------------------------------------------------- commande
  function pageCheckout() {
    setActiveNav('', 'panier');
    const src = S.checkoutSource;
    const items = src ? src.items : S.cart;
    if (!items.length) { location.hash = '#/panier'; return; }
    const prefill = src ? { recipient: src.recipient, from: src.requester.name } : load('pdp_prefill', null);
    const r = (prefill && prefill.recipient) || load('pdp_last_recipient', {});
    const payer = load('pdp_payer', {});
    const methods = [
      ['carte', '💳', 'Carte bancaire', 'Visa, Mastercard'],
      ['paypal', '🅿️', 'PayPal', 'Compte PayPal'],
      ['orange_money', '🟠', 'Orange Money', 'Cameroun'],
      ['mtn_momo', '🟡', 'MTN MoMo', 'Cameroun'],
      ['virement', '🏦', 'Virement', 'SEPA / Interac'],
    ];
    app.innerHTML = `
      <div class="breadcrumb"><a href="#/panier">Panier</a> › Commande</div>
      <h1 class="page-title">Finaliser la commande</h1>
      ${src ? `<div class="notice green" style="margin-bottom:14px">🤝 Vous payez le panier préparé par <b>${esc(src.requester.name)}</b> (code ${esc(src.sharedCode)}).</div>` : ''}
      <form class="checkout" id="checkout" novalidate>
        <div>
          <div class="box">
            <h2><span class="n">1</span> Le bénéficiaire au Cameroun</h2>
            <div class="fields">
              <div class="field"><label>Nom complet *</label><input name="r_name" required maxlength="80" value="${esc(r.name)}" placeholder="Ex. Mbarga Jeanne"></div>
              <div class="field"><label>Téléphone *</label><input name="r_phone" required maxlength="30" inputmode="tel" value="${esc(r.phone)}" placeholder="+237 6XX XX XX XX"></div>
              <div class="field"><label>Ville *</label><select name="r_city" required id="r-city">${cityOptions(r.city)}</select></div>
              <div class="field"><label>Quartier *</label><input name="r_quarter" required maxlength="120" value="${esc(r.quarter)}" placeholder="Ex. Biyem-Assi, Bonamoussadi"></div>
              <div class="field full"><label>Indications pour le livreur</label><input name="r_address" maxlength="300" value="${esc(r.address)}" placeholder="Ex. Derrière la pharmacie, portail bleu"></div>
              <div class="field"><label>Date de livraison souhaitée</label><input type="date" name="r_date" min="${new Date(Date.now() + 864e5).toISOString().slice(0, 10)}"></div>
            </div>
          </div>
          <div class="box">
            <h2><span class="n">2</span> Vos coordonnées</h2>
            <div class="fields">
              <div class="field"><label>Votre nom *</label><input name="p_name" required maxlength="80" value="${esc(payer.name)}"></div>
              <div class="field"><label>E-mail *</label><input type="email" name="p_email" required maxlength="120" value="${esc(payer.email)}" placeholder="pour le reçu et le suivi"></div>
              <div class="field"><label>Téléphone / WhatsApp</label><input name="p_phone" maxlength="30" inputmode="tel" value="${esc(payer.phone)}" placeholder="pour recevoir la photo de livraison"></div>
              <div class="field"><label>Pays de résidence</label><select name="p_country">${['France', 'Belgique', 'Suisse', 'Allemagne', 'Royaume-Uni', 'Canada', 'États-Unis', 'Italie', 'Espagne', 'Cameroun', 'Autre'].map((c) => `<option ${c === payer.country ? 'selected' : ''}>${c}</option>`).join('')}</select></div>
            </div>
          </div>
          <div class="box">
            <h2><span class="n">3</span> Message cadeau</h2>
            <div class="field"><textarea name="gift" maxlength="600" placeholder="Joyeux Noël Maman, je pense fort à vous tous ❤️"></textarea></div>
            <label class="check" style="margin-top:10px"><input type="checkbox" name="anonymous"> Ne pas afficher le prix au bénéficiaire</label>
          </div>
          <div class="box">
            <h2><span class="n">4</span> Paiement</h2>
            <div class="pay-methods" id="pay-methods">
              ${methods.map(([v, ico, label, sub], i) => `<label class="pay-method ${i === 0 ? 'active' : ''}"><input type="radio" name="pay" value="${v}" ${i === 0 ? 'checked' : ''}><span class="ico">${ico}</span><span><b>${label}</b><small>${sub}</small></span></label>`).join('')}
            </div>
            <div id="pay-extra" style="margin-top:14px"></div>
          </div>
        </div>
        <aside class="summary">
          <h3>Votre commande</h3>
          <div class="mini-items">
            ${items.map((i) => {
              const prod = byId(i.id);
              return prod ? `<div class="mini-item"><div class="cart-thumb" style="${bg(prod)}">${prod.emoji}</div><div>${esc(prod.name)}${i.option ? `<br><span class="muted">${esc(i.option)}</span>` : ''}<br><span class="muted">× ${i.qty}</span></div><b>${money(unitPrice(prod, i.option) * i.qty)}</b></div>` : '';
            }).join('')}
          </div>
          <div id="sum"></div>
          <button class="btn btn-sale btn-block" type="submit" id="pay-btn">Payer</button>
          <p class="hint">🔒 Vos données sont chiffrées. En commandant, vous acceptez nos conditions de vente.</p>
        </aside>
      </form>`;

    const form = $('#checkout');
    const drawSum = () => {
      const t = totalsFor(items, form.r_city.value);
      $('#sum').innerHTML = freeShipHtml(t.subtotal) + summaryRows(t, { cityKnown: !!form.r_city.value });
      $('#pay-btn').textContent = `Payer ${money(t.total)}`;
    };
    const drawPayExtra = () => {
      const m = form.pay.value;
      const box = $('#pay-extra');
      if (m === 'carte') {
        box.innerHTML = `<div class="fields">
          <div class="field full"><label>Numéro de carte</label><input inputmode="numeric" placeholder="4242 4242 4242 4242" maxlength="19" autocomplete="cc-number"></div>
          <div class="field"><label>Expiration</label><input placeholder="MM/AA" maxlength="5" autocomplete="cc-exp"></div>
          <div class="field"><label>CVC</label><input inputmode="numeric" placeholder="123" maxlength="4" autocomplete="cc-csc"></div>
        </div><p class="notice" style="margin-top:10px">Mode démonstration : aucun débit réel n'est effectué. Branchez Stripe, Flutterwave ou CinetPay pour encaisser (voir README).</p>`;
      } else if (m === 'paypal') {
        box.innerHTML = '<p class="notice">Vous serez redirigé vers PayPal pour confirmer le paiement (simulation en mode démonstration).</p>';
      } else if (m === 'orange_money' || m === 'mtn_momo') {
        box.innerHTML = `<div class="field"><label>Numéro ${m === 'mtn_momo' ? 'MTN MoMo' : 'Orange Money'}</label><input inputmode="tel" placeholder="6XX XX XX XX"></div>
          <p class="notice" style="margin-top:10px">Vous recevrez une demande de confirmation sur votre téléphone (simulation en mode démonstration).</p>`;
      } else {
        box.innerHTML = '<p class="notice">Nous vous enverrons nos coordonnées bancaires par e-mail. La commande sera préparée dès réception du virement.</p>';
      }
    };
    $('#pay-methods').addEventListener('change', () => {
      $$('.pay-method').forEach((l) => l.classList.toggle('active', $('input', l).checked));
      drawPayExtra();
    });
    form.r_city.addEventListener('change', drawSum);
    drawSum();
    drawPayExtra();

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const required = ['r_name', 'r_phone', 'r_city', 'r_quarter', 'p_name', 'p_email'];
      const missing = required.find((n) => !form[n].value.trim());
      if (missing) { form[missing].focus(); return toast('Merci de compléter les champs obligatoires *'); }
      if (!form.p_email.checkValidity()) { form.p_email.focus(); return toast('Adresse e-mail invalide'); }
      const btn = $('#pay-btn');
      btn.disabled = true;
      btn.textContent = 'Paiement en cours…';
      const recipient = { name: form.r_name.value, phone: form.r_phone.value, city: form.r_city.value, quarter: form.r_quarter.value, address: form.r_address.value, date: form.r_date.value };
      const payerInfo = { name: form.p_name.value, email: form.p_email.value, phone: form.p_phone.value, country: form.p_country.value };
      try {
        await new Promise((res) => setTimeout(res, 900)); // petite attente réaliste
        const order = await api('/api/orders', {
          method: 'POST',
          body: {
            items, recipient, payer: payerInfo, paymentMethod: form.pay.value, giftMessage: form.gift.value,
            anonymous: form.anonymous.checked, currency: S.currency, sharedCode: src ? src.sharedCode : null,
          },
        });
        save('pdp_payer', payerInfo);
        save('pdp_last_recipient', recipient);
        try { localStorage.removeItem('pdp_prefill'); } catch { /* ignore */ }
        S.orders.unshift(order.id);
        save('pdp_orders', S.orders.slice(0, 30));
        if (!src) { S.cart = []; persistCart(); }
        S.checkoutSource = null;
        location.hash = `#/commande/${order.id}?merci=1`;
      } catch (err) {
        toast(err.message);
        btn.disabled = false;
        drawSum();
      }
    });
  }

  // ---------------------------------------------------------------- suivi
  const FLOW = [
    ['payee', 'Paiement confirmé', 'Nous avons bien reçu votre paiement.'],
    ['preparation', 'En préparation', 'Nos équipes achètent et emballent vos articles.'],
    ['livraison', 'En cours de livraison', 'Le livreur appelle le bénéficiaire avant d\'arriver.'],
    ['livree', 'Livrée', 'Photo de la remise envoyée sur WhatsApp.'],
  ];
  async function pageOrder(id, params) {
    setActiveNav('', 'suivi');
    app.innerHTML = '<div class="empty"><div class="big">⏳</div><p>Chargement…</p></div>';
    let o;
    try {
      o = await api(`/api/orders/${encodeURIComponent(id)}`);
    } catch (err) {
      app.innerHTML = `<div class="empty"><div class="big">📦</div><h2>Commande introuvable</h2><p>${esc(err.message)}</p><a class="btn" href="#/suivi">Réessayer</a></div>`;
      return;
    }
    const thanks = params.get('merci') === '1';
    const idx = FLOW.findIndex(([s]) => s === o.status);
    const waMsg = `Bonjour ${o.recipient.name} 🎁 Je t'ai envoyé un colis via Panier du Pays ! Livraison prévue à ${o.recipient.city}. Numéro de suivi : ${o.id} — ${location.origin}/#/commande/${o.id}`;
    app.innerHTML = `
      ${thanks ? `<div class="success"><div class="big">🎉</div><h1>Merci ${esc(o.payer.name.split(' ')[0])} !</h1><p class="muted">Votre commande est confirmée. ${esc(o.recipient.name)} va bientôt être livré(e) à ${esc(o.recipient.city)}.</p><div class="order-id">${o.id}</div></div>` : `<h1 class="page-title">Commande ${o.id}</h1>`}
      <div class="cart-layout">
        <div>
          <div class="box">
            <h2>Suivi de la livraison <span class="status-pill ${o.status}">${esc(o.statusLabel)}</span></h2>
            ${o.status === 'en_attente' ? '<div class="notice" style="margin-bottom:14px">Nous attendons votre virement. Les coordonnées bancaires vous ont été envoyées par e-mail.</div>' : ''}
            ${o.status === 'annulee' ? '<div class="notice">Cette commande a été annulée. Contactez le service client pour toute question.</div>' : `
            <div class="timeline">
              ${FLOW.map(([s, label, sub], i) => {
                const h = o.history.find((x) => x.status === s);
                return `<div class="tl ${i <= idx ? 'done' : ''} ${i === idx ? 'current' : ''}"><div class="tl-dot">${i <= idx ? '✓' : ''}</div><div><b>${label}</b><small>${h ? new Date(h.at).toLocaleString('fr-FR', { dateStyle: 'medium', timeStyle: 'short' }) + ' · ' : ''}${sub}</small></div></div>`;
              }).join('')}
            </div>`}
          </div>
          <div class="box">
            <h2>Bénéficiaire</h2>
            <div class="info-box" style="border:0;padding:0">
              <div><span>👤</span><span><b>${esc(o.recipient.name)}</b>${esc(o.recipient.phone)}</span></div>
              <div><span>📍</span><span><b>${esc(o.recipient.city)}${o.recipient.quarter ? ', ' + esc(o.recipient.quarter) : ''}</b>${esc(o.recipient.address)} ${o.deliveryDelay ? `· délai ${esc(o.deliveryDelay)}` : ''}${o.recipient.date ? ` · souhaitée le ${esc(new Date(o.recipient.date).toLocaleDateString('fr-FR'))}` : ''}</span></div>
              ${o.giftMessage ? `<div><span>💌</span><span><b>Message cadeau</b>${esc(o.giftMessage)}</span></div>` : ''}
              ${o.sharedCode ? `<div><span>🤝</span><span><b>Panier partagé</b>Code ${esc(o.sharedCode)}</span></div>` : ''}
            </div>
            <a class="btn btn-wa btn-block" style="margin-top:14px" target="_blank" rel="noopener" href="https://wa.me/?text=${encodeURIComponent(waMsg)}">Prévenir ${esc(o.recipient.name.split(' ')[0])} sur WhatsApp</a>
          </div>
        </div>
        <aside class="summary">
          <h3>Détail</h3>
          <div class="mini-items">${o.items.map((i) => `<div class="mini-item"><div class="cart-thumb" style="${byId(i.id) ? bg(byId(i.id)) : ''}">${i.emoji}</div><div>${esc(i.name)}${i.option ? `<br><span class="muted">${esc(i.option)}</span>` : ''}<br><span class="muted">× ${i.qty}</span></div><b>${money(i.total)}</b></div>`).join('')}</div>
          <div class="sum-row"><span>Sous-total</span><span>${money(o.subtotal)}</span></div>
          <div class="sum-row"><span>Livraison</span><span>${o.delivery === 0 ? '<span class="free">Offerte</span>' : money(o.delivery)}</span></div>
          <div class="sum-row"><span>Frais de service</span><span>${money(o.service)}</span></div>
          <div class="sum-row total"><span>Total payé</span><span>${money(o.total)}</span></div>
          <div class="sum-row" style="font-size:12px"><span>Paiement</span><span>${esc({ carte: 'Carte bancaire', paypal: 'PayPal', orange_money: 'Orange Money', mtn_momo: 'MTN MoMo', virement: 'Virement' }[o.paymentMethod])}</span></div>
          <a class="btn btn-outline btn-block" href="#/">Faire une autre commande</a>
        </aside>
      </div>`;
  }

  function pageTrack() {
    setActiveNav('', 'suivi');
    app.innerHTML = `
      <h1 class="page-title">Suivre une commande</h1>
      <div class="box" style="max-width:560px">
        <form id="track" style="display:flex;gap:10px;flex-wrap:wrap">
          <input class="select" style="flex:1;min-width:200px;padding:12px" name="id" placeholder="N° de commande (PDP-XXXXXX) ou code panier" required>
          <button class="btn">Suivre</button>
        </form>
      </div>
      ${S.orders.length ? `<div class="section"><div class="section-head"><h2>Mes commandes sur cet appareil</h2></div><div class="chips" style="flex-wrap:wrap">${S.orders.map((id) => `<a class="chip" href="#/commande/${esc(id)}">📦 ${esc(id)}</a>`).join('')}</div></div>` : ''}
      ${S.shared.length ? `<div class="section"><div class="section-head"><h2>Mes paniers partagés</h2></div><div class="chips" style="flex-wrap:wrap">${S.shared.map((c) => `<a class="chip" href="#/partage/${esc(c)}">🤝 ${esc(c)}</a>`).join('')}</div></div>` : ''}`;
    $('#track').addEventListener('submit', (e) => {
      e.preventDefault();
      const v = e.target.id.value.trim().toUpperCase();
      location.hash = v.startsWith('PDP-') ? `#/commande/${v}` : `#/partage/${v}`;
    });
  }

  // ---------------------------------------------------------------- pages d'information
  function pageHow() {
    setActiveNav('', 'home');
    app.innerHTML = `<h1 class="page-title">Comment ça marche ?</h1>
      <p class="muted">Panier du Pays permet à la diaspora d'acheter au Cameroun pour ses proches, sans transfert d'argent ni intermédiaire.</p>
      <div class="section">${stepsHtml()}</div>
      <div class="section">${shareCtaHtml()}</div>
      <div class="section">${trustHtml()}</div>`;
  }
  function pageShareInfo() {
    setActiveNav('partage', 'home');
    app.innerHTML = `<h1 class="page-title">🤝 Le panier partagé</h1>
      <p class="muted">Pour la famille au pays qui sait ce dont elle a besoin, et pour vous qui voulez payer en toute confiance.</p>
      <div class="section steps">
        <div class="step"><div class="step-num">1</div><h3>Au Cameroun</h3><p>Votre proche ajoute au panier ce dont il a besoin : vivres, habits, fournitures…</p></div>
        <div class="step"><div class="step-num">2</div><h3>Il vous envoie le lien</h3><p>Il touche « Faire payer par un proche » et vous envoie le lien par WhatsApp ou SMS.</p></div>
        <div class="step"><div class="step-num">3</div><h3>Vous validez</h3><p>Vous voyez chaque article et son prix. Vous pouvez modifier le panier avant de payer.</p></div>
        <div class="step"><div class="step-num">4</div><h3>On livre</h3><p>L'argent ne transite jamais en liquide : nous achetons et livrons directement.</p></div>
      </div>
      <div class="section notice green">✅ Avantage : pas de frais de transfert, pas de risque que l'argent soit détourné, et la certitude que la commande arrive à la bonne personne.</div>
      <div class="section" style="display:flex;gap:10px;flex-wrap:wrap"><a class="btn" href="#/">Composer un panier</a><a class="btn btn-outline" href="#/suivi">J'ai reçu un code</a></div>`;
  }
  function pageFaq() {
    setActiveNav('', 'home');
    const faq = [
      ['Dans quelles villes livrez-vous ?', `Yaoundé et Douala en 24 h, et ${S.catalog.cities.length - 3} autres villes en 48 à 96 h (Bafoussam, Bamenda, Garoua, Maroua, Kribi…). Pour un village, choisissez « Autre ville / village ».`],
      ['Comment savoir que mon proche a bien été livré ?', 'Le livreur prend une photo à la remise du colis. Elle vous est envoyée sur WhatsApp et le suivi passe à « Livrée ».'],
      ['Dans quelle devise suis-je débité ?', 'Les prix sont fixés en FCFA. Vous pouvez les afficher en €, $, CA$, £ ou CHF ; la conversion est indicative et l\'euro est à parité fixe (1 € = 655,957 FCFA).'],
      ['Les produits frais arrivent-ils frais ?', 'Oui : les vivres sont achetés le matin même au marché et livrés dans la journée à Yaoundé et Douala.'],
      ['Puis-je cacher le prix au bénéficiaire ?', 'Oui, cochez « Ne pas afficher le prix au bénéficiaire » au moment de la commande.'],
      ['Que se passe-t-il si le bénéficiaire est injoignable ?', 'Le livreur réessaie le lendemain et nous vous contactons pour convenir d\'une solution. Aucun frais supplémentaire.'],
    ];
    app.innerHTML = `<h1 class="page-title">Questions fréquentes</h1><div style="max-width:780px">${faq.map(([q, a]) => `<details><summary>${q}</summary><p>${a}</p></details>`).join('')}</div>`;
  }
  function pageNotFound() {
    app.innerHTML = '<div class="empty"><div class="big">🧭</div><h2>Page introuvable</h2><p>Cette page n\'existe pas ou plus.</p><a class="btn" href="#/">Retour à l\'accueil</a></div>';
  }

  // ---------------------------------------------------------------- administration
  async function pageAdmin() {
    setActiveNav('', '');
    const key = sessionStorage.getItem('pdp_admin') || '';
    if (!key) return adminLogin();
    let data;
    try {
      data = await api('/api/admin/orders', { headers: { 'x-admin-key': key } });
    } catch (err) {
      sessionStorage.removeItem('pdp_admin');
      return adminLogin(err.message);
    }
    const sum = data.orders.filter((o) => o.status !== 'annulee').reduce((s, o) => s + o.total, 0);
    app.innerHTML = `
      <h1 class="page-title">Tableau de bord</h1>
      <div class="stats">
        <div class="stat"><span class="muted">Commandes</span><b>${data.orders.length}</b></div>
        <div class="stat"><span class="muted">Chiffre d'affaires</span><b>${money(sum, 'XAF')}</b></div>
        <div class="stat"><span class="muted">À livrer</span><b>${data.orders.filter((o) => ['payee', 'preparation', 'livraison'].includes(o.status)).length}</b></div>
        <div class="stat"><span class="muted">Paniers partagés en attente</span><b>${data.sharedCarts.filter((c) => c.status === 'en_attente').length}</b></div>
      </div>
      <div class="section-head"><h2>Commandes</h2><button class="btn btn-sm btn-outline" id="logout">Se déconnecter</button></div>
      <div class="table-wrap"><table>
        <thead><tr><th>N°</th><th>Date</th><th>Bénéficiaire</th><th>Articles</th><th>Total</th><th>Payeur</th><th>Statut</th></tr></thead>
        <tbody>${data.orders.map((o) => `<tr>
          <td><a class="link" href="#/commande/${o.id}">${o.id}</a>${o.sharedCode ? '<br><small>🤝 ' + esc(o.sharedCode) + '</small>' : ''}</td>
          <td>${new Date(o.createdAt).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })}</td>
          <td><b>${esc(o.recipient.name)}</b><br>${esc(o.recipient.phone)}<br>${esc(o.recipient.city)}, ${esc(o.recipient.quarter)}<br><small>${esc(o.recipient.address)}</small></td>
          <td>${o.items.map((i) => `${i.qty} × ${esc(i.name)}${i.option ? ` (${esc(i.option)})` : ''}`).join('<br>')}${o.giftMessage ? `<br><small>💌 ${esc(o.giftMessage)}</small>` : ''}</td>
          <td><b>${money(o.total, 'XAF')}</b></td>
          <td>${esc(o.payer.name)}<br><small>${esc(o.payer.email)}<br>${esc(o.payer.country)}</small></td>
          <td><select class="select" data-status="${o.id}">${Object.entries(data.statuses).map(([k, v]) => `<option value="${k}" ${k === o.status ? 'selected' : ''}>${v}</option>`).join('')}</select></td>
        </tr>`).join('') || '<tr><td colspan="7" class="muted">Aucune commande pour le moment.</td></tr>'}</tbody>
      </table></div>
      <div class="section-head section"><h2>Paniers partagés</h2></div>
      <div class="table-wrap"><table>
        <thead><tr><th>Code</th><th>Créé par</th><th>Ville</th><th>Articles</th><th>Statut</th></tr></thead>
        <tbody>${data.sharedCarts.map((c) => `<tr><td><a class="link" href="#/partage/${c.code}">${c.code}</a></td><td>${esc(c.requester.name)}<br><small>${esc(c.requester.phone)}</small></td><td>${esc(c.recipient.city)}</td><td>${c.items.length}</td><td><span class="status-pill ${c.status}">${c.status === 'payee' ? 'Payé · ' + esc(c.orderId) : 'En attente'}</span></td></tr>`).join('') || '<tr><td colspan="5" class="muted">Aucun panier partagé.</td></tr>'}</tbody>
      </table></div>`;
    $('#logout').addEventListener('click', () => { sessionStorage.removeItem('pdp_admin'); pageAdmin(); });
    $$('[data-status]').forEach((sel) => sel.addEventListener('change', async () => {
      try {
        await api(`/api/admin/orders/${sel.dataset.status}`, { method: 'PATCH', headers: { 'x-admin-key': key }, body: { status: sel.value } });
        toast('Statut mis à jour ✓');
      } catch (err) { toast(err.message); }
    }));
  }
  function adminLogin(error) {
    app.innerHTML = `<h1 class="page-title">Espace administrateur</h1>
      <form class="box" id="admin-login" style="max-width:420px">
        <div class="field"><label>Clé d'accès</label><input type="password" name="key" required></div>
        ${error ? `<p class="notice" style="margin-top:10px">${esc(error)}</p>` : ''}
        <button class="btn btn-block" style="margin-top:12px">Entrer</button>
      </form>`;
    $('#admin-login').addEventListener('submit', (e) => {
      e.preventDefault();
      sessionStorage.setItem('pdp_admin', e.target.key.value);
      pageAdmin();
    });
  }

  // ================================================================ routeur
  function render() {
    clearTimers();
    closeModal();
    const raw = location.hash.replace(/^#/, '') || '/';
    const [pathPart, query = ''] = raw.split('?');
    const params = new URLSearchParams(query);
    const parts = pathPart.split('/').filter(Boolean).map(decodeURIComponent);
    const [a, b] = parts;
    if (!a) pageHome();
    else if (a === 'categorie') pageCategory(b);
    else if (a === 'categories') pageCategories();
    else if (a === 'flash') pageFlash();
    else if (a === 'meilleures-ventes') pageList({ title: '🔥 Les plus offerts', products: S.catalog.products.filter((x) => x.tags.includes('best')).sort((x, y) => y.sold - x.sold), navKey: '', crumbs: 'Meilleures ventes' });
    else if (a === 'produit') pageProduct(b);
    else if (a === 'recherche') pageSearch(b || '');
    else if (a === 'panier') pageCart();
    else if (a === 'favoris') pageFavs();
    else if (a === 'commande' && b) pageOrder(b, params);
    else if (a === 'commande') pageCheckout();
    else if (a === 'partage' && b) pageShared(b, params);
    else if (a === 'panier-partage') pageShareInfo();
    else if (a === 'suivi') pageTrack();
    else if (a === 'comment-ca-marche') pageHow();
    else if (a === 'faq') pageFaq();
    else if (a === 'admin') pageAdmin();
    else pageNotFound();
    if (a !== 'recherche') $('#search-input').value = '';
    window.scrollTo(0, 0);
  }
  window.addEventListener('hashchange', () => {
    // quitter la page de paiement d'un panier partagé annule ce contexte
    if (!location.hash.startsWith('#/commande')) S.checkoutSource = null;
    render();
  });

  // ================================================================ démarrage
  (async () => {
    try {
      S.catalog = await api('/api/catalog');
    } catch (err) {
      app.innerHTML = `<div class="empty"><div class="big">📡</div><h2>Connexion impossible</h2><p>${esc(err.message)}</p></div>`;
      return;
    }
    if (!S.catalog.currencies[S.currency]) S.currency = 'XAF';
    setupHeader();
    persistCart();
    render();
  })();
})();
