import bcrypt from "bcryptjs";
import { ExamType, PrismaClient, Role } from "@prisma/client";

const prisma = new PrismaClient();

// 소방 18개 시도 소방본부
const regions = [
  "서울", "부산", "대구", "인천", "광주", "대전", "울산", "세종",
  "경기", "강원", "충북", "충남", "전북", "전남", "경북", "경남", "제주", "창원",
];

// 2026년 소방공무원 채용시험 지역별 모집인원 (공고문 이미지 기준)
// pubM/pubF: 공채 남/여  |  rescue: 구조 (남자만)
// acadM/acadF/acadC: 소방학과 남/여/양성  |  emtM/emtF: 구급 남/여
const regionQuotas = [
  { regionName: "서울",  pubM: 221, pubF: 30, rescue: 28, acadM: 0,  acadF: 0,  acadC: 4,  emtM: 52,  emtF: 23 },
  { regionName: "부산",  pubM: 50,  pubF: 13, rescue: 6,  acadM: 0,  acadF: 0,  acadC: 0,  emtM: 51,  emtF: 11 },
  { regionName: "대구",  pubM: 65,  pubF: 11, rescue: 13, acadM: 0,  acadF: 0,  acadC: 0,  emtM: 32,  emtF: 10 },
  { regionName: "인천",  pubM: 42,  pubF: 9,  rescue: 13, acadM: 4,  acadF: 2,  acadC: 0,  emtM: 54,  emtF: 22 },
  { regionName: "광주",  pubM: 37,  pubF: 2,  rescue: 4,  acadM: 0,  acadF: 0,  acadC: 0,  emtM: 3,   emtF: 3 },
  { regionName: "대전",  pubM: 27,  pubF: 3,  rescue: 0,  acadM: 2,  acadF: 2,  acadC: 0,  emtM: 27,  emtF: 3 },
  { regionName: "울산",  pubM: 14,  pubF: 2,  rescue: 5,  acadM: 0,  acadF: 0,  acadC: 2,  emtM: 5,   emtF: 2 },
  { regionName: "세종",  pubM: 10,  pubF: 2,  rescue: 0,  acadM: 0,  acadF: 0,  acadC: 0,  emtM: 6,   emtF: 2 },
  { regionName: "경기",  pubM: 319, pubF: 6,  rescue: 15, acadM: 25, acadF: 25, acadC: 0,  emtM: 125, emtF: 125 },
  { regionName: "강원",  pubM: 44,  pubF: 5,  rescue: 0,  acadM: 7,  acadF: 3,  acadC: 0,  emtM: 45,  emtF: 25 },
  { regionName: "충북",  pubM: 36,  pubF: 2,  rescue: 15, acadM: 3,  acadF: 1,  acadC: 0,  emtM: 30,  emtF: 8 },
  { regionName: "충남",  pubM: 30,  pubF: 5,  rescue: 20, acadM: 4,  acadF: 1,  acadC: 0,  emtM: 33,  emtF: 7 },
  { regionName: "전북",  pubM: 75,  pubF: 3,  rescue: 17, acadM: 0,  acadF: 0,  acadC: 0,  emtM: 114, emtF: 13 },
  { regionName: "전남",  pubM: 60,  pubF: 15, rescue: 50, acadM: 0,  acadF: 0,  acadC: 5,  emtM: 60,  emtF: 15 },
  { regionName: "경북",  pubM: 79,  pubF: 8,  rescue: 15, acadM: 6,  acadF: 3,  acadC: 0,  emtM: 40,  emtF: 17 },
  { regionName: "경남",  pubM: 145, pubF: 10, rescue: 20, acadM: 0,  acadF: 0,  acadC: 0,  emtM: 30,  emtF: 15 },
  { regionName: "제주",  pubM: 38,  pubF: 4,  rescue: 5,  acadM: 0,  acadF: 0,  acadC: 2,  emtM: 16,  emtF: 5 },
  { regionName: "창원",  pubM: 21,  pubF: 1,  rescue: 0,  acadM: 0,  acadF: 0,  acadC: 0,  emtM: 11,  emtF: 3 },
];

