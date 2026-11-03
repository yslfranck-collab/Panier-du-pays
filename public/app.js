/* Panier du Pays — application monopage (sans framework).
   Interface « grande place de marché » : recherche centrale, cartes de rayons,
   pages de résultats avec filtres, fiche produit avec encart d'achat. */
(() => {
  'use strict';

  // ================================================================ état
  const S = {
    catalog: null,
    cart: load('pdp_cart', []), // [{ id, option, qty }]
    favs: load('pdp_favs', []),
    currency: load('pdp_currency', guessCurrency()),
    city: load('pdp_city', 'Yaoundé'), // ville de livraison choisie (« Livrer à »)
    orders: load('pdp_orders', []),
    shared: load('pdp_shared', []),
    checkoutSource: null, // { sharedCode, items, recipient, requester } quand on paie un panier partagé
    adminKey: '',
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
  function forget(key) {
    try { localStorage.removeItem(key); } catch { /* ignore */ }
  }
  function guessCurrency() {
    const lang = (navigator.language || 'fr-FR').toUpperCase();
    if (/-US$/.test(lang)) return 'USD';
    if (/-CA$/.test(lang)) return 'CAD';
    if (/-GB$/.test(lang)) return 'GBP';
    if (/-CH$/.test(lang)) return 'CHF';
    if (/-CM$/.test(lang)) return 'XAF';
    return 'EUR';
  }

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const app = $('#app');
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // ================================================================ API
  async function api(path, opts = {}) {
    // version de démonstration (sans serveur) : l'API est simulée dans le navigateur
    if (window.PDP_API) return window.PDP_API(path, opts);
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
  const nf = (n, d = 0) => n.toLocaleString('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d }).replace(/ | /g, ' ');
  function money(xaf, cur = S.currency) {
    const c = S.catalog.currencies[cur] || S.catalog.currencies.XAF;
    const v = xaf / c.rate;
    if (cur === 'XAF') return `${nf(Math.round(v))} FCFA`;
    return ['€', 'CHF'].includes(c.symbol) ? `${nf(v, c.decimals)} ${c.symbol}` : `${c.symbol}${nf(v, c.decimals)}`;
  }
  // prix « vitrine » : partie entière en grand, centimes et devise en exposant
  function priceHtml(xaf, { size = '', deal = false } = {}) {
    const cur = S.currency;
    const c = S.catalog.currencies[cur] || S.catalog.currencies.XAF;
    const v = xaf / c.rate;
    const cls = `price ${size} ${deal ? 'deal' : ''}`;
    if (cur === 'XAF') return `<span class="${cls}"><span class="whole">${nf(Math.round(v))}</span><span class="sup">FCFA</span></span>`;
    const [int, dec] = v.toFixed(2).split('.');
    const whole = nf(Number(int));
    if (['€', 'CHF'].includes(c.symbol)) return `<span class="${cls}"><span class="whole">${whole}</span><span class="sup">,${dec} ${c.symbol}</span></span>`;
    return `<span class="${cls}"><span class="sup">${c.symbol}</span><span class="whole">${whole}</span><span class="sup">${dec}</span></span>`;
  }
  const pct = (prod) => (prod.oldPrice ? Math.round((1 - prod.price / prod.oldPrice) * 100) : 0);
  const kfmt = (n) => (n >= 1000 ? `${Math.floor(n / 1000)} k+` : String(n));
  function unitPrice(prod, optLabel) {
    if (!prod.options) return prod.price;
    const o = prod.options.find((x) => x.label === optLabel) || prod.options[0];
    return o.price || prod.price;
  }
  function oldUnit(prod, optLabel) {
    if (!prod.oldPrice) return null;
    return Math.round((unitPrice(prod, optLabel) * prod.oldPrice) / prod.price / 100) * 100;
  }

  // ================================================================ livraison
  const cityObj = (name = S.city) => S.catalog.cities.find((c) => c.name === name) || S.catalog.cities[0];
  function etaDate(days, from = new Date(), short = false) {
    const d = new Date(from);
    d.setDate(d.getDate() + days);
    return d.toLocaleDateString('fr-FR', short ? { weekday: 'short', day: 'numeric', month: 'short' } : { weekday: 'long', day: 'numeric', month: 'long' });
  }
  function deliveryHtml(amount, { short = false, cityName = S.city } = {}) {
    const c = cityObj(cityName);
    const free = amount >= S.catalog.freeDeliveryFrom;
    return `<div class="ship">Livraison ${free ? '<b>GRATUITE</b>' : `à ${money(c.fee)}`} <b>${etaDate(c.eta, new Date(), short)}</b></div>`;
  }

  // ================================================================ produits
  const byId = (id) => S.catalog.products.find((x) => x.id === id);
  const catOf = (slug) => S.catalog.categories.find((c) => c.slug === slug);
  const bg = (prod) => {
    const c = prod && catOf(prod.cat);
    return `background:linear-gradient(160deg, ${c ? c.color : '#f4f4f4'} 0%, #f8f9f8 75%)`;
  };
  const stars = (r) => `<span class="stars" style="--r:${r}" aria-label="${String(r).replace('.', ',')} sur 5 étoiles">★★★★★</span>`;
  const isChoice = (prod) => prod.rating >= 4.8 && !prod.tags.includes('best');

  function badgesHtml(prod) {
    if (prod.tags.includes('best')) return '<span class="best-badge">Meilleure vente</span>';
    if (isChoice(prod)) return '<span class="choice-badge">Choix <b>du Pays</b></span>';
    return '';
  }

  // carte de la page de résultats
  function card(prod) {
    const off = pct(prod);
    const fav = S.favs.includes(prod.id);
    return `
      <article class="r-card">
        <div class="badges">${badgesHtml(prod)}</div>
        <button class="r-fav" data-fav="${prod.id}" aria-label="Liste d'envies">${fav ? '♥' : '♡'}</button>
        <a href="#/produit/${prod.id}" class="r-img" style="${bg(prod)}" aria-label="${esc(prod.name)}"><span class="emoji">${prod.emoji}</span></a>
        <div class="r-body">
          <a href="#/produit/${prod.id}" class="r-title">${esc(prod.name)}</a>
          <div class="rating"><span>${String(prod.rating).replace('.', ',')}</span>${stars(prod.rating)}<a class="lnk" href="#/produit/${prod.id}">(${prod.reviews})</a></div>
          <div class="r-bought">${kfmt(prod.sold)} achetés le mois dernier</div>
          ${prod.tags.includes('flash') && off ? '<div><span class="deal-badge">Vente Flash</span></div>' : ''}
          <div>${priceHtml(prod.price, { deal: !!off })}</div>
          ${prod.oldPrice ? `<div class="list-price">Prix conseillé : <s>${money(prod.oldPrice)}</s> <span class="deal-txt">(-${off} %)</span></div>` : ''}
          ${prod.options ? `<div class="small muted">Plusieurs options : ${esc((prod.optionLabel || 'option').toLowerCase())}</div>` : ''}
          ${deliveryHtml(prod.price, { short: true })}
          <button class="btn btn-y" data-quick="${prod.id}">Ajouter au panier</button>
        </div>
      </article>`;
  }
  // vignette des carrousels
  function tile(prod, { deal = false } = {}) {
    const off = pct(prod);
    return `
      <a class="tile" href="#/produit/${prod.id}">
        <span class="timg" style="${bg(prod)}">${prod.emoji}</span>
        ${deal && off ? `<span class="deal-row"><span class="deal-badge">-${off} %</span><span class="deal-label">Offre à durée limitée</span></span>` : ''}
        ${priceHtml(prod.price, { size: 'sm', deal: deal && !!off })}
        <span class="tname">${esc(prod.name)}</span>
      </a>`;
  }
  // carte d'accueil à quatre vignettes
  function quadCard(title, prods, href, more) {
    return `<div class="hcard"><h2>${title}</h2>
      <div class="quad">${prods.slice(0, 4).map((p) => `<a href="#/produit/${p.id}"><span class="qimg" style="${bg(p)}">${p.emoji}</span><span>${esc(p.name)}</span></a>`).join('')}</div>
      <a class="lnk more" href="${href}">${more}</a></div>`;
  }

  // ================================================================ panier & envies
  const cartCount = () => S.cart.reduce((s, i) => s + i.qty, 0);
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
    $('#cart-count').textContent = n > 99 ? '99+' : n;
    const t = $('#tab-cart-count');
    t.textContent = n > 99 ? '99+' : n;
    t.hidden = n === 0;
  }
  function addToCart(id, option, qty = 1, { sheet = true } = {}) {
    const prod = byId(id);
    if (!prod) return;
    const opt = prod.options ? (option || prod.options[0].label) : null;
    const line = S.cart.find((i) => i.id === id && i.option === opt);
    if (line) line.qty = Math.min(99, line.qty + qty);
    else S.cart.push({ id, option: opt, qty });
    persistCart();
    if (sheet) openSheet(prod, opt);
  }
  function toggleFav(id) {
    const i = S.favs.indexOf(id);
    if (i >= 0) S.favs.splice(i, 1); else S.favs.push(id);
    save('pdp_favs', S.favs);
    $$(`[data-fav="${id}"]`).forEach((b) => {
      if (b.classList.contains('r-fav')) b.textContent = i >= 0 ? '♡' : '♥';
      else b.textContent = i >= 0 ? '♡ Ajouter à ma liste d\'envies' : '♥ Dans votre liste d\'envies';
    });
    toast(i >= 0 ? 'Retiré de votre liste d\'envies' : 'Ajouté à votre liste d\'envies');
    if (location.hash.startsWith('#/favoris')) render();
  }

  // ================================================================ calques
  let toastTimer;
  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), 2400);
  }
  function lockScroll(on) { document.body.style.overflow = on ? 'hidden' : ''; }
  function openModal(html) { $('#modal-body').innerHTML = html; $('#modal').hidden = false; lockScroll(true); }
  function closeModal() { $('#modal').hidden = true; lockScroll(false); }
  function openDrawer() { $('#drawer').hidden = false; lockScroll(true); }
  function closeDrawer() { $('#drawer').hidden = true; lockScroll(false); }
  function closeSheet() { $('#sheet').hidden = true; lockScroll(false); }
  function closeAll() { closeModal(); closeDrawer(); closeSheet(); }
  $('#modal').addEventListener('click', (e) => { if (e.target.closest('[data-close]')) closeModal(); });
  $('#drawer').addEventListener('click', (e) => { if (e.target.closest('[data-close-drawer]') || e.target.closest('a')) closeDrawer(); });
  $('#sheet').addEventListener('click', (e) => { if (e.target.closest('[data-close-sheet]') || e.target.closest('a')) closeSheet(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeAll(); });

  function openSheet(prod, opt) {
    const sub = cartSubtotal();
    const goal = S.catalog.freeDeliveryFrom;
    const n = cartCount();
    $('#sheet-body').innerHTML = `
      <div class="sheet-added"><span class="cimg" style="${bg(prod)}">${prod.emoji}</span>
        <div><h3>✓ Ajouté au panier</h3><div class="small muted">${esc(prod.name)}${opt ? ` · ${esc(opt)}` : ''}</div></div></div>
      ${sub >= goal ? '<div class="free-ok">✓ Votre commande est éligible à la livraison GRATUITE au Cameroun.</div>'
        : `<div class="free-bar">Ajoutez <b>${money(goal - sub)}</b> d'articles pour la livraison GRATUITE.<div class="bar"><i style="width:${(sub / goal) * 100}%"></i></div></div>`}
      <div><b>Sous-total du panier :</b> ${priceHtml(sub, { size: 'md' })}</div>
      <a class="btn btn-y btn-block btn-lg" href="#/commande">Passer la commande (${n} article${n > 1 ? 's' : ''})</a>
      <a class="btn btn-block" href="#/panier">Aller au panier</a>
      <button class="btn btn-block" data-close-sheet>Continuer mes achats</button>
      <hr>
      <div><b>Souvent achetés ensemble</b></div>
      <div class="carousel" style="grid-auto-columns:130px">${S.catalog.products.filter((x) => x.cat === prod.cat && x.id !== prod.id).slice(0, 6).map((x) => tile(x)).join('')}</div>`;
    $('#sheet').hidden = false;
    lockScroll(true);
  }

  function optionButtons(prod, selected) {
    return prod.options.map((o) => `<button class="opt ${o.label === selected ? 'active' : ''}" data-opt="${esc(o.label)}">${esc(o.label)}${o.price ? `<small>${money(o.price)}</small>` : ''}</button>`).join('');
  }
  function quickAdd(id) {
    const prod = byId(id);
    if (!prod.options) return addToCart(id, null, 1);
    let sel = prod.options[0].label;
    openModal(`
      <div class="sheet-added"><span class="cimg" style="${bg(prod)}">${prod.emoji}</span>
        <div><h2>${esc(prod.name)}</h2><div id="qa-price">${priceHtml(unitPrice(prod, sel), { size: 'md' })}</div></div></div>
      <div class="opt-title">${esc(prod.optionLabel || 'Option')} : <b id="qa-name">${esc(sel)}</b></div>
      <div class="opts" id="qa-opts">${optionButtons(prod, sel)}</div>
      <button class="btn btn-y btn-block btn-lg" style="margin-top:18px" id="qa-add">Ajouter au panier</button>
      <p class="small" style="text-align:center"><a class="lnk" href="#/produit/${prod.id}" data-close>Voir tous les détails</a></p>`);
    $('#qa-opts').addEventListener('click', (e) => {
      const b = e.target.closest('[data-opt]');
      if (!b) return;
      sel = b.dataset.opt;
      $('#qa-opts').innerHTML = optionButtons(prod, sel);
      $('#qa-name').textContent = sel;
      $('#qa-price').innerHTML = priceHtml(unitPrice(prod, sel), { size: 'md' });
    });
    $('#qa-add').addEventListener('click', () => { closeModal(); addToCart(id, sel, 1); });
  }

  function openCityModal() {
    openModal(`
      <h2>Choisissez la ville de livraison</h2>
      <p class="muted small" style="margin-top:0">Les délais et les frais affichés dépendent de la ville de votre proche au Cameroun.</p>
      <div class="city-list" id="city-list">${S.catalog.cities.map((c) => `
        <button data-city="${esc(c.name)}" class="${c.name === S.city ? 'on' : ''}"><span>${esc(c.name)}</span><small>${money(c.fee)} · ${esc(c.days)}</small></button>`).join('')}
      </div>`);
    $('#city-list').addEventListener('click', (e) => {
      const b = e.target.closest('[data-city]');
      if (!b) return;
      S.city = b.dataset.city;
      save('pdp_city', S.city);
      updateCityLabels();
      render();
      toast(`Livraison à ${S.city}`);
    });
  }
  function updateCityLabels() {
    $('#deliver-city').textContent = S.city;
    $('#deliver-city-m').textContent = S.city;
  }

  // délégation globale
  document.addEventListener('click', (e) => {
    const fav = e.target.closest('[data-fav]');
    if (fav) { e.preventDefault(); return toggleFav(fav.dataset.fav); }
    const qa = e.target.closest('[data-quick]');
    if (qa) { e.preventDefault(); return quickAdd(qa.dataset.quick); }
    if (e.target.closest('[data-city-open]')) { e.preventDefault(); return openCityModal(); }
    return undefined;
  });

  // ================================================================ en-tête
  function setupHeader() {
    const C = S.catalog;
    const cur = $('#currency');
    cur.innerHTML = Object.keys(C.currencies).map((k) => `<option value="${k}" ${k === S.currency ? 'selected' : ''}>${k === 'XAF' ? 'FCFA' : k}</option>`).join('');
    cur.addEventListener('change', () => { S.currency = cur.value; save('pdp_currency', S.currency); render(); });

    $('#search-cat').innerHTML = '<option value="">Toutes nos catégories</option>' + C.categories.map((c) => `<option value="${c.slug}">${esc(c.name)}</option>`).join('');
    $('#search-form').addEventListener('submit', (e) => {
      e.preventDefault();
      const q = $('#search-input').value.trim();
      const cat = $('#search-cat').value;
      if (!q) location.hash = cat ? `#/categorie/${cat}` : '#/';
      else location.hash = `#/recherche/${encodeURIComponent(q)}${cat ? `?cat=${cat}` : ''}`;
    });

    $('#subnav-links').innerHTML = [
      '<a href="#/flash" data-nav="flash" class="hot">Ventes Flash</a>',
      '<a href="#/meilleures-ventes" data-nav="best">Meilleures ventes</a>',
      ...C.categories.map((c) => `<a href="#/categorie/${c.slug}" data-nav="${c.slug}">${esc(c.name)}</a>`),
      '<a href="#/panier-partage" data-nav="partage">Panier partagé</a>',
      '<a href="#/faq" data-nav="faq">Service client</a>',
    ].join('');

    $('#drawer-body').innerHTML = `
      <div class="drawer-sec"><h3>Tendances</h3>
        <a href="#/flash">Ventes Flash <span>›</span></a><a href="#/meilleures-ventes">Meilleures ventes <span>›</span></a><a href="#/categorie/paniers">Paniers tout prêts <span>›</span></a></div>
      <div class="drawer-sec"><h3>Acheter par rayon</h3>
        ${C.categories.map((c) => `<a href="#/categorie/${c.slug}">${esc(c.name)} <span>›</span></a>`).join('')}
        <a href="#/categories">Tous les rayons <span>›</span></a></div>
      <div class="drawer-sec"><h3>Pour la diaspora</h3>
        <a href="#/panier-partage">Le panier partagé <span>›</span></a><a href="#/comment-ca-marche">Comment ça marche <span>›</span></a></div>
      <div class="drawer-sec"><h3>Aide et paramètres</h3>
        <a href="#/suivi">Vos commandes</a><a href="#/favoris">Votre liste d'envies</a><a href="#/faq">Service client</a></div>`;

    $('#menu-btn').addEventListener('click', openDrawer);
    $('#tab-menu').addEventListener('click', openDrawer);
    $('#deliver-btn').addEventListener('click', openCityModal);
    $('#deliver-strip').addEventListener('click', openCityModal);
    $('#back-top').addEventListener('click', (e) => { e.preventDefault(); window.scrollTo({ top: 0 }); });
    $('#year').textContent = new Date().getFullYear();
    updateCityLabels();
  }
  function setActive(nav, tab) {
    $$('#subnav-links a').forEach((a) => a.classList.toggle('active', a.dataset.nav === nav));
    $$('.tabbar [data-tab]').forEach((a) => a.classList.toggle('active', a.dataset.tab === tab));
  }

  // ================================================================ compte à rebours
  let timers = [];
  const clearTimers = () => { timers.forEach(clearInterval); timers = []; };
  const countdownHtml = () => '<span class="small" data-countdown></span>';
  function startCountdowns() {
    const tick = () => {
      const now = new Date();
      const end = new Date(now);
      end.setHours(24, 0, 0, 0);
      let s = Math.max(0, Math.floor((end - now) / 1000));
      const h = String(Math.floor(s / 3600)).padStart(2, '0');
      s %= 3600;
      const txt = `Se termine dans ${h} h ${String(Math.floor(s / 60)).padStart(2, '0')} min ${String(s % 60).padStart(2, '0')} s`;
      $$('[data-countdown]').forEach((el) => { el.textContent = txt; });
    };
    tick();
    timers.push(setInterval(tick, 1000));
  }

  // ================================================================ blocs réutilisés
  function stepsHtml() {
    return `<div class="steps">
      <div class="step"><span class="num">1</span><h3>Choisissez</h3><p>Vivres, habits, chaussures, cadeaux, ou un panier tout prêt. Prix affichés dans votre devise.</p></div>
      <div class="step"><span class="num">2</span><h3>Indiquez le bénéficiaire</h3><p>Nom, téléphone, ville et quartier de votre proche au Cameroun.</p></div>
      <div class="step"><span class="num">3</span><h3>Payez d'où vous êtes</h3><p>Carte bancaire, PayPal ou Mobile Money. Paiement sécurisé.</p></div>
      <div class="step"><span class="num">4</span><h3>Nous livrons au pays</h3><p>24 h à Yaoundé et Douala. Photo de la remise envoyée sur WhatsApp.</p></div>
    </div>`;
  }
  function trustHtml() {
    return `<div class="trust">
      <div><span>🔒</span><span><b>Paiement sécurisé</b>Carte, PayPal, Mobile Money</span></div>
      <div><span>🚚</span><span><b>Livraison en 24 à 96 h</b>Dans tout le Cameroun</span></div>
      <div><span>📸</span><span><b>Preuve de livraison</b>Photo envoyée sur WhatsApp</span></div>
      <div><span>💬</span><span><b>Service client</b>7 j/7, en français et en anglais</span></div>
    </div>`;
  }
  function carouselBox(title, prods, { href, more = 'Voir plus', deal = false, extra = '' } = {}) {
    return `<section class="box"><div class="row-head"><h2>${title}</h2>${extra}${href ? `<a class="lnk" href="${href}">${more}</a>` : ''}</div>
      <div class="carousel">${prods.map((p) => tile(p, { deal })).join('')}</div></section>`;
  }

  // ================================================================ accueil
  function pageHome() {
    setActive('', 'home');
    const P = S.catalog.products;
    const inCat = (slug) => P.filter((x) => x.cat === slug).sort((a, b) => b.sold - a.sold);
    const pick = (ids) => ids.map(byId).filter(Boolean);
    const flash = P.filter((x) => x.tags.includes('flash')).sort((a, b) => pct(b) - pct(a));
    const best = P.filter((x) => x.tags.includes('best')).sort((a, b) => b.sold - a.sold);
    const cheap = P.filter((x) => x.price < 10000).sort((a, b) => b.sold - a.sold);
    const slides = [
      { bg: 'linear-gradient(115deg,#0b5d46 0%,#1b8a64 60%,#2aa877 100%)', small: 'Nouveau · Panier partagé', h: 'Ils choisissent au pays, vous validez d\'ici', p: 'Votre famille compose son panier au Cameroun et vous envoie le lien. Vous payez en un clic.', cta: 'Découvrir', href: '#/panier-partage', art: '🤝' },
      { bg: 'linear-gradient(115deg,#8f0f1c 0%,#c8202b 55%,#ee5a2f 100%)', small: 'Fêtes de fin d\'année', h: 'Jusqu\'à -30 % sur les paniers de fête', p: 'Poulets, riz, boissons et cadeaux livrés à la maison pour Noël et le Nouvel An.', cta: 'Voir les offres', href: '#/flash', art: '🎄' },
      { bg: 'linear-gradient(115deg,#6b4a00 0%,#b07d06 55%,#e0a91a 100%)', small: 'Du marché à la maison', h: 'Le marché du pays, livré en 24 h', p: 'Manioc, plantain, ndolè, viande fraîche : achetés le matin, livrés le jour même.', cta: 'Faire le marché', href: '#/categorie/vivres', art: '🍌' },
    ];
    app.innerHTML = `
      <section class="hero" id="hero">
        ${slides.map((s, i) => `
          <div class="slide ${i === 0 ? 'active' : ''}" style="background:${s.bg}">
            <div class="slide-text"><small>${s.small}</small><h1>${s.h}</h1><p>${s.p}</p><a class="btn btn-y" href="${s.href}">${s.cta}</a></div>
            <div class="slide-art">${s.art}</div>
          </div>`).join('')}
        <button class="hero-arrow prev" data-dir="-1" aria-label="Diapositive précédente">‹</button>
        <button class="hero-arrow next" data-dir="1" aria-label="Diapositive suivante">›</button>
      </section>

      <div class="home-grid">
        ${quadCard('Vivres du marché, livrés en 24 h', inCat('vivres'), '#/categorie/vivres', 'Faire le marché')}
        ${quadCard('Paniers tout prêts', inCat('paniers'), '#/categorie/paniers', 'Voir tous les paniers')}
        ${quadCard('Mode en pagne pour les fêtes', pick(['kaba-ngondo', 'chemise-pagne', 'robe-pagne', 'boubou-homme']), '#/categorie/femme', 'Découvrir la mode')}
        <div class="hcard hcard-cta">
          <h2>Vous êtes au Cameroun ?</h2>
          <p>Composez votre panier et envoyez le lien à un proche à l'étranger. Il le valide et le paie.</p>
          <div class="flow"><span>🧺</span><i>→ WhatsApp →</i><span>💳</span></div>
          <a class="btn btn-y btn-block" href="#/panier-partage">Découvrir le panier partagé</a>
          <a class="lnk small" href="#/suivi">J'ai reçu un code de panier</a>
        </div>
      </div>

      ${carouselBox('Ventes Flash', flash, { href: '#/flash', more: 'Voir toutes les offres', deal: true, extra: countdownHtml() })}

      <div class="home-grid" style="margin-top:20px">
        ${quadCard('Chaussures pour les grandes occasions', inCat('chaussures'), '#/categorie/chaussures', 'Voir les chaussures')}
        <div class="hcard hcard-big"><h2>Un anniversaire au pays ?</h2>
          <a class="bigimg" href="#/produit/gateau" style="${bg(byId('gateau'))}">🎂</a>
          <a class="lnk more" href="#/categorie/fetes">Gâteaux, fleurs et cadeaux</a></div>
        ${quadCard(`Moins de ${money(10000)}`, cheap, '#/recherche/%20?prix=lt10', 'Voir les petits prix')}
        ${quadCard('Équiper la maison', inCat('maison'), '#/categorie/maison', 'Voir l\'électroménager')}
      </div>

      ${carouselBox('Meilleures ventes dans Vivres & Marché', inCat('vivres'), { href: '#/categorie/vivres' })}

      <div class="home-grid" style="margin-top:20px">
        ${quadCard('Rentrée des classes', inCat('enfants'), '#/categorie/enfants', 'Préparer la rentrée')}
        ${quadCard('Téléphones et high-tech', inCat('telephones'), '#/categorie/telephones', 'Voir les téléphones')}
        ${quadCard('Beauté et santé', inCat('beaute'), '#/categorie/beaute', 'Voir la beauté')}
        ${quadCard('Fêtes, deuils et mariages', inCat('fetes'), '#/categorie/fetes', 'Organiser un événement')}
      </div>

      ${carouselBox('Les plus offerts à la famille', best, { href: '#/meilleures-ventes' })}
      <section class="box"><div class="row-head"><h2>Comment ça marche</h2><a class="lnk" href="#/comment-ca-marche">En savoir plus</a></div>${stepsHtml()}</section>
      <section class="box">${trustHtml()}</section>`;

    let cur = 0;
    const go = (i) => {
      cur = (i + slides.length) % slides.length;
      $$('.slide').forEach((s, k) => s.classList.toggle('active', k === cur));
    };
    $$('.hero-arrow').forEach((b) => b.addEventListener('click', () => go(cur + Number(b.dataset.dir))));
    timers.push(setInterval(() => go(cur + 1), 6000));
    startCountdowns();
  }

  // ================================================================ résultats
  const PRICE_RANGES = [
    ['lt5', 'Moins de 5 000 FCFA', (p) => p < 5000],
    ['5-15', '5 000 à 15 000 FCFA', (p) => p >= 5000 && p < 15000],
    ['15-50', '15 000 à 50 000 FCFA', (p) => p >= 15000 && p < 50000],
    ['gt50', '50 000 FCFA et plus', (p) => p >= 50000],
    ['lt10', 'Moins de 10 000 FCFA', (p) => p < 10000],
  ];
  function pageList({ title, products, nav = '', crumbs, query = '', tab = 'home', note = '', initial = {} }) {
    setActive(nav, tab);
    const f = { cat: '', rating: 0, price: '', promo: false, sort: 'reco', ...initial };
    const cats = [...new Set(products.map((p) => p.cat))];
    app.innerHTML = `
      <div class="results-bar">
        <span id="count"></span>
        <span style="display:flex;gap:8px;align-items:center">
          <button class="btn filters-toggle" id="filters-toggle">Filtres</button>
          <select class="sort" id="sort" aria-label="Trier par">
            <option value="reco">Trier par : En vedette</option>
            <option value="asc">Prix : par ordre croissant</option>
            <option value="desc">Prix : par ordre décroissant</option>
            <option value="rating">Moyenne des commentaires</option>
            <option value="sold">Les plus vendus</option>
            <option value="off">Meilleures remises</option>
          </select>
        </span>
      </div>
      <div class="breadcrumb"><a href="#/">Accueil</a> › ${crumbs}</div>
      <div class="results">
        <aside class="filters" id="filters"></aside>
        <div>
          <div class="r-head"><h1>${title}</h1><div class="small muted">${note || `Vérifiez chaque page produit pour les autres options d'achat. Prix et délais pour une livraison à ${esc(S.city)}.`}</div></div>
          <div id="list"></div>
        </div>
      </div>`;
    $('#sort').value = f.sort;
    const draw = () => {
      let list = products.slice();
      if (f.cat) list = list.filter((x) => x.cat === f.cat);
      if (f.rating) list = list.filter((x) => x.rating >= f.rating);
      if (f.price) {
        const r = PRICE_RANGES.find((x) => x[0] === f.price);
        if (r) list = list.filter((x) => r[2](x.price));
      }
      if (f.promo) list = list.filter((x) => x.oldPrice);
      const sorters = {
        asc: (a, b) => a.price - b.price, desc: (a, b) => b.price - a.price, rating: (a, b) => b.rating - a.rating,
        sold: (a, b) => b.sold - a.sold, off: (a, b) => pct(b) - pct(a),
      };
      if (sorters[f.sort]) list.sort(sorters[f.sort]);
      const where = crumbs.replace(/<[^>]+>/g, '');
      $('#count').innerHTML = `${list.length ? `1-${list.length} sur ` : ''}${list.length} résultat${list.length > 1 ? 's' : ''} ${query ? `pour <b class="q">« ${esc(query)} »</b>` : `dans <b>${where}</b>`}`;
      $('#list').innerHTML = list.length
        ? `<div class="r-grid">${list.map(card).join('')}</div>`
        : '<div class="empty box"><div class="big">🔎</div><h2>Aucun résultat</h2><p>Essayez d\'autres mots ou retirez un filtre.</p></div>';
      const on = (cond) => (cond ? 'on' : '');
      $('#filters').innerHTML = `
        ${cats.length > 1 ? `<div><h3>Catégorie</h3>${cats.map((c) => `<button class="${on(f.cat === c)}" data-k="cat" data-v="${c}">${esc(catOf(c).name)} (${products.filter((p) => p.cat === c).length})</button>`).join('')}</div>` : ''}
        <div><h3>Avis des clients</h3>${[4.5, 4].map((r) => `<button class="${on(f.rating === r)}" data-k="rating" data-v="${r}">${stars(r)} ${String(r).replace('.', ',')} et plus</button>`).join('')}</div>
        <div><h3>Prix</h3>${PRICE_RANGES.slice(0, 4).map(([k, label]) => `<button class="${on(f.price === k)}" data-k="price" data-v="${k}">${label}</button>`).join('')}</div>
        <div><h3>Offres et remises</h3><button class="${on(f.promo)}" data-k="promo" data-v="1">${f.promo ? '☑' : '☐'} Articles en promotion</button></div>
        <div><h3>Livraison</h3><button data-city-open="1">📍 ${esc(S.city)} (modifier)</button><span class="small muted">Gratuite dès ${money(S.catalog.freeDeliveryFrom)}</span></div>
        ${f.cat || f.rating || f.price || f.promo ? '<div><button class="lnk" data-k="reset">Effacer tous les filtres</button></div>' : ''}`;
    };
    $('#filters').addEventListener('click', (e) => {
      const b = e.target.closest('[data-k]');
      if (!b) return;
      const { k, v } = b.dataset;
      if (k === 'reset') Object.assign(f, { cat: '', rating: 0, price: '', promo: false });
      else if (k === 'promo') f.promo = !f.promo;
      else if (k === 'rating') f.rating = f.rating === Number(v) ? 0 : Number(v);
      else f[k] = f[k] === v ? '' : v;
      draw();
    });
    $('#sort').addEventListener('change', (e) => { f.sort = e.target.value; draw(); });
    $('#filters-toggle').addEventListener('click', () => $('#filters').classList.toggle('open'));
    draw();
  }

  function pageCategory(slug) {
    const c = catOf(slug);
    if (!c) return pageNotFound();
    return pageList({ title: esc(c.name), products: S.catalog.products.filter((x) => x.cat === slug), nav: slug, crumbs: esc(c.name), tab: 'menu' });
  }
  function pageFlash() {
    pageList({ title: 'Ventes Flash', products: S.catalog.products.filter((x) => x.tags.includes('flash')), nav: 'flash', crumbs: 'Ventes Flash', note: 'Les prix les plus bas du jour, renouvelés chaque nuit à minuit. ' });
    $('.r-head .small').insertAdjacentHTML('beforeend', countdownHtml());
    startCountdowns();
  }
  function pageBest() {
    pageList({ title: 'Meilleures ventes', products: S.catalog.products.slice().sort((a, b) => b.sold - a.sold).slice(0, 30), nav: 'best', crumbs: 'Meilleures ventes', initial: { sort: 'sold' } });
  }
  function pageSearch(q, params) {
    const norm = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    const words = norm(q).split(/\s+/).filter(Boolean);
    const cat = params.get('cat') || '';
    const list = S.catalog.products.filter((x) => {
      if (cat && x.cat !== cat) return false;
      const hay = norm(`${x.name} ${x.description} ${(catOf(x.cat) || {}).name} ${(x.contents || []).join(' ')} ${x.origin}`);
      return words.every((w) => hay.includes(w));
    });
    const trimmed = q.trim();
    $('#search-input').value = trimmed;
    $('#search-cat').value = cat;
    pageList({
      title: trimmed ? 'Résultats' : 'Tous les articles', products: list, crumbs: trimmed ? 'Recherche' : 'Tous les articles', query: trimmed,
      initial: { price: params.get('prix') || '' },
    });
  }
  function pageCategories() {
    setActive('', 'menu');
    app.innerHTML = `<h1 class="page-title">Tous les rayons</h1>
      <div class="home-grid" style="margin-top:14px">${S.catalog.categories.map((c) => {
        const items = S.catalog.products.filter((x) => x.cat === c.slug).sort((a, b) => b.sold - a.sold);
        return quadCard(esc(c.name), items, `#/categorie/${c.slug}`, `Voir les ${items.length} articles`);
      }).join('')}</div>`;
  }
  function pageFavs() {
    setActive('', 'favoris');
    const list = S.favs.map(byId).filter(Boolean);
    app.innerHTML = `<section class="box"><h2>Votre liste d'envies</h2>${list.length
      ? `<p class="muted small">${list.length} article${list.length > 1 ? 's' : ''} gardé${list.length > 1 ? 's' : ''} pour plus tard.</p><div class="r-grid">${list.map(card).join('')}</div>`
      : '<div class="empty"><div class="big">♡</div><h2>Votre liste d\'envies est vide</h2><p>Touchez le cœur d\'un article pour le garder ici.</p><a class="btn btn-y" href="#/">Découvrir les articles</a></div>'}</section>`;
  }

  // ================================================================ fiche produit
  function histogram(r) {
    const five = Math.max(40, Math.min(88, Math.round((r - 4) * 100 + 20)));
    const four = Math.round((100 - five) * 0.6);
    const three = Math.round((100 - five - four) * 0.6);
    const two = Math.round((100 - five - four - three) * 0.5);
    return [five, four, three, two, 100 - five - four - three - two];
  }
  function pageProduct(id) {
    const prod = byId(id);
    if (!prod) return pageNotFound();
    const c = catOf(prod.cat);
    setActive(prod.cat, 'menu');
    let opt = prod.options ? prod.options[0].label : null;
    let qty = 1;
    const off = pct(prod);
    const related = S.catalog.products.filter((x) => x.cat === prod.cat && x.id !== prod.id)
      .concat(S.catalog.products.filter((x) => x.cat !== prod.cat && x.tags.includes('best')).slice(0, 4));
    const angles = [prod.emoji, c.emoji, '🎁', '🚚'];
    const about = [
      prod.description || `${prod.name}, sélectionné par notre équipe au Cameroun et livré directement chez votre proche.`,
      `Provenance : ${prod.origin}. Acheté le jour de la commande et contrôlé avant le départ.`,
      `Livraison en 24 h à Yaoundé et Douala, en 48 à 96 h dans les autres villes. Gratuite dès ${money(S.catalog.freeDeliveryFrom)}.`,
      'Le livreur appelle le bénéficiaire avant d\'arriver et vous envoie une photo de la remise sur WhatsApp.',
      'Message cadeau gratuit : ajoutez quelques mots pour votre proche au moment de la commande.',
    ];
    const histo = histogram(prod.rating);
    const reviews = [
      ['Christelle', 'Lyon', 'Reçu le lendemain, tout était frais', 'Ma mère a reçu la commande le lendemain matin à Biyem-Assi. Merci pour la photo de la livraison, ça rassure.'],
      ['Junior', 'Montréal', 'Très pratique depuis le Canada', 'Le livreur a appelé mon frère avant d\'arriver. Je paie en dollars canadiens et je sais exactement ce qui est livré.'],
      ['Aïcha', 'Bruxelles', 'Le message cadeau a fait plaisir', 'Qualité au rendez-vous, et le petit mot que j\'ai écrit a beaucoup touché ma grand-mère.'],
    ];
    const convText = (u) => `${S.currency !== 'XAF' ? `Soit ${money(u, 'XAF')} au Cameroun · ` : ''}Frais de service de ${Math.round(S.catalog.serviceFeeRate * 100)} % ajoutés à la commande`;
    app.innerHTML = `
      <div class="breadcrumb"><a href="#/">Accueil</a> › <a href="#/categorie/${c.slug}">${esc(c.name)}</a> › ${esc(prod.name)}</div>
      <div class="pdp">
        <div class="gallery">
          <div class="thumbs">${angles.map((a, i) => `<button class="${i === 0 ? 'active' : ''}" data-thumb="${a}" aria-label="Vue ${i + 1}">${a}</button>`).join('')}</div>
          <div class="main-img" style="${bg(prod)}"><span id="main-emoji">${prod.emoji}</span></div>
        </div>
        <div class="p-center">
          <h1>${esc(prod.name)}</h1>
          <a class="lnk p-store" href="#/categorie/${c.slug}">Visiter le rayon ${esc(c.name)}</a>
          <div class="rating" style="margin-top:4px"><span>${String(prod.rating).replace('.', ',')}</span>${stars(prod.rating)}<a class="lnk" href="#avis" id="to-reviews">${prod.reviews} évaluations</a></div>
          <div class="r-bought">${kfmt(prod.sold)} achetés le mois dernier</div>
          <div style="margin-top:6px">${badgesHtml(prod)}</div>
          <hr>
          ${prod.tags.includes('flash') && off ? '<span class="deal-badge">Offre à durée limitée</span>' : ''}
          <div class="p-price-row">${off ? `<span class="p-off">-${off} %</span>` : ''}<span id="p-price">${priceHtml(unitPrice(prod, opt))}</span></div>
          ${prod.oldPrice ? `<div class="list-price">Prix conseillé : <s id="p-old">${money(oldUnit(prod, opt))}</s></div>` : ''}
          <div class="p-conv" id="p-conv">${convText(unitPrice(prod, opt))}</div>
          ${prod.options ? `<div class="opt-title">${esc(prod.optionLabel || 'Option')} : <b id="opt-name">${esc(opt)}</b></div><div class="opts" id="opts">${optionButtons(prod, opt)}</div>` : ''}
          ${prod.contents ? `<div class="p-contents"><b>Contenu du panier</b><ul>${prod.contents.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div>` : ''}
          <hr>
          <h3 style="font-size:16px;margin:0 0 6px">À propos de cet article</h3>
          <ul class="about">${about.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>
        </div>
        <div class="buybox">
          <div id="bb-price">${priceHtml(unitPrice(prod, opt), { size: 'md' })}</div>
          <div id="bb-ship">${deliveryHtml(unitPrice(prod, opt))}</div>
          <button class="linkbtn" data-city-open="1">📍 Livrer à ${esc(S.city)} — modifier</button>
          <div class="stock">En stock</div>
          <label class="small">Quantité :
            <select id="qty-sel">${Array.from({ length: 10 }, (_, i) => `<option value="${i + 1}">${i + 1}</option>`).join('')}</select>
          </label>
          <button class="btn btn-y btn-block btn-lg" id="add">Ajouter au panier</button>
          <button class="btn btn-buy btn-block btn-lg" id="buy-now">Acheter maintenant</button>
          <div class="facts">
            <span>Expédié par</span><span>Panier du Pays</span>
            <span>Vendu par</span><span>${esc(prod.origin)}</span>
            <span>Retours</span><span>Remplacé si abîmé à la livraison</span>
            <span>Paiement</span><span>Transaction sécurisée</span>
          </div>
          <div class="buybox-alt">
            <button class="linkbtn" data-fav="${prod.id}">${S.favs.includes(prod.id) ? '♥ Dans votre liste d\'envies' : '♡ Ajouter à ma liste d\'envies'}</button>
          </div>
          <div class="buybox-alt">
            <b>Vous êtes au Cameroun ?</b><br>
            <button class="linkbtn" id="ask-pay">Faire payer cet article par un proche à l'étranger</button>
          </div>
        </div>
      </div>
      ${carouselBox('Les clients ayant consulté cet article ont aussi acheté', related.slice(0, 14))}
      <section class="box" id="avis">
        <div class="reviews-wrap">
          <div>
            <h2>Commentaires client</h2>
            <div class="rating" style="font-size:18px">${stars(prod.rating)} <b>${String(prod.rating).replace('.', ',')} sur 5</b></div>
            <div class="small muted">${prod.reviews} évaluations</div>
            <div class="histo">${histo.map((v, i) => `<div><span class="lnk">${5 - i} étoile${i < 4 ? 's' : ''}</span><span class="bar"><i style="width:${v}%"></i></span><span>${v} %</span></div>`).join('')}</div>
          </div>
          <div>
            <h3 style="margin-top:0">Meilleures évaluations de la diaspora</h3>
            ${reviews.map(([who, city, t, txt], i) => `<div class="review">
              <div class="who"><span>👤</span><span>${who}</span></div>
              <div class="rating">${stars(5)}<h4>${esc(t)}</h4></div>
              <div class="small muted">Commenté depuis ${city} il y a ${i * 4 + 3} jours · <span class="verified">Achat vérifié</span></div>
              <p style="margin:6px 0 0">${esc(txt)}</p></div>`).join('')}
          </div>
        </div>
      </section>`;

    const refresh = () => {
      const u = unitPrice(prod, opt);
      $('#p-price').innerHTML = priceHtml(u);
      if ($('#p-old')) $('#p-old').textContent = money(oldUnit(prod, opt));
      $('#p-conv').textContent = convText(u);
      $('#bb-price').innerHTML = priceHtml(u * qty, { size: 'md' });
      $('#bb-ship').innerHTML = deliveryHtml(u * qty);
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
    $('#qty-sel').addEventListener('change', (e) => { qty = Number(e.target.value); refresh(); });
    $('#to-reviews').addEventListener('click', (e) => { e.preventDefault(); $('#avis').scrollIntoView({ behavior: 'smooth' }); });
    $('#add').addEventListener('click', () => addToCart(prod.id, opt, qty));
    $('#buy-now').addEventListener('click', () => { addToCart(prod.id, opt, qty, { sheet: false }); location.hash = '#/commande'; });
    $('#ask-pay').addEventListener('click', () => { addToCart(prod.id, opt, qty, { sheet: false }); location.hash = '#/panier?partager=1'; });
    return undefined;
  }

  // ================================================================ panier
  function totalsFor(items, cityName) {
    const subtotal = cartSubtotal(items);
    const city = S.catalog.cities.find((c) => c.name === cityName);
    const delivery = !city ? null : subtotal >= S.catalog.freeDeliveryFrom ? 0 : city.fee;
    const service = Math.round(subtotal * S.catalog.serviceFeeRate);
    return { subtotal, delivery, service, total: subtotal + (delivery || 0) + service };
  }
  function freeShipHtml(subtotal) {
    const goal = S.catalog.freeDeliveryFrom;
    if (subtotal >= goal) return '<div class="free-ok">✓ <span>Votre commande est éligible à la <b>livraison GRATUITE</b> au Cameroun.</span></div>';
    return `<div class="free-bar">Ajoutez <b>${money(goal - subtotal)}</b> d'articles pour bénéficier de la livraison GRATUITE.<div class="bar"><i style="width:${(subtotal / goal) * 100}%"></i></div></div>`;
  }
  const nArticles = (n) => `${n} article${n > 1 ? 's' : ''}`;

  function pageCart(params) {
    setActive('', 'panier');
    const best = S.catalog.products.filter((x) => x.tags.includes('best')).sort((a, b) => b.sold - a.sold);
    if (!S.cart.length) {
      app.innerHTML = `<div class="cart-main"><h1>Votre panier est vide</h1>
          <p class="muted">Faites plaisir à vos proches au Cameroun : vivres, habits, cadeaux et paniers tout prêts.</p>
          <a class="btn btn-y" href="#/">Commencer mes achats</a> <a class="lnk small" href="#/favoris" style="margin-left:10px">Voir ma liste d'envies</a></div>
        ${carouselBox('Les plus offerts à la famille', best)}`;
      return;
    }
    const t = totalsFor(S.cart, S.city);
    const n = cartCount();
    app.innerHTML = `
      <div class="cart-wrap">
        <div class="cart-main">
          <h1>Panier</h1>
          <div class="price-col">Prix</div>
          ${S.cart.map((i, k) => {
            const prod = byId(i.id);
            const u = unitPrice(prod, i.option);
            return `<div class="cart-line">
              <a href="#/produit/${prod.id}" class="cimg" style="${bg(prod)}">${prod.emoji}</a>
              <div>
                <h3><a href="#/produit/${prod.id}">${esc(prod.name)}</a></h3>
                <div class="meta">
                  <span class="ok">En stock</span>
                  ${badgesHtml(prod) ? `<span>${badgesHtml(prod)}</span>` : ''}
                  <span class="muted">Expédié par Panier du Pays · Livraison à ${esc(S.city)}</span>
                  ${i.option ? `<span><b>${esc(prod.optionLabel || 'Option')} :</b> ${esc(i.option)}</span>` : ''}
                </div>
                <div class="cart-actions">
                  <span class="qty-pill"><button data-line="${k}" data-d="-1" aria-label="${i.qty === 1 ? 'Supprimer' : 'Diminuer'}">${i.qty === 1 ? '🗑' : '−'}</button><span>${i.qty}</span><button data-line="${k}" data-d="1" aria-label="Augmenter">+</button></span>
                  <span class="sep"></span>
                  <button class="linkbtn" data-remove="${k}">Supprimer</button>
                  <span class="sep"></span>
                  <button class="linkbtn" data-later="${k}">Mettre dans ma liste d'envies</button>
                </div>
              </div>
              <div class="lp" style="text-align:right">${priceHtml(u * i.qty, { size: 'sm' })}${i.qty > 1 ? `<div class="small muted">${money(u)} l'unité</div>` : ''}</div>
            </div>`;
          }).join('')}
          <div class="subtotal-line">Sous-total (${nArticles(n)}) : <b>${money(t.subtotal)}</b></div>
        </div>
        <div class="side">
          <div class="side-box">
            ${freeShipHtml(t.subtotal)}
            <div class="sub">Sous-total (${nArticles(n)}) : <b>${money(t.subtotal)}</b></div>
            <div class="small muted">Livraison à ${esc(S.city)} : ${t.delivery === 0 ? 'gratuite' : money(t.delivery)} · frais de service ${money(t.service)}</div>
            <a class="btn btn-y btn-block btn-lg" href="#/commande">Passer la commande</a>
          </div>
          <div class="side-box share-box">
            <h3>Vous êtes au Cameroun ?</h3>
            <p>Envoyez ce panier à un proche à l'étranger. Il voit chaque article, le valide et le paie.</p>
            <button class="btn btn-block" id="share-btn">🤝 Faire payer par un proche</button>
          </div>
        </div>
      </div>
      ${carouselBox('Les plus offerts à la famille', best)}`;
    $('.cart-main').addEventListener('click', (e) => {
      const d = e.target.closest('[data-d]');
      const r = e.target.closest('[data-remove]');
      const l = e.target.closest('[data-later]');
      if (d) {
        const idx = +d.dataset.line;
        const line = S.cart[idx];
        line.qty = Math.min(99, line.qty + Number(d.dataset.d));
        if (line.qty < 1) S.cart.splice(idx, 1);
      } else if (r) {
        S.cart.splice(+r.dataset.remove, 1);
        toast('Article supprimé du panier');
      } else if (l) {
        const [line] = S.cart.splice(+l.dataset.later, 1);
        if (!S.favs.includes(line.id)) { S.favs.push(line.id); save('pdp_favs', S.favs); }
        toast('Déplacé dans votre liste d\'envies');
      } else return;
      persistCart();
      pageCart(new URLSearchParams());
    });
    $('#share-btn').addEventListener('click', openShareModal);
    if (params.get('partager') === '1') openShareModal();
  }

  function cityOptions(selected) {
    return '<option value="">Choisir la ville</option>' + S.catalog.cities.map((c) => `<option ${c.name === selected ? 'selected' : ''}>${esc(c.name)}</option>`).join('');
  }

  function openShareModal() {
    openModal(`
      <h2>Faire payer ce panier par un proche</h2>
      <p class="muted small" style="margin-top:0">Nous créons un lien unique. Envoyez-le par WhatsApp à la personne qui va payer (en France, au Canada, aux États-Unis…).</p>
      <form id="share-form" class="fields">
        <div class="field"><label for="sh-name">Votre nom *</label><input id="sh-name" name="name" required maxlength="80" placeholder="Ex. Maman Brigitte"></div>
        <div class="field"><label for="sh-phone">Votre téléphone *</label><input id="sh-phone" name="phone" required maxlength="30" placeholder="6XX XX XX XX" inputmode="tel"></div>
        <div class="field"><label for="sh-city">Ville de livraison *</label><select id="sh-city" name="city" required>${cityOptions(S.city)}</select></div>
        <div class="field"><label for="sh-quarter">Quartier</label><input id="sh-quarter" name="quarter" maxlength="120" placeholder="Ex. Bastos, Akwa, Biyem-Assi"></div>
        <div class="field full"><label for="sh-payer">Qui va payer ?</label><input id="sh-payer" name="payerName" maxlength="80" placeholder="Ex. Mon fils Patrick"></div>
        <div class="field full"><label for="sh-msg">Petit message</label><textarea id="sh-msg" name="message" maxlength="600" placeholder="Bonjour mon fils, voici ce qu'il faut pour la maison ce mois-ci."></textarea></div>
        <button class="btn btn-y btn-block btn-lg field full" type="submit">Créer le lien de paiement</button>
      </form>`);
    $('#share-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const f = new FormData(e.target);
      const btn = $('button[type=submit]', e.target);
      btn.disabled = true;
      btn.textContent = 'Création du lien…';
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

  // ================================================================ panier partagé (vue du payeur)
  async function pageShared(codeStr, params) {
    setActive('partage', 'panier');
    app.innerHTML = '<div class="empty"><div class="big">⏳</div><p>Chargement du panier…</p></div>';
    let cart;
    try {
      cart = await api(`/api/shared-carts/${encodeURIComponent(codeStr)}`);
    } catch (err) {
      app.innerHTML = `<div class="empty box"><div class="big">🔗</div><h2>Lien introuvable</h2><p>${esc(err.message)}</p><a class="btn btn-y" href="#/">Retour à l'accueil</a></div>`;
      return;
    }
    const link = `${location.origin}${location.pathname}#/partage/${cart.code}`;
    const isNew = params.get('nouveau') === '1';
    const q = cart.quote;
    const paid = cart.status === 'payee';
    const waText = `Bonjour${cart.requester.payerName ? ' ' + cart.requester.payerName : ''}, j'ai préparé un panier sur Panier du Pays (${money(q.total, 'XAF')}). Tu peux le voir et le payer ici : ${link}`;
    const n = q.items.reduce((s, i) => s + i.qty, 0);
    app.innerHTML = `
      ${isNew ? `<div class="thanks"><h1>✓ Votre panier est prêt</h1>
          <div>Envoyez maintenant ce lien à la personne qui va payer. Code du panier : <b>${cart.code}</b></div>
          <div class="share-link"><code>${esc(link)}</code><button class="btn" id="copy">Copier</button></div>
          <div style="display:flex;gap:10px;flex-wrap:wrap"><a class="btn btn-wa" target="_blank" rel="noopener" href="https://wa.me/?text=${encodeURIComponent(waText)}">Envoyer sur WhatsApp</a></div>
          <div class="small muted">Gardez ce lien : il affichera « Payé » dès que votre proche aura réglé.</div></div>` : ''}
      <div class="cart-wrap">
        <div class="cart-main">
          <h1>${paid ? 'Panier payé ✓' : `Panier préparé par ${esc(cart.requester.name)}`}</h1>
          <div class="small muted" style="margin-bottom:12px">Panier partagé ${cart.code} · créé le ${new Date(cart.createdAt).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })}</div>
          ${cart.message ? `<div class="bubble"><b>${esc(cart.requester.name)} :</b> ${esc(cart.message)}</div>` : ''}
          <div class="info-list" style="margin:14px 0">
            <div><span>📍</span><span><b>Livraison à ${esc(cart.recipient.name)} · ${esc(cart.recipient.phone)}</b>${esc(cart.recipient.city || 'Ville à préciser')}${cart.recipient.quarter ? ', ' + esc(cart.recipient.quarter) : ''}</span></div>
          </div>
          <div class="price-col">Prix</div>
          ${q.items.map((i) => `<div class="cart-line">
              <a href="#/produit/${i.id}" class="cimg" style="${bg(byId(i.id))}">${i.emoji}</a>
              <div><h3>${esc(i.name)}</h3><div class="meta"><span class="ok">En stock</span>${i.option ? `<span><b>${esc(i.optionLabel || 'Option')} :</b> ${esc(i.option)}</span>` : ''}<span>Quantité : ${i.qty}</span></div></div>
              <div class="lp" style="text-align:right">${priceHtml(i.total, { size: 'sm' })}</div></div>`).join('')}
          <div class="subtotal-line">Sous-total (${nArticles(n)}) : <b>${money(q.subtotal)}</b></div>
        </div>
        <div class="side">
          <div class="side-box">
            <div class="sum-row"><span>Articles</span><span>${money(q.subtotal)}</span></div>
            <div class="sum-row"><span>Livraison${q.city ? ` (${esc(q.city)})` : ''}</span><span>${q.delivery === 0 && q.city ? '<span class="free">Gratuite</span>' : money(q.delivery)}</span></div>
            <div class="sum-row"><span>Frais de service</span><span>${money(q.service)}</span></div>
            <div class="sum-row total"><span>Montant total</span><span>${money(q.total)}</span></div>
            ${S.currency !== 'XAF' ? `<div class="sum-row small muted"><span>Soit au Cameroun</span><span>${money(q.total, 'XAF')}</span></div>` : ''}
            ${paid
              ? `<div class="notice green">Ce panier a été payé. Commande <b>${esc(cart.orderId)}</b> : ${esc(cart.order ? cart.order.statusLabel : '')}.</div>
                 <a class="btn btn-y btn-block btn-lg" href="#/commande/${esc(cart.orderId)}">Suivre la livraison</a>`
              : `<button class="btn btn-y btn-block btn-lg" id="pay-shared">Valider et payer ce panier</button>
                 <button class="btn btn-block" id="edit-shared">Modifier avant de payer</button>
                 <p class="legal">Paiement sécurisé par carte, PayPal ou Mobile Money. ${esc(cart.requester.name)} voit le statut « Payé » sur ce lien dès le paiement.</p>`}
          </div>
        </div>
      </div>`;
    if ($('#copy')) {
      $('#copy').addEventListener('click', async () => {
        try { await navigator.clipboard.writeText(link); toast('Lien copié'); } catch { toast('Sélectionnez le lien pour le copier'); }
      });
    }
    if (!paid) {
      $('#pay-shared').addEventListener('click', () => {
        S.checkoutSource = { sharedCode: cart.code, items: cart.items, recipient: cart.recipient, requester: cart.requester };
        location.hash = '#/commande';
      });
      $('#edit-shared').addEventListener('click', () => {
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

  // ================================================================ commande
  function pageCheckout() {
    setActive('', 'panier');
    const src = S.checkoutSource;
    const items = src ? src.items : S.cart;
    if (!items.length) { location.hash = '#/panier'; return; }
    const prefill = src ? { recipient: src.recipient } : load('pdp_prefill', null);
    const r = (prefill && prefill.recipient) || load('pdp_last_recipient', {});
    const payer = load('pdp_payer', {});
    const methods = [
      ['carte', '💳', 'Carte bancaire', 'Visa, Mastercard'],
      ['paypal', '🅿️', 'PayPal', 'Payer avec votre compte PayPal'],
      ['orange_money', '🟠', 'Orange Money', 'Numéro camerounais'],
      ['mtn_momo', '🟡', 'MTN Mobile Money', 'Numéro camerounais'],
      ['virement', '🏦', 'Virement bancaire', 'SEPA ou Interac, préparation à réception'],
    ];
    const n = items.reduce((s, i) => s + i.qty, 0);
    app.innerHTML = `
      <h1 class="page-title">Passer la commande (${nArticles(n)})</h1>
      ${src ? `<div class="notice green" style="margin-top:10px">Vous payez le panier préparé par <b>${esc(src.requester.name)}</b> (code ${esc(src.sharedCode)}).</div>` : ''}
      <form class="co-wrap" id="checkout" novalidate>
        <div>
          <div class="co-step"><span class="n">1</span><div>
            <h2>Adresse de livraison au Cameroun</h2>
            <div class="fields">
              <div class="field"><label for="r_name">Nom complet du bénéficiaire *</label><input id="r_name" name="r_name" required maxlength="80" value="${esc(r.name)}" placeholder="Ex. Mbarga Jeanne"></div>
              <div class="field"><label for="r_phone">Téléphone *</label><input id="r_phone" name="r_phone" required maxlength="30" inputmode="tel" value="${esc(r.phone)}" placeholder="+237 6XX XX XX XX"></div>
              <div class="field"><label for="r_city">Ville *</label><select id="r_city" name="r_city" required>${cityOptions(r.city || S.city)}</select></div>
              <div class="field"><label for="r_quarter">Quartier *</label><input id="r_quarter" name="r_quarter" required maxlength="120" value="${esc(r.quarter)}" placeholder="Ex. Biyem-Assi, Bonamoussadi"></div>
              <div class="field full"><label for="r_address">Indications pour le livreur</label><input id="r_address" name="r_address" maxlength="300" value="${esc(r.address)}" placeholder="Ex. Derrière la pharmacie, portail bleu"></div>
              <div class="field"><label for="r_date">Date de livraison souhaitée</label><input id="r_date" type="date" name="r_date" min="${new Date(Date.now() + 864e5).toISOString().slice(0, 10)}"></div>
            </div>
          </div></div>
          <div class="co-step"><span class="n">2</span><div>
            <h2>Vos coordonnées</h2>
            <div class="fields">
              <div class="field"><label for="p_name">Votre nom *</label><input id="p_name" name="p_name" required maxlength="80" value="${esc(payer.name)}"></div>
              <div class="field"><label for="p_email">E-mail *</label><input id="p_email" type="email" name="p_email" required maxlength="120" value="${esc(payer.email)}" placeholder="Pour le reçu et le suivi"></div>
              <div class="field"><label for="p_phone">Téléphone ou WhatsApp</label><input id="p_phone" name="p_phone" maxlength="30" inputmode="tel" value="${esc(payer.phone)}" placeholder="Pour recevoir la photo de livraison"></div>
              <div class="field"><label for="p_country">Pays de résidence</label><select id="p_country" name="p_country">${['France', 'Belgique', 'Suisse', 'Allemagne', 'Royaume-Uni', 'Canada', 'États-Unis', 'Italie', 'Espagne', 'Cameroun', 'Autre'].map((c) => `<option ${c === payer.country ? 'selected' : ''}>${c}</option>`).join('')}</select></div>
            </div>
          </div></div>
          <div class="co-step"><span class="n">3</span><div>
            <h2>Message cadeau</h2>
            <div class="field"><label for="gift">Quelques mots pour votre proche (gratuit)</label><textarea id="gift" name="gift" maxlength="600" placeholder="Joyeux Noël Maman, je pense fort à vous tous."></textarea></div>
            <label class="check small" style="margin-top:10px"><input type="checkbox" id="anonymous" name="anonymous"> Ne pas afficher les prix au bénéficiaire</label>
          </div></div>
          <div class="co-step"><span class="n">4</span><div>
            <h2>Mode de paiement</h2>
            <div class="pay-list" id="pay-list">
              ${methods.map(([v, ico, label, sub], i) => `<label class="pay-opt ${i === 0 ? 'active' : ''}"><input type="radio" name="pay" value="${v}" ${i === 0 ? 'checked' : ''}><span class="ico">${ico}</span><span><b>${label}</b><small>${sub}</small></span></label>`).join('')}
            </div>
            <div id="pay-extra" style="margin-top:12px"></div>
          </div></div>
          <div class="co-step"><span class="n">5</span><div>
            <h2>Vérifier les articles et la livraison</h2>
            <div class="ok" id="eta-line" style="font-weight:700;margin-bottom:10px"></div>
            <div class="co-items">
              ${items.map((i) => {
                const prod = byId(i.id);
                return prod ? `<div class="co-item"><span class="cimg" style="${bg(prod)}">${prod.emoji}</span><div><b>${esc(prod.name)}</b>${i.option ? `<br><span class="muted">${esc(i.option)}</span>` : ''}<br><span class="muted">Quantité : ${i.qty}</span></div>${priceHtml(unitPrice(prod, i.option) * i.qty, { size: 'sm' })}</div>` : '';
              }).join('')}
            </div>
            <div style="display:flex;gap:14px;align-items:center;flex-wrap:wrap;margin-top:16px;border:1px solid var(--line);border-radius:8px;padding:12px">
              <button class="btn btn-y btn-lg" type="submit" id="pay-btn2">Valider et payer</button>
              <div><div class="deal-txt" style="font-weight:700;font-size:17px" id="total-line2"></div><div class="legal" style="text-align:left">En validant, vous acceptez nos conditions de vente.</div></div>
            </div>
          </div></div>
        </div>
        <aside class="summary">
          <button class="btn btn-y btn-block btn-lg" type="submit" id="pay-btn">Valider et payer</button>
          <p class="legal">En validant, vous acceptez nos conditions de vente. Vos données sont chiffrées.</p>
          <hr style="margin:4px 0">
          <h3>Récapitulatif de commande</h3>
          <div id="sum"></div>
        </aside>
      </form>`;

    const form = $('#checkout');
    const drawSum = () => {
      const t = totalsFor(items, form.r_city.value);
      const cityKnown = !!form.r_city.value;
      $('#sum').innerHTML = `
        <div class="sum-row"><span>Articles :</span><span>${money(t.subtotal)}</span></div>
        <div class="sum-row"><span>Livraison :</span><span>${!cityKnown ? 'selon la ville' : t.delivery === 0 ? '<span class="free">Gratuite</span>' : money(t.delivery)}</span></div>
        <div class="sum-row"><span>Frais de service (${Math.round(S.catalog.serviceFeeRate * 100)} %) :</span><span>${money(t.service)}</span></div>
        <div class="sum-row total"><span>Montant total :</span><span>${money(t.total)}</span></div>
        ${S.currency !== 'XAF' ? `<div class="sum-row small muted"><span>Soit au Cameroun</span><span>${money(t.total, 'XAF')}</span></div>` : ''}
        ${freeShipHtml(t.subtotal)}`;
      $('#total-line2').textContent = `Montant total : ${money(t.total)}`;
      $('#eta-line').textContent = cityKnown ? `Livraison estimée : ${etaDate(cityObj(form.r_city.value).eta)}` : 'Choisissez la ville pour voir la date de livraison';
    };
    const drawPayExtra = () => {
      const m = form.pay.value;
      const box = $('#pay-extra');
      if (m === 'carte') {
        box.innerHTML = `<div class="fields">
          <div class="field full"><label for="cc-num">Numéro de carte</label><input id="cc-num" inputmode="numeric" placeholder="4242 4242 4242 4242" maxlength="19" autocomplete="cc-number"></div>
          <div class="field"><label for="cc-exp">Date d'expiration</label><input id="cc-exp" placeholder="MM/AA" maxlength="5" autocomplete="cc-exp"></div>
          <div class="field"><label for="cc-cvc">Code de sécurité</label><input id="cc-cvc" inputmode="numeric" placeholder="123" maxlength="4" autocomplete="cc-csc"></div>
        </div><p class="notice" style="margin-top:10px">Mode démonstration : aucun débit réel. Branchez Stripe, Flutterwave ou CinetPay pour encaisser (voir README).</p>`;
      } else if (m === 'paypal') {
        box.innerHTML = '<p class="notice">Vous confirmerez le paiement sur PayPal (simulé en mode démonstration).</p>';
      } else if (m === 'orange_money' || m === 'mtn_momo') {
        box.innerHTML = `<div class="field"><label for="mm-num">Numéro ${m === 'mtn_momo' ? 'MTN MoMo' : 'Orange Money'}</label><input id="mm-num" inputmode="tel" placeholder="6XX XX XX XX"></div>
          <p class="notice" style="margin-top:10px">Une demande de confirmation arrivera sur le téléphone (simulée en mode démonstration).</p>`;
      } else {
        box.innerHTML = '<p class="notice">Nous vous envoyons nos coordonnées bancaires par e-mail. La commande est préparée dès réception du virement.</p>';
      }
    };
    $('#pay-list').addEventListener('change', () => {
      $$('.pay-opt').forEach((l) => l.classList.toggle('active', $('input', l).checked));
      drawPayExtra();
    });
    form.r_city.addEventListener('change', drawSum);
    drawSum();
    drawPayExtra();

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const required = ['r_name', 'r_phone', 'r_city', 'r_quarter', 'p_name', 'p_email'];
      const missing = required.find((k) => !form[k].value.trim());
      if (missing) { form[missing].focus(); toast('Complétez les champs marqués d\'une étoile *'); return; }
      if (!form.p_email.checkValidity()) { form.p_email.focus(); toast('Vérifiez votre adresse e-mail'); return; }
      const btns = [$('#pay-btn'), $('#pay-btn2')];
      btns.forEach((b) => { b.disabled = true; b.textContent = 'Paiement en cours…'; });
      const recipient = { name: form.r_name.value, phone: form.r_phone.value, city: form.r_city.value, quarter: form.r_quarter.value, address: form.r_address.value, date: form.r_date.value };
      const payerInfo = { name: form.p_name.value, email: form.p_email.value, phone: form.p_phone.value, country: form.p_country.value };
      try {
        await new Promise((res) => setTimeout(res, 800));
        const order = await api('/api/orders', {
          method: 'POST',
          body: {
            items, recipient, payer: payerInfo, paymentMethod: form.pay.value, giftMessage: form.gift.value,
            anonymous: form.anonymous.checked, currency: S.currency, sharedCode: src ? src.sharedCode : null,
          },
        });
        save('pdp_payer', payerInfo);
        save('pdp_last_recipient', recipient);
        forget('pdp_prefill');
        S.orders.unshift(order.id);
        save('pdp_orders', S.orders.slice(0, 30));
        if (!src) { S.cart = []; persistCart(); }
        S.checkoutSource = null;
        location.hash = `#/commande/${order.id}?merci=1`;
      } catch (err) {
        toast(err.message);
        btns.forEach((b) => { b.disabled = false; b.textContent = 'Valider et payer'; });
      }
    });
  }

  // ================================================================ suivi
  const FLOW = [
    ['payee', 'Paiement confirmé'],
    ['preparation', 'En préparation'],
    ['livraison', 'En cours de livraison'],
    ['livree', 'Livrée'],
  ];
  const PAY_LABEL = { carte: 'Carte bancaire', paypal: 'PayPal', orange_money: 'Orange Money', mtn_momo: 'MTN Mobile Money', virement: 'Virement bancaire' };

  async function pageOrder(id, params) {
    setActive('', 'suivi');
    app.innerHTML = '<div class="empty"><div class="big">⏳</div><p>Chargement de la commande…</p></div>';
    let o;
    try {
      o = await api(`/api/orders/${encodeURIComponent(id)}`);
    } catch (err) {
      app.innerHTML = `<div class="empty box"><div class="big">📦</div><h2>Commande introuvable</h2><p>${esc(err.message)}</p><a class="btn btn-y" href="#/suivi">Réessayer</a></div>`;
      return;
    }
    const thanks = params.get('merci') === '1';
    const idx = FLOW.findIndex(([s]) => s === o.status);
    const eta = etaDate(cityObj(o.recipient.city).eta, new Date(o.createdAt));
    const first = o.recipient.name.split(' ')[0];
    const waMsg = `Bonjour ${first}, je t'ai envoyé un colis avec Panier du Pays. Livraison prévue ${eta} à ${o.recipient.city}. Numéro de suivi : ${o.id}`;
    app.innerHTML = `
      ${thanks ? `<div class="thanks"><h1>✓ Commande passée, merci !</h1>
        <div>Une confirmation va être envoyée à <b>${esc(o.payer.email)}</b>.</div>
        <div><b>Livraison prévue : ${esc(eta)}</b> à ${esc(o.recipient.city)} pour ${esc(o.recipient.name)}.</div>
        <div class="small">Numéro de commande : <span class="order-id">${o.id}</span></div></div>` : `<h1 class="page-title">Commande <span class="order-id">${o.id}</span></h1>`}
      <div class="cart-wrap">
        <div>
          <section class="box">
            <div class="row-head"><h2>${o.status === 'livree' ? 'Livrée' : `Arrivée prévue ${esc(eta)}`}</h2><span class="status-pill ${o.status}">${esc(o.statusLabel)}</span></div>
            ${o.status === 'en_attente' ? '<div class="notice">Nous attendons votre virement. Nos coordonnées bancaires vous ont été envoyées par e-mail.</div>' : ''}
            ${o.status === 'annulee' ? '<div class="notice">Cette commande a été annulée. Contactez le service client pour toute question.</div>' : `
            <div class="track">${FLOW.map(([s, label], i) => {
              const h = o.history.find((x) => x.status === s);
              return `<div class="${i <= idx ? 'done' : ''}"><b>${label}</b>${h ? new Date(h.at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }) : ''}</div>`;
            }).join('')}</div>`}
            <div class="small muted">Le livreur appelle ${esc(first)} avant d'arriver. Une photo de la remise vous est envoyée sur WhatsApp.</div>
          </section>
          <section class="box">
            <h2>Livraison</h2>
            <div class="info-list">
              <div><span>👤</span><span><b>${esc(o.recipient.name)}</b>${esc(o.recipient.phone)}</span></div>
              <div><span>📍</span><span><b>${esc(o.recipient.city)}${o.recipient.quarter ? ', ' + esc(o.recipient.quarter) : ''}</b>${esc(o.recipient.address)}${o.recipient.date ? ` · souhaitée le ${esc(new Date(o.recipient.date).toLocaleDateString('fr-FR'))}` : ''}</span></div>
              ${o.giftMessage ? `<div><span>💌</span><span><b>Message cadeau</b>${esc(o.giftMessage)}</span></div>` : ''}
              ${o.sharedCode ? `<div><span>🤝</span><span><b>Panier partagé</b>Code ${esc(o.sharedCode)}</span></div>` : ''}
            </div>
            <a class="btn btn-wa" style="margin-top:14px" target="_blank" rel="noopener" href="https://wa.me/?text=${encodeURIComponent(waMsg)}">Prévenir ${esc(first)} sur WhatsApp</a>
          </section>
        </div>
        <div class="side">
          <div class="side-box">
            <h3 style="margin:0">Détail de la commande</h3>
            <div class="co-items">${o.items.map((i) => `<div class="co-item"><span class="cimg" style="${bg(byId(i.id))}">${i.emoji}</span><div>${esc(i.name)}${i.option ? `<br><span class="muted">${esc(i.option)}</span>` : ''}<br><span class="muted">Quantité : ${i.qty}</span></div><b>${money(i.total)}</b></div>`).join('')}</div>
            <hr style="margin:0">
            <div class="sum-row"><span>Articles</span><span>${money(o.subtotal)}</span></div>
            <div class="sum-row"><span>Livraison</span><span>${o.delivery === 0 ? '<span class="free">Gratuite</span>' : money(o.delivery)}</span></div>
            <div class="sum-row"><span>Frais de service</span><span>${money(o.service)}</span></div>
            <div class="sum-row total"><span>Total</span><span>${money(o.total)}</span></div>
            <div class="sum-row small muted"><span>Paiement</span><span>${esc(PAY_LABEL[o.paymentMethod] || o.paymentMethod)}</span></div>
            <a class="btn btn-block" href="#/">Continuer mes achats</a>
          </div>
        </div>
      </div>`;
  }

  function pageTrack() {
    setActive('', 'suivi');
    app.innerHTML = `
      <section class="box" style="max-width:720px">
        <h2>Vos commandes</h2>
        <form id="track" style="display:flex;gap:10px;flex-wrap:wrap">
          <div class="field" style="flex:1;min-width:200px"><label for="track-id">Numéro de commande ou code de panier partagé</label><input id="track-id" name="id" placeholder="PDP-XXXXXX ou code à 6 caractères" required></div>
          <button class="btn btn-y" style="align-self:flex-end">Suivre</button>
        </form>
      </section>
      ${S.orders.length ? `<section class="box" style="max-width:720px"><h2>Commandes passées sur cet appareil</h2><div class="info-list">${S.orders.map((id) => `<div><span>📦</span><a class="lnk" href="#/commande/${esc(id)}">${esc(id)}</a></div>`).join('')}</div></section>` : ''}
      ${S.shared.length ? `<section class="box" style="max-width:720px"><h2>Vos paniers partagés</h2><div class="info-list">${S.shared.map((c) => `<div><span>🤝</span><a class="lnk" href="#/partage/${esc(c)}">Panier ${esc(c)}</a></div>`).join('')}</div></section>` : ''}`;
    $('#track').addEventListener('submit', (e) => {
      e.preventDefault();
      const v = e.target.id.value.trim().toUpperCase();
      location.hash = v.startsWith('PDP-') ? `#/commande/${v}` : `#/partage/${v}`;
    });
  }

  // ================================================================ pages d'information
  function pageHow() {
    setActive('', 'home');
    app.innerHTML = `<h1 class="page-title">Comment ça marche</h1>
      <p class="muted">Panier du Pays permet à la diaspora d'acheter au Cameroun pour ses proches, sans transfert d'argent ni intermédiaire.</p>
      <section class="box">${stepsHtml()}</section>
      <section class="box">${trustHtml()}</section>`;
  }
  function pageShareInfo() {
    setActive('partage', 'home');
    app.innerHTML = `<h1 class="page-title">Le panier partagé</h1>
      <p class="muted">Pour la famille au pays qui sait ce dont elle a besoin, et pour vous qui voulez payer en toute confiance.</p>
      <section class="box"><div class="steps">
        <div class="step"><span class="num">1</span><h3>Au Cameroun</h3><p>Votre proche ajoute au panier ce dont il a besoin : vivres, habits, fournitures…</p></div>
        <div class="step"><span class="num">2</span><h3>Il vous envoie le lien</h3><p>Il touche « Faire payer par un proche » et vous envoie le lien par WhatsApp.</p></div>
        <div class="step"><span class="num">3</span><h3>Vous validez</h3><p>Vous voyez chaque article et son prix. Vous pouvez modifier le panier avant de payer.</p></div>
        <div class="step"><span class="num">4</span><h3>Nous livrons</h3><p>L'argent ne circule jamais en liquide : nous achetons et livrons directement.</p></div>
      </div></section>
      <div class="notice green" style="margin-top:16px">Pas de frais de transfert, pas de risque que l'argent soit détourné, et la certitude que la commande arrive à la bonne personne.</div>
      <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:16px"><a class="btn btn-y" href="#/">Composer un panier</a><a class="btn" href="#/suivi">J'ai reçu un code</a></div>`;
  }
  function pageFaq() {
    setActive('faq', 'home');
    const faq = [
      ['Dans quelles villes livrez-vous ?', `Yaoundé et Douala en 24 h, et ${S.catalog.cities.length - 3} autres villes en 48 à 96 h (Bafoussam, Bamenda, Garoua, Maroua, Kribi…). Pour un village, choisissez « Autre ville / village ».`],
      ['Comment savoir que mon proche a bien été livré ?', 'Le livreur prend une photo à la remise du colis. Elle vous est envoyée sur WhatsApp et le suivi passe à « Livrée ».'],
      ['Dans quelle devise suis-je débité ?', 'Les prix sont fixés en FCFA. Vous pouvez les afficher en €, $, CA$, £ ou CHF ; la conversion est indicative et l\'euro est à parité fixe (1 € = 655,957 FCFA).'],
      ['Les produits frais arrivent-ils frais ?', 'Oui : les vivres sont achetés le matin même au marché et livrés dans la journée à Yaoundé et Douala.'],
      ['Puis-je cacher le prix au bénéficiaire ?', 'Oui, cochez « Ne pas afficher les prix au bénéficiaire » au moment de la commande.'],
      ['Que se passe-t-il si le bénéficiaire est injoignable ?', 'Le livreur réessaie le lendemain et nous vous contactons pour convenir d\'une solution, sans frais supplémentaires.'],
    ];
    app.innerHTML = `<section class="box" style="max-width:820px"><h2>Service client · Questions fréquentes</h2>${faq.map(([q, a]) => `<details><summary>${q}</summary><p>${a}</p></details>`).join('')}</section>`;
  }
  function pageNotFound() {
    app.innerHTML = '<div class="empty box"><div class="big">🧭</div><h2>Page introuvable</h2><p>Cette page n\'existe pas ou plus.</p><a class="btn btn-y" href="#/">Retour à l\'accueil</a></div>';
  }

  // ================================================================ administration
  function sess(op, value) {
    try {
      if (op === 'get') return sessionStorage.getItem('pdp_admin');
      if (op === 'set') return sessionStorage.setItem('pdp_admin', value);
      return sessionStorage.removeItem('pdp_admin');
    } catch {
      if (op === 'get') return S.adminKey;
      S.adminKey = op === 'set' ? value : '';
      return null;
    }
  }
  async function pageAdmin() {
    setActive('', '');
    const key = sess('get') || '';
    if (!key) return adminLogin();
    let data;
    try {
      data = await api('/api/admin/orders', { headers: { 'x-admin-key': key } });
    } catch (err) {
      sess('remove');
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
      <div class="row-head"><h2>Commandes</h2><button class="btn" id="logout">Se déconnecter</button></div>
      <div class="table-wrap"><table>
        <thead><tr><th>N°</th><th>Date</th><th>Bénéficiaire</th><th>Articles</th><th>Total</th><th>Payeur</th><th>Statut</th></tr></thead>
        <tbody>${data.orders.map((o) => `<tr>
          <td><a class="lnk" href="#/commande/${o.id}">${o.id}</a>${o.sharedCode ? `<br><small>🤝 ${esc(o.sharedCode)}</small>` : ''}</td>
          <td>${new Date(o.createdAt).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })}</td>
          <td><b>${esc(o.recipient.name)}</b><br>${esc(o.recipient.phone)}<br>${esc(o.recipient.city)}, ${esc(o.recipient.quarter)}<br><small>${esc(o.recipient.address)}</small></td>
          <td>${o.items.map((i) => `${i.qty} × ${esc(i.name)}${i.option ? ` (${esc(i.option)})` : ''}`).join('<br>')}${o.giftMessage ? `<br><small>💌 ${esc(o.giftMessage)}</small>` : ''}</td>
          <td><b>${money(o.total, 'XAF')}</b></td>
          <td>${esc(o.payer.name)}<br><small>${esc(o.payer.email)}<br>${esc(o.payer.country)}</small></td>
          <td><select class="stat-sel" data-status="${o.id}" aria-label="Statut de ${o.id}">${Object.entries(data.statuses).map(([k, v]) => `<option value="${k}" ${k === o.status ? 'selected' : ''}>${v}</option>`).join('')}</select></td>
        </tr>`).join('') || '<tr><td colspan="7" class="muted">Aucune commande pour le moment.</td></tr>'}</tbody>
      </table></div>
      <div class="row-head" style="margin-top:24px"><h2>Paniers partagés</h2></div>
      <div class="table-wrap"><table>
        <thead><tr><th>Code</th><th>Créé par</th><th>Ville</th><th>Articles</th><th>Statut</th></tr></thead>
        <tbody>${data.sharedCarts.map((c) => `<tr><td><a class="lnk" href="#/partage/${c.code}">${c.code}</a></td><td>${esc(c.requester.name)}<br><small>${esc(c.requester.phone)}</small></td><td>${esc(c.recipient.city)}</td><td>${c.items.length}</td><td><span class="status-pill ${c.status}">${c.status === 'payee' ? 'Payé · ' + esc(c.orderId) : 'En attente'}</span></td></tr>`).join('') || '<tr><td colspan="5" class="muted">Aucun panier partagé.</td></tr>'}</tbody>
      </table></div>`;
    $('#logout').addEventListener('click', () => { sess('remove'); pageAdmin(); });
    $$('[data-status]').forEach((sel) => sel.addEventListener('change', async () => {
      try {
        await api(`/api/admin/orders/${sel.dataset.status}`, { method: 'PATCH', headers: { 'x-admin-key': key }, body: { status: sel.value } });
        toast('Statut mis à jour');
      } catch (err) { toast(err.message); }
    }));
    return undefined;
  }
  function adminLogin(error) {
    app.innerHTML = `<section class="box" style="max-width:420px"><h2>Espace administrateur</h2>
      <form id="admin-login">
        <div class="field"><label for="admin-key">Clé d'accès</label><input id="admin-key" type="password" name="key" required></div>
        ${error ? `<p class="notice" style="margin-top:10px">${esc(error)}</p>` : ''}
        <button class="btn btn-y btn-block" style="margin-top:12px">Se connecter</button>
      </form></section>`;
    $('#admin-login').addEventListener('submit', (e) => {
      e.preventDefault();
      sess('set', e.target.key.value);
      pageAdmin();
    });
  }

  // ================================================================ routeur
  function render() {
    clearTimers();
    closeAll();
    const raw = location.hash.replace(/^#/, '') || '/';
    const [pathPart, query = ''] = raw.split('?');
    const params = new URLSearchParams(query);
    const [a, b] = pathPart.split('/').filter(Boolean).map((x) => { try { return decodeURIComponent(x); } catch { return x; } });
    if (!a) pageHome();
    else if (a === 'categorie') pageCategory(b);
    else if (a === 'categories') pageCategories();
    else if (a === 'flash') pageFlash();
    else if (a === 'meilleures-ventes') pageBest();
    else if (a === 'produit') pageProduct(b);
    else if (a === 'recherche') pageSearch(b || '', params);
    else if (a === 'panier') pageCart(params);
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
    if (a !== 'recherche') { $('#search-input').value = ''; $('#search-cat').value = ''; }
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
    if (!S.catalog.cities.find((c) => c.name === S.city)) S.city = S.catalog.cities[0].name;
    setupHeader();
    persistCart();
    render();
  })();
})();
