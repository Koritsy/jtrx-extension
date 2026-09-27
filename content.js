// NotiRx content script — reads a few Priorx fields and draws the widget.
// Injected only on https://4502812786.priorx.ca, including the patient file at
// /4502812786.Web/index.aspx. The fields are document ids (BA01_LastName,
// BA01_FirstName, BA01_Info2, LoginName1), so the /4502812786.Web/ folder
// does not change which elements are read. If BA01_LastName is absent the
// script returns without drawing anything. Page network traffic is left untouched.

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

  const shadow = host.attachShadow({ mode: 'open' });
  shadow.innerHTML = `
    <style>
      *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
      :host { font-family: system-ui, -apple-system, sans-serif; font-size: 13px; }

      #root { display: flex; align-items: flex-start; }

      #panel {
        width: 260px;
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

      .view { display: none; padding: 9px; }
      .view.active { display: block; }

      .name {
        font-weight: 600; font-size: 12px;
        white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
        margin-bottom: 5px;
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
        cursor: pointer; margin-bottom: 4px;
      }
      .btn:last-child { margin-bottom: 0; }
      .btn:hover { opacity: .88; }
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

      .muted { font-size: 11px; color: #757575; margin-bottom: 7px; line-height: 1.4; }

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
      }

      .empty { text-align: center; padding: 14px 8px; color: #9e9e9e; font-size: 12px; }

      hr { border: none; border-top: 1px solid #eee; margin: 5px 0; }
      .hidden { display: none !important; }

      #nav-row {
        display: flex;
        border-bottom: 1px solid #eee;
        margin: -9px -9px 8px;
        padding: 0 4px;
      }
      .nav-btn {
        flex: 1;
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
        gap: 4px;
        white-space: nowrap;
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
      .conf-name { font-weight: 600; font-size: 11px; }
      .conf-type { color: #1565c0; font-size: 10px; margin-top: 1px; line-height: 1.3; }
      .conf-time { color: #9e9e9e; font-size: 9px; margin-top: 1px; }
      #conf-list, #hist-list { max-height: 320px; overflow: auto; }
      .btn-done {
        background: #e8f5e9; color: #2e7d32; border: none;
        border-radius: 5px; padding: 4px 6px; font-size: 10px; font-weight: 600;
        cursor: pointer; white-space: nowrap;
      }
      .toast {
        position: fixed; right: 12px; bottom: 12px;
        max-width: 240px;
        background: #1a237e; color: #fff;
        border-radius: 8px; padding: 8px 10px;
        font-size: 12px; line-height: 1.35;
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
          <div class="empty">Vérification…</div>
        </div>

        <div id="v-no-phone" class="view">
          <div class="muted">⚠️ Numéro introuvable dans le dossier.</div>
        </div>

        <div id="v-unknown" class="view">
          <div id="up-name" class="name"></div>
          <span class="badge unk">Consentement inconnu</span>
          <div class="muted">Demandez si le patient souhaite recevoir un SMS.</div>
          <div class="row">
            <button id="btn-oui" class="btn btn-green">✓ Oui</button>
            <button id="btn-non" class="btn btn-red">✗ Non</button>
          </div>
        </div>

        <div id="v-opted-in" class="view">
          <div id="oi-name" class="name"></div>
          <span class="badge yes">✓ SMS actif</span>

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
          <div id="oo-name" class="name"></div>
          <span class="badge no">✗ SMS refusé</span>
          <button id="btn-change" class="btn btn-ghost" style="margin-top:7px">Modifier</button>
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

  const VIEWS = ['no-patient', 'loading', 'no-phone', 'unknown', 'opted-in', 'opted-out', 'error'];

  function showView(name) {
    VIEWS.forEach(v => $(`v-${v}`)?.classList.toggle('active', v === name));
  }

  function setDot(color) {
    tabDot.className = 'dot' + (color ? ` ${color}` : '');
  }

  function setName(elId, p) {
    const el = $(elId);
    if (!el) return;
    el.textContent = p ? `${(p.lastName || '').toUpperCase()}, ${p.firstName || ''}`.replace(/^,\s*/, '') : '';
  }

  function resetNotify() {
    $('oi-area').classList.remove('hidden');
    $('oi-confirm').classList.add('hidden');
    $('oi-success').classList.add('hidden');
  }

  // ── Top nav (Patient / Réponses / Historique) ───────────────────────────────

  const Search = globalThis.NotiRxSearch;
  let toastTimer = 0;

  function showToast(message) {
    const toast = $('toast');
    toast.textContent = message;
    toast.classList.remove('hidden');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.add('hidden'), 4500);
  }

  function setActiveTab(name) {
    $('nav-patient').classList.toggle('active', name === 'patient');
    $('nav-responses').classList.toggle('active', name === 'responses');
    $('nav-history').classList.toggle('active', name === 'history');
    $('patient-views').style.display = name === 'patient' ? '' : 'none';
    $('v-responses').classList.toggle('active', name === 'responses');
    $('v-history').classList.toggle('active', name === 'history');
  }

  $('nav-patient').addEventListener('click', () => setActiveTab('patient'));
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
  const TOAST_COPIED = 'Numéro copié — collez-le dans la recherche (F3)';

  // ── Priorx lock / no signed-in user ─────────────────────────────────────────
  // The widget stays hidden until LoginName1 is visible and no NIP screen is up.
  // Every send checks again. If the check cannot tell, it blocks.

  const Lock = globalThis.NotiRxLock;
  let widgetLocked = true;
  let priorxWasLocked = false;
  let idleExpired = false;
  let lastActivityAt = Date.now();
  let idleMinutes = Lock ? Lock.DEFAULT_IDLE_LOCK_MINUTES : 10;
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

  function logLock(assessment) {
    console.info('[NotiRx lock]', assessment.debug);
    try {
      document.documentElement.setAttribute('data-notirx-lock-debug', JSON.stringify(assessment.debug));
    } catch {
      // The page can refuse the attribute. The console line is enough.
    }
  }

  function clearSensitiveUi() {
    $('conf-list').replaceChildren();
    $('hist-list').replaceChildren();
    $('conf-badge').classList.add('hidden');
    $('conf-badge').textContent = '0';
    for (const id of ['up-name', 'oi-name', 'oo-name', 'oi-confirm-text']) {
      const el = $(id);
      if (el) el.textContent = id === 'oi-confirm-text' ? '' : '';
    }
    const confEmpty = $('conf-empty');
    const histEmpty = $('hist-empty');
    if (confEmpty) confEmpty.textContent = '';
    if (histEmpty) histEmpty.textContent = '';
  }

  function enterLocked() {
    widgetLocked = true;
    host.hidden = true;
    panelOpen = false;
    panel.classList.remove('open');
    clearSensitiveUi();
    currentPatient = null;
    chrome.runtime.sendMessage({ type: 'PATIENT_CLEARED' });
  }

  function leaveLocked() {
    widgetLocked = false;
    host.hidden = false;
    lastActivityAt = Date.now();
    idleExpired = false;
    onPatientChanged();
    fetchConfirmations();
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
    chrome.runtime.sendMessage({ type: 'CONFIRMATIONS_LIST', priorxUnlocked: true }, response => {
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

  function renderConfirmations(items) {
    if (currentAssessment().locked) {
      clearSensitiveUi();
      return;
    }
    const badge = $('conf-badge');
    badge.textContent = String(items.length);
    badge.classList.toggle('hidden', items.length === 0);

    const empty = $('conf-empty');
    empty.textContent = EMPTY_CONFIRMATIONS;
    empty.classList.toggle('hidden', items.length > 0);

    const listEl = $('conf-list');
    listEl.replaceChildren();

    items.forEach(item => {
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
      const confirmationId = item.confirmation_id == null ? '' : String(item.confirmation_id);
      done.addEventListener('click', () => dismissConfirmation(confirmationId));

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

  function dismissConfirmation(confirmationId) {
    if (!sessionAllowsAction()) return;
    chrome.runtime.sendMessage({ type: 'CONFIRMATION_DISMISS', confirmationId, priorxUnlocked: true }, response => {
      if (response?.ok) fetchConfirmations();
      else showToast('Impossible de marquer cette réponse comme terminée.');
    });
  }

  // ── Historique (texts for the open patient file) ────────────────────────────

  let historyRequest = 0;

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
    chrome.runtime.sendMessage({ type: 'MESSAGES_HISTORY', phoneNumber: digits, priorxUnlocked: true }, response => {
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
      empty.textContent = response?.error || "Impossible de charger l'historique.";
      empty.classList.remove('hidden');
      return;
    }

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

  setInterval(() => {
    if (Date.now() - lastActivityAt >= idleMinutes * 60 * 1000) idleExpired = true;
    enforceLock();
  }, 5000);
  setInterval(fetchConfirmations, 20000);

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
        $('oi-area').classList.add('hidden');
        $('oi-confirm').classList.add('hidden');
        $('oi-success').classList.remove('hidden');
        setTimeout(resetNotify, 3000);
        fetchHistory(currentPatient?.phoneRaw);
        break;

      case 'NOTIFY_ERROR':
        resetNotify();
        if (msg.consentRevoked) {
          if (sessionAllowsAction()) {
            chrome.runtime.sendMessage({ type: 'RETRY_PATIENT', patient: currentPatient, priorxUnlocked: true });
          }
        } else {
          $('err-msg').textContent = msg.error || '';
          showView('error');
          setDot('red');
        }
        break;

      case 'TOGGLE_WIDGET':
        panelOpen = !panelOpen;
        panel.classList.toggle('open', panelOpen);
        break;
    }
  });

  function applyState(msg) {
    if (currentAssessment().locked) return;
    $('oi-reinscription').classList.add('hidden');
    const p = msg.patient;

    switch (msg.state) {
      case 'NO_PATIENT':
        showView('no-patient'); setDot('');
        break;
      case 'LOADING':
        showView('loading'); setDot('');
        break;
      case 'NO_PHONE':
        showView('no-phone'); setDot('orange');
        break;
      case 'UNKNOWN':
        setName('up-name', p);
        showView('unknown'); setDot('orange');
        panelOpen = true; panel.classList.add('open');
        break;
      case 'OPTED_IN':
        setName('oi-name', p);
        resetNotify();
        showView('opted-in'); setDot('green');
        if (msg.needsReinscription) $('oi-reinscription').classList.remove('hidden');
        break;
      case 'OPTED_OUT':
        setName('oo-name', p);
        showView('opted-out'); setDot('red');
        break;
      case 'ERROR':
        $('err-msg').textContent = msg.error || '';
        showView('error'); setDot('red');
        break;
    }
  }

  // ── Button handlers ────────────────────────────────────────────────────────

  $('btn-oui').addEventListener('click', () => saveConsent('yes'));
  $('btn-non').addEventListener('click', () => saveConsent('no'));

  $('oi-area').querySelectorAll('[data-notify-type]').forEach(btn => {
    btn.addEventListener('click', () => {
      pendingNotifyType = btn.dataset.notifyType;
      $('oi-confirm-text').textContent = NOTIFY_LABELS[pendingNotifyType] || NOTIFY_LABELS.ready;
      $('oi-area').classList.add('hidden');
      $('oi-confirm').classList.remove('hidden');
    });
  });

  $('btn-send-yes').addEventListener('click', () => {
    if (!sessionAllowsAction()) return;
    chrome.runtime.sendMessage({
      type: 'NOTIFY_SEND',
      patient: currentPatient,
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
    showView('loading');
    chrome.runtime.sendMessage({ type: 'RETRY_PATIENT' });
  });

  $('btn-options').addEventListener('click', () => {
    chrome.runtime.sendMessage({ type: 'OPEN_OPTIONS' });
  });

  function saveConsent(consent) {
    if (!sessionAllowsAction()) return;
    showView('loading'); setDot('');
    chrome.runtime.sendMessage({
      type: 'CONSENT_SAVE',
      priorxUnlocked: true,
      data: { consent, recordedBy: currentPatient?.user || 'unknown', patient: currentPatient },
    }, response => {
      if (!response?.ok) {
        $('err-msg').textContent = response?.error || '';
        showView('error'); setDot('red');
      }
    });
  }

  // ── Patient detection ──────────────────────────────────────────────────────

  let currentPatient = null;

  function readPatientFromDOM() {
    const lastName  = document.getElementById('BA01_LastName')?.textContent?.trim() || '';
    const firstName = (document.getElementById('BA01_FirstName')?.textContent?.trim() || '').replace(/^,\s*/, '');
    const info2     = document.getElementById('BA01_Info2')?.textContent?.trim() || '';
    const user      = document.getElementById('LoginName1')?.textContent?.trim() || '';
    const phoneRaw  = info2.split(' - ')[0].trim().replace(/\D/g, '');
    return { lastName, firstName, phoneRaw, user };
  }

  function onPatientChanged() {
    if (currentAssessment().locked) {
      if (!widgetLocked) enforceLock();
      return;
    }
    const patient = readPatientFromDOM();
    if (!patient.lastName && !patient.firstName) {
      currentPatient = null;
      chrome.runtime.sendMessage({ type: 'PATIENT_CLEARED' });
      fetchHistory('');
      return;
    }
    if (
      currentPatient &&
      currentPatient.lastName  === patient.lastName &&
      currentPatient.firstName === patient.firstName &&
      currentPatient.phoneRaw === patient.phoneRaw
    ) return;
    currentPatient = patient;
    chrome.runtime.sendMessage({ type: 'PATIENT_CHANGED', data: patient, priorxUnlocked: true });
    fetchHistory(patient.phoneRaw);
  }

  const nameTarget = document.getElementById('BA01_LastName');
  if (nameTarget) {
    new MutationObserver(onPatientChanged)
      .observe(nameTarget, { childList: true, subtree: true, characterData: true });
  }

  const info2Target = document.getElementById('BA01_Info2');
  if (info2Target) {
    new MutationObserver(() => { if (currentPatient) onPatientChanged(); })
      .observe(info2Target, { childList: true, subtree: true, characterData: true });
  }

  for (const eventName of ['mousemove', 'keydown', 'click', 'scroll', 'pointerdown']) {
    document.addEventListener(eventName, noteActivity, true);
  }

  let lockTimer = 0;
  new MutationObserver(() => {
    clearTimeout(lockTimer);
    lockTimer = setTimeout(enforceLock, 50);
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

})();
