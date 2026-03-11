// sidebar.js — Gmail Protection sidebar panel
// All backend communication and user interaction logic.

'use strict';

// ── State ──────────────────────────────────────────────────────────────────
let _emailData   = null;
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

// Section 2 — Phishing Analysis
const btnAnalyze        = document.getElementById('btnAnalyze');
const analyzeLoading    = document.getElementById('analyzeLoading');

// Section 3 — Analyse Email Components
const btnAnalyzeComp    = document.getElementById('btnAnalyzeComp');
const componentSelect   = document.getElementById('componentSelect');
const compLoading       = document.getElementById('compLoading');
const compLoadingText   = document.getElementById('compLoadingText');

// Section 4 — Manual Input
const manualTypeSelect  = document.getElementById('manualTypeSelect');
const manualInput       = document.getElementById('manualInput');
const manualCharCount   = document.getElementById('manualCharCount');
const btnManualAnalyze  = document.getElementById('btnManualAnalyze');
const manualLoading     = document.getElementById('manualLoading');
const manualLoadingText = document.getElementById('manualLoadingText');

// Response / feedback strip
const responseArea      = document.getElementById('responseArea');
const responseContent   = document.getElementById('responseContent');

// ── Analysis panel descriptor objects ─────────────────────────────────────
// Each section that shows ML results uses the same set of DOM nodes grouped
// here so renderAnalysisIntoPanel() can work with any of them generically.
const PANELS = {
  main: {
    loading:      analyzeLoading,
    panel:        document.getElementById('analyzeResults'),
    verdictBanner: document.getElementById('verdictBanner'),
    emailBlock:   document.getElementById('emailRiskBlock'),
    emailRiskRow: document.getElementById('emailRiskRow'),
    urlRisksBlock: document.getElementById('urlRisksBlock'),
    urlRiskList:  document.getElementById('urlRiskList'),
  },
  comp: {
    loading:      compLoading,
    panel:        document.getElementById('compResults'),
    verdictBanner: document.getElementById('compVerdictBanner'),
    emailBlock:   document.getElementById('compEmailBlock'),
    emailRiskRow: document.getElementById('compEmailRiskRow'),
    urlRisksBlock: document.getElementById('compUrlRisksBlock'),
    urlRiskList:  document.getElementById('compUrlRiskList'),
  },
  manual: {
    loading:      manualLoading,
    panel:        document.getElementById('manualResults'),
    verdictBanner: document.getElementById('manualVerdictBanner'),
    emailBlock:   document.getElementById('manualEmailBlock'),
    emailRiskRow: document.getElementById('manualEmailRiskRow'),
    urlRisksBlock: document.getElementById('manualUrlRisksBlock'),
    urlRiskList:  document.getElementById('manualUrlRiskList'),
  },
};

// ── Input sanitization (client-side, first line of defence) ───────────────
function sanitizeText(str) {
  return String(str)
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/&(?!amp;|lt;|gt;)/g, '&amp;');
}

// ── Show simple response feedback (info / success / error strip) ───────────
function showResponse(message, type = 'info') {
  responseContent.className = `response-content ${type}`;
  responseContent.textContent = message;
  responseArea.classList.remove('hidden');

  if (type === 'success') {
    setTimeout(() => responseArea.classList.add('hidden'), 6000);
  }
}

// ── Clear all analysis panels (called on Refresh) ─────────────────────────
function clearAllPanels() {
  Object.values(PANELS).forEach(({ loading, panel }) => {
    loading.classList.add('hidden');
    panel.classList.add('hidden');
  });
  responseArea.classList.add('hidden');
}

