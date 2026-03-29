"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

type StudentResult = {
  examNumber: string;
  name: string;
  phone: string | null;
};

type CourseOption = {
  id: number;
  name: string;
  tuitionFee: number;
};

type CohortOption = {
  id: string;
  name: string;
  examCategory: string;
  isActive: boolean;
  startDate: string;
  endDate: string;
  activeCount: number;
  waitlistCount: number;
};

type ProductOption = {
  id: string;
  name: string;
  examCategory: string;
  durationMonths: number;
  salePrice: number;
  isActive: boolean;
};

type SpecialLectureOption = {
  id: string;
  name: string;
  isActive: boolean;
  startDate: string;
  endDate: string;
  _count?: { enrollments: number };
};

type Props = {
  courses: CourseOption[];
  cohorts: CohortOption[];
  products: ProductOption[];
  specialLectures: SpecialLectureOption[];
};

const TEXT = {
  hours24: "24\uC2DC\uAC04",
  hours48: "48\uC2DC\uAC04",
  hours72: "72\uC2DC\uAC04",
  week1: "1\uC8FC\uC77C",
  customInput: "\uC9C1\uC811 \uC785\uB825",
  studentSection: "\uD559\uC0DD \uC5F0\uACB0 (\uC120\uD0DD)",
  studentHint:
    "\uD2B9\uC815 \uD559\uC0DD\uC5D0\uAC8C \uC804\uC6A9 \uB9C1\uD06C\uB97C \uBCF4\uB0BC \uACBD\uC6B0 \uC120\uD0DD\uD569\uB2C8\uB2E4. \uBE44\uC6CC \uB450\uBA74 \uB204\uAD6C\uB098 \uACB0\uC81C\uD560 \uC218 \uC788\uB294 \uBC94\uC6A9 \uB9C1\uD06C\uAC00 \uB429\uB2C8\uB2E4.",
  searchPlaceholder: "\uC774\uB984 \uB610\uB294 \uD559\uBC88\uC73C\uB85C \uAC80\uC0C9",
  searchLoading: "\uAC80\uC0C9 \uC911...",
  noSearchResults: "\uAC80\uC0C9 \uACB0\uACFC\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4.",
  change: "\uBCC0\uACBD",
  linkInfo: "\uB9C1\uD06C \uC815\uBCF4",
  titleLabel: "\uB9C1\uD06C \uC81C\uBAA9",
  requiredMark: " *",
  titlePlaceholder: "2026 \uACF5\uCC44 \uC885\uD569\uBC18 3\uC6D4 \uB4F1\uB85D",
  courseLabel: "\uACFC\uC815 \uC5F0\uACB0 (\uC120\uD0DD)",
  noCourse: "\uACFC\uC815 \uC120\uD0DD \uC5C6\uC74C",
  amountLabel: "\uACB0\uC81C \uAE08\uC561 (\uC6D0)",
  discountLabel: "\uD560\uC778 \uAE08\uC561 (\uC6D0)",
  finalAmount: "\uCD5C\uC885 \uACB0\uC81C \uAE08\uC561",
  allowPoint: "\uD3EC\uC778\uD2B8 \uC0AC\uC6A9 \uD5C8\uC6A9",
  expiresSection: "\uB9CC\uB8CC \uC124\uC815",
  expiresLabel: "\uB9CC\uB8CC \uC2DC\uAC04",
  maxUsageLabel: "\uCD5C\uB300 \uC0AC\uC6A9 \uD69F\uC218 (\uBE44\uC6CC\uB450\uBA74 \uBB34\uC81C\uD55C)",
  unlimited: "\uBB34\uC81C\uD55C",
  autoEnrollSection: "\uC790\uB3D9 \uC218\uAC15\uB4F1\uB85D \uC124\uC815",
  autoEnrollHint:
    "\uC120\uD0DD \uC0AC\uD56D\uC785\uB2C8\uB2E4. \uACB0\uC81C \uC644\uB8CC \uD6C4 \uC218\uAC15\uB4F1\uB85D\uC744 \uC790\uB3D9\uC73C\uB85C \uCC98\uB9AC\uD569\uB2C8\uB2E4.",
  courseTypeLabel: "\uC218\uAC15 \uC720\uD615",
  selectType: "\uC720\uD615 \uC120\uD0DD",
  comprehensive: "\uC885\uD569\uBC18",
  specialLecture: "\uD2B9\uAC15 \uB2E8\uACFC",
  cohortLabel: "\uAE30\uC218",
  selectCohort: "\uAE30\uC218 \uC120\uD0DD",
  productLabel: "\uC0C1\uD488 (\uC120\uD0DD)",
  noProduct: "\uC0C1\uD488 \uC120\uD0DD \uC5C6\uC74C",
  lectureLabel: "\uD2B9\uAC15",
  selectLecture: "\uD2B9\uAC15 \uC120\uD0DD",
  inactive: " \uBE44\uD65C\uC131",
  enrollCountPrefix: "\uC218\uAC15 ",
  waitlistPrefix: ", \uB300\uAE30 ",
  peopleSuffix: "\uBA85",
  monthSuffix: "\uAC1C\uC6D4",
  autoEnrollSummaryComprehensive:
    "\uACB0\uC81C \uC644\uB8CC \uD6C4 {name}\uB2D8\uC744 {target} \uAE30\uC218\uC5D0 \uC790\uB3D9 \uC218\uAC15\uB4F1\uB85D\uD569\uB2C8\uB2E4.",
  autoEnrollSummaryLecture:
    "\uACB0\uC81C \uC644\uB8CC \uD6C4 {name}\uB2D8\uC744 {target}\uC5D0 \uC790\uB3D9 \uC218\uAC15\uB4F1\uB85D\uD569\uB2C8\uB2E4.",
  selectStudentForSummary:
    "\uD559\uC0DD\uC744 \uC120\uD0DD\uD558\uBA74 \uC790\uB3D9 \uC218\uAC15\uB4F1\uB85D \uB300\uC0C1\uC744 \uBBF8\uB9AC \uD655\uC778\uD560 \uC218 \uC788\uC2B5\uB2C8\uB2E4.",
  noteSection: "\uBA54\uBAA8 (\uB0B4\uBD80\uC6A9, \uC120\uD0DD)",
  notePlaceholder: "3\uC6D4 \uC2E0\uADDC \uC774\uBCA4\uD2B8 \uB9C1\uD06C",
  createLink: "\uACB0\uC81C \uB9C1\uD06C \uC0DD\uC131",
  creating: "\uC0DD\uC131 \uC911...",
  cancel: "\uCDE8\uC18C",
  titleRequired: "\uB9C1\uD06C \uC81C\uBAA9\uC744 \uC785\uB825\uD574 \uC8FC\uC138\uC694.",
  amountRequired: "\uACB0\uC81C \uAE08\uC561\uC744 \uC785\uB825\uD574 \uC8FC\uC138\uC694.",
  expiresRequired: "\uB9CC\uB8CC\uC77C\uC2DC\uB97C \uC785\uB825\uD574 \uC8FC\uC138\uC694.",
  cohortRequired: "\uC790\uB3D9 \uC218\uAC15\uB4F1\uB85D: \uAE30\uC218\uB97C \uC120\uD0DD\uD574 \uC8FC\uC138\uC694.",
  lectureRequired: "\uC790\uB3D9 \uC218\uAC15\uB4F1\uB85D: \uD2B9\uAC15\uC744 \uC120\uD0DD\uD574 \uC8FC\uC138\uC694.",
  createFailed: "\uC0DD\uC131\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4.",
} as const;

