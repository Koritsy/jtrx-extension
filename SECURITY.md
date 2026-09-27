# NotiRx extension — security notes

NotiRx is a Chrome and Edge extension for pharmacy staff working in the Priorx web application. It adds four SMS buttons (order ready, medication on order, new prescription received, renewals due), a Réponses list of patients who replied OUI, and an Historique list of texts for the patient file that is open. The extension asks the NotiRx backend (`Koritsy/jtrx-backend`) to send the texts. Twilio is reached only by that backend.

This note covers the extension. It is the description to give a security reviewer.

## Permissions

The manifest asks for:

| Permission | Why it is there |
|---|---|
| `storage` | The API address and the API key are typed on the extension’s Options page and saved in this browser profile (`chrome.storage.local`). If an administrator has set those two values by enterprise policy, the extension reads them from `chrome.storage.managed` instead. |
| One host permission | `https://4502812786.priorx.ca/*` — this pharmacy’s Priorx site, HTTPS only. |
| The same pattern as a content script | That is what draws the widget. |

`storage` is required for the Options page. `alarms` was declared before and never used; it is removed.

The host pattern is written twice in `manifest.json` (`host_permissions` and `content_scripts.matches`) because Chrome keeps those as two fields. Both are `https://4502812786.priorx.ca/*`. There is no `*.priorx.ca` wildcard. Each store has its own subdomain (the store phone number). Another store needs its own exact `https://<phone>.priorx.ca/*` line added in both places, then a new version of the extension.

The patient file for this store is `https://4502812786.priorx.ca/4502812786.Web/index.aspx`. The content script matches the whole host, then looks for element ids on that page. Those ids are not tied to the `/4502812786.Web/` folder. On any other page of this host that does not contain `BA01_LastName`, the script returns without drawing the widget.

The extension does not request a host permission for the API. Calls to the API are normal HTTPS requests from the background script. That works while the API answers browser calls (today, cross-origin access is open). If that is tightened later, allow the extension’s origin, or add that exact API host under `host_permissions`.

## What the extension reads on the page

The script is injected only on `https://4502812786.priorx.ca`, including pages under `/4502812786.Web/`. It draws the widget only when the patient file is on screen (the page contains `BA01_LastName`).

| On the page | Used for |
|---|---|
| `BA01_LastName` | Shown in the widget on this computer. Stays on this computer. |
| `BA01_FirstName` | Shown in the widget. Sent to the backend only after a staff member confirms an SMS, because the text includes the first name. |
| `BA01_Info2` | The phone is the part before ` - `, digits only. A street address after ` - ` is left on the page. |
| `LoginName1` | The signed-in staff name. Sent as `recorded_by` when staff save a yes or no consent, and as `sent_by` when they confirm an SMS (omitted when the field is empty). |

The widget is drawn in a closed shadow root. Its buttons are separate from Priorx’s page.

If Priorx is locked, or no staff member is signed in, the widget is removed from the screen. It does not send a text, change consent, or show Réponses, Historique, names, or phone numbers. It comes back when `LoginName1` is visible again and the lock screen is gone. The check runs when the page changes and again immediately before every send. If the check cannot tell that someone is signed in, the send is blocked. The lock screen’s exact id is not in this repository; the guesses live in `PRIORX_LOCK_SELECTORS` in `priorx-lock.js`. The widget also closes itself after a period with no activity on the page (10 minutes unless Options sets another value from 1 to 120). That value is stored in this browser. It is not sent to the server.

Clicking a row in Réponses sends Priorx’s F3 shortcut (keydown and keyup, key `F3`, code `F3`, keyCode 114) once on each same-origin document, including frames, then writes that patient’s phone number into the search field that appears or that matches `PRIORX_PATIENT_SEARCH_SELECTOR` in `priorx-search.js`. It does not press Enter and it does not submit the search. The selector in the repository is a placeholder: this repo has no saved Priorx HTML for that box, so the id has to be confirmed on the pharmacy computer. If no field can be filled, the digits are copied to the clipboard during the click (no clipboard permission is added) and a French notice is shown. The full phone number is not written into the Réponses list; the list shows a mask such as `***-***-0199`.

