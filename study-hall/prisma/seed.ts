import { PrismaClient } from "@prisma/client";
import { createClient } from "@supabase/supabase-js";

import { DEFAULT_PAYMENT_CATEGORY_NAMES } from "../lib/payment-meta";
import { DEFAULT_POINT_RULE_TEMPLATES } from "../lib/point-meta";
import {
  DEFAULT_SEAT_AISLE_COLUMNS,
  DEFAULT_SEAT_LAYOUT_COLUMNS,
  DEFAULT_SEAT_LAYOUT_ROWS,
} from "../lib/seat-layout";
import { getDefaultTuitionPlanTemplates } from "../lib/tuition-meta";

const prisma = new PrismaClient();

const DEFAULT_PERIODS = [
  { name: "0교시", label: "아침 모의고사", startTime: "08:30", endTime: "08:50", isMandatory: true, isActive: true },
  { name: "1교시", label: null, startTime: "09:00", endTime: "10:15", isMandatory: true, isActive: true },
  { name: "2교시", label: null, startTime: "10:30", endTime: "11:45", isMandatory: true, isActive: true },
  { name: "3교시", label: null, startTime: "12:00", endTime: "13:00", isMandatory: true, isActive: true },
  { name: "4교시", label: null, startTime: "14:15", endTime: "15:30", isMandatory: true, isActive: true },
  { name: "5교시", label: null, startTime: "15:45", endTime: "17:00", isMandatory: true, isActive: true },
  { name: "6교시", label: null, startTime: "17:10", endTime: "18:00", isMandatory: true, isActive: true },
  { name: "7교시", label: "야간 자습", startTime: "19:15", endTime: "20:30", isMandatory: false, isActive: true },
  { name: "8교시", label: "야간 자습", startTime: "20:45", endTime: "22:00", isMandatory: false, isActive: true },
] as const;

const DIVISION_TEMPLATES = [
  {
    slug: "police",
    name: "경찰반",
    fullName: "한국경찰학원",
    color: "#1B4FBB",
    displayOrder: 0,
    studyTracks: ["경찰"],
    examTypes: [
      {
        name: "경찰공채",
        studyTrack: "경찰",
        subjects: [
          { name: "국어", totalItems: 20, pointsPerItem: 5 },
          { name: "영어", totalItems: 20, pointsPerItem: 5 },
          { name: "한국사", totalItems: 20, pointsPerItem: 5 },
          { name: "형사법", totalItems: 20, pointsPerItem: 5 },
          { name: "경찰학", totalItems: 20, pointsPerItem: 5 },
        ],
      },
      {
        name: "경찰경채",
        studyTrack: "경찰",
        subjects: [
          { name: "국어", totalItems: 20, pointsPerItem: 5 },
          { name: "영어", totalItems: 20, pointsPerItem: 5 },
          { name: "한국사", totalItems: 20, pointsPerItem: 5 },
          { name: "형사법", totalItems: 20, pointsPerItem: 5 },
          { name: "경찰학", totalItems: 20, pointsPerItem: 5 },
        ],
      },
    ],
  },
  {
    slug: "fire",
    name: "소방반",
    fullName: "한국소방학원",
    color: "#C55A11",
    displayOrder: 1,
    studyTracks: ["소방"],
    examTypes: [
      {
        name: "소방공채",
        studyTrack: "소방",
        subjects: [
          { name: "국어", totalItems: 20, pointsPerItem: 5 },
          { name: "영어", totalItems: 20, pointsPerItem: 5 },
          { name: "한국사", totalItems: 20, pointsPerItem: 5 },
          { name: "소방학개론", totalItems: 20, pointsPerItem: 5 },
          { name: "소방관계법규", totalItems: 20, pointsPerItem: 5 },
        ],
      },
      {
        name: "소방경채",
        studyTrack: "소방",
        subjects: [
          { name: "국어", totalItems: 20, pointsPerItem: 5 },
          { name: "영어", totalItems: 20, pointsPerItem: 5 },
          { name: "한국사", totalItems: 20, pointsPerItem: 5 },
          { name: "소방학개론", totalItems: 20, pointsPerItem: 5 },
          { name: "소방관계법규", totalItems: 20, pointsPerItem: 5 },
        ],
      },
    ],
  },
] as const;

