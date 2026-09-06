import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'

const evidenceRoot = process.argv[2]
const read = (name) => JSON.parse(readFileSync(path.join(evidenceRoot, name), 'utf8'))
const dashboard = read('dashboard-shape.json')
assert.equal(dashboard.gap, '16px')
assert.equal(dashboard.metrics.length, 4)
for (const metric of dashboard.metrics) {
  assert.equal(metric.radius, '8px')
  assert.equal(metric.border, '1px')
}
for (let index = 1; index < dashboard.metrics.length; index += 1) {
  assert.ok(dashboard.metrics[index].left - dashboard.metrics[index - 1].right >= 16)
}
for (const panel of dashboard.panels) {
  assert.equal(panel.radius, '8px')
  assert.equal(panel.overflow, 'hidden')
}
assert.ok(dashboard.rows.length > 0)
assert.ok(dashboard.rows.every((radius) => radius === '0px'))
const drawer = read('drawer-shape.json')
assert.equal(drawer.radius, '0px')
assert.ok(drawer.width <= drawer.viewport)
assert.ok(drawer.fields.length > 0 && drawer.fields.every((radius) => radius === '8px'))
const flatPages = read('flat-pages.json')
assert.ok(flatPages.length > 0)
for (const page of flatPages) {
  assert.ok(page.sections.length > 0)
  for (const section of page.sections) {
    assert.equal(section.radius, '0px')
    assert.equal(section.border, '0px')
    assert.equal(section.paddingLeft, '0px')
  }
}
console.log('PASS: separated dashboard cards, straight inner dividers, square slide-in drawer, flat tab pages')
