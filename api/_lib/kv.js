// ─────────────────────────────────────────────────────────────────────
// Upstash KV helpers — REST API, no @vercel/kv import (deliberately).
// Pattern ported from PULSE (api/team-check.js).
// Supports both Vercel-KV and direct Upstash env-var names.
// ─────────────────────────────────────────────────────────────────────

export function kvCreds() {
  return {
    url:   process.env.KV_REST_API_URL   || process.env.UPSTASH_REDIS_REST_URL,
    token: process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN,
  };
}

export function hasKV() {
  const { url, token } = kvCreds();
  return !!(url && token);
}

export async function kvGet(key) {
  const { url, token } = kvCreds();
  if (!url || !token) return null;
  try {
    const r = await fetch(`${url}/get/${encodeURIComponent(key)}`, {
      headers: { Authorization: `Bearer ${token}` },
      signal:  AbortSignal.timeout(5000),
    });
    if (!r.ok) return null;
    const data = await r.json();
    if (!data || data.result == null) return null;
    try { return JSON.parse(data.result); } catch { return null; }
  } catch { return null; }
}

export async function kvSet(key, value, ttlSec) {
  const { url, token } = kvCreds();
  if (!url || !token) return false;
  try {
    // Pipeline form — avoids body=[value] ambiguity that would store an array literal.
    const cmd = ttlSec
      ? ['SET', key, JSON.stringify(value), 'EX', String(ttlSec)]
      : ['SET', key, JSON.stringify(value)];
    const r = await fetch(`${url}/`, {
      method:  'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body:    JSON.stringify(cmd),
      signal:  AbortSignal.timeout(5000),
    });
    return r.ok;
  } catch { return false; }
}

export async function kvDel(key) {
  const { url, token } = kvCreds();
  if (!url || !token) return false;
  try {
    const r = await fetch(`${url}/del/${encodeURIComponent(key)}`, {
      method:  'POST',
      headers: { Authorization: `Bearer ${token}` },
      signal:  AbortSignal.timeout(5000),
    });
    return r.ok;
  } catch { return false; }
}

export async function kvKeys(pattern) {
  const { url, token } = kvCreds();
  if (!url || !token) return [];
  try {
    const r = await fetch(`${url}/keys/${encodeURIComponent(pattern)}`, {
      headers: { Authorization: `Bearer ${token}` },
      signal:  AbortSignal.timeout(5000),
    });
    if (!r.ok) return [];
    const data = await r.json();
    return Array.isArray(data.result) ? data.result : [];
  } catch { return []; }
}

export async function kvMGet(keys) {
  const { url, token } = kvCreds();
  if (!url || !token || keys.length === 0) return [];
  try {
    const r = await fetch(`${url}/`, {
      method:  'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body:    JSON.stringify(['MGET', ...keys]),
      signal:  AbortSignal.timeout(5000),
    });
    if (!r.ok) return [];
    const data = await r.json();
    if (!Array.isArray(data.result)) return [];
    return data.result.map(s => {
      if (s == null) return null;
      try { return JSON.parse(s); } catch { return null; }
    });
  } catch { return []; }
}