const EXTRA_DIVISION_TEMPLATES = [
  {
    slug: "allpass",
    name: "올패스독학원",
    fullName: "올패스독학원",
    color: "#0F766E",
    displayOrder: 2,
    studyTracks: ["경찰", "소방", "9급공무원", "행정직", "기타"],
    examTypes: [
      {
        name: "주간 모의고사",
        studyTrack: "경찰",
        subjects: [
          { name: "국어", totalItems: 20, pointsPerItem: 5 },
          { name: "영어", totalItems: 20, pointsPerItem: 5 },
          { name: "한국사", totalItems: 20, pointsPerItem: 5 },
          { name: "형사법", totalItems: 20, pointsPerItem: 5 },
          { name: "경찰학", totalItems: 20, pointsPerItem: 5 },
        ],
      },
      {
        name: "주간 모의고사",
        studyTrack: "소방",
        subjects: [
          { name: "국어", totalItems: 20, pointsPerItem: 5 },
          { name: "영어", totalItems: 20, pointsPerItem: 5 },
          { name: "한국사", totalItems: 20, pointsPerItem: 5 },
          { name: "소방학개론", totalItems: 20, pointsPerItem: 5 },
          { name: "소방관계법규", totalItems: 20, pointsPerItem: 5 },
        ],
      },
      {
        name: "월간 실전 모의고사",
        studyTrack: "9급공무원",
        subjects: [
          { name: "국어", totalItems: 20, pointsPerItem: 5 },
          { name: "영어", totalItems: 20, pointsPerItem: 5 },
          { name: "한국사", totalItems: 20, pointsPerItem: 5 },
          { name: "행정법", totalItems: 20, pointsPerItem: 5 },
          { name: "행정학", totalItems: 20, pointsPerItem: 5 },
        ],
      },
      {
        name: "월간 실전 모의고사",
        studyTrack: "행정직",
        subjects: [
          { name: "국어", totalItems: 20, pointsPerItem: 5 },
          { name: "영어", totalItems: 20, pointsPerItem: 5 },
          { name: "한국사", totalItems: 20, pointsPerItem: 5 },
          { name: "행정법", totalItems: 20, pointsPerItem: 5 },
          { name: "행정학", totalItems: 20, pointsPerItem: 5 },
        ],
      },
    ],
  },
  {
    slug: "hankyung-sparta",
    name: "한경스파르타",
    fullName: "한경스파르타",
    color: "#2F5D50",
    displayOrder: 3,
    studyTracks: ["경찰", "소방", "9급공무원", "행정직", "기타"],
    examTypes: [
      {
        name: "주간 모의고사",
        studyTrack: "경찰",
        subjects: [
          { name: "국어", totalItems: 20, pointsPerItem: 5 },
          { name: "영어", totalItems: 20, pointsPerItem: 5 },
          { name: "한국사", totalItems: 20, pointsPerItem: 5 },
          { name: "형사법", totalItems: 20, pointsPerItem: 5 },
          { name: "경찰학", totalItems: 20, pointsPerItem: 5 },
        ],
      },
      {
        name: "주간 모의고사",
        studyTrack: "소방",
        subjects: [
          { name: "국어", totalItems: 20, pointsPerItem: 5 },
          { name: "영어", totalItems: 20, pointsPerItem: 5 },
          { name: "한국사", totalItems: 20, pointsPerItem: 5 },
          { name: "소방학개론", totalItems: 20, pointsPerItem: 5 },
          { name: "소방관계법규", totalItems: 20, pointsPerItem: 5 },
        ],
      },
      {
        name: "월간 실전 모의고사",
        studyTrack: "9급공무원",
        subjects: [
          { name: "국어", totalItems: 20, pointsPerItem: 5 },
          { name: "영어", totalItems: 20, pointsPerItem: 5 },
          { name: "한국사", totalItems: 20, pointsPerItem: 5 },
          { name: "행정법", totalItems: 20, pointsPerItem: 5 },
          { name: "행정학", totalItems: 20, pointsPerItem: 5 },
        ],
      },
      {
        name: "월간 실전 모의고사",
        studyTrack: "행정직",
        subjects: [
          { name: "국어", totalItems: 20, pointsPerItem: 5 },
          { name: "영어", totalItems: 20, pointsPerItem: 5 },
          { name: "한국사", totalItems: 20, pointsPerItem: 5 },
          { name: "행정법", totalItems: 20, pointsPerItem: 5 },
          { name: "행정학", totalItems: 20, pointsPerItem: 5 },
        ],
      },
    ],
  },
] as const;

