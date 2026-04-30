grant usage on schema class_pass to service_role;

grant all privileges on all tables in schema class_pass to service_role;
grant all privileges on all sequences in schema class_pass to service_role;
grant execute on all functions in schema class_pass to service_role;

alter default privileges in schema class_pass
  grant all privileges on tables to service_role;

alter default privileges in schema class_pass
  grant all privileges on sequences to service_role;

alter default privileges in schema class_pass
  grant execute on functions to service_role;
