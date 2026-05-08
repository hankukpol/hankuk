update class_pass.enrollment_payments
set card_company = 'KB',
    updated_at = now()
where card_company = U&'\004B\0042\AD6D\BBFC';