// ── Shared: render ML results into any panel ───────────────────────────────
// mode:
//   'full'      — show both email risk row and URL risk list
//   'urls_only' — hide email risk row (email body was not analysed)
//   'text_only' — show email risk row; URL block auto-hides when list is empty
function renderAnalysisIntoPanel(data, refs, mode = 'full') {
  const isPhishing = data.verdict === 'phishing';

  // Verdict banner
  refs.verdictBanner.className = isPhishing
    ? 'verdict-banner verdict-banner--phishing'
    : 'verdict-banner verdict-banner--safe';
  refs.verdictBanner.textContent = isPhishing
    ? '\u26A0 Phishing Detected'
    : '\u2713 Safe';

  // Email content risk block
  if (mode === 'urls_only') {
    refs.emailBlock.classList.add('hidden');
  } else {
    refs.emailBlock.classList.remove('hidden');
    const ea     = data.email_analysis || {};
    const ePhish = ea.label === 'phishing';
    refs.emailRiskRow.innerHTML = `
      <span class="risk-label-text">Email body</span>
      <span class="risk-badge ${ePhish ? 'risk-badge--phishing' : 'risk-badge--safe'}">
        ${ePhish ? 'PHISHING' : 'SAFE'}
      </span>
      <span class="url-risk-score">${((ea.score || 0) * 100).toFixed(1)}%</span>
    `;
  }

  // URL risk block
  const urlAnalysis = data.url_analysis || [];
  if (urlAnalysis.length === 0) {
    refs.urlRisksBlock.classList.add('hidden');
  } else {
    refs.urlRisksBlock.classList.remove('hidden');
    refs.urlRiskList.innerHTML = '';
    urlAnalysis.forEach((u) => {
      const uPhish = u.label === 'phishing';
      const item   = document.createElement('div');
      item.className = 'url-risk-item';
      item.innerHTML = `
        <span class="url-risk-text ${uPhish ? 'url-risk-text--phishing' : ''}"
              title="${sanitizeText(u.url)}">${sanitizeText(u.url)}</span>
        <span class="risk-badge ${uPhish ? 'risk-badge--phishing' : 'risk-badge--safe'}">
          ${uPhish ? 'PHISHING' : 'SAFE'}
        </span>
        <span class="url-risk-score">${(u.score * 100).toFixed(1)}%</span>
      `;
      refs.urlRiskList.appendChild(item);
    });
  }

  refs.panel.classList.remove('hidden');
}

// ── Shared: POST to /analyze and render result into a panel ───────────────
// panelKey: 'main' | 'comp' | 'manual'
// mode:     'full' | 'urls_only' | 'text_only'
async function runAnalyze(payload, btn, panelKey, mode = 'full') {
  const refs = PANELS[panelKey];
  refs.loading.classList.remove('hidden');
  refs.panel.classList.add('hidden');
  setLoading(btn, true);

  try {
    const res = await fetch(`${CONFIG.BASE_URL}${CONFIG.ENDPOINTS.ANALYZE}`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      // Include mode so the backend only runs the relevant model(s).
      body:    JSON.stringify({ ...payload, mode }),
      signal:  AbortSignal.timeout(60000), // model inference can be slow
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      throw new Error(`Server error ${res.status}: ${errText.substring(0, 200)}`);
    }

    const data = await res.json();
    renderAnalysisIntoPanel(data, refs, mode);
  } catch (err) {
    showResponse(`Analysis failed: ${err.message}`, 'error');
  } finally {
    refs.loading.classList.add('hidden');
    setLoading(btn, false);
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
    backendStatusEl.className     = 'badge badge--connected';
    backendStatusText.textContent = 'Connected';
  } else {
    backendStatusEl.className     = 'badge badge--disconnected';
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
    emailStatusBadge.className    = 'status-badge status-badge--unknown';
    emailStatusText.textContent   = 'Checking…';
    emailMetaEl.classList.add('hidden');
    btnAnalyze.disabled     = true;
    btnAnalyzeComp.disabled = true;
    return;
  }

  if (data.error && !data.emailFound) {
    emailStatusBadge.className    = 'status-badge status-badge--error';
    emailStatusText.textContent   = data.error;
    emailMetaEl.classList.add('hidden');
    btnAnalyze.disabled     = true;
    btnAnalyzeComp.disabled = true;
    return;
  }

  if (!data.emailFound) {
    emailStatusBadge.className    = 'status-badge status-badge--none';
    emailStatusText.textContent   = 'No email currently open.';
    emailMetaEl.classList.add('hidden');
    btnAnalyze.disabled     = true;
    btnAnalyzeComp.disabled = true;
    return;
  }

  // Email detected
  emailStatusBadge.className    = 'status-badge status-badge--detected';
  emailStatusText.textContent   = 'Email detected on this page';
  emailMetaEl.classList.remove('hidden');

  metaSubject.textContent     = data.subject || '(no subject)';
  metaSubject.title           = data.subject || '';
  metaURLCount.textContent    = (data.urls        || []).length;
  metaAttachCount.textContent = (data.attachments || []).length;

  btnAnalyze.disabled     = !_backendOk;
  btnAnalyzeComp.disabled = !_backendOk;
}

