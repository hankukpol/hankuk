import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { createRequire } from 'node:module'
import { act, createElement } from 'react'
import { EnrollmentMemoDialog } from '../../src/app/(admin)/dashboard/courses/[id]/students/EnrollmentMemoDialog'

const require = createRequire(import.meta.url)
const { JSDOM } = require('../_setup/dom.cjs')

test('memo editor preserves draft on failed save and guards duplicate saves and unsaved dismissal', async () => {
  const dom = new JSDOM('<div id="root"></div>',{url:'http://localhost',pretendToBeVisual:true})
  Object.assign(globalThis,{window:dom.window,document:dom.window.document,HTMLElement:dom.window.HTMLElement,Node:dom.window.Node,IS_REACT_ACT_ENVIRONMENT:true})
  const originalFetch=globalThis.fetch
  let writes=0,deletes=0,closeCount=0,resolveSave:(r:Response)=>void=()=>{}
  globalThis.fetch=async (_input,init)=>{
    if(init?.method==='PUT'){writes++;return new Promise(resolve=>{resolveSave=resolve})}
    if(init?.method==='DELETE'){deletes++;return Response.json({memo:null})}
    return Response.json({memo:{enrollment_id:12,body:'기존 메모',revision:1,created_at:'2026-09-01T00:00:00Z',updated_at:'2026-09-01T00:00:00Z'}})
  }
  const {createRoot}=require('react-dom/client') as typeof import('react-dom/client')
  const root=createRoot(document.getElementById('root')!)
  const textButton=(text:string)=>Array.from(document.querySelectorAll('button')).find(b=>b.textContent===text)!
  try {
    await act(async()=>root.render(createElement(EnrollmentMemoDialog,{enrollment:{id:12,course_id:8,name:'검증 학생',exam_number:'T12'},courseName:'검증 강좌',onClose:()=>{closeCount++}})))
    const closeButton=document.querySelector<HTMLButtonElement>('.admin-dialog-close')!
    assert.equal(closeButton.getAttribute('aria-label'),'닫기','icon close control retains an accessible name')
    assert.ok(closeButton.querySelector('svg[aria-hidden="true"]'),'close icon uses the common icon family')
    assert.equal(closeButton.type,'button','closing must never submit the memo form')
    const textarea=document.querySelector('textarea')!
    assert.equal(textarea.value,'기존 메모')
    assert.match(document.querySelector('[role="dialog"]')!.textContent!,/검증 학생.*검증 강좌/)
    await act(async()=>{
      Object.getOwnPropertyDescriptor(dom.window.HTMLTextAreaElement.prototype,'value')!.set!.call(textarea,'수정한 초안')
      textarea.dispatchEvent(new dom.window.Event('input',{bubbles:true}))
    })
    await act(async()=>textButton('닫기').click())
    assert.equal(closeCount,0)
    assert.ok(textButton('계속 작성'))
    await act(async()=>textButton('계속 작성').click())
    const form=document.querySelector('form')!
    await act(async()=>{
      form.dispatchEvent(new dom.window.Event('submit',{bubbles:true,cancelable:true}))
      form.dispatchEvent(new dom.window.Event('submit',{bubbles:true,cancelable:true}))
    })
    assert.equal(writes,1,'synchronous submit guard prevents a duplicate write')
    assert.equal(closeButton.disabled,true,'close control is disabled during a pending save')
    await act(async()=>resolveSave(Response.json({error:'저장 실패'},{status:500})))
    assert.equal(textarea.value,'수정한 초안')
    assert.match(document.querySelector('[role="alert"]')!.textContent!,/저장 실패/)
    await act(async()=>form.dispatchEvent(new dom.window.Event('submit',{bubbles:true,cancelable:true})))
    await act(async()=>resolveSave(Response.json({memo:{enrollment_id:12,body:'수정한 초안',revision:2,created_at:'2026-09-01T00:00:00Z',updated_at:'2026-09-05T07:00:00Z'}})))
    assert.match(document.querySelector('[role="status"]')!.textContent!,/저장/)
    assert.equal(textButton('메모 저장').disabled,true,'unchanged draft cannot be saved repeatedly')
    await act(async()=>textButton('메모 삭제').click())
    assert.equal(deletes,0,'destructive operation requires explicit confirmation')
    await act(async()=>textButton('삭제 취소').click())
    assert.equal(textarea.value,'수정한 초안')
    await act(async()=>textButton('메모 삭제').click())
    await act(async()=>textButton('메모 삭제 확인').click())
    assert.equal(deletes,1)
    assert.equal(textarea.value,'')
    assert.match(document.querySelector('[role="status"]')!.textContent!,/삭제/)
    await act(async()=>textButton('닫기').click())
    assert.equal(closeCount,1)
  } finally {await act(async()=>root.unmount());globalThis.fetch=originalFetch;dom.window.close()}
})
