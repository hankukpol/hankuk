-- p15: 학생 생년월일 필드 추가 (학생 포털 로그인: 학번 + 생년월일 6자리)
ALTER TABLE "students"
  ADD COLUMN IF NOT EXISTS "birthDate" TIMESTAMP(3);
