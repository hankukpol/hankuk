// Validate measurements captured from the rendered roster, not inferred CSS.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const samples = JSON.parse(readFileSync(process.argv[2], 'utf8'))
const close = (a, b, message) => assert.ok(Math.abs(a - b) <= 1, `${message}: ${a} vs ${b}`)
const overlaps = (a, b) => a.left < b.right - 1 && a.right > b.left + 1 && a.top < b.bottom - 1 && a.bottom > b.top + 1
for (const sample of samples) {
  const { viewport, pageWidth, toolbar, search, stats, filters, buttons } = sample
  assert.ok(pageWidth <= viewport, `${viewport}: page overflow`)
  close(search.left, toolbar.left, `${viewport}: search left edge`)
  close(filters.right, toolbar.right, `${viewport}: filters right edge`)
  for (const box of [search, stats, filters]) {
    assert.ok(box.left >= toolbar.left - 1 && box.right <= toolbar.right + 1, `${viewport}: control escapes toolbar`)
  }
  assert.ok(!overlaps(search, stats) && !overlaps(search, filters) && !overlaps(stats, filters), `${viewport}: controls overlap`)
  if (viewport >= 1600) {
    assert.ok(search.width <= 321, 'Desktop search must be compact')
    close(stats.left - search.right, 12, 'Summary immediately follows search')
    close((search.top + search.bottom) / 2, (stats.top + stats.bottom) / 2, 'Search and summary align vertically')
    close(search.top, filters.top, 'Desktop controls share one row')
  }
  if (viewport < 768) {
    assert.deepEqual(sample.selectOptions, ['all', 'active', 'refunded', 'cancelled', 'suspended'], `${viewport}: mobile select retains all five lifecycle states`)
    assert.equal(buttons.length, 0, `${viewport}: desktop filters do not take mobile space`)
    assert.ok(filters.height >= 44, `${viewport}: mobile select touch target`)
  } else assert.equal(buttons.length, 5, `${viewport}: all five filters remain available`)
  for (const button of buttons) {
    close(button.width, 128, `${viewport}: uniform button width`)
    assert.ok(button.height >= 44 && !button.textOverflow, `${viewport}: button target or label clipped`)
    assert.ok(button.left >= filters.left - 1 && button.right <= filters.right + 1, `${viewport}: button outside group`)
  }
}
for (const width of [390, 768, 1280, 1760]) {
  assert.ok(samples.some(sample => sample.viewport === width), `Missing real-browser coverage at ${width}px`)
}
console.log(`PASS: roster alignment, wrapping and five accessible states at ${samples.length} real-browser sizes`)
