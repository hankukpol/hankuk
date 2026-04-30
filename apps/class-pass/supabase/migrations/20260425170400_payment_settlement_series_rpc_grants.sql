grant execute on function class_pass.get_payment_settlement(date, date, integer, text)
to service_role;

revoke all on function class_pass.get_payment_settlement(date, date, integer, text)
from anon, authenticated;
