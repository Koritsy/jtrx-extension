// NotiRx content script — reads a few Priorx fields and draws the widget.
// Injected only on https://4502812786.priorx.ca, including the patient file at
// /4502812786.Web/index.aspx. The fields are document ids (BA01_LastName,
// BA01_FirstName, BA01_Info2, LoginName1), so the /4502812786.Web/ folder
// does not change which elements are read. If BA01_LastName is absent the
// script returns without drawing anything. Page network traffic is left untouched.
//
// Priorx fills those fields in separate steps. The consent prompt and the send
// buttons stay hidden until the name and phone have stopped changing and the
// lookup for that phone has returned. A reply for an earlier file is ignored.

(function () {
  if (!document.getElementById('BA01_LastName')) return;

  // ── Shadow DOM host ─────────────────────────────────────────────────────────

  const host = document.createElement('div');
  host.id = 'notirx-host';
  Object.assign(host.style, {
    position: 'fixed',
    right: '0',
    top: '40%',
    zIndex: '2147483647',
  });
  document.body.appendChild(host);
  // Stay hidden until the Priorx session is confirmed open. Fail closed.
  host.hidden = true;

  // Closed on purpose. This script keeps the `shadow` reference returned
  // here, so getElementById still works. Priorx's page scripts cannot read
  // host.shadowRoot, so the name and phone drawn in the widget stay here.
  const shadow = host.attachShadow({ mode: 'closed' });
  shadow.innerHTML = `
    <style>
      *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
      :host { font-family: system-ui, -apple-system, sans-serif; font-size: 13px; }

      #root { display: flex; align-items: flex-start; }

      #panel {
        width: 220px;
        padding-top: 8px;
        background: #fff;
        border: 1px solid #ddd;
        border-right: none;
        border-radius: 10px 0 0 10px;
        box-shadow: -3px 2px 14px rgba(0,0,0,.16);
        display: none;
      }
      #panel.open { display: block; }

      #tab {
        width: 26px;
        background: #1a237e;
        border: none;
        border-radius: 8px 0 0 8px;
        padding: 10px 0;
        cursor: pointer;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 8px;
        flex-shrink: 0;
        outline: none;
      }
      #tab:hover { background: #283593; }

      .dot {
        width: 8px; height: 8px;
        border-radius: 50%;
        background: #9e9e9e;
        flex-shrink: 0;
      }
      .dot.green  { background: #66bb6a; }
      .dot.orange { background: #ffa726; }
      .dot.red    { background: #ef5350; }

      .tab-lbl {
        font-size: 9px; font-weight: 700; color: #fff;
        letter-spacing: .5px;
        writing-mode: vertical-rl;
        transform: rotate(180deg);
      }

      .view { display: none; padding: 12px 9px 9px; }
      .view.active { display: block; }

      .name-row {
        display: flex; align-items: center; gap: 6px;
        margin-bottom: 5px;
      }
      .name {
        font-weight: 600; font-size: 12px;
        white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
        flex: 1; min-width: 0;
      }
      .lang-badge {
        flex-shrink: 0;
        font-size: 10px; font-weight: 700; letter-spacing: .4px;
        padding: 1px 5px; border-radius: 4px;
        background: #e3f2fd; color: #1565c0;
      }
      .badge {
        display: inline-block; padding: 2px 6px;
        border-radius: 20px; font-size: 11px; font-weight: 500;
        margin-bottom: 7px;
      }
      .badge.yes { background: #e8f5e9; color: #2e7d32; }
      .badge.no  { background: #ffebee; color: #c62828; }
      .badge.unk { background: #fff8e1; color: #e65100; }

      .btn {
        width: 100%; padding: 6px 8px;
        border: none; border-radius: 6px;
        font-size: 12px; font-weight: 500;
        line-height: 1.25;
        cursor: pointer; margin-bottom: 4px;
        white-space: normal;
      }
      .btn:last-child { margin-bottom: 0; }
      .btn:hover { opacity: .88; }
      .btn:disabled { opacity: .45; cursor: not-allowed; }
      .btn-blue  { background: #1565c0; color: #fff; }
      .btn-green { background: #2e7d32; color: #fff; }
      .btn-red   { background: #c62828; color: #fff; }
      .btn-ghost { background: #e0e0e0; color: #333; }
      .btn-link  {
        background: none; border: none;
        color: #1565c0; text-decoration: underline;
        font-size: 11px; cursor: pointer; padding: 2px 0;
        display: block; width: 100%; text-align: left;
      }

      .row { display: grid; grid-template-columns: 1fr 1fr; gap: 4px; }

      .muted { font-size: 11px; color: #757575; margin-bottom: 7px; line-height: 1.4; overflow-wrap: anywhere; }

      .confirm {
        background: #fff3e0; border: 1px solid #ffe0b2;
        border-radius: 6px; padding: 7px; margin-bottom: 5px;
      }
      .confirm p { font-size: 11px; margin-bottom: 5px; }

      .success {
        background: #e8f5e9; color: #2e7d32;
        border-radius: 6px; padding: 6px;
        font-size: 12px; font-weight: 500; text-align: center;
      }

      .warn {
        background: #fff3e0; border-radius: 6px;
        padding: 6px; font-size: 11px; color: #e65100;
        margin-top: 5px; line-height: 1.4;
        overflow-wrap: anywhere;
      }

      .empty { text-align: center; padding: 14px 8px; color: #9e9e9e; font-size: 12px; }

      hr { border: none; border-top: 1px solid #eee; margin: 5px 0; }
      .hidden { display: none !important; }

      #nav-row {
        display: flex;
        border-bottom: 1px solid #eee;
        margin: 0 0 8px;
        padding: 0 2px;
      }
      .nav-btn {
        flex: 1 1 0;
        min-width: 0;
        background: none;
        border: none;
        padding: 6px 2px;
        font-size: 10px;
        font-weight: 600;
        color: #888;
        cursor: pointer;
        border-bottom: 2px solid transparent;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 3px;
        white-space: nowrap;
        overflow: hidden;
      }
      .nav-btn.active { color: #1565c0; border-bottom-color: #1565c0; }
      .conf-badge {
        background: #c62828; color: #fff;
        border-radius: 20px; font-size: 9px; font-weight: 700;
        padding: 0 4px; min-width: 12px; text-align: center;
      }
      .conf-item {
        background: #fafafa; border: 1px solid #eee;
        border-radius: 6px; padding: 6px; margin-bottom: 5px;
        display: flex; justify-content: space-between; align-items: center; gap: 6px;
      }
      .conf-item.clickable:hover { background: #e3f2fd; border-color: #bbdefb; }
      .conf-open {
        flex: 1; min-width: 0;
        background: none; border: none; padding: 0;
        text-align: left; font: inherit; color: inherit;
      }
      .conf-item.clickable .conf-open { cursor: pointer; }
      .conf-open-static { cursor: default; }
      .conf-name { font-weight: 600; font-size: 11px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .conf-type { color: #1565c0; font-size: 10px; margin-top: 1px; line-height: 1.3; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .conf-time { color: #9e9e9e; font-size: 9px; margin-top: 1px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      #conf-list, #hist-list { max-height: 320px; overflow: auto; }
      .btn-done {
        background: #e8f5e9; color: #2e7d32; border: none;
        border-radius: 5px; padding: 4px 6px; font-size: 10px; font-weight: 600;
        cursor: pointer; white-space: nowrap;
      }
      .toast {
        position: fixed; right: 12px; bottom: 12px;
        max-width: 340px;
        background: #1a237e; color: #fff;
        border-radius: 8px; padding: 8px 10px;
        font-size: 12px; line-height: 1.35;
        overflow-wrap: anywhere;
        box-shadow: 0 2px 10px rgba(0,0,0,.22);
      }
    </style>

    <div id="root">
      <div id="panel">

        <div id="nav-row">
          <button id="nav-patient" class="nav-btn active">Patient</button>
          <button id="nav-responses" class="nav-btn">
            Réponses <span id="conf-badge" class="conf-badge hidden">0</span>
          </button>
          <button id="nav-history" class="nav-btn">Historique</button>
        </div>

        <div id="patient-views">

        <div id="v-no-patient" class="view active">
          <div class="empty">Aucun patient</div>
        </div>

        <div id="v-loading" class="view">
          <div id="ld-name-row" class="name-row hidden">
            <div id="ld-name" class="name"></div>
            <span class="lang-badge" title="Langue du SMS">FR</span>
          </div>
          <div class="empty">Vérification…</div>
        </div>

        <div id="v-no-phone" class="view">
          <div id="np-name-row" class="name-row hidden">
            <div id="np-name" class="name"></div>
            <span class="lang-badge" title="Langue du SMS">FR</span>
          </div>
          <div class="muted">⚠️ Numéro introuvable dans le dossier.</div>
        </div>

        <div id="v-unknown" class="view">
          <div class="name-row">
            <div id="up-name" class="name"></div>
            <span class="lang-badge" title="Langue du SMS">FR</span>
          </div>
          <span class="badge unk">Consentement inconnu</span>
          <div class="muted">Demandez si le patient souhaite recevoir un SMS.</div>
          <div class="row">
            <button id="btn-oui" class="btn btn-green">✓ Oui</button>
            <button id="btn-non" class="btn btn-red">✗ Non</button>
          </div>
        </div>

        <div id="v-opted-in" class="view">
          <div class="name-row">
            <div id="oi-name" class="name"></div>
            <span class="lang-badge" title="Langue du SMS">FR</span>
          </div>
          <span class="badge yes">✓ SMS actif</span>
          <div id="oi-phone-block" class="warn hidden"></div>

          <div id="oi-area">
            <button class="btn btn-blue" data-notify-type="ready">📱 Commande prête</button>
            <button class="btn btn-blue" data-notify-type="partial">⚠️ Médicaments en commande</button>
            <button class="btn btn-blue" data-notify-type="new_prescription">📠 Nouvelle prescription reçue</button>
            <button class="btn btn-blue" data-notify-type="renewal">🔄 Ordonnances dues</button>
          </div>

          <div id="oi-confirm" class="confirm hidden">
            <p id="oi-confirm-text">Envoyer la notification?</p>
            <div class="row">
              <button id="btn-send-yes" class="btn btn-blue">Oui</button>
              <button id="btn-send-no"  class="btn btn-ghost">Non</button>
            </div>
          </div>

          <div id="oi-success" class="success hidden">✓ SMS envoyé</div>

          <div id="oi-revoke-box" class="confirm hidden" style="background:#ffebee;border-color:#ffcdd2;margin-top:5px">
            <p>Retirer le consentement?</p>
            <div class="row">
              <button id="btn-rvk-yes" class="btn btn-red">Oui</button>
              <button id="btn-rvk-no"  class="btn btn-ghost">Non</button>
            </div>
          </div>

          <div id="oi-reinscription" class="warn hidden">
            ⚠️ Demandez au patient d'envoyer <strong>INSCRIPTION</strong> au (450)&nbsp;600-5792.
          </div>

          <hr>
          <button id="btn-revoke" class="btn-link">Retirer le consentement</button>
        </div>

        <div id="v-opted-out" class="view">
          <div class="name-row">
            <div id="oo-name" class="name"></div>
            <span class="lang-badge" title="Langue du SMS">FR</span>
          </div>
          <span class="badge no">✗ SMS refusé</span>
          <button id="btn-change" class="btn btn-ghost" style="margin-top:7px">Modifier</button>
        </div>

        <div id="v-sms-opt-out" class="view">
          <div class="name-row">
            <div id="so-name" class="name"></div>
            <span class="lang-badge" title="Langue du SMS">FR</span>
          </div>
          <span class="badge no">✗ ARRÊT par texto</span>
          <div class="warn">Le patient a répondu ARRÊT par texto. Il doit texter COMMENCER pour se réabonner.</div>
        </div>

        <div id="v-error" class="view">
          <div class="muted">⚠️ <span id="err-msg"></span></div>
          <button id="btn-retry" class="btn btn-ghost">Réessayer</button>
          <button id="btn-options" class="btn btn-ghost">Options</button>
        </div>

        </div><!-- /#patient-views -->

        <div id="v-responses" class="view">
          <div id="conf-empty" class="empty hidden">Aucune réponse en attente</div>
          <div id="conf-list"></div>
        </div>

        <div id="v-history" class="view">
          <div id="hist-empty" class="empty">Aucun message envoyé pour ce patient.</div>
          <div id="hist-list"></div>
        </div>

      </div>

      <button id="tab" title="NotiRx">
        <div class="dot" id="tab-dot"></div>
        <span class="tab-lbl">Rx</span>
      </button>
    </div>
    <div id="toast" class="toast hidden" role="status"></div>
  `;

  // ── Refs ─────────────────────────────────────────────────────────────────────

  const $ = id => shadow.getElementById(id);
  const panel  = $('panel');
  const tab    = $('tab');
  const tabDot = $('tab-dot');

  let pendingNotifyType = 'ready';
  const NOTIFY_LABELS = {
    ready:            'Envoyer "commande prête"?',
    partial:          'Envoyer "médicaments en commande"?',
    new_prescription: 'Envoyer "nouvelle prescription reçue"?',
    renewal:          'Envoyer "ordonnances dues"?',
  };

  // ── Toggle / drag ─────────────────────────────────────────────────────────────

  let panelOpen = false;
  let dragging = false, didDrag = false;
  let dragY0 = 0, hostY0 = 0;

  tab.addEventListener('mousedown', e => {
    dragging = true;
    didDrag  = false;
    dragY0   = e.clientY;
    hostY0   = host.getBoundingClientRect().top;
    e.preventDefault();
  });

  document.addEventListener('mousemove', e => {
    if (!dragging) return;
    const dy = e.clientY - dragY0;
    if (Math.abs(dy) > 4) didDrag = true;
    if (!didDrag) return;
    const newTop = Math.max(20, Math.min(window.innerHeight - 80, hostY0 + dy));
    host.style.top = newTop + 'px';
  });

  document.addEventListener('mouseup', () => { dragging = false; });

  tab.addEventListener('click', () => {
    if (didDrag) return;
    panelOpen = !panelOpen;
    panel.classList.toggle('open', panelOpen);
  });

  // ── View helpers ──────────────────────────────────────────────────────────────

  const VIEWS = ['no-patient', 'loading', 'no-phone', 'unknown', 'opted-in', 'opted-out', 'sms-opt-out', 'error'];

  function showView(name) {
    VIEWS.forEach(v => $(`v-${v}`)?.classList.toggle('active', v === name));
  }

  function setDot(color) {
    tabDot.className = 'dot' + (color ? ` ${color}` : '');
  }

  function setLanguageBadge(language) {
    const code = language === 'EN' ? 'EN' : 'FR';
    shadow.querySelectorAll('.lang-badge').forEach((el) => {
      el.textContent = code;
    });
  }

  function setName(elId, p) {
    const el = $(elId);
    if (!el) return;
    el.textContent = p ? `${(p.lastName || '').toUpperCase()}, ${p.firstName || ''}`.replace(/^,\s*/, '') : '';
    if (p) setLanguageBadge(p.language);
  }

  function applySendBlock(phoneRaw) {
    const message = Patient ? Patient.phoneBlockedMessage(phoneRaw) : '';
    const block = $('oi-phone-block');
    const buttons = $('oi-area').querySelectorAll('button');
    if (message) {
      block.textContent = message;
      block.classList.remove('hidden');
      buttons.forEach((btn) => { btn.disabled = true; });
    } else {
      block.textContent = '';
      block.classList.add('hidden');
      buttons.forEach((btn) => { btn.disabled = false; });
    }
    return message;
  }

  function resetNotify() {
    $('oi-area').classList.remove('hidden');
    $('oi-confirm').classList.add('hidden');
    $('oi-success').classList.add('hidden');
    applySendBlock(currentPatient?.phoneRaw);
  }

  // ── Top nav (Patient / Réponses / Historique) ───────────────────────────────

  const Search = globalThis.NotiRxSearch;
  const Confirmations = globalThis.NotiRxConfirmations;
  let toastTimer = 0;

  function showToast(message, durationMs = 4500) {
    const toast = $('toast');
    toast.textContent = message;
    toast.classList.remove('hidden');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.add('hidden'), durationMs);
  }

  function setActiveTab(name) {
    $('nav-patient').classList.toggle('active', name === 'patient');
    $('nav-responses').classList.toggle('active', name === 'responses');
    $('nav-history').classList.toggle('active', name === 'history');
    $('patient-views').style.display = name === 'patient' ? '' : 'none';
    $('v-responses').classList.toggle('active', name === 'responses');
    $('v-history').classList.toggle('active', name === 'history');
  }

  $('nav-patient').addEventListener('click', () => {
    setActiveTab('patient');
    refreshSmsOptOut();
  });
  $('nav-responses').addEventListener('click', () => {
    setActiveTab('responses');
    fetchConfirmations();
  });
  $('nav-history').addEventListener('click', () => {
    setActiveTab('history');
    fetchHistory(currentPatient?.phoneRaw);
  });

  // ── Réponses (patients who replied OUI) ──────────────────────────────────────

  const EMPTY_CONFIRMATIONS = 'Aucune réponse en attente';
  let confirmationItems = [];
  const suppressedDismissIds = new Set();
  const TOAST_COPIED = 'Numéro copié — collez-le dans la recherche (F3)';

  // ── Priorx lock / no signed-in user ─────────────────────────────────────────
  // The widget stays hidden until LoginName1 is visible and no NIP screen is up.
  // Every send checks again. If the check cannot tell, it blocks.

  const Lock = globalThis.NotiRxLock;
  const Lang = globalThis.NotiRxLanguage;
  let widgetLocked = true;
  let smsOptOutActive = false;
  let priorxWasLocked = false;
  let idleExpired = false;
  let lastActivityAt = Date.now();
  let idleMinutes = Lock ? Lock.DEFAULT_IDLE_LOCK_MINUTES : 5;
  let lockDebug = false;

  function currentAssessment() {
    if (!Lock) {
      return {
        locked: true,
        reasons: ['lock-helper-missing'],
        debug: { locked: true, reasons: ['lock-helper-missing'], idleExpired },
      };
    }
    return Lock.assessPriorxSession(document, { idleExpired });
  }

  function lockDebugPayload(assessment) {
    const language = Lang ? Lang.readPatientLanguage(document) : 'FR';
    return { ...(assessment.debug || {}), language: language === 'EN' ? 'EN' : 'FR' };
  }

  function logLock(assessment) {
    const debug = lockDebugPayload(assessment);
    console.info('[NotiRx lock]', debug);
    try {
      document.documentElement.setAttribute('data-notirx-lock-debug', JSON.stringify(debug));
    } catch {
      // The page can refuse the attribute. The console line is enough.
    }
  }

  function clearSensitiveUi() {
    $('conf-list').replaceChildren();
    $('hist-list').replaceChildren();
    $('conf-badge').classList.add('hidden');
    $('conf-badge').textContent = '0';
    for (const id of ['up-name', 'oi-name', 'oo-name', 'so-name', 'ld-name', 'np-name', 'oi-confirm-text']) {
      const el = $(id);
      if (el) el.textContent = '';
    }
    const phoneBlock = $('oi-phone-block');
    if (phoneBlock) {
      phoneBlock.textContent = '';
      phoneBlock.classList.add('hidden');
    }
    $('ld-name-row')?.classList.add('hidden');
    $('np-name-row')?.classList.add('hidden');
    shadow.querySelectorAll('.lang-badge').forEach((el) => {
      el.textContent = '';
    });
    const confEmpty = $('conf-empty');
    const histEmpty = $('hist-empty');
    if (confEmpty) confEmpty.textContent = '';
    if (histEmpty) histEmpty.textContent = '';
  }

  // After Reload on chrome://extensions, this content script keeps running but
  // chrome.runtime.id becomes undefined. sendMessage then throws
  // "Extension context invalidated". Stop the timers and tell the pharmacist
  // to press F5. Do not leave an uncaught error on the page.
  let backgroundTimers = [];
  let contextInvalidated = false;
  const Poll = globalThis.NotiRxPoll;
  const pollLeaderId = (globalThis.crypto && typeof crypto.randomUUID === 'function')
    ? crypto.randomUUID()
    : `tab-${Date.now()}-${Math.random()}`;
  const POLL_LEADER_KEY = 'notirxPollLeader';
  let pollTimer = 0;
  let resumeTimer = 0;
  let burstTimers = [];
  let pendingBurstFns = null;
  let burstCursor = 0;
  let deferredBurst = null;
  let pollingStopped = false;
  let failureStreak = 0;

  function extensionContextAlive() {
    try {
      return Boolean(chrome.runtime && chrome.runtime.id);
    } catch {
      return false;
    }
  }

  function clearBurstTimers() {
    for (const timer of burstTimers) clearTimeout(timer);
    burstTimers = [];
  }

  function clearPollTimers() {
    clearTimeout(pollTimer);
    clearTimeout(resumeTimer);
    pollTimer = 0;
    resumeTimer = 0;
    clearBurstTimers();
  }

  function stopBackgroundTimers() {
    for (const timer of backgroundTimers) clearInterval(timer);
    backgroundTimers = [];
    clearPollTimers();
    pollingStopped = true;
  }

  function noteContextInvalidated() {
    if (contextInvalidated) return;
    contextInvalidated = true;
    stopBackgroundTimers();
    resignLeader().catch(() => {});
    console.info('[NotiRx] Extension rechargée. Appuyez sur F5.');
    try {
      clearTimeout(toastTimer);
      const toast = $('toast');
      if (!toast || host.hidden) return;
      toast.textContent = 'NotiRx a été rechargé. Appuyez sur F5 pour continuer.';
      toast.classList.remove('hidden');
    } catch {
      // The page may be going away. Stopping the timers is enough.
    }
  }

  function invalidatedMessage(err) {
    return String(err && err.message || err).includes('Extension context invalidated');
  }

  function sendToBackground(message, callback) {
    if (!extensionContextAlive()) {
      noteContextInvalidated();
      return;
    }
    try {
      const pending = chrome.runtime.sendMessage(message, (response) => {
        if (!extensionContextAlive()) {
          noteContextInvalidated();
          return;
        }
        const runtimeError = chrome.runtime.lastError;
        if (runtimeError) {
          if (invalidatedMessage(runtimeError)) {
            noteContextInvalidated();
            return;
          }
          if (typeof callback === 'function') {
            callback({ ok: false, error: runtimeError.message || 'Extension error' });
          }
          return;
        }
        if (typeof callback === 'function') callback(response);
      });
      if (pending && typeof pending.catch === 'function') {
        pending.catch((err) => {
          if (!extensionContextAlive() || invalidatedMessage(err)) noteContextInvalidated();
        });
      }
    } catch (err) {
      if (!extensionContextAlive() || invalidatedMessage(err)) {
        noteContextInvalidated();
        return;
      }
      throw err;
    }
  }

  function every(fn, ms) {
    if (contextInvalidated || !extensionContextAlive()) {
      noteContextInvalidated();
      return;
    }
    const timer = setInterval(() => {
      if (!extensionContextAlive()) {
        noteContextInvalidated();
        return;
      }
      try {
        fn();
      } catch (err) {
        if (!extensionContextAlive() || invalidatedMessage(err)) {
          noteContextInvalidated();
          return;
        }
        throw err;
      }
    }, ms);
    backgroundTimers.push(timer);
  }

  function storageLocal() {
    try {
      return chrome.storage && chrome.storage.local;
    } catch {
      return null;
    }
  }

  function scheduleCalls(fns, options = {}) {
    if (!fns || !fns.length) return;
    clearBurstTimers();
    const queue = fns.slice();
    pendingBurstFns = queue;
    burstCursor = 0;
    const lead = options.leadMs == null
      ? (Poll ? Poll.leadDelayMs(Math.random) : 0)
      : options.leadMs;
    const offsets = Poll ? Poll.staggerOffsets(queue.length) : queue.map(() => 0);
    queue.forEach((fn, i) => {
      const timer = setTimeout(() => {
        burstCursor = i + 1;
        if (burstCursor >= queue.length) pendingBurstFns = null;
        if (contextInvalidated || !extensionContextAlive()) {
          noteContextInvalidated();
          return;
        }
        if (document.visibilityState === 'hidden') {
          deferredBurst = queue.slice(i);
          pendingBurstFns = null;
          clearBurstTimers();
          return;
        }
        try {
          fn();
        } catch (err) {
          if (!extensionContextAlive() || invalidatedMessage(err)) noteContextInvalidated();
          else throw err;
        }
      }, lead + offsets[i]);
      burstTimers.push(timer);
    });
  }

  function noteApiStatus(status) {
    if (!Poll || pollingStopped) return;
    const next = Poll.nextFailureStreak(failureStreak, status);
    if (next === failureStreak) return;
    failureStreak = next;
    if (document.visibilityState === 'hidden') return;
    const delay = Poll.pollDelayMs(failureStreak, Math.random);
    if (next > 0) holdLeaderThroughBackoff(delay).catch(() => {});
    armPollTimer(delay);
  }

  function armPollTimer(ms) {
    clearTimeout(pollTimer);
    pollTimer = 0;
    if (pollingStopped || contextInvalidated) return;
    if (document.visibilityState === 'hidden') return;
    pollTimer = setTimeout(() => {
      pollTimer = 0;
      runConfirmationPoll();
    }, Math.max(0, Number(ms) || 0));
  }

  async function resignLeader() {
    const area = storageLocal();
    if (!area) return;
    const data = await area.get(POLL_LEADER_KEY);
    if (Poll && Poll.releaseLeader(data[POLL_LEADER_KEY], pollLeaderId) !== null) return;
    if (data[POLL_LEADER_KEY] && data[POLL_LEADER_KEY].id === pollLeaderId) {
      await area.remove(POLL_LEADER_KEY);
    }
  }

  async function ensureLeader() {
    const area = storageLocal();
    if (!area || !Poll) return true;
    if (document.visibilityState === 'hidden' || currentAssessment().locked) {
      await resignLeader();
      return false;
    }
    const now = Date.now();
    const data = await area.get(POLL_LEADER_KEY);
    const decision = Poll.claimLeader(data[POLL_LEADER_KEY], {
      id: pollLeaderId,
      now,
      leaseMs: Poll.LEASE_MS,
    });
    if (!decision.won) return false;
    await area.set({ [POLL_LEADER_KEY]: decision.record });
    const again = await area.get(POLL_LEADER_KEY);
    return Poll.isLeaderRecord(again[POLL_LEADER_KEY], { id: pollLeaderId, now: Date.now() });
  }

  async function renewLeaderLease(delayMs) {
    const area = storageLocal();
    if (!area || !Poll) return;
    const data = await area.get(POLL_LEADER_KEY);
    if (!Poll.isLeaderRecord(data[POLL_LEADER_KEY], { id: pollLeaderId, now: Date.now() })) return;
    const leaseMs = Poll.leaseMsForDelay(delayMs);
    await area.set({
      [POLL_LEADER_KEY]: { id: pollLeaderId, until: Date.now() + leaseMs },
    });
  }

  async function holdLeaderThroughBackoff(delayMs) {
    const area = storageLocal();
    if (!area || !Poll) return;
    const now = Date.now();
    const data = await area.get(POLL_LEADER_KEY);
    const decision = Poll.claimLeader(data[POLL_LEADER_KEY], {
      id: pollLeaderId,
      now,
      leaseMs: Poll.leaseMsForDelay(delayMs),
    });
    if (!decision.won) return;
    await area.set({ [POLL_LEADER_KEY]: decision.record });
  }

  function refreshSmsOptOut() {
    if (!smsOptOutActive || !currentPatient) return;
    if (currentAssessment().locked) return;
    sendToBackground({
      type: 'RETRY_PATIENT',
      patient: currentPatient,
      priorxUnlocked: true,
      quiet: true,
    });
  }

  function runConfirmationPoll() {
    if (pollingStopped || contextInvalidated || !extensionContextAlive()) {
      if (!extensionContextAlive()) noteContextInvalidated();
      return;
    }
    if (!Poll) {
      if (document.visibilityState !== 'hidden' && !currentAssessment().locked) fetchConfirmations();
      return;
    }
    if (document.visibilityState === 'hidden') return;
    ensureLeader().then((leader) => {
      if (pollingStopped || contextInvalidated) return;
      const visible = document.visibilityState !== 'hidden';
      const locked = currentAssessment().locked;
      const delay = Poll.pollDelayMs(leader ? failureStreak : 0, Math.random);
      if (leader) renewLeaderLease(delay).catch(() => {});
      // Arm before the request. A fast 429 or 5XX replaces this wait.
      armPollTimer(delay);
      if (Poll.shouldPollNow({ visible, locked, isLeader: leader })) {
        fetchConfirmations();
        refreshSmsOptOut();
      }
    }).catch(() => {
      armPollTimer(Poll.pollDelayMs(failureStreak, Math.random));
      if (document.visibilityState !== 'hidden' && !currentAssessment().locked) fetchConfirmations();
    });
  }

  function scheduleVisibleWork() {
    if (pollingStopped || document.visibilityState === 'hidden') return;
    clearTimeout(resumeTimer);
    const delay = Poll ? Poll.resumeDelayMs(Math.random) : 400;
    resumeTimer = setTimeout(() => {
      resumeTimer = 0;
      if (pollingStopped || contextInvalidated || document.visibilityState === 'hidden') return;
      const burst = deferredBurst;
      deferredBurst = null;
      if (burst && burst.length) {
        scheduleCalls(burst, { leadMs: 0 });
        armPollTimer(Poll ? Poll.pollDelayMs(failureStreak, Math.random) : 20000);
        return;
      }
      runConfirmationPoll();
    }, delay);
  }

  function pauseForHiddenTab() {
    if (pendingBurstFns && pendingBurstFns.length) {
      deferredBurst = pendingBurstFns.slice(burstCursor);
    }
    pendingBurstFns = null;
    clearTimeout(pollTimer);
    pollTimer = 0;
    clearTimeout(resumeTimer);
    resumeTimer = 0;
    clearBurstTimers();
    resignLeader().catch(() => {});
  }

  function startPolling() {
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') {
        pauseForHiddenTab();
        return;
      }
      scheduleVisibleWork();
    });
    try {
      chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== 'local' || !changes[POLL_LEADER_KEY]) return;
        if (changes[POLL_LEADER_KEY].newValue) return;
        if (document.visibilityState === 'hidden' || pollingStopped) return;
        scheduleVisibleWork();
      });
    } catch {
      // Polling still runs in this tab when storage events are unavailable.
    }
    if (!Poll) {
      every(() => {
        fetchConfirmations();
        refreshSmsOptOut();
      }, 20000);
      return;
    }
    if (document.visibilityState === 'hidden') return;
    armPollTimer(Poll.pollDelayMs(0, Math.random));
  }

  function enterLocked() {
    widgetLocked = true;
    smsOptOutActive = false;
    host.hidden = true;
    panelOpen = false;
    panel.classList.remove('open');
    clearTimeout(settleTimer);
    settleTimer = 0;
    clearBurstTimers();
    pendingBurstFns = null;
    if (gate) gate.reset();
    clearSensitiveUi();
    currentPatient = null;
    fileWasOpen = false;
    sendToBackground({ type: 'PATIENT_CLEARED' });
  }

  function leaveLocked() {
    widgetLocked = false;
    host.hidden = false;
    lastActivityAt = Date.now();
    idleExpired = false;
    onPatientChanged({ leadMs: Poll ? Poll.unlockLeadMs(Math.random()) : 0 });
    const wait = (Poll ? Poll.unlockLeadMs(Math.random()) : 0) + 800;
    setTimeout(() => {
      if (widgetLocked || currentAssessment().locked) return;
      fetchConfirmations();
    }, wait);
  }

  function enforceLock() {
    const priorx = Lock
      ? Lock.assessPriorxSession(document, { idleExpired: false })
      : { locked: true, reasons: ['lock-helper-missing'], debug: { locked: true, reasons: ['lock-helper-missing'] } };
    if (priorx.locked) {
      priorxWasLocked = true;
    } else if (priorxWasLocked) {
      priorxWasLocked = false;
      idleExpired = false;
      lastActivityAt = Date.now();
    }
    const assessment = currentAssessment();
    if (lockDebug) logLock(assessment);
    const locked = assessment.locked;
    if (locked && !widgetLocked) enterLocked();
    if (!locked && widgetLocked) leaveLocked();
    widgetLocked = locked;
    if (locked) host.hidden = true;
    return assessment;
  }

  function sessionAllowsAction() {
    const assessment = currentAssessment();
    if (assessment.locked) {
      idleExpired = assessment.reasons.includes('idle') || idleExpired;
      if (assessment.reasons.some((reason) => reason !== 'idle')) priorxWasLocked = true;
      if (!widgetLocked) enterLocked();
      else host.hidden = true;
      widgetLocked = true;
      if (lockDebug) logLock(assessment);
      return false;
    }
    return true;
  }

  let lastAssessAt = 0;

  function noteActivity(event) {
    const now = Date.now();
    const cheap = event.type === 'mousemove' || event.type === 'scroll';
    if (!widgetLocked && !idleExpired) {
      lastActivityAt = now;
      return;
    }
    if (cheap && now - lastAssessAt < 1000) return;
    lastAssessAt = now;
    const priorx = Lock
      ? Lock.assessPriorxSession(document, { idleExpired: false })
      : { locked: true };
    if (priorx.locked) {
      priorxWasLocked = true;
      enforceLock();
      return;
    }
    const unlocking = event.type === 'click' || event.type === 'keydown' || event.type === 'pointerdown';
    if (idleExpired && !unlocking) return;
    if (idleExpired && unlocking) idleExpired = false;
    lastActivityAt = now;
    if (widgetLocked) enforceLock();
  }

  document.addEventListener('notirx-lock-debug', () => {
    logLock(currentAssessment());
  });

  function fetchConfirmations() {
    if (currentAssessment().locked) {
      $('conf-list').replaceChildren();
      $('conf-badge').classList.add('hidden');
      return;
    }
    sendToBackground({ type: 'CONFIRMATIONS_LIST', priorxUnlocked: true }, response => {
      noteApiStatus(response?.ok ? 200 : response?.status);
      if (!response?.ok) {
        $('conf-list').replaceChildren();
        $('conf-badge').classList.add('hidden');
        const empty = $('conf-empty');
        empty.textContent = response?.error || 'Impossible de charger les confirmations.';
        empty.classList.remove('hidden');
        return;
      }
      renderConfirmations(response.confirmations || []);
    });
  }

  function shownConfirmations(items) {
    if (Confirmations) return Confirmations.visibleConfirmations(items, suppressedDismissIds);
    return (Array.isArray(items) ? items : []).filter((item) => {
      const id = String(item?.confirmation_id ?? '').trim();
      return !id || !suppressedDismissIds.has(id);
    });
  }

  function renderConfirmations(items) {
    if (currentAssessment().locked) {
      clearSensitiveUi();
      return;
    }
    confirmationItems = Array.isArray(items) ? items : [];
    const visible = shownConfirmations(confirmationItems);
    const badge = $('conf-badge');
    badge.textContent = String(visible.length);
    badge.classList.toggle('hidden', visible.length === 0);

    const empty = $('conf-empty');
    empty.textContent = EMPTY_CONFIRMATIONS;
    empty.classList.toggle('hidden', visible.length > 0);

    const listEl = $('conf-list');
    listEl.replaceChildren();

    visible.forEach(item => {
      const digits = Search ? Search.phoneDigits(item.phone_number) : '';
      const canSearch = digits.length >= 10;
      const row = document.createElement('div');
      row.className = 'conf-item' + (canSearch ? ' clickable' : '');

      const text = document.createElement(canSearch ? 'button' : 'div');
      text.className = canSearch ? 'conf-open' : 'conf-open conf-open-static';
      if (canSearch) {
        text.type = 'button';
        text.title = 'Placer le numéro dans la recherche Priorx';
        text.addEventListener('click', () => searchByPhone(digits));
      }

      const name = document.createElement('div');
      name.className = 'conf-name';
      name.textContent = Search
        ? Search.firstNameFromPatientName(item.patient_name)
        : (item.patient_name || 'Patient');

      const typeLabel = Search ? Search.messageTypeLabel(item.message_type) : '';
      const type = document.createElement('div');
      type.className = 'conf-type';
      type.textContent = typeLabel;

      const time = document.createElement('div');
      time.className = 'conf-time';
      const when = Search ? Search.formatTorontoTime(item.replied_at) : '';
      const masked = canSearch && Search ? Search.maskPhone(digits) : '';
      if (!canSearch) {
        time.textContent = when ? `${when} · Sans numéro` : 'Sans numéro';
      } else if (masked) {
        time.textContent = when ? `${when} · ${masked}` : masked;
      } else {
        time.textContent = when;
      }

      text.append(name);
      if (typeLabel) text.append(type);
      text.append(time);

      const done = document.createElement('button');
      done.type = 'button';
      done.className = 'btn-done';
      done.textContent = 'Fait';
      const confirmationId = item.confirmation_id == null ? '' : String(item.confirmation_id).trim();
      done.addEventListener('click', () => dismissConfirmation(confirmationId, item));

      row.append(text, done);
      listEl.appendChild(row);
    });
  }

  async function searchByPhone(digits) {
    if (!sessionAllowsAction()) return;
    if (!Search) {
      showToast('Impossible de placer le numéro. Appuyez sur F3, puis collez-le.');
      return;
    }
    try {
      const result = await Search.openPatientSearch(document, digits);
      if (result.filled) return;
      if (result.copied) {
        showToast(TOAST_COPIED);
        return;
      }
    } catch {
      // Fall through to the same notice. The reply list stays as it is.
    }
    showToast('Impossible de placer le numéro. Appuyez sur F3, puis collez-le.');
  }

  function dismissConfirmation(confirmationId, item) {
    if (!sessionAllowsAction()) return;
    const id = String(confirmationId ?? '').trim();
    if (!id) {
      const fields = item && typeof item === 'object'
        ? Object.keys(item).sort().join(', ')
        : '';
      showToast(
        fields ? `Invalid confirmation id (fields: ${fields})` : 'Invalid confirmation id',
        8000,
      );
      return;
    }
    const started = Confirmations
      ? Confirmations.beginDismiss(suppressedDismissIds, id)
      : (suppressedDismissIds.has(id)
        ? { ok: false, reason: 'duplicate' }
        : (suppressedDismissIds.add(id), { ok: true, id }));
    if (!started.ok) return;
    // Hide before the POST. A later poll filters this id out until the page reloads.
    renderConfirmations(confirmationItems);
    sendToBackground({ type: 'CONFIRMATION_DISMISS', confirmationId: id, priorxUnlocked: true }, response => {
      if (response?.ok) return;
      console.warn("[NotiRx] Fait : échec de l'enregistrement", {
        confirmationId: id,
        status: response?.status || 0,
        error: response?.error || 'aucune réponse du service',
      });
    });
  }

  // ── Historique (texts for the open patient file) ────────────────────────────

  let historyRequest = 0;

  function discardHistory() {
    historyRequest += 1;
    $('hist-list').replaceChildren();
    const empty = $('hist-empty');
    if (!empty) return;
    empty.textContent = 'Chargement…';
    empty.classList.remove('hidden');
  }

  function fetchHistory(phoneRaw) {
    if (currentAssessment().locked) {
      $('hist-list').replaceChildren();
      $('hist-empty').textContent = '';
      return;
    }
    const requestId = ++historyRequest;
    const digits = Search ? Search.phoneDigits(phoneRaw) : String(phoneRaw || '').replace(/\D/g, '');
    const empty = $('hist-empty');
    const listEl = $('hist-list');
    listEl.replaceChildren();

    if (!currentPatient) {
      empty.textContent = 'Aucun patient.';
      empty.classList.remove('hidden');
      return;
    }
    if (digits.length < 10) {
      empty.textContent = 'Numéro introuvable dans le dossier.';
      empty.classList.remove('hidden');
      return;
    }

    empty.textContent = 'Chargement…';
    empty.classList.remove('hidden');
    sendToBackground({ type: 'MESSAGES_HISTORY', phoneNumber: digits, priorxUnlocked: true }, response => {
      if (requestId !== historyRequest) return;
      renderHistory(response);
    });
  }

  function renderHistory(response) {
    if (currentAssessment().locked) {
      clearSensitiveUi();
      return;
    }
    const empty = $('hist-empty');
    const listEl = $('hist-list');
    listEl.replaceChildren();

    if (!response?.ok) {
      noteApiStatus(response?.status);
      empty.textContent = response?.error || "Impossible de charger l'historique.";
      empty.classList.remove('hidden');
      return;
    }
    noteApiStatus(200);

    const messages = Search
      ? Search.sortMessagesNewestFirst(response.messages)
      : (response.messages || []);
    empty.textContent = 'Aucun message envoyé pour ce patient.';
    empty.classList.toggle('hidden', messages.length > 0);
    if (!messages.length) return;

    messages.forEach(entry => {
      const row = document.createElement('div');
      row.className = 'conf-item';
      const text = document.createElement('div');
      text.className = 'conf-open conf-open-static';

      const title = document.createElement('div');
      title.className = 'conf-name';
      title.textContent = Search ? Search.historyEntryTitle(entry) : 'Message';

      const meta = document.createElement('div');
      meta.className = 'conf-time';
      const when = Search ? Search.formatTorontoTime(entry.sent_at) : '';
      const who = entry.sent_by ? String(entry.sent_by) : '';
      meta.textContent = [when, who].filter(Boolean).join(' · ');

      text.append(title, meta);
      row.append(text);
      listEl.appendChild(row);
    });
  }

  every(() => {
    if (Date.now() - lastActivityAt >= idleMinutes * 60 * 1000) idleExpired = true;
    enforceLock();
  }, 5000);

  // ── Messages from background ───────────────────────────────────────────────

  chrome.runtime.onMessage.addListener(msg => {
    switch (msg.type) {

      case 'STATE_UPDATE':
        if (currentAssessment().locked) {
          if (!widgetLocked) enforceLock();
          break;
        }
        applyState(msg);
        break;

      case 'NOTIFY_SUCCESS':
        if (!sessionAllowsAction()) break;
        if (gate.current().mode !== 'settled') break;
        if (msg.phoneRaw && currentPatient?.phoneRaw && msg.phoneRaw !== currentPatient.phoneRaw) break;
        $('oi-area').classList.add('hidden');
        $('oi-confirm').classList.add('hidden');
        $('oi-success').classList.remove('hidden');
        setTimeout(resetNotify, 3000);
        fetchHistory(currentPatient?.phoneRaw);
        break;

      case 'NOTIFY_ERROR':
        if (msg.phoneRaw && currentPatient?.phoneRaw && msg.phoneRaw !== currentPatient.phoneRaw) break;
        resetNotify();
        if (msg.consentRevoked) {
          if (sessionAllowsAction() && currentPatient) {
            sendToBackground({
              type: 'RETRY_PATIENT',
              patient: currentPatient,
              priorxUnlocked: true,
              quiet: true,
            });
          }
          break;
        }
        if (msg.smsOptOut && currentPatient) {
          applyState({
            state: 'SMS_OPT_OUT',
            patient: currentPatient,
            phoneRaw: currentPatient.phoneRaw,
            lookupToken: currentPatient.lookupToken,
            smsOptOut: true,
            status: msg.status || 409,
          });
          break;
        }
        $('err-msg').textContent = msg.error || 'L\'envoi n\'a pas abouti. Réessayez dans un instant.';
        showView('error');
        setDot('red');
        break;

      case 'TOGGLE_WIDGET':
        panelOpen = !panelOpen;
        panel.classList.toggle('open', panelOpen);
        break;
    }
  });

  function livePatient(msg) {
    const fromMsg = msg.patient || {};
    const phone = msg.phoneRaw || fromMsg.phoneRaw || '';
    let live = { lastName: '', firstName: '', phoneRaw: '', user: '', language: 'FR' };
    try {
      live = readPatientFromDOM();
    } catch {
      live = { lastName: '', firstName: '', phoneRaw: '', user: '', language: 'FR' };
    }
    const sameFile = !phone || !live.phoneRaw || live.phoneRaw === phone;
    const source = sameFile ? live : fromMsg;
    const languageSource = sameFile ? live.language : fromMsg.language;
    return {
      lastName: source.lastName || fromMsg.lastName || '',
      firstName: source.firstName || fromMsg.firstName || '',
      phoneRaw: phone || (sameFile ? live.phoneRaw : '') || '',
      user: (sameFile && live.user) || fromMsg.user || '',
      language: languageSource === 'EN' ? 'EN' : 'FR',
      lookupToken: msg.lookupToken,
    };
  }

  function applyState(msg) {
    if (currentAssessment().locked) return;

    if (msg.state === 'NO_PATIENT') {
      if (gate.current().mode !== 'empty') return;
      showView('no-patient'); setDot('');
      return;
    }

    if (msg.state === 'LOADING') {
      if (!gate.matchesLookup(msg)) return;
      showLoading(livePatient(msg));
      return;
    }

    // Send buttons and the consent prompt wait until this lookup token and
    // this phone are still the file on screen. A late reply is ignored.
    const accepted = gate.acceptLookup(msg);
    if (!accepted.ok) return;

    $('oi-reinscription').classList.add('hidden');
    smsOptOutActive = false;
    const p = livePatient(msg);
    currentPatient = p;

    switch (msg.state) {
      case 'NO_PHONE':
        showNoPhone(p);
        break;
      case 'UNKNOWN':
        noteApiStatus(200);
        setName('up-name', p);
        showView('unknown'); setDot('orange');
        panelOpen = true; panel.classList.add('open');
        break;
      case 'OPTED_IN':
        noteApiStatus(200);
        setName('oi-name', p);
        resetNotify();
        showView('opted-in'); setDot('green');
        if (msg.needsReinscription) $('oi-reinscription').classList.remove('hidden');
        break;
      case 'OPTED_OUT':
        noteApiStatus(200);
        setName('oo-name', p);
        showView('opted-out'); setDot('red');
        break;
      case 'SMS_OPT_OUT':
        smsOptOutActive = true;
        if (!msg.status || msg.status === 200) noteApiStatus(200);
        setName('so-name', p);
        showView('sms-opt-out'); setDot('red');
        break;
      case 'ERROR':
        noteApiStatus(msg.status);
        $('err-msg').textContent = msg.error || 'Impossible de vérifier le consentement. Réessayez dans un instant.';
        showView('error'); setDot('red');
        break;
      default:
        break;
    }
  }

  // ── Button handlers ────────────────────────────────────────────────────────

  $('btn-oui').addEventListener('click', () => saveConsent('yes'));
  $('btn-non').addEventListener('click', () => saveConsent('no'));

  $('oi-area').querySelectorAll('[data-notify-type]').forEach(btn => {
    btn.addEventListener('click', () => {
      if (btn.disabled) return;
      if (gate.current().mode !== 'settled') return;
      if (Patient.phoneBlockedMessage(currentPatient?.phoneRaw)) return;
      pendingNotifyType = btn.dataset.notifyType;
      $('oi-confirm-text').textContent = NOTIFY_LABELS[pendingNotifyType] || NOTIFY_LABELS.ready;
      $('oi-area').classList.add('hidden');
      $('oi-confirm').classList.remove('hidden');
    });
  });

  $('btn-send-yes').addEventListener('click', () => {
    if (!sessionAllowsAction()) return;
    if (gate.current().mode !== 'settled') return;
    if (Patient.phoneBlockedMessage(currentPatient?.phoneRaw)) return;
    if (currentPatient) {
      currentPatient = {
        ...currentPatient,
        language: Lang ? Lang.readPatientLanguage(document) : 'FR',
      };
      setLanguageBadge(currentPatient.language);
    }
    sendToBackground({
      type: 'NOTIFY_SEND',
      patient: {
        phoneRaw: currentPatient.phoneRaw,
        user: currentPatient.user,
        language: currentPatient.language,
      },
      messageType: pendingNotifyType,
      priorxUnlocked: true,
    });
  });

  $('btn-send-no').addEventListener('click', resetNotify);

  $('btn-revoke').addEventListener('click', () => {
    $('oi-revoke-box').classList.remove('hidden');
  });

  $('btn-rvk-yes').addEventListener('click', () => {
    $('oi-revoke-box').classList.add('hidden');
    saveConsent('no');
  });

  $('btn-rvk-no').addEventListener('click', () => {
    $('oi-revoke-box').classList.add('hidden');
  });

  $('btn-change').addEventListener('click', () => showView('unknown'));

  $('btn-retry').addEventListener('click', () => {
    if (!sessionAllowsAction()) return;
    gate.force(readPatientFromDOM(), Date.now());
    showLoading(readPatientFromDOM());
    onPatientChanged();
  });

  $('btn-options').addEventListener('click', () => {
    sendToBackground({ type: 'OPEN_OPTIONS' });
  });

  function saveConsent(consent) {
    if (!sessionAllowsAction()) return;
    if (gate.current().mode !== 'settled') return;
    const saved = { ...currentPatient };
    showLoading(saved);
    sendToBackground({
      type: 'CONSENT_SAVE',
      priorxUnlocked: true,
      data: { consent, recordedBy: saved.user || 'unknown', patient: saved },
    }, response => {
      if (gate.current().lookupToken !== saved.lookupToken) return;
      if (response?.smsOptOut) {
        applyState({
          state: 'SMS_OPT_OUT',
          patient: saved,
          phoneRaw: saved.phoneRaw,
          lookupToken: saved.lookupToken,
          smsOptOut: true,
          status: response.status || 409,
        });
        return;
      }
      if (response?.ok) return;
      $('err-msg').textContent = response?.error || 'Impossible d\'enregistrer le consentement. Réessayez dans un instant.';
      showView('error'); setDot('red');
    });
  }

  // ── Patient detection ──────────────────────────────────────────────────────
  // Priorx fills BA01_LastName, BA01_FirstName, BA01_Info2, and BA01_language
  // in separate steps. patient-watch.js waits until that snapshot sits still,
  // then one consent lookup is sent for that phone. Buttons stay hidden until
  // the matching reply arrives.

  const Patient = globalThis.NotiRxPatient;
  const gate = Patient.createPatientGate();
  let currentPatient = null;
  let fileWasOpen = false;
  let settleTimer = 0;
  const watchedFields = new WeakSet();

  function readPatientFromDOM() {
    return Patient.readPatientFields(document, (doc) => (
      Lang ? Lang.readPatientLanguage(doc) : 'FR'
    ));
  }

  function showLoading(patient) {
    smsOptOutActive = false;
    const named = Boolean(patient && (patient.lastName || patient.firstName));
    $('ld-name-row').classList.toggle('hidden', !named);
    setName('ld-name', named ? patient : null);
    if (!named) {
      shadow.querySelectorAll('.lang-badge').forEach((el) => { el.textContent = ''; });
    }
    showView('loading');
    setDot('');
  }

  function showNoPhone(patient) {
    const named = Boolean(patient && (patient.lastName || patient.firstName));
    $('np-name-row').classList.toggle('hidden', !named);
    setName('np-name', named ? patient : null);
    showView('no-phone');
    setDot('orange');
  }

  function refreshVisibleName(patient) {
    if (!patient) return;
    for (const id of ['ld-name', 'np-name', 'up-name', 'oi-name', 'oo-name', 'so-name']) {
      setName(id, patient);
    }
  }

  function armSettle(waitMs) {
    clearTimeout(settleTimer);
    settleTimer = setTimeout(() => {
      settleTimer = 0;
      onPatientChanged();
    }, Math.max(30, waitMs || 0));
  }

  function planPatientSync() {
    if (currentAssessment().locked) {
      if (!widgetLocked) enforceLock();
      return [];
    }
    const view = gate.note(readPatientFromDOM(), Date.now());
    if (view.mode === 'settling') {
      clearBurstTimers();
      pendingBurstFns = null;
      showLoading(view.patient);
      const visible = Boolean(view.patient && (view.patient.lastName || view.patient.firstName || view.patient.phoneRaw));
      currentPatient = visible ? view.patient : null;
      if (visible) fileWasOpen = true;
      discardHistory();
      armSettle(view.waitMs);
      return [];
    }
    clearTimeout(settleTimer);
    settleTimer = 0;
    if (view.mode === 'empty') {
      const hadPatient = fileWasOpen || currentPatient !== null;
      currentPatient = null;
      fileWasOpen = false;
      smsOptOutActive = false;
      showView('no-patient');
      setDot('');
      if (!hadPatient) return [];
      discardHistory();
      return [
        () => sendToBackground({ type: 'PATIENT_CLEARED' }),
        () => fetchHistory(''),
      ];
    }
    if (view.mode === 'no-phone') {
      currentPatient = view.patient;
      fileWasOpen = true;
      smsOptOutActive = false;
      showNoPhone(view.patient);
      return [];
    }
    if (view.startLookup) {
      const token = view.lookupToken;
      const snapshot = { ...view.patient, lookupToken: token };
      currentPatient = snapshot;
      fileWasOpen = true;
      showLoading(snapshot);
      gate.markLookupQueued(token);
      return [
        () => {
          if (currentAssessment().locked) return;
          if (gate.current().lookupToken !== token) return;
          if (gate.current().mode !== 'awaiting' && gate.current().mode !== 'settled') return;
          sendToBackground({ type: 'PATIENT_CHANGED', data: snapshot, priorxUnlocked: true });
        },
        () => {
          if (gate.current().lookupToken !== token) return;
          fetchHistory(snapshot.phoneRaw);
        },
      ];
    }
    if (view.patient && currentPatient) {
      const languageChanged = currentPatient.language !== view.patient.language;
      const nameChanged = currentPatient.lastName !== view.patient.lastName
        || currentPatient.firstName !== view.patient.firstName;
      currentPatient = { ...currentPatient, ...view.patient, lookupToken: view.lookupToken };
      if (languageChanged || nameChanged) refreshVisibleName(currentPatient);
    }
    return [];
  }

  function onPatientChanged(options = {}) {
    const calls = planPatientSync();
    if (!calls.length) return;
    if (document.visibilityState === 'hidden') {
      deferredBurst = calls;
      return;
    }
    scheduleCalls(calls, options.leadMs == null ? {} : { leadMs: options.leadMs });
  }

  function watchField(el) {
    if (!el || watchedFields.has(el)) return;
    watchedFields.add(el);
    new MutationObserver(() => onPatientChanged())
      .observe(el, { childList: true, subtree: true, characterData: true });
  }

  function bindFields() {
    for (const id of ['BA01_LastName', 'BA01_FirstName', 'BA01_Info2', 'LoginName1', 'BA01_language']) {
      watchField(document.getElementById(id));
    }
    if (!Lang) return;
    for (const selector of Lang.PRIORX_LANGUAGE_SELECTORS) {
      try {
        watchField(document.querySelector(selector));
      } catch {
        // A bad selector must not stop the name and phone watchers.
      }
    }
  }

  bindFields();

  for (const eventName of ['mousemove', 'keydown', 'click', 'scroll', 'pointerdown']) {
    document.addEventListener(eventName, noteActivity, true);
  }

  let lockTimer = 0;
  new MutationObserver(() => {
    clearTimeout(lockTimer);
    lockTimer = setTimeout(() => {
      bindFields();
      const wasLocked = widgetLocked;
      const assessment = enforceLock();
      if (!assessment.locked && !wasLocked) onPatientChanged();
    }, 50);
  }).observe(document.documentElement, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ['style', 'class', 'hidden', 'aria-hidden', 'aria-modal'],
    characterData: true,
  });

  chrome.storage.local.get(['idleLockMinutes', 'lockDebug'], (data) => {
    if (Lock) idleMinutes = Lock.normalizeIdleLockMinutes(data?.idleLockMinutes);
    lockDebug = Boolean(data?.lockDebug);
  });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local' || !Lock) return;
    if (changes.idleLockMinutes) idleMinutes = Lock.normalizeIdleLockMinutes(changes.idleLockMinutes.newValue);
    if (changes.lockDebug) lockDebug = Boolean(changes.lockDebug.newValue);
  });

  enforceLock();
  startPolling();

})();