Page network traffic is left untouched. The extension does not wrap `XMLHttpRequest`, `fetch`, or `__doPostBack`.

## What it sends to the backend

Each call is HTTPS JSON from the background script, with the header `X-Api-Key`. The pharmacy is not named in the request. The backend recognizes the pharmacy from the API key.

The phone number is the JSON field `phone_number`. It is not part of the web address.

| Staff action | Request | JSON body |
|---|---|---|
| Open a patient file | `POST /consent/lookup` | `phone_number` |
| Save yes or no | `POST /consent` | `phone_number`, `consent`, `recorded_by` |
| Confirm an SMS | `POST /notify` | `phone_number`, `patient_name` (first name), `message_type`, and `sent_by` when the staff login is known |
| Open the Réponses list | `GET /confirmations` | none |
| Mark a reply done | `POST /confirmations/{confirmation_id}/dismiss` | none |
| Open Historique for the file on screen | `POST /messages/history` | `phone_number` |

`message_type` is one of `ready`, `partial`, `new_prescription`, `renewal`.

`confirmation_id` is the id returned by the OUI list. The list is drawn with text nodes, so a name or an id from the server is shown as text.

Replies the widget reads: `consent`, `consent_date`, `needs_reinscription`, `message_sid`, and `confirmations` (each item: `confirmation_id`, `patient_name`, `replied_at`, plus `phone_number` and `message_type` when the server sends them). A row without `phone_number` stays in the list and cannot be clicked to search. Historique reads `messages` (each item: `message_type`, `sent_at`, `sent_by`, `status`, and optionally `direction` and `reply_keyword`). If that path answers 404, the Historique tab shows a French notice and the rest of the widget keeps working.

Paths and field names live in `api-contract.mjs`. The background script refuses any other path before it calls the network.

## API key

On the pharmacy computer, open the extension’s Options and enter:

- the API base URL, for example `https://xxxx.execute-api.ca-central-1.amazonaws.com/prod`
- the API key for this pharmacy

Both are stored in the browser profile on that computer. Copying the extension folder does not copy the key. Anyone who can use that browser profile can use the key. It is still one shared key for the workstation; individual logins would be a later backend change.

An administrator can set the same two values by enterprise policy (`apiBaseUrl` and `apiKey` in `managed_schema.json`). When either value is present in that policy, the policy is what the extension uses, and the Options page no longer accepts a different key. The policy value lives on the managed computers, not in this repository.

There is no `config.js` in this version. If the pharmacy computer still has a `config.js` from the previous install, delete that file after the key has been saved in Options, so the key is not left in the folder.

Do not commit the key, and do not put it in `manifest.json`.

## Install and update

The copy installed from a USB stick is loaded unpacked. It is not published to the Chrome Web Store or to Edge Add-ons. Store and force-install steps are in `DISTRIBUTION.md`. This pull request does not publish the extension.

1. Copy this folder to the pharmacy computer. Do not copy a `config.js`. The manifest is already limited to `https://4502812786.priorx.ca/*`.
2. Chrome or Edge → Extensions → turn on Developer mode → Load unpacked → select the folder. To update, replace the files and press Reload on the NotiRx card. The version on the card should read **1.3.0**.
3. If the key is missing, the Options page opens. Paste the API URL and the API key that used to live in `config.js` on that computer. Save.
4. Reload the Priorx tab and open a patient file (`/4502812786.Web/index.aspx`). The blue **Rx** tab should appear on the right. Each of the four SMS buttons still asks for a yes before a text is sent. Patients who replied OUI are on the **Réponses** tab. Texts for the open file are on the **Historique** tab.

The widget stays off other websites, and off Priorx pages that are not the patient file. It does not run in a private (incognito) window.
