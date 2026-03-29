-- p14: 결제 링크에 자동 수강등록용 필드 추가
-- 직원이 결제 링크 생성 시 학생/기수/상품을 지정하면 결제 완료 후 자동으로 CourseEnrollment 생성
-- PortOne 웹훅에서 examNumber + cohortId(또는 specialLectureId) 조합으로 자동 수강등록 처리

ALTER TABLE "payment_links"
  ADD COLUMN "examNumber"       TEXT,
  ADD COLUMN "cohortId"         TEXT,
  ADD COLUMN "productId"        TEXT,
  ADD COLUMN "courseType"       "CourseType",
  ADD COLUMN "specialLectureId" TEXT;

-- examNumber 검색 인덱스
CREATE INDEX "payment_links_examNumber_idx" ON "payment_links"("examNumber");

-- FK: examNumber → students
ALTER TABLE "payment_links"
  ADD CONSTRAINT "payment_links_examNumber_fkey"
  FOREIGN KEY ("examNumber") REFERENCES "students"("examNumber")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- FK: cohortId → cohorts
ALTER TABLE "payment_links"
  ADD CONSTRAINT "payment_links_cohortId_fkey"
  FOREIGN KEY ("cohortId") REFERENCES "cohorts"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- FK: productId → comprehensive_course_products
ALTER TABLE "payment_links"
  ADD CONSTRAINT "payment_links_productId_fkey"
  FOREIGN KEY ("productId") REFERENCES "comprehensive_course_products"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- FK: specialLectureId → special_lectures
ALTER TABLE "payment_links"
  ADD CONSTRAINT "payment_links_specialLectureId_fkey"
  FOREIGN KEY ("specialLectureId") REFERENCES "special_lectures"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
