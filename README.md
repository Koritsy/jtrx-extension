# NotiRx — extension Priorx

Manifest **1.3.5**. Chrome and Microsoft Edge (Chromium) from version 109. The widget is the blue **Rx** tab on the Priorx patient file.

Load it unpacked to try a build. Publishing and force-install are in `DISTRIBUTION.md`. Nothing in this repository uploads the extension.

## Load unpacked in Microsoft Edge

1. Copy this folder to the pharmacy PC. Do not copy a `config.js`.
2. Open `edge://extensions`.
3. Turn on **Developer mode** (mode développeur).
4. Choose **Load unpacked** (Charger l’extension non empaquetée) and select this folder.
5. Open the Options page if it appears, and save the API address and the API key.
6. Open Priorx (`https://4502812786.priorx.ca`) and press F5. The version on the extension card should read **1.3.5**.

Chrome is the same steps on `chrome://extensions`.

To update an unpacked copy, replace the files, press **Reload** on the NotiRx card, then press F5 on the Priorx tab.

## Load unpacked in Edge (court)

1. `edge://extensions`
2. Mode développeur
3. Charger l’extension non empaquetée — choisir ce dossier
4. F5 sur l’onglet Priorx

## Force-install or an unlisted store

The signed package comes from the store, not from a key in this repository. `sh scripts/pack-extension.sh` writes `dist/notirx-<version>.zip`. Upload that zip yourself.

- **Chrome Web Store**, visibility **Unlisted**. Force-install with `ExtensionInstallForcelist`:
  `EXTENSION_ID;https://clients2.google.com/service/update2/crx`
- **Edge Add-ons**, listing hidden from search. The Edge extension id is different. Force-install with the same policy name under Edge:
  `EXTENSION_ID;https://edge.microsoft.com/extensionwebstorebase/v1/crx`

Windows policy path: `Software\Policies\Google\Chrome` or `Software\Policies\Microsoft\Edge`. Confirm on `chrome://policy` or `edge://policy`.

The API address and API key can be pushed with the same policy (`apiBaseUrl`, `apiKey` in `managed_schema.json`). Details, the registry path, and the privacy text are in `DISTRIBUTION.md`.

## What still needs a manual pass on Edge

This repository’s tests run in Node. They do not launch Edge. On a pharmacy PC, confirm:

- The extension loads from `edge://extensions` and the service worker stays running.
- Opening a patient file shows the name, then the consent state for that phone, including a slow PC where the phone appears after the name.
- An English file marked `(AN)` sends language `EN`.
- A bad number, a paused service, and a timeout show the French sentences, not `API POST /notify → 502`.
- Managed policy (`edge://policy`) supplies `apiBaseUrl` and `apiKey` when IT sets them.
