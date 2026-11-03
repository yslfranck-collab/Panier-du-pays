# Panier du Pays 🧺🇨🇲

Boutique en ligne qui permet à la **diaspora** (France, Belgique, Canada, USA…) d'acheter **au Cameroun** pour ses proches : vivres du marché (manioc, plantain, riz, viande…), vêtements en pagne, chaussures de fête, cadeaux, électroménager, paniers tout prêts. L'interface reprend les codes d'une grande boutique de mode en ligne : barre promo, catégories, ventes flash avec compte à rebours, grille de produits, fiches avec options, favoris et barre d'onglets sur mobile.

## La fonction clé : le panier partagé 🤝

1. Au Cameroun, un proche compose son panier sur le site.
2. Il touche **« Faire payer par un proche »** : un lien unique est créé (ex. `/#/partage/KDTYM2`).
3. Il l'envoie par WhatsApp ou par SMS à la personne qui paie à l'étranger.
4. Cette personne voit les articles, le message et l'adresse. Elle peut **valider et payer**, ou **modifier** le panier avant.
5. Le proche voit le statut « Payé » sur le même lien, et la commande est livrée.

## Fonctionnalités

- Plus de 60 articles dans 10 catégories, avec des options (quantité en kg ou en sacs, tailles, pointures, montants).
- Prix fixés en FCFA et affichés au choix en € / $ / CA$ / £ / CHF (l'euro est à parité fixe).
- Recherche (sans tenir compte des accents), filtres (promos, nouveautés, top ventes, moins de 10 000 FCFA) et tris.
- Livraison dans 15 villes, avec des frais et des délais propres à chacune. Livraison offerte dès 50 000 FCFA.
- Commande avec bénéficiaire, payeur, message cadeau, option « masquer le prix » et choix du moyen de paiement (carte, PayPal, Orange Money, MTN MoMo, virement).
- Suivi de commande avec une frise d'étapes et un bouton « Prévenir sur WhatsApp ».
- Espace administrateur (`/#/admin`) : liste des commandes et des paniers partagés, changement de statut (en préparation, en livraison, livrée…).
- Les prix sont **toujours recalculés côté serveur** à partir du catalogue.

## Lancer le site

```bash
node server.js        # aucune dépendance à installer (Node 18 ou plus)
# puis ouvrir http://localhost:3000
```

Variables d'environnement : `PORT` (3000 par défaut), `ADMIN_KEY` (clé de l'espace admin, `admin-panier` par défaut : **à changer en production**), `DB_FILE` (fichier de données, `data/db.json` par défaut).

## Structure

```
server.js          serveur HTTP et API (catalogue, devis, paniers partagés, commandes, admin)
data/catalog.js    produits, catégories, villes, devises, frais
public/            site (index.html, styles.css, app.js)
```

## Avant la mise en production

- **Paiement** : il est **simulé** pour l'instant, aucun argent n'est encaissé. Il faut brancher un prestataire. Pour le Cameroun, CinetPay, Flutterwave ou NotchPay acceptent à la fois les cartes, Orange Money et MTN MoMo. Stripe ou PayPal conviennent pour les cartes de la diaspora. La commande ne doit passer à « payée » qu'après la confirmation (webhook) du prestataire.
- **Photos** : les produits sont illustrés par des emojis. Remplacez-les par de vraies photos.
- **Données** : elles sont stockées dans un fichier JSON. Passez à une vraie base (PostgreSQL, SQLite…) quand le volume augmente.
- **Notifications** : prévoir l'envoi d'un e-mail ou d'un message WhatsApp (API WhatsApp Business) à chaque changement de statut.

## Version de démonstration (sans serveur)

`node scripts/build-demo.js` génère `demo/index.html` : tout le site dans un seul fichier, avec le catalogue intégré et l'API simulée dans le navigateur (`demo/api-mock.js`). C'est pratique pour montrer le site. Mais les commandes et les paniers partagés restent dans le navigateur de chaque visiteur : pour que le lien d'un panier partagé fonctionne entre deux personnes, il faut le vrai serveur.
