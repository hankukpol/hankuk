const assert = require('node:assert/strict')
const { spawnSync } = require('node:child_process')
const { readFileSync } = require('node:fs')
const test = require('node:test')
const migration = readFileSync('supabase/migrations/20260905173221_workflow_schedule_and_care_recovery.sql', 'utf8')
function run(sql) {
  const result = spawnSync('docker', ['exec', '-i', 'supabase_db_class-pass', 'psql', '-X', '-qAt', '-U', 'postgres', '-d', 'workflow_followup_test_20260906', '-v', 'ON_ERROR_STOP=1'], { input: sql, encoding: 'utf8' })
  assert.equal(result.status, 0, result.stderr)
  return result.stdout
}
test('care recovery backfills existing notes without replacing IDs/content and closes the legacy overload', () => {
  const output = run(`begin; set local statement_timeout='15s';
    alter table class_pass.enrollment_care_notes drop column course_id;
    create function class_pass.upsert_enrollment_care_state(bigint,integer,text,text) returns text language sql as 'select $3';
    grant execute on function class_pass.upsert_enrollment_care_state(bigint,integer,text,text) to public,service_role;
    create temp table qa_care_note as
      with c as (insert into class_pass.courses(division,name,slug) values('police','Preservation fixture','preserve-'||gen_random_uuid()) returning id),
      e as (insert into class_pass.enrollments(course_id,name,phone) select id,'Preservation','01000000000' from c returning id,course_id),
      n as (insert into class_pass.enrollment_care_notes(enrollment_id,body,created_by) select id,'Keep exact note content','fixture' from e returning id)
      select n.id,e.course_id from n,e;
    ${migration}
    do $check$ begin
      if not exists(select 1 from class_pass.enrollment_care_notes n join qa_care_note q on q.id=n.id
        where n.course_id=q.course_id and n.body='Keep exact note content' and n.created_by='fixture') then raise exception 'Existing note lost or changed'; end if;
      if has_function_privilege('anon','class_pass.upsert_enrollment_care_state(bigint,integer,text,text)','execute')
        or has_function_privilege('service_role','class_pass.upsert_enrollment_care_state(bigint,integer,text,text)','execute') then raise exception 'Legacy unscoped overload still callable'; end if;
    end $check$; select 'PRESERVED'; rollback;`)
  assert.match(output, /PRESERVED/)
})
test('orphan notes stop recovery atomically and remain available for repair, not deletion', () => {
  assert.ok(!migration.includes('$migration_body$'))
  const output = run(`begin; set local statement_timeout='15s';
    alter table class_pass.enrollment_care_notes drop column course_id;
    alter table class_pass.enrollment_care_notes drop constraint enrollment_care_notes_enrollment_id_fkey;
    insert into class_pass.enrollment_care_notes(enrollment_id,body) values(-20260906,'Keep orphan for repair');
    do $check$ declare failed boolean:=false; begin
      begin execute $migration_body$${migration}$migration_body$;
      exception when not_null_violation then failed:=true; end;
      if not failed then raise exception 'Orphan recovery unexpectedly succeeded'; end if;
      if not exists(select 1 from class_pass.enrollment_care_notes where enrollment_id=-20260906 and body='Keep orphan for repair') then raise exception 'Orphan was deleted'; end if;
      if exists(select 1 from information_schema.columns where table_schema='class_pass' and table_name='enrollment_care_notes' and column_name='course_id') then raise exception 'Failed migration left partial DDL'; end if;
    end $check$; select 'ORPHAN_PRESERVED_ATOMICALLY'; rollback;`)
  assert.match(output, /ORPHAN_PRESERVED_ATOMICALLY/)
})
