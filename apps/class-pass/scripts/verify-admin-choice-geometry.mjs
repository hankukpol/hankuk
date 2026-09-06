import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

// Input is DOM geometry captured from the running browser, not simulated CSS layout.
// Removing the shared width, stretching one option, or clipping a label must fail.
const observations = JSON.parse(readFileSync(process.argv[2], 'utf8'))
assert.ok(observations.length > 0, 'real browser observations are required')
for (const observation of observations) {
  assert.ok(observation.groups.length > 0, `${observation.route}: no visible choice groups`)
  for (const group of observation.groups) {
    assert.ok(group.buttons.length >= 2, `${group.name}: expected a choice group`)
    const widths = group.buttons.map(button => button.width)
    const heights = group.buttons.map(button => button.height)
    assert.ok(Math.max(...widths) - Math.min(...widths) < 0.2, `${group.name}: unequal widths ${widths.join(', ')}`)
    assert.ok(Math.max(...heights) - Math.min(...heights) < 0.2, `${group.name}: unequal heights ${heights.join(', ')}`)
    for (const button of group.buttons) {
      assert.ok(button.height >= 44, `${button.text}: touch height below 44px`)
      assert.ok(button.width <= 128.2, `${button.text}: exceeds common 128px width`)
      assert.ok(button.width >= 127.8, `${button.text}: shrunk below common 128px width`)
      assert.ok(button.left >= group.left - 0.2 && button.right <= group.right + 0.2, `${button.text}: outside group`)
      assert.ok(button.scrollWidth <= button.clientWidth + 1, `${button.text}: horizontal text clipping`)
      assert.ok(button.scrollHeight <= button.clientHeight + 1, `${button.text}: vertical text clipping`)
    }
  }
}
for (const name of ['수강생 상태 필터', '출결 명단 필터', '정산 내역 구분', '직렬', '학원구분']) {
  for (const viewport of [390, 768, 1280]) {
    assert.ok(observations.some(observation => observation.viewport === viewport && observation.groups.some(group => group.name === name)), `${name}: missing ${viewport}px browser coverage`)
  }
}
console.log(`PASS: ${observations.length} real browser observations have equal, unclipped choice buttons`)
