// ═════════════════════════════════════════════════════════════════════
//  POST /api/pickup/issue
//
//  Zendesk-Trigger ruft diesen Endpoint auf, wenn ein Agent das Macro
//  "📦 GLS Einmal-Abholung anbieten" anwendet.
//
//  Flow:
//    1. Zendesk-Webhook validieren (shared secret)
//    2. Idempotenz: existiert für dieses Ticket schon ein Token? → re-use
//    3. Neuen Token erzeugen, in KV ablegen (7 Tage TTL)
//    4. Public Reply ins Ticket schreiben (neutraler Service-Ton)
//    5. 200 OK an Zendesk
//
//  Erwartete Request-Body (vom Zendesk-Trigger gesendet):
//    {
//      "ticket_id":       "412938",
//      "requester_name":  "Max Mustermann",
//      "requester_email": "max@example.com",
//      "subject":         "Laufband-Defekt"
//    }
//
//  Header:
//    X-Pickup-Secret: <ZENDESK_WEBHOOK_SECRET>
// ═════════════════════════════════════════════════════════════════════

import { kvGet, kvSet, hasKV } from '../_lib/kv.js';
import { addComment, addTags } from '../_lib/zendesk.js';
import crypto from 'node:crypto';

const TOKEN_TTL_SECONDS  = 7 * 24 * 3600;          // 7 Tage
const TOKEN_TTL_DAYS     = 7;
const BASE_PATH_CUSTOMER = '/abholung';            // URL-Pfad der Kundenseite

export default async function handler(req, res) {
  // ── CORS / Method gate ───────────────────────────────────────────────
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Pickup-Secret');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'method_not_allowed' });
  }

  // ── Secret-Verifikation ──────────────────────────────────────────────
  const expected = process.env.ZENDESK_WEBHOOK_SECRET;
  const supplied = req.headers['x-pickup-secret'] || (req.query && req.query.secret);
  if (!expected) {
    return res.status(503).json({ error: 'webhook_secret_not_configured' });
  }
  if (!supplied || !timingSafeEq(String(supplied), String(expected))) {
    return res.status(401).json({ error: 'unauthorized' });
  }

  // ── KV verfügbar? ────────────────────────────────────────────────────
  if (!hasKV()) {
    return res.status(503).json({ error: 'kv_not_configured' });
  }

  // ── Body parsen ──────────────────────────────────────────────────────
  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { body = {}; }
  }
  body = body || {};

  const ticketId      = String(body.ticket_id || '').trim();
  const requesterName = String(body.requester_name || '').trim();
  const requesterMail = String(body.requester_email || '').trim();
  const subject       = String(body.subject || '').trim();

  if (!ticketId || !requesterMail) {
    return res.status(400).json({ error: 'missing_fields', need: ['ticket_id', 'requester_email'] });
  }

  // ── Idempotenz: Ticket schon mal verarbeitet? ────────────────────────
  const ticketIndexKey = `pickup:ticket:${ticketId}`;
  const existingToken  = await kvGet(ticketIndexKey);
  if (existingToken) {
    const existingRec = await kvGet(`pickup:${existingToken}`);
    if (existingRec) {
      return res.status(200).json({
        ok: true,
        reused: true,
        token: existingToken,
        link:  customerLink(req, existingToken),
        message: 'Ticket hatte bereits einen aktiven Pickup-Link — wiederverwendet.'
      });
    }
  }

  // ── Neuen Token erzeugen ─────────────────────────────────────────────
  const token = generateToken();
  const now   = Date.now();
  const record = {
    status:     'ISSUED',
    customer:   { name: requesterName, email: requesterMail },
    ticket:     `#${ticketId}`,
    ticketId:   Number(ticketId) || ticketId,
    reason:     subject,
    issuedAt:   now,
    expiresAt:  now + TOKEN_TTL_DAYS * 86400_000,
    issuedVia:  'zendesk-macro',
  };

  const okMain = await kvSet(`pickup:${token}`, record, TOKEN_TTL_SECONDS);
  if (!okMain) return res.status(500).json({ error: 'kv_write_failed' });
  await kvSet(ticketIndexKey, token, TOKEN_TTL_SECONDS);

  // ── Zendesk-Antwort an den Kunden senden ─────────────────────────────
  const link = customerLink(req, token);
  const html = renderReplyHtml({ name: requesterName, link, expiresInDays: TOKEN_TTL_DAYS });

  try {
    await addComment(ticketId, html, { public: true });
    // Tag zum Markieren, dass die Auto-Reply gelaufen ist (verhindert Doppel-Auslösung)
    await addTags(ticketId, ['pickup_link_sent']).catch(() => {});
  } catch (err) {
    // KV hat schon den Token — wir geben ihn trotzdem zurück, damit der Agent
    // ihn manuell kopieren kann falls die Zendesk-Antwort fehlgeschlagen ist.
    return res.status(502).json({
      error:   'zendesk_post_failed',
      detail:  String(err && err.message || err).slice(0, 240),
      token,
      link,
      hint:    'Token in KV erstellt. Link manuell ans Ticket anfügen.'
    });
  }

  return res.status(200).json({ ok: true, token, link });
}

