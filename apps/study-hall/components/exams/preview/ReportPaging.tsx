'use client';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { PreviewItem } from '@/lib/exam-preview/types';
import { ReferenceItemTable } from './ReferenceItemTable';

export type ItemFocusRequest = { id?:string; date:string; page:number; serial:number };

export function PageControls({label,page,pages,total,onChange}:{label:string;page:number;pages:number;total:number;onChange:(page:number)=>void}) {
 return <nav aria-label={`${label} 페이지`} data-report-navigation className="flex flex-wrap items-center justify-end gap-4">
  <span className="admin-help">전체 {total}건 / {page+1} / {pages}페이지</span>
  <button className="admin-button admin-button-compact" type="button" disabled={page===0} onClick={()=>onChange(page-1)}>이전</button>
  <button className="admin-button admin-button-compact" type="button" disabled={page+1>=pages} onClick={()=>onChange(page+1)}>다음</button>
 </nav>;
}

export function PagedRows<T>({rows,label,printing,children}:{rows:T[];label:string;printing:boolean;children:(rows:T[])=>ReactNode}) {
 const [page,setPage]=useState(0);
 const pages=Math.max(1,Math.ceil(rows.length/10)), current=Math.min(page,pages-1);
 return <div className="space-y-2">{children(printing?rows:rows.slice(current*10,current*10+10))}{!printing&&rows.length>10&&<PageControls label={label} page={current} pages={pages} total={rows.length} onChange={setPage}/>}</div>;
}

export function ReferenceItemBrowser({allItems,items,printing,mobile,personal,expanded,toggle,focusRequest}:{
 allItems:PreviewItem[];items:PreviewItem[];printing:boolean;mobile:boolean;personal:boolean;
 expanded:Record<string,boolean>;toggle:(id:string)=>void;focusRequest:ItemFocusRequest|null;
}) {
 const focusedSerial=useRef<number|null>(null);
 const dates=Array.from(new Set(allItems.map(item=>item.date))).sort().reverse();
 const [date,setDate]=useState('all'),[page,setPage]=useState(0);
 const selected=date==='all'?'all':dates.includes(date)?date:dates[0]??'all';
 const matching=items.filter(item=>selected==='all'||item.date===selected);
 const pages=Math.max(1,Math.ceil(matching.length/20)),current=Math.min(page,pages-1);
 useEffect(()=>{if(!focusRequest)return;setDate(focusRequest.date);setPage(focusRequest.page);},[focusRequest]);
 useEffect(()=>{if(!focusRequest||!focusRequest.id||printing||focusedSerial.current===focusRequest.serial)return;const frame=requestAnimationFrame(()=>{const target=document.getElementById(`preview-item-${focusRequest.id}`);if(target){focusedSerial.current=focusRequest.serial;target.scrollIntoView({block:'center'});target.focus();}});return()=>cancelAnimationFrame(frame);},[focusRequest,selected,current,printing]);
 const visible=printing?allItems:matching.slice(current*20,current*20+20);
 return <div className="space-y-4">
  <div data-report-navigation className="flex flex-wrap items-end gap-4"><label className="admin-label">문항 시험일<select aria-label="문항 시험일" value={selected} onChange={e=>{setDate(e.target.value);setPage(0);}}><option value="all">조회 기간 전체</option>{dates.map(value=><option key={value} value={value}>{value}</option>)}</select></label><p className="admin-help">기간 전체 또는 시험일을 선택할 수 있습니다. 인쇄에는 조회 기간의 모든 문항이 포함됩니다.</p></div>
  <p className="admin-help">{printing?`조회 기간 전체 ${allItems.length}문항`:`${selected==='all'?'조회 기간 전체':selected} / 필터 결과 ${matching.length}문항 중 ${visible.length}문항 표시`}</p>
  {visible.length>0&&<ReferenceItemTable items={visible} personal={personal} mobile={mobile} expanded={expanded} toggle={toggle}/>}
  {!printing&&matching.length===0&&<p className="admin-empty-state">{allItems.length?'선택한 조건에 해당하는 문항이 없습니다. 시험일 또는 문항 분류를 바꿔 확인하세요.':'조회 기간에 이 과목의 문항 자료가 없습니다.'}</p>}
  {!printing&&matching.length>20&&<PageControls label="문항 분석" page={current} pages={pages} total={matching.length} onChange={setPage}/>}</div>;
}
