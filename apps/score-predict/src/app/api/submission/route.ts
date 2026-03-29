import { BonusType, ExamType, Gender, Prisma, SubmissionScoringStatus } from "@prisma/client";
import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { invalidateCorrectRateCache } from "@/lib/correct-rate";
import { parseExamNumberInput, validateExamNumberWithRange } from "@/lib/exam-number";
import { getRegionRecruitCount, normalizeSubjectName, parsePositiveInt } from "@/lib/exam-utils";
import { getPassMultiple } from "@/lib/prediction";
import { prisma } from "@/lib/prisma";
import { DEFAULT_TAB_LOCKED_MESSAGE } from "@/lib/exam-surface";
import { getSiteSettingsUncached } from "@/lib/site-settings";
import { validateAnswerPattern } from "@/lib/answer-validation";
import { getClientIp } from "@/lib/request-ip";
import {
  calculateScore,
  getBonusPercent,
  getBonusTypeFromPercent,
  isValidBonusType,
  type AnswerInput,
  type ScoreResult,
} from "@/lib/scoring";

export const runtime = "nodejs";

const BAD_REQUEST_ERROR_PATTERNS = [
  "정답키",
  "올바르지",
  "유효하지 않은",
  "유효한",
  "중복",
  "가산점",
  "문항",
  "답안",
  "과목",
  "채용유형",
  "성별",
  "응시번호",
  "체감 난이도",
  "지역",
  "최소",
  "동시에 적용",
  "가능합니다",
];

interface SubmissionRequestBody {
  examId?: unknown;
  examType?: unknown;
  gender?: unknown;
  regionId?: unknown;
  examNumber?: unknown;
  difficulty?: unknown;
  bonusType?: unknown;
  veteranPercent?: unknown;
  heroPercent?: unknown;
  certificateBonus?: unknown;
  submitDurationMs?: unknown;
  answers?: unknown;
}

type DifficultyRatingValue = "VERY_EASY" | "EASY" | "NORMAL" | "HARD" | "VERY_HARD";
type DifficultyInput = ReturnType<typeof parseDifficulty>[number];

const ALLOWED_DIFFICULTY_RATINGS: ReadonlySet<DifficultyRatingValue> = new Set([
  "VERY_EASY",
  "EASY",
  "NORMAL",
  "HARD",
  "VERY_HARD",
]);

function parseExamType(value: unknown): ExamType | null {
  if (value === ExamType.PUBLIC) return ExamType.PUBLIC;
  if (value === ExamType.CAREER_RESCUE) return ExamType.CAREER_RESCUE;
  if (value === ExamType.CAREER_ACADEMIC) return ExamType.CAREER_ACADEMIC;
  if (value === ExamType.CAREER_EMT) return ExamType.CAREER_EMT;
  return null;
}

function parseGender(value: unknown): Gender | null {
  if (value === Gender.MALE) return Gender.MALE;
  if (value === Gender.FEMALE) return Gender.FEMALE;
  return null;
}

/** 구조 경채(CAREER_RESCUE)는 남성만 채용 — 여성 제출 시 에러 메시지 반환 */
function getRescueMaleOnlyError(examType: ExamType, gender: Gender): string | null {
  if (examType === ExamType.CAREER_RESCUE && gender !== Gender.MALE) {
    return "구조 경채는 남성만 채용하는 직렬입니다. 성별을 남성으로 선택해주세요.";
  }
  return null;
}

