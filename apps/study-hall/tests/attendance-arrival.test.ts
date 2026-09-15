import assert from "node:assert/strict";
import test from "node:test";
import { classifyAttendanceArrival } from "../lib/attendance-arrival";
const base={date:"2026-09-14",arrivalTime:"09:10",periodStartTime:"09:00",periodEndTime:"10:30",lateArrivalPolicy:"threshold" as const,tardyMinutes:10};
const now=new Date("2026-09-14T20:00:00+09:00");
test("the same real arrival has different outcomes for different academy thresholds",()=>{
  assert.equal(classifyAttendanceArrival(base,now).status,"TARDY");
  assert.equal(classifyAttendanceArrival({...base,tardyMinutes:20},now).status,"PRESENT");
  assert.equal(classifyAttendanceArrival({...base,arrivalTime:"09:09"},now).status,"PRESENT");
  assert.equal(classifyAttendanceArrival({...base,arrivalTime:"09:00",tardyMinutes:0},now).status,"PRESENT");
  assert.equal(classifyAttendanceArrival({...base,arrivalTime:"09:01",lateArrivalPolicy:"after_start"},now).status,"TARDY");
});
test("stored check-in uses actual arrival regardless of saving time; future and invalid dates fail",()=>{
  assert.equal(classifyAttendanceArrival(base,now).checkInTime.toISOString(),"2026-09-14T00:10:00.000Z");
  assert.throws(()=>classifyAttendanceArrival({...base,arrivalTime:"24:10"},now),/시각/);
  assert.throws(()=>classifyAttendanceArrival({...base,date:"2026-02-30"},now));
  assert.throws(()=>classifyAttendanceArrival(base,new Date("2026-09-14T09:00:00+09:00")),/미래/);
});
