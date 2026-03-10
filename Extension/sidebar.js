// sidebar.js — Gmail Protection sidebar panel
// All backend communication and user interaction logic.

'use strict';

// ── State ──────────────────────────────────────────────────────────────────
let _emailData   = null; // last extracted email payload
let _backendOk   = false;
let _healthTimer = null;

// ── DOM refs ───────────────────────────────────────────────────────────────
const backendStatusEl   = document.getElementById('backendStatus');
const backendStatusText = document.getElementById('backendStatusText');

const emailStatusBadge  = document.getElementById('emailStatusBadge');
const emailStatusText   = document.getElementById('emailStatusText');
const emailMetaEl       = document.getElementById('emailMeta');
const metaSubject       = document.getElementById('metaSubject');
const metaURLCount      = document.getElementById('metaURLCount');
const metaAttachCount   = document.getElementById('metaAttachCount');

const btnRefresh        = document.getElementById('btnRefresh');
const btnSendEmail      = document.getElementById('btnSendEmail');
const btnSendComponent  = document.getElementById('btnSendComponent');
const componentSelect   = document.getElementById('componentSelect');

const manualTypeSelect  = document.getElementById('manualTypeSelect');
const manualInput       = document.getElementById('manualInput');
const manualCharCount   = document.getElementById('manualCharCount');
const btnSendManual     = document.getElementById('btnSendManual');

const responseArea      = document.getElementById('responseArea');
const responseContent   = document.getElementById('responseContent');

// ── Input sanitization (client-side, first line of defence) ───────────────
function sanitizeText(str) {
  return String(str)
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/&(?!amp;|lt;|gt;)/g, '&amp;');
}

// ── Show response feedback ─────────────────────────────────────────────────
function showResponse(message, type = 'info') {
  responseContent.className = `response-content ${type}`;
  responseContent.textContent = message;
  responseArea.classList.remove('hidden');

  // Auto-hide success messages after 6 s
  if (type === 'success') {
    setTimeout(() => responseArea.classList.add('hidden'), 6000);
  }
}

// ── Backend health check ───────────────────────────────────────────────────
async function checkBackendHealth() {
  try {
    const res = await fetch(`${CONFIG.BASE_URL}${CONFIG.ENDPOINTS.HEALTH}`, {
      method: 'GET',
      signal: AbortSignal.timeout(4000),
    });
    _backendOk = res.ok;
  } catch (_) {
    _backendOk = false;
  }

  if (_backendOk) {
    backendStatusEl.className   = 'badge badge--connected';
    backendStatusText.textContent = 'Connected';
  } else {
    backendStatusEl.className   = 'badge badge--disconnected';
    backendStatusText.textContent = 'Disconnected';
  }

  return _backendOk;
}

// ── Fetch email data from content script via background ────────────────────
function fetchEmailData() {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ type: 'REQUEST_EMAIL_DATA' }, (response) => {
      if (chrome.runtime.lastError) {
        resolve({ emailFound: false, error: chrome.runtime.lastError.message });
      } else {
        resolve(response || { emailFound: false });
      }
    });
  });
}

// ── Update email status UI ─────────────────────────────────────────────────
function renderEmailStatus(data) {
  if (!data) {
    emailStatusBadge.className = 'status-badge status-badge--unknown';
    emailStatusText.textContent = 'Checking…';
    emailMetaEl.classList.add('hidden');
    btnSendEmail.disabled     = true;
    btnSendComponent.disabled = true;
    return;
  }

  if (data.error && !data.emailFound) {
    emailStatusBadge.className = 'status-badge status-badge--error';
    emailStatusText.textContent = 'Error reading tab';
    emailMetaEl.classList.add('hidden');
    btnSendEmail.disabled     = true;
    btnSendComponent.disabled = true;
    return;
  }

  if (!data.emailFound) {
    emailStatusBadge.className = 'status-badge status-badge--none';
    emailStatusText.textContent = 'No email currently open.';
    emailMetaEl.classList.add('hidden');
    btnSendEmail.disabled     = true;
    btnSendComponent.disabled = true;
    return;
  }

  // Email detected
  emailStatusBadge.className = 'status-badge status-badge--detected';
  emailStatusText.textContent = 'Email detected on this page';
  emailMetaEl.classList.remove('hidden');

  metaSubject.textContent    = data.subject || '(no subject)';
  metaSubject.title          = data.subject || '';
  metaURLCount.textContent   = (data.urls   || []).length;
  metaAttachCount.textContent = (data.attachments || []).length;

  btnSendEmail.disabled     = !_backendOk;
  btnSendComponent.disabled = !_backendOk;
}

