// ─────────────────────────────────────────────────────────────────────
// Zendesk API helper — posts public/internal comments on a ticket.
// Env vars: ZENDESK_SUBDOMAIN (e.g. "sportstech"), ZENDESK_TOKEN
//           (created in Zendesk Admin → API → format: f.atzemidis@sportstech.de/token:<token>)
// ─────────────────────────────────────────────────────────────────────

function authHeader() {
  const email = process.env.ZENDESK_EMAIL || 'f.atzemidis@sportstech.de';
  const token = process.env.ZENDESK_TOKEN;
  if (!token) return null;
  const basic = Buffer.from(`${email}/token:${token}`).toString('base64');
  return `Basic ${basic}`;
}

function baseUrl() {
  const sub = process.env.ZENDESK_SUBDOMAIN || 'sportstech';
  return `https://${sub}.zendesk.com/api/v2`;
}

/**
 * Add a comment (public or internal) to an existing ticket.
 * @param {number|string} ticketId
 * @param {string} html       — HTML body of the comment
 * @param {object} opts       — { public: true|false, authorId?: number }
 */
export async function addComment(ticketId, html, opts = {}) {
  const auth = authHeader();
  if (!auth) throw new Error('zendesk_not_configured: ZENDESK_TOKEN missing');

  const payload = {
    ticket: {
      comment: {
        html_body: html,
        public: opts.public !== false,
        ...(opts.authorId ? { author_id: opts.authorId } : {})
      }
    }
  };

  const r = await fetch(`${baseUrl()}/tickets/${encodeURIComponent(ticketId)}.json`, {
    method:  'PUT',
    headers: { Authorization: auth, 'Content-Type': 'application/json' },
    body:    JSON.stringify(payload),
    signal:  AbortSignal.timeout(10000),
  });

  if (!r.ok) {
    const text = await r.text().catch(() => '');
    throw new Error(`zendesk_${r.status}: ${text.slice(0, 200)}`);
  }
  return r.json();
}

/**
 * Add tag(s) to a ticket. Zendesk merges tags additively.
 */
export async function addTags(ticketId, tags) {
  const auth = authHeader();
  if (!auth) throw new Error('zendesk_not_configured');
  const r = await fetch(`${baseUrl()}/tickets/${encodeURIComponent(ticketId)}/tags.json`, {
    method:  'PUT',
    headers: { Authorization: auth, 'Content-Type': 'application/json' },
    body:    JSON.stringify({ tags: Array.isArray(tags) ? tags : [tags] }),
    signal:  AbortSignal.timeout(8000),
  });
  return r.ok;
}
