# NotiRx — how to distribute it

Nothing in this repository publishes NotiRx. Uploading to a store, and installing it with an enterprise policy, are steps Josi takes later, from the dashboards and with Familiprix IT.

Today the extension is copied on a USB stick and loaded unpacked in developer mode. That copy does not update itself. A new version means another copy of the folder and a click on Reload. A store listing or an enterprise force-install gives pharmacists one install and then automatic updates.

## En bref

Deux façons de quitter le mode développeur. Rien dans ce dépôt ne publie l’extension.

1. **Chrome Web Store (non répertoriée) ou modules complémentaires Edge.** Josi crée le compte, paie les frais Google une seule fois (5 $ US à l’écran d’inscription; Edge ne demande pas de frais), emballe avec `sh scripts/pack-extension.sh`, puis téléverse le zip elle-même. La fiche reste hors recherche. Les mises à jour arrivent toutes seules. Dans les questions de confidentialité : le numéro de téléphone, le nom de la personne connectée, le type de message et la langue (FR ou EN) partent vers NotiRx. Le prénom et le nom de famille restent sur l’ordinateur. Le prénom n’est plus envoyé.
2. **Installation forcée par l’informatique de Familiprix** (`ExtensionInstallForcelist`), après qu’une fiche existe. La clé API peut être poussée par stratégie (`apiBaseUrl` et `apiKey`, schéma `managed_schema.json`). La saisie manuelle dans Options continue de fonctionner quand aucune stratégie n’est définie.

## This store’s Priorx host

The content script is limited to one host, written in `manifest.json` as `content_scripts.matches` and again in `host_permissions`:

`https://4502812786.priorx.ca/*`

`host_permissions` also includes the API Gateway host the background script calls:

`https://*.execute-api.ca-central-1.amazonaws.com/*`

That Priorx line covers the patient file at `https://4502812786.priorx.ca/4502812786.Web/index.aspx`. The widget still reads the same element ids (`BA01_LastName`, `BA01_FirstName`, `BA01_Info2`, `LoginName1`). The `/4502812786.Web/` folder does not change those ids. Pages on this host without `BA01_LastName` do not show the widget. The API line is not a content-script match. It only lets the service worker reach API Gateway in ca-central-1 without a CORS preflight. A custom API address on another host is not included.

Each store has its own subdomain under `priorx.ca`, and the subdomain is that store’s phone number. Another store needs its own exact host added in both manifest lists, for example `https://<that-store-phone>.priorx.ca/*`, then a new version. Do not replace this with `https://*.priorx.ca/*`.

After a pharmacist installs from the store, they cannot edit `manifest.json`. Adding a store means a new upload.

The privacy-policy link is a second placeholder. It is not a manifest field. Chrome and Edge ask for it in the developer dashboard, and they reject an unknown key in `manifest.json`.

```
PRIVACY_POLICY_URL=https://FILL-IN-PRIVACY-POLICY-URL.example/notirx
```

Host a page at a public `https` address that anyone can open without logging in, then paste that address into the dashboard field. The `.example` address above is only a marker. It must not be submitted.

The page has to match what the extension actually does (`SECURITY.md`). A draft Josi can edit and host:

- NotiRx is used by pharmacy staff inside Priorx. It adds buttons that ask the NotiRx service to text the patient.
- On the patient file it reads the last name and the first name (both shown only on that computer), the phone number, and the signed-in staff name.
- It sends the phone number to the NotiRx service. It does not send the first name or the last name. It sends the staff name when a yes or no consent is saved, and again as the sender when a text is confirmed.
- The text itself is delivered by Twilio. Message content and the phone number are processed by Twilio in the United States.
- The API address and API key are saved in the browser on that computer, or set by the pharmacy’s administrator through enterprise policy. They are not in the extension files.
- The extension does not run in a private browsing window.

Do not write that the extension encrypts data itself, that texts stay in Canada, or that records are deleted on a timer. Those controls are not in this extension.

## Version

The manifest version is **1.3.3**. Chrome and Edge accept only a higher version on each upload: one to four numbers separated by dots, each from 0 to 65535. Bump `version` in `manifest.json`, then pack and upload. The browser installs that upload on its own for anyone who already has the store copy. After an update, press F5 on the Priorx tab.

## Icons

Checked in this package: `icons/icon16.png` is 16×16, `icons/icon48.png` is 48×48, and `icons/icon128.png` is 128×128. All three are square PNGs and are referenced by the manifest. On the store form, upload `icons/icon128.png` as the store icon. Also add one screenshot of the blue Rx tab on a Priorx patient file, at 1280×800 or 640×400. The screenshot must not show a real patient’s name, phone number, or address.

## Zip for the stores

From the extension folder:

```sh
sh scripts/pack-extension.sh
```

The script stops unless `content_scripts.matches` is exactly `https://4502812786.priorx.ca/*` and `host_permissions` is that host plus `https://*.execute-api.ca-central-1.amazonaws.com/*`. It writes `dist/notirx-1.3.3.zip` (the version in the name follows the manifest). The zip is not uploaded anywhere by the script.

The zip must open directly onto `manifest.json`, not onto a folder that contains `manifest.json`. The script does that. If you build the zip by hand on Windows, select these items and compress them so they sit at the top of the zip: `manifest.json`, `background.js`, `priorx-search.js`, `priorx-lock.js`, `priorx-language.js`, `poll-schedule.js`, `content.js`, `api-contract.mjs`, `runtime-config.mjs`, `options.html`, `options.js`, `managed_schema.json`, and the `icons` folder.

