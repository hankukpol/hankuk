"use client";

import { ExamType, Gender } from "@prisma/client";
import ExamFeatureDisabledNotice from "@/components/exam/ExamFeatureDisabledNotice";
import { useSession } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import DifficultySelector, { type DifficultyRating } from "@/components/exam/DifficultySelector";
import OmrInputModeToggle, { type OmrInputMode } from "@/components/exam/OmrInputModeToggle";
import QuickOmrInput from "@/components/exam/QuickOmrInput";
import RadioOmrInput from "@/components/exam/RadioOmrInput";
import { useToast } from "@/components/providers/ToastProvider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { withTenantPrefix } from "@/lib/tenant";

type BonusVeteran = 0 | 5 | 10;
type BonusHero = 0 | 3 | 5;
type BonusCertificate = 0 | 1 | 2 | 3 | 4 | 5;
type AnswersBySubject = Record<string, Record<number, number | null>>;
type DifficultyBySubject = Record<string, DifficultyRating | null>;

const OMR_INPUT_MODE_STORAGE_KEY = "exam.omr.input-mode";
const DIFFICULTY_LABEL: Record<DifficultyRating, string> = {
  VERY_EASY: "매우 쉬움",
  EASY: "쉬움",
  NORMAL: "보통",
  HARD: "어려움",
  VERY_HARD: "매우 어려움",
};

interface ExamSummary {
  id: number;
  name: string;
  year: number;
  round: number;
  examDate: string;
  isActive: boolean;
}

interface RegionInfo {
  id: number;
  name: string;
  recruitPublicMale: number;
  recruitPublicFemale: number;
  recruitRescue: number;
  recruitAcademicMale: number;
  recruitAcademicFemale: number;
  recruitAcademicCombined: number;
  recruitEmtMale: number;
  recruitEmtFemale: number;
}

interface SubjectInfo {
  id: number;
  name: string;
  questionCount: number;
  pointPerQuestion: number;
  maxScore: number;
}

interface ExamsResponse {
  activeExam: ExamSummary | null;
  careerExamEnabled: boolean;
  regions: RegionInfo[];
  subjectGroups: {
    PUBLIC: SubjectInfo[];
    CAREER_RESCUE: SubjectInfo[];
    CAREER_ACADEMIC: SubjectInfo[];
    CAREER_EMT: SubjectInfo[];
  };
}

interface SubmissionResponse {
  success: boolean;
  submissionId: number;
}

type PublicSiteSettings = Record<string, string | boolean | number | null>;

interface SiteSettingsResponse {
  settings?: PublicSiteSettings;
  error?: string;
}

type EditBonusType = "NONE" | "VETERAN_5" | "VETERAN_10" | "HERO_3" | "HERO_5";

interface EditSubmissionResponse {
  submission?: {
    id: number;
    gender: Gender;
    examType: ExamType;
    regionId: number;
    examNumber: string | null;
    bonusType: EditBonusType;
    certificateBonus: number;
    editCount: number;
    maxEditLimit: number;
  };
  scores: Array<{
    subjectName: string;
    difficulty: DifficultyRating | null;
    answers: Array<{
      questionNumber: number;
      selectedAnswer: number;
    }>;
  }>;
  error?: string;
}

interface ExamInputPageProps {
  embedded?: boolean;
  onSubmitted?: (submissionId: number) => void;
}

function createEmptyAnswers(subjects: SubjectInfo[]): AnswersBySubject {
  const next: AnswersBySubject = {};
  for (const subject of subjects) {
    const byQuestion: Record<number, number | null> = {};
    for (let questionNo = 1; questionNo <= subject.questionCount; questionNo += 1) {
      byQuestion[questionNo] = null;
    }
    next[subject.name] = byQuestion;
  }
  return next;
}

function createEmptyDifficulty(subjects: SubjectInfo[]): DifficultyBySubject {
  const next: DifficultyBySubject = {};
  for (const subject of subjects) {
    next[subject.name] = null;
  }
  return next;
}

function progressColor(percentage: number): string {
  if (percentage >= 100) return "bg-emerald-500";
  if (percentage >= 50) return "bg-amber-500";
  return "bg-rose-500";
}

function getRecruitCount(region: RegionInfo, examType: ExamType): number {
  if (examType === ExamType.CAREER_RESCUE) return region.recruitRescue;
  if (examType === ExamType.CAREER_ACADEMIC) return region.recruitAcademicMale + region.recruitAcademicFemale + region.recruitAcademicCombined;
  if (examType === ExamType.CAREER_EMT) return region.recruitEmtMale + region.recruitEmtFemale;
  return region.recruitPublicMale + region.recruitPublicFemale;
}