// 소방 과목 (4개 직렬 × 과목)
const subjects = [
  // 공채: 3과목, 각 25문항 × 4점 = 100점, 총 300점
  { name: "소방학개론", examType: ExamType.PUBLIC, questionCount: 25, pointPerQuestion: 4, maxScore: 100 },
  { name: "소방관계법규", examType: ExamType.PUBLIC, questionCount: 25, pointPerQuestion: 4, maxScore: 100 },
  { name: "행정법총론", examType: ExamType.PUBLIC, questionCount: 25, pointPerQuestion: 4, maxScore: 100 },
  // 구조 경채: 2과목, 소방학개론 25문항×4점 + 소방관계법규 40문항×2.5점, 총 200점
  { name: "소방학개론", examType: ExamType.CAREER_RESCUE, questionCount: 25, pointPerQuestion: 4, maxScore: 100 },
  { name: "소방관계법규", examType: ExamType.CAREER_RESCUE, questionCount: 40, pointPerQuestion: 2.5, maxScore: 100 },
  // 소방학과 경채: 2과목, 구조와 동일 시험과목, 총 200점
  { name: "소방학개론", examType: ExamType.CAREER_ACADEMIC, questionCount: 25, pointPerQuestion: 4, maxScore: 100 },
  { name: "소방관계법규", examType: ExamType.CAREER_ACADEMIC, questionCount: 40, pointPerQuestion: 2.5, maxScore: 100 },
  // 구급 경채: 2과목, 소방학개론 25문항×4점 + 응급처치학개론 40문항×2.5점, 총 200점
  { name: "소방학개론", examType: ExamType.CAREER_EMT, questionCount: 25, pointPerQuestion: 4, maxScore: 100 },
  { name: "응급처치학개론", examType: ExamType.CAREER_EMT, questionCount: 40, pointPerQuestion: 2.5, maxScore: 100 },
];

const siteSettings = [
  { key: "site.title", value: "소방 필기 합격예측" },
  { key: "site.heroBadge", value: "2026년 소방공무원 채용시험 합격예측" },
  { key: "site.heroTitle", value: "OMR 입력부터 합격권 예측까지\n한 번에 확인하세요." },
  {
    key: "site.heroSubtitle",
    value:
      "응시정보와 OMR 답안을 입력하면 과목별 분석, 석차, 배수 위치, 합격권 등급을 실시간으로 제공합니다.",
  },
  {
    key: "site.footerDisclaimer",
    value:
      "면책조항: 본 서비스는 수험생의 자기 점검을 위한 참고용 분석 도구이며, 실제 합격 여부를 보장하지 않습니다. 최종 선발 결과는 소방청 및 시·도 소방본부 공식 공고를 반드시 확인해 주세요.",
  },
  { key: "site.bannerImageUrl", value: "" },
  { key: "site.bannerLink", value: "" },
  { key: "site.maintenanceMode", value: "false" },
  { key: "site.maintenanceMessage", value: "시스템 점검 중입니다." },
  { key: "site.careerExamEnabled", value: "true" },
  { key: "site.mainPageAutoRefresh", value: "true" },
  { key: "site.mainPageRefreshInterval", value: "60" },
];

const noticeSamples = [
  {
    title: "시험일: 2026.3.7(토)",
    content: "합격발표: 2026.3.26(목)",
    isActive: true,
    priority: 1,
  },
];

const faqSamples = [
  {
    question: "응시자 정보(직렬, 지역, 가산점) 입력을 잘못했는데 수정이 가능한가요?",
    answer:
      "답안 제출 전에는 입력 화면에서 수정할 수 있습니다. 제출 후에는 결과 화면의 답안 수정 기능(관리자 설정 제한 내)으로 수정 가능합니다.",
    isActive: true,
    priority: 100,
  },
  {
    question: "채점하기에서 마킹을 잘못했는데 수정이 가능한가요?",
    answer:
      "가능합니다. 제출 이후 결과 화면에서 답안 수정 버튼을 눌러 다시 제출하면 최신 답안으로 재채점됩니다.",
    isActive: true,
    priority: 90,
  },
  {
    question: "합격예측은 필기합격, 최종합격 중 어떤 기준인가요?",
    answer:
      "본 서비스의 합격예측은 필기시험 기준 참고 지표입니다. 최종 합격 여부는 체력·면접 등 공식 전형 결과를 확인해야 합니다.",
    isActive: true,
    priority: 80,
  },
];

