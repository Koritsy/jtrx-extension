# Captures et tuiles

Toutes les captures utilisent des données fictives. Aucun vrai patient, aucun vrai numéro, aucune vraie adresse.

Jeu de données unique pour toutes les images :

- Nom : Alpha
- Prénom : Anne
- Téléphone affiché : 555-010-0199 (plage fictive 555-0100)
- Personne connectée : DEMO
- Langue : FR
- Aucune rue, aucun code postal

Ne pas photographier un dossier Priorx réel. Si la capture est faite dans Priorx, utiliser un dossier de formation dont les champs ont été remplacés par le jeu ci-dessus, et vérifier le nom, le téléphone et l’adresse avant d’enregistrer.

## Chrome Web Store

| Image | Taille | Obligatoire | Ce qu’elle montre |
|---|---|---|---|
| Icône du magasin | 128×128 PNG | Oui | `icons/icon128.png`, déjà dans le dépôt. |
| Capture 1 | 1280×800 (ou 640×400 si le formulaire l’accepte encore) | Oui, au moins une, maximum 5 | Dossier fictif avec l’onglet bleu Rx fermé sur le bord droit. On voit le nom Anne Alpha et le téléphone 555-010-0199. |
| Capture 2 | même taille | Recommandée | L’onglet Rx ouvert : les quatre boutons (commande prête, médicament manquant, nouvelle ordonnance, renouvellement) et la demande de confirmation avant l’envoi. |
| Capture 3 | même taille | Recommandée | Onglet Réponses : deux lignes fictives, téléphone masqué du genre `***-***-0199`, aucun vrai nom. |
| Capture 4 | même taille | Recommandée | Onglet Historique du dossier Anne Alpha : deux textos fictifs (type et heure), expéditeur DEMO. |
| Capture 5 | même taille | Facultative | Page d’options : adresse d’exemple `https://xxxx.execute-api.ca-central-1.amazonaws.com/prod`, champ clé API masqué (points), jamais une vraie clé. |
| Tuile promo petite | 440×280 PNG ou JPEG | Oui selon le formulaire actuel | Fond bleu, marque Rx, « NotiRx », une ligne « Textos au patient depuis Priorx ». Aucun patient. |
| Tuile marquee | 1400×560 | Facultative | La même marque, plus large. Le document Chrome la décrit comme l’exception optionnelle; la fournir si le formulaire la marque requise. |
| Vidéo YouTube | lien | Souvent absente du formulaire actuel | Un vieux guide Chrome la liste. Si le formulaire l’exige, une vidéo non répertoriée avec le même jeu fictif suffit. Ne pas filmer un vrai dossier. |

Le formulaire Chrome actuel demande des captures en 1280×800. Produire cette taille : Edge l’accepte aussi. 640×400 est l’ancienne taille Chrome; ne l’utiliser que si le formulaire la propose encore.

## Microsoft Edge Add-ons

| Image | Taille | Obligatoire | Ce qu’elle montre |
|---|---|---|---|
| Tuile petite | 440×280 | Demandée pour la fiche | La même tuile que Chrome. |
| Tuile grande | 1400×560 PNG | Facultative | La même marque, plus large. |
| Captures | 1280×800 ou 640×480, maximum 6 | Facultatives, mais à fournir | Les captures 1 à 4 ci-dessus. 1280×800 sert pour les deux magasins. Edge accepte aussi 640×480; Chrome n’utilise pas cette taille. |

Les captures doivent être nettes, non étirées, et montrer la fonction réelle (l’onglet Rx), pas seulement un logo.

## Vérification avant envoi

- Recherche visuelle : aucun numéro qui ne commence pas par 555-010, aucun nom autre qu’Anne Alpha ou DEMO.
- La clé API n’apparaît nulle part, même dans la barre d’adresse.
- Le sous-domaine Priorx peut apparaître : il est déjà dans le manifeste. Ne pas y ajouter un dossier réel.