function getDefaultInputMode(): OmrInputMode {
  if (typeof window === "undefined") return "radio";

  const isTouchDevice = "ontouchstart" in window || navigator.maxTouchPoints > 0;
  const isNarrowScreen = window.innerWidth < 768;
  return isTouchDevice || isNarrowScreen ? "radio" : "quick";
}

type SubjectProgress = {
  subjectName: string;
  filled: number;
  total: number;
};

function buildSubjectProgress(subjects: SubjectInfo[], answersBySubject: AnswersBySubject): SubjectProgress[] {
  return subjects.map((subject) => {
    const subjectAnswers = answersBySubject[subject.name] ?? {};
    const filledCount = Object.values(subjectAnswers).filter(
      (answer): answer is number => typeof answer === "number"
    ).length;

    return {
      subjectName: subject.name,
      filled: filledCount,
      total: subject.questionCount,
    };
  });
}

function summarizeSubjectProgress(progressBySubject: SubjectProgress[]): { total: number; filled: number } {
  const total = progressBySubject.reduce((sum, item) => sum + item.total, 0);
  const filled = progressBySubject.reduce((sum, item) => sum + item.filled, 0);
  return { total, filled };
}

function collectSelectedAnswers(
  subjects: SubjectInfo[],
  answersBySubject: AnswersBySubject
): Array<{ subjectName: string; questionNo: number; answer: number }> {
  const answers: Array<{ subjectName: string; questionNo: number; answer: number }> = [];
  for (const subject of subjects) {
    const subjectAnswers = answersBySubject[subject.name] ?? {};
    for (let questionNo = 1; questionNo <= subject.questionCount; questionNo += 1) {
      const selected = subjectAnswers[questionNo];
      if (typeof selected === "number") {
        answers.push({
          subjectName: subject.name,
          questionNo,
          answer: selected,
        });
      }
    }
  }
  return answers;
}

