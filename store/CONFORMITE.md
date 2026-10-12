# Points qu’un réviseur peut relever

Contrôle du manifeste **1.3.5** pour une fiche non répertoriée. Ce fichier ne publie rien.

| Point | État |
|---|---|
| Champ `key` | Absent. Le magasin attribue l’identifiant. Ne pas en ajouter. |
| Icônes 16, 32, 48, 128 | Présentes, PNG carrés, référencées par `icons` et par l’icône du bouton. Le 32 px a été ajouté pour cette préparation; Chrome n’exige que le 128 px pour la fiche, plus 16 et 48 dans le manifeste. |
| Description | 114 caractères, sous la limite de 132. |
| Permissions | Seulement `storage`. Pas de `tabs` déclarée au-delà de ce que le script utilise déjà via l’hôte. Pas d’`<all_urls>`, pas de `*://*/*`, pas de `scripting`. |
| Hôtes | Priorx limité à `https://4502812786.priorx.ca/*`. API limitée à `https://*.execute-api.ca-central-1.amazonaws.com/*`. |
| Code distant | Aucun. Pas de `eval`, pas de `new Function`, pas de script `https` dans le HTML. |
| Navigation privée | `incognito: not_allowed`. |
| Version minimale | Chrome / Edge 109, Manifest V3. |

## Ce qu’un réviseur peut quand même questionner

1. **Le joker API Gateway.** `*.execute-api.ca-central-1.amazonaws.com` est plus large qu’un seul identifiant d’API. Il est limité à API Gateway dans `ca-central-1`, pas à tout Amazon. L’adresse exacte est dans les options ou la stratégie, pour pouvoir la changer sans nouvelle permission. Un réviseur peut demander de la rétrécir à un hôte. Le faire figerait cet hôte dans le zip et forcerait une nouvelle version si l’API déménage. La justification à coller est dans `store/LISTING.fr.md`.
2. **Renseignements de santé.** Les quatre textos parlent d’une ordonnance. Il faut cocher Health information. Voir `store/PRIVACY-TAB.md`.
3. **Contenu de site.** Le script lit le dossier Priorx. Il faut cocher Website content, sinon la fiche contredit le code.
4. **Twilio aux États-Unis.** Ne pas écrire que les textos restent au Canada. L’API est au Canada; l’acheminement ne l’est pas. La politique doit nommer Twilio.
5. **URL de politique absente ou derrière un login.** Refus assuré. Héberger `store/CONFIDENTIALITE.md` avant de soumettre.
6. **Captures avec un vrai dossier.** Refus ou demande de remplacement. Jeu fictif dans `store/SCREENSHOTS.md`.
7. **But trop vague** (« améliore Priorx »). Utiliser l’énoncé à usage unique tel quel.
8. **Commentaires dans le zip.** Trois fichiers embarqués mentionnent la ville de la pharmacie (Beloeil) dans un commentaire. Ce n’est pas un secret et ce n’est pas un motif habituel de refus. Un réviseur qui lit les sources le verra.
9. **Lien non répertorié.** Quiconque a le lien peut installer. Le lien n’est pas une clé. Le garder pour le personnel.
10. **Description Edge trop courte.** Edge exige au moins 250 caractères. Le texte de `store/LISTING.fr.md` est assez long. Ne pas le raccourcir sous cette barre.
11. **Vidéo YouTube et tuile marquee.** Un guide Chrome de 2020 les mentionne. La tuile marquee est décrite comme facultative; la tuile 440×280 est demandée. Fournir la tuile petite. Ne bloquer la soumission sur une vidéo que si le formulaire l’exige.

Le zip produit par `node scripts/package.mjs` ne contient pas les tests, `store/`, ni ce fichier.
