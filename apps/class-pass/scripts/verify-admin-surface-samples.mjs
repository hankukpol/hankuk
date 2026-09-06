import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const directory = process.argv[2]
const modals = JSON.parse(readFileSync(join(directory, 'modal-measurements.json'), 'utf8'))
const pages = JSON.parse(readFileSync(join(directory, 'page-measurements.json'), 'utf8'))
for (const sample of modals) {
  const tag = `${sample.name} @ ${sample.viewport}`
  assert.equal(sample.panel.radius, sample.drawer ? '0px' : '8px', `${tag}: outer shape`)
  assert.ok(sample.panel.left >= -1 && sample.panel.right <= sample.viewport + 1, `${tag}: horizontal bounds`)
  assert.ok(sample.panel.top >= -1 && sample.panel.bottom <= sample.height + 1, `${tag}: vertical bounds`)
  for (const part of [sample.header, sample.body, sample.footer].filter(Boolean)) {
    assert.equal(part.radius, '0px', `${tag}: internal edge must stay straight`)
    assert.equal(part.overflowX, false, `${tag}: content overflows`)
    for (const key of ['paddingLeft', 'paddingRight']) assert.equal(part[key], sample.viewport < 768 ? '16px' : '24px', `${tag}: shared padding`)
  }
  assert.equal(sample.close.label, '닫기')
  assert.equal(sample.close.width, 44)
  assert.equal(sample.close.height, 44)
  assert.equal(sample.close.icon.width, 20)
  for (const button of sample.footerButtons) {
    assert.ok(button.height >= 44 && button.width >= 80, `${tag}: action target too small`)
    assert.ok(button.left >= sample.panel.left && button.right <= sample.panel.right && button.bottom <= sample.panel.bottom + 1, `${tag}: action clipped`)
    assert.equal(button.overflowX, false)
  }
}
for (const sample of pages) {
  assert.equal(sample.pageOverflow, false, `${sample.name} @ ${sample.viewport}: page overflows`)
  for (const tab of sample.tabs) assert.equal(tab.radius, '0px', `${sample.name}: rounded tab`)
  for (const field of sample.fields) assert.ok(!field.overflow && field.width <= field.parentWidth + 1, `${sample.name}: form control clipped`)
}
for (const width of [390, 768, 1280]) {
  assert.ok(modals.some(s => s.viewport === width), `Missing modal coverage at ${width}`)
  for (const name of ['배부자료', '교재', '학생 인증', '강좌 설정']) assert.ok(pages.some(s => s.viewport === width && s.name === name), `Missing ${name} at ${width}`)
}
assert.ok(modals.some(s => s.name === '학생 상세') && modals.some(s => s.name === '수강종료'), 'Missing reported modal families')
console.log(`PASS: ${modals.length} modal and ${pages.length} page samples, reachable controls and preserved square surfaces`)
