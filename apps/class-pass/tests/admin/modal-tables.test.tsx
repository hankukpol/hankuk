import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { createRequire } from 'node:module'
import { createElement, act } from 'react'

const require = createRequire(import.meta.url)
const { JSDOM } = require('../_setup/dom.cjs')

/** 모달 하나를 실제 DOM에 붙였다가 정리한다. */
async function renderModal(element: () => any) {
  const dom = new JSDOM('<div id="admin-portal-root"></div><div id="root"></div>', { url: 'http://localhost' })
  // navigator는 Node가 getter로만 노출해 덮어쓸 수 없다. 나머지만 jsdom 것으로 바꾼다.
  Object.assign(globalThis, {
    window: dom.window,
    document: dom.window.document,
    HTMLElement: dom.window.HTMLElement,
    Node: dom.window.Node,
    IS_REACT_ACT_ENVIRONMENT: true,
  })
  const { createRoot } = require('react-dom/client') as typeof import('react-dom/client')
  const root = createRoot(dom.window.document.getElementById('root')!)
  await act(async () => root.render(element()))
  return {
    document: dom.window.document as Document,
    async dispose() {
      await act(async () => root.unmount())
      dom.window.close()
    },
  }
}

test('PIN 발급 결과는 옮겨 적을 수 있는 표로 나온다', async () => {
  const { PinRevealModal } = require('../../src/app/(admin)/dashboard/courses/[id]/students/pin-reveal-modal')
  const copied: string[] = []
  const view = await renderModal(() => createElement(PinRevealModal, {
    reveal: {
      title: 'PIN 발급 결과',
      pins: [
        { name: '검증학생1', phone: '010-1111-2222', pin: '481920' },
        { name: '검증학생2', phone: '010-3333-4444', pin: '735106' },
      ],
    },
    onClose: () => {},
    onCopyPin: (pin: string) => { copied.push(pin) },
  }))

  try {
    const { document } = view
    const headers = Array.from(document.querySelectorAll('thead th')).map((cell) => cell.textContent?.trim())
    assert.deepEqual(headers, ['이름', '연락처', 'PIN', '복사'], '표 머리글이 명단 순서를 그대로 따라야 한다')
    assert.equal(document.querySelectorAll('tbody tr').length, 2, '발급받은 사람 수만큼 행이 나와야 한다')
    assert.equal(document.querySelector('.admin-pin-code')?.textContent, '481920')

    // 카드 목록 시절의 임의 모서리·그림자가 되살아나면 규격에서 다시 벗어난다.
    const panel = document.querySelector('.admin-dialog-panel')!
    assert.doesNotMatch(panel.className, /rounded-2xl|shadow-xl|max-h-\[90vh\]/, '패널은 공통 규격만 쓴다')

    const copyButton = document.querySelector<HTMLButtonElement>('button[aria-label="검증학생2 PIN 복사"]')!
    assert.ok(copyButton, '복사 버튼은 어느 학생 것인지 이름으로 구분되어야 한다')
    await act(async () => copyButton.click())
    assert.deepEqual(copied, ['735106'], '복사는 그 행의 PIN만 넘긴다')
  } finally {
    await view.dispose()
  }
})

test('수납 완료 영수증 번호는 건수만큼 표로 나온다', async () => {
  const { ReceiptNoticeModal } = require('../../src/components/payments/ReceiptNoticeModal')
  const view = await renderModal(() => createElement(ReceiptNoticeModal, {
    receiptNo: '2026-0001, 2026-0002',
    onClose: () => {},
  }))

  try {
    const { document } = view
    const numbers = Array.from(document.querySelectorAll('.admin-receipt-number')).map((cell) => cell.textContent?.trim())
    assert.deepEqual(numbers, ['2026-0001', '2026-0002'], '한 번에 여러 건을 수납하면 번호도 모두 보여야 한다')
    assert.equal(document.querySelector('thead th')?.textContent?.trim(), '영수증 번호')

    const confirm = Array.from(document.querySelectorAll('.admin-dialog-footer button'))
    assert.equal(confirm.length, 1)
    assert.equal(confirm[0].className, 'admin-button admin-button-primary', 'footer 버튼은 공통 규격을 쓴다')
  } finally {
    await view.dispose()
  }
})
