-- Both overloads use fully qualified class_pass relations/functions.
-- Keep the four-argument compatibility wrapper: it delegates to the guarded RPC.
-- Change only name resolution; preserve bodies, grants and invoker security.
alter function class_pass.claim_designated_seat(integer, bigint, bigint, bigint, text)
  set search_path = '';

alter function class_pass.claim_designated_seat(integer, bigint, bigint, text)
  set search_path = '';
