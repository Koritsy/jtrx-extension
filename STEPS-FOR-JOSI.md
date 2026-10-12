# Étapes que Josi fait elle-même

Ce dépôt ne crée pas de compte, ne paie pas, ne téléverse pas et ne publie pas. L’ordre ci-dessous est celui à suivre. Les textes à coller sont dans `store/`.

## 1. Publier la politique de confidentialité

Les deux magasins exigent une URL `https` publique avant la soumission.

1. Reprendre `store/CONFIDENTIALITE.md`.
2. Remplir le nom, le courriel et l’adresse du responsable, et la durée de conservation retenue par la pharmacie.
3. Héberger la page sur le site de JT Automatisation, par exemple `https://www.automationjt.com/notirx/confidentialite`. Confirmer le domaine réel du site.
4. Ouvrir cette adresse dans une fenêtre privée, sans compte. Elle doit s’afficher sans mot de passe.

## 2. Compte développeur Chrome Web Store

1. Utiliser un compte Google que la pharmacie pourra garder (récupération et accès). Perdre ce compte empêche les mises à jour.
2. Activer la validation en deux étapes. Chrome l’exige avant toute publication ou mise à jour.
3. Ouvrir le [tableau de bord développeur](https://chrome.google.com/webstore/devconsole).
4. Payer les frais d’inscription. L’écran demande **5 $ US, une seule fois**. Il n’y a pas de frais annuel. Vérifier le montant sur l’écran avant de payer. Ce dépôt ne paie pas.
5. Terminer la vérification du courriel et, si Google la demande, la vérification d’identité. Un nouveau compte peut rester bloqué tant que cette étape n’est pas finie.

## 3. Compte Edge Add-ons

Peut avancer en parallèle, après l’étape 1.

1. Ouvrir l’Espace partenaires Microsoft (Partner Center) avec un compte Microsoft.
2. Entrer dans Edge Add-ons. L’inscription est **gratuite**.
3. Terminer la vérification d’identité (personne ou entreprise). Elle peut prendre quelques jours avant le premier envoi.

## 4. Construire le zip

Sur une machine où Node.js 18 ou plus récent est installé (le même que pour les tests) :

```sh
sh scripts/pack-extension.sh
```

Équivalents : `node scripts/package.mjs`, ou sous Windows `powershell -File scripts/package.ps1`.

Le fichier est `dist/notirx-1.3.6.zip` (le numéro suit `manifest.json`). Ne pas le commettre. Il s’ouvre directement sur `manifest.json`, pas sur un dossier parent. Il ne contient pas les tests, `store/`, ni `.git`.

La version **1.3.5** pouvait être le premier envoi : aucune fiche n’avait encore été publiée. La version courante est **1.3.6**. Chaque envoi suivant devra avoir un numéro plus élevé.

## 5. Chrome — fiche non répertoriée

1. Dans le tableau de bord, créer un élément et téléverser le zip.
2. Langue : français. Coller le nom, la description courte et la description détaillée de `store/LISTING.fr.md`.
3. Icône 128 px : `icons/icon128.png`. Captures et tuile 440×280 : `store/SCREENSHOTS.md`. Données fictives seulement.
4. Onglet Privacy : `store/PRIVACY-TAB.md`, avec l’URL de l’étape 1.
5. Usage unique et justifications de permissions : `store/LISTING.fr.md`.
6. Onglet Distribution : visibilité **Unlisted** (non répertoriée). Pas Public. Pas Private, sauf pour un essai limité à des comptes test.
7. Soumettre pour revue. Le dépôt ne soumet pas.

Délai habituel : de un à quelques jours. Un nouveau compte, ou une extension qui déclare des renseignements de santé, peut prendre plus longtemps, parfois une à deux semaines. Google peut poser une question; y répondre dans le tableau de bord.

## 6. Edge — fiche masquée

1. Créer une extension et téléverser **le même zip**.
2. Coller les mêmes textes. La description Edge doit faire au moins 250 caractères; celle de `store/LISTING.fr.md` convient.
3. Même URL de politique, mêmes justifications, code distant : non.
4. Visibilité : **Hidden** (le libellé n’est pas « Unlisted »). La fiche sort de la recherche. Seul le lien direct permet l’installation.
5. Tuile 440×280 et captures 1280×800, comme pour Chrome.
6. Soumettre. La certification prend souvent jusqu’à sept jours ouvrables.

## 7. Installer sur le poste de la pharmacie

Après l’approbation du navigateur réellement utilisé sur ce poste :

1. Copier le lien non répertorié (Chrome) ou le lien Hidden (Edge). Les deux identifiants d’extension sont différents. Les noter : 32 caractères chacun, sur la fiche ou sur `chrome://extensions` / `edge://extensions`.
2. Sur le poste, ouvrir ce lien **dans le même navigateur** et installer.
3. Retirer la copie dépaquetée : page des extensions, supprimer la carte NotiRx qui indique le mode développeur. Sans ça, deux onglets Rx peuvent s’injecter.
4. Désactiver le mode développeur si plus rien d’autre n’en a besoin.
5. Clé API, une seule des deux voies de `store/API-KEY-SETUP.md` :
   - l’informatique pousse `apiBaseUrl` et `apiKey` par stratégie, avec l’identifiant **du magasin** de ce navigateur;
   - ou une saisie unique dans la page d’options (champ masqué, `chrome.storage.local`, pas synchronisé).
6. F5 sur l’onglet Priorx. L’onglet bleu Rx apparaît sur un dossier. Un seul widget.

La stratégie et l’installation forcée (`ExtensionInstallForcelist`) utilisent l’identifiant du magasin, pas celui de l’ancienne copie USB. Le détail est dans `store/API-KEY-SETUP.md` et `DISTRIBUTION.md`.

## 8. Mises à jour automatiques

1. Monter `version` dans `manifest.json` (un à quatre nombres, chacun de 0 à 65535, strictement plus grand que la version déjà au magasin).
2. Reconstruire le zip. Le téléverser sur **la même** fiche. Ne pas créer une deuxième extension.
3. Soumettre. Chrome et Edge installent la mise à jour tout seuls sur les postes qui ont la copie du magasin.
4. Après l’arrivée de la mise à jour, F5 sur l’onglet Priorx. L’ancien script de contenu reste sinon dans la page.

La copie USB ne se met pas à jour toute seule. Une fois la copie du magasin en place, ne plus la réinstaller en mode développeur.

## 9. Le dépôt peut devenir privé après la publication

Oui. Chrome et Edge hébergent le zip. Ils ne lisent pas ce dépôt GitHub pour construire ni pour mettre à jour. Rendre `Koritsy/jtrx-extension` privé n’enlève pas la fiche et n’arrête pas les mises à jour.

Ce qui pointait vers le dépôt public :

- l’adresse GitHub elle-même, les clones, les fourches et les copies déjà téléchargées;
- les caches des moteurs de recherche et les anciennes pages de demande de fusion;
- les sessions d’agent qui ont déjà lu le dépôt;
- le nom du service jumeau cité dans `SECURITY.md` (`Koritsy/jtrx-backend`), sans URL dans le manifeste.

Aucun champ du manifeste (page d’accueil, URL de mise à jour) ne pointe vers GitHub. Passer le dépôt en privé ne retire pas l’historique déjà copié ailleurs. Ne pas réécrire l’historique pour ça.

La clé API ne doit jamais être commise. Pour la tourner sans couper les postes, le service devrait accepter deux clés en même temps (`store/API-KEY-SETUP.md`). Ce dépôt ne modifie pas le service.
