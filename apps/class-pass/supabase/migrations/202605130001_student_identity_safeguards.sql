create unique index if not exists uq_class_pass_students_division_exam_number
  on class_pass.students (division, exam_number)
  where exam_number is not null and btrim(exam_number) <> '';

create unique index if not exists uq_class_pass_students_division_name_phone_birth_date
  on class_pass.students (division, name, phone, birth_date)
  where birth_date is not null and btrim(birth_date) <> '';
