import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import { createAcademyPolicyDraft } from "../../lib/academy-policy-settings";
const require=createRequire(import.meta.url);
test("optional enrollment submits the selected second period and weekday, including a past start",async()=>{
 const {JSDOM}=require("jsdom"),React=require("react"),dom=new JSDOM("<div id='root'></div>",{url:"http://localhost/"});
 dom.window.matchMedia=()=>({matches:true,addEventListener(){},removeEventListener(){}});
 let sent:any=null;
 const values={window:dom.window,document:dom.window.document,navigator:dom.window.navigator,HTMLElement:dom.window.HTMLElement,Element:dom.window.Element,React,IS_REACT_ACT_ENVIRONMENT:true,fetch:async(_url:string,init:RequestInit)=>{sent=JSON.parse(String(init.body));return new Response("{}");}};
 const old=new Map(Object.keys(values).map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));
 for(const [k,v]of Object.entries(values))Object.defineProperty(globalThis,k,{value:v,configurable:true,writable:true});
 const {createRoot}=require("react-dom/client"),{Simulate}=require("react-dom/test-utils"),{AppRouterContext}=require("next/dist/shared/lib/app-router-context.shared-runtime");
 const {OptionalStudyEnrollment}=await import("../../components/periods/OptionalStudyEnrollment");
 const policy={...createAcademyPolicyDraft("2026-01-01",[]),enabled:true,controlledPeriods:[{periodId:"p1",weekdays:[1,2],optional:true},{periodId:"p2",weekdays:[3,5],optional:true}],optionalEnrollments:[]};
 const root=createRoot(document.getElementById("root"));
 const change=async(selector:string,value:string)=>React.act(async()=>{const e=document.querySelector(selector) as HTMLInputElement;e.value=value;Simulate.change(e);});
 try{
 await React.act(async()=>root.render(React.createElement(AppRouterContext.Provider,{value:{refresh(){}}},React.createElement(OptionalStudyEnrollment,{divisionSlug:"police",policy,students:[{id:"s",name:"검증",studentNumber:"1"}],periods:[{id:"p1",name:"오전"},{id:"p2",name:"야간"}]}))));
 assert.equal(document.querySelector<HTMLButtonElement>('button')!.disabled,true);
 await change('select',"s");await change('[aria-label="선택자습 교시"]',"p2");
 assert.equal(document.querySelector<HTMLInputElement>('[aria-label="선택자습 월요일"]')!.disabled,true);
 await React.act(async()=>{const e=document.querySelector<HTMLInputElement>('[aria-label="선택자습 금요일"]')!;e.checked=true;Simulate.change(e);});
 await change('input[type="date"]',"2026-01-01");
 assert.equal(document.querySelector<HTMLButtonElement>('button')!.disabled,false,document.body.textContent??'');
 await React.act(async()=>Simulate.submit(document.querySelector('form')));
 assert.equal(sent.enrollment.periodId,"p2");assert.deepEqual(sent.enrollment.weekdays,[5]);assert.equal(sent.enrollment.dateFrom,"2026-01-01");
 }finally{await React.act(async()=>root.unmount());dom.window.close();for(const [k,d]of Array.from(old)){if(d)Object.defineProperty(globalThis,k,d);else Reflect.deleteProperty(globalThis,k);}}
});
