import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeConfigurationEdits } from '../lib/academy-template';
import { managementPolicySchema } from '../lib/management-policy';

test('historical settings merge handles newly introduced and omitted fields',()=>{
 assert.deepEqual(mergeConfigurationEdits({morningExam:{periodId:'a'}},{morningExam:{periodId:'a',syncAttendance:true}},{morningExam:{periodId:'a'}}),{morningExam:{periodId:'a',syncAttendance:true}});
 assert.equal(mergeConfigurationEdits(undefined,undefined,'preserved'),'preserved');
 assert.equal(mergeConfigurationEdits(true,undefined,true),undefined);
});
test('template policy without personal enrollment records parses as no enrollments',()=>{
 assert.deepEqual(managementPolicySchema.shape.optionalEnrollments.parse(undefined),[]);
 const rows=[{studentId:'student',periodId:'period',dateFrom:'2026-09-14',dateTo:'2026-09-30',weekdays:[1]}];
 assert.deepEqual(managementPolicySchema.shape.optionalEnrollments.parse(rows),rows);
});
