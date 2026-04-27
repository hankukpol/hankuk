update class_pass.branch_series_options
set label = case label
  when 'ê³µì±' then U&'\ACF5\CC44'
  when 'ê²½íê²½ì±' then U&'\ACBD\D589\ACBD\CC44'
  when 'íê³¼ê²½ì±' then U&'\D559\ACFC\ACBD\CC44'
  when 'êµ¬ê¸ê²½ì±' then U&'\AD6C\AE09\ACBD\CC44'
  when 'êµ¬ì¡°ê²½ì±' then U&'\AD6C\C870\ACBD\CC44'
  else label
end
where label in (
  'ê³µì±',
  'ê²½íê²½ì±',
  'íê³¼ê²½ì±',
  'êµ¬ê¸ê²½ì±',
  'êµ¬ì¡°ê²½ì±'
);

update class_pass.enrollments
set series = case series
  when 'ê³µì±' then U&'\ACF5\CC44'
  when 'ê²½íê²½ì±' then U&'\ACBD\D589\ACBD\CC44'
  when 'íê³¼ê²½ì±' then U&'\D559\ACFC\ACBD\CC44'
  when 'êµ¬ê¸ê²½ì±' then U&'\AD6C\AE09\ACBD\CC44'
  when 'êµ¬ì¡°ê²½ì±' then U&'\AD6C\C870\ACBD\CC44'
  else series
end
where series in (
  'ê³µì±',
  'ê²½íê²½ì±',
  'íê³¼ê²½ì±',
  'êµ¬ê¸ê²½ì±',
  'êµ¬ì¡°ê²½ì±'
);

update class_pass.enrollment_payments
set series_label_snapshot = case series_label_snapshot
  when 'ê³µì±' then U&'\ACF5\CC44'
  when 'ê²½íê²½ì±' then U&'\ACBD\D589\ACBD\CC44'
  when 'íê³¼ê²½ì±' then U&'\D559\ACFC\ACBD\CC44'
  when 'êµ¬ê¸ê²½ì±' then U&'\AD6C\AE09\ACBD\CC44'
  when 'êµ¬ì¡°ê²½ì±' then U&'\AD6C\C870\ACBD\CC44'
  else series_label_snapshot
end
where series_label_snapshot in (
  'ê³µì±',
  'ê²½íê²½ì±',
  'íê³¼ê²½ì±',
  'êµ¬ê¸ê²½ì±',
  'êµ¬ì¡°ê²½ì±'
);