function parsePercent(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function parseCertificateBonus(value: unknown): number {
  const parsed = parsePercent(value);
  // 0~5점 정수만 허용
  return Number.isInteger(parsed) && parsed >= 0 && parsed <= 5 ? parsed : 0;
}

function parseNonNegativeInt(value: unknown): number | null {
  if (typeof value === "number") {
    return Number.isInteger(value) && value >= 0 ? value : null;
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
  }
  return null;
}

function getAnswerInputDisabledMessage(settings: Record<string, unknown>): string {
  const lockedMessage = settings["site.tabLockedMessage"];
  if (typeof lockedMessage === "string" && lockedMessage.trim()) {
    return lockedMessage.trim();
  }
  return DEFAULT_TAB_LOCKED_MESSAGE;
}

function parseDifficulty(
  value: unknown
): Array<{
  subjectName: string;
  rating: DifficultyRatingValue;
}> {
  if (value === undefined || value === null) {
    return [];
  }

  if (!Array.isArray(value)) {
    throw new Error("체감 난이도 형식이 올바르지 않습니다.");
  }

  const deduped = new Map<
    string,
    {
      subjectName: string;
      rating: DifficultyRatingValue;
    }
  >();

  for (const item of value) {
    if (!item || typeof item !== "object") {
      throw new Error("체감 난이도 항목 형식이 올바르지 않습니다.");
    }

    const subjectNameRaw = (item as { subjectName?: unknown }).subjectName;
    const ratingRaw = (item as { rating?: unknown }).rating;

    const subjectName = typeof subjectNameRaw === "string" ? subjectNameRaw.trim() : "";
    if (!subjectName) {
      continue;
    }

    if (typeof ratingRaw !== "string") {
      throw new Error("체감 난이도 값이 올바르지 않습니다.");
    }

    const normalizedRating = ratingRaw.trim().toUpperCase() as DifficultyRatingValue;
    if (!ALLOWED_DIFFICULTY_RATINGS.has(normalizedRating)) {
      throw new Error("체감 난이도 값은 VERY_EASY, EASY, NORMAL, HARD, VERY_HARD만 가능합니다.");
    }

    deduped.set(normalizeSubjectName(subjectName), {
      subjectName,
      rating: normalizedRating,
    });
  }

  return Array.from(deduped.values());
}

function parseAnswers(value: unknown): AnswerInput[] {
  if (!Array.isArray(value)) {
    throw new Error("답안 데이터 형식이 올바르지 않습니다.");
  }

  const parsed: AnswerInput[] = [];
  const seen = new Set<string>();

  for (const item of value) {
    if (!item || typeof item !== "object") {
      throw new Error("답안 항목 형식이 올바르지 않습니다.");
    }

    const subjectNameRaw = (item as { subjectName?: unknown }).subjectName;
    const questionNoRaw = (item as { questionNo?: unknown }).questionNo;
    const answerRaw = (item as { answer?: unknown }).answer;

    const subjectName = typeof subjectNameRaw === "string" ? subjectNameRaw.trim() : "";
    const questionNo = parsePositiveInt(questionNoRaw);
    const answer = parsePositiveInt(answerRaw);

    if (!subjectName) {
      throw new Error("과목명이 누락된 답안이 있습니다.");
    }
    if (!questionNo) {
      throw new Error(`${subjectName} 문항 번호가 올바르지 않습니다.`);
    }
    if (!answer || answer > 4) {
      throw new Error(`${subjectName} ${questionNo}번 답안은 1~4만 가능합니다.`);
    }

    const duplicateKey = `${normalizeSubjectName(subjectName)}:${questionNo}`;
    if (seen.has(duplicateKey)) {
      throw new Error(`${subjectName} ${questionNo}번 문항이 중복 제출되었습니다.`);
    }
    seen.add(duplicateKey);

    parsed.push({
      subjectName,
      questionNo,
      answer,
    });
  }

  return parsed;
}

function resolveBonusType(body: SubmissionRequestBody): BonusType {
  if (typeof body.bonusType === "string") {
    if (!isValidBonusType(body.bonusType)) {
      throw new Error("가산점 유형이 올바르지 않습니다.");
    }
    return body.bonusType;
  }

  const veteranPercent = parsePercent(body.veteranPercent);
  const heroPercent = parsePercent(body.heroPercent);
  return getBonusTypeFromPercent(veteranPercent, heroPercent);
}

interface SubmissionSubjectMeta {
  id: number;
  name: string;
  questionCount: number;
}

async function loadSubmissionSubjectMeta(examType: ExamType): Promise<SubmissionSubjectMeta[]> {
  const subjects = await prisma.subject.findMany({
    where: { examType },
    select: {
      id: true,
      name: true,
      questionCount: true,
    },
    orderBy: [{ id: "asc" }],
  });

  if (subjects.length < 1) {
    throw new Error(`${examType} 과목 설정이 존재하지 않습니다.`);
  }

  return subjects.map((subject) => ({
    id: subject.id,
    name: subject.name,
    questionCount: subject.questionCount,
  }));
}

function buildSubjectIdByName(subjects: SubmissionSubjectMeta[]): Map<string, number> {
  return new Map(
    subjects.map((subject) => [normalizeSubjectName(subject.name), subject.id] as const)
  );
}

async function resolveScoringReadiness(params: {
  examId: number;
  examType: ExamType;
}): Promise<{
  isReady: boolean;
  subjects: SubmissionSubjectMeta[];
}> {
  const subjects = await loadSubmissionSubjectMeta(params.examType);
  const subjectIds = subjects.map((subject) => subject.id);

  const answerKeys = await prisma.answerKey.findMany({
    where: {
      examId: params.examId,
      subjectId: { in: subjectIds },
    },
    select: {
      subjectId: true,
      questionNumber: true,
    },
  });

  const questionNoBySubjectId = new Map<number, Set<number>>();
  for (const answerKey of answerKeys) {
    const bucket = questionNoBySubjectId.get(answerKey.subjectId) ?? new Set<number>();
    bucket.add(answerKey.questionNumber);
    questionNoBySubjectId.set(answerKey.subjectId, bucket);
  }

  for (const subject of subjects) {
    const questionNos = questionNoBySubjectId.get(subject.id);
    if (!questionNos || questionNos.size !== subject.questionCount) {
      return {
        isReady: false,
        subjects,
      };
    }

    for (let questionNo = 1; questionNo <= subject.questionCount; questionNo += 1) {
      if (!questionNos.has(questionNo)) {
        return {
          isReady: false,
          subjects,
        };
      }
    }
  }

  return {
    isReady: true,
    subjects,
  };
}

function buildDifficultyRowsFromSubjectMap(
  submissionId: number,
  difficulty: DifficultyInput[],
  subjectIdByName: Map<string, number>
): Array<{ submissionId: number; subjectId: number; rating: DifficultyRatingValue }> {
  if (difficulty.length < 1) {
    return [];
  }

  return difficulty
    .map((item) => {
      const subjectId = subjectIdByName.get(normalizeSubjectName(item.subjectName));
      if (!subjectId) return null;

      return {
        submissionId,
        subjectId,
        rating: item.rating,
      };
    })
    .filter(
      (row): row is { submissionId: number; subjectId: number; rating: DifficultyRatingValue } => row !== null
    );
}

function buildDifficultyRows(
  submissionId: number,
  scoreResult: ScoreResult,
  difficulty: DifficultyInput[]
): Array<{ submissionId: number; subjectId: number; rating: DifficultyRatingValue }> {
  const subjectIdByName = new Map(
    scoreResult.scores.map((score) => [normalizeSubjectName(score.subjectName), score.subjectId] as const)
  );

  return buildDifficultyRowsFromSubjectMap(submissionId, difficulty, subjectIdByName);
}

function buildPendingUserAnswerRows(params: {
  submissionId: number;
  answers: AnswerInput[];
  subjects: SubmissionSubjectMeta[];
}): Array<{
  submissionId: number;
  subjectId: number;
  questionNumber: number;
  selectedAnswer: number;
  isCorrect: boolean;
}> {
  const subjectByName = new Map(
    params.subjects.map((subject) => [normalizeSubjectName(subject.name), subject] as const)
  );

  return params.answers.map((answer) => {
    const subject = subjectByName.get(normalizeSubjectName(answer.subjectName));
    if (!subject) {
      throw new Error(`${answer.subjectName} 과목이 현재 시험 유형에 존재하지 않습니다.`);
    }
    if (answer.questionNo < 1 || answer.questionNo > subject.questionCount) {
      throw new Error(`${answer.subjectName} ${answer.questionNo}번 문항이 유효 범위를 벗어났습니다.`);
    }

    return {
      submissionId: params.submissionId,
      subjectId: subject.id,
      questionNumber: answer.questionNo,
      selectedAnswer: answer.answer,
      isCorrect: false,
    };
  });
}

async function persistPendingSubmissionRows(
  tx: Prisma.TransactionClient,
  params: {
    submissionId: number;
    userAnswerRows: Array<{
      submissionId: number;
      subjectId: number;
      questionNumber: number;
      selectedAnswer: number;
      isCorrect: boolean;
    }>;
    difficultyRows: Array<{
      submissionId: number;
      subjectId: number;
      rating: DifficultyRatingValue;
    }>;
    replaceExisting: boolean;
  }
): Promise<void> {
  const { submissionId, userAnswerRows, difficultyRows, replaceExisting } = params;

  if (replaceExisting) {
    await tx.userAnswer.deleteMany({ where: { submissionId } });
    await tx.subjectScore.deleteMany({ where: { submissionId } });
    await tx.difficultyRating.deleteMany({ where: { submissionId } });
  }

  if (userAnswerRows.length > 0) {
    await tx.userAnswer.createMany({
      data: userAnswerRows,
    });
  }

  if (difficultyRows.length > 0) {
    await tx.difficultyRating.createMany({
      data: difficultyRows,
    });
  }
}

async function persistSubmissionScoreRows(
  tx: Prisma.TransactionClient,
  params: {
    submissionId: number;
    scoreResult: ScoreResult;
    difficulty: DifficultyInput[];
    replaceExisting: boolean;
  }
): Promise<void> {
  const { submissionId, scoreResult, difficulty, replaceExisting } = params;

  if (replaceExisting) {
    await tx.userAnswer.deleteMany({ where: { submissionId } });
    await tx.subjectScore.deleteMany({ where: { submissionId } });
    await tx.difficultyRating.deleteMany({ where: { submissionId } });
  }

  if (scoreResult.userAnswers.length > 0) {
    await tx.userAnswer.createMany({
      data: scoreResult.userAnswers.map((answer) => ({
        submissionId,
        subjectId: answer.subjectId,
        questionNumber: answer.questionNo,
        selectedAnswer: answer.selectedAnswer,
        isCorrect: answer.isCorrect,
      })),
    });
  }

  await tx.subjectScore.createMany({
    data: scoreResult.scores.map((score) => ({
      submissionId,
      subjectId: score.subjectId,
      rawScore: score.rawScore,
      isFailed: score.isCutoff,
    })),
  });

  const difficultyRows = buildDifficultyRows(submissionId, scoreResult, difficulty);
  if (difficultyRows.length > 0) {
    await tx.difficultyRating.createMany({
      data: difficultyRows,
    });
  }
}

function getUniqueConstraintTargets(error: Prisma.PrismaClientKnownRequestError): string[] {
  const targetRaw = error.meta?.target;
  if (Array.isArray(targetRaw)) {
    return targetRaw.map((item) => String(item));
  }
  if (typeof targetRaw === "string") {
    return [targetRaw];
  }
  return [];
}

function inferErrorStatus(message: string): number {
  if (message.includes("가산점") || message.includes("상한")) {
    return 400;
  }
  return BAD_REQUEST_ERROR_PATTERNS.some((pattern) => message.includes(pattern)) ? 400 : 500;
}

function isHeroBonusType(bonusType: BonusType): boolean {
  return bonusType === BonusType.HERO_3 || bonusType === BonusType.HERO_5;
}

function isVeteranBonusType(bonusType: BonusType): boolean {
  return bonusType === BonusType.VETERAN_5 || bonusType === BonusType.VETERAN_10;
}

type BonusPassCapRule = {
  minRecruitCount: number;
  capRatio: number;
  capPercentLabel: string;
  bonusLabel: string;
  matches: (bonusType: BonusType) => boolean;
};

function getBonusPassCapRule(bonusType: BonusType): BonusPassCapRule | null {
  if (isVeteranBonusType(bonusType)) {
    return {
      minRecruitCount: 4,
      capRatio: 0.3,
      capPercentLabel: "30%",
      bonusLabel: "취업지원대상자",
      matches: isVeteranBonusType,
    };
  }

  if (isHeroBonusType(bonusType)) {
    return {
      minRecruitCount: 10,
      capRatio: 0.1,
      capPercentLabel: "10%",
      bonusLabel: "의사상자",
      matches: isHeroBonusType,
    };
  }

  return null;
}

function getBonusMinRecruitError(bonusType: BonusType, recruitCount: number): string | null {
  const rule = getBonusPassCapRule(bonusType);
  if (!rule) return null;
  if (recruitCount >= rule.minRecruitCount) return null;
  return `${rule.bonusLabel} 가산점은 모집인원 ${rule.minRecruitCount}명 이상 지역에서만 선택 가능합니다.`;
}

function isSameScore(left: number, right: number): boolean {
  return Math.abs(left - right) < 0.000001;
}

function includeTieAtCutoff<T>(
  sortedRows: T[],
  baseCount: number,
  scoreSelector: (row: T) => number
): T[] {
  if (!Number.isInteger(baseCount) || baseCount < 1) {
    return [];
  }

  if (sortedRows.length <= baseCount) {
    return sortedRows;
  }

  const boundary = sortedRows[baseCount - 1];
  if (!boundary) {
    return sortedRows;
  }

  const boundaryScore = scoreSelector(boundary);
  let endIndex = baseCount;

  while (endIndex < sortedRows.length) {
    const row = sortedRows[endIndex];
    if (!row || !isSameScore(scoreSelector(row), boundaryScore)) {
      break;
    }
    endIndex += 1;
  }

  return sortedRows.slice(0, endIndex);
}

async function validateBonusPassCap(params: {
  examId: number;
  regionId: number;
  examType: ExamType;
  recruitCount: number;
  submissionId?: number;
  bonusType: BonusType;
  totalScore: number;
  finalScore: number;
  hasCutoff: boolean;
}): Promise<void> {
  const rule = getBonusPassCapRule(params.bonusType);
  if (!rule || params.hasCutoff) {
    return;
  }

  if (params.recruitCount < rule.minRecruitCount) {
    throw new Error(`${rule.bonusLabel} 가산점은 모집인원 ${rule.minRecruitCount}명 이상 지역에서만 선택 가능합니다.`);
  }

  const capCount = Math.floor(params.recruitCount * rule.capRatio);
  if (capCount < 1) {
    throw new Error(
      `${rule.bonusLabel} 가산점 합격 상한(선발예정인원 ${rule.capPercentLabel})을 적용할 수 없는 모집단입니다.`
    );
  }

  const passMultiple = getPassMultiple(params.recruitCount, params.examType);
  const passCount = Math.ceil(params.recruitCount * passMultiple);
  if (passCount < 1) {
    return;
  }

  const existingRows = await prisma.submission.findMany({
    where: {
      examId: params.examId,
      regionId: params.regionId,
      examType: params.examType,
      subjectScores: {
        some: {},
        none: {
          isFailed: true,
        },
      },
    },
    select: {
      id: true,
      totalScore: true,
      finalScore: true,
      bonusType: true,
    },
  });

  const fallbackId =
    existingRows.reduce((maxId, row) => (row.id > maxId ? row.id : maxId), 0) + 1;
  const candidateId = params.submissionId ?? fallbackId;

  const rows = existingRows
    .filter((row) => row.id !== candidateId)
    .map((row) => ({
      id: row.id,
      totalScore: Number(row.totalScore),
      finalScore: Number(row.finalScore),
      bonusType: row.bonusType,
    }));

  rows.push({
    id: candidateId,
    totalScore: params.totalScore,
    finalScore: params.finalScore,
    bonusType: params.bonusType,
  });

  // 공문 단서: 응시인원이 선발예정인원 이하인 경우 가점 합격 상한을 적용하지 않음.
  if (rows.length <= params.recruitCount) {
    return;
  }

  const sortedByFinal = [...rows].sort(
    (left, right) => right.finalScore - left.finalScore || left.id - right.id
  );
  const passByFinal = includeTieAtCutoff(sortedByFinal, passCount, (row) => row.finalScore);

  const sortedByRaw = [...rows].sort(
    (left, right) => right.totalScore - left.totalScore || left.id - right.id
  );
  const passByRaw = includeTieAtCutoff(sortedByRaw, passCount, (row) => row.totalScore);

  const rawPasserIds = new Set(passByRaw.map((row) => row.id));
  const bonusBeneficiaries = passByFinal.filter(
    (row) => rule.matches(row.bonusType) && !rawPasserIds.has(row.id)
  );

  if (bonusBeneficiaries.length > capCount) {
    throw new Error(
      `${rule.bonusLabel} 가산점으로 합격 가능한 인원 상한(${capCount}명, 선발예정인원의 ${rule.capPercentLabel})을 초과합니다.`
    );
  }
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  try {
    let body: SubmissionRequestBody;
    try {
      body = (await request.json()) as SubmissionRequestBody;
    } catch {
      return NextResponse.json({ error: "요청 본문(JSON) 형식이 올바르지 않습니다." }, { status: 400 });
    }

    const userId = parsePositiveInt(session.user.id);
    if (!userId) {
      return NextResponse.json({ error: "사용자 정보를 확인할 수 없습니다." }, { status: 401 });
    }

    const examType = parseExamType(body.examType);
    if (!examType) {
      return NextResponse.json({ error: "채용유형은 PUBLIC, CAREER_RESCUE, CAREER_ACADEMIC, CAREER_EMT만 가능합니다." }, { status: 400 });
    }

    const settings = await getSiteSettingsUncached();
    const answerInputEnabled = Boolean(settings["site.answerInputEnabled"] ?? true);
    const careerExamEnabled = Boolean(settings["site.careerExamEnabled"] ?? true);
    if (!answerInputEnabled) {
      return NextResponse.json(
        { error: getAnswerInputDisabledMessage(settings) },
        { status: 403 }
      );
    }
    if ((examType === ExamType.CAREER_RESCUE || examType === ExamType.CAREER_ACADEMIC || examType === ExamType.CAREER_EMT) && !careerExamEnabled) {
      return NextResponse.json(
        { error: "현재 경채 시험이 비활성화되어 제출할 수 없습니다." },
        { status: 400 }
      );
    }

    const gender = parseGender(body.gender);
    if (!gender) {
      return NextResponse.json({ error: "성별 정보가 올바르지 않습니다." }, { status: 400 });
    }

    const rescueMaleOnlyError = getRescueMaleOnlyError(examType, gender);
    if (rescueMaleOnlyError) {
      return NextResponse.json({ error: rescueMaleOnlyError }, { status: 400 });
    }

    const regionId = parsePositiveInt(body.regionId);
    if (!regionId) {
      return NextResponse.json({ error: "지역 정보가 올바르지 않습니다." }, { status: 400 });
    }

    const answers = parseAnswers(body.answers);
    if (answers.length === 0) {
      return NextResponse.json({ error: "최소 1개 이상의 답안을 입력해 주세요." }, { status: 400 });
    }

    const difficulty = parseDifficulty(body.difficulty);
    const submitDurationMs = parseNonNegativeInt(body.submitDurationMs);

    const requestedExamId = parsePositiveInt(body.examId);
    const exam = requestedExamId
      ? await prisma.exam.findUnique({
        where: { id: requestedExamId },
        select: { id: true, name: true, isActive: true },
      })
      : await prisma.exam.findFirst({
        where: { isActive: true },
        orderBy: [{ examDate: "desc" }, { id: "desc" }],
        select: { id: true, name: true, isActive: true },
      });

    if (!exam) {
      return NextResponse.json({ error: "제출 가능한 시험이 없습니다." }, { status: 404 });
    }
    if (!exam.isActive) {
      return NextResponse.json({ error: "현재 활성화된 시험에만 성적 입력이 가능합니다." }, { status: 400 });
    }

    const existingSubmission = await prisma.submission.findFirst({
      where: {
        userId,
        examId: exam.id,
      },
      select: {
        id: true,
      },
    });
    if (existingSubmission) {
      return NextResponse.json(
        { error: "이미 해당 시험에 제출한 기록이 있습니다." },
        { status: 409 }
      );
    }

    const region = await prisma.region.findUnique({
      where: { id: regionId },
      select: {
        id: true,
        name: true,
        isActive: true,
      },
    });

    if (!region) {
      return NextResponse.json({ error: "선택한 지역을 찾을 수 없습니다." }, { status: 404 });
    }
    if (!region.isActive) {
      return NextResponse.json(
        { error: "비활성화된 지역은 성적 입력이 불가능합니다. 관리자에게 문의해주세요." },
        { status: 400 }
      );
    }

    const examNumber = parseExamNumberInput(body.examNumber);
    if (!examNumber) {
      return NextResponse.json({ error: "응시번호는 10자리 숫자로 입력해 주세요." }, { status: 400 });
    }

    const quota = await prisma.examRegionQuota.findUnique({
      where: { examId_regionId: { examId: exam.id, regionId } },
      select: {
        recruitPublicMale: true,
        recruitPublicFemale: true,
        recruitRescue: true,
        recruitAcademicMale: true,
        recruitAcademicFemale: true,
        recruitAcademicCombined: true,
        recruitEmtMale: true,
        recruitEmtFemale: true,
        applicantPublicMale: true,
        applicantPublicFemale: true,
        applicantRescue: true,
        applicantAcademicMale: true,
        applicantAcademicFemale: true,
        applicantAcademicCombined: true,
        applicantEmtMale: true,
        applicantEmtFemale: true,
        examNumberStartPublicMale: true,
        examNumberEndPublicMale: true,
        examNumberStartPublicFemale: true,
        examNumberEndPublicFemale: true,
        examNumberStartCareerRescue: true,
        examNumberEndCareerRescue: true,
        examNumberStartCareerAcademicMale: true,
        examNumberEndCareerAcademicMale: true,
        examNumberStartCareerAcademicFemale: true,
        examNumberEndCareerAcademicFemale: true,
        examNumberStartCareerAcademicCombined: true,
        examNumberEndCareerAcademicCombined: true,
        examNumberStartCareerEmtMale: true,
        examNumberEndCareerEmtMale: true,
        examNumberStartCareerEmtFemale: true,
        examNumberEndCareerEmtFemale: true,
        examNumberStart: true,
        examNumberEnd: true,
      },
    });

    const examNumberValidation = validateExamNumberWithRange({
      examNumber,
      context: {
        examType,
        gender,
        recruitAcademicCombined: quota?.recruitAcademicCombined ?? 0,
      },
      quota,
    });
    if (!examNumberValidation.ok) {
      return NextResponse.json(
        { error: examNumberValidation.message ?? "응시번호 검증에 실패했습니다." },
        { status: 400 }
      );
    }

    const bonusType = resolveBonusType(body);
    const bonusRate = getBonusPercent(bonusType);
    const certificateBonus = parseCertificateBonus(body.certificateBonus);
    const recruitCount = quota ? getRegionRecruitCount(quota, examType, gender === "MALE" ? "MALE" : "FEMALE") : 0;
    if (!Number.isInteger(recruitCount) || recruitCount < 1) {
      const message =
        (examType === ExamType.CAREER_RESCUE || examType === ExamType.CAREER_ACADEMIC || examType === ExamType.CAREER_EMT)
          ? "선택한 지역의 경채 모집인원이 설정되지 않았습니다. 관리자에게 문의해주세요."
          : "선택한 지역의 모집인원이 올바르지 않습니다.";
      return NextResponse.json({ error: message }, { status: 400 });
    }

    const bonusMinRecruitError = getBonusMinRecruitError(bonusType, recruitCount);
    if (bonusMinRecruitError) {
      return NextResponse.json({ error: bonusMinRecruitError }, { status: 400 });
    }

    const scoringReadiness = await resolveScoringReadiness({
      examId: exam.id,
      examType,
    });
    const scoringStatus = scoringReadiness.isReady
      ? SubmissionScoringStatus.SCORED
      : SubmissionScoringStatus.PENDING;
    const subjectIdByName = buildSubjectIdByName(scoringReadiness.subjects);
    let scoreResult: ScoreResult | null = null;
    let isSuspicious = false;
    let suspiciousReason: string | null = null;

    if (scoringStatus === SubmissionScoringStatus.SCORED) {
      scoreResult = await calculateScore({
        examId: exam.id,
        examType,
        answers,
        bonusType,
        bonusRate,
      });

      await validateBonusPassCap({
        examId: exam.id,
        regionId: region.id,
        examType,
        recruitCount,
        bonusType,
        totalScore: scoreResult.totalScore,
        finalScore: scoreResult.finalScore,
        hasCutoff: scoreResult.hasCutoff,
      });

      const maxScore = examType === ExamType.PUBLIC ? 300 : 200;
      const answerPatternResult = validateAnswerPattern({
        answers: answers.map((a) => a.answer),
        totalScore: scoreResult.totalScore,
        maxScore,
        submitDurationMs,
      });
      isSuspicious = answerPatternResult.isSuspicious;
      suspiciousReason = answerPatternResult.isSuspicious
        ? answerPatternResult.reasons.join("; ")
        : null;
    }

    const submission = await prisma.$transaction(async (tx) => {
      const savedSubmission = await tx.submission.create({
        data: {
          examId: exam.id,
          userId,
          regionId: region.id,
          examType,
          gender,
          examNumber,
          totalScore: scoreResult?.totalScore ?? 0,
          bonusType,
          bonusRate,
          certificateBonus,
          finalScore: scoreResult?.finalScore ?? 0,
          scoringStatus,
          submitDurationMs,
          isSuspicious,
          suspiciousReason,
        },
      });

      if (scoreResult) {
        await persistSubmissionScoreRows(tx, {
          submissionId: savedSubmission.id,
          scoreResult,
          difficulty,
          replaceExisting: false,
        });
      } else {
        const pendingAnswerRows = buildPendingUserAnswerRows({
          submissionId: savedSubmission.id,
          answers,
          subjects: scoringReadiness.subjects,
        });
        const difficultyRows = buildDifficultyRowsFromSubjectMap(
          savedSubmission.id,
          difficulty,
          subjectIdByName
        );
        await persistPendingSubmissionRows(tx, {
          submissionId: savedSubmission.id,
          userAnswerRows: pendingAnswerRows,
          difficultyRows,
          replaceExisting: false,
        });
      }

      await tx.submissionLog.create({
        data: {
          submissionId: savedSubmission.id,
          userId,
          action: "CREATE",
          ipAddress: getClientIp(request),
          submitDurationMs,
        },
      });

      return savedSubmission;
    });

    if (scoreResult) {
      invalidateCorrectRateCache(exam.id, examType);
    }

    return NextResponse.json({
      success: true,
      submissionId: submission.id,
      scoringStatus,
      message:
        scoringStatus === SubmissionScoringStatus.PENDING
          ? "답안 접수가 완료되었습니다. 가답안 발표 후 자동 채점됩니다."
          : null,
      result: scoreResult,
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const target = getUniqueConstraintTargets(error);

      if (target.some((item) => item.includes("examNumber"))) {
        return NextResponse.json(
          { error: "해당 지역에 동일한 응시번호가 이미 존재합니다. 응시번호를 확인해 주세요." },
          { status: 409 }
        );
      }

      return NextResponse.json(
        { error: "이미 해당 시험에 제출한 기록이 있습니다." },
        { status: 409 }
      );
    }
    const message = error instanceof Error ? error.message : "답안 제출 처리 중 오류가 발생했습니다.";
    const status = inferErrorStatus(message);

    if (status === 500) {
      console.error("답안 제출 처리 중 오류가 발생했습니다.", error);
    }

    return NextResponse.json({ error: message }, { status });
  }
}

export async function PUT(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  try {
    let body: SubmissionRequestBody & { submissionId: unknown };
    try {
      body = (await request.json()) as SubmissionRequestBody & { submissionId: unknown };
    } catch {
      return NextResponse.json({ error: "요청 본문(JSON) 형식이 올바르지 않습니다." }, { status: 400 });
    }
    const submissionId = parsePositiveInt(body.submissionId);

    if (!submissionId) {
      return NextResponse.json({ error: "수정할 답안의 ID가 누락되었습니다." }, { status: 400 });
    }

    const userId = parsePositiveInt(session.user.id);
    if (!userId) {
      return NextResponse.json({ error: "사용자 정보를 확인할 수 없습니다." }, { status: 401 });
    }

    const existingSubmission = await prisma.submission.findUnique({
      where: { id: submissionId },
      select: {
        id: true, userId: true, examId: true, editCount: true,
        examType: true, regionId: true, examNumber: true, gender: true, bonusType: true, certificateBonus: true, scoringStatus: true,
      },
    });

    if (!existingSubmission || existingSubmission.userId !== userId) {
      return NextResponse.json({ error: "수정 권한이 없거나 답안을 찾을 수 없습니다." }, { status: 403 });
    }

    const settings = await getSiteSettingsUncached();
    const maxEditLimit = (settings["site.submissionEditLimit"] as number) ?? 3;
    const answerInputEnabled = Boolean(settings["site.answerInputEnabled"] ?? true);
    const careerExamEnabled = Boolean(settings["site.careerExamEnabled"] ?? true);
    const editLimitErrorMessage = "답안 수정 제한 횟수를 초과했거나 수정이 불가능합니다.";
    if (!answerInputEnabled) {
      return NextResponse.json(
        { error: getAnswerInputDisabledMessage(settings) },
        { status: 403 }
      );
    }
    if (maxEditLimit === 0 || existingSubmission.editCount >= maxEditLimit) {
      return NextResponse.json({ error: editLimitErrorMessage }, { status: 403 });
    }

    const examType = parseExamType(body.examType);
    if (!examType) {
      return NextResponse.json({ error: "채용유형은 PUBLIC, CAREER_RESCUE, CAREER_ACADEMIC, CAREER_EMT만 가능합니다." }, { status: 400 });
    }

    if ((examType === ExamType.CAREER_RESCUE || examType === ExamType.CAREER_ACADEMIC || examType === ExamType.CAREER_EMT) && !careerExamEnabled) {
      return NextResponse.json(
        { error: "현재 경채 시험이 비활성화되어 수정할 수 없습니다." },
        { status: 400 }
      );
    }

    const gender = parseGender(body.gender);
    if (!gender) {
      return NextResponse.json({ error: "성별 정보가 올바르지 않습니다." }, { status: 400 });
    }

    const rescueMaleOnlyErrorEdit = getRescueMaleOnlyError(examType, gender);
    if (rescueMaleOnlyErrorEdit) {
      return NextResponse.json({ error: rescueMaleOnlyErrorEdit }, { status: 400 });
    }

    const regionId = parsePositiveInt(body.regionId);
    if (!regionId) {
      return NextResponse.json({ error: "지역 정보가 올바르지 않습니다." }, { status: 400 });
    }

    const answers = parseAnswers(body.answers);
    if (answers.length === 0) {
      return NextResponse.json({ error: "최소 1개 이상의 답안을 입력해 주세요." }, { status: 400 });
    }

    const difficulty = parseDifficulty(body.difficulty);
    const submitDurationMsEdit = parseNonNegativeInt(body.submitDurationMs);

    const requestedExamId = parsePositiveInt(body.examId);
    if (requestedExamId && requestedExamId !== existingSubmission.examId) {
      return NextResponse.json(
        { error: "기존 제출과 다른 시험으로는 수정할 수 없습니다." },
        { status: 400 }
      );
    }

    const exam = await prisma.exam.findUnique({
      where: { id: existingSubmission.examId },
      select: { id: true, name: true, isActive: true },
    });

    if (!exam) {
      return NextResponse.json({ error: "기존 제출의 시험 정보를 찾을 수 없습니다." }, { status: 404 });
    }
    if (!exam.isActive) {
      return NextResponse.json({ error: "현재 활성화된 시험에만 성적 수정이 가능합니다." }, { status: 400 });
    }

    const region = await prisma.region.findUnique({
      where: { id: regionId },
      select: {
        id: true,
        name: true,
        isActive: true,
      },
    });

    if (!region) {
      return NextResponse.json({ error: "선택한 지역을 찾을 수 없습니다." }, { status: 404 });
    }
    if (!region.isActive) {
      return NextResponse.json(
        { error: "비활성화된 지역은 성적 입력이 불가능합니다. 관리자에게 문의해주세요." },
        { status: 400 }
      );
    }

    const examNumber = parseExamNumberInput(body.examNumber);
    if (!examNumber) {
      return NextResponse.json({ error: "응시번호는 10자리 숫자로 입력해 주세요." }, { status: 400 });
    }

    const quotaForEdit = await prisma.examRegionQuota.findUnique({
      where: { examId_regionId: { examId: exam.id, regionId } },
      select: {
        recruitPublicMale: true,
        recruitPublicFemale: true,
        recruitRescue: true,
        recruitAcademicMale: true,
        recruitAcademicFemale: true,
        recruitAcademicCombined: true,
        recruitEmtMale: true,
        recruitEmtFemale: true,
        applicantPublicMale: true,
        applicantPublicFemale: true,
        applicantRescue: true,
        applicantAcademicMale: true,
        applicantAcademicFemale: true,
        applicantAcademicCombined: true,
        applicantEmtMale: true,
        applicantEmtFemale: true,
        examNumberStartPublicMale: true,
        examNumberEndPublicMale: true,
        examNumberStartPublicFemale: true,
        examNumberEndPublicFemale: true,
        examNumberStartCareerRescue: true,
        examNumberEndCareerRescue: true,
        examNumberStartCareerAcademicMale: true,
        examNumberEndCareerAcademicMale: true,
        examNumberStartCareerAcademicFemale: true,
        examNumberEndCareerAcademicFemale: true,
        examNumberStartCareerAcademicCombined: true,
        examNumberEndCareerAcademicCombined: true,
        examNumberStartCareerEmtMale: true,
        examNumberEndCareerEmtMale: true,
        examNumberStartCareerEmtFemale: true,
        examNumberEndCareerEmtFemale: true,
        examNumberStart: true,
        examNumberEnd: true,
      },
    });

    const editExamNumberValidation = validateExamNumberWithRange({
      examNumber,
      context: {
        examType,
        gender,
        recruitAcademicCombined: quotaForEdit?.recruitAcademicCombined ?? 0,
      },
      quota: quotaForEdit,
    });
    if (!editExamNumberValidation.ok) {
      return NextResponse.json(
        { error: editExamNumberValidation.message ?? "응시번호 검증에 실패했습니다." },
        { status: 400 }
      );
    }

    const bonusType = resolveBonusType(body);
    const bonusRate = getBonusPercent(bonusType);
    const certificateBonus = parseCertificateBonus(body.certificateBonus);
    const recruitCount = quotaForEdit ? getRegionRecruitCount(quotaForEdit, examType, gender === "MALE" ? "MALE" : "FEMALE") : 0;
    if (!Number.isInteger(recruitCount) || recruitCount < 1) {
      const message =
        (examType === ExamType.CAREER_RESCUE || examType === ExamType.CAREER_ACADEMIC || examType === ExamType.CAREER_EMT)
          ? "선택한 지역의 경채 모집인원이 설정되지 않았습니다. 관리자에게 문의해주세요."
          : "선택한 지역의 모집인원이 올바르지 않습니다.";
      return NextResponse.json({ error: message }, { status: 400 });
    }

    const bonusMinRecruitError = getBonusMinRecruitError(bonusType, recruitCount);
    if (bonusMinRecruitError) {
      return NextResponse.json({ error: bonusMinRecruitError }, { status: 400 });
    }

    const scoringReadiness = await resolveScoringReadiness({
      examId: exam.id,
      examType,
    });
    const scoringStatus = scoringReadiness.isReady
      ? SubmissionScoringStatus.SCORED
      : SubmissionScoringStatus.PENDING;
    const subjectIdByName = buildSubjectIdByName(scoringReadiness.subjects);
    let scoreResult: ScoreResult | null = null;
    let isSuspicious = false;
    let suspiciousReason: string | null = null;

    if (scoringStatus === SubmissionScoringStatus.SCORED) {
      scoreResult = await calculateScore({
        examId: exam.id,
        examType,
        answers,
        bonusType,
        bonusRate,
      });

      await validateBonusPassCap({
        examId: exam.id,
        regionId: region.id,
        examType,
        recruitCount,
        submissionId,
        bonusType,
        totalScore: scoreResult.totalScore,
        finalScore: scoreResult.finalScore,
        hasCutoff: scoreResult.hasCutoff,
      });

      const maxScoreEdit = examType === ExamType.PUBLIC ? 300 : 200;
      const answerPatternResult = validateAnswerPattern({
        answers: answers.map((a) => a.answer),
        totalScore: scoreResult.totalScore,
        maxScore: maxScoreEdit,
        submitDurationMs: submitDurationMsEdit,
      });
      isSuspicious = answerPatternResult.isSuspicious;
      suspiciousReason = answerPatternResult.isSuspicious
        ? answerPatternResult.reasons.join("; ")
        : null;
    }

    // 변경된 필드 감지 (감사 로그용)
    const changedFields: string[] = [];
    if (existingSubmission.examType !== examType) changedFields.push("examType");
    if (existingSubmission.regionId !== regionId) changedFields.push("regionId");
    if (existingSubmission.examNumber !== examNumber) changedFields.push("examNumber");
    if (existingSubmission.gender !== gender) changedFields.push("gender");
    if (existingSubmission.bonusType !== bonusType) changedFields.push("bonusType");
    if (existingSubmission.certificateBonus !== certificateBonus) changedFields.push("certificateBonus");
    if (existingSubmission.scoringStatus !== scoringStatus) changedFields.push("scoringStatus");
    changedFields.push("answers");

    const updated = await prisma.$transaction(async (tx) => {
      const updatedSubmission = await tx.submission.updateMany({
        where: {
          id: submissionId,
          userId,
          editCount: { lt: maxEditLimit },
        },
        data: {
          examId: exam.id,
          regionId: region.id,
          examType,
          gender,
          examNumber,
          totalScore: scoreResult?.totalScore ?? 0,
          bonusType,
          bonusRate,
          certificateBonus,
          finalScore: scoreResult?.finalScore ?? 0,
          scoringStatus,
          submitDurationMs: submitDurationMsEdit,
          editCount: { increment: 1 },
          isSuspicious,
          suspiciousReason,
        },
      });

      if (updatedSubmission.count < 1) {
        return null;
      }

      if (scoreResult) {
        await persistSubmissionScoreRows(tx, {
          submissionId,
          scoreResult,
          difficulty,
          replaceExisting: true,
        });
      } else {
        const pendingAnswerRows = buildPendingUserAnswerRows({
          submissionId,
          answers,
          subjects: scoringReadiness.subjects,
        });
        const difficultyRows = buildDifficultyRowsFromSubjectMap(
          submissionId,
          difficulty,
          subjectIdByName
        );
        await persistPendingSubmissionRows(tx, {
          submissionId,
          userAnswerRows: pendingAnswerRows,
          difficultyRows,
          replaceExisting: true,
        });
      }

      await tx.submissionLog.create({
        data: {
          submissionId,
          userId,
          action: "UPDATE",
          ipAddress: getClientIp(request),
          submitDurationMs: submitDurationMsEdit,
          changedFields: changedFields.length > 0 ? JSON.stringify(changedFields) : null,
        },
      });

      return { id: submissionId };
    });

    if (!updated) {
      return NextResponse.json({ error: editLimitErrorMessage }, { status: 403 });
    }

    if (scoreResult || existingSubmission.scoringStatus === SubmissionScoringStatus.SCORED) {
      invalidateCorrectRateCache(exam.id, examType);
    }

    return NextResponse.json({
      success: true,
      submissionId: updated.id,
      scoringStatus,
      message:
        scoringStatus === SubmissionScoringStatus.PENDING
          ? "답안 수정이 완료되었습니다. 가답안 발표 후 자동 채점됩니다."
          : null,
      result: scoreResult,
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const target = getUniqueConstraintTargets(error);

      if (target.some((item) => item.includes("examNumber"))) {
        return NextResponse.json(
          { error: "해당 지역에 동일한 응시번호가 이미 존재합니다. 응시번호를 확인해 주세요." },
          { status: 409 }
        );
      }
    }
    const message = error instanceof Error ? error.message : "답안 수정 처리 중 오류가 발생했습니다.";
    const status = inferErrorStatus(message);

    if (status === 500) {
      console.error("답안 수정 처리 중 오류가 발생했습니다.", error);
    }

    return NextResponse.json({ error: message }, { status });
  }
}
