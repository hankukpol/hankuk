import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

// Validate measurements captured from a real browser, not simulated DOM layout.
const samples = JSON.parse(readFileSync(process.argv[2], 'utf8'))
for (const sample of samples) {
  const { label, panel, header, body, footer, close, viewport, height } = sample
  const central = /confirm|discard/.test(label)
  assert.equal(sample.radius, central ? '8px' : '0px', `${label}: surface shape`)
  assert.equal(sample.portal, true, `${label}: administrator portal`)
  assert.equal(sample.overflow, false, `${label}: horizontal overflow`)
  assert.ok(panel.left >= -1 && panel.right <= viewport + 1, `${label}: horizontal bounds`)
  assert.ok(panel.top >= -1 && panel.bottom <= height + 1, `${label}: vertical bounds`)
  if (!central) {
    assert.ok(Math.abs(panel.width - Math.min(760, viewport)) < 1, `${label}: shared drawer width`)
    assert.ok(Math.abs(panel.right - viewport) < 1, `${label}: right anchored`)
    assert.ok(Math.abs(panel.height - height) < 1, `${label}: full viewport height`)
  }
  assert.equal(Math.round(close.width), 44, `${label}: close target width`)
  assert.equal(Math.round(close.height), 44, `${label}: close target height`)
  assert.ok(close.top >= panel.top && close.bottom <= header.bottom, `${label}: close reachable`)
  assert.ok(body.top >= header.bottom - 1, `${label}: body overlaps header`)
  if (footer) {
    assert.ok(body.bottom <= footer.top + 1, `${label}: body overlaps actions`)
    assert.ok(footer.bottom <= panel.bottom + 1, `${label}: footer outside panel`)
    assert.ok(footer.height >= 76, `${label}: action row height`)
  }
}
for (const width of [390, 768, 1280]) {
  assert.ok(samples.some(s => s.viewport === width), `Missing ${width}px browser observation`)
}
assert.ok(samples.some(s => s.height <= 520), 'Missing short viewport coverage')
for (const family of ['series', 'next-round', 'material-edit', 'staff-create', 'popup-create',
  'course-create', 'student-history', 'memo', 'refund', 'correction', 'suspension', 'delete-confirm']) {
  assert.ok(samples.some(s => s.label.startsWith(family)), `Missing ${family} workflow observation`)
}
console.log(`PASS: ${samples.length} browser observations; responsive square drawers, central confirmations, close controls and fixed action rows`)