// ─────────────────────────────────────────────────────────────────────

function generateToken() {
  // 12 zufällige Bytes → base32-ähnliche kurze Token (~19 Zeichen, URL-safe)
  return crypto.randomBytes(12).toString('base64url').replace(/[-_]/g, '').toUpperCase().slice(0, 16);
}

function customerLink(req, token) {
  const host  = req.headers['x-forwarded-host'] || req.headers.host;
  const proto = req.headers['x-forwarded-proto'] || 'https';
  const base  = `${proto}://${host}`;
  return `${base}${BASE_PATH_CUSTOMER}?t=${encodeURIComponent(token)}`;
}

function timingSafeEq(a, b) {
  if (a.length !== b.length) return false;
  try { return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b)); }
  catch { return false; }
}

function esc(s) {
  return String(s || '').replace(/[&<>"']/g, c => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[c]));
}

// Neutraler, professioneller Service-Ton (Variante A).
// Bewusst klar als automatisierte Service-Nachricht erkennbar.
function renderReplyHtml({ name, link, expiresInDays }) {
  const firstName = (name || '').split(' ')[0];
  const greeting  = firstName ? `Hallo ${esc(firstName)},` : 'Guten Tag,';

  return `
    <p>${greeting}</p>
    <p>vielen Dank für Ihre Nachricht. Wir möchten Ihre Sendung schnellstmöglich
       von Ihnen abholen lassen. Bitte nutzen Sie dafür Ihren persönlichen Abhol-Link:</p>
    <p>
      <a href="${esc(link)}" style="display:inline-block;background:#e3000f;color:#ffffff;text-decoration:none;padding:11px 20px;border-radius:8px;font-weight:600;">
        Abholung jetzt buchen
      </a>
    </p>
    <p style="font-size:13px;color:#555;">
      Oder kopieren Sie diese URL in Ihren Browser:<br>
      <span style="word-break:break-all;">${esc(link)}</span>
    </p>
    <p style="font-size:13px;color:#555;">
      <strong>Bitte beachten Sie:</strong>
    </p>
    <ul style="font-size:13px;color:#555;">
      <li>Der Link ist <strong>persönlich</strong> und nur <strong>einmal nutzbar</strong>.</li>
      <li>Er bleibt <strong>${expiresInDays} Tage</strong> gültig.</li>
      <li>Nach der Buchung können Sie über denselben Link den Status verfolgen.</li>
      <li>Sie müssen <strong>nichts ausdrucken</strong> — das Versandetikett bringt GLS mit.</li>
    </ul>
    <p style="font-size:13px;color:#555;">
      Bei Rückfragen antworten Sie einfach auf diese E-Mail.
    </p>
    <p style="font-size:12px;color:#888;margin-top:24px;">— Sportstech Kundenservice</p>
  `;
}