// ── Refresh: clear panels, re-check health, re-fetch email data ───────────
async function refresh() {
  btnRefresh.textContent = '↺ Refreshing…';
  btnRefresh.disabled    = true;

  clearAllPanels();           // remove previous analysis results
  await checkBackendHealth();

  const data = await fetchEmailData();
  _emailData = data;
  renderEmailStatus(data);

  btnRefresh.textContent = '↺ Refresh';
  btnRefresh.disabled    = false;
}

// ── Validate backend available ─────────────────────────────────────────────
function requireBackend() {
  if (!_backendOk) {
    showResponse('Backend not reachable. Start the FastAPI server and refresh.', 'error');
    return false;
  }
  return true;
}

// ── Section 2: Phishing Analysis — full email (body + all URLs) ───────────
async function handleAnalyze() {
  if (!requireBackend()) return;
  if (!_emailData || !_emailData.emailFound) {
    showResponse('No email detected. Open a Gmail message first.', 'error');
    return;
  }

  const subject = (_emailData.subject || '').substring(0, CONFIG.MAX_BODY_CHARS);
  const body    = (_emailData.body    || '').substring(0, CONFIG.MAX_BODY_CHARS);
  const urls    = _emailData.urls || [];

  if (!subject && !body) {
    showResponse('Unable to extract email content.', 'error');
    return;
  }

  await runAnalyze({ subject, body, urls }, btnAnalyze, 'main', 'full');
}

// ── Section 3: Analyse Email Components ───────────────────────────────────
async function handleAnalyzeComp() {
  if (!requireBackend()) return;
  if (!_emailData || !_emailData.emailFound) {
    showResponse('No email detected. Open a Gmail message first.', 'error');
    return;
  }

  const component = componentSelect.value;

  if (component === 'urls') {
    const urls = _emailData.urls || [];
    if (!urls.length) {
      showResponse('No URLs found in this email.', 'info');
      return;
    }
    compLoadingText.textContent = `Analysing ${urls.length} URL(s)…`;
    // Send empty body so the email model is not called for URL-only analysis;
    // the email risk row is hidden by the 'urls_only' mode in the renderer.
    await runAnalyze(
      { subject: '', body: '', urls },
      btnAnalyzeComp, 'comp', 'urls_only'
    );

  } else if (component === 'text') {
    const subject = (_emailData.subject || '').substring(0, CONFIG.MAX_BODY_CHARS);
    const body    = (_emailData.body    || '').substring(0, CONFIG.MAX_BODY_CHARS);
    if (!subject && !body) {
      showResponse('Unable to extract text content.', 'error');
      return;
    }
    compLoadingText.textContent = 'Analysing email text…';
    await runAnalyze(
      { subject, body, urls: [] },
      btnAnalyzeComp, 'comp', 'text_only'
    );

  } else if (component === 'attachments') {
    // Attachments contain binary content and cannot be classified by the text
    // ML models. Show a metadata summary in the info strip instead.
    const attachments = _emailData.attachments || [];
    if (!attachments.length) {
      showResponse('No attachments detected in this email.', 'info');
      return;
    }
    const lines = attachments.map(
      (a) => `• ${sanitizeText(a.filename)} (${sanitizeText(a.size || 'unknown size')})`
    );
    showResponse(
      `${attachments.length} attachment(s) found:\n${lines.join('\n')}`,
      'info'
    );
  }
}