// ── Refresh: fetch email data + re-render ──────────────────────────────────
async function refresh() {
  btnRefresh.textContent = '↺ Refreshing…';
  btnRefresh.disabled    = true;

  await checkBackendHealth();

  const data = await fetchEmailData();
  _emailData = data;
  renderEmailStatus(data);

  btnRefresh.textContent = '↺ Refresh';
  btnRefresh.disabled    = false;
}

// ── Generic POST helper ────────────────────────────────────────────────────
async function postToBackend(endpoint, body) {
  const res = await fetch(`${CONFIG.BASE_URL}${endpoint}`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(body),
    signal:  AbortSignal.timeout(10000),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Server error ${res.status}: ${text.substring(0, 200)}`);
  }

  return res.json();
}

// ── Validate backend available ─────────────────────────────────────────────
function requireBackend() {
  if (!_backendOk) {
    showResponse('Backend server not reachable. Start the FastAPI server and refresh.', 'error');
    return false;
  }
  return true;
}

// ── Section 2: Send entire email ───────────────────────────────────────────
async function handleSendEmail() {
  if (!requireBackend()) return;
  if (!_emailData || !_emailData.emailFound) {
    showResponse('No email detected. Open a Gmail message first.', 'error');
    return;
  }

  const subject = (_emailData.subject || '').substring(0, CONFIG.MAX_BODY_CHARS);
  const body    = (_emailData.body    || '').substring(0, CONFIG.MAX_BODY_CHARS);
  const urls    = _emailData.urls    || [];

  if (!subject && !body) {
    showResponse('Unable to extract email content.', 'error');
    return;
  }

  setLoading(btnSendEmail, true);
  try {
    const result = await postToBackend(CONFIG.ENDPOINTS.EMAIL, { subject, body, urls });
    showResponse(`Email sent. Session: ${result.session_id}`, 'success');
  } catch (err) {
    showResponse(`Failed to send email: ${err.message}`, 'error');
  } finally {
    setLoading(btnSendEmail, false);
  }
}

// ── Section 3: Send selected component ────────────────────────────────────
async function handleSendComponent() {
  if (!requireBackend()) return;
  if (!_emailData || !_emailData.emailFound) {
    showResponse('No email detected. Open a Gmail message first.', 'error');
    return;
  }

  const component = componentSelect.value;
  setLoading(btnSendComponent, true);

  try {
    let result;

    if (component === 'urls') {
      const urls = _emailData.urls || [];
      if (!urls.length) {
        showResponse('No URLs found in the email.', 'info');
        return;
      }
      result = await postToBackend(CONFIG.ENDPOINTS.URLS, { urls });
      showResponse(`${urls.length} URL(s) sent. Session: ${result.session_id}`, 'success');

    } else if (component === 'text') {
      const subject = (_emailData.subject || '').substring(0, CONFIG.MAX_BODY_CHARS);
      const body    = (_emailData.body    || '').substring(0, CONFIG.MAX_BODY_CHARS);
      if (!subject && !body) {
        showResponse('Unable to extract email content.', 'error');
        return;
      }
      result = await postToBackend(CONFIG.ENDPOINTS.EMAIL, { subject, body, urls: [] });
      showResponse(`Text content sent. Session: ${result.session_id}`, 'success');

    } else if (component === 'attachments') {
      const attachments = _emailData.attachments || [];
      if (!attachments.length) {
        showResponse('No attachments detected in the email.', 'info');
        return;
      }
      result = await postToBackend(CONFIG.ENDPOINTS.ATTACHMENTS, { attachments });
      showResponse(
        `${attachments.length} attachment(s) processed. Session: ${result.session_id}`,
        'success'
      );
    }
  } catch (err) {
    showResponse(`Send failed: ${err.message}`, 'error');
  } finally {
    setLoading(btnSendComponent, false);
  }
}

// ── Section 4: Manual input ────────────────────────────────────────────────
async function handleSendManual() {
  if (!requireBackend()) return;

  const inputType = manualTypeSelect.value;
  const rawText   = manualInput.value.trim();

  if (!rawText) {
    showResponse('Please enter some content in the text box.', 'error');
    return;
  }

  // Enforce 100 KB limit
  const encoder = new TextEncoder();
  if (encoder.encode(rawText).length > CONFIG.MAX_TEXT_BYTES) {
    showResponse('Input exceeds 100 KB limit. Please reduce the content.', 'error');
    return;
  }

  setLoading(btnSendManual, true);
  try {
    const result = await postToBackend(CONFIG.ENDPOINTS.MANUAL_INPUT, {
      input_type: inputType,
      content:    rawText,
    });
    showResponse(
      `Manual input sent (${inputType}). Session: ${result.session_id}`,
      'success'
    );
    manualInput.value = '';
    updateCharCount();
  } catch (err) {
    showResponse(`Send failed: ${err.message}`, 'error');
  } finally {
    setLoading(btnSendManual, false);
  }
}

// ── Loading state helper ───────────────────────────────────────────────────
function setLoading(btn, isLoading) {
  btn.disabled = isLoading;
  if (isLoading) {
    btn.classList.add('loading');
  } else {
    btn.classList.remove('loading');
    // Re-enable action buttons only if conditions still met
    if (btn === btnSendEmail || btn === btnSendComponent) {
      btn.disabled = !_backendOk || !_emailData?.emailFound;
    } else {
      btn.disabled = false;
    }
  }
}

// ── Character count for manual input ──────────────────────────────────────
function updateCharCount() {
  const bytes = new TextEncoder().encode(manualInput.value).length;
  const kb    = (bytes / 1024).toFixed(1);
  manualCharCount.textContent = `${kb} KB / 100 KB`;

  if (bytes > CONFIG.MAX_TEXT_BYTES) {
    manualCharCount.style.color = 'var(--color-danger)';
  } else {
    manualCharCount.style.color = 'var(--color-muted)';
  }
}

// ── Event listeners ────────────────────────────────────────────────────────
btnRefresh.addEventListener('click', refresh);
btnSendEmail.addEventListener('click', handleSendEmail);
btnSendComponent.addEventListener('click', handleSendComponent);
btnSendManual.addEventListener('click', handleSendManual);
manualInput.addEventListener('input', updateCharCount);

// ── Startup ────────────────────────────────────────────────────────────────
(async function init() {
  // Show checking state
  backendStatusEl.className   = 'badge badge--checking';
  backendStatusText.textContent = 'Connecting…';

  await refresh();

  // Periodic health re-check every 30 s
  _healthTimer = setInterval(async () => {
    const wasOk = _backendOk;
    await checkBackendHealth();
    if (wasOk !== _backendOk) {
      // Re-render buttons when connection state changes
      renderEmailStatus(_emailData);
    }
  }, 30000);

  // Listen for storage changes pushed by the content script
  chrome.storage.onChanged.addListener(async (changes, area) => {
    if (area !== 'local') return;
    // Any emailStatus key change means the page changed → re-fetch
    const hasEmailStatus = Object.keys(changes).some((k) =>
      k.startsWith('emailStatus_')
    );
    if (hasEmailStatus) {
      const data = await fetchEmailData();
      _emailData = data;
      renderEmailStatus(data);
    }
  });
})();
