"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { ExamCategory, EnrollSource } from "@prisma/client";
import {
  ENROLL_SOURCE_LABEL,
  EXAM_CATEGORY_LABEL,
} from "@/lib/constants";
import { formatDate } from "@/lib/format";

type StudentResult = {
  examNumber: string;
  name: string;
  phone: string | null;
  isActive: boolean;
  notificationConsent?: boolean;
  consentedAt?: string | null;
  currentStatus?: string | null;
};

type ProductRecord = {
  id: string;
  name: string;
  examCategory: ExamCategory;
  durationMonths: number;
  regularPrice: number;
  salePrice: number;
  features: string | null;
  isActive: boolean;
};

type CohortRecord = {
  id: string;
  name: string;
  examCategory: ExamCategory;
  startDate: string;
  endDate: string;
  isActive: boolean;
};

type SpecialLectureSubjectRecord = {
  id: string;
  subjectName: string;
  instructorName: string;
  price: number;
  instructorRate: number;
};

type SpecialLectureRecord = {
  id: string;
  name: string;
  lectureType: string;
  examCategory: string | null;
  startDate: string;
  endDate: string;
  isMultiSubject: boolean;
  fullPackagePrice: number | null;
  subjects: SpecialLectureSubjectRecord[];
};

type Props = {
  initialProducts: ProductRecord[];
  initialCohorts: CohortRecord[];
  initialSpecialLectures?: SpecialLectureRecord[];
  initialExamNumber?: string;
  initialMode?: "default" | "interview-coaching";
};

const ENROLL_SOURCE_VALUES = Object.values(EnrollSource);

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    cache: "no-store",
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error ?? "요청에 실패했습니다.");
  return payload as T;
}

type Step = 1 | 2 | 3;

