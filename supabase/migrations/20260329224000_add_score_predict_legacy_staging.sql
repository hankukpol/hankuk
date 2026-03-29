create schema if not exists score_predict;

grant usage on schema score_predict to anon, authenticated, service_role;

create table if not exists score_predict.legacy_table_columns (
  tenant_type text not null check (tenant_type in ('police', 'fire')),
  source_project_ref text not null,
  source_table text not null,
  ordinal_position integer not null,
  column_name text not null,
  data_type text not null,
  udt_name text not null,
  is_nullable boolean not null,
  imported_at timestamptz not null default timezone('utc', now()),
  primary key (tenant_type, source_table, ordinal_position)
);

create index if not exists idx_score_predict_legacy_columns_table
  on score_predict.legacy_table_columns (tenant_type, source_table);

create table if not exists score_predict.legacy_table_rows (
  id bigserial primary key,
  tenant_type text not null check (tenant_type in ('police', 'fire')),
  source_project_ref text not null,
  source_table text not null,
  source_pk text not null,
  row_data jsonb not null,
  imported_at timestamptz not null default timezone('utc', now()),
  constraint score_predict_legacy_table_rows_unique unique (tenant_type, source_table, source_pk)
);

create index if not exists idx_score_predict_legacy_rows_table
  on score_predict.legacy_table_rows (tenant_type, source_table);

create table if not exists score_predict.legacy_import_runs (
  id bigserial primary key,
  tenant_type text not null check (tenant_type in ('police', 'fire')),
  source_project_ref text not null,
  source_table text not null,
  row_count integer not null,
  imported_at timestamptz not null default timezone('utc', now()),
  notes text
);

create index if not exists idx_score_predict_legacy_import_runs_table
  on score_predict.legacy_import_runs (tenant_type, source_table, imported_at desc);

grant all on all tables in schema score_predict to service_role;
grant all on all sequences in schema score_predict to service_role;

alter default privileges for role postgres in schema score_predict
  grant all on tables to service_role;

alter default privileges for role postgres in schema score_predict
  grant all on sequences to service_role;
