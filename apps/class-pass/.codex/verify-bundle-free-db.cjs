const assert = require('node:assert/strict')
const { createClient } = require('@supabase/supabase-js')

// Exactly the isolated DB used by scripts/start-local-preview.ps1. Never use .env.local.
const db = createClient('http://127.0.0.1:54321', process.env.SUPABASE_SERVICE_ROLE_KEY, {
  db: { schema: 'class_pass' }, auth: { persistSession: false, autoRefreshToken: false },
})
const exam = 'QA-FREE-260905-1405'
async function read(query) {
  const { data, error } = await query
  if (error) throw error
  return data
}
async function main() {
  const students = await read(db.from('students').select('id,name,exam_number').eq('exam_number', exam))
  if (process.argv.includes('--before')) {
    assert.equal(students.length, 0)
    console.log('PASS: unique synthetic student is absent before browser submission; local DB 54321')
    return
  }
  assert.equal(students.length, 1)
  assert.equal(students[0].name, '[QA] 전체무료검증')
  const enrollments = await read(db.from('enrollments').select('id,course_id,status').eq('student_id', students[0].id))
  assert.deepEqual(enrollments.map(e => e.course_id).sort((a,b) => a-b), [4,5,8])
  const ids = enrollments.map(e => e.id)
  const bills = await read(db.from('enrollment_billing').select('*').in('enrollment_id', ids))
  const payments = await read(db.from('enrollment_payments').select('id,enrollment_id,amount,method,category,status,memo').in('enrollment_id', ids))
  assert.equal(bills.length, 3)
  assert.equal(payments.length, 3)
  for (const e of enrollments) {
    assert.equal(e.status, 'active')
    const bill = bills.find(b => b.enrollment_id === e.id)
    assert.equal(Number(bill.expected_amount), e.course_id === 5 ? 60000 : 0)
    assert.equal(Number(bill.discount_amount), 0)
    assert.equal(Number(bill.payable_amount), 0)
    assert.equal(bill.tuition_exempt, true)
    assert.equal(bill.tuition_exempt_reason, '로컬 QA 장학생 전체 무료')
    assert.equal(bill.status, 'exempt')
    const payment = payments.filter(p => p.enrollment_id === e.id)
    assert.equal(payment.length, 1)
    assert.equal(Number(payment[0].amount), 0)
    assert.equal(payment[0].method, 'free')
    assert.equal(payment[0].category, 'tuition')
    assert.equal(payment[0].status, 'paid')
  }
  console.log(JSON.stringify({ ok: true, localDb: '127.0.0.1:54321', studentId: students[0].id, enrollments, billing: bills.map(b => ({ enrollmentId:b.enrollment_id,expected:b.expected_amount,payable:b.payable_amount,status:b.status,exempt:b.tuition_exempt })), payments }, null, 2))
  if (process.argv.includes('--cleanup')) {
    // Only the exact synthetic records whose identity, course set and values passed above.
    await read(db.from('enrollment_payments').delete().in('id', payments.map(p => p.id)))
    await read(db.from('enrollments').delete().in('id', ids).eq('student_id', students[0].id))
    await read(db.from('students').delete().eq('id', students[0].id).eq('exam_number', exam))
    assert.equal((await read(db.from('students').select('id').eq('exam_number', exam))).length, 0)
    console.log('PASS: only the verified synthetic student, 3 enrollments and 3 free payment records were cleaned up')
  }
}
main().catch(error => { console.error(error); process.exitCode=1 })
