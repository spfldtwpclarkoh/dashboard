const HTML_ENTITIES = Object.freeze({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;'
});

export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => HTML_ENTITIES[character]);
}

export function safeHttpsUrl(value, allowedHosts = []) {
  if (typeof value !== 'string' || !value.trim()) return '';
  try {
    const url = new URL(value.trim());
    if (url.protocol !== 'https:') return '';
    if (allowedHosts.length && !allowedHosts.some((host) => url.hostname === host || url.hostname.endsWith(`.${host}`))) {
      return '';
    }
    return url.href;
  } catch {
    return '';
  }
}

export function extractIframeUrl(value) {
  if (typeof value !== 'string') return '';
  const directUrl = safeHttpsUrl(value);
  if (directUrl) return directUrl;
  const match = value.match(/\bsrc\s*=\s*["']([^"']+)["']/i);
  return match ? safeHttpsUrl(match[1]) : '';
}

export function safeIframeMarkup(value, title = 'Dashboard slide') {
  const sourceUrl = extractIframeUrl(value);
  if (!sourceUrl) return '';
  return `<iframe title="${escapeHtml(title)}" src="${escapeHtml(sourceUrl)}" frameborder="0" class="w-full h-full" sandbox="allow-scripts allow-same-origin allow-presentation" allow="autoplay; fullscreen" referrerpolicy="no-referrer"></iframe>`;
}

export function finiteNumber(value, fallback = 0, minimum = Number.NEGATIVE_INFINITY, maximum = Number.POSITIVE_INFINITY) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(Math.max(number, minimum), maximum);
}

export function timestampMilliseconds(value) {
  if (!value) return Number.NaN;
  if (typeof value.toMillis === 'function') return value.toMillis();
  if (typeof value.toDate === 'function') return value.toDate().getTime();
  return new Date(value).getTime();
}

export function isFreshEvent(value, maximumAgeMs, now = Date.now()) {
  const timestamp = timestampMilliseconds(value);
  return Number.isFinite(timestamp) && timestamp <= now + 60_000 && now - timestamp <= maximumAgeMs;
}