const EXPIRY_PRESETS = [
  { label: TEXT.hours24, hours: 24 },
  { label: TEXT.hours48, hours: 48 },
  { label: TEXT.hours72, hours: 72 },
  { label: TEXT.week1, hours: 168 },
  { label: TEXT.customInput, hours: 0 },
];

function addHoursToNow(hours: number): string {
  const d = new Date();
  d.setHours(d.getHours() + hours);
  return d.toISOString().slice(0, 16);
}

function defaultExpiresAt(): string {
  return addHoursToNow(168);
}

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    cache: "no-store",
  });
  const data = await res.json();
  if (!res.ok) throw new Error((data as { error?: string }).error ?? `HTTP ${res.status}`);
  return data as T;
}

function formatDateRange(startDate: string, endDate: string) {
  return `${new Date(startDate).toLocaleDateString("ko-KR")}~${new Date(endDate).toLocaleDateString("ko-KR")}`;
}

function formatTemplate(template: string, values: Record<string, string>) {
  return template.replace(/\{(\w+)\}/g, (_, key) => values[key] ?? "");
}

export function PaymentLinkForm({ courses, cohorts, products, specialLectures }: Props) {
  const router = useRouter();
  const searchRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [isPending, startTransition] = useTransition();

  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setStudentResults] = useState<StudentResult[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [selectedStudent, setSelectedStudent] = useState<StudentResult | null>(null);

  const [title, setTitle] = useState("");
  const [courseId, setCourseId] = useState("");
  const [amount, setAmount] = useState("");
  const [discountAmount, setDiscountAmount] = useState("0");
  const [allowPoint, setAllowPoint] = useState(true);
  const [expiresAt, setExpiresAt] = useState(defaultExpiresAt());
  const [expiryPreset, setExpiryPreset] = useState("168");
  const [maxUsage, setMaxUsage] = useState("");
  const [note, setNote] = useState("");

  const [autoEnrollEnabled, setAutoEnrollEnabled] = useState(false);
  const [courseType, setCourseType] = useState<"COMPREHENSIVE" | "SPECIAL_LECTURE" | "">("");
  const [cohortId, setCohortId] = useState("");
  const [productId, setProductId] = useState("");
  const [specialLectureId, setSpecialLectureId] = useState("");

  const [error, setError] = useState("");

  function handleSearchInput(value: string) {
    setSearchQuery(value);
    if (!value.trim()) {
      setStudentResults([]);
      return;
    }
    if (searchRef.current) clearTimeout(searchRef.current);
    searchRef.current = setTimeout(async () => {
      setSearchLoading(true);
      try {
        const result = await requestJson<{ students: StudentResult[] }>(
          `/api/students?search=${encodeURIComponent(value.trim())}&pageSize=10`,
        );
        setStudentResults(result.students);
      } catch {
        // ignore
      } finally {
        setSearchLoading(false);
      }
    }, 300);
  }

  function handleSelectStudent(student: StudentResult) {
    setSelectedStudent(student);
    setSearchQuery("");
    setStudentResults([]);
  }

  function handleClearStudent() {
    setSelectedStudent(null);
    setSearchQuery("");
    setStudentResults([]);
  }

  function handleCourseChange(id: string) {
    setCourseId(id);
    const course = courses.find((c) => String(c.id) === id);
    if (course) {
      setAmount(String(course.tuitionFee));
    }
  }

  function handleAutoEnrollToggle(enabled: boolean) {
    setAutoEnrollEnabled(enabled);
    if (!enabled) {
      setCourseType("");
      setCohortId("");
      setProductId("");
      setSpecialLectureId("");
    }
  }

  function handleCourseTypeChange(value: "COMPREHENSIVE" | "SPECIAL_LECTURE" | "") {
    setCourseType(value);
    setCohortId("");
    setProductId("");
    setSpecialLectureId("");
  }

  function handleExpiryPreset(preset: string) {
    setExpiryPreset(preset);
    const hours = Number(preset);
    if (hours > 0) {
      setExpiresAt(addHoursToNow(hours));
    }
  }

  function getAutoEnrollSummary(): string | null {
    if (!autoEnrollEnabled || !courseType || !selectedStudent) return null;

    if (courseType === "COMPREHENSIVE") {
      const cohort = cohorts.find((c) => c.id === cohortId);
      if (!cohort) return null;
      return formatTemplate(TEXT.autoEnrollSummaryComprehensive, {
        name: selectedStudent.name,
        target: cohort.name,
      });
    }

    if (courseType === "SPECIAL_LECTURE") {
      const lecture = specialLectures.find((l) => l.id === specialLectureId);
      if (!lecture) return null;
      return formatTemplate(TEXT.autoEnrollSummaryLecture, {
        name: selectedStudent.name,
        target: lecture.name,
      });
    }

    return null;
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      setError(TEXT.titleRequired);
      return;
    }
    const parsedAmount = Number(amount);
    if (!parsedAmount || parsedAmount <= 0) {
      setError(TEXT.amountRequired);
      return;
    }
    if (!expiresAt) {
      setError(TEXT.expiresRequired);
      return;
    }

    if (autoEnrollEnabled && courseType) {
      if (courseType === "COMPREHENSIVE" && !cohortId) {
        setError(TEXT.cohortRequired);
        return;
      }
      if (courseType === "SPECIAL_LECTURE" && !specialLectureId) {
        setError(TEXT.lectureRequired);
        return;
      }
    }

    startTransition(async () => {
      try {
        const payload: Record<string, unknown> = {
          title: trimmedTitle,
          courseId: courseId ? Number(courseId) : undefined,
          examNumber: selectedStudent?.examNumber,
          amount: parsedAmount,
          discountAmount: Number(discountAmount) || 0,
          allowPoint,
          expiresAt: new Date(expiresAt).toISOString(),
          maxUsage: maxUsage ? Number(maxUsage) : undefined,
          note: note.trim() || undefined,
        };

        if (autoEnrollEnabled && courseType) {
          payload.courseType = courseType;
          if (courseType === "COMPREHENSIVE") {
            if (cohortId) payload.cohortId = cohortId;
            if (productId) payload.productId = productId;
          } else if (courseType === "SPECIAL_LECTURE") {
            if (specialLectureId) payload.specialLectureId = specialLectureId;
          }
        }

        const data = await requestJson<{ link: { id: number } }>("/api/payment-links", {
          method: "POST",
          body: JSON.stringify(payload),
        });

        router.push(`/admin/payment-links/${data.link.id}`);
      } catch (err) {
        setError(err instanceof Error ? err.message : TEXT.createFailed);
      }
    });
  }

  const finalAmount = Math.max(0, (Number(amount) || 0) - (Number(discountAmount) || 0));
  const autoEnrollSummary = getAutoEnrollSummary();

  const inputClass =
    "w-full rounded-2xl border border-ink/15 bg-white px-4 py-2.5 text-sm outline-none focus:border-ember/60 focus:ring-1 focus:ring-ember/30";

  const labelClass = "mb-1.5 block text-xs font-medium text-slate";

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      <div className="rounded-[28px] border border-ink/10 bg-white p-6">
        <h2 className="mb-4 text-sm font-semibold text-forest">{TEXT.studentSection}</h2>
        <p className="mb-3 text-xs text-slate">{TEXT.studentHint}</p>

        {selectedStudent ? (
          <div className="flex items-center justify-between rounded-2xl border border-forest/20 bg-forest/5 px-4 py-3">
            <div className="text-sm">
              <span className="font-semibold text-ink">{selectedStudent.name}</span>
              <span className="ml-2 text-slate">\uD559\uBC88 {selectedStudent.examNumber}</span>
              {selectedStudent.phone ? (
                <span className="ml-2 text-slate">{selectedStudent.phone}</span>
              ) : null}
            </div>
            <button
              type="button"
              onClick={handleClearStudent}
              className="ml-4 rounded-full border border-ink/15 px-3 py-1 text-xs font-medium text-ink transition hover:border-ink/30"
            >
              {TEXT.change}
            </button>
          </div>
        ) : (
          <div className="relative">
            <div className="flex gap-2">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => handleSearchInput(e.target.value)}
                placeholder={TEXT.searchPlaceholder}
                className={inputClass}
                autoComplete="off"
              />
              {searchLoading ? (
                <span className="flex items-center px-2 text-xs text-slate">{TEXT.searchLoading}</span>
              ) : null}
            </div>

            {searchResults.length > 0 ? (
              <ul className="absolute z-10 mt-1 max-h-48 w-full overflow-y-auto rounded-2xl border border-ink/15 bg-white py-1 shadow-lg">
                {searchResults.map((student) => (
                  <li key={student.examNumber}>
                    <button
                      type="button"
                      onClick={() => handleSelectStudent(student)}
                      className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm transition hover:bg-mist/50"
                    >
                      <span className="font-medium text-ink">{student.name}</span>
                      <span className="text-xs text-slate">#{student.examNumber}</span>
                      {student.phone ? <span className="text-xs text-slate">{student.phone}</span> : null}
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}

            {searchQuery.trim() && !searchLoading && searchResults.length === 0 ? (
              <p className="mt-2 text-xs text-slate">{TEXT.noSearchResults}</p>
            ) : null}
          </div>
        )}
      </div>

      <div className="rounded-[28px] border border-ink/10 bg-white p-6">
        <h2 className="mb-4 text-sm font-semibold text-forest">{TEXT.linkInfo}</h2>

        <div className="mb-4">
          <label className={labelClass}>
            {TEXT.titleLabel}
            <span className="text-red-500">{TEXT.requiredMark}</span>
          </label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={TEXT.titlePlaceholder}
            required
            className={inputClass}
          />
        </div>

        <div className="mb-4">
          <label className={labelClass}>{TEXT.courseLabel}</label>
          <select value={courseId} onChange={(e) => handleCourseChange(e.target.value)} className={inputClass}>
            <option value="">{TEXT.noCourse}</option>
            {courses.map((course) => (
              <option key={course.id} value={String(course.id)}>
                {course.name} ({course.tuitionFee.toLocaleString()}\uC6D0)
              </option>
            ))}
          </select>
        </div>

        <div className="mb-4 grid grid-cols-2 gap-3">
          <div>
            <label className={labelClass}>
              {TEXT.amountLabel}
              <span className="text-red-500">{TEXT.requiredMark}</span>
            </label>
            <input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              min={1}
              placeholder="600000"
              required
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>{TEXT.discountLabel}</label>
            <input
              type="number"
              value={discountAmount}
              onChange={(e) => setDiscountAmount(e.target.value)}
              min={0}
              placeholder="0"
              className={inputClass}
            />
          </div>
        </div>

        {amount ? (
          <div className="mb-4 rounded-2xl border border-forest/15 bg-forest/5 px-4 py-2.5">
            <p className="text-sm font-semibold text-forest">
              {TEXT.finalAmount}: {finalAmount.toLocaleString()}\uC6D0
            </p>
          </div>
        ) : null}

        <label className="mb-4 flex cursor-pointer items-center gap-2">
          <input
            type="checkbox"
            checked={allowPoint}
            onChange={(e) => setAllowPoint(e.target.checked)}
            className="h-4 w-4 rounded border-ink/20 text-ember"
          />
          <span className="text-sm text-ink">{TEXT.allowPoint}</span>
        </label>
      </div>

      <div className="rounded-[28px] border border-ink/10 bg-white p-6">
        <h2 className="mb-4 text-sm font-semibold text-forest">{TEXT.expiresSection}</h2>

        <div className="mb-3">
          <label className={labelClass}>
            {TEXT.expiresLabel}
            <span className="text-red-500">{TEXT.requiredMark}</span>
          </label>
          <div className="mb-3 flex flex-wrap gap-2">
            {EXPIRY_PRESETS.map((preset) => (
              <button
                key={preset.hours}
                type="button"
                onClick={() => handleExpiryPreset(String(preset.hours))}
                className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
                  expiryPreset === String(preset.hours)
                    ? "border-ember/40 bg-ember/10 text-ember"
                    : "border-ink/15 text-ink hover:border-ink/30"
                }`}
              >
                {preset.label}
              </button>
            ))}
          </div>
          <input
            type="datetime-local"
            value={expiresAt}
            onChange={(e) => {
              setExpiresAt(e.target.value);
              setExpiryPreset("0");
            }}
            required
            className={inputClass}
          />
        </div>

        <div>
          <label className={labelClass}>{TEXT.maxUsageLabel}</label>
          <input
            type="number"
            value={maxUsage}
            onChange={(e) => setMaxUsage(e.target.value)}
            min={1}
            placeholder={TEXT.unlimited}
            className={inputClass}
          />
        </div>
      </div>

      <div className="rounded-[28px] border border-ink/10 bg-white p-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-forest">{TEXT.autoEnrollSection}</h2>
            <p className="mt-0.5 text-xs text-slate">{TEXT.autoEnrollHint}</p>
          </div>
          <button
            type="button"
            onClick={() => handleAutoEnrollToggle(!autoEnrollEnabled)}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${
              autoEnrollEnabled ? "bg-ember" : "bg-ink/20"
            }`}
            aria-pressed={autoEnrollEnabled}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                autoEnrollEnabled ? "translate-x-6" : "translate-x-1"
              }`}
            />
          </button>
        </div>

        {autoEnrollEnabled ? (
          <div className="mt-5 space-y-4">
            <div>
              <label className={labelClass}>{TEXT.courseTypeLabel}</label>
              <select
                value={courseType}
                onChange={(e) =>
                  handleCourseTypeChange(e.target.value as "COMPREHENSIVE" | "SPECIAL_LECTURE" | "")
                }
                className={inputClass}
              >
                <option value="">{TEXT.selectType}</option>
                <option value="COMPREHENSIVE">{TEXT.comprehensive}</option>
                <option value="SPECIAL_LECTURE">{TEXT.specialLecture}</option>
              </select>
            </div>

            {courseType === "COMPREHENSIVE" ? (
              <>
                <div>
                  <label className={labelClass}>
                    {TEXT.cohortLabel}
                    <span className="text-red-500">{TEXT.requiredMark}</span>
                  </label>
                  <select value={cohortId} onChange={(e) => setCohortId(e.target.value)} className={inputClass}>
                    <option value="">{TEXT.selectCohort}</option>
                    {cohorts.map((cohort) => (
                      <option key={cohort.id} value={cohort.id}>
                        {cohort.name}
                        {cohort.isActive ? "" : TEXT.inactive}
                        {" · "}
                        {formatDateRange(cohort.startDate, cohort.endDate)}
                        {" ("}
                        {TEXT.enrollCountPrefix}
                        {cohort.activeCount}
                        {TEXT.peopleSuffix}
                        {cohort.waitlistCount > 0
                          ? `${TEXT.waitlistPrefix}${cohort.waitlistCount}${TEXT.peopleSuffix}`
                          : ""}
                        {")"}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className={labelClass}>{TEXT.productLabel}</label>
                  <select value={productId} onChange={(e) => setProductId(e.target.value)} className={inputClass}>
                    <option value="">{TEXT.noProduct}</option>
                    {products.map((product) => (
                      <option key={product.id} value={product.id}>
                        {product.name}
                        {" · "}
                        {product.durationMonths}
                        {TEXT.monthSuffix}
                        {" ("}
                        {product.salePrice.toLocaleString()}
                        {"\uC6D0)"}
                        {product.isActive ? "" : TEXT.inactive}
                      </option>
                    ))}
                  </select>
                </div>
              </>
            ) : null}

            {courseType === "SPECIAL_LECTURE" ? (
              <div>
                <label className={labelClass}>
                  {TEXT.lectureLabel}
                  <span className="text-red-500">{TEXT.requiredMark}</span>
                </label>
                <select
                  value={specialLectureId}
                  onChange={(e) => setSpecialLectureId(e.target.value)}
                  className={inputClass}
                >
                  <option value="">{TEXT.selectLecture}</option>
                  {specialLectures.map((lecture) => (
                    <option key={lecture.id} value={lecture.id}>
                      {lecture.name}
                      {lecture.isActive ? "" : TEXT.inactive}
                      {" · "}
                      {formatDateRange(lecture.startDate, lecture.endDate)}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}

            {autoEnrollSummary ? (
              <div className="flex items-start gap-2.5 rounded-2xl border border-forest/20 bg-forest/5 px-4 py-3">
                <span className="mt-0.5 text-base leading-none text-forest" aria-hidden="true">
                  i
                </span>
                <p className="text-sm text-forest">{autoEnrollSummary}</p>
              </div>
            ) : null}

            {!selectedStudent && courseType ? (
              <p className="text-xs text-slate">{TEXT.selectStudentForSummary}</p>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="rounded-[28px] border border-ink/10 bg-white p-6">
        <h2 className="mb-4 text-sm font-semibold text-forest">{TEXT.noteSection}</h2>
        <input
          type="text"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder={TEXT.notePlaceholder}
          className={inputClass}
        />
      </div>

      <div className="flex gap-3">
        <button
          type="submit"
          disabled={isPending}
          className="rounded-full bg-ember px-8 py-2.5 text-sm font-semibold text-white transition hover:bg-ember/90 disabled:opacity-50"
        >
          {isPending ? TEXT.creating : TEXT.createLink}
        </button>
        <a
          href="/admin/payments/links"
          className="rounded-full border border-ink/15 px-8 py-2.5 text-sm font-semibold text-ink transition hover:border-ink/30"
        >
          {TEXT.cancel}
        </a>
      </div>
    </form>
  );
}
