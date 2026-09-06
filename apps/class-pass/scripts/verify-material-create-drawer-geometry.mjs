import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const { drawers, lists } = JSON.parse(readFileSync(process.argv[2], 'utf8'))
for (const sample of drawers) {
  const tag = sample.name
  assert.equal(sample.radius, '0px', `${tag}: square exterior`)
  assert.equal(sample.portal, true, `${tag}: administrator theme portal`)
  assert.equal(sample.bodyOverflow, 0, `${tag}: no horizontal body overflow`)
  assert.equal(sample.documentOverflow, 0, `${tag}: no horizontal page overflow`)
  assert.ok(Math.abs(sample.panel.right - sample.viewport.width) <= 1, `${tag}: anchored to right edge`)
  assert.ok(sample.panel.x >= -1 && sample.panel.width <= 760, `${tag}: bounded width`)
  assert.equal(sample.panel.y, 0, `${tag}: anchored to top`)
  assert.equal(sample.panel.height, sample.viewport.height, `${tag}: viewport height`)
  assert.equal(sample.close.width, 44, `${tag}: close width`)
  assert.equal(sample.close.height, 44, `${tag}: close height`)
  assert.ok(sample.close.right <= sample.panel.right && sample.close.y >= 0, `${tag}: close visible`)
  assert.ok(sample.body.y >= sample.header.bottom - 1, `${tag}: header does not overlap body`)
  assert.ok(sample.body.bottom <= sample.footer.y + 1, `${tag}: footer does not overlap body`)
  assert.ok(Math.abs(sample.footer.bottom - sample.viewport.height) <= 1, `${tag}: footer remains visible`)
  for (const control of sample.controls) {
    assert.ok(control.rect.x >= sample.panel.x && control.rect.right <= sample.panel.right, `${tag}: control width`)
  }
}
for (const sample of lists) {
  assert.equal(sample.overflow, 0, `${sample.name}: page overflow`)
  assert.equal(sample.inlineForms, 0, `${sample.name}: no permanent creation form`)
  assert.equal(sample.list.left, sample.page.left, `${sample.name}: left alignment`)
  assert.equal(sample.list.right, sample.page.right, `${sample.name}: full-width list`)
}
for (const type of ['handout', 'textbook']) {
  for (const width of [390, 768, 1280]) {
    assert.ok(drawers.some(sample => sample.name === `${type}-${width}`), `Missing ${type} drawer @ ${width}`)
    assert.ok(lists.some(sample => sample.name === `${type}-${width}`), `Missing ${type} list @ ${width}`)
  }
}
console.log(`PASS: ${drawers.length} creation drawer and ${lists.length} full-width list samples`)
