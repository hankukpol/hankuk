import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

// Verify actual browser layout; DOM-only test runtimes cannot calculate alignment.
const observations = JSON.parse(readFileSync(process.argv[2], 'utf8'))
assert.ok(observations.length > 0, 'browser observations required')
let cells = 0
let searches = 0
let controls = 0
const expectedAlignment = (cell) => {
  if (cell.tag === 'TH') return 'center'
  if (cell.span === 1 && /^(강좌|강좌명)$/.test(cell.header)) return 'left'
  if (cell.span === 1 && (/^(강좌 금액|금액|총액|순액|환불|수납액|환불액|결제액|결제 금액|결제|수납|순매출)$/.test(cell.header)
    || /^-?[\d,]+원$/.test(cell.text))) return 'right'
  // Mixed summary/integrity cells have explicit semantics instead of one header.
  if (cell.semantic === 'course') return 'left'
  if (cell.semantic === 'amount') return 'right'
  return 'center'
}
for (const observation of observations) {
  assert.ok(observation.pageWidth <= observation.viewport, `${observation.route}: page overflow`)
  for (const table of observation.tables) {
    for (const cell of table.cells) {
      cells += 1
      const expected = expectedAlignment(cell)
      assert.equal(cell.align, expected, `${observation.route}: ${cell.header} ${cell.text}: expected ${expected}`)
      assert.equal(cell.vertical, 'middle', `${cell.text}: not vertically centered`)
      for (const wrapper of cell.wrappers ?? []) {
        const position = expected === 'left' ? 'flex-start' : expected === 'right' ? 'flex-end' : 'center'
        assert.equal(wrapper.direction.startsWith('column') ? wrapper.align : wrapper.justify,
          position, `${cell.text}: nested content does not follow ${expected} alignment`)
      }
    }
  }
  for (const search of observation.searches ?? []) {
    searches += 1
    assert.ok(Math.abs(search.left - search.tableLeft) <= 1.5,
      `${observation.route}: ${search.label}: search/table left edges differ by ${search.left - search.tableLeft}px`)
  }
  for (const control of observation.controls ?? []) {
    controls += 1
    assert.equal(control.radius, control.square ? '0px' : '8px',
      `${observation.route}: ${control.text}: wrong radius`)
  }
}
assert.ok(cells > 0, 'no real visible table cells measured')
assert.ok(searches > 0, 'no search/table pairs measured')
assert.ok(controls > 0, 'no control/tab radii measured')
console.log(`PASS: ${cells} cells follow semantic alignment; ${searches} search edges match tables; ${controls} controls/tabs have correct radii`)
