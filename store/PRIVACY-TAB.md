# Onglet Confidentialité — Chrome Web Store

Réponses à coller dans l’onglet Privacy practices. Elles doivent dire la même chose que `store/CONFIDENTIALITE.md`. Une contradiction entre les deux est un motif de refus.

Edge a une page Privacy séparée (usage unique, justifications, code distant, données, URL de politique). Reprendre les mêmes réponses. Les textes d’usage unique et de permissions sont dans `store/LISTING.fr.md`.

## URL de la politique (obligatoire)

Coller l’adresse `https` publique une fois la page en ligne. Adresse proposée :

`https://www.automationjt.com/notirx/confidentialite`

Ouvrir l’adresse dans une fenêtre privée, sans compte, avant de soumettre. Si la page demande un mot de passe, le magasin la refuse.

## Cases « données collectées »

Cocher seulement ce qui suit.

| Case du tableau de bord (anglais) | Cocher | Réponse |
|---|---|---|
| Personally identifiable information | Oui | Numéro de téléphone du patient. Prénom et nom lus sur le dossier et affichés sur l’ordinateur (cette version ne les envoie pas). Nom du membre du personnel envoyé avec le consentement et avec l’envoi. |
| Health information | Oui | Le type de texto concerne une ordonnance (prête, médicament manquant, nouvelle ordonnance, renouvellement). Le nom du médicament n’est pas collecté. Mieux vaut déclarer le renseignement de santé que de le taire : un oubli ici mène souvent à un refus. |
| Financial and payment information | Non | Aucun paiement. |
| Authentication information | Non | Pas de mot de passe, pas de témoin de connexion. |
| Personal communications | Oui | Le texto est une communication au patient. Le contenu vient du type choisi; le fournisseur de messagerie l’achemine. |
| Location | Non | Pas de géolocalisation. |
| Web history | Non | Pas d’historique de navigation. |
| User activity | Non | Pas de suivi des clics en dehors du dossier Priorx ouvert. |
| Website content | Oui | Le script lit des champs du dossier Priorx (nom, téléphone, langue, personne connectée). Il ne lit pas les autres sites. |

## Certification d’utilisation limitée

Cocher les trois énoncés du genre :

- je ne vends pas ni ne transfère les données à des tiers, en dehors des cas permis;
- je n’utilise pas les données pour un but autre que le but unique de l’extension;
- je n’utilise pas les données pour le crédit ou le prêt.

Le service NotiRx de la pharmacie (Canada, `ca-central-1`) et Twilio (États-Unis, acheminement du texto) sont des fournisseurs du but unique. Ils ne sont pas de la publicité ni de la revente. Il faut les nommer dans la politique. Ne pas cocher une case qui dirait « aucune donnée ne quitte l’appareil » : ce serait faux.

Ne pas cocher « vendu » ni « utilisé pour des annonces ».

## Code distant (Edge, et la revue Chrome)

Réponse : **non**. Manifest V3, scripts embarqués dans le zip, aucun `eval`, aucun script téléchargé.

## Phrase à garder alignée

Le numéro de téléphone, le consentement et le nom du membre du personnel partent vers le service de la pharmacie au Canada. Le prénom et le nom du patient sont traités à l’écran et ne sont pas envoyés par cette version. Le texto est ensuite acheminé aux États-Unis par Twilio. Rien n’est vendu. Rien ne sert à la publicité.
