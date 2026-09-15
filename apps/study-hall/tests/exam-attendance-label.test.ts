import test from 'node:test';
import assert from 'node:assert/strict';
import {getPeriodAttendanceLabel} from '../lib/attendance-meta';
test('exam display distinguishes participation without changing saved attendance values',()=>{
 for(const [value,label,expected] of [['PRESENT','출석','응시'],['ABSENT','결석','미응시'],['EXCUSED','사유결석','사유 미응시'],['CLASS','수업','수업']]){
  assert.equal(getPeriodAttendanceLabel(value,label,true),expected);
  assert.equal(getPeriodAttendanceLabel(value,label,false),label);
 }
});
