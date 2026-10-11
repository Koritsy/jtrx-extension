# Clé API sans la mettre dans le courriel

La clé ne va pas dans git, pas dans le zip, pas dans `manifest.json`, et pas dans un courriel. Deux chemins sont pris en charge. Les deux écrivent les mêmes champs : `apiBaseUrl` et `apiKey` (`managed_schema.json`).

Si la stratégie définit l’un ou l’autre, l’extension utilise seulement la stratégie et ignore la page d’options. Il faut donc toujours fournir les deux valeurs ensemble dans la stratégie. Une seule des deux laisse l’extension en erreur, sans repli sur la saisie locale.

L’identifiant à mettre dans le chemin de registre est l’identifiant **du magasin** (32 caractères), pas celui de la copie chargée en mode développeur. Chrome et Edge ont chacun le leur. Voir plus bas.

## (a) Stratégie — Chrome et Edge sur Windows

Pousser la clé par la stratégie de stockage géré (`chrome.storage.managed`). Ce n’est pas un modèle ADMX prêt à cocher : les champs sont libres. Sous Windows, on les écrit dans le registre, en préférence de stratégie de groupe (Group Policy Preferences → Registry), ou avec un fichier `.reg` lancé sur le poste.

Chrome, poste entier :

`HKLM\SOFTWARE\Policies\Google\Chrome\3rdparty\extensions\<ID_CHROME>\policy`

Edge, poste entier :

`HKLM\SOFTWARE\Policies\Microsoft\Edge\3rdparty\extensions\<ID_EDGE>\policy`

Pour un seul utilisateur, le même chemin sous `HKCU\SOFTWARE\Policies\...`. Chrome et Edge 64 bits lisent `SOFTWARE\Policies` sans `Wow6432Node`. Un vieux Chrome 32 bits lirait `HKLM\SOFTWARE\Wow6432Node\Policies\Google\Chrome\...`.

Valeurs `REG_SZ` :

- `apiBaseUrl` — URL `https` du service, sans barre oblique finale
- `apiKey` — la clé, saisie sur le poste seulement

Exemple `.reg` pour Chrome. Remplacer `ID_CHROME`. Ne pas commettre le fichier une fois la vraie clé écrite.

```
Windows Registry Editor Version 5.00

[HKEY_LOCAL_MACHINE\SOFTWARE\Policies\Google\Chrome\3rdparty\extensions\ID_CHROME\policy]
"apiBaseUrl"="https://xxxx.execute-api.ca-central-1.amazonaws.com/prod"
"apiKey"="PASTE_ON_THE_PC_ONLY"
```

Le même fichier pour Edge, avec cette clé :

`[HKEY_LOCAL_MACHINE\SOFTWARE\Policies\Microsoft\Edge\3rdparty\extensions\ID_EDGE\policy]`

Console d’administration Google (navigateur géré), JSON déposé sur l’extension. Le mot `Value` autour de chaque champ est requis par cette console :

```json
{
  "apiBaseUrl": { "Value": "https://xxxx.execute-api.ca-central-1.amazonaws.com/prod" },
  "apiKey": { "Value": "PASTE_IN_THE_ADMIN_CONSOLE_ONLY" }
}
```

Après un `gpupdate` ou un redémarrage du navigateur, vérifier sur le poste : `chrome://policy` ou `edge://policy`. NotiRx doit montrer `apiBaseUrl` et `apiKey`. La page d’options doit dire que l’administrateur a fourni la configuration, et le champ clé doit rester vide.

## (b) Saisie unique dans la page d’options

Déjà en place. Rien à changer dans le code pour ce chemin.

1. Ouvrir la page d’options de NotiRx (carte de l’extension → Détails → Options d’extension).
2. Entrer l’adresse `https` et la clé.
3. Le champ clé est `type="password"` : il est masqué. `autocomplete="off"`.
4. Enregistrer. Les deux valeurs vont dans `chrome.storage.local` sur cet ordinateur.
5. L’extension n’appelle pas `chrome.storage.sync`. La clé ne suit pas le compte Google ou Microsoft vers un autre poste.

Recharger l’onglet Priorx (F5) après l’enregistrement.

Ce chemin convient à un seul poste. Pour plusieurs postes, préférer la stratégie, afin de ne pas redicter la clé devant l’écran.

## Identifiant d’extension : magasin et copie dépaquetée

Sans champ `key` dans le manifeste (et il n’en faut pas pour le magasin), l’identifiant d’une copie « Charger l’extension non empaquetée » est dérivé du chemin du dossier. Il change si le dossier est déplacé.

L’identifiant Chrome Web Store est choisi par Google à la première mise en ligne. L’identifiant Edge est choisi par Microsoft. Les trois sont différents.

Ce que ça change :

- La stratégie `3rdparty\extensions\<id>\policy` et `ExtensionInstallForcelist` doivent utiliser l’identifiant **du magasin de ce navigateur**. Une stratégie écrite avec l’identifiant de la copie USB ne s’applique pas à la copie du magasin.
- Rien dans l’extension n’épingle un identifiant. `chrome.runtime.id` sert seulement à détecter qu’un rechargement a invalidé le script de contenu (il devient vide). Aucun littéral `chrome-extension://` et aucun identifiant de 32 lettres ne sont codés.
- Le service NotiRx autorise l’origine Priorx, pas l’origine de l’extension. Le changement d’identifiant ne devrait donc pas demander de changement CORS. Le confirmer sur le service avant le premier envoi réel : ce dépôt n’envoie pas l’identifiant de l’extension.

## Rotation de la clé

L’extension ne garde qu’une clé à la fois (stratégie, sinon options). Pour tourner la clé sans couper les postes encore sur l’ancienne :

- le service devrait accepter **deux** clés valides pendant le chevauchement (l’ancienne et la nouvelle);
- pousser la nouvelle par la stratégie, ou la saisir dans les options, sur chaque poste;
- retirer l’ancienne seulement quand plus aucun poste ne l’utilise.

Si le service ne compare la clé qu’à une seule valeur, le remplacement est immédiat et les postes pas encore mis à jour échouent. Ce dépôt ne modifie pas le service. Ne jamais commettre la nouvelle clé.
