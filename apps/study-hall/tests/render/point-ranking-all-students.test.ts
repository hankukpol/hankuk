import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {createRequire} from 'node:module';
import {PointGrantManager} from '../../components/points/PointGrantManager';
const require=createRequire(import.meta.url);
const {JSDOM}=require('jsdom');
const {AppRouterContext}=require('next/dist/shared/lib/app-router-context.shared-runtime');
test('all 25 students remain visible for both metrics and sort directions',async()=>{
 const dom=new JSDOM('<div id="root"></div>',{url:'http://localhost'});
 dom.window.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){}});
 const bindings={window:dom.window,document:dom.window.document,HTMLElement:dom.window.HTMLElement,React,IS_REACT_ACT_ENVIRONMENT:true};
 const old=new Map(Object.keys(bindings).map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));
 for(const [k,v] of Object.entries(bindings))Object.defineProperty(globalThis,k,{value:v,configurable:true});
 const {createRoot}=await import('react-dom/client');
 const root=createRoot(dom.window.document.getElementById('root'));
 const click=async(label:string)=>{const button=Array.from(dom.window.document.querySelectorAll('button')).find((b:any)=>b.textContent===label) as any;assert.ok(button,label);await React.act(async()=>button.click());};
 try {
 const students=Array.from({length:25},(_,i)=>({id:`s${i}`,name:`학생${i}`,studentNumber:String(i).padStart(3,'0'),status:'ACTIVE',netPoints:i,meritPoints:i,demeritPoints:24-i}));
 await React.act(async()=>root.render(React.createElement(AppRouterContext.Provider,{value:{}},React.createElement(PointGrantManager,{divisionSlug:'police',students:students as any,rules:[],initialRecords:[],initialDateFrom:'2026-09-01',initialDateTo:'2026-09-15'}))));
 await click('학생별 순위');
 for(const [metric,direction,first] of [['상점 기준','내림차순','학생24'],['상점 기준','오름차순','학생0'],['벌점 기준','내림차순','학생0'],['벌점 기준','오름차순','학생24']]){
  await click(metric);await click(direction);
  const rows=dom.window.document.querySelectorAll('table tbody tr');
  assert.equal(rows.length,25);assert.equal(rows[0].children[1].textContent,first);
  assert.match(dom.window.document.body.textContent,/전체 25명/);
 }
 }finally{await React.act(async()=>root.unmount());dom.window.close();for(const [k,v] of Array.from(old)){if(v)Object.defineProperty(globalThis,k,v);else Reflect.deleteProperty(globalThis,k);}}
});