const ALL_DIVISION_TEMPLATES = [...DIVISION_TEMPLATES, ...EXTRA_DIVISION_TEMPLATES] as const;

type SupabaseAdminUser = {
  id: string;
  email: string | null;
};

function parseDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function getSupabaseAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required for super admin seeding.");
  }

  return createClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

async function findSupabaseUserByEmail(email: string): Promise<SupabaseAdminUser | null> {
  const supabase = getSupabaseAdminClient();
  let page = 1;

  while (page <= 10) {
    const { data, error } = await supabase.auth.admin.listUsers({
      page,
      perPage: 200,
    });

    if (error) {
      throw new Error(error.message);
    }

    const matched = data.users.find((user) => user.email?.toLowerCase() === email.toLowerCase());

    if (matched) {
      return {
        id: matched.id,
        email: matched.email ?? null,
      };
    }

    if (data.users.length < 200) {
      break;
    }

    page += 1;
  }

  return null;
}

async function ensureSuperAdminUser() {
  const email = process.env.SEED_SUPER_ADMIN_EMAIL?.trim();
  const password = process.env.SEED_SUPER_ADMIN_PASSWORD?.trim();
  const name = process.env.SEED_SUPER_ADMIN_NAME?.trim() || "슈퍼관리자";

  if (!email && !password) {
    console.log("[seed] SEED_SUPER_ADMIN_EMAIL / SEED_SUPER_ADMIN_PASSWORD not set. Skip super admin auth user.");
    return null;
  }

  if (!email || !password) {
    throw new Error("Both SEED_SUPER_ADMIN_EMAIL and SEED_SUPER_ADMIN_PASSWORD must be set.");
  }

  const supabase = getSupabaseAdminClient();
  const existing = await findSupabaseUserByEmail(email);

  if (existing) {
    const { error } = await supabase.auth.admin.updateUserById(existing.id, {
      email,
      password,
      email_confirm: true,
      user_metadata: {
        name,
      },
    });

    if (error) {
      throw new Error(error.message);
    }

    return {
      id: existing.id,
      email,
      name,
    };
  }

  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      name,
    },
  });

  if (error || !data.user) {
    throw new Error(error?.message ?? "Failed to create super admin auth user.");
  }

  return {
    id: data.user.id,
    email,
    name,
  };
}

async function upsertPeriods(divisionId: string) {
  await Promise.all(
    DEFAULT_PERIODS.map((period, index) =>
      prisma.period.upsert({
        where: {
          divisionId_displayOrder: {
            divisionId,
            displayOrder: index,
          },
        },
        update: {
          name: period.name,
          label: period.label,
          startTime: period.startTime,
          endTime: period.endTime,
          isMandatory: period.isMandatory,
          isActive: period.isActive,
        },
        create: {
          divisionId,
          name: period.name,
          label: period.label,
          displayOrder: index,
          startTime: period.startTime,
          endTime: period.endTime,
          isMandatory: period.isMandatory,
          isActive: period.isActive,
        },
      }),
    ),
  );
}

async function upsertPointRules(divisionId: string) {
  const existingRules = await prisma.pointRule.findMany({
    where: { divisionId },
  });
  const existingByName = new Map(existingRules.map((rule) => [rule.name, rule]));

  for (let index = 0; index < DEFAULT_POINT_RULE_TEMPLATES.length; index += 1) {
    const template = DEFAULT_POINT_RULE_TEMPLATES[index];
    const existing = existingByName.get(template.name);

    if (existing) {
      await prisma.pointRule.update({
        where: { id: existing.id },
        data: {
          category: template.category,
          points: template.points,
          description: template.description,
          isActive: true,
          displayOrder: index,
        },
      });
      continue;
    }

    await prisma.pointRule.create({
      data: {
        divisionId,
        category: template.category,
        name: template.name,
        points: template.points,
        description: template.description,
        isActive: true,
        displayOrder: index,
      },
    });
  }
}

