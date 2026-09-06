// Isolated local Docker only; no DSN, environment file, reset, or remote DB access.
const assert = require('node:assert/strict')
const { spawn } = require('node:child_process')
const { randomUUID } = require('node:crypto')
const { setTimeout: delay } = require('node:timers/promises')
const test = require('node:test')

function session() {
  const child = spawn('docker', ['exec', '-i', 'supabase_db_class-pass', 'psql', '-X', '-qAt', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-f', '-'])
  let output = '', errors = ''
  child.stdout.on('data', x => { output += x })
  child.stderr.on('data', x => { errors += x })
  const done = new Promise((resolve, reject) => {
    child.once('error', reject)
    child.once('close', code => resolve({ code, output, errors }))
  })
  child.stdin.write("\\set VERBOSITY verbose\nset statement_timeout='12s';\n")
  return { child, done, async marker(value) {
    const end = Date.now() + 5000
    while (!output.includes(value)) {
      if (child.exitCode !== null || Date.now() > end) throw new Error(`missing ${value}: ${errors}`)
      await delay(25)
    }
  } }
}
async function sql(command) {
  const s = session(); s.child.stdin.end(command + '\n')
  const r = await s.done; assert.equal(r.code, 0, r.errors); return r.output.trim()
}
async function fixture() {
  const slug = `materials-atomic-${randomUUID()}`
  const f = JSON.parse(await sql(`with c as (
    insert into class_pass.courses(division,name,slug) values('police','material atomic fixture','${slug}') returning id
  ), e as (insert into class_pass.enrollments(course_id,name,phone) select id,'material fixture','01000000919' from c returning id,course_id),
  m as (insert into class_pass.materials(course_id,name,material_type) select id,'material fixture','textbook' from c returning id)
  select json_build_object('course',e.course_id,'enrollment',e.id,'material',m.id) from e,m;`))
  return { ...f, slug }
}
async function cleanup(f) {
  await sql(`begin; do $$ begin
    if not exists(select 1 from class_pass.courses where id=${f.course} and slug='${f.slug}') then raise exception 'fixture mismatch'; end if;
  end $$;
  delete from class_pass.distribution_logs where enrollment_id=${f.enrollment};
  delete from class_pass.textbook_assignments where enrollment_id=${f.enrollment};
  delete from class_pass.materials where course_id=${f.course};
  delete from class_pass.enrollments where id=${f.enrollment} and course_id=${f.course};
  delete from class_pass.course_subjects where course_id=${f.course};
  delete from class_pass.courses where id=${f.course} and slug='${f.slug}'; commit;`)
}
async function lockWait(app) {
  const end = Date.now() + 5000
  while (Date.now() < end) {
    if (await sql(`select count(*) from pg_stat_activity where application_name='${app}' and wait_event_type='Lock';`) === '1') return
    await delay(25)
  }
  throw new Error('second transaction did not wait for the shared database lock')
}

test('local schema actually enforces subject seat eligibility and atomic material functions exist', async () => {
  const state = JSON.parse(await sql(`select json_build_object(
    'subjectColumn',exists(select 1 from information_schema.columns where table_schema='class_pass' and table_name='materials' and column_name='subject_id'),
    'seatGuard',position('NO_SEAT_FOR_SUBJECT' in pg_get_functiondef('class_pass.distribute_material(bigint,integer)'::regprocedure))>0
      or to_regprocedure('class_pass.distribute_material_atomic(text,bigint,integer)') is not null,
    'unassign',to_regprocedure('class_pass.unassign_textbook_atomic(text,bigint,integer)') is not null,
    'delete',to_regprocedure('class_pass.delete_material_atomic(text,integer)') is not null);`))
  assert.deepEqual(state, { subjectColumn: true, seatGuard: true, unassign: true, delete: true })
})

for (const firstAction of ['unassign', 'receipt']) {
  test(`${firstAction} wins: simultaneous receipt/unassignment cannot leave an unassigned receipt`, { timeout: 30000 }, async () => {
    const f = await fixture(); const a = session(); let b
    const unassign = `select class_pass.unassign_textbook_atomic('police',${f.enrollment},${f.material});`
    const receipt = `select class_pass.distribute_material_atomic('police',${f.enrollment},${f.material});`
    try {
      await sql(`insert into class_pass.textbook_assignments(enrollment_id,material_id) values(${f.enrollment},${f.material});`)
      a.child.stdin.write(`begin; ${firstAction === 'unassign' ? unassign : receipt}\n\\echo FIRST_DONE\n`)
      await a.marker('FIRST_DONE')
      const app = `material-wait-${randomUUID()}`; b = session()
      b.child.stdin.end(`set application_name='${app}'; ${firstAction === 'unassign' ? receipt : unassign}\n`)
      await lockWait(app)
      a.child.stdin.end('commit;\n'); assert.equal((await a.done).code, 0)
      const result = await b.done; assert.equal(result.code, 0, result.errors)
      assert.match(result.output, firstAction === 'unassign' ? /NOT_ASSIGNED/ : /ALREADY_DISTRIBUTED/)
      const state = JSON.parse(await sql(`select json_build_object(
        'assignments',(select count(*) from class_pass.textbook_assignments where material_id=${f.material}),
        'receipts',(select count(*) from class_pass.distribution_logs where material_id=${f.material}));`))
      assert.deepEqual(state, firstAction === 'unassign' ? { assignments: 0, receipts: 0 } : { assignments: 1, receipts: 1 })
    } finally { a.child.stdin.end(); b?.child.stdin.end(); await Promise.all([a.done, b?.done]); await cleanup(f) }
  })
}

for (const write of ['assignment', 'receipt']) for (const deleteFirst of [true, false]) {
  test(`delete/${write}: ${deleteFirst ? 'delete' : write} commits first without cascading a new write`, { timeout: 30000 }, async () => {
    const f = await fixture(); const a = session(); let b
    const remove = `select class_pass.delete_material_atomic('police',${f.material});`
    const insert = write === 'assignment'
      ? `select class_pass.assign_textbooks_atomic('police',${f.enrollment},array[${f.material}], 'test');`
      : `select class_pass.distribute_material_atomic('police',${f.enrollment},${f.material});`
    try {
      if (write === 'receipt') await sql(`update class_pass.materials set material_type='handout' where id=${f.material};`)
      a.child.stdin.write(`begin; ${deleteFirst ? remove : insert}\n\\echo FIRST_DONE\n`)
      await a.marker('FIRST_DONE')
      const app = `material-wait-${randomUUID()}`; b = session()
      b.child.stdin.end(`set application_name='${app}'; ${deleteFirst ? insert : remove}\n`)
      await lockWait(app)
      a.child.stdin.end('commit;\n'); assert.equal((await a.done).code, 0)
      const result = await b.done; assert.equal(result.code, 0, result.errors)
      assert.match(result.output, deleteFirst ? /NOT_FOUND/ : /HAS_ASSIGNMENTS|HAS_RECEIPTS/)
      assert.equal(await sql(`select count(*) from class_pass.materials where id=${f.material};`), deleteFirst ? '0' : '1')
      assert.equal(await sql(`select count(*) from class_pass.${write === 'assignment' ? 'textbook_assignments' : 'distribution_logs'} where material_id=${f.material};`), deleteFirst ? '0' : '1')
    } finally { a.child.stdin.end(); b?.child.stdin.end(); await Promise.all([a.done, b?.done]); await cleanup(f) }
  })
}

for (const receiptFirst of [true, false]) {
  test(`registration rollback/${receiptFirst ? 'receipt first' : 'rollback first'} preserves committed receipt history`, { timeout: 30000 }, async () => {
    const f = await fixture(); const a = session(); let b
    const rollback = `select class_pass.rollback_enrollment_creation(${f.enrollment});`
    const receipt = `select class_pass.distribute_material_atomic('police',${f.enrollment},${f.material});`
    try {
      await sql(`insert into class_pass.textbook_assignments(enrollment_id,material_id) values(${f.enrollment},${f.material});`)
      a.child.stdin.write(`begin; ${receiptFirst ? receipt : rollback}\n\\echo FIRST_DONE\n`)
      await a.marker('FIRST_DONE')
      const app = `material-rollback-${randomUUID()}`; b = session()
      b.child.stdin.end(`set application_name='${app}'; ${receiptFirst ? rollback : receipt}\n`)
      await lockWait(app)
      a.child.stdin.end('commit;\n'); assert.equal((await a.done).code, 0)
      const result = await b.done
      if (receiptFirst) {
        assert.notEqual(result.code, 0, 'rollback erased a concurrently committed receipt')
        assert.match(result.errors, /CP005/, 'must reject history, not time out or deadlock')
      } else {
        assert.equal(result.code, 0, result.errors)
        assert.match(result.output, /STUDENT_NOT_FOUND/)
      }
      const expected = receiptFirst ? '1' : '0'
      assert.equal(await sql(`select count(*) from class_pass.enrollments where id=${f.enrollment};`), expected)
      assert.equal(await sql(`select count(*) from class_pass.textbook_assignments where material_id=${f.material};`), expected)
      assert.equal(await sql(`select count(*) from class_pass.distribution_logs where material_id=${f.material};`), expected)
    } finally { a.child.stdin.end(); b?.child.stdin.end(); await Promise.all([a.done, b?.done]); await cleanup(f) }
  })
}

test('registration rollback removes only unused provisional billing/assignments, and missing ID is idempotent', async () => {
  const f = await fixture()
  try {
    await sql(`insert into class_pass.textbook_assignments(enrollment_id,material_id) values(${f.enrollment},${f.material});
      insert into class_pass.enrollment_billing(enrollment_id,course_id,expected_amount,discount_amount,payable_amount,status)
        values(${f.enrollment},${f.course},0,0,0,'paid');
      set role service_role; select class_pass.rollback_enrollment_creation(${f.enrollment});
      select class_pass.rollback_enrollment_creation(${f.enrollment});`)
    assert.equal(await sql(`select count(*) from class_pass.enrollments where id=${f.enrollment};`), '0')
    assert.equal(await sql(`select count(*) from class_pass.textbook_assignments where material_id=${f.material};`), '0')
    assert.equal(await sql(`select count(*) from class_pass.enrollment_billing where enrollment_id=${f.enrollment};`), '0')
    assert.equal(await sql(`select count(*) from class_pass.materials where id=${f.material};`), '1')
  } finally { await cleanup(f) }
})

test('registration rollback waits for a concurrent payment and preserves it after commit', { timeout: 30000 }, async () => {
  const f = await fixture(); const a = session(); let b
  try {
    a.child.stdin.write(`begin; insert into class_pass.enrollment_payments(enrollment_id,course_id,amount,method,category)
      values(${f.enrollment},${f.course},100,'cash','textbook');\n\\echo FIRST_DONE\n`)
    await a.marker('FIRST_DONE')
    const app = `material-rollback-payment-${randomUUID()}`; b = session()
    b.child.stdin.end(`set application_name='${app}'; select class_pass.rollback_enrollment_creation(${f.enrollment});\n`)
    await lockWait(app)
    a.child.stdin.end('commit;\n'); assert.equal((await a.done).code, 0)
    const result = await b.done
    assert.notEqual(result.code, 0)
    assert.match(result.errors, /CP005/, 'must preserve newly committed payment, not deadlock or hit an FK failure')
    assert.equal(await sql(`select count(*) from class_pass.enrollments where id=${f.enrollment};`), '1')
    assert.equal(await sql(`select count(*) from class_pass.enrollment_payments where enrollment_id=${f.enrollment};`), '1')
  } finally {
    a.child.stdin.end(); b?.child.stdin.end(); await Promise.all([a.done, b?.done])
    await sql(`delete from class_pass.enrollment_payments where enrollment_id=${f.enrollment} and course_id=${f.course};`)
    await cleanup(f)
  }
})
