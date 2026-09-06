import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

// Catches caption-sized primary settings text and undersized native choice targets
// in observations captured from the actual rendered route, not source class names.
const observations = JSON.parse(readFileSync(process.argv[2], 'utf8'))
for (const panel of ['basic', 'features', 'location', 'notices', 'subjects', 'fields', 'danger']) {
  assert(observations.some(row => row.panel === panel), `Missing panel: ${panel}`)
}
for (const row of observations) {
  const context = `${row.width}px ${row.panel}`
  assert.equal(row.overflow, false, `${context}: document overflow`)
  assert.equal(parseFloat(row.heading.font), 16, `${context}: section title`)
  for (const label of row.labels) {
    assert(parseFloat(label.font) >= 15, `${context}: ${label.text} must use body-sized primary label`)
  }
  if (row.intro) assert(parseFloat(row.intro.font) >= 15, `${context}: primary introduction too small`)
  for (const checkbox of row.checkboxes) {
    assert(checkbox.width >= 20 && checkbox.height >= 44, `${context}: checkbox hit target too small`)
  }
  for (const tab of row.tabs) {
    assert.equal(parseFloat(tab.font), 15, `${context}: preserve shared subtab typography`)
    assert(tab.height >= 44, `${context}: subtab hit target`)
  }
}
console.log(`PASS: ${observations.length} live settings panel observations`)
