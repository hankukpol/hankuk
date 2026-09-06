const assert = require('node:assert/strict')
const { spawn } = require('node:child_process')
const { randomUUID } = require('node:crypto')
const { setTimeout: delay } = require('node:timers/promises')
const test = require('node:test')
const database = 'workflow_followup_test_20260906'

function connection() {
  const child = spawn('docker', ['exec', '-i', 'supabase_db_class-pass', 'psql', '-X', '-qAt', '-U', 'postgres', '-d', database, '-v', 'ON_ERROR_STOP=1', '-f', '-'])
  let out = '', err = ''
  child.stdout.on('data', (value) => { out += value })
  child.stderr.on('data', (value) => { err += value })
  const done = new Promise((resolve, reject) => {
    child.once('error', reject)
    child.once('close', (code) => resolve({ code, out, err }))
  })
  child.stdin.write("set statement_timeout='10s';\n")
  return { child, done, async marker(marker) {
    const deadline = Date.now() + 5000
    while (!out.includes(marker)) {
      if (child.exitCode !== null || Date.now() > deadline) throw new Error(`No marker ${marker}: ${err}`)
      await delay(25)
    }
  } }
}
async function sql(command) {
  const session = connection()
  session.child.stdin.end(command + '\n')
  const result = await session.done
  assert.equal(result.code, 0, result.err)
  return result.out.trim()
}
async function concurrent(firstSql, secondSql) {
  const app = `workflow-${randomUUID()}`
  const first = connection(), second = connection()
  try {
    first.child.stdin.write(`begin; set local role service_role; ${firstSql};\n\\echo FIRST_WRITTEN\n`)
    await first.marker('FIRST_WRITTEN')
    second.child.stdin.end(`set application_name='${app}'; begin; set local role service_role; ${secondSql}; commit;\n`)
    let waited = false
    const deadline = Date.now() + 5000
    while (Date.now() < deadline) {
      waited = await sql(`select count(*) from pg_stat_activity where datname=current_database() and application_name='${app}' and wait_event_type='Lock';`) === '1'
      if (waited) break
      await delay(25)
    }
    assert.ok(waited, 'second transaction must wait for the committed result')
    first.child.stdin.end('commit;\n')
    const [a, b] = await Promise.all([first.done, second.done])
    assert.equal(a.code, 0, a.err); assert.equal(b.code, 0, b.err)
    return [a.out.replace('FIRST_WRITTEN', '').trim(), b.out.trim()]
  } finally {
    first.child.stdin.end(); second.child.stdin.end()
    await Promise.allSettled([first.done, second.done])
  }
}

test('material creation response-loss retry commits one material and one request identity', { timeout: 20000 }, async () => {
  const key = randomUUID()
  const course = Number(await sql(`insert into class_pass.courses(division,name,slug) values('police','Material concurrency','material-${key}') returning id;`))
  const payload = JSON.stringify({ name: 'Concurrent material', description: null, material_type: 'handout', subject_id: null, sort_order: 0, is_active: true })
  const call = `select class_pass.create_material_atomic('police','${key}',${course},'${payload}')`
  const [a, b] = (await concurrent(call, call)).map(JSON.parse)
  assert.equal(a.success, true); assert.equal(b.success, true)
  assert.equal(a.material.id, b.material.id)
  assert.equal(await sql(`select count(*) from class_pass.materials where course_id=${course};`), '1')
  assert.equal(await sql(`select count(*) from class_pass.material_creation_requests where request_id='${key}';`), '1')
})

test('scheduled display requests for one target serialize and reuse a single session', { timeout: 20000 }, async () => {
  const key = randomUUID()
  const fixture = JSON.parse(await sql(`with c as (insert into class_pass.courses(division,name,slug) values('police','Schedule race','schedule-${key}') returning id),
    r as (insert into class_pass.course_rooms(course_id,name) select id,'Schedule room' from c returning id,course_id)
    select json_build_object('course',course_id,'room',id) from r;`))
  const call = (token) => `select id from class_pass.ensure_course_seat_display_schedule_session(${fixture.course},${fixture.room},null,null,'${token}',now()+interval '1 hour',now())`
  const [a, b] = await concurrent(call(randomUUID()), call(randomUUID()))
  assert.equal(a, b)
  assert.equal(await sql(`select count(*) from class_pass.course_seat_display_sessions where course_id=${fixture.course} and revoked_at is null;`), '1')
})

test('concurrent care upserts keep one row and the last committed state', { timeout: 20000 }, async () => {
  const key = randomUUID()
  const fixture = JSON.parse(await sql(`with c as (insert into class_pass.courses(division,name,slug) values('police','Care race','care-${key}') returning id),
    e as (insert into class_pass.enrollments(course_id,name,phone) select id,'Care race','01000000000' from c returning id,course_id)
    select json_build_object('course',course_id,'enrollment',id) from e;`))
  const call = (state) => `select state from class_pass.upsert_enrollment_care_state(${fixture.course},${fixture.enrollment},null,'${state}','test-admin')`
  const [a, b] = await concurrent(call('needs_contact'), call('contacted'))
  assert.equal(a, 'needs_contact'); assert.equal(b, 'contacted')
  assert.equal(await sql(`select count(*) from class_pass.enrollment_care_states where enrollment_id=${fixture.enrollment};`), '1')
  assert.equal(await sql(`select state from class_pass.enrollment_care_states where enrollment_id=${fixture.enrollment};`), 'contacted')
})
