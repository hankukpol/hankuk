-- Disposable LOCAL database only. All fixture writes roll back.
begin;
set local statement_timeout = '20s';
do $$
declare c integer; other_c integer; s integer; other_s integer; k uuid := gen_random_uuid(); p jsonb;
  a jsonb; b jsonb; material_id integer; routine text := 'class_pass.create_material_atomic(text,uuid,integer,jsonb)';
begin
  if to_regprocedure(routine) is null then raise exception 'material creation idempotency function missing'; end if;
  insert into class_pass.courses(division,name,slug) values ('police','creation fixture','creation-'||gen_random_uuid()) returning id into c;
  insert into class_pass.courses(division,name,slug) values ('fire','other fixture','creation-'||gen_random_uuid()) returning id into other_c;
  insert into class_pass.course_subjects(course_id,name) values(c,'subject') returning id into s;
  insert into class_pass.course_subjects(course_id,name) values(other_c,'other subject') returning id into other_s;
  p := jsonb_build_object('name','new handout','description',null,'is_active',true,'sort_order',0,'material_type','handout','subject_id',s);
  a := class_pass.create_material_atomic('police',k,c,p);
  b := class_pass.create_material_atomic('police',k,c,p);
  if a->>'success' <> 'true' or a->'material' is distinct from b->'material' then raise exception 'replay mismatch % %',a,b; end if;
  if (select count(*) from class_pass.materials where course_id=c) <> 1 then raise exception 'retry duplicated material'; end if;
  material_id := (a->'material'->>'id')::integer;
  b := class_pass.create_material_atomic('police',k,c,p||'{"name":"changed"}');
  if b->>'reason' is distinct from 'IDEMPOTENCY_CONFLICT' then raise exception 'payload conflict accepted %',b; end if;
  b := class_pass.create_material_atomic('fire',k,other_c,p);
  if b->>'reason' is distinct from 'IDEMPOTENCY_CONFLICT' then raise exception 'cross tenant replay accepted %',b; end if;
  b := class_pass.create_material_atomic('fire',gen_random_uuid(),c,p);
  if b->>'reason' is distinct from 'COURSE_NOT_FOUND' then raise exception 'tenant ownership ignored %',b; end if;
  b := class_pass.create_material_atomic('police',gen_random_uuid(),c,p||jsonb_build_object('subject_id',other_s));
  if b->>'reason' is distinct from 'INVALID_SUBJECT' then raise exception 'foreign subject accepted %',b; end if;
  b := class_pass.create_material_atomic('police',gen_random_uuid(),c,p||'{"material_type":"textbook"}');
  if b->>'reason' is distinct from 'INVALID_SUBJECT' then raise exception 'textbook subject accepted %',b; end if;
  delete from class_pass.materials where id=material_id;
  b := class_pass.create_material_atomic('police',k,c,p);
  if b->>'reason' is distinct from 'MATERIAL_DELETED' or exists(select 1 from class_pass.materials where course_id=c) then raise exception 'deleted replay recreated material %',b; end if;
  if has_function_privilege('anon',routine,'execute') or has_function_privilege('authenticated',routine,'execute') then raise exception 'public client execute'; end if;
  if not has_function_privilege('service_role',routine,'execute') then raise exception 'service denied'; end if;
  if exists(select 1 from pg_proc where oid=routine::regprocedure and prosecdef) then raise exception 'security definer'; end if;
  if not exists(select 1 from pg_class where oid='class_pass.material_creation_requests'::regclass and relrowsecurity) then raise exception 'RLS missing'; end if;
  if has_table_privilege('anon','class_pass.material_creation_requests','select') or has_table_privilege('authenticated','class_pass.material_creation_requests','select') then raise exception 'request table exposed'; end if;
  raise notice 'PASS creation replay/payload/tenant/subject/deleted replay/ACL/RLS';
end $$;
rollback;
