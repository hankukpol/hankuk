// Local Docker only: no env/DSN is read and no remote connection is possible.
// Run: node --test tests/payments/financial-write-concurrency.test.cjs
const assert = require('node:assert/strict')
const { spawn } = require('node:child_process')
const { randomUUID } = require('node:crypto')
const { setTimeout: delay } = require('node:timers/promises')
const test = require('node:test')

function session() {
  const child = spawn('docker', ['exec', '-i', 'supabase_db_class-pass',
    'psql', '-X', '-q', '-A', '-t', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-f', '-'])
  let output = ''
  let errors = ''
  child.stdout.on('data', chunk => { output += chunk })
  child.stderr.on('data', chunk => { errors += chunk })
  const done = new Promise((resolve, reject) => {
    child.once('error', reject)
    child.once('close', code => resolve({ code, output, errors }))
  })
  child.stdin.write("\\set VERBOSITY verbose\nset statement_timeout='10s';\n")
  return {
    child, done,
    async marker(value) {
      const deadline = Date.now() + 5000
      while (!output.includes(value)) {
        if (child.exitCode !== null) throw new Error(`connection exited: ${errors}`)
        if (Date.now() > deadline) throw new Error(`missing marker ${value}: ${errors}`)
        await delay(25)
      }
    },
  }
}

async function sql(command) {
  const connection = session()
  connection.child.stdin.end(command + '\n')
  const result = await connection.done
  assert.equal(result.code, 0, result.errors)
  return result.output.trim()
}

async function waitForLock(applicationName) {
  const deadline = Date.now() + 5000
  while (Date.now() < deadline) {
    const waiting = await sql(`select count(*) from pg_stat_activity where application_name='${applicationName}' and wait_event_type='Lock';`)
    if (waiting === '1') return
    await delay(25)
  }
  throw new Error(`connection ${applicationName} did not wait on a database lock`)
}

async function fixture() {
  const slug = `ops-concurrency-${randomUUID()}`
  const ids = JSON.parse(await sql(`
    with c as (insert into class_pass.courses(division,name,slug,tuition_amount)
      values('police','동시성 격리 테스트','${slug}',100000) returning id),
    e as (insert into class_pass.enrollments(course_id,name,phone)
      select id,'동시성 격리 테스트','01000000009' from c returning id,course_id),
    b as (insert into class_pass.enrollment_billing(enrollment_id,course_id,expected_amount,discount_amount,payable_amount,status)
      select id,course_id,100000,0,100000,'unpaid' from e)
    select json_build_object('courseId',course_id,'enrollmentId',id) from e;
  `))
  return { ...ids, slug }
}

async function cleanup(f) {
  // Exact fixture IDs + generated slug; never touch other local/user rows.
  await sql(`begin;
    do $$ begin
      if not exists(select 1 from class_pass.courses where id=${f.courseId} and slug='${f.slug}') then
        raise exception 'cleanup fixture identity mismatch';
      end if;
    end $$;
    delete from class_pass.payment_events where enrollment_id=${f.enrollmentId};
    delete from class_pass.enrollment_refunds where payment_id in (select id from class_pass.enrollment_payments where enrollment_id=${f.enrollmentId});
    delete from class_pass.enrollment_payment_items where payment_id in (select id from class_pass.enrollment_payments where enrollment_id=${f.enrollmentId});
    delete from class_pass.enrollment_payments where enrollment_id=${f.enrollmentId};
    delete from class_pass.enrollment_lifecycle_events where enrollment_id=${f.enrollmentId};
    delete from class_pass.enrollment_billing where enrollment_id=${f.enrollmentId};
    delete from class_pass.enrollments where id=${f.enrollmentId} and course_id=${f.courseId};
    delete from class_pass.courses where id=${f.courseId} and slug='${f.slug}';
    commit;`)
}

async function state(f) {
  return JSON.parse(await sql(`select json_build_object('status',e.status,'billing',b.status,
    'payments',(select count(*) from class_pass.enrollment_payments where enrollment_id=e.id),
    'events',(select count(*) from class_pass.enrollment_lifecycle_events where enrollment_id=e.id))
    from class_pass.enrollments e join class_pass.enrollment_billing b on b.enrollment_id=e.id where e.id=${f.enrollmentId};`))
}

for (const endFirst of [true, false]) {
  test(endFirst ? 'termination wins: waiting INSERT rechecks cancelled status' : 'payment wins: termination waits and then closes billing', { timeout: 30000 }, async () => {
    const f = await fixture()
    const first = session()
    let second
    try {
      const insert = `insert into class_pass.enrollment_payments(enrollment_id,course_id,amount,method,category)
        values(${f.enrollmentId},${f.courseId},100,'cash','textbook');`
      const end = `select class_pass.end_enrollment_atomic('police',${f.enrollmentId},'동시성 테스트',null);`
      const lock = `select id from class_pass.enrollments where id=${f.enrollmentId} for update;`
      first.child.stdin.write(`begin; ${endFirst ? lock : insert}\n\\echo FIRST_LOCKED\n`)
      await first.marker('FIRST_LOCKED')
      const app = `ops-wait-${randomUUID()}`
      second = session()
      second.child.stdin.end(`set application_name='${app}'; begin; ${endFirst ? insert : end} commit;\n`)
      await waitForLock(app)
      first.child.stdin.end(`${endFirst ? end : ''} commit;\n`)
      assert.equal((await first.done).code, 0)
      const result = await second.done
      if (endFirst) {
        assert.notEqual(result.code, 0, 'INSERT incorrectly committed after termination')
        assert.match(result.errors, /CP003/, 'must reject the status, not time out/deadlock')
      } else {
        assert.equal(result.code, 0, result.errors)
      }
      assert.deepEqual(await state(f), { status: 'cancelled', billing: 'closed', payments: endFirst ? 0 : 1, events: 1 })
    } finally {
      first.child.stdin.end()
      second?.child.stdin.end()
      await Promise.all([first.done, second?.done])
      await cleanup(f)
    }
  })
}

test('correction waits for enrollment without holding the payment lock', { timeout: 30000 }, async () => {
  const f = await fixture()
  const first = session()
  let second
  try {
    const paymentId = Number(await sql(`insert into class_pass.enrollment_payments(enrollment_id,course_id,amount,method,category)
      values(${f.enrollmentId},${f.courseId},100000,'cash','tuition') returning id;`))
    assert.ok(Number.isSafeInteger(paymentId) && paymentId > 0)
    first.child.stdin.write(`begin; select id from class_pass.enrollments where id=${f.enrollmentId} for update;\n\\echo FIRST_LOCKED\n`)
    await first.marker('FIRST_LOCKED')
    const app = `ops-correction-${randomUUID()}`
    second = session()
    second.child.stdin.end(`set application_name='${app}'; select * from class_pass.create_payment_correction_atomic(
      ${f.enrollmentId},${f.courseId},'police','{"paymentId":${paymentId},"amount":100000,"method":"cash"}',
      '{"amount":100000,"method":"cash","category":"tuition","items":[{"label":"정정 수강료","amount":100000}]}',null,null);\n`)
    await waitForLock(app)
    await sql(`begin; select id from class_pass.enrollment_payments where id=${paymentId} for update nowait; rollback;`)
    first.child.stdin.end('commit;\n')
    assert.equal((await first.done).code, 0)
    const result = await second.done
    assert.equal(result.code, 0, result.errors)
    assert.equal((await state(f)).payments, 2)
  } finally {
    first.child.stdin.end()
    second?.child.stdin.end()
    await Promise.all([first.done, second?.done])
    await cleanup(f)
  }
})
