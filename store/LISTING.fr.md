# Fiche NotiRx — français du Québec

Textes à coller dans le tableau de bord Chrome Web Store et dans l’Espace partenaires (Edge Add-ons). Les deux fiches utilisent le même français. Les libellés anglais entre parenthèses sont ceux des écrans.

Ne pas publier la fiche en mode Public / Discoverable. Chrome : **Unlisted**. Edge : **Hidden**.

## Nom (Extension name)

```
NotiRx — Companion Pharmacie
```

28 caractères. La limite Chrome pour le nom est 45. Le nom doit rester identique à `name` dans `manifest.json`.

## Description courte (≤ 132 caractères)

Chrome affiche la description du manifeste comme résumé. Edge fait la même chose si `description` est présent dans le manifeste. Le texte actuel fait 114 caractères :

```
Envoie un SMS au patient depuis Priorx : commande prête, médicament manquant, nouvelle ordonnance, renouvellement.
```

Ne pas dépasser 132 caractères si ce champ est modifié. Éviter une liste de mots-clés.

## Description détaillée

Chrome : champ « Detailed description ». Edge : champ « Description », minimum 250 caractères, maximum 10 000. Le texte ci-dessous dépasse 250 caractères.

```
NotiRx sert au personnel de la pharmacie, dans le dossier patient déjà ouvert dans Priorx. Ce n'est pas une application pour le public et ce n'est pas un remplacement de Priorx.

L'extension ajoute un onglet bleu Rx sur le dossier. Le personnel peut envoyer un des quatre textos prévus : la commande est prête, un médicament est manquant, une nouvelle ordonnance est reçue, ou des renouvellements sont à faire. Chaque envoi demande une confirmation à l'écran avant de partir. Le patient peut répondre OUI. L'onglet Réponses montre ces réponses. L'onglet Historique montre les textos déjà envoyés pour le dossier qui est ouvert.

Le numéro de téléphone et le choix de consentement sont transmis au service NotiRx de la pharmacie, hébergé au Canada. Le prénom et le nom affichés dans Priorx restent sur l'ordinateur : cette version de l'extension ne les envoie pas. Le nom du membre du personnel qui confirme l'envoi ou qui enregistre le consentement est transmis avec cette action. Le texto lui-même est acheminé par un fournisseur de messagerie.

NotiRx ne vend aucune donnée et ne s'en sert pas pour la publicité. L'extension ne fonctionne pas dans une fenêtre de navigation privée. Elle est offerte au personnel autorisé, à partir du lien qui lui est remis, et elle ne figure pas dans la recherche du magasin.
```

Catégorie suggérée : Productivity / Productivité (outils pour le personnel). Langue de la fiche : français (Canada) si le menu le propose, sinon français.

## Énoncé à usage unique (Single purpose)

Français, à coller dans le champ Single purpose :

```
Permettre au personnel de la pharmacie d'envoyer, depuis le dossier Priorx ouvert, un des quatre textos prévus au patient, de voir qui a répondu OUI, et de consulter les textos déjà envoyés pour ce dossier.
```

Si le champ est en anglais :

```
Lets pharmacy staff, from the open Priorx file, send one of four preset texts to the patient, see who replied YES, and read the texts already sent for that file.
```

Un seul but. Ne pas ajouter de fonction sans rapport (blocage de publicité, capture d’écran, accès à tous les sites).

## Justifications des permissions

### storage

```
Enregistre sur cet ordinateur l'adresse du service NotiRx et la clé API. Deux chemins : une saisie unique dans la page d'options (chrome.storage.local, jamais synchronisée) ou une stratégie d'administrateur (chrome.storage.managed). La clé n'est pas dans les fichiers de l'extension.
```

### Hôte Priorx — `https://4502812786.priorx.ca/*`

```
L'extension ne s'injecte que sur https://4502812786.priorx.ca, le site Priorx de cette pharmacie. Sur le dossier ouvert elle lit le nom (affiché à l'écran seulement), le numéro de téléphone, la langue (FR ou EN) et le nom de la personne connectée. Les autres succursales ont un autre sous-domaine et ne sont pas incluses. Il n'y a pas de joker *.priorx.ca.
```

### Hôte API Gateway — `https://*.execute-api.ca-central-1.amazonaws.com/*`

```
L'extension appelle le service NotiRx sur API Gateway dans la région Canada (ca-central-1) seulement. Cette permission d'hôte permet l'appel depuis le service worker sans blocage du navigateur. Elle ne couvre pas les autres services Amazon ni une autre région. L'adresse exacte est réglée sur l'ordinateur (options ou stratégie), pas codée dans l'extension.
```

Anglais, si les champs de justification sont en anglais :

- **storage:** Saves this pharmacy’s NotiRx API address and API key on this computer only, either typed once on the options page (`chrome.storage.local`, not synced) or pushed by administrator policy (`chrome.storage.managed`). The key is not in the extension files.
- **Priorx host:** Injected only on `https://4502812786.priorx.ca`, this pharmacy’s Priorx site. On the open file it reads the name (shown on this computer only), the phone number, the language (FR or EN), and the signed-in staff name. Other stores are other subdomains and are not included.
- **API host:** Calls the pharmacy’s NotiRx API on API Gateway in Canada (`ca-central-1`) only, so the service worker is not blocked by the browser. It does not cover other AWS services or another region. The exact address is set on the computer, not hard-coded.

## Ce qu’il ne faut pas écrire

- Que les textos restent au Canada. L’API est au Canada; l’acheminement du texto passe par le fournisseur de messagerie aux États-Unis. Le dire dans la politique de confidentialité.
- Que l’extension chiffre elle-même les données, ou qu’elle efface les dossiers après un délai. Ces contrôles ne sont pas dans l’extension.
- Qu’une clé API est incluse dans le zip.