async function main() {
  const adminPhone = process.env.ADMIN_PHONE ?? "010-0000-0000";
  const adminPassword = process.env.ADMIN_PASSWORD ?? "admin1234!";
  const hashedPassword = await bcrypt.hash(adminPassword, 12);

  await prisma.user.upsert({
    where: { phone: adminPhone },
    update: {
      name: "시스템 관리자",
      phone: adminPhone,
      password: hashedPassword,
      role: Role.ADMIN,
    },
    create: {
      name: "시스템 관리자",
      phone: adminPhone,
      password: hashedPassword,
      role: Role.ADMIN,
    },
  });

  await prisma.exam.upsert({
    where: {
      year_round: {
        year: 2026,
        round: 1,
      },
    },
    update: {
      name: "2026년 소방공무원 채용시험",
      examDate: new Date("2026-03-07T10:00:00+09:00"),
      isActive: true,
    },
    create: {
      name: "2026년 소방공무원 채용시험",
      year: 2026,
      round: 1,
      examDate: new Date("2026-03-07T10:00:00+09:00"),
      isActive: true,
    },
  });

  for (const regionName of regions) {
    await prisma.region.upsert({
      where: { name: regionName },
      update: {},
      create: { name: regionName },
    });
  }

  // ExamRegionQuota 시딩: 활성 시험 × 지역별 모집인원
  const activeExam = await prisma.exam.findFirst({
    where: { isActive: true },
    select: { id: true },
  });

  if (activeExam) {
    for (const q of regionQuotas) {
      const region = await prisma.region.findUnique({
        where: { name: q.regionName },
        select: { id: true },
      });
      if (!region) continue;

      await prisma.examRegionQuota.upsert({
        where: {
          examId_regionId: {
            examId: activeExam.id,
            regionId: region.id,
          },
        },
        update: {
          recruitPublicMale: q.pubM,
          recruitPublicFemale: q.pubF,
          recruitRescue: q.rescue,
          recruitAcademicMale: q.acadM,
          recruitAcademicFemale: q.acadF,
          recruitAcademicCombined: q.acadC,
          recruitEmtMale: q.emtM,
          recruitEmtFemale: q.emtF,
        },
        create: {
          examId: activeExam.id,
          regionId: region.id,
          recruitPublicMale: q.pubM,
          recruitPublicFemale: q.pubF,
          recruitRescue: q.rescue,
          recruitAcademicMale: q.acadM,
          recruitAcademicFemale: q.acadF,
          recruitAcademicCombined: q.acadC,
          recruitEmtMale: q.emtM,
          recruitEmtFemale: q.emtF,
        },
      });
    }
  }

  for (const subject of subjects) {
    await prisma.subject.upsert({
      where: {
        name_examType: {
          name: subject.name,
          examType: subject.examType,
        },
      },
      update: subject,
      create: subject,
    });
  }

  for (const setting of siteSettings) {
    await prisma.siteSetting.upsert({
      where: { key: setting.key },
      update: { value: setting.value },
      create: setting,
    });
  }

  for (const notice of noticeSamples) {
    const existingNotice = await prisma.notice.findFirst({
      where: {
        tenantType: "fire",
        title: notice.title,
      },
      select: { id: true },
    });

    if (existingNotice) {
      await prisma.notice.update({
        where: { id: existingNotice.id },
        data: {
          content: notice.content,
          isActive: notice.isActive,
          priority: notice.priority,
        },
      });
    } else {
      await prisma.notice.create({
        data: {
          tenantType: "fire",
          ...notice,
        },
      });
    }
  }

  for (const faq of faqSamples) {
    const existingFaq = await prisma.faq.findFirst({
      where: {
        tenantType: "fire",
        question: faq.question,
      },
      select: { id: true },
    });

    if (existingFaq) {
      await prisma.faq.update({
        where: { id: existingFaq.id },
        data: {
          answer: faq.answer,
          isActive: faq.isActive,
          priority: faq.priority,
        },
      });
    } else {
      await prisma.faq.create({
        data: {
          tenantType: "fire",
          ...faq,
        },
      });
    }
  }

  console.log("소방 합격예측 기본 데이터 시딩이 완료되었습니다.");
  console.log(`관리자 연락처: ${adminPhone}`);
  console.log("관리자 비밀번호는 .env의 ADMIN_PASSWORD 값을 사용합니다.");
}

main()
  .catch((error) => {
    console.error("시딩 중 오류가 발생했습니다.", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