export function EnrollmentForm({
  initialProducts,
  initialCohorts,
  initialSpecialLectures = [],
  initialExamNumber,
  initialMode = "default",
}: Props) {
  const router = useRouter();
  const isInterviewCoachingPreset = initialMode === "interview-coaching";
  const [step, setStep] = useState<Step>(1);
  const [isPending, startTransition] = useTransition();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Step 1 – 학생 선택
  const [studentSearch, setStudentSearch] = useState("");
  const [searchResults, setSearchResults] = useState<StudentResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedStudent, setSelectedStudent] = useState<StudentResult | null>(null);

  // Pre-fill student when initialExamNumber is provided (갱신 등록)
  useEffect(() => {
    if (!initialExamNumber) return;
    setIsSearching(true);
    fetch(`/api/students?search=${encodeURIComponent(initialExamNumber)}&limit=1`, { cache: "no-store" })
      .then((r) => r.json())
      .then((data: { students?: StudentResult[] }) => {
        const found = data.students?.[0];
        if (found && found.examNumber === initialExamNumber) {
          setSelectedStudent(found);
        }
      })
      .catch(() => {/* silent – user can search manually */})
      .finally(() => setIsSearching(false));
  }, [initialExamNumber]);

  useEffect(() => {
    setNotificationConsentGiven(Boolean(selectedStudent?.notificationConsent));
  }, [selectedStudent?.examNumber, selectedStudent?.notificationConsent]);

  // Step 2 – 수강 정보
  const [courseType, setCourseType] = useState<"COMPREHENSIVE" | "SPECIAL_LECTURE">(
    isInterviewCoachingPreset ? "SPECIAL_LECTURE" : "COMPREHENSIVE",
  );
  const [selectedProductId, setSelectedProductId] = useState<string>("");
  const [selectedCohortId, setSelectedCohortId] = useState<string>("");
  const [selectedSpecialLectureId, setSelectedSpecialLectureId] = useState<string>("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [enrollSource, setEnrollSource] = useState<EnrollSource | "">("");
  const [isRe, setIsRe] = useState(false);
  const [interviewAgency, setInterviewAgency] = useState("");
  const [interviewPosition, setInterviewPosition] = useState("");
  const [interviewTrack, setInterviewTrack] = useState("");
  const [interviewGroup, setInterviewGroup] = useState("");
  const [interviewLeader, setInterviewLeader] = useState("");

  // Step 3 – 수강료
  const [regularFee, setRegularFee] = useState("");
  const [selectedDiscountTypes, setSelectedDiscountTypes] = useState<string[]>([]);
  const [discountBaseInput, setDiscountBaseInput] = useState(""); // 인강/타학원 환승 기준 금액
  const [manualDiscountInput, setManualDiscountInput] = useState("0"); // 관리자 직접 입력

  // 할인 코드 관련 상태
  const [discountCodeInput, setDiscountCodeInput] = useState("");
  const [isValidatingCode, setIsValidatingCode] = useState(false);
  const [appliedCode, setAppliedCode] = useState<{
    codeId: number;
    code: string;
    discountType: string;
    discountValue: number;
    finalDiscount: number;
    description: string;
  } | null>(null);
  const [codeError, setCodeError] = useState<string | null>(null);
  const [privacyConsentGiven, setPrivacyConsentGiven] = useState(false);
  const [notificationConsentGiven, setNotificationConsentGiven] = useState(false);

  const DISCOUNT_TYPE_LABEL: Record<string, string> = {
    SIMULTANEOUS: "동시수강",
    SIBLING: "형제 할인",
    POLICE_ADMIN: "경찰행정학과",
    FAMILY: "직계가족",
    RETURNING_30: "종합반 재수강",
    RETURNING_50: "이론반 재수강",
    ONLINE: "인강생 혜택",
    TRANSFER: "타학원 환승",
    ADMIN_MANUAL: "직접 입력",
  };

  type DiscountLineItem = {
    key: string;
    label: string;
    amount: number;
  };

  function calcDiscountDetail(
    types: string[],
    fee: number,
    baseInput: string,
    manualInput: string,
  ): { items: DiscountLineItem[]; rawTotal: number; cappedTotal: number; capAdjustment: number } {
    const items: DiscountLineItem[] = [];
    let rawTotal = 0;
    for (const t of types) {
      let amount = 0;
      if (t === "SIMULTANEOUS") amount = 50000;
      else if (t === "SIBLING") amount = 100000;
      else if (t === "POLICE_ADMIN") amount = 100000;
      else if (t === "FAMILY") amount = 100000;
      else if (t === "RETURNING_30") amount = Math.round(fee * 0.3);
      else if (t === "RETURNING_50") amount = Math.round(fee * 0.5);
      else if (t === "ONLINE") amount = Math.round((Number(baseInput) || 0) * 0.5);
      else if (t === "TRANSFER") amount = Math.round((Number(baseInput) || 0) * 0.3);
      else if (t === "ADMIN_MANUAL") amount = Number(manualInput) || 0;
      items.push({ key: t, label: DISCOUNT_TYPE_LABEL[t] ?? t, amount });
      rawTotal += amount;
    }
    const cappedTotal = Math.min(rawTotal, 500000);
    const capAdjustment = rawTotal > 500000 ? rawTotal - 500000 : 0;
    return { items, rawTotal, cappedTotal, capAdjustment };
  }

  const discountDetail = calcDiscountDetail(
    selectedDiscountTypes,
    Number(regularFee) || 0,
    discountBaseInput,
    manualDiscountInput,
  );
  const manualDiscountAmount = discountDetail.cappedTotal;
  const codeDiscountAmount = appliedCode?.finalDiscount ?? 0;
  const discountAmount = String(manualDiscountAmount + codeDiscountAmount);

  const finalFee = Math.max(0, (Number(regularFee) || 0) - manualDiscountAmount - codeDiscountAmount);

  async function handleApplyDiscountCode() {
    const trimmedCode = discountCodeInput.trim();
    if (!trimmedCode) return;

    const fee = Number(regularFee) || 0;
    if (fee <= 0) {
      setCodeError("수강료를 먼저 입력해주세요.");
      return;
    }

    setIsValidatingCode(true);
    setCodeError(null);

    try {
      const res = await fetch("/api/settings/discount-codes/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: trimmedCode, amount: fee }),
        cache: "no-store",
      });
      const data = await res.json();

      if (!data.valid) {
        setCodeError(data.error ?? "유효하지 않은 할인 코드입니다.");
        return;
      }

      setAppliedCode({
        codeId: data.codeId,
        code: trimmedCode.toUpperCase(),
        discountType: data.discountType,
        discountValue: data.discountValue,
        finalDiscount: data.finalDiscount,
        description: data.description,
      });
      setDiscountCodeInput("");
    } catch {
      setCodeError("코드 검증 중 오류가 발생했습니다.");
    } finally {
      setIsValidatingCode(false);
    }
  }

  function handleRemoveDiscountCode() {
    setAppliedCode(null);
    setCodeError(null);
    setDiscountCodeInput("");
  }

  const selectedProduct = initialProducts.find((p) => p.id === selectedProductId) ?? null;
  const selectedCohort = initialCohorts.find((c) => c.id === selectedCohortId) ?? null;
  const visibleSpecialLectures = isInterviewCoachingPreset
    ? initialSpecialLectures.filter((lecture) => lecture.lectureType === "INTERVIEW_COACHING")
    : initialSpecialLectures;

  // Filter cohorts by selected product's examCategory
  const filteredCohorts = selectedProduct
    ? initialCohorts.filter(
        (c) => c.examCategory === selectedProduct.examCategory && c.isActive,
      )
    : initialCohorts.filter((c) => c.isActive);

  function handleSearchStudents() {
    if (!studentSearch.trim()) return;
    setIsSearching(true);
    setErrorMessage(null);

    startTransition(async () => {
      try {
        const result = await requestJson<{ students: StudentResult[] }>(
          `/api/students?search=${encodeURIComponent(studentSearch.trim())}&limit=10`,
        );
        setSearchResults(result.students ?? []);
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : "학생 검색에 실패했습니다.");
      } finally {
        setIsSearching(false);
      }
    });
  }

  function handleSelectStudent(student: StudentResult) {
    setSelectedStudent(student);
    setSearchResults([]);
    setStudentSearch("");
  }

  function handleProductSelect(product: ProductRecord) {
    setSelectedProductId(product.id);
    setRegularFee(String(product.salePrice));
    // Reset cohort when product changes
    setSelectedCohortId("");
    setStartDate("");
    setEndDate("");
  }

  function handleCohortSelect(cohort: CohortRecord) {
    setSelectedCohortId(cohort.id);
    setStartDate(cohort.startDate.slice(0, 10));
    setEndDate(cohort.endDate.slice(0, 10));
  }

  function handleSpecialLectureSelect(lecture: SpecialLectureRecord) {
    setSelectedSpecialLectureId(lecture.id);
    setStartDate(lecture.startDate);
    setEndDate(lecture.endDate);
    // Auto-fill fee: use package price if multi-subject, or sum of all subjects
    if (lecture.isMultiSubject && lecture.fullPackagePrice) {
      setRegularFee(String(lecture.fullPackagePrice));
    } else if (lecture.subjects.length === 1) {
      setRegularFee(String(lecture.subjects[0].price));
    } else {
      setRegularFee("");
    }
  }

  const selectedSpecialLecture = initialSpecialLectures.find((l) => l.id === selectedSpecialLectureId) ?? null;
  const isInterviewCoachingEnrollment =
    courseType === "SPECIAL_LECTURE" &&
    (selectedSpecialLecture?.lectureType === "INTERVIEW_COACHING" || isInterviewCoachingPreset);

  function validateStep1(): string | null {
    if (!selectedStudent) return "학생을 선택하세요.";
    return null;
  }

  function validateStep2(): string | null {
    if (courseType === "COMPREHENSIVE") {
      if (!selectedProductId) return "상품을 선택하세요.";
      if (!selectedCohortId) return "기수를 선택하세요.";
      if (!startDate) return "시작일을 입력하세요.";
    } else if (courseType === "SPECIAL_LECTURE") {
      if (!selectedSpecialLectureId) return "특강을 선택하세요.";
      if (!startDate) return "시작일을 입력하세요.";
      if (isInterviewCoachingEnrollment && !interviewAgency.trim()) {
        return "응시청을 입력해 주세요.";
      }
      if (isInterviewCoachingEnrollment && !interviewPosition.trim()) {
        return "직급을 입력해 주세요.";
      }
    }
    return null;
  }

  function validateStep3(): string | null {
    if (!regularFee || Number(regularFee) < 0) return "수강료를 입력해 주세요.";
    if (manualDiscountAmount < 0 || manualDiscountAmount > 500000) return "수동 할인 금액은 0~50만원 이내여야 합니다.";
    if (finalFee < 0) return "최종 수강료가 0 미만이 될 수 없습니다.";
    if (!privacyConsentGiven) return "개인정보 수집·이용 동의는 필수입니다.";
    return null;
  }

  function goToStep2() {
    const err = validateStep1();
    if (err) {
      setErrorMessage(err);
      return;
    }
    setErrorMessage(null);
    setStep(2);
  }

  function goToStep3() {
    const err = validateStep2();
    if (err) {
      setErrorMessage(err);
      return;
    }
    setErrorMessage(null);
    setStep(3);
  }

  const interviewExtraData =
    isInterviewCoachingEnrollment &&
    (interviewAgency.trim() ||
      interviewPosition.trim() ||
      interviewTrack.trim() ||
      interviewGroup.trim() ||
      interviewLeader.trim())
      ? {
          interviewCoaching: {
            agency: interviewAgency.trim() || null,
            position: interviewPosition.trim() || null,
            track: interviewTrack.trim() || null,
            group: interviewGroup.trim() || null,
            leader: interviewLeader.trim() || null,
          },
        }
      : undefined;

  function handleSubmit() {
    const err = validateStep3();
    if (err) {
      setErrorMessage(err);
      return;
    }
    setErrorMessage(null);

    startTransition(async () => {
      try {
        const result = await requestJson<{ enrollment: { id: string } }>("/api/enrollments", {
          method: "POST",
          body: JSON.stringify({
            examNumber: selectedStudent!.examNumber,
            courseType,
            productId: courseType === "COMPREHENSIVE" ? selectedProductId : undefined,
            cohortId: courseType === "COMPREHENSIVE" ? selectedCohortId : undefined,
            specialLectureId: courseType === "SPECIAL_LECTURE" ? selectedSpecialLectureId : undefined,
            startDate: startDate || undefined,
            endDate: endDate || undefined,
            regularFee: Number(regularFee),
            discountAmount: Number(discountAmount) || 0,
            finalFee,
            privacyConsentGiven,
            notificationConsentGiven,
            enrollSource: enrollSource || undefined,
            isRe,
            discountCodeId: appliedCode?.codeId ?? undefined,
            extraData:
              selectedDiscountTypes.length > 0 || appliedCode || interviewExtraData
                ? {
                    ...(selectedDiscountTypes.length > 0 ? { discountTypes: selectedDiscountTypes } : {}),
                    ...(appliedCode
                      ? { discountCode: appliedCode.code, codeDiscount: appliedCode.finalDiscount }
                      : {}),
                    ...(interviewExtraData ?? {}),
                  }
                : undefined,
          }),
        });
        const newEnrollmentId = result.enrollment.id;
        router.push(`/admin/enrollments/${newEnrollmentId}/contract?autoPrint=1`);
        router.refresh();
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : "등록에 실패했습니다.");
      }
    });
  }

  const stepLabels: Record<Step, string> = {
    1: "학생 선택",
    2: "수강 정보",
    3: "수강료 확인",
  };

  return (
    <div className="max-w-2xl space-y-8">
      {/* Step indicator */}
      <div className="flex items-center gap-2">
        {([1, 2, 3] as Step[]).map((s) => (
          <div key={s} className="flex items-center gap-2">
            <div
              className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold transition ${
                step === s
                  ? "bg-ember text-white"
                  : step > s
                    ? "bg-forest text-white"
                    : "border border-ink/10 bg-white text-slate"
              }`}
            >
              {step > s ? "✓" : s}
            </div>
            <span
              className={`text-sm font-medium ${step === s ? "text-ink" : "text-slate"}`}
            >
              {stepLabels[s]}
            </span>
            {s < 3 ? <span className="mx-1 text-ink/20">›</span> : null}
          </div>
        ))}
      </div>

      {/* Error message */}
      {errorMessage ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {errorMessage}
        </div>
      ) : null}

      {/* ── Step 1: 학생 선택 ── */}
      {step === 1 ? (
        <div className="rounded-[28px] border border-ink/10 bg-white p-6 space-y-5">
          <h2 className="text-lg font-semibold text-ink">학생 선택</h2>

          {/* Selected student card */}
          {selectedStudent ? (
            <div className="rounded-[20px] border border-forest/20 bg-forest/10 p-4 flex items-start justify-between gap-4">
              <div>
                <div className="font-semibold text-ink">{selectedStudent.name}</div>
                <div className="mt-1 text-sm text-slate">
                  수험번호: {selectedStudent.examNumber}
                </div>
                {selectedStudent.phone ? (
                  <div className="text-sm text-slate">연락처: {selectedStudent.phone}</div>
                ) : null}
                {!selectedStudent.isActive ? (
                  <span className="mt-1 inline-flex rounded-full bg-red-50 border border-red-200 px-2 py-0.5 text-xs text-red-700">
                    비활성 학생
                  </span>
                ) : null}
              </div>
              <button
                type="button"
                onClick={() => setSelectedStudent(null)}
                className="text-xs text-slate underline hover:text-ink"
              >
                변경
              </button>
            </div>
          ) : null}

          {/* Search */}
          {!selectedStudent ? (
            <div className="space-y-3">
              <label className="block text-sm font-medium text-ink">
                이름 또는 수험번호로 검색
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={studentSearch}
                  onChange={(e) => setStudentSearch(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleSearchStudents();
                  }}
                  placeholder="예: 홍길동 또는 2026001"
                  className="flex-1 rounded-2xl border border-ink/10 px-4 py-3 text-sm outline-none focus:border-ink/30"
                />
                <button
                  type="button"
                  disabled={isPending || isSearching || !studentSearch.trim()}
                  onClick={handleSearchStudents}
                  className="rounded-full bg-ink px-5 py-2 text-sm font-medium text-white transition hover:bg-forest disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isSearching ? "검색 중..." : "검색"}
                </button>
              </div>

              {/* Search results */}
              {searchResults.length > 0 ? (
                <div className="rounded-[20px] border border-ink/10 overflow-hidden">
                  {searchResults.map((student) => (
                    <button
                      key={student.examNumber}
                      type="button"
                      onClick={() => handleSelectStudent(student)}
                      className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-mist/50 transition border-b border-ink/5 last:border-0"
                    >
                      <div>
                        <div className="font-medium text-ink">{student.name}</div>
                        <div className="text-xs text-slate">
                          {student.examNumber}
                          {student.phone ? ` · ${student.phone}` : ""}
                        </div>
                      </div>
                      {!student.isActive ? (
                        <span className="text-xs text-red-500">비활성</span>
                      ) : (
                        <span className="text-xs text-slate">선택 →</span>
                      )}
                    </button>
                  ))}
                </div>
              ) : null}

              {searchResults.length === 0 && studentSearch && !isSearching ? (
                <p className="text-xs text-slate">검색 버튼을 눌러 학생을 찾아보세요.</p>
              ) : null}
            </div>
          ) : null}

          <div className="flex justify-end pt-2">
            <button
              type="button"
              disabled={!selectedStudent || isPending}
              onClick={goToStep2}
              className="rounded-full bg-ember px-6 py-2.5 text-sm font-semibold text-white transition hover:bg-ember/90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              다음 단계 →
            </button>
          </div>
        </div>
      ) : null}

      {/* ── Step 2: 수강 정보 ── */}
      {step === 2 ? (
        <div className="rounded-[28px] border border-ink/10 bg-white p-6 space-y-6">
          <h2 className="text-lg font-semibold text-ink">수강 정보</h2>

          {/* Selected student summary */}
          {selectedStudent ? (
            <div className="rounded-[20px] bg-mist px-4 py-3 text-sm text-slate">
              학생:{" "}
              <span className="font-semibold text-ink">
                {selectedStudent.name}
              </span>{" "}
              ({selectedStudent.examNumber})
            </div>
          ) : null}

          {/* CourseType radio */}
          {isInterviewCoachingPreset ? (
            <div className="rounded-[20px] border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-800">
              <div className="font-semibold">면접 코칭반 등록 프리셋</div>
              <p className="mt-1 text-xs text-amber-700">
                이 화면에서는 특강 중 면접 코칭 강좌만 표시합니다.
              </p>
            </div>
          ) : (
            <div>
              <label className="block text-sm font-medium text-ink mb-3">
                수강 유형 <span className="text-red-500">*</span>
              </label>
              <div className="flex gap-3">
                {(["COMPREHENSIVE", "SPECIAL_LECTURE"] as const).map((type) => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => setCourseType(type)}
                    className={`flex-1 rounded-[20px] border p-4 text-left transition ${
                      courseType === type
                        ? "border-ember bg-ember/5"
                        : "border-ink/10 hover:border-ink/20"
                    }`}
                  >
                    <div
                      className={`font-semibold ${courseType === type ? "text-ember" : "text-ink"}`}
                    >
                      {type === "COMPREHENSIVE" ? "종합반" : "특강 단과"}
                    </div>
                    <div className="mt-1 text-xs text-slate">
                      {type === "COMPREHENSIVE"
                        ? "기수별 종합반 수강 등록"
                        : "단일 특강 수강 등록"}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* COMPREHENSIVE options */}
          {courseType === "COMPREHENSIVE" ? (
            <>
              {/* Product selector */}
              <div>
                <label className="block text-sm font-medium text-ink mb-3">
                  상품 선택 <span className="text-red-500">*</span>
                </label>
                {initialProducts.filter((p) => p.isActive).length === 0 ? (
                  <p className="text-sm text-slate">등록된 상품이 없습니다.</p>
                ) : (
                  <div className="grid gap-2 sm:grid-cols-2">
                    {initialProducts
                      .filter((p) => p.isActive)
                      .map((product) => (
                        <button
                          key={product.id}
                          type="button"
                          onClick={() => handleProductSelect(product)}
                          className={`rounded-[20px] border p-4 text-left transition card-lift ${
                            selectedProductId === product.id
                              ? "border-ember bg-ember/5"
                              : "border-ink/10 hover:border-ink/20"
                          }`}
                        >
                          <div
                            className={`font-semibold ${selectedProductId === product.id ? "text-ember" : "text-ink"}`}
                          >
                            {product.name}
                          </div>
                          <div className="mt-1 text-xs text-slate">
                            {EXAM_CATEGORY_LABEL[product.examCategory]} ·{" "}
                            {product.durationMonths}개월
                          </div>
                          <div className="mt-2 font-medium text-ink tabular-nums">
                            {product.salePrice.toLocaleString()}원
                            {product.regularPrice !== product.salePrice ? (
                              <span className="ml-2 text-xs text-slate line-through">
                                {product.regularPrice.toLocaleString()}원
                              </span>
                            ) : null}
                          </div>
                        </button>
                      ))}
                  </div>
                )}
              </div>

              {/* Cohort selector */}
              <div>
                <label className="block text-sm font-medium text-ink mb-3">
                  기수 선택 <span className="text-red-500">*</span>
                </label>
                {filteredCohorts.length === 0 ? (
                  <p className="text-sm text-slate">
                    {selectedProduct
                      ? `${EXAM_CATEGORY_LABEL[selectedProduct.examCategory]} 기수가 없습니다.`
                      : "활성 기수가 없습니다."}
                  </p>
                ) : (
                  <div className="grid gap-2 sm:grid-cols-2">
                    {filteredCohorts.map((cohort) => (
                      <button
                        key={cohort.id}
                        type="button"
                        onClick={() => handleCohortSelect(cohort)}
                        className={`rounded-[20px] border p-4 text-left transition card-lift ${
                          selectedCohortId === cohort.id
                            ? "border-forest bg-forest/5"
                            : "border-ink/10 hover:border-ink/20"
                        }`}
                      >
                        <div
                          className={`font-semibold ${selectedCohortId === cohort.id ? "text-forest" : "text-ink"}`}
                        >
                          {cohort.name}
                        </div>
                        <div className="mt-1 text-xs text-slate">
                          {EXAM_CATEGORY_LABEL[cohort.examCategory]}
                        </div>
                        <div className="mt-1 text-xs text-slate tabular-nums">
                          {formatDate(cohort.startDate)} ~ {formatDate(cohort.endDate)}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Date overrides */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1.5 block text-sm font-medium">
                    시작일 <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="w-full rounded-2xl border border-ink/10 px-4 py-3 text-sm outline-none focus:border-ink/30"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium">종료일</label>
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="w-full rounded-2xl border border-ink/10 px-4 py-3 text-sm outline-none focus:border-ink/30"
                  />
                </div>
              </div>
            </>
          ) : null}

          {/* SPECIAL_LECTURE selector */}
          {courseType === "SPECIAL_LECTURE" ? (
            <>
              <div>
                <label className="block text-sm font-medium text-ink mb-3">
                  특강 선택 <span className="text-red-500">*</span>
                </label>
                {visibleSpecialLectures.length === 0 ? (
                  <p className="text-sm text-slate">
                    {isInterviewCoachingPreset ? "활성 면접 코칭 강좌가 없습니다." : "활성 특강이 없습니다."}{" "}
                    <a href="/admin/settings/special-lectures" className="text-forest underline">
                      {isInterviewCoachingPreset ? "면접 코칭 강좌 등록하기" : "특강 등록하기"}
                    </a>
                  </p>
                ) : (
                  <div className="grid gap-2 sm:grid-cols-2">
                    {visibleSpecialLectures.map((lecture) => (
                      <button
                        key={lecture.id}
                        type="button"
                        onClick={() => handleSpecialLectureSelect(lecture)}
                        className={`rounded-[20px] border p-4 text-left transition card-lift ${
                          selectedSpecialLectureId === lecture.id
                            ? "border-ember bg-ember/5"
                            : "border-ink/10 hover:border-ink/20"
                        }`}
                      >
                        <div className={`font-semibold ${selectedSpecialLectureId === lecture.id ? "text-ember" : "text-ink"}`}>
                          {lecture.name}
                        </div>
                        <div className="mt-1 text-xs text-slate">
                          {lecture.startDate} ~ {lecture.endDate}
                        </div>
                        <div className="mt-1 text-xs text-slate">
                          {lecture.lectureType === "INTERVIEW_COACHING" ? "면접 코칭" : "특강"}
                        </div>
                        {lecture.subjects.length > 0 && (
                          <div className="mt-2 space-y-0.5">
                            {lecture.subjects.map((s) => (
                              <div key={s.id} className="text-xs text-slate">
                                {s.subjectName} · {s.instructorName} · {s.price.toLocaleString()}원
                              </div>
                            ))}
                          </div>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {selectedSpecialLecture ? (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="mb-1.5 block text-sm font-medium">시작일 *</label>
                      <input
                        type="date"
                        value={startDate}
                        onChange={(e) => setStartDate(e.target.value)}
                        className="w-full rounded-2xl border border-ink/10 px-4 py-3 text-sm outline-none focus:border-ink/30"
                      />
                    </div>
                    <div>
                      <label className="mb-1.5 block text-sm font-medium">종료일</label>
                      <input
                        type="date"
                        value={endDate}
                        onChange={(e) => setEndDate(e.target.value)}
                        className="w-full rounded-2xl border border-ink/10 px-4 py-3 text-sm outline-none focus:border-ink/30"
                      />
                    </div>
                  </div>

                  {isInterviewCoachingEnrollment ? (
                    <div className="rounded-[20px] border border-amber-200 bg-amber-50/70 p-4">
                      <div className="font-semibold text-amber-900">면접 코칭반 상세 정보</div>
                      <p className="mt-1 text-xs leading-6 text-amber-800">
                        PRD 기준으로 응시청과 직급은 필수입니다. 계열, 조 편성, 조장 정보는 운영 배치에 바로
                        쓰이므로 함께 입력해 두는 쪽으로 맞췄습니다.
                      </p>
                      <div className="mt-4 grid gap-3 sm:grid-cols-2">
                        <div>
                          <label className="mb-1.5 block text-sm font-medium text-ink">
                            응시청 <span className="text-red-500">*</span>
                          </label>
                          <input
                            type="text"
                            value={interviewAgency}
                            onChange={(e) => setInterviewAgency(e.target.value)}
                            placeholder="예: 대구청"
                            className="w-full rounded-2xl border border-ink/10 px-4 py-3 text-sm outline-none focus:border-amber-400"
                          />
                        </div>
                        <div>
                          <label className="mb-1.5 block text-sm font-medium text-ink">
                            직급 <span className="text-red-500">*</span>
                          </label>
                          <input
                            type="text"
                            value={interviewPosition}
                            onChange={(e) => setInterviewPosition(e.target.value)}
                            placeholder="예: 순경 공채"
                            className="w-full rounded-2xl border border-ink/10 px-4 py-3 text-sm outline-none focus:border-amber-400"
                          />
                        </div>
                        <div>
                          <label className="mb-1.5 block text-sm font-medium text-ink">계열</label>
                          <input
                            type="text"
                            value={interviewTrack}
                            onChange={(e) => setInterviewTrack(e.target.value)}
                            placeholder="예: 일반 / 경행특채"
                            className="w-full rounded-2xl border border-ink/10 px-4 py-3 text-sm outline-none focus:border-amber-400"
                          />
                        </div>
                        <div>
                          <label className="mb-1.5 block text-sm font-medium text-ink">조 편성</label>
                          <input
                            type="text"
                            value={interviewGroup}
                            onChange={(e) => setInterviewGroup(e.target.value)}
                            placeholder="예: A조"
                            className="w-full rounded-2xl border border-ink/10 px-4 py-3 text-sm outline-none focus:border-amber-400"
                          />
                        </div>
                        <div className="sm:col-span-2">
                          <label className="mb-1.5 block text-sm font-medium text-ink">조장/담당자</label>
                          <input
                            type="text"
                            value={interviewLeader}
                            onChange={(e) => setInterviewLeader(e.target.value)}
                            placeholder="예: 김OO 팀장"
                            className="w-full rounded-2xl border border-ink/10 px-4 py-3 text-sm outline-none focus:border-amber-400"
                          />
                        </div>
                      </div>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </>
          ) : null}

          {/* enrollSource */}
          <div>
            <label className="mb-1.5 block text-sm font-medium">등록 경로</label>
            <select
              value={enrollSource}
              onChange={(e) => setEnrollSource(e.target.value as EnrollSource | "")}
              className="w-full rounded-2xl border border-ink/10 px-4 py-3 text-sm outline-none focus:border-ink/30"
            >
              <option value="">선택 안 함</option>
              {ENROLL_SOURCE_VALUES.map((src) => (
                <option key={src} value={src}>
                  {ENROLL_SOURCE_LABEL[src]}
                </option>
              ))}
            </select>
          </div>

          {/* isRe */}
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={isRe}
              onChange={(e) => setIsRe(e.target.checked)}
              className="h-4 w-4 rounded border-ink/20 accent-ember"
            />
            <span className="text-sm text-ink">재수강</span>
          </label>
          <div className="flex justify-between pt-2">
            <button
              type="button"
              onClick={() => {
                setErrorMessage(null);
                setStep(1);
              }}
              className="rounded-full border border-ink/10 px-5 py-2.5 text-sm font-semibold text-ink transition hover:border-ink/30"
            >
              ← 이전
            </button>
            <button
              type="button"
              disabled={isPending}
              onClick={goToStep3}
              className="rounded-full bg-ember px-6 py-2.5 text-sm font-semibold text-white transition hover:bg-ember/90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              다음 단계 →
            </button>
          </div>
        </div>
      ) : null}

      {/* ── Step 3: 수강료 확인 ── */}
      {step === 3 ? (
        <div className="rounded-[28px] border border-ink/10 bg-white p-6 space-y-6">
          <h2 className="text-lg font-semibold text-ink">수강료 확인</h2>

          {/* Summary */}
          <div className="rounded-[20px] bg-mist p-4 space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-slate">학생</span>
              <span className="font-medium text-ink">
                {selectedStudent?.name} ({selectedStudent?.examNumber})
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate">수강 유형</span>
              <span className="font-medium text-ink">
                {courseType === "COMPREHENSIVE"
                  ? "종합반"
                  : isInterviewCoachingEnrollment
                    ? "면접 코칭반"
                    : "특강 단과"}
              </span>
            </div>
            {courseType === "COMPREHENSIVE" && selectedCohort ? (
              <div className="flex justify-between">
                <span className="text-slate">기수</span>
                <span className="font-medium text-ink">{selectedCohort.name}</span>
              </div>
            ) : null}
            {courseType === "COMPREHENSIVE" && selectedProduct ? (
              <div className="flex justify-between">
                <span className="text-slate">상품</span>
                <span className="font-medium text-ink">{selectedProduct.name}</span>
              </div>
            ) : null}
            {courseType === "SPECIAL_LECTURE" && selectedSpecialLecture ? (
              <div className="flex justify-between">
                <span className="text-slate">특강</span>
                <span className="font-medium text-ink">{selectedSpecialLecture.name}</span>
              </div>
            ) : null}
            {isInterviewCoachingEnrollment && interviewAgency ? (
              <div className="flex justify-between">
                <span className="text-slate">응시청</span>
                <span className="font-medium text-ink">{interviewAgency}</span>
              </div>
            ) : null}
            {isInterviewCoachingEnrollment && interviewPosition ? (
              <div className="flex justify-between">
                <span className="text-slate">직급</span>
                <span className="font-medium text-ink">{interviewPosition}</span>
              </div>
            ) : null}
            {isInterviewCoachingEnrollment && interviewTrack ? (
              <div className="flex justify-between">
                <span className="text-slate">계열</span>
                <span className="font-medium text-ink">{interviewTrack}</span>
              </div>
            ) : null}
            {isInterviewCoachingEnrollment && interviewGroup ? (
              <div className="flex justify-between">
                <span className="text-slate">조 편성</span>
                <span className="font-medium text-ink">{interviewGroup}</span>
              </div>
            ) : null}
            {isInterviewCoachingEnrollment && interviewLeader ? (
              <div className="flex justify-between">
                <span className="text-slate">조장/담당자</span>
                <span className="font-medium text-ink">{interviewLeader}</span>
              </div>
            ) : null}
            {startDate ? (
              <div className="flex justify-between">
                <span className="text-slate">기간</span>
                <span className="font-medium text-ink tabular-nums">
                  {startDate}
                  {endDate ? ` ~ ${endDate}` : ""}
                </span>
              </div>
            ) : null}
            {enrollSource ? (
              <div className="flex justify-between">
                <span className="text-slate">등록 경로</span>
                <span className="font-medium text-ink">
                  {ENROLL_SOURCE_LABEL[enrollSource as EnrollSource]}
                </span>
              </div>
            ) : null}
            {isRe ? (
              <div className="flex justify-between">
                <span className="text-slate">재수강</span>
                <span className="font-medium text-ink">예</span>
              </div>
            ) : null}
          </div>

          {/* Fee inputs */}
          <div className="space-y-4">
            <div>
              <label className="mb-1.5 block text-sm font-medium">
                수강료 (원) <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                min={0}
                value={regularFee}
                onChange={(e) => setRegularFee(e.target.value)}
                placeholder="예: 500000"
                className="w-full rounded-2xl border border-ink/10 px-4 py-3 text-sm outline-none focus:border-ink/30"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium">
                할인 유형 <span className="text-xs text-slate font-normal">(최대 2개, 한도 50만원)</span>
              </label>
              <div className="flex flex-wrap gap-2">
                {([
                  { key: "SIMULTANEOUS", label: "동시수강", sub: "−5만" },
                  { key: "SIBLING", label: "형제", sub: "−10만" },
                  { key: "POLICE_ADMIN", label: "경찰행정학과", sub: "−10만" },
                  { key: "FAMILY", label: "직계가족", sub: "−10만" },
                  { key: "RETURNING_30", label: "종합반 재수강", sub: "−30%" },
                  { key: "RETURNING_50", label: "이론반 재수강", sub: "−50%" },
                  { key: "ONLINE", label: "인강생 혜택", sub: "인강금액×50%" },
                  { key: "TRANSFER", label: "타학원 환승", sub: "결제금액×30%" },
                  { key: "ADMIN_MANUAL", label: "직접 입력", sub: "" },
                ] as const).map(({ key, label, sub }) => {
                  const selected = selectedDiscountTypes.includes(key);
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => {
                        setSelectedDiscountTypes((prev) => {
                          if (prev.includes(key)) return prev.filter((t) => t !== key);
                          if (prev.length >= 2) return prev;
                          return [...prev, key];
                        });
                      }}
                      className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                        selected
                          ? "border-forest bg-forest text-white"
                          : "border-ink/10 bg-white text-ink hover:border-forest/40"
                      }`}
                    >
                      {label}
                      {sub && <span className={`ml-1 ${selected ? "opacity-80" : "text-slate"}`}>{sub}</span>}
                    </button>
                  );
                })}
              </div>
              {(selectedDiscountTypes.includes("ONLINE") || selectedDiscountTypes.includes("TRANSFER")) && (
                <div className="mt-2">
                  <label className="mb-1 block text-xs text-slate">
                    {selectedDiscountTypes.includes("ONLINE") ? "인강 결제금액" : "타학원 결제금액"} (원)
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={discountBaseInput}
                    onChange={(e) => setDiscountBaseInput(e.target.value)}
                    placeholder="0"
                    className="w-full rounded-2xl border border-ink/10 px-4 py-2.5 text-sm outline-none focus:border-ink/30"
                  />
                </div>
              )}
              {selectedDiscountTypes.includes("ADMIN_MANUAL") && (
                <div className="mt-2">
                  <label className="mb-1 block text-xs text-slate">할인 금액 직접 입력 (원)</label>
                  <input
                    type="number"
                    min={0}
                    value={manualDiscountInput}
                    onChange={(e) => setManualDiscountInput(e.target.value)}
                    placeholder="0"
                    className="w-full rounded-2xl border border-ink/10 px-4 py-2.5 text-sm outline-none focus:border-ink/30"
                  />
                </div>
              )}
              {discountDetail.items.length > 0 && (
                <p className="mt-1.5 text-sm font-semibold text-forest">
                  수동 할인 합계: {manualDiscountAmount.toLocaleString()}원
                  {discountDetail.capAdjustment > 0 && (
                    <span className="ml-1 text-xs text-ember font-normal">
                      (50만원 한도 적용, {discountDetail.capAdjustment.toLocaleString()}원 조정)
                    </span>
                  )}
                </p>
              )}
            </div>

            {/* 할인 코드 섹션 */}
            <div>
              <label className="mb-1.5 block text-sm font-medium text-ink">할인 코드</label>

              {/* 이미 적용된 코드 표시 */}
              {appliedCode ? (
                <div className="flex items-center justify-between rounded-2xl border border-forest/30 bg-forest/5 px-4 py-3">
                  <div className="flex items-center gap-2">
                    <span className="rounded-full border border-forest/30 bg-forest/10 px-2.5 py-0.5 text-xs font-bold text-forest">
                      {appliedCode.code}
                    </span>
                    <span className="text-sm text-forest font-semibold">
                      {appliedCode.description}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={handleRemoveDiscountCode}
                    className="ml-3 flex h-5 w-5 items-center justify-center rounded-full bg-slate/20 text-slate transition hover:bg-red-100 hover:text-red-600"
                    aria-label="할인 코드 제거"
                  >
                    ×
                  </button>
                </div>
              ) : (
                <div className="space-y-1.5">
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={discountCodeInput}
                      onChange={(e) => {
                        setDiscountCodeInput(e.target.value.toUpperCase());
                        setCodeError(null);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          handleApplyDiscountCode();
                        }
                      }}
                      placeholder="할인 코드 입력 (예: POLICE2026)"
                      className="flex-1 rounded-2xl border border-ink/10 px-4 py-3 text-sm outline-none focus:border-ink/30 uppercase placeholder:normal-case"
                    />
                    <button
                      type="button"
                      disabled={isValidatingCode || !discountCodeInput.trim()}
                      onClick={handleApplyDiscountCode}
                      className="rounded-full bg-ink px-5 py-2 text-sm font-medium text-white transition hover:bg-forest disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {isValidatingCode ? "확인 중..." : "적용"}
                    </button>
                  </div>
                  {codeError ? (
                    <p className="text-xs text-red-600">{codeError}</p>
                  ) : null}
                </div>
              )}
            </div>
          </div>

          {/* 수강료 계산 요약 */}
          <div className="rounded-[20px] border border-ink/10 bg-white divide-y divide-ink/5 overflow-hidden">
            {/* 정가 */}
            <div className="flex items-center justify-between px-5 py-3">
              <span className="text-sm text-slate">정가</span>
              <span className="text-sm font-medium text-ink tabular-nums">
                {(Number(regularFee) || 0).toLocaleString()}원
              </span>
            </div>

            {/* 할인 항목별 상세 내역 */}
            {discountDetail.items.map((item) => (
              <div key={item.key} className="flex items-center justify-between px-5 py-2.5 bg-red-50/40">
                <span className="text-sm text-slate">
                  할인 {discountDetail.items.indexOf(item) + 1}
                  <span className="ml-2 rounded-full border border-red-100 bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700">
                    {item.label}
                  </span>
                </span>
                <span className="text-sm font-semibold text-red-600 tabular-nums">
                  −{item.amount.toLocaleString()}원
                </span>
              </div>
            ))}

            {/* 50만원 한도 초과 조정 */}
            {discountDetail.capAdjustment > 0 && (
              <div className="flex items-center justify-between px-5 py-2.5 bg-amber-50/60">
                <span className="text-sm text-amber-700">
                  한도 적용{" "}
                  <span className="text-xs font-normal text-amber-600">(50만원 초과 조정)</span>
                </span>
                <span className="text-sm font-semibold text-amber-700 tabular-nums">
                  +{discountDetail.capAdjustment.toLocaleString()}원
                </span>
              </div>
            )}

            {/* 코드 할인 */}
            {codeDiscountAmount > 0 && appliedCode && (
              <div className="flex items-center justify-between px-5 py-2.5 bg-red-50/40">
                <span className="text-sm text-slate">
                  코드 할인{" "}
                  <span className="rounded-full border border-forest/20 bg-forest/5 px-1.5 py-0.5 text-xs text-forest">
                    {appliedCode.code}
                  </span>
                </span>
                <span className="text-sm font-semibold text-red-600 tabular-nums">
                  −{codeDiscountAmount.toLocaleString()}원
                </span>
              </div>
            )}

            {/* 총 할인 소계 (할인이 2개 이상이거나 코드도 있을 때) */}
            {(discountDetail.items.length > 1 || (discountDetail.items.length >= 1 && codeDiscountAmount > 0)) && (
              <div className="flex items-center justify-between bg-mist/50 px-5 py-2.5">
                <span className="text-sm text-slate">총 할인</span>
                <span className="text-sm font-semibold text-red-600 tabular-nums">
                  −{(manualDiscountAmount + codeDiscountAmount).toLocaleString()}원
                </span>
              </div>
            )}

            {/* 최종 수강료 */}
            <div className="flex items-center justify-between bg-ember/5 px-5 py-4">
              <span className="text-sm font-semibold text-ember">최종 수강료</span>
              <span className="text-xl font-bold text-ember tabular-nums">
                {finalFee.toLocaleString()}원
              </span>
            </div>
          </div>

          <div className="rounded-[20px] border border-ink/10 bg-mist/40 p-4 space-y-4">
            <div>
              <p className="text-sm font-semibold text-ink">법적 동의 확인</p>
              <p className="mt-1 text-xs leading-6 text-slate">
                수강 등록 시 개인정보 수집·이용 동의는 필수이며, 계약서에 기록됩니다. 알림 수신 동의는 선택입니다.
              </p>
            </div>
            <label className="flex items-start gap-3 rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm text-ink">
              <input
                type="checkbox"
                checked={privacyConsentGiven}
                onChange={(event) => setPrivacyConsentGiven(event.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-ink/20 text-forest focus:ring-forest/30"
              />
              <span>
                <span className="font-semibold">[필수] 개인정보 수집·이용에 동의합니다.</span>
                <span className="mt-1 block text-xs text-slate">
                  수집 항목: 이름, 연락처, 생년월일, 수강·수납 내역 / 보유 기간: 수강 종료 후 3년
                </span>
              </span>
            </label>
            <label className="flex items-start gap-3 rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm text-ink">
              <input
                type="checkbox"
                checked={notificationConsentGiven}
                onChange={(event) => setNotificationConsentGiven(event.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-ink/20 text-forest focus:ring-forest/30"
              />
              <span>
                <span className="font-semibold">[선택] 카카오 알림톡 및 문자 수신에 동의합니다.</span>
                <span className="mt-1 block text-xs text-slate">
                  미동의 시에도 수강 등록은 가능하며, 필수 운영 안내는 다른 방식으로 안내할 수 있습니다.
                </span>
              </span>
            </label>
          </div>

          <div className="flex justify-between pt-2">
            <button
              type="button"
              onClick={() => {
                setErrorMessage(null);
                setStep(2);
              }}
              className="rounded-full border border-ink/10 px-5 py-2.5 text-sm font-semibold text-ink transition hover:border-ink/30"
            >
              ← 이전
            </button>
            <button
              type="button"
              disabled={isPending}
              onClick={handleSubmit}
              className="rounded-full bg-ember px-6 py-2.5 text-sm font-semibold text-white transition hover:bg-ember/90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isPending ? "등록 중..." : "수강 등록 완료"}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