async function upsertPaymentCategories(divisionId: string) {
  await Promise.all(
    DEFAULT_PAYMENT_CATEGORY_NAMES.map((name, index) =>
      prisma.paymentCategory.upsert({
        where: {
          divisionId_name: {
            divisionId,
            name,
          },
        },
        update: {
          isActive: true,
          displayOrder: index,
        },
        create: {
          divisionId,
          name,
          isActive: true,
          displayOrder: index,
        },
      }),
    ),
  );
}

async function upsertStudyRooms(divisionId: string) {
  await prisma.studyRoom.upsert({
    where: {
      divisionId_name: {
        divisionId,
        name: "기본 자습실",
      },
    },
    update: {
      columns: DEFAULT_SEAT_LAYOUT_COLUMNS,
      rows: DEFAULT_SEAT_LAYOUT_ROWS,
      aisleColumns: [...DEFAULT_SEAT_AISLE_COLUMNS],
      isActive: true,
      displayOrder: 0,
    },
    create: {
      divisionId,
      name: "기본 자습실",
      columns: DEFAULT_SEAT_LAYOUT_COLUMNS,
      rows: DEFAULT_SEAT_LAYOUT_ROWS,
      aisleColumns: [...DEFAULT_SEAT_AISLE_COLUMNS],
      isActive: true,
      displayOrder: 0,
    },
  });
}

function getDefaultWarnMessageTemplate(stageLabel: string) {
  return `안녕하세요. {학원명}입니다.\n{직렬명} {학생이름} 학생의 벌점이 {벌점}점으로 ${stageLabel} 대상입니다.`;
}

async function upsertTuitionPlans(divisionId: string, divisionSlug: string) {
  await Promise.all(
    getDefaultTuitionPlanTemplates(divisionSlug).map((plan, index) =>
      prisma.tuitionPlan.upsert({
        where: {
          divisionId_name: {
            divisionId,
            name: plan.name,
          },
        },
        update: {
          durationDays: plan.durationDays,
          amount: plan.amount,
          description: plan.description ?? null,
          isActive: true,
          displayOrder: index,
        },
        create: {
          divisionId,
          name: plan.name,
          durationDays: plan.durationDays,
          amount: plan.amount,
          description: plan.description ?? null,
          isActive: true,
          displayOrder: index,
        },
      }),
    ),
  );
}

async function upsertExamTypes(
  divisionId: string,
  examTemplates: (typeof ALL_DIVISION_TEMPLATES)[number]["examTypes"],
) {
  const existingExamTypes = await prisma.examType.findMany({
    where: { divisionId },
    include: {
      subjects: true,
    },
  });
  const existingTypeByKey = new Map(
    existingExamTypes.map((examType) => [
      `${examType.name}::${examType.studyTrack ?? "__common__"}`,
      examType,
    ]),
  );

  for (let examIndex = 0; examIndex < examTemplates.length; examIndex += 1) {
    const template = examTemplates[examIndex];
    const key = `${template.name}::${template.studyTrack ?? "__common__"}`;
    const existing = existingTypeByKey.get(key);
    const examType =
      existing
        ? await prisma.examType.update({
            where: { id: existing.id },
            data: {
              name: template.name,
              studyTrack: template.studyTrack ?? null,
              isActive: true,
              displayOrder: examIndex,
            },
            include: {
              subjects: true,
            },
          })
        : await prisma.examType.create({
            data: {
              divisionId,
              name: template.name,
              studyTrack: template.studyTrack ?? null,
              isActive: true,
              displayOrder: examIndex,
            },
            include: {
              subjects: true,
            },
          });

    const subjectByName = new Map(examType.subjects.map((subject) => [subject.name, subject]));

    for (let subjectIndex = 0; subjectIndex < template.subjects.length; subjectIndex += 1) {
      const subjectTemplate = template.subjects[subjectIndex];
      const existingSubject = subjectByName.get(subjectTemplate.name);

      if (existingSubject) {
        await prisma.examSubject.update({
          where: { id: existingSubject.id },
          data: {
            totalItems: subjectTemplate.totalItems,
            pointsPerItem: subjectTemplate.pointsPerItem ?? null,
            displayOrder: subjectIndex,
            isActive: true,
          },
        });
        continue;
      }

      await prisma.examSubject.create({
        data: {
          examTypeId: examType.id,
          name: subjectTemplate.name,
          totalItems: subjectTemplate.totalItems,
          pointsPerItem: subjectTemplate.pointsPerItem ?? null,
          displayOrder: subjectIndex,
          isActive: true,
        },
      });
    }
  }
}

