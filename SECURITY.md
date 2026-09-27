# NotiRx extension — security notes

NotiRx is a Chrome and Edge extension for pharmacy staff working in the Priorx web application. It adds four SMS buttons (order ready, medication on order, new prescription received, renewals due) and a list of patients who replied OUI. The extension asks the NotiRx backend (`Koritsy/jtrx-backend`) to send the texts. Twilio is reached only by that backend.

This note covers the extension. It is the description to give a security reviewer.

## Permissions

The manifest asks for:

| Permission | Why it is there |
|---|---|
| `storage` | The API address and the API key are typed on the extension’s Options page and saved in this browser profile (`chrome.storage.local`). |
| One host permission | `https://FILL-IN-PRIORX-HOST.example/*index.aspx*` — the Priorx site, HTTPS only, and only addresses that contain `index.aspx`. |
| The same pattern as a content script | That is what draws the widget on the patient file. |

`storage` is required for the Options page. `alarms` was declared before and never used; it is removed.

The host pattern is written twice in `manifest.json` (`host_permissions` and `content_scripts.matches`) because Chrome keeps those as two fields. They are the same value. Search for `FILL-IN-PRIORX-HOST.example` and replace that host in both lines with the host from the Priorx address bar (the text between `https://` and the next `/`). Leave `/*index.aspx*` in place.

The Priorx host is not recorded anywhere in this repository’s history, so the placeholder is intentional. Josi fills it in on the pharmacy computer before loading the extension. The Options page shows a reminder while the placeholder is still there.

If staff open Priorx on a second host, add that exact HTTPS pattern the same way. Do not put a `*` host back.

The extension does not request a host permission for the API. Calls to the API are normal HTTPS requests from the background script. That works while the API answers browser calls (today, cross-origin access is open). If that is tightened later, allow the extension’s origin, or add that exact API host under `host_permissions`.

## What the extension reads on the page

The script runs only on the matched Priorx address, and only when the patient file is on screen (the page contains `BA01_LastName`).

| On the page | Used for |
|---|---|
| `BA01_LastName` | Shown in the widget on this computer. Stays on this computer. |
| `BA01_FirstName` | Shown in the widget. Sent to the backend only after a staff member confirms an SMS, because the text includes the first name. |
| `BA01_Info2` | The phone is the part before ` - `, digits only. A street address after ` - ` is left on the page. |
| `LoginName1` | The signed-in staff name. Sent as `recorded_by` only when staff save a yes or no consent. |

The widget is drawn in a closed shadow root. Its buttons are separate from Priorx’s page.

Page network traffic is left untouched. The extension does not wrap `XMLHttpRequest`, `fetch`, or `__doPostBack`.

## What it sends to the backend

Each call is HTTPS JSON from the background script, with the header `X-Api-Key`. The pharmacy is not named in the request. The backend recognizes the pharmacy from the API key.

The phone number is the JSON field `phone_number`. It is not part of the web address.

| Staff action | Request | JSON body |
|---|---|---|
| Open a patient file | `POST /consent/lookup` | `phone_number` |
| Save yes or no | `POST /consent` | `phone_number`, `consent`, `recorded_by` |
| Confirm an SMS | `POST /notify` | `phone_number`, `patient_name` (first name), `message_type` |
| Open the OUI list | `GET /confirmations` | none |
| Mark a reply done | `POST /confirmations/{confirmation_id}/dismiss` | none |

`message_type` is one of `ready`, `partial`, `new_prescription`, `renewal`.

`confirmation_id` is the id returned by the OUI list. The list is drawn with text nodes, so a name or an id from the server is shown as text.

Replies the widget still expects: `consent`, `consent_date`, `needs_reinscription`, `message_sid`, and `confirmations` (each item: `confirmation_id`, `patient_name`, `replied_at`).

Paths and field names live in `api-contract.mjs`. The background script refuses any other path before it calls the network.

## API key

On the pharmacy computer, open the extension’s Options and enter:

- the API base URL, for example `https://xxxx.execute-api.ca-central-1.amazonaws.com/prod`
- the API key for this pharmacy

Both are stored in the browser profile on that computer. Copying the extension folder does not copy the key. Anyone who can use that browser profile can use the key. It is still one shared key for the workstation; individual logins would be a later backend change.

There is no `config.js` in this version. If the pharmacy computer still has a `config.js` from the previous install, delete that file after the key has been saved in Options, so the key is not left in the folder.

Do not commit the key, and do not put it in `manifest.json`.

## Install and update

NotiRx is loaded unpacked. It is not published to the Chrome Web Store or to Edge Add-ons.

1. Copy this folder to the pharmacy computer. Do not copy a `config.js`.
2. In `manifest.json`, replace `FILL-IN-PRIORX-HOST.example` in both lines with the Priorx host. Keep `https://` and `/*index.aspx*`.
3. Chrome or Edge → Extensions → turn on Developer mode → Load unpacked → select the folder. To update, replace the files and press Reload on the NotiRx card. The version on the card should read **1.1.0**.
4. If the key is missing, the Options page opens. Paste the API URL and the API key that used to live in `config.js` on that computer. Save.
5. Reload the Priorx tab and open a patient file. The blue **Rx** tab should appear on the right. Each of the four SMS buttons still asks for a yes before a text is sent. The OUI list is the **Confirm.** tab.

The widget stays off other websites, and off Priorx pages that are not the patient file.
