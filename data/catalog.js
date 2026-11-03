// Catalogue Panier du Pays — tous les prix sont en francs CFA (XAF).
// Chaque produit peut avoir des "options" (quantité, taille, pointure, couleur...).
// Le prix d'une option remplace le prix de base quand il est défini.

const categories = [
  { slug: 'vivres', name: 'Vivres & Marché', emoji: '🥬', color: '#e8f5e9' },
  { slug: 'paniers', name: 'Paniers tout prêts', emoji: '🧺', color: '#fff3e0' },
  { slug: 'femme', name: 'Mode Femme', emoji: '👗', color: '#fce4ec' },
  { slug: 'homme', name: 'Mode Homme', emoji: '👔', color: '#e3f2fd' },
  { slug: 'enfants', name: 'Enfants & École', emoji: '🎒', color: '#f3e5f5' },
  { slug: 'chaussures', name: 'Chaussures', emoji: '👟', color: '#efebe9' },
  { slug: 'fetes', name: 'Fêtes & Cadeaux', emoji: '🎁', color: '#ffebee' },
  { slug: 'maison', name: 'Maison & Électroménager', emoji: '🏠', color: '#e0f2f1' },
  { slug: 'telephones', name: 'Téléphones & High-tech', emoji: '📱', color: '#e8eaf6' },
  { slug: 'beaute', name: 'Beauté & Santé', emoji: '💄', color: '#fdf2f8' },
];

// p(id, cat, name, price, oldPrice, emoji, extra)
function p(id, cat, name, price, oldPrice, emoji, extra = {}) {
  return {
    id,
    cat,
    name,
    price,
    oldPrice: oldPrice || null,
    emoji,
    rating: extra.rating || 4.6,
    reviews: extra.reviews || 120,
    sold: extra.sold || 300,
    tags: extra.tags || [],
    origin: extra.origin || 'Yaoundé',
    options: extra.options || null,
    optionLabel: extra.optionLabel || null,
    description: extra.description || '',
    contents: extra.contents || null,
  };
}

const QTY_MANIOC = [
  { label: 'Seau (≈ 10 kg)', price: 4500 },
  { label: 'Demi-sac (≈ 25 kg)', price: 10000 },
  { label: 'Sac (≈ 50 kg)', price: 19000 },
];
const TAILLES = ['S', 'M', 'L', 'XL', 'XXL', '3XL'].map((label) => ({ label }));
const POINTURES_F = ['36', '37', '38', '39', '40', '41', '42'].map((label) => ({ label }));
const POINTURES_H = ['39', '40', '41', '42', '43', '44', '45', '46'].map((label) => ({ label }));
const POINTURES_E = ['24', '26', '28', '30', '32', '34', '36'].map((label) => ({ label }));
const AGES = ['3-4 ans', '5-6 ans', '7-8 ans', '9-10 ans', '11-12 ans', '13-14 ans'].map((label) => ({ label }));