async function seedDivision(template: (typeof ALL_DIVISION_TEMPLATES)[number]) {
  const division = await prisma.division.upsert({
    where: {
      slug: template.slug,
    },
    update: {
      name: template.name,
      fullName: template.fullName,
      color: template.color,
      isActive: true,
      displayOrder: template.displayOrder,
    },
    create: {
      name: template.name,
      slug: template.slug,
      fullName: template.fullName,
      color: template.color,
      isActive: true,
      displayOrder: template.displayOrder,
    },
  });

  await prisma.divisionSettings.upsert({
    where: {
      divisionId: division.id,
    },
      update: {
        warnLevel1: 10,
        warnLevel2: 20,
        warnInterview: 25,
        warnWithdraw: 30,
        warnMsgLevel1: getDefaultWarnMessageTemplate("1차 경고"),
        warnMsgLevel2: getDefaultWarnMessageTemplate("2차 경고"),
        warnMsgInterview: getDefaultWarnMessageTemplate("면담"),
        warnMsgWithdraw: getDefaultWarnMessageTemplate("퇴실"),
        tardyMinutes: 20,
        assistantPastEditAllowed: false,
        assistantPastEditDays: 0,
        holidayLimit: 1,
        halfDayLimit: 2,
        healthLimit: 1,
        holidayUnusedPts: 5,
        halfDayUnusedPts: 2,
        studyTracks: template.studyTracks,
      operatingDays: {
        mon: true,
        tue: true,
        wed: true,
        thu: true,
        fri: true,
        sat: true,
        sun: false,
      },
    },
      create: {
        divisionId: division.id,
        warnLevel1: 10,
        warnLevel2: 20,
        warnInterview: 25,
        warnWithdraw: 30,
        warnMsgLevel1: getDefaultWarnMessageTemplate("1차 경고"),
        warnMsgLevel2: getDefaultWarnMessageTemplate("2차 경고"),
        warnMsgInterview: getDefaultWarnMessageTemplate("면담"),
        warnMsgWithdraw: getDefaultWarnMessageTemplate("퇴실"),
        tardyMinutes: 20,
        assistantPastEditAllowed: false,
        assistantPastEditDays: 0,
        holidayLimit: 1,
        halfDayLimit: 2,
        healthLimit: 1,
        holidayUnusedPts: 5,
        halfDayUnusedPts: 2,
        studyTracks: template.studyTracks,
      operatingDays: {
        mon: true,
        tue: true,
        wed: true,
        thu: true,
        fri: true,
        sat: true,
        sun: false,
      },
    },
  });

  await upsertPeriods(division.id);
  await upsertPointRules(division.id);
  await upsertPaymentCategories(division.id);
  await upsertTuitionPlans(division.id, template.slug);
  await upsertStudyRooms(division.id);
  await upsertExamTypes(division.id, template.examTypes);

  console.log(`[seed] division ready: ${template.slug}`);
}

async function seedSuperAdmin() {
  const superAdmin = await ensureSuperAdminUser();

  if (!superAdmin) {
    return;
  }

  await prisma.admin.upsert({
    where: {
      userId: superAdmin.id,
    },
    update: {
      name: superAdmin.name,
      role: "SUPER_ADMIN",
      divisionId: null,
      isActive: true,
    },
    create: {
      userId: superAdmin.id,
      name: superAdmin.name,
      role: "SUPER_ADMIN",
      divisionId: null,
      isActive: true,
    },
  });

  console.log(`[seed] super admin ready: ${superAdmin.email}`);
}

async function main() {
  for (const division of ALL_DIVISION_TEMPLATES) {
    await seedDivision(division);
  }

  await seedSuperAdmin();
}

main()
  .catch((error) => {
    console.error("[seed] failed");
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
