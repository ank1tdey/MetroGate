// Input validation. Everything that comes from a text box, the URL hash or
// localStorage is treated as untrusted and normalised here.
export function cleanQuery(value, max = 40) {
  return String(value ?? '')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

export function fold(value) {
  return cleanQuery(value, 80)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const ID_PATTERN = /^[a-z0-9-]{1,48}$/;
export const isIdShape = (value) => typeof value === 'string' && ID_PATTERN.test(value);

export function safeInt(value, min, max, fallback = min) {
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
}

export function parseHashParams(hash) {
  const out = {};
  const query = String(hash || '').split('?')[1] || '';
  for (const part of query.split('&')) {
    const [k, v] = part.split('=');
    if (k && /^[a-z]{1,12}$/.test(k) && isIdShape(v)) out[k] = v;
  }
  return out;
}
