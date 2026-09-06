// This test commits synthetic fixtures: only a disposable, explicitly named DB
// inside the fixed local Docker container is accepted. No env file/DSN is read.
// CP_PAYMENT_TEST_DATABASE=payment_correction_test_<suffix>
const assert = require('node:assert/strict')
const { spawn } = require('node:child_process')
const { randomUUID } = require('node:crypto')
const { setTimeout: delay } = require('node:timers/promises')
const test = require('node:test')

const database = process.env.CP_PAYMENT_TEST_DATABASE ?? ''
function session() {
  assert.match(database, /^payment_correction_test_[a-z0-9_]+$/, 'disposable payment_correction_test_* database required')
  const child = spawn('docker', ['exec', '-i', 'supabase_db_class-pass', 'psql', '-X', '-q', '-A', '-t',
    '-U', 'postgres', '-d', database, '-v', 'ON_ERROR_STOP=1', '-f', '-'])
  let output = ''; let errors = ''
  child.stdout.on('data', chunk => { output += chunk })
  child.stderr.on('data', chunk => { errors += chunk })
  const done = new Promise((resolve, reject) => {
    child.once('error', reject)
    child.once('close', code => resolve({ code, output, errors }))
  })
  child.stdin.write("set statement_timeout='10s';\n")
  return { child, done, async marker(value) {
    const deadline = Date.now() + 5000
    while (!output.includes(value)) {
      if (child.exitCode !== null || Date.now() >= deadline) throw new Error(`missing ${value}: ${errors}`)
      await delay(25)
    }
  } }
}
async function sql(command) {
  const connection = session(); connection.child.stdin.end(command + '\n')
  const result = await connection.done; assert.equal(result.code, 0, result.errors)
  return result.output.trim()
}

test('two concurrent identical corrections commit one refund, replacement payment and billing change', { timeout: 25000 }, async () => {
  const key = randomUUID()
  const fixture = JSON.parse(await sql(`
    with c as (insert into class_pass.courses(division,name,slug,tuition_amount)
      values('police','정정 동시성 격리','correction-concurrent-${key}',100000) returning id),
    e as (insert into class_pass.enrollments(course_id,name,phone)
      select id,'정정 동시성 격리','01000000009' from c returning id,course_id),
    b as (insert into class_pass.enrollment_billing(enrollment_id,course_id,expected_amount,discount_amount,payable_amount,status)
      select id,course_id,100000,0,100000,'paid' from e),
    p as (insert into class_pass.enrollment_payments(enrollment_id,course_id,amount,method,category)
      select id,course_id,100000,'cash','tuition' from e returning id,enrollment_id,course_id)
    select json_build_object('payment',id,'enrollment',enrollment_id,'course',course_id) from p;`))
  const call = `select class_pass.create_payment_correction_idempotent('police','${key}',${fixture.enrollment},${fixture.course},
    '{"paymentId":${fixture.payment},"amount":20000,"method":"cash"}',
    '{"amount":10000,"method":"cash","category":"tuition"}','match_net',null);`
  const first = session(); const second = session()
  try {
    first.child.stdin.write(`begin; set local role service_role; ${call}\n\\echo FIRST_COMMITTED_IN_TRANSACTION\n`)
    await first.marker('FIRST_COMMITTED_IN_TRANSACTION')
    const app = `correction-wait-${key}`
    second.child.stdin.end(`set application_name='${app}'; begin; set local role service_role; ${call} commit;\n`)
    let waiting = false
    const deadline = Date.now() + 5000
    while (Date.now() < deadline) {
      waiting = await sql(`select count(*) from pg_stat_activity where application_name='${app}' and wait_event_type='Lock';`) === '1'
      if (waiting) break
      await delay(25)
    }
    assert.ok(waiting, 'second request must wait for the first transaction')
    first.child.stdin.end('commit;\n')
    const [a, b] = await Promise.all([first.done, second.done])
    assert.equal(a.code, 0, a.errors); assert.equal(b.code, 0, b.errors)
    assert.deepEqual(JSON.parse(a.output.split('\n').find(line => line.startsWith('{'))), JSON.parse(b.output.trim()))
    const state = JSON.parse(await sql(`select json_build_object(
      'refunds',(select count(*) from class_pass.enrollment_refunds where payment_id=${fixture.payment}),
      'payments',(select count(*) from class_pass.enrollment_payments where enrollment_id=${fixture.enrollment}),
      'events',(select count(*) from class_pass.payment_events where enrollment_id=${fixture.enrollment}),
      'payable',(select payable_amount from class_pass.enrollment_billing where enrollment_id=${fixture.enrollment}),
      'requests',(select count(*) from class_pass.payment_correction_requests where division='police' and request_id='${key}'));`))
    assert.deepEqual(state, { refunds: 1, payments: 2, events: 2, payable: 90000, requests: 1 })
  } finally {
    first.child.stdin.end(); second.child.stdin.end()
    await Promise.allSettled([first.done, second.done])
  }
})
