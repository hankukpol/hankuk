import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

// Accept only measurements collected from the live browser, not a CSS simulation.
const samples = JSON.parse(readFileSync(process.argv[2], 'utf8'))
assert.ok(samples.length > 0, 'No browser measurements')
for (const sample of samples) {
  const tag = `${sample.name} @ ${sample.viewport}`
  assert.ok(sample.cards.length > 0, `${tag}: missing summary items`)
  assert.equal(sample.gap, '16px', `${tag}: summaries must not touch`)
  assert.equal(sample.overflow, false, `${tag}: group clips its content`)
  for (const card of sample.cards) {
    assert.equal(card.radius, '8px', `${tag}: closed rounded summary`)
    assert.ok(card.borders.every(value => value === '1px'), `${tag}: missing border side`)
    assert.equal(card.overflow, false, `${tag}: value clipped`)
    assert.ok(card.left >= sample.left - 1 && card.right <= sample.right + 1, `${tag}: outside group`)
  }
}
console.log(`PASS: ${samples.length} live summary groups have separated, closed boundaries and no clipped values`)
