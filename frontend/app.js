
const $ = (selector) => document.querySelector(selector);
const pages = [...document.querySelectorAll('.page')];
const nav = [...document.querySelectorAll('.nav-link')];

let lastReport = null;
let attachmentObjectUrls = [];

function showPage(id) {
  pages.forEach((page) => page.classList.toggle('active', page.id === id));
  nav.forEach((button) => button.classList.toggle('active', button.dataset.page === id));
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

nav.forEach((button) => {
  button.addEventListener('click', () => showPage(button.dataset.page));
});

document.querySelectorAll('[data-go]').forEach((button) => {
  button.addEventListener('click', () => showPage(button.dataset.go));
});

// --------------------------------------------------
// Evidence attachment previews
// --------------------------------------------------

const attachments = $('#attachments');

if (attachments) {
  attachments.addEventListener('change', () => {
    const listElement = $('#attachment-list');
    if (!listElement) return;

    attachmentObjectUrls.forEach((url) => URL.revokeObjectURL(url));
    attachmentObjectUrls = [];
    listElement.replaceChildren();

    const files = [...attachments.files].slice(0, 3);

    for (const file of files) {
      if (
        !['image/jpeg', 'image/png', 'image/webp'].includes(file.type) ||
        file.size > 5 * 1024 * 1024
      ) {
        const error = document.createElement('p');
        error.textContent = `${file.name}: use a JPEG, PNG, or WebP image up to 5 MB.`;
        error.className = 'status error';
        listElement.append(error);
        continue;
      }

      const card = document.createElement('div');
      card.className = 'attachment';

      const image = document.createElement('img');
      image.src = URL.createObjectURL(file);
      image.alt = 'Local evidence preview';
      attachmentObjectUrls.push(image.src);

      const label = document.createElement('span');
      label.textContent = `${file.name} (${Math.ceil(file.size / 1024)} KB)`;

      card.append(image, label);
      listElement.append(card);
    }

    if (attachments.files.length > 3) {
      const status = $('#report-status');
      if (status) {
        status.textContent = 'Only the first three attachments are previewed.';
      }
    }
  });
}

// --------------------------------------------------
// Shared UI helpers
// --------------------------------------------------

function list(element, values, fallback) {
  if (!element) return;

  const safeValues = Array.isArray(values)
    ? values
        .map((value) => {
          if (typeof value === 'string') return value;
          if (value == null) return '';
          if (typeof value === 'object') {
            return value.claim || value.evidence_id || value.title || '';
          }
          return String(value);
        })
        .filter(Boolean)
    : [];

  const items = safeValues.length ? safeValues : [fallback];

  element.replaceChildren(
    ...items.map((value) => {
      const li = document.createElement('li');
      li.textContent = value;
      return li;
    })
  );
}

function action(title, text) {
  const element = document.createElement('article');
  element.className = 'action';

  const heading = document.createElement('b');
  heading.textContent = title;

  const description = document.createElement('span');
  description.textContent = text;

  element.append(heading, description);
  return element;
}

function getErrorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

async function postJson(url, payload) {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  const responseText = await response.text();
  let data;

  try {
    data = responseText ? JSON.parse(responseText) : null;
  } catch {
    throw new Error(`Invalid JSON response (HTTP ${response.status}).`);
  }

  if (!response.ok) {
    const message = data?.message || data?.error || data?.detail;
    throw new Error(
      message ? String(message) : `Request failed (HTTP ${response.status}).`
    );
  }

  if (data == null) {
    throw new Error('The server returned an empty response.');
  }

  return data;
}

// --------------------------------------------------
// Report result rendering
// --------------------------------------------------

function renderResult(output) {
  output = Array.isArray(output) ? output[0] : output;

  if (!output || typeof output !== 'object') {
    throw new Error('Unexpected report workflow response.');
  }

  const state = output.case_state ?? output.state ?? {};
  const message = output.last_message ?? output.message ?? {};
  const verification = state.verification ?? {};

  const assessment = state.final_alert?.public_message
    ? 'Public safety alert ready'
    : state.verification_status === 'APPROVED' ||
        verification.status === 'APPROVED'
      ? 'Likely scam pattern identified'
      : message.recommended_action === 'REQUEST_MORE_USER_EVIDENCE'
        ? 'More information is needed'
        : 'Report assessed';

  const resultTitle = $('#result-title');
  const resultSummary = $('#result-summary');
  const resultAssessment = $('#result-assessment');
  const resultConfidence = $('#result-confidence');

  if (resultTitle) resultTitle.textContent = assessment;

  if (resultSummary) {
    resultSummary.textContent =
      state.final_alert?.public_message ||
      message.rationale ||
      'The workflow completed with the information provided.';
  }

  if (resultAssessment) {
    resultAssessment.textContent = String(
      output.next_stage ?? message.recommended_action ?? 'completed'
    ).replaceAll('_', ' ');
  }

  if (resultConfidence) {
    const confidence = Number(message.confidence);

    resultConfidence.textContent =
      message.confidence != null &&
      Number.isFinite(confidence) &&
      confidence >= 0 &&
      confidence <= 1
        ? `${Math.round(confidence * 100)}%`
        : 'Not available';
  }

  const warningSigns = Array.isArray(state.analysis?.warning_signs)
    ? state.analysis.warning_signs
    : [];

  const indicators = Array.isArray(state.indicators)
    ? state.indicators
    : [];

  const findings = Array.isArray(message.findings)
    ? message.findings
    : typeof message.findings === 'string'
      ? [message.findings]
      : [];

  list(
    $('#result-findings'),
    [...new Set([...warningSigns, ...indicators, ...findings])],
    'No specific warning signs were returned.'
  );

  const evidence = Array.isArray(state.evidence) ? state.evidence : [];

  list(
    $('#result-evidence'),
    evidence.map((item) => item.claim || item.evidence_id),
    'No text evidence was processed.'
  );

  const resultBody = $('#result-body');
  if (resultBody) resultBody.hidden = false;

  const alertState = $('#alert-state');

  if (alertState) {
    alertState.textContent =
      output.next_stage === 'PUBLISHED'
        ? 'The workflow reports that an approved safety alert was published.'
        : 'No public alert is confirmed as published by this response.';
  }

  const actions = $('#action-list');

  if (actions) {
    actions.replaceChildren();

    const situation = lastReport?.situation || '';

    if (/money transferred|transaction pending/i.test(situation)) {
      actions.append(
        action(
          'Urgent: contact your bank or payment provider',
          'Use its official app, website, or card statement contact details. Ask for a fraud complaint reference and available account-security measures. For financial cyber fraud in India, call 1930 promptly.'
        )
      );
    }

    actions.append(
      action(
        'Preserve your evidence',
        'Keep original messages, screenshots, URLs, payment references, dates, and complaint acknowledgement numbers.'
      )
    );

    actions.append(
      action(
        'Report through official channels',
        'For India, use cybercrime.gov.in. Do not rely on links sent by the suspected scammer.'
      )
    );

    if (/credentials shared|account compromised/i.test(situation)) {
      actions.append(
        action(
          'Secure affected accounts',
          'Change passwords through the official service, enable multi-factor authentication, and review recent account sessions.'
        )
      );
    }
  }

  const actionCenter = $('#action-center');
  if (actionCenter) actionCenter.hidden = false;

  showPage('results');
}

// --------------------------------------------------
// Submit a scam report
// --------------------------------------------------

const reportForm = $('#report-form');

if (reportForm) {
  reportForm.addEventListener('submit', async (event) => {
    event.preventDefault();

    const form = event.currentTarget;
    const status = $('#report-status');
    const button = form.querySelector('button[type="submit"]');

    const data = Object.fromEntries(new FormData(form).entries());
    lastReport = data;

    if (status) {
      status.textContent = 'Analysis is running. This may take a few minutes…';
      status.className = 'status';
    }

    if (button) button.disabled = true;

    try {
      const output = await postJson('/webhook/scam-report-test', data);
      renderResult(output);

      if (status) {
        status.textContent = 'Analysis completed.';
        status.className = 'status success';
      }
    } catch (error) {
      if (status) {
        status.textContent =
          `Could not analyse this report: ${getErrorMessage(error)}`;
        status.className = 'status error';
      }
    } finally {
      if (button) button.disabled = false;
    }
  });
}

// --------------------------------------------------
// Normalize search response
// --------------------------------------------------

function normalizeSearchSources(output) {
  if (Array.isArray(output)) {
    return output.flatMap((item) => normalizeSearchSources(item));
  }

  if (!output || typeof output !== 'object') return [];

  // The verified live workflow returns search_decision.sources.
  const possibleSources = [
    output.search_decision?.sources,
    output.case_patch?.sources,
    output.state?.sources,
    output.case_state?.sources,
    output.sources,
    output.candidates
  ];

  let sources = possibleSources.find(Array.isArray) ?? [];

  // Only display records that have a valid article URL.
  sources = sources.filter(
    (source) =>
      source &&
      typeof source === 'object' &&
      typeof source.url === 'string' &&
      /^https?:\/\//i.test(source.url)
  );

  // Some workflow versions wrap their response in "data".
  if (!sources.length && output.data && typeof output.data === 'object') {
    return normalizeSearchSources(output.data);
  }

  // Remove duplicate article URLs.
  const seen = new Set();

  return sources.filter((source) => {
    if (seen.has(source.url)) return false;
    seen.add(source.url);
    return true;
  });
}

// --------------------------------------------------
// Scam Search
// --------------------------------------------------

const searchForm = $('#search-form');

if (searchForm) {
  searchForm.addEventListener('submit', async (event) => {
    event.preventDefault();

    const form = event.currentTarget;
    const button =
      form.querySelector('button[type="submit"]') ||
      form.querySelector('button');

    const status = $('#search-status');
    const results = $('#search-results');

    const query = String(
      new FormData(form).get('query') || ''
    ).trim();

    if (!query) {
      if (status) {
        status.textContent = 'Enter a scam topic to search.';
        status.className = 'status error';
      }
      return;
    }

    if (status) {
      status.textContent = 'Searching Google News RSS…';
      status.className = 'status';
    }

    if (results) results.replaceChildren();
    if (button) button.disabled = true;

    try {
      const output = await postJson('/webhook/scam-search', { query });

      // FIX: use the actual search_decision.sources response first.
      const sources = normalizeSearchSources(output);

      if (!sources.length) {
        if (status) {
          status.textContent =
            'The search completed, but no article URLs were returned. Check the workflow execution output.';
          status.className = 'status';
        }
        return;
      }

      if (status) {
        status.textContent =
          `${sources.length} source${sources.length === 1 ? '' : 's'} found.`;
        status.className = 'status success';
      }

      sources.forEach((source) => {
        const card = document.createElement('article');
        card.className = 'panel';

        const title = document.createElement('h2');
        title.textContent =
          source.title ||
          source.claim ||
          source.content ||
          'Reported scam coverage';

        const note = document.createElement('p');
        note.textContent =
          'This is a news search result, not independent confirmation that a particular person or business committed fraud. Verify the details from the original reporting.';

        const link = document.createElement('a');
        link.href = source.url;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        link.textContent = 'Read original article ↗';

        card.append(title, note, link);

        if (results) results.append(card);
      });
    } catch (error) {
      if (status) {
        status.textContent =
          `Could not search current reporting: ${getErrorMessage(error)}`;
        status.className = 'status error';
      }
    } finally {
      if (button) button.disabled = false;
    }
  });
}

// --------------------------------------------------
// Copy complaint draft
// --------------------------------------------------

const copyComplaintButton = $('#copy-complaint');

if (copyComplaintButton) {
  copyComplaintButton.addEventListener('click', async () => {
    if (!lastReport) {
      const status = $('#report-status');

      if (status) {
        status.textContent =
          'Submit a report first to create a complaint draft.';
        status.className = 'status error';
      }
      return;
    }

    const draft = [
      'Subject: Request for assistance regarding suspected scam',
      '',
      'I am reporting a suspected scam.',
      '',
      `What happened: ${lastReport.narrative || '[not provided]'}`,
      `Contact method: ${lastReport.contact_method || '[not provided]'}`,
      `Amount involved: ${lastReport.amount || '[not provided]'}`,
      `Sender or identifier: ${lastReport.sender || '[not provided]'}`,
      `Actions already taken: ${lastReport.actions_taken || '[not provided]'}`,
      '',
      'Please advise me on appropriate next steps and provide a complaint reference number.'
    ].join('\n');

    try {
      await navigator.clipboard.writeText(draft);
      copyComplaintButton.textContent = 'Complaint draft copied';
    } catch {
      const status = $('#report-status');

      if (status) {
        status.textContent =
          'Could not copy automatically. Check browser clipboard permissions.';
        status.className = 'status error';
      }
    }
  });
}
