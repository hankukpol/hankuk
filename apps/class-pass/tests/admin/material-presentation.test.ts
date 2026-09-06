import { strict as assert } from 'node:assert'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

const css = readFileSync(new URL('../../src/app/(admin)/admin.css', import.meta.url), 'utf8')

test('material typography uses the shared admin roles instead of page-specific sizes', () => {
  for (const [role, size] of [['title', 20], ['section', 16], ['body', 15], ['caption', 13]]) {
    assert.match(css, new RegExp(`--admin-type-${role}:\\s*${size}px`))
  }
  for (const [selector, role] of [['label', 'caption'], ['help', 'caption'], ['control', 'body'], ['name', 'body'], ['status', 'caption']]) {
    assert.match(css, new RegExp(`\\.admin-material-${selector}\\s*\\{[^}]*font-size:\\s*var\\(--admin-type-${role}\\)`))
  }
  assert.match(css, /\.admin-material-status\s*\{[^}]*color:\s*var\(--admin-text-muted\)/)
})

test('material summaries and long previews retain bounded responsive geometry', () => {
  assert.match(css, /\.admin-material-summary\s*\{\s*grid-template-columns:\s*repeat\(3, minmax\(0, 1fr\)\)/)
  assert.match(css, /@media\s*\(max-width:\s*767px\)\s*\{\s*\.admin-shell \.admin-material-control\s*\{\s*font-size:\s*var\(--admin-type-section\)/)
  assert.match(css, /--admin-material-preview-height:\s*240px/)
  assert.match(css, /\.admin-material-preview\s*\{[^}]*max-height:\s*var\(--admin-material-preview-height\)[^}]*overflow:\s*auto/)
})
