const $ = (selector) => document.querySelector(selector);
const pages = [...document.querySelectorAll('.page')];
const nav = [...document.querySelectorAll('.nav-link')];
let lastReport = null;

function showPage(id) {
  pages.forEach((page) => page.classList.toggle('active', page.id === id));
  nav.forEach((button) => button.classList.toggle('active', button.dataset.page === id));
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
nav.forEach((button) => button.addEventListener('click', () => showPage(button.dataset.page)));
document.querySelectorAll('[data-go]').forEach((button) => button.addEventListener('click', () => showPage(button.dataset.go)));

const attachments = $('#attachments');
attachments.addEventListener('change', () => {
  const list = $('#attachment-list'); list.replaceChildren();
  const files = [...attachments.files].slice(0, 3);
  for (const file of files) {
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 5 * 1024 * 1024) continue;
    const card = document.createElement('div'); card.className = 'attachment';
    const image = document.createElement('img'); image.src = URL.createObjectURL(file); image.alt = 'Local evidence preview';
    const label = document.createElement('span'); label.textContent = `${file.name} (${Math.ceil(file.size / 1024)} KB)`;
    card.append(image, label); list.append(card);
  }
  if (attachments.files.length > 3) $('#report-status').textContent = 'Only the first three attachments are previewed.';
});

function list(element, values, fallback) { element.replaceChildren(...(values.length ? values : [fallback]).map((value) => { const li = document.createElement('li'); li.textContent = value; return li; })); }
function action(title, text) { const el = document.createElement('article'); el.className = 'action'; el.innerHTML = `<b>${title}</b><span>${text}</span>`; return el; }

function renderResult(output) {
  const state = output.case_state ?? {}; const message = output.last_message ?? {}; const verification = state.verification ?? {};
  const assessment = state.final_alert?.public_message ? 'Public safety alert ready' : state.verification_status === 'APPROVED' ? 'Likely scam pattern identified' : message.recommended_action === 'REQUEST_MORE_USER_EVIDENCE' ? 'More information is needed' : 'Report assessed';
  $('#result-title').textContent = assessment;
  $('#result-summary').textContent = state.final_alert?.public_message || message.rationale || 'The workflow completed with the information provided.';
  $('#result-assessment').textContent = (output.next_stage ?? message.recommended_action ?? 'completed').replaceAll('_', ' ');
  $('#result-confidence').textContent = Number.isFinite(Number(message.confidence)) ? `${Math.round(Number(message.confidence) * 100)}%` : 'Not available';
  list($('#result-findings'), [...new Set([...(state.analysis?.warning_signs ?? []), ...(state.indicators ?? []), ...(message.findings ?? [])])], 'No specific warning signs were returned.');
  list($('#result-evidence'), (state.evidence ?? []).map((e) => e.claim || e.evidence_id), 'No text evidence was processed.');
  $('#result-body').hidden = false;
  $('#alert-state').textContent = output.next_stage === 'PUBLISHED' ? 'An approved safety alert was published through Telegram.' : 'No public alert was sent; independent evidence is required before publication.';
  const actions = $('#action-list'); actions.replaceChildren();
  const situation = lastReport?.situation || '';
  if (/Money transferred|Transaction pending/.test(situation)) actions.append(action('Urgent: contact your bank or payment provider', 'Use its official app, website, or card statement contact details. Ask for a fraud complaint reference and available account-security measures. For financial cyber fraud in India, call 1930 promptly.'));
  actions.append(action('Preserve your evidence', 'Keep original messages, screenshots, URLs, payment references, dates, and any complaint acknowledgement numbers.'));
  actions.append(action('Report through official channels', 'For India, use cybercrime.gov.in. Do not rely on links sent by the suspected scammer.'));
  if (/Credentials shared|Account compromised/.test(situation)) actions.append(action('Secure affected accounts', 'Change passwords through the official service, enable multi-factor authentication, and review recent account sessions.'));
  $('#action-center').hidden = false;
  showPage('results');
}

$('#report-form').addEventListener('submit', async (event) => {
  event.preventDefault(); const form = event.currentTarget; const status = $('#report-status'); const button = form.querySelector('button[type="submit"]');
  const data = Object.fromEntries(new FormData(form).entries()); lastReport = data; status.textContent = 'Analysis is running. This may take a few minutes…'; status.className = 'status'; button.disabled = true;
  try { const response = await fetch('/webhook/scam-report-test', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(data) }); if (!response.ok) throw new Error(response.status === 404 || response.status === 500 ? 'The ScamShield report workflow is not active.' : `Request failed (${response.status})`); const raw = await response.json(); renderResult(Array.isArray(raw) ? raw[0] : raw); status.textContent = 'Analysis completed.'; status.classList.add('success'); }
  catch (error) { status.textContent = `Could not analyse this report: ${error.message}`; status.classList.add('error'); } finally { button.disabled = false; }
});

$('#search-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.currentTarget; const button = form.querySelector('button'); const status = $('#search-status'); const results = $('#search-results');
  status.textContent = 'Searching Google News RSS…'; status.className = 'status'; results.replaceChildren(); button.disabled = true;
  try {
    const response = await fetch('/webhook/scam-search', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({query: new FormData(form).get('query')}) });
    if (!response.ok) throw new Error(response.status === 404 || response.status === 500 ? 'The Scam Search workflow is not published.' : `Request failed (${response.status})`);
    const raw = await response.json(); const output = Array.isArray(raw) ? raw[0] : raw;
    // The live Azure Search workflow returns `search_decision.sources`;
    // older/local controller outputs may wrap those records in `case_patch`.
    const sources = output.search_decision?.sources ?? output.case_patch?.sources ?? output.sources ?? [];
    if (!sources.length) { status.textContent = 'No relevant current reports were returned for this search.'; return; }
    status.textContent = `${sources.length} source${sources.length === 1 ? '' : 's'} found.`; status.classList.add('success');
    sources.forEach((source) => { const card = document.createElement('article'); card.className = 'panel'; const title = document.createElement('h2'); title.textContent = source.title || 'Reported scam coverage'; const link = document.createElement('a'); link.href = source.url; link.target = '_blank'; link.rel = 'noopener noreferrer'; link.textContent = 'Read original article ↗'; const note = document.createElement('p'); note.textContent = 'This is a news search result. Treat allegations as reported information and verify details independently.'; card.append(title, note, link); results.append(card); });
  } catch (error) { status.textContent = `Could not search current reporting: ${error.message}`; status.classList.add('error'); } finally { button.disabled = false; }
});
$('#copy-complaint').addEventListener('click', async () => { if (!lastReport) return; const draft = `Subject: Request for assistance regarding suspected scam\n\nI am reporting a suspected scam.\n\nWhat happened: ${lastReport.narrative}\nContact method: ${lastReport.contact_method}\nAmount involved: ${lastReport.amount || '[not provided]'}\nSender or identifier: ${lastReport.sender || '[not provided]'}\nActions already taken: ${lastReport.actions_taken || '[not provided]'}\n\nPlease advise me on appropriate next steps and provide a complaint reference number.`; await navigator.clipboard.writeText(draft); $('#copy-complaint').textContent = 'Complaint draft copied'; });
