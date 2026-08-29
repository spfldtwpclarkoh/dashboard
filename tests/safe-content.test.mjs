import test from 'node:test';
import assert from 'node:assert/strict';
import {
  escapeHtml,
  safeHttpsUrl,
  extractIframeUrl,
  safeIframeMarkup,
  finiteNumber,
  isFreshEvent
} from '../src/safe-content.mjs';

test('escapeHtml neutralizes executable markup', () => {
  assert.equal(escapeHtml('<img src=x onerror="alert(1)">'), '&lt;img src=x onerror=&quot;alert(1)&quot;&gt;');
});

test('safeHttpsUrl permits HTTPS and rejects active or insecure schemes', () => {
  assert.equal(safeHttpsUrl('javascript:alert(1)'), '');
  assert.equal(safeHttpsUrl('http://example.com'), '');
  assert.equal(safeHttpsUrl('https://example.com/a'), 'https://example.com/a');
  assert.equal(safeHttpsUrl('https://evil.example/a', ['docs.google.com']), '');
});

test('legacy iframe markup is reduced to a sandboxed HTTPS iframe', () => {
  assert.equal(extractIframeUrl('<iframe src="https://docs.google.com/presentation/d/1"></iframe>'), 'https://docs.google.com/presentation/d/1');
  const markup = safeIframeMarkup('<iframe src="https://example.com/slide"></iframe>', 'Test');
  assert.match(markup, /sandbox=/);
  assert.doesNotMatch(markup, /allowpopups/i);
  assert.equal(safeIframeMarkup('<iframe src="javascript:alert(1)"></iframe>'), '');
});

test('numeric and freshness helpers constrain unsafe values', () => {
  assert.equal(finiteNumber('25', 0, 1, 60), 25);
  assert.equal(finiteNumber('not-a-number', 10, 1, 60), 10);
  assert.equal(finiteNumber(500, 0, 1, 60), 60);
  assert.equal(isFreshEvent(new Date(Date.now() - 1_000).toISOString(), 5_000), true);
  assert.equal(isFreshEvent(new Date(Date.now() - 10_000).toISOString(), 5_000), false);
});

