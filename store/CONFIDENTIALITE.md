# Politique de confidentialité — NotiRx

Dernière mise à jour : 11 octobre 2026.

Brouillon à héberger sur une page `https` publique, sans mot de passe. Adresse proposée, une fois la page en ligne :

`https://www.automationjt.com/notirx/confidentialite`

Confirmer le domaine réel du site de JT Automatisation avant de coller l’adresse dans Chrome Web Store et dans l’Espace partenaires Edge. Une URL de politique est obligatoire pour les deux magasins. Ne pas soumettre cette page tant que les champs entre crochets ne sont pas remplis.

Cette page décrit l’extension NotiRx pour le personnel d’une pharmacie qui travaille dans Priorx. Elle ne décrit pas le site Priorx lui-même.

## Qui offre NotiRx

JT Automatisation fournit l’extension au personnel de la pharmacie qui l’installe.

Responsable des renseignements personnels (à compléter avant la mise en ligne) :

- Nom : [nom de la personne responsable]
- Courriel : [courriel]
- Adresse postale : [adresse]

## À quoi sert NotiRx

NotiRx a un seul but. Depuis le dossier patient déjà ouvert dans Priorx, le personnel peut :

- envoyer un des quatre textos prévus (commande prête, médicament manquant, nouvelle ordonnance, renouvellements);
- voir les patients qui ont répondu OUI;
- voir les textos déjà envoyés pour ce dossier.

Chaque envoi demande une confirmation à l’écran. L’extension ne remplace pas Priorx et ne s’adresse pas au public.

## Quelles données sont traitées

Sur le dossier Priorx ouvert, l’extension lit :

| Donnée | Ce qu’elle en fait |
|---|---|
| Numéro de téléphone du patient | Envoyé au service NotiRx de la pharmacie pour le consentement, l’envoi du texto et l’historique de ce numéro. |
| Consentement (oui ou non) | Envoyé au même service quand le personnel l’enregistre. |
| Prénom et nom du patient | Affichés dans l’extension sur cet ordinateur. Cette version ne les envoie pas au service. |
| Nom déjà conservé par le service | Peut s’afficher dans la liste Réponses si le service le renvoie. L’extension ne le réécrit pas. |
| Nom de la personne connectée dans Priorx | Envoyé comme auteur quand un consentement est enregistré, et comme expéditeur quand un texto est confirmé. |
| Langue du dossier (FR ou EN) | Envoyée avec le texto pour choisir le texte français ou anglais. |
| Type de texto | Un des quatre types prévus. Le nom du médicament n’est pas lu et n’est pas envoyé. |

L’extension ne lit pas le mot de passe Priorx, ne lit pas l’historique de navigation, et ne suit pas les autres sites.

La clé API et l’adresse du service sont des secrets de la pharmacie, pas des renseignements sur le patient. Ils restent sur l’ordinateur (voir plus bas).

## Où vont les données

1. **Service NotiRx de la pharmacie**, au Canada (API dans la région `ca-central-1`). C’est le service de la pharmacie. Il reçoit le numéro de téléphone, le consentement, le type de texto, la langue, et le nom du membre du personnel quand cette action l’exige.
2. **Fournisseur de messagerie (Twilio), aux États-Unis.** C’est lui qui achemine le texto. Il traite le numéro de téléphone et le contenu du message. Les textos ne restent donc pas tous au Canada.
3. **Cet ordinateur.** L’adresse du service et la clé API sont dans le profil du navigateur (`chrome.storage.local`) ou poussées par la stratégie de l’administrateur (`chrome.storage.managed`). Elles ne sont pas synchronisées avec un compte Google ou Microsoft. Les copier avec le dossier de l’extension ne copie pas la clé.

NotiRx ne vend pas ces renseignements. Il ne les utilise pas pour la publicité, pour un profil publicitaire, ni pour évaluer le crédit. Les tiers ci-dessus ne reçoivent que ce qui sert à envoyer le texto demandé et à en garder la trace pour la pharmacie.

## Utilisation limitée (Chrome Web Store)

L’utilisation des renseignements reçus respecte la politique de données utilisateur du Chrome Web Store, y compris les exigences d’utilisation limitée (Limited Use). Les données servent uniquement au but unique décrit ci-dessus.

## Conservation

L’extension ne conserve pas de copie du dossier patient dans ses fichiers. La clé API reste dans le navigateur jusqu’à ce qu’on la remplace ou qu’on supprime l’extension.

La durée de conservation des textos et des consentements sur le service NotiRx n’est pas décidée par l’extension. [Décrire ici la durée retenue par la pharmacie, ou écrire que la pharmacie conserve ces renseignements le temps requis pour le suivi des ordonnances et les obligations professionnelles.]

Ne pas écrire que les dossiers sont effacés automatiquement après un nombre de jours : l’extension ne le fait pas.

## Droits (Québec, Loi 25)

La personne concernée peut demander l’accès à ses renseignements, leur rectification, ou le retrait de son consentement aux textos.

- Répondre ARRÊT au texto retire le consentement d’en recevoir d’autres par ce canal.
- Le personnel peut aussi enregistrer un refus dans NotiRx.
- Pour une demande d’accès ou de rectification : [courriel du responsable] .

La plainte peut aussi être adressée à la Commission d’accès à l’information du Québec.

## Navigation privée

L’extension ne fonctionne pas dans une fenêtre de navigation privée (Incognito).

## Mises à jour de cette page

La date en haut de page change quand le texte change. L’adresse publique collée dans les magasins doit toujours ouvrir cette version.