const products = [
  // ---------- VIVRES & MARCHÉ ----------
  p('manioc-frais', 'vivres', 'Manioc frais du village', 4500, 5500, '🍠', {
    tags: ['flash', 'best'], sold: 2100, reviews: 812, rating: 4.8, origin: 'Marché Mfoundi, Yaoundé',
    optionLabel: 'Quantité', options: QTY_MANIOC,
    description: 'Tubercules de manioc récoltés la veille, livrés frais. Idéal pour le couscous, le bâton ou le foufou.',
  }),
  p('baton-manioc', 'vivres', 'Bâtons de manioc (paquet de 10)', 2500, 3000, '🌿', {
    tags: ['best'], sold: 1600, reviews: 540, origin: 'Marché Mokolo, Yaoundé',
    optionLabel: 'Quantité', options: [{ label: '10 bâtons', price: 2500 }, { label: '25 bâtons', price: 6000 }, { label: '50 bâtons', price: 11500 }],
    description: 'Bâtons de manioc emballés dans les feuilles, préparés à l\'ancienne.',
  }),
  p('plantain', 'vivres', 'Régime de plantain mûr', 6000, 7500, '🍌', {
    tags: ['flash', 'best'], sold: 3200, reviews: 1204, rating: 4.9, origin: 'Marché Sandaga, Douala',
    optionLabel: 'Taille du régime', options: [{ label: 'Moyen', price: 6000 }, { label: 'Gros', price: 8500 }, { label: '2 gros régimes', price: 16000 }],
    description: 'Plantain bien choisi, mûr ou vert selon votre préférence (à préciser dans le message).',
  }),
  p('macabo', 'vivres', 'Macabo / taro (filet)', 5000, null, '🥔', {
    sold: 640, reviews: 180, origin: 'Marché de Bafoussam',
    optionLabel: 'Quantité', options: [{ label: 'Filet 5 kg', price: 5000 }, { label: 'Filet 10 kg', price: 9500 }],
  }),
  p('riz-25', 'vivres', 'Riz parfumé — sac 25 kg', 17500, 19500, '🍚', {
    tags: ['flash', 'best'], sold: 4100, reviews: 1530, rating: 4.7, origin: 'Entrepôt Douala',
    optionLabel: 'Format', options: [{ label: '5 kg', price: 4000 }, { label: '25 kg', price: 17500 }, { label: '50 kg', price: 33000 }],
    description: 'Riz long grain parfumé, sac scellé. Le cadeau le plus demandé par les familles.',
  }),
  p('huile-rouge', 'vivres', 'Huile de palme rouge artisanale', 3500, 4000, '🫙', {
    sold: 980, reviews: 360, origin: 'Mbanga',
    optionLabel: 'Contenance', options: [{ label: '1,5 L', price: 3500 }, { label: '5 L', price: 10500 }, { label: '20 L (bidon)', price: 38000 }],
  }),
  p('huile-raffinee', 'vivres', 'Huile raffinée — bidon 5 L', 9500, 10500, '🧴', {
    sold: 1500, reviews: 410, origin: 'Entrepôt Douala',
  }),
  p('ndole', 'vivres', 'Ndolè lavé prêt à cuisiner', 2000, null, '🥬', {
    tags: ['new'], sold: 720, reviews: 260, rating: 4.8, origin: 'Marché Mvog-Mbi, Yaoundé',
    optionLabel: 'Quantité', options: [{ label: '1 kg', price: 2000 }, { label: '3 kg', price: 5500 }],
  }),
  p('arachides', 'vivres', 'Arachides décortiquées', 3000, null, '🥜', {
    sold: 870, reviews: 290, origin: 'Garoua',
    optionLabel: 'Quantité', options: [{ label: '2 kg', price: 3000 }, { label: '5 kg', price: 7000 }, { label: '10 kg', price: 13000 }],
  }),
  p('poisson-fume', 'vivres', 'Poisson fumé (bar / maquereau)', 5000, 6000, '🐟', {
    tags: ['flash'], sold: 1100, reviews: 390, origin: 'Kribi',
    optionLabel: 'Quantité', options: [{ label: '1 kg', price: 5000 }, { label: '3 kg', price: 14000 }],
  }),
  p('viande-boeuf', 'vivres', 'Viande de bœuf fraîche', 4800, null, '🥩', {
    sold: 1300, reviews: 420, origin: 'Boucherie Mvog-Ada, Yaoundé',
    optionLabel: 'Quantité', options: [{ label: '1 kg', price: 4800 }, { label: '3 kg', price: 14000 }, { label: '5 kg', price: 23000 }],
    description: 'Livrée le jour même, sous glace.',
  }),
  p('poulet', 'vivres', 'Poulet du pays vivant', 6500, 7000, '🐓', {
    tags: ['best'], sold: 2300, reviews: 760, rating: 4.8, origin: 'Ferme de Mbalmayo',
    optionLabel: 'Nombre', options: [{ label: '1 poulet', price: 6500 }, { label: '3 poulets', price: 18500 }, { label: '5 poulets', price: 30000 }],
  }),
  p('chevre', 'vivres', 'Chèvre / cabri pour la fête', 45000, 50000, '🐐', {
    tags: ['flash'], sold: 210, reviews: 64, origin: 'Marché à bétail de Ngaoundéré',
    optionLabel: 'Taille', options: [{ label: 'Moyenne', price: 45000 }, { label: 'Grosse', price: 65000 }],
  }),
  p('oignons', 'vivres', 'Oignons — filet', 4000, null, '🧅', { sold: 520, origin: 'Maroua',
    optionLabel: 'Quantité', options: [{ label: '5 kg', price: 4000 }, { label: '25 kg', price: 17000 }] }),
  p('sucre', 'vivres', 'Sucre en morceaux (carton)', 12000, 13000, '🍬', { sold: 640, origin: 'Entrepôt Douala' }),
  p('cube-maggi', 'vivres', 'Cubes d\'assaisonnement (boîte de 100)', 2500, null, '🧂', { sold: 1900, reviews: 210 }),

  // ---------- PANIERS TOUT PRÊTS ----------
  p('panier-marche', 'paniers', 'Panier « Marché de la semaine »', 35000, 42000, '🧺', {
    tags: ['flash', 'best'], sold: 1850, reviews: 690, rating: 4.9, origin: 'Préparé à Yaoundé ou Douala',
    contents: ['Régime de plantain', 'Demi-sac de manioc', '3 kg de viande', '2 kg d\'arachides', 'Huile rouge 1,5 L', 'Ndolè 1 kg', 'Tomates, oignons, piment'],
    description: 'Tout le nécessaire pour nourrir une famille pendant une semaine. Livré en une seule fois.',
  }),
  p('panier-noel', 'paniers', 'Panier de Noël & Nouvel An', 75000, 89000, '🎄', {
    tags: ['flash', 'new'], sold: 940, reviews: 312, rating: 4.9,
    contents: ['Poulet du pays ×2', 'Riz parfumé 5 kg', 'Huile 5 L', 'Vin mousseux ×2', 'Jus et sucreries', 'Chocolats', 'Carte de vœux personnalisée'],
    description: 'Le panier pour que la famille fête comme si vous étiez là.',
  }),
  p('panier-rentree', 'paniers', 'Kit Rentrée scolaire complet', 28000, 33000, '📚', {
    tags: ['best'], sold: 1200, reviews: 450, optionLabel: 'Niveau',
    options: [{ label: 'Maternelle', price: 22000 }, { label: 'Primaire', price: 28000 }, { label: 'Secondaire', price: 36000 }],
    contents: ['Cartable', 'Cahiers selon la liste', 'Stylos, crayons, règle', 'Gourde & boîte à goûter', 'Tenue de sport'],
  }),
  p('panier-maman', 'paniers', 'Panier « Bonne fête Maman »', 45000, 52000, '💐', {
    tags: ['new'], sold: 380, reviews: 120,
    contents: ['Pagne de fête 6 yards', 'Bouquet de fleurs', 'Coffret beauté', 'Gâteau 8 parts', 'Carte personnalisée'],
  }),
  p('panier-sante', 'paniers', 'Kit Santé & Hygiène famille', 25000, 29000, '🩺', {
    sold: 290, reviews: 88,
    contents: ['Moustiquaires imprégnées ×2', 'Savons & dentifrice', 'Paracétamol, SRO', 'Thermomètre', 'Gel hydroalcoolique'],
  }),
  p('panier-naissance', 'paniers', 'Panier Naissance / Bébé', 55000, 62000, '👶', {
    sold: 175, reviews: 51, rating: 4.9,
    contents: ['Couches (2 paquets)', 'Lait infantile ×3', 'Layette 0-6 mois', 'Porte-bébé en pagne', 'Kit de toilette bébé'],
  }),

  // ---------- MODE FEMME ----------
  p('kaba-ngondo', 'femme', 'Kaba Ngondo brodé', 18000, 25000, '👘', {
    tags: ['flash', 'best'], sold: 1400, reviews: 520, rating: 4.8, origin: 'Atelier Akwa, Douala',
    optionLabel: 'Taille', options: TAILLES,
    description: 'Le kaba traditionnel sawa, brodé main, coupe ample et confortable.',
  }),
  p('robe-pagne', 'femme', 'Robe longue en pagne wax', 15000, 20000, '👗', {
    tags: ['new', 'best'], sold: 980, reviews: 340, optionLabel: 'Taille', options: TAILLES,
  }),
  p('pagne-6y', 'femme', 'Pagne de fête 6 yards', 12000, 14000, '🧣', {
    tags: ['best'], sold: 2600, reviews: 870, rating: 4.7, origin: 'Marché Central, Yaoundé',
    optionLabel: 'Motif', options: ['Pagne 8 mars', 'Wax hollandais', 'Bazin', 'Pagne du 20 mai'].map((label) => ({ label })),
  }),
  p('ensemble-femme', 'femme', 'Ensemble jupe & haut en pagne', 22000, 27000, '💃', {
    sold: 410, reviews: 130, optionLabel: 'Taille', options: TAILLES,
  }),
  p('sac-main', 'femme', 'Sac à main tressé', 9500, 12000, '👜', { tags: ['flash'], sold: 620, reviews: 190 }),
  p('foulard', 'femme', 'Foulard / attache en wax', 3000, null, '🎀', { sold: 1100, reviews: 280 }),

  // ---------- MODE HOMME ----------
  p('chemise-pagne', 'homme', 'Chemise manches courtes en pagne', 12000, 15000, '👕', {
    tags: ['best'], sold: 1500, reviews: 480, optionLabel: 'Taille', options: TAILLES,
  }),
  p('boubou-homme', 'homme', 'Boubou / gandoura brodé', 25000, 32000, '🥻', {
    tags: ['flash'], sold: 530, reviews: 170, origin: 'Atelier de Garoua', optionLabel: 'Taille', options: TAILLES,
  }),
  p('costume', 'homme', 'Costume 2 pièces sur mesure', 65000, 80000, '🤵', {
    sold: 140, reviews: 45, rating: 4.7, optionLabel: 'Taille', options: TAILLES,
    description: 'Le tailleur appelle le bénéficiaire pour prendre les mesures. Livré en 10 jours.',
  }),
  p('maillot-lions', 'homme', 'Maillot de football vert-rouge-jaune', 10000, 15000, '⚽', {
    tags: ['flash', 'best'], sold: 3100, reviews: 950, rating: 4.6, optionLabel: 'Taille', options: TAILLES,
  }),
  p('polo-homme', 'homme', 'Polo coton premium', 7500, 9000, '👔', { sold: 760, optionLabel: 'Taille', options: TAILLES }),

  // ---------- ENFANTS & ÉCOLE ----------
  p('uniforme', 'enfants', 'Uniforme scolaire (sur mesure)', 8000, null, '🧒', {
    tags: ['best'], sold: 1800, reviews: 600, optionLabel: 'Âge', options: AGES,
    description: 'Préciser le nom de l\'école dans le message : nous respectons les couleurs officielles.',
  }),
  p('cartable', 'enfants', 'Cartable renforcé', 9000, 11000, '🎒', { tags: ['flash'], sold: 1300, reviews: 410 }),
  p('robe-fillette', 'enfants', 'Robe de fête fillette en pagne', 9500, 12000, '👧', {
    tags: ['new'], sold: 520, reviews: 160, optionLabel: 'Âge', options: AGES,
  }),
  p('ensemble-garcon', 'enfants', 'Ensemble garçon chemise + pantalon', 11000, 13500, '👦', {
    sold: 450, optionLabel: 'Âge', options: AGES,
  }),
  p('jouets', 'enfants', 'Coffret de jouets éducatifs', 15000, 18000, '🧸', { sold: 300, reviews: 90 }),

  // ---------- CHAUSSURES ----------
  p('escarpins', 'chaussures', 'Escarpins de fête', 14000, 18000, '👠', {
    tags: ['flash'], sold: 690, reviews: 230, optionLabel: 'Pointure', options: POINTURES_F,
  }),
  p('sandales-femme', 'chaussures', 'Sandales confort femme', 7000, 9000, '👡', {
    tags: ['best'], sold: 1200, reviews: 380, optionLabel: 'Pointure', options: POINTURES_F,
  }),
  p('mocassins', 'chaussures', 'Mocassins cuir homme', 18000, 24000, '👞', {
    tags: ['best'], sold: 870, reviews: 300, rating: 4.7, optionLabel: 'Pointure', options: POINTURES_H,
  }),
  p('baskets', 'chaussures', 'Baskets tendance unisexe', 16000, 22000, '👟', {
    tags: ['flash', 'new'], sold: 1500, reviews: 520, optionLabel: 'Pointure', options: POINTURES_H,
  }),
  p('chaussures-enfant', 'chaussures', 'Chaussures enfant (fête / école)', 8000, 10000, '🥿', {
    sold: 980, reviews: 270, optionLabel: 'Pointure', options: POINTURES_E,
  }),

  // ---------- FÊTES & CADEAUX ----------
  p('gateau', 'fetes', 'Gâteau d\'anniversaire personnalisé', 15000, null, '🎂', {
    tags: ['best'], sold: 1100, reviews: 430, rating: 4.9, origin: 'Pâtisserie Bastos, Yaoundé',
    optionLabel: 'Taille', options: [{ label: '8 parts', price: 15000 }, { label: '15 parts', price: 25000 }, { label: '30 parts', price: 45000 }],
    description: 'Indiquez le prénom et l\'âge dans le message cadeau.',
  }),
  p('bouquet', 'fetes', 'Bouquet de fleurs fraîches', 12000, 15000, '💐', { tags: ['flash'], sold: 760, reviews: 250 }),
  p('champagne', 'fetes', 'Coffret vin mousseux ×2', 18000, 21000, '🍾', { sold: 420, reviews: 110 }),
  p('casiers-boissons', 'fetes', 'Casiers de boissons (bière / jus)', 13500, null, '🍻', {
    tags: ['best'], sold: 1900, reviews: 520,
    optionLabel: 'Quantité', options: [{ label: '1 casier', price: 13500 }, { label: '3 casiers', price: 39000 }, { label: '10 casiers', price: 125000 }],
    description: 'Pour les mariages, deuils, baptêmes et dots. Livraison sur le lieu de l\'événement.',
  }),
  p('carte-cadeau', 'fetes', 'Carte cadeau Panier du Pays', 10000, null, '💳', {
    tags: ['new'], sold: 650,
    optionLabel: 'Montant', options: [{ label: '10 000 FCFA', price: 10000 }, { label: '25 000 FCFA', price: 25000 }, { label: '50 000 FCFA', price: 50000 }, { label: '100 000 FCFA', price: 100000 }],
    description: 'Votre proche choisit lui-même ses articles sur le site.',
  }),

  // ---------- MAISON & ÉLECTROMÉNAGER ----------
  p('bouteille-gaz', 'maison', 'Recharge / bouteille de gaz', 6500, null, '🔥', {
    tags: ['best'], sold: 2800, reviews: 910,
    optionLabel: 'Format', options: [{ label: 'Recharge 12,5 kg', price: 6500 }, { label: 'Bouteille neuve + gaz', price: 25000 }],
  }),
  p('ventilateur', 'maison', 'Ventilateur sur pied', 22000, 28000, '🌀', { tags: ['flash'], sold: 830, reviews: 260 }),
  p('refrigerateur', 'maison', 'Réfrigérateur 2 portes 200 L', 245000, 290000, '🧊', { sold: 120, reviews: 40, rating: 4.5 }),
  p('matelas', 'maison', 'Matelas mousse haute densité', 55000, 70000, '🛏️', {
    sold: 340, reviews: 95, optionLabel: 'Dimensions', options: [{ label: '1 place', price: 45000 }, { label: '2 places', price: 55000 }, { label: '2 places XL', price: 72000 }],
  }),
  p('marmites', 'maison', 'Lot de marmites en aluminium', 18000, 22000, '🍲', { tags: ['best'], sold: 690, reviews: 210 }),
  p('panneau-solaire', 'maison', 'Kit solaire + lampes', 85000, 99000, '☀️', { tags: ['new'], sold: 150, reviews: 42 }),

  // ---------- TÉLÉPHONES & HIGH-TECH ----------
  p('smartphone', 'telephones', 'Smartphone Android 128 Go', 85000, 105000, '📱', { tags: ['flash', 'best'], sold: 960, reviews: 380, rating: 4.5 }),
  p('telephone-simple', 'telephones', 'Téléphone simple double SIM', 12000, 15000, '☎️', { sold: 1100, reviews: 300 }),
  p('television', 'telephones', 'Téléviseur LED 43"', 165000, 195000, '📺', { sold: 210, reviews: 70 }),
  p('powerbank', 'telephones', 'Batterie externe 20 000 mAh', 12000, 16000, '🔋', { tags: ['flash'], sold: 1400, reviews: 420 }),
  p('forfait', 'telephones', 'Recharge crédit & forfait internet', 5000, null, '📶', {
    sold: 3500, reviews: 640,
    optionLabel: 'Montant', options: [{ label: '5 000 FCFA', price: 5000 }, { label: '10 000 FCFA', price: 10000 }, { label: '25 000 FCFA', price: 25000 }],
    description: 'Crédit envoyé directement sur le numéro du bénéficiaire.',
  }),

  // ---------- BEAUTÉ & SANTÉ ----------
  p('meches', 'beaute', 'Mèches & tresses (paquets)', 6000, 7500, '💇🏾‍♀️', { tags: ['best'], sold: 1700, reviews: 560 }),
  p('coiffure', 'beaute', 'Séance de coiffure à domicile', 10000, null, '✂️', { tags: ['new'], sold: 420, reviews: 150 }),
  p('beurre-karite', 'beaute', 'Beurre de karité pur', 3500, null, '🧴', { sold: 900, reviews: 260, origin: 'Ngaoundéré' }),
  p('coffret-beaute', 'beaute', 'Coffret beauté & parfum', 20000, 26000, '💄', { tags: ['flash'], sold: 380, reviews: 120 }),
  p('moustiquaire', 'beaute', 'Moustiquaire imprégnée', 4500, null, '🦟', { sold: 1300, reviews: 330 }),
];