// ── Section 4: Manual Input ────────────────────────────────────────────────
async function handleManualAnalyze() {
  if (!requireBackend()) return;

  const inputType = manualTypeSelect.value;
  const rawText   = manualInput.value.trim();

  if (!rawText) {
    showResponse('Please enter some content in the text box.', 'error');
    return;
  }

  const encoder = new TextEncoder();
  if (encoder.encode(rawText).length > CONFIG.MAX_TEXT_BYTES) {
    showResponse('Input exceeds 100 KB limit. Please reduce the content.', 'error');
    return;
  }

  if (inputType === 'urls') {
    // Extract all HTTP/HTTPS URLs from the pasted block of text.
    const urlRegex = /https?:\/\/[^\s<>"')\]]+/gi;
    const urls     = [...new Set(rawText.match(urlRegex) || [])];
    if (!urls.length) {
      showResponse('No valid URLs found in the input.', 'info');
      return;
    }
    manualLoadingText.textContent = `Analysing ${urls.length} URL(s)…`;
    await runAnalyze(
      { subject: '', body: '', urls },
      btnManualAnalyze, 'manual', 'urls_only'
    );

  } else if (inputType === 'text') {
    manualLoadingText.textContent = 'Analysing text…';
    await runAnalyze(
      { subject: '', body: rawText, urls: [] },
      btnManualAnalyze, 'manual', 'text_only'
    );
  }
}

// ── Loading state helper ───────────────────────────────────────────────────
function setLoading(btn, isLoading) {
  btn.disabled = isLoading;
  if (isLoading) {
    btn.classList.add('loading');
  } else {
    btn.classList.remove('loading');
    // Buttons that require both backend + open email
    if (btn === btnAnalyze || btn === btnAnalyzeComp) {
      btn.disabled = !_backendOk || !_emailData?.emailFound;
    } else {
      // Manual analyse only needs the backend (no open email required)
      btn.disabled = false;
    }
  }
}

// ── Character count for manual input ──────────────────────────────────────
function updateCharCount() {
  const bytes = new TextEncoder().encode(manualInput.value).length;
  const kb    = (bytes / 1024).toFixed(1);
  manualCharCount.textContent = `${kb} KB / 100 KB`;
  manualCharCount.style.color = bytes > CONFIG.MAX_TEXT_BYTES
    ? 'var(--color-danger)'
    : 'var(--color-muted)';
}

// ── Event listeners ────────────────────────────────────────────────────────
btnRefresh.addEventListener('click', refresh);
btnAnalyze.addEventListener('click', handleAnalyze);
btnAnalyzeComp.addEventListener('click', handleAnalyzeComp);
btnManualAnalyze.addEventListener('click', handleManualAnalyze);
manualInput.addEventListener('input', updateCharCount);

// ── Startup ────────────────────────────────────────────────────────────────
(async function init() {
  backendStatusEl.className     = 'badge badge--checking';
  backendStatusText.textContent = 'Connecting…';

  await refresh();

  // Periodic health re-check every 30 s
  _healthTimer = setInterval(async () => {
    const wasOk = _backendOk;
    await checkBackendHealth();
    if (wasOk !== _backendOk) {
      renderEmailStatus(_emailData);
    }
  }, 30000);

  // Listen for storage changes pushed by the content script
  chrome.storage.onChanged.addListener(async (changes, area) => {
    if (area !== 'local') return;
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
