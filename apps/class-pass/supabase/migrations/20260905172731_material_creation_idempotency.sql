-- Server-only logical creation identities. Tombstones intentionally survive material deletion.
create table class_pass.material_creation_requests (
  request_id uuid primary key,
  division text not null,
  course_id integer not null,
  payload jsonb not null,
  material_id integer not null,
  created_at timestamptz not null default now()
);
alter table class_pass.material_creation_requests enable row level security;
revoke all on class_pass.material_creation_requests from public, anon, authenticated;
grant select, insert on class_pass.material_creation_requests to service_role;

create function class_pass.create_material_atomic(
  p_division text, p_request_id uuid, p_course_id integer, p_payload jsonb
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  previous class_pass.material_creation_requests%rowtype;
  material class_pass.materials%rowtype;
  subject_id integer;
begin
  if p_request_id is null or p_payload is null then
    return jsonb_build_object('success',false,'reason','INVALID_REQUEST');
  end if;
  -- Serialize identical request identities across courses and divisions, including first use.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('material-create:'||p_request_id::text,0));
  select * into previous from class_pass.material_creation_requests where request_id=p_request_id;
  if found then
    if previous.division is distinct from p_division or previous.course_id is distinct from p_course_id
       or previous.payload is distinct from p_payload then
      return jsonb_build_object('success',false,'reason','IDEMPOTENCY_CONFLICT');
    end if;
    select m.* into material from class_pass.materials m
      join class_pass.courses c on c.id=m.course_id
      where m.id=previous.material_id and m.course_id=p_course_id and c.division=p_division;
    if not found then return jsonb_build_object('success',false,'reason','MATERIAL_DELETED'); end if;
    return jsonb_build_object('success',true,'material',to_jsonb(material));
  end if;

  perform 1 from class_pass.courses where id=p_course_id and division=p_division for share;
  if not found then return jsonb_build_object('success',false,'reason','COURSE_NOT_FOUND'); end if;
  if jsonb_typeof(p_payload) <> 'object' or coalesce(length(p_payload->>'name'),0) not between 1 and 100
    or (p_payload->>'material_type') is null or (p_payload->>'material_type') not in ('handout','textbook')
    or jsonb_typeof(p_payload->'is_active') is distinct from 'boolean'
    or coalesce(p_payload->>'sort_order','') !~ '^[0-9]{1,3}$' then
    return jsonb_build_object('success',false,'reason','INVALID_REQUEST');
  end if;
  subject_id := (p_payload->>'subject_id')::integer;
  if subject_id is not null then
    if p_payload->>'material_type' <> 'handout' then return jsonb_build_object('success',false,'reason','INVALID_SUBJECT'); end if;
    perform 1 from class_pass.course_subjects where id=subject_id and course_id=p_course_id for share;
    if not found then return jsonb_build_object('success',false,'reason','INVALID_SUBJECT'); end if;
  end if;
  insert into class_pass.materials(course_id,name,description,is_active,sort_order,material_type,subject_id)
    values(p_course_id,p_payload->>'name',nullif(p_payload->>'description',''),(p_payload->>'is_active')::boolean,
      (p_payload->>'sort_order')::integer,p_payload->>'material_type',subject_id)
    returning * into material;
  insert into class_pass.material_creation_requests(request_id,division,course_id,payload,material_id)
    values(p_request_id,p_division,p_course_id,p_payload,material.id);
  return jsonb_build_object('success',true,'material',to_jsonb(material));
end $$;
revoke all on function class_pass.create_material_atomic(text,uuid,integer,jsonb) from public, anon, authenticated;
grant execute on function class_pass.create_material_atomic(text,uuid,integer,jsonb) to service_role;
