import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const observations = JSON.parse(readFileSync(process.argv[2], 'utf8'))
for (const observation of observations) {
  assert.equal(observation.heading, '16px', 'Section title must retain the admin hierarchy')
  assert.equal(observation.rows.length, 15, 'All existing operating controls must remain available')
  assert.equal(observation.overflow, false, 'No document horizontal overflow')
  for (const row of observation.rows) {
    assert.ok(parseFloat(row.font) >= 15, `${row.text}: control label must not use caption typography`)
    assert.ok(row.height >= 44, `${row.text}: full label needs a 44px click target`)
    assert.ok(row.inputWidth >= 20, `${row.text}: native checkbox must remain easy to identify`)
  }
}
console.log(`PASS: ${observations.length} browser observations, readable labels and all 15 controls preserved`)