Leave out `test.html`, the test files, `.git`, and any `config.js`.

## Option 1 — unlisted Chrome Web Store

Pharmacists open one link, click to install, and later versions arrive automatically. The listing does not appear in store search. Anyone who has the link can still open it, so the link is not a secret.

1. Register a Chrome Web Store developer account if you do not already have one. Google’s registration screen charges a one-time fee of US$5. There is no yearly fee. Edge Add-ons does not charge a registration fee; a Microsoft account is enough. This repository does not register the account or pay the fee. Confirm the amount on the screen before paying.
2. Run `sh scripts/pack-extension.sh`. The zip is limited to this store’s Priorx host.
3. In the [developer dashboard](https://chrome.google.com/webstore/devconsole), create a new item and upload the zip.
4. Set visibility to **Unlisted**.
5. Paste the privacy-policy URL into the dashboard’s privacy-policy field.
6. Use the permission text and the data notes below.
7. Add the 128px icon and a screenshot that does not show a real patient.
8. Submit for review. Review can take several days. Publishing happens only when you press the dashboard controls, not from this pull request.
9. After approval, copy the install link and the extension id (32 letters on the item page, or on `chrome://extensions` with developer mode on).

Text for the permission boxes:

- **Single purpose:** Lets pharmacy staff send one of four text messages about the prescription that is open in Priorx, shows patients who replied OUI, and shows the texts already sent for the open file.
- **storage:** Saves the API address and API key typed on the Options page in this browser, or reads those two values when an administrator sets them by policy.
- **Host permission (Priorx):** Runs only on `https://4502812786.priorx.ca`. The widget reads the name, phone, language (FR or EN), and signed-in staff name when those fields are on the page (the patient file under `/4502812786.Web/`). Another store is a different subdomain and is not included.
- **Host permission (API):** Calls the NotiRx API on `https://*.execute-api.ca-central-1.amazonaws.com`. That is API Gateway in Canada (ca-central-1) only. It does not cover other AWS hosts or a custom API address.

Data to declare in the privacy questions: phone number, staff name when consent is saved and when a text is confirmed, which of the four messages was chosen, and whether the text is French or English (`FR` or `EN` only). The first name and the last name stay on the computer; the first name is no longer uploaded. The Réponses list can still show a name the server already stored. The extension does not collect account passwords or browsing history.

## Option 2 — Edge Add-ons

Same package, separate listing, separate extension id. Use this when the pharmacy computers run Edge.

1. Sign in to Microsoft Partner Center and open Edge Add-ons.
2. Create an extension and upload the same zip.
3. Set the listing so it is hidden from search (the dashboard label is Hidden or unlisted) and share the direct link.
4. Paste the same privacy-policy URL into Partner Center’s privacy-policy field.
5. Submit. This pull request does not submit it.
6. After approval, copy the Edge extension id. It will not match the Chrome id.

## Option 3 — enterprise force-install

Familiprix IT can install NotiRx on managed Chrome or Edge browsers without a click from each pharmacist, and staff cannot turn it off. The extension still has to be published first (unlisted is enough). Branded Chrome and Edge install force-installed extensions from their own stores, not from a folder on a USB stick.

The id below is a placeholder. Replace it with the id from the store after the listing is approved. Chrome and Edge need their own ids.

**Chrome.** Policy name: `ExtensionInstallForcelist`. One entry:

```
EXTENSION_ID_FROM_CHROME_WEB_STORE;https://clients2.google.com/service/update2/crx
```

**Edge.** Same policy name, under Edge’s policy path. One entry:

```
EXTENSION_ID_FROM_EDGE_ADD_ONS;https://edge.microsoft.com/extensionwebstorebase/v1/crx
```

On Windows those policies are set in Group Policy or in the registry (`Software\Policies\Google\Chrome` for Chrome, `Software\Policies\Microsoft\Edge` for Edge). In the Google Admin console the same choice is force-install, with the Chrome Web Store update URL `https://clients2.google.com/service/update2/crx`.

IT can confirm the result on a pharmacy computer at `chrome://policy` or `edge://policy`.

After the store copy is the one in use, remove the unpacked USB copy on that computer so two NotiRx widgets are not both running.

### Optional: push the API address and key with the same policy

Force-install does not fill in the API address or the API key. Staff can still type them once on the Options page. To skip that, IT sets `apiBaseUrl` and `apiKey` in enterprise policy. The names are declared in `managed_schema.json`. When either one is set by policy, the extension uses the policy and ignores the Options page.

Set both values. If only one is present, NotiRx keeps using the policy and does not fall back to the Options page.

Windows registry, Chrome (Edge uses `Microsoft\Edge` in place of `Google\Chrome`):

`HKLM\Software\Policies\Google\Chrome\3rdparty\extensions\EXTENSION_ID\policy`

String values: `apiBaseUrl` and `apiKey`. Put the real key only in that policy, on the managed computers. Do not commit it.

Google Admin console uses a small JSON file instead, with a `Value` around each setting:

```json
{
  "apiBaseUrl": { "Value": "https://xxxx.execute-api.ca-central-1.amazonaws.com/prod" },
  "apiKey": { "Value": "PASTE_THE_KEY_IN_THE_ADMIN_CONSOLE" }
}
```

Reload policies, then open `chrome://policy` and confirm NotiRx shows both values. The Options page should say the administrator provided them, and it should not show the key.