// Livraison au Cameroun : frais en FCFA, délai affiché et nombre de jours estimé (eta).
const cities = [
  { name: 'Yaoundé', fee: 1500, days: '24 h', eta: 1 },
  { name: 'Douala', fee: 1500, days: '24 h', eta: 1 },
  { name: 'Bafoussam', fee: 2500, days: '48 h', eta: 2 },
  { name: 'Dschang', fee: 2500, days: '48 h', eta: 2 },
  { name: 'Buea', fee: 2500, days: '48 h', eta: 2 },
  { name: 'Limbé', fee: 2500, days: '48 h', eta: 2 },
  { name: 'Kribi', fee: 3000, days: '48 h', eta: 2 },
  { name: 'Ebolowa', fee: 3000, days: '48 h', eta: 2 },
  { name: 'Bamenda', fee: 3000, days: '48–72 h', eta: 3 },
  { name: 'Kumba', fee: 3000, days: '48–72 h', eta: 3 },
  { name: 'Bertoua', fee: 3500, days: '72 h', eta: 3 },
  { name: 'Ngaoundéré', fee: 4000, days: '72 h', eta: 3 },
  { name: 'Garoua', fee: 4000, days: '72 h', eta: 3 },
  { name: 'Maroua', fee: 4500, days: '72–96 h', eta: 4 },
  { name: 'Autre ville / village', fee: 6000, days: '3–5 jours', eta: 5 },
];

// Taux indicatifs : 1 unité de devise = X FCFA (l'euro est à parité fixe).
const currencies = {
  XAF: { symbol: 'FCFA', rate: 1, decimals: 0 },
  EUR: { symbol: '€', rate: 655.957, decimals: 2 },
  USD: { symbol: '$', rate: 600, decimals: 2 },
  CAD: { symbol: 'CA$', rate: 440, decimals: 2 },
  GBP: { symbol: '£', rate: 780, decimals: 2 },
  CHF: { symbol: 'CHF', rate: 690, decimals: 2 },
};

const SERVICE_FEE_RATE = 0.03; // 3 % de frais de service
const FREE_DELIVERY_FROM = 50000; // livraison offerte dès 50 000 FCFA

module.exports = { categories, products, cities, currencies, SERVICE_FEE_RATE, FREE_DELIVERY_FROM };
