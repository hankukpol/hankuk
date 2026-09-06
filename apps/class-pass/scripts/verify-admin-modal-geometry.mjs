import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

// Input must be real browser DOM measurements; this does not simulate CSS layout.
const samples = JSON.parse(readFileSync(process.argv[2], 'utf8'))
for (const s of samples) {
  const tag = `${s.name} @ ${s.viewport}x${s.height}`
  assert.equal(s.panel.radius, s.drawer ? '0px' : '8px', `${tag}: outer shape`)
  assert.ok(s.panel.left >= -1 && s.panel.right <= s.viewport + 1 && s.panel.top >= -1 && s.panel.bottom <= s.height + 1, `${tag}: panel outside viewport`)
  const padding = s.viewport < 768 ? '16px' : '24px'
  for (const part of [s.header, s.body, s.footer].filter(Boolean)) {
    assert.equal(part.radius, '0px', `${tag}: internal surface corners`)
    assert.equal(part.paddingLeft, padding, `${tag}: horizontal padding`)
    assert.equal(part.paddingRight, padding, `${tag}: horizontal padding`)
    assert.equal(part.overflowX, false, `${tag}: horizontal overflow`)
  }
  assert.equal(s.close.label, '닫기', `${tag}: accessible close name`)
  assert.equal(Math.round(s.close.width), 44, `${tag}: close width`)
  assert.equal(Math.round(s.close.height), 44, `${tag}: close height`)
  assert.equal(Math.round(s.close.icon.width), 20, `${tag}: close icon`)
  assert.ok(s.close.top >= s.panel.top && s.close.bottom <= s.panel.bottom, `${tag}: close stays reachable`)
  for (const b of s.footerButtons ?? []) {
    assert.ok(b.width >= 79 && b.height >= 43 && !b.overflowX, `${tag}: footer action clipped or undersized`)
    assert.ok(b.left >= s.panel.left && b.right <= s.panel.right && b.bottom <= s.panel.bottom + 1, `${tag}: footer action outside panel`)
  }
}
for (const width of [390,768,1280]) assert.ok(samples.some(s=>s.viewport===width), `Missing ${width}px viewport`)
assert.ok(samples.some(s=>s.drawer), 'Missing drawer coverage')
assert.ok(samples.some(s=>s.name==='학생 메모'), 'Missing memo editor coverage')
assert.ok(new Set(samples.map(s=>s.name)).size >= 4, 'Need memo, drawer and two shared modal families')
console.log(`PASS: ${samples.length} real-browser modal samples; common close controls, spacing, corners and reachable actions`)
