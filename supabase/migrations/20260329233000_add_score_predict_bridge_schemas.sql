create schema if not exists score_predict_fire;
create schema if not exists score_predict_police;

grant usage on schema score_predict_fire to anon, authenticated, service_role;
grant usage on schema score_predict_police to anon, authenticated, service_role;

grant create on schema score_predict_fire to postgres, service_role;
grant create on schema score_predict_police to postgres, service_role;

alter default privileges for role postgres in schema score_predict_fire
  grant all on tables to service_role;

alter default privileges for role postgres in schema score_predict_fire
  grant all on sequences to service_role;

alter default privileges for role postgres in schema score_predict_police
  grant all on tables to service_role;

alter default privileges for role postgres in schema score_predict_police
  grant all on sequences to service_role;
