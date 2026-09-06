import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { AdminSectionTabs, AdminSectionPanel, AdminSectionActions } from '../../src/components/admin/AdminSectionTabs'

const items = [{ value: 'basic', label: '기본정보' }, { value: 'danger', label: '위험 작업' }]

function render(active: string) {
  return renderToStaticMarkup(createElement(AdminSectionTabs, { label: '설정', items, defaultValue: active,
    children: [
      createElement(AdminSectionPanel, { key: 'basic', value: 'basic', children: createElement('input', { defaultValue: 'draft' }) }),
      createElement(AdminSectionPanel, { key: 'danger', value: 'danger', children: '삭제 확인' }),
      createElement(AdminSectionActions, { key: 'save', values: ['basic'], children: '강좌 저장' }),
    ] as React.ReactElement[],
  }))
}

test('inactive panels remain in the tree, with one selected and keyboard-reachable tab', () => {
  const markup = render('basic')
  assert.equal((markup.match(/role="tabpanel"/g) ?? []).length, 2)
  assert.equal((markup.match(/aria-selected="true"/g) ?? []).length, 1)
  assert.equal((markup.match(/aria-selected="false" tabindex="-1"/g) ?? []).length, 1)
  assert.match(markup, /hidden="" data-admin-section="danger"/)
  assert.match(markup, /value="draft"/)
  assert.equal((markup.match(/type="button" role="tab"/g) ?? []).length, 2)
  for (const [, target] of markup.matchAll(/aria-controls="([^"]+)"/g)) {
    assert.ok(markup.includes(`id="${target}" role="tabpanel"`))
  }
})

test('independent sections hide the shared save action without removing drafts', () => {
  const markup = render('danger')
  assert.match(markup, /hidden="" data-admin-section="basic"/)
  assert.match(markup, /class="admin-section-actions" hidden=""/)
  assert.match(markup, /value="draft"/)
  assert.ok(markup.includes('삭제 확인'))
})