export default function ExamInputPage({
  embedded = false,
  onSubmitted,
}: ExamInputPageProps) {
  const tenantType = "fire";
  const router = useRouter();
  const searchParams = useSearchParams();
  const editId = searchParams.get("edit");
  const { data: session, status } = useSession();
  const { showErrorToast } = useToast();

  const [meta, setMeta] = useState<ExamsResponse | null>(null);
  const [isMetaLoading, setIsMetaLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [autoEditId, setAutoEditId] = useState<number | null>(null);
  const [editCountInfo, setEditCountInfo] = useState<{ editCount: number; maxEditLimit: number } | null>(null);
  const [siteSettings, setSiteSettings] = useState<PublicSiteSettings>({});

  const [gender, setGender] = useState<Gender | "">("");
  const [examType, setExamType] = useState<ExamType>(ExamType.PUBLIC);
  const [regionId, setRegionId] = useState<number | "">("");
  const [examNumber, setExamNumber] = useState("");
  const [examNumberStatus, setExamNumberStatus] = useState<
    "idle" | "checking" | "available" | "unavailable"
  >("idle");
  const [examNumberMessage, setExamNumberMessage] = useState("");
  const examNumberTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pageLoadedAtRef = useRef(Date.now());
  const [veteranPercent, setVeteranPercent] = useState<BonusVeteran>(0);
  const [heroPercent, setHeroPercent] = useState<BonusHero>(0);
  const [certificateBonus, setCertificateBonus] = useState<BonusCertificate>(0);
  const [activeSubjectIndex, setActiveSubjectIndex] = useState(0);
  const [inputMode, setInputMode] = useState<OmrInputMode>("radio");
  const [quickFocusToken, setQuickFocusToken] = useState(0);

  const [answerStore, setAnswerStore] = useState<Record<ExamType, AnswersBySubject>>({
    [ExamType.PUBLIC]: {},
    [ExamType.CAREER]: {},
    [ExamType.CAREER_RESCUE]: {},
    [ExamType.CAREER_ACADEMIC]: {},
    [ExamType.CAREER_EMT]: {},
  });
  const [difficultyStore, setDifficultyStore] = useState<Record<ExamType, DifficultyBySubject>>({
    [ExamType.PUBLIC]: {},
    [ExamType.CAREER]: {},
    [ExamType.CAREER_RESCUE]: {},
    [ExamType.CAREER_ACADEMIC]: {},
    [ExamType.CAREER_EMT]: {},
  });

  const effectiveEditId = editId ? Number(editId) : autoEditId;
  const isEditLimitReached = editCountInfo !== null && editCountInfo.maxEditLimit > 0 && editCountInfo.editCount >= editCountInfo.maxEditLimit;

  useEffect(() => {
    let isMounted = true;

    async function loadMeta() {
      setIsMetaLoading(true);
      setErrorMessage("");
      try {
        const [metaRes, editRes, siteSettingsRes] = await Promise.all([
          fetch("/api/exams?active=true", { method: "GET", cache: "no-store" }),
          fetch(editId ? `/api/result?submissionId=${editId}` : `/api/result?optional=1`, { method: "GET", cache: "no-store" }),
          fetch("/api/site-settings", { method: "GET", cache: "no-store" }),
        ]);

        const data = (await metaRes.json()) as ExamsResponse & { error?: string };
        if (!metaRes.ok) {
          throw new Error(data.error ?? "시험 정보를 불러오지 못했습니다.");
        }

        let editData: EditSubmissionResponse | null = null;
        if (editRes.ok) {
          editData = (await editRes.json()) as EditSubmissionResponse;
        } else if (editId) {
          // URL에 ?edit=<id>가 있는데 조회 실패 → 에러
          const parsed = (await editRes.json()) as { error?: string };
          throw new Error(parsed.error ?? "수정할 답안을 불러오지 못했습니다.");
        }
        // editId 없이 조회했는데 404 → 신규 사용자, 정상 흐름

        let nextSiteSettings: PublicSiteSettings = {};
        if (siteSettingsRes.ok) {
          const parsed = (await siteSettingsRes.json()) as SiteSettingsResponse;
          nextSiteSettings = parsed.settings ?? {};
        }

        if (!isMounted) return;

        setMeta(data);
        setSiteSettings(nextSiteSettings);

        if (editData && editData.submission) {
          const sub = editData.submission;
          // 기존 제출 자동 감지: URL에 editId 없어도 submissionId 저장
          if (!editId && sub.id) {
            setAutoEditId(sub.id);
          }
          setEditCountInfo({ editCount: sub.editCount ?? 0, maxEditLimit: sub.maxEditLimit ?? 3 });
          setGender(sub.gender);
          const restoredExamType =
            (sub.examType === ExamType.CAREER_RESCUE || sub.examType === ExamType.CAREER_ACADEMIC || sub.examType === ExamType.CAREER_EMT) && !data.careerExamEnabled
              ? ExamType.PUBLIC
              : sub.examType;
          setExamType(restoredExamType);
          setRegionId(sub.regionId);
          setExamNumber(sub.examNumber || "");
          setVeteranPercent(0);
          setHeroPercent(0);
          setCertificateBonus(
            sub.certificateBonus === 1 ||
            sub.certificateBonus === 2 ||
            sub.certificateBonus === 3 ||
            sub.certificateBonus === 4 ||
            sub.certificateBonus === 5
              ? sub.certificateBonus
              : 0
          );
          if (sub.bonusType === "VETERAN_5") setVeteranPercent(5);
          else if (sub.bonusType === "VETERAN_10") setVeteranPercent(10);
          else if (sub.bonusType === "HERO_3") setHeroPercent(3);
          else if (sub.bonusType === "HERO_5") setHeroPercent(5);

          const newAnswerStore: Record<ExamType, AnswersBySubject> = {
            [ExamType.PUBLIC]: createEmptyAnswers(data.subjectGroups.PUBLIC),
            [ExamType.CAREER]: {},
            [ExamType.CAREER_RESCUE]: createEmptyAnswers(data.subjectGroups.CAREER_RESCUE),
            [ExamType.CAREER_ACADEMIC]: createEmptyAnswers(data.subjectGroups.CAREER_ACADEMIC),
            [ExamType.CAREER_EMT]: createEmptyAnswers(data.subjectGroups.CAREER_EMT),
          };
          const newDiffStore: Record<ExamType, DifficultyBySubject> = {
            [ExamType.PUBLIC]: createEmptyDifficulty(data.subjectGroups.PUBLIC),
            [ExamType.CAREER]: {},
            [ExamType.CAREER_RESCUE]: createEmptyDifficulty(data.subjectGroups.CAREER_RESCUE),
            [ExamType.CAREER_ACADEMIC]: createEmptyDifficulty(data.subjectGroups.CAREER_ACADEMIC),
            [ExamType.CAREER_EMT]: createEmptyDifficulty(data.subjectGroups.CAREER_EMT),
          };

          editData.scores.forEach((score) => {
            if (
              score.difficulty &&
              Object.prototype.hasOwnProperty.call(newDiffStore[restoredExamType], score.subjectName)
            ) {
              newDiffStore[restoredExamType][score.subjectName] = score.difficulty;
            }

            const subjectAnswers = newAnswerStore[restoredExamType][score.subjectName];
            if (!subjectAnswers) return;

            score.answers.forEach((ans) => {
              if (Object.prototype.hasOwnProperty.call(subjectAnswers, ans.questionNumber)) {
                subjectAnswers[ans.questionNumber] = ans.selectedAnswer;
              }
            });
          });

          setAnswerStore(newAnswerStore);
          setDifficultyStore(newDiffStore);
        } else {
          setAnswerStore({
            [ExamType.PUBLIC]: createEmptyAnswers(data.subjectGroups.PUBLIC),
            [ExamType.CAREER]: {},
            [ExamType.CAREER_RESCUE]: createEmptyAnswers(data.subjectGroups.CAREER_RESCUE),
            [ExamType.CAREER_ACADEMIC]: createEmptyAnswers(data.subjectGroups.CAREER_ACADEMIC),
            [ExamType.CAREER_EMT]: createEmptyAnswers(data.subjectGroups.CAREER_EMT),
          });
          setDifficultyStore({
            [ExamType.PUBLIC]: createEmptyDifficulty(data.subjectGroups.PUBLIC),
            [ExamType.CAREER]: {},
            [ExamType.CAREER_RESCUE]: createEmptyDifficulty(data.subjectGroups.CAREER_RESCUE),
            [ExamType.CAREER_ACADEMIC]: createEmptyDifficulty(data.subjectGroups.CAREER_ACADEMIC),
            [ExamType.CAREER_EMT]: createEmptyDifficulty(data.subjectGroups.CAREER_EMT),
          });
        }
      } catch (error) {
        if (!isMounted) return;
        const message = error instanceof Error ? error.message : "시험 정보를 불러오지 못했습니다.";
        setErrorMessage(message);
        showErrorToast(message);
      } finally {
        if (isMounted) {
          setIsMetaLoading(false);
        }
      }
    }

    void loadMeta();
    return () => {
      isMounted = false;
    };
  }, [editId, showErrorToast]);

  const subjects = useMemo(() => {
    if (!meta) return [];
    if (examType === ExamType.CAREER_RESCUE) return meta.subjectGroups.CAREER_RESCUE;
    if (examType === ExamType.CAREER_ACADEMIC) return meta.subjectGroups.CAREER_ACADEMIC;
    if (examType === ExamType.CAREER_EMT) return meta.subjectGroups.CAREER_EMT;
    return meta.subjectGroups.PUBLIC;
  }, [meta, examType]);
  const careerExamEnabled = Boolean(meta?.careerExamEnabled ?? true);
  const answerInputEnabled = Boolean(siteSettings["site.answerInputEnabled"] ?? true);
  const answerInputDisabledMessage = useMemo(() => {
    const lockedMessage = siteSettings["site.tabLockedMessage"];
    if (typeof lockedMessage === "string" && lockedMessage.trim()) {
      return lockedMessage.trim();
    }
    return "현재 답안 입력 기능이 비활성화되어 있습니다.";
  }, [siteSettings]);

  useEffect(() => {
    if (careerExamEnabled) return;
    if (examType === ExamType.CAREER_RESCUE || examType === ExamType.CAREER_ACADEMIC || examType === ExamType.CAREER_EMT) {
      setExamType(ExamType.PUBLIC);
    }
  }, [careerExamEnabled, examType]);

  // 응시번호 실시간 검증 (디바운스 500ms)
  const checkExamNumber = useCallback(
    async (num: string, regId: number, exId: number, exType: string, userGender: Gender) => {
      setExamNumberStatus("checking");
      setExamNumberMessage("");
      try {
        const params = new URLSearchParams({
          examId: String(exId),
          regionId: String(regId),
          examNumber: num,
          examType: exType,
          gender: userGender,
        });
        const res = await fetch(`/api/exam-number/check?${params.toString()}`);
        const data = (await res.json()) as { available?: boolean; reason?: string; error?: string };
        if (!res.ok) {
          setExamNumberStatus("idle");
          return;
        }
        if (data.available) {
          setExamNumberStatus("available");
          setExamNumberMessage("사용 가능한 응시번호입니다.");
        } else {
          setExamNumberStatus("unavailable");
          setExamNumberMessage(data.reason ?? "사용할 수 없는 응시번호입니다.");
        }
      } catch {
        setExamNumberStatus("idle");
      }
    },
    []
  );

  useEffect(() => {
    if (examNumberTimerRef.current) {
      clearTimeout(examNumberTimerRef.current);
      examNumberTimerRef.current = null;
    }

    const trimmed = examNumber.trim();
    if (!trimmed || trimmed.length !== 10 || !regionId || !meta?.activeExam || !gender) {
      setExamNumberStatus("idle");
      setExamNumberMessage("");
      return;
    }

    examNumberTimerRef.current = setTimeout(() => {
      void checkExamNumber(trimmed, regionId as number, meta.activeExam!.id, examType, gender);
    }, 500);

    return () => {
      if (examNumberTimerRef.current) {
        clearTimeout(examNumberTimerRef.current);
      }
    };
  }, [examNumber, regionId, examType, gender, meta?.activeExam, checkExamNumber]);

  useEffect(() => {
    setActiveSubjectIndex(0);
  }, [examType]);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(OMR_INPUT_MODE_STORAGE_KEY);
      if (saved === "quick" || saved === "radio") {
        setInputMode(saved);
      } else {
        setInputMode(getDefaultInputMode());
      }
    } catch {
      setInputMode(getDefaultInputMode());
    }
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(OMR_INPUT_MODE_STORAGE_KEY, inputMode);
    } catch {
      // ignore localStorage errors
    }
  }, [inputMode]);

  const currentSubject = subjects[activeSubjectIndex] ?? null;
  const currentAnswers = useMemo(() => answerStore[examType] ?? {}, [answerStore, examType]);
  const currentDifficulty = useMemo(
    () => difficultyStore[examType] ?? {},
    [difficultyStore, examType]
  );

  const progressBySubject = useMemo(() => {
    return buildSubjectProgress(subjects, currentAnswers);
  }, [subjects, currentAnswers]);

  const totalProgress = useMemo(() => {
    return summarizeSubjectProgress(progressBySubject);
  }, [progressBySubject]);

  const selectedRegion = useMemo(() => {
    if (!meta || !regionId) return null;
    return meta.regions.find((region) => region.id === regionId) ?? null;
  }, [meta, regionId]);

  const recruitCount = selectedRegion ? getRecruitCount(selectedRegion, examType) : null;
  const isCareerRecruitCountMissing =
    (examType === ExamType.CAREER_RESCUE || examType === ExamType.CAREER_ACADEMIC || examType === ExamType.CAREER_EMT) && selectedRegion !== null && recruitCount !== null && recruitCount < 1;

  function setAnswer(subjectName: string, questionNo: number, answer: number | null) {
    setAnswerStore((previous) => {
      const typeAnswers = previous[examType] ?? {};
      const subjectAnswers = { ...(typeAnswers[subjectName] ?? {}) };
      subjectAnswers[questionNo] = answer;
      return {
        ...previous,
        [examType]: {
          ...typeAnswers,
          [subjectName]: subjectAnswers,
        },
      };
    });
  }

  function setDifficulty(subjectName: string, rating: DifficultyRating | null) {
    setDifficultyStore((previous) => {
      const typeDifficulty = previous[examType] ?? {};
      return {
        ...previous,
        [examType]: {
          ...typeDifficulty,
          [subjectName]: rating,
        },
      };
    });
  }

  function handleVeteranChange(next: BonusVeteran) {
    setVeteranPercent(next);
    if (next > 0) {
      setHeroPercent(0);
    }
  }

  function handleHeroChange(next: BonusHero) {
    setHeroPercent(next);
    if (next > 0) {
      setVeteranPercent(0);
    }
  }

  function handleRequestNextSubjectInQuickMode() {
    setActiveSubjectIndex((previousIndex) => {
      const nextIndex = Math.min(previousIndex + 1, subjects.length - 1);
      if (nextIndex !== previousIndex) {
        setQuickFocusToken((token) => token + 1);
      }
      return nextIndex;
    });
  }

  async function handleSubmit() {
    if (!answerInputEnabled) {
      setErrorMessage(answerInputDisabledMessage);
      return;
    }

    if (!meta?.activeExam) {
      setErrorMessage("활성 시험이 없습니다.");
      return;
    }

    if ((examType === ExamType.CAREER_RESCUE || examType === ExamType.CAREER_ACADEMIC || examType === ExamType.CAREER_EMT) && !careerExamEnabled) {
      setErrorMessage("현재 경채 시험은 비활성화 상태입니다.");
      return;
    }

    if (!gender || !regionId) {
      setErrorMessage("성별과 지역을 모두 선택해 주세요.");
      return;
    }

    const normalizedExamNumber = examNumber.trim();
    if (!normalizedExamNumber) {
      setErrorMessage("응시번호는 필수 입력 항목입니다.");
      return;
    }
    if (!/^\d{10}$/.test(normalizedExamNumber)) {
      setErrorMessage("응시번호는 10자리 숫자로 입력해 주세요.");
      return;
    }

    if (examNumberStatus === "unavailable") {
      setErrorMessage(examNumberMessage || "응시번호를 확인해 주세요.");
      return;
    }

    if (isCareerRecruitCountMissing) {
      setErrorMessage("선택한 지역의 경채 모집인원이 설정되지 않았습니다. 관리자에게 문의해 주세요.");
      return;
    }

    const unansweredCount = totalProgress.total - totalProgress.filled;
    if (unansweredCount > 0) {
      const confirmed = window.confirm(
        `미입력 문항이 ${unansweredCount}개 있습니다.\n미입력 문항은 오답 처리됩니다.\n그래도 제출하시겠습니까?`
      );
      if (!confirmed) {
        return;
      }
    }

    const answers = collectSelectedAnswers(subjects, currentAnswers);

    const difficulty = subjects.map((subject) => ({
      subjectName: subject.name,
      rating: currentDifficulty[subject.name],
    }));

    const missingDifficulty = difficulty.find((d) => d.rating === null || d.rating === undefined);
    if (missingDifficulty) {
      setErrorMessage(`모든 과목의 체감 난이도를 선택해주세요. (${missingDifficulty.subjectName} 난이도 미입력)`);
      return;
    }

    setIsSubmitting(true);
    setErrorMessage("");
    try {
      const requestBody = {
        examId: meta.activeExam.id,
        examType,
        gender,
        regionId,
        examNumber: normalizedExamNumber,
        veteranPercent,
        heroPercent,
        certificateBonus,
        submitDurationMs: Date.now() - pageLoadedAtRef.current,
        answers,
        difficulty: difficulty as Array<{ subjectName: string; rating: DifficultyRating }>,
        ...(effectiveEditId ? { submissionId: effectiveEditId } : {}),
      };

      const response = await fetch("/api/submission", {
        method: effectiveEditId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      });

      const data = (await response.json()) as SubmissionResponse & { error?: string };
      if (!response.ok || !data.success) {
        throw new Error(data.error ?? "답안 제출 중 오류가 발생했습니다.");
      }

      sessionStorage.setItem("latestSubmissionId", String(data.submissionId));

      if (embedded && onSubmitted) {
        onSubmitted(data.submissionId);
      } else {
        router.push(
          `${withTenantPrefix("/exam/result", tenantType)}?submissionId=${data.submissionId}`
        );
        router.refresh();
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "답안 제출 중 오류가 발생했습니다.";
      setErrorMessage(message);
      showErrorToast(message);
    } finally {
      setIsSubmitting(false);
    }
  }

  if (status === "loading" || isMetaLoading) {
    return (
      <section className="rounded-xl border border-slate-200 bg-white p-8 text-sm text-slate-600">
        응시정보 화면을 불러오는 중입니다...
      </section>
    );
  }

  if (!session?.user) {
    return (
      <section className="rounded-xl border border-rose-200 bg-rose-50 p-8 text-sm text-rose-700">
        로그인이 필요합니다.
      </section>
    );
  }

  if (!answerInputEnabled) {
    return (
      <ExamFeatureDisabledNotice
        title="답안 입력 기능이 비활성화되었습니다."
        message={answerInputDisabledMessage}
      />
    );
  }

  if (!meta?.activeExam) {
    return (
      <section className="rounded-xl border border-rose-200 bg-rose-50 p-8 text-sm text-rose-700">
        현재 활성 시험이 없습니다.
      </section>
    );
  }

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-slate-200 bg-white p-6">
        <h1 className="text-lg font-semibold text-slate-900">응시정보 입력</h1>
        <p className="mt-1 text-sm text-slate-600">
          {meta.activeExam.year}년 {meta.activeExam.round}차 · {meta.activeExam.name}
        </p>

        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="name">성명</Label>
            <Input id="name" value={session.user.name ?? ""} readOnly />
          </div>

          <div className="space-y-2">
            <Label htmlFor="gender">성별</Label>
            <select
              id="gender"
              className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm"
              value={gender}
              onChange={(event) => setGender(event.target.value as Gender | "")}
            >
              <option value="">선택하세요</option>
              <option value={Gender.MALE}>남성</option>
              <option value={Gender.FEMALE}>여성</option>
            </select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="examType">채용유형</Label>
            <select
              id="examType"
              className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm"
              value={examType}
              onChange={(event) => setExamType(event.target.value as ExamType)}
            >
              <option value={ExamType.PUBLIC}>공채</option>
              {careerExamEnabled ? <option value={ExamType.CAREER_RESCUE}>구조 경채</option> : null}
              {careerExamEnabled ? <option value={ExamType.CAREER_ACADEMIC}>소방학과 경채</option> : null}
              {careerExamEnabled ? <option value={ExamType.CAREER_EMT}>구급 경채</option> : null}
            </select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="region">지역</Label>
            <select
              id="region"
              className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm"
              value={regionId}
              onChange={(event) => setRegionId(Number(event.target.value) || "")}
            >
              <option value="">지역을 선택하세요</option>
              {meta.regions.map((region) => (
                <option key={region.id} value={region.id}>
                  {region.name}
                </option>
              ))}
            </select>
            {selectedRegion ? (
              <p className="text-xs text-slate-500">
                {isCareerRecruitCountMissing
                  ? `${selectedRegion.name}: 경채 모집인원 미설정`
                  : `${selectedRegion.name}: ${recruitCount?.toLocaleString("ko-KR")}명`}
              </p>
            ) : null}
          </div>

          <div className="space-y-2">
            <Label htmlFor="examCategory">시험구분</Label>
            <Input id="examCategory" value="소방 1차" readOnly />
          </div>

          <div className="space-y-2">
            <Label htmlFor="examNumber">응시번호 (필수)</Label>
            <Input
              id="examNumber"
              value={examNumber}
              onChange={(event) => setExamNumber(event.target.value.replace(/\D/g, "").slice(0, 10))}
              placeholder="응시번호 입력"
              inputMode="numeric"
              maxLength={10}
              required
            />
            {examNumberStatus === "checking" && (
              <p className="text-xs text-slate-500">응시번호 확인 중...</p>
            )}
            {examNumberStatus === "available" && (
              <p className="text-xs text-emerald-600">{examNumberMessage}</p>
            )}
            {examNumberStatus === "unavailable" && (
              <p className="text-xs text-rose-600">{examNumberMessage}</p>
            )}
            {examNumberStatus === "idle" && (
              <p className="text-xs text-slate-500">수험표에 기재된 응시번호를 정확히 입력해 주세요.</p>
            )}
          </div>
        </div>

        <div className="mt-6 rounded-xl border border-slate-200 p-4">
          <h2 className="text-sm font-semibold text-slate-900">가산점</h2>
          <p className="mt-1 text-xs text-slate-500">취업지원과 의사상자 가산점은 동시에 적용할 수 없습니다.</p>

          <div className="mt-4 grid gap-4 md:grid-cols-3">
            <fieldset className="space-y-2">
              <legend className="text-sm font-medium text-slate-700">취업지원대상자</legend>
              <div className="flex flex-wrap gap-4 text-sm text-slate-700">
                {[0, 5, 10].map((value) => (
                  <label key={value} className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="bonus-veteran"
                      checked={veteranPercent === value}
                      onChange={() => handleVeteranChange(value as BonusVeteran)}
                    />
                    {value}%
                  </label>
                ))}
              </div>
            </fieldset>

            <fieldset className="space-y-2">
              <legend className="text-sm font-medium text-slate-700">의사상자</legend>
              <div className="flex flex-wrap gap-4 text-sm text-slate-700">
                {[0, 3, 5].map((value) => (
                  <label key={value} className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="bonus-hero"
                      checked={heroPercent === value}
                      onChange={() => handleHeroChange(value as BonusHero)}
                    />
                    {value}%
                  </label>
                ))}
              </div>
            </fieldset>

            <fieldset className="space-y-2">
              <legend className="text-sm font-medium text-slate-700">자격증 가산점</legend>
              <div className="flex flex-wrap gap-4 text-sm text-slate-700">
                {[0, 1, 2, 3, 4, 5].map((value) => (
                  <label key={value} className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="bonus-certificate"
                      checked={certificateBonus === value}
                      onChange={() => setCertificateBonus(value as BonusCertificate)}
                    />
                    {value}%
                  </label>
                ))}
              </div>
              <p className="text-xs text-slate-500">
                최대 5% 가산 (최종합격 결정 단계 적용). 필기 점수에는 미반영됩니다.
              </p>
            </fieldset>
          </div>
        </div>
      </section>

      {/* 수정 모드 안내 배너 */}
      {effectiveEditId && editCountInfo && (
        isEditLimitReached ? (
          <section className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
            <p className="font-semibold">답안 수정 횟수({editCountInfo.maxEditLimit}회)를 모두 사용했습니다.</p>
            <p className="mt-1">더 이상 수정할 수 없습니다. 내 성적 분석에서 제출 결과를 확인하세요.</p>
          </section>
        ) : (
          <section className="rounded-xl border border-fire-200 bg-fire-50 p-4 text-sm text-slate-700">
            <p className="font-semibold text-fire-700">기존에 제출한 답안이 불러와졌습니다.</p>
            <p className="mt-1">
              수정할 문항만 변경 후 제출하세요.
              <span className="ml-2 font-medium text-slate-900">
                수정 {editCountInfo.editCount}/{editCountInfo.maxEditLimit}회 사용
                ({editCountInfo.maxEditLimit - editCountInfo.editCount}회 남음)
              </span>
            </p>
          </section>
        )
      )}

      <section className="rounded-xl border border-slate-200 bg-white p-6">
        <h2 className="text-lg font-semibold text-slate-900">OMR 답안 입력</h2>
        <p className="mt-1 text-sm text-slate-600">
          {examType === ExamType.CAREER_RESCUE ? "구조 경채" : examType === ExamType.CAREER_ACADEMIC ? "소방학과 경채" : examType === ExamType.CAREER_EMT ? "구급 경채" : "공채"} ·
          {inputMode === "quick"
            ? " 키보드 숫자 입력(1~4)으로 빠르게 답안을 입력하세요."
            : " 문항별 ①②③④ 버튼을 눌러 답안을 입력하세요."}
        </p>
        <div className="mt-4">
          <OmrInputModeToggle
            value={inputMode}
            onChange={(nextMode) => {
              setInputMode(nextMode);
              if (nextMode === "quick") {
                setQuickFocusToken((token) => token + 1);
              }
            }}
          />
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          {subjects.map((subject, index) => {
            const progress = progressBySubject.find((item) => item.subjectName === subject.name);
            const filled = progress?.filled ?? 0;
            const completed = filled === subject.questionCount;
            const rating = currentDifficulty[subject.name] ?? "NORMAL";

            return (
              <button
                key={subject.name}
                type="button"
                className={`rounded-md border px-4 py-2 text-sm font-bold ${index === activeSubjectIndex
                  ? "border-fire-700 bg-fire-700 text-white"
                  : "border-slate-300 bg-white text-slate-700 hover:border-slate-400"
                  }`}
                onClick={() => setActiveSubjectIndex(index)}
              >
                <span>{subject.name}</span>
                <span
                  className={`ml-2 rounded-md px-2 py-0.5 text-xs font-semibold ${completed
                    ? "bg-fire-600 text-white"
                    : "bg-rose-100 text-rose-700"
                    } ${index === activeSubjectIndex && completed ? "bg-white text-fire-700" : ""
                    }`}
                >
                  {filled}/{subject.questionCount}
                </span>
                {rating ? (
                  <span
                    className={`ml-2 rounded-md px-2 py-0.5 text-xs font-semibold ${index === activeSubjectIndex
                      ? "bg-white text-fire-700"
                      : "bg-red-100 text-red-700"
                    }`}
                  >
                    {DIFFICULTY_LABEL[rating]}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>

        {currentSubject ? (
          <div className="mt-4 rounded-xl border border-slate-200 p-4">
            <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <h3 className="font-semibold text-slate-900">
                {currentSubject.name} ({currentSubject.questionCount}문항)
              </h3>
              <DifficultySelector
                subjectName={currentSubject.name}
                value={currentDifficulty[currentSubject.name] ?? null}
                onChange={(next) => setDifficulty(currentSubject.name, next)}
              />
            </div>

            {inputMode === "radio" ? (
              <RadioOmrInput
                subjectName={currentSubject.name}
                questionCount={currentSubject.questionCount}
                answers={currentAnswers[currentSubject.name] ?? {}}
                onAnswerChange={(questionNo, answer) => setAnswer(currentSubject.name, questionNo, answer)}
              />
            ) : (
              <QuickOmrInput
                subjectName={currentSubject.name}
                questionCount={currentSubject.questionCount}
                answers={currentAnswers[currentSubject.name] ?? {}}
                onAnswerChange={(questionNo, answer) => setAnswer(currentSubject.name, questionNo, answer)}
                focusToken={quickFocusToken}
                onRequestNextSubject={handleRequestNextSubjectInQuickMode}
              />
            )}
          </div>
        ) : null}

        <div className="mt-5 space-y-3 rounded-xl border border-slate-200 p-4">
          <h3 className="text-sm font-semibold text-slate-900">입력 현황</h3>
          {progressBySubject.map((item) => {
            const percentage = item.total > 0 ? (item.filled / item.total) * 100 : 0;
            return (
              <div key={item.subjectName}>
                <div className="mb-1 flex items-center justify-between text-xs text-slate-600">
                  <span>{item.subjectName}</span>
                  <span>
                    {item.filled}/{item.total}
                  </span>
                </div>
                <div className="h-2 overflow-hidden bg-slate-200">
                  <div
                    className={`h-full ${progressColor(percentage)}`}
                    style={{ width: `${percentage}%` }}
                  />
                </div>
              </div>
            );
          })}

          <div className="mt-1 border-t border-slate-200 pt-3 text-sm font-medium text-slate-700">
            총 입력: {totalProgress.filled}/{totalProgress.total}문항
          </div>
        </div>

        {errorMessage ? (
          <p className="mt-4 rounded-none border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {errorMessage}
          </p>
        ) : null}

        <div className="mt-5 flex justify-end">
          <Button type="button" onClick={handleSubmit} disabled={isSubmitting || isMetaLoading || isEditLimitReached}>
            {isSubmitting ? "처리 중..." : effectiveEditId ? "답안 수정하기" : "채점하기"}
          </Button>
        </div>
      </section>
    </div>
  );
}
