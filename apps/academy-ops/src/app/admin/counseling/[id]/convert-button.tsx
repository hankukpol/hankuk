"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

type Cohort = {
  id: string;
  name: string;
};

type Product = {
  id: string;
  name: string;
};

type SpecialLecture = {
  id: string;
  name: string;
};

type Props = {
  recordId: number;
  studentName: string;
  examNumber: string;
  cohorts: Cohort[];
  products: Product[];
  specialLectures: SpecialLecture[];
};

function Spinner() {
  return (
    <svg
      className="mr-1.5 inline-block h-3 w-3 animate-spin"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
      />
    </svg>
  );
}

export function ConvertToEnrollmentButton({
  recordId,
  studentName,
  examNumber,
  cohorts,
  products,
  specialLectures,
}: Props) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  // form state
  const [courseType, setCourseType] = useState<"COMPREHENSIVE" | "SPECIAL_LECTURE">("COMPREHENSIVE");
  const [productId, setProductId] = useState(products[0]?.id ?? "");
  const [cohortId, setCohortId] = useState(cohorts[0]?.id ?? "");
  const [specialLectureId, setSpecialLectureId] = useState(specialLectures[0]?.id ?? "");
  const [startDate, setStartDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [regularFee, setRegularFee] = useState("");
  const [discountAmount, setDiscountAmount] = useState("0");
  const [note, setNote] = useState("");

  const finalFee =
    (Number(regularFee) || 0) - (Number(discountAmount) || 0);

  function handleSubmit() {
    startTransition(async () => {
      try {
        const body: Record<string, unknown> = {
          courseType,
          startDate,
          regularFee: Number(regularFee) || 0,
          discountAmount: Number(discountAmount) || 0,
          finalFee: Math.max(0, finalFee),
          enrollSource: "VISIT",
          note: note || undefined,
        };

        if (courseType === "COMPREHENSIVE") {
          body.productId = productId;
          body.cohortId = cohortId || undefined;
        } else {
          body.specialLectureId = specialLectureId;
        }

        const res = await fetch(`/api/counseling/${recordId}/convert`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const data = (await res.json()) as { enrollment?: { id: string }; error?: string };

        if (!res.ok || !data.enrollment) {
          throw new Error(data.error ?? "전환에 실패했습니다.");
        }

        toast.success("수강 등록으로 전환했습니다.");
        router.push(`/admin/enrollments/${data.enrollment.id}`);
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "전환에 실패했습니다.");
      }
    });
  }

  return (
    <>
      {/* Trigger button */}
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="inline-flex items-center justify-center rounded-full border border-ember/30 bg-ember/5 px-4 py-2.5 text-sm font-semibold text-ember transition hover:bg-ember/10"
      >
        수강 등록으로 전환
      </button>

      {/* Modal backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) setIsOpen(false);
          }}
        >
          <div className="w-full max-w-lg rounded-[28px] bg-white p-6 shadow-xl">
            <h2 className="text-lg font-semibold">수강 등록 전환</h2>
            <p className="mt-1 text-sm text-slate-500">
              <span className="font-medium">{studentName}</span> ({examNumber}) 학생을 면담 기록에서
              수강 등록으로 전환합니다.
            </p>

            <div className="mt-5 space-y-4">
              {/* Course type */}
              <div>
                <label className="mb-1.5 block text-sm font-medium">수강 유형</label>
                <div className="flex gap-3">
                  {(["COMPREHENSIVE", "SPECIAL_LECTURE"] as const).map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setCourseType(t)}
                      className={`rounded-full border px-4 py-2 text-sm font-semibold transition ${
                        courseType === t
                          ? "border-ember bg-ember text-white"
                          : "border-ink/10 hover:border-ember/30 hover:text-ember"
                      }`}
                    >
                      {t === "COMPREHENSIVE" ? "종합반" : "특강/단과"}
                    </button>
                  ))}
                </div>
              </div>

              {/* Comprehensive fields */}
              {courseType === "COMPREHENSIVE" && (
                <>
                  {products.length > 0 && (
                    <div>
                      <label className="mb-1.5 block text-sm font-medium">상품</label>
                      <select
                        value={productId}
                        onChange={(e) => setProductId(e.target.value)}
                        className="w-full rounded-2xl border border-ink/10 px-4 py-3 text-sm focus:border-ember/50 focus:outline-none"
                      >
                        <option value="">-- 상품 선택 --</option>
                        {products.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                  {cohorts.length > 0 && (
                    <div>
                      <label className="mb-1.5 block text-sm font-medium">기수</label>
                      <select
                        value={cohortId}
                        onChange={(e) => setCohortId(e.target.value)}
                        className="w-full rounded-2xl border border-ink/10 px-4 py-3 text-sm focus:border-ember/50 focus:outline-none"
                      >
                        <option value="">-- 기수 선택 --</option>
                        {cohorts.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </>
              )}

              {/* Special lecture fields */}
              {courseType === "SPECIAL_LECTURE" && specialLectures.length > 0 && (
                <div>
                  <label className="mb-1.5 block text-sm font-medium">특강</label>
                  <select
                    value={specialLectureId}
                    onChange={(e) => setSpecialLectureId(e.target.value)}
                    className="w-full rounded-2xl border border-ink/10 px-4 py-3 text-sm focus:border-ember/50 focus:outline-none"
                  >
                    <option value="">-- 특강 선택 --</option>
                    {specialLectures.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Start date */}
              <div>
                <label className="mb-1.5 block text-sm font-medium">시작일</label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-full rounded-2xl border border-ink/10 px-4 py-3 text-sm focus:border-ember/50 focus:outline-none"
                />
              </div>

              {/* Fees */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1.5 block text-sm font-medium">수강료 (원)</label>
                  <input
                    type="number"
                    min="0"
                    placeholder="1200000"
                    value={regularFee}
                    onChange={(e) => setRegularFee(e.target.value)}
                    className="w-full rounded-2xl border border-ink/10 px-4 py-3 text-sm focus:border-ember/50 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium">할인 (원)</label>
                  <input
                    type="number"
                    min="0"
                    placeholder="0"
                    value={discountAmount}
                    onChange={(e) => setDiscountAmount(e.target.value)}
                    className="w-full rounded-2xl border border-ink/10 px-4 py-3 text-sm focus:border-ember/50 focus:outline-none"
                  />
                </div>
              </div>
              <p className="text-sm text-slate-500">
                최종 수강료:{" "}
                <span className="font-semibold text-ink">
                  {Math.max(0, finalFee).toLocaleString("ko-KR")}원
                </span>
              </p>

              {/* Note */}
              <div>
                <label className="mb-1.5 block text-sm font-medium">메모 (선택)</label>
                <input
                  type="text"
                  placeholder="특이사항 메모"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  className="w-full rounded-2xl border border-ink/10 px-4 py-3 text-sm focus:border-ember/50 focus:outline-none"
                />
              </div>
            </div>

            {/* Actions */}
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                disabled={isPending}
                className="inline-flex items-center rounded-full border border-ink/10 px-5 py-2.5 text-sm font-semibold transition hover:border-ember/30 hover:text-ember disabled:cursor-not-allowed disabled:opacity-60"
              >
                취소
              </button>
              <button
                type="button"
                onClick={handleSubmit}
                disabled={isPending || !regularFee || !startDate}
                className="inline-flex items-center rounded-full bg-ember px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-ember/90 disabled:cursor-not-allowed disabled:bg-ember/40"
              >
                {isPending && <Spinner />}
                수강 등록 전환
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
