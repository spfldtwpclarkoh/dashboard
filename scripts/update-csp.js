const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const pages = ['index.html', 'admin.html'];

for (const page of pages) {
  const filePath = path.join(root, page);
  let html = fs.readFileSync(filePath, 'utf8');
  const scriptMatch = html.match(/<script\s+type="module">([\s\S]*?)<\/script>/i);
  if (!scriptMatch) throw new Error(`${page} does not contain the expected inline module script.`);

  // HTML parsers normalize CRLF to LF before CSP evaluates an inline script.
  const browserNormalizedScript = scriptMatch[1].replace(/\r\n?/g, '\n');
  const hash = crypto.createHash('sha256').update(browserNormalizedScript, 'utf8').digest('base64');
  const scriptPolicy = `script-src 'self' 'sha256-${hash}'`;
  html = html.replace(/script-src 'self'(?: 'sha256-[^']+')?/, scriptPolicy);
  fs.writeFileSync(filePath, html, 'utf8');
  console.log(`Updated CSP hash for ${page}.`);
}
