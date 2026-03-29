"use client";

import { useRef, useState } from "react";

type UploadResult = {
  inserted: number;
  skipped: number;
  errors: { row: number; reason: string }[];
};

const ENROLLMENT_CSV_HEADERS = [
  "학번",
  "수강반명",
  "등록일(YYYY-MM-DD)",
  "시작일(YYYY-MM-DD)",
  "종료일(YYYY-MM-DD)",
  "수강료(원)",
  "할인금액(원)",
  "최종수강료(원)",
  "상태(ACTIVE/COMPLETED/WITHDRAWN)",
  "비고",
].join(",");

const PAYMENT_CSV_HEADERS = [
  "학번",
  "납부일(YYYY-MM-DD)",
  "납부방법(CASH/CARD/TRANSFER)",
  "수납금액(원)",
  "분류(TUITION/TEXTBOOK/FACILITY/ETC)",
  "비고",
].join(",");

function downloadCSV(filename: string, content: string) {
  const BOM = "\uFEFF";
  const blob = new Blob([BOM + content + "\n"], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export function EnrollmentPaymentMigrationPanels() {
  const [enrollmentNotice, setEnrollmentNotice] = useState<string | null>(null);
  const [paymentNotice, setPaymentNotice] = useState<string | null>(null);
  const [enrollmentUploading, setEnrollmentUploading] = useState(false);
  const [paymentUploading, setPaymentUploading] = useState(false);
  const [enrollmentResult, setEnrollmentResult] = useState<UploadResult | null>(null);
  const [paymentResult, setPaymentResult] = useState<UploadResult | null>(null);
  const enrollmentFileRef = useRef<HTMLInputElement>(null);
  const paymentFileRef = useRef<HTMLInputElement>(null);

  function handleEnrollmentDownload() {
    downloadCSV("수강등록_마이그레이션_양식.csv", ENROLLMENT_CSV_HEADERS);
    setEnrollmentNotice("CSV 양식 파일이 다운로드되었습니다. 에듀그램 데이터를 이 양식에 맞게 변환하여 업로드하세요.");
  }

  function handlePaymentDownload() {
    downloadCSV("수납내역_마이그레이션_양식.csv", PAYMENT_CSV_HEADERS);
    setPaymentNotice("CSV 양식 파일이 다운로드되었습니다. 에듀그램 데이터를 이 양식에 맞게 변환하여 업로드하세요.");
  }

  async function handleEnrollmentUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setEnrollmentUploading(true);
    setEnrollmentResult(null);
    setEnrollmentNotice(null);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch("/api/migration/enrollments", {
        method: "POST",
        body: formData,
      });

      const json = await res.json() as { data?: UploadResult; error?: string };

      if (!res.ok || json.error) {
        setEnrollmentNotice(`오류: ${json.error ?? "업로드 실패"}`);
        return;
      }

      if (json.data) {
        setEnrollmentResult(json.data);
        setEnrollmentNotice(
          `완료: ${json.data.inserted}건 등록, ${json.data.skipped}건 스킵${json.data.errors.length > 0 ? `, ${json.data.errors.length}건 오류` : ""}`,
        );
      }
    } catch {
      setEnrollmentNotice("네트워크 오류가 발생했습니다.");
    } finally {
      setEnrollmentUploading(false);
      if (enrollmentFileRef.current) enrollmentFileRef.current.value = "";
    }
  }

  async function handlePaymentUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setPaymentUploading(true);
    setPaymentResult(null);
    setPaymentNotice(null);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch("/api/migration/payments", {
        method: "POST",
        body: formData,
      });

      const json = await res.json() as { data?: UploadResult; error?: string };

      if (!res.ok || json.error) {
        setPaymentNotice(`오류: ${json.error ?? "업로드 실패"}`);
        return;
      }

      if (json.data) {
        setPaymentResult(json.data);
        setPaymentNotice(
          `완료: ${json.data.inserted}건 등록, ${json.data.skipped}건 스킵${json.data.errors.length > 0 ? `, ${json.data.errors.length}건 오류` : ""}`,
        );
      }
    } catch {
      setPaymentNotice("네트워크 오류가 발생했습니다.");
    } finally {
      setPaymentUploading(false);
      if (paymentFileRef.current) paymentFileRef.current.value = "";
    }
  }

  return (
    <>
      {/* Enrollment migration panel */}
      <section className="rounded-[28px] border border-ink/10 bg-white p-6">
        <div className="flex items-start gap-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-sky-200 bg-sky-50 text-base font-bold text-sky-700">
            2
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-xl font-semibold">수강 등록 내역 가져오기</h2>
            <p className="mt-2 text-sm leading-7 text-slate">
              에듀그램에서 내보낸 수강 등록 내역을 CSV 양식에 맞춰 변환합니다.
              지원 형식: <code className="rounded bg-mist px-1.5 py-0.5 text-xs">CSV</code>{" "}
              (학번, 수강반, 등록일, 수강료, 상태)
            </p>

            <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-7 text-amber-800">
              수강반명은 시스템에 등록된 기수(Cohort) 이름과 정확히 일치해야 합니다. 먼저{" "}
              <strong>기수 설정</strong>을 완료한 후 업로드하세요.
            </div>

            <div className="mt-5">
              <p className="mb-2 text-xs font-medium text-slate uppercase tracking-wide">CSV 컬럼 구조</p>
              <div className="overflow-x-auto rounded-2xl border border-ink/10 bg-mist">
                <table className="min-w-full text-xs">
                  <thead className="border-b border-ink/10 bg-mist/80">
                    <tr>
                      {["학번", "수강반명", "등록일", "시작일", "종료일", "수강료", "할인금액", "최종수강료", "상태", "비고"].map((col) => (
                        <th key={col} className="px-3 py-2 text-left font-semibold text-slate whitespace-nowrap">
                          {col}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="text-slate/70">
                      <td className="px-3 py-2 font-mono whitespace-nowrap">2024001</td>
                      <td className="px-3 py-2 whitespace-nowrap">공채 1기 A반</td>
                      <td className="px-3 py-2 font-mono whitespace-nowrap">2024-03-01</td>
                      <td className="px-3 py-2 font-mono whitespace-nowrap">2024-03-04</td>
                      <td className="px-3 py-2 font-mono whitespace-nowrap">2024-03-29</td>
                      <td className="px-3 py-2 whitespace-nowrap">800000</td>
                      <td className="px-3 py-2 whitespace-nowrap">0</td>
                      <td className="px-3 py-2 whitespace-nowrap">800000</td>
                      <td className="px-3 py-2 whitespace-nowrap">ACTIVE</td>
                      <td className="px-3 py-2 whitespace-nowrap">—</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            <div className="mt-5 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={handleEnrollmentDownload}
                className="inline-flex items-center gap-2 rounded-full bg-ink px-5 py-3 text-sm font-semibold text-white transition hover:bg-forest"
              >
                CSV 양식 다운로드
              </button>
              <label
                className={`inline-flex cursor-pointer items-center gap-2 rounded-full border px-5 py-3 text-sm font-semibold transition ${
                  enrollmentUploading
                    ? "border-ink/10 bg-mist text-slate cursor-wait"
                    : "border-sky-200 bg-sky-50 text-sky-700 hover:bg-sky-100"
                }`}
              >
                {enrollmentUploading ? (
                  <>
                    <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-sky-400 border-t-transparent" />
                    업로드 중...
                  </>
                ) : (
                  "파일 선택 및 업로드"
                )}
                <input
                  ref={enrollmentFileRef}
                  type="file"
                  accept=".csv"
                  className="sr-only"
                  disabled={enrollmentUploading}
                  onChange={handleEnrollmentUpload}
                />
              </label>
            </div>

            {enrollmentNotice && (
              <div
                className={`mt-4 rounded-2xl border px-4 py-3 text-sm ${
                  enrollmentNotice.startsWith("오류")
                    ? "border-red-200 bg-red-50 text-red-700"
                    : "border-forest/20 bg-forest/10 text-forest"
                }`}
              >
                {enrollmentNotice}
              </div>
            )}

            {enrollmentResult && enrollmentResult.errors.length > 0 && (
              <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3">
                <p className="mb-2 text-sm font-semibold text-amber-800">오류 목록 ({enrollmentResult.errors.length}건)</p>
                <div className="max-h-48 overflow-y-auto">
                  <table className="min-w-full text-xs text-amber-900">
                    <thead>
                      <tr className="border-b border-amber-200">
                        <th className="px-2 py-1 text-left font-medium">행</th>
                        <th className="px-2 py-1 text-left font-medium">오류 내용</th>
                      </tr>
                    </thead>
                    <tbody>
                      {enrollmentResult.errors.map((err) => (
                        <tr key={err.row} className="border-b border-amber-100">
                          <td className="px-2 py-1 font-mono">{err.row}</td>
                          <td className="px-2 py-1">{err.reason}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Payment migration panel */}
      <section className="rounded-[28px] border border-ink/10 bg-white p-6">
        <div className="flex items-start gap-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-purple-200 bg-purple-50 text-base font-bold text-purple-700">
            3
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-xl font-semibold">수납 내역 가져오기</h2>
            <p className="mt-2 text-sm leading-7 text-slate">
              에듀그램에서 내보낸 수납 내역을 CSV 양식에 맞춰 변환합니다.
              지원 형식: <code className="rounded bg-mist px-1.5 py-0.5 text-xs">CSV</code>{" "}
              (학번, 납부일, 금액, 납부방법)
            </p>

            <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-7 text-amber-800">
              수납 내역은 학생의 가장 최근 <strong>ACTIVE</strong> 수강 등록에 자동으로 연결됩니다.
              수강 등록 마이그레이션을 먼저 완료한 후 업로드하세요.
            </div>

            <div className="mt-5">
              <p className="mb-2 text-xs font-medium text-slate uppercase tracking-wide">CSV 컬럼 구조</p>
              <div className="overflow-x-auto rounded-2xl border border-ink/10 bg-mist">
                <table className="min-w-full text-xs">
                  <thead className="border-b border-ink/10 bg-mist/80">
                    <tr>
                      {["학번", "납부일", "납부방법", "수납금액(원)", "분류", "비고"].map((col) => (
                        <th key={col} className="px-3 py-2 text-left font-semibold text-slate whitespace-nowrap">
                          {col}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="text-slate/70">
                      <td className="px-3 py-2 font-mono whitespace-nowrap">2024001</td>
                      <td className="px-3 py-2 font-mono whitespace-nowrap">2024-03-04</td>
                      <td className="px-3 py-2 whitespace-nowrap">CASH</td>
                      <td className="px-3 py-2 whitespace-nowrap">800000</td>
                      <td className="px-3 py-2 whitespace-nowrap">TUITION</td>
                      <td className="px-3 py-2 whitespace-nowrap">—</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            <div className="mt-5 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={handlePaymentDownload}
                className="inline-flex items-center gap-2 rounded-full bg-ink px-5 py-3 text-sm font-semibold text-white transition hover:bg-forest"
              >
                CSV 양식 다운로드
              </button>
              <label
                className={`inline-flex cursor-pointer items-center gap-2 rounded-full border px-5 py-3 text-sm font-semibold transition ${
                  paymentUploading
                    ? "border-ink/10 bg-mist text-slate cursor-wait"
                    : "border-purple-200 bg-purple-50 text-purple-700 hover:bg-purple-100"
                }`}
              >
                {paymentUploading ? (
                  <>
                    <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-purple-400 border-t-transparent" />
                    업로드 중...
                  </>
                ) : (
                  "파일 선택 및 업로드"
                )}
                <input
                  ref={paymentFileRef}
                  type="file"
                  accept=".csv"
                  className="sr-only"
                  disabled={paymentUploading}
                  onChange={handlePaymentUpload}
                />
              </label>
            </div>

            {paymentNotice && (
              <div
                className={`mt-4 rounded-2xl border px-4 py-3 text-sm ${
                  paymentNotice.startsWith("오류")
                    ? "border-red-200 bg-red-50 text-red-700"
                    : "border-forest/20 bg-forest/10 text-forest"
                }`}
              >
                {paymentNotice}
              </div>
            )}

            {paymentResult && paymentResult.errors.length > 0 && (
              <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3">
                <p className="mb-2 text-sm font-semibold text-amber-800">오류 목록 ({paymentResult.errors.length}건)</p>
                <div className="max-h-48 overflow-y-auto">
                  <table className="min-w-full text-xs text-amber-900">
                    <thead>
                      <tr className="border-b border-amber-200">
                        <th className="px-2 py-1 text-left font-medium">행</th>
                        <th className="px-2 py-1 text-left font-medium">오류 내용</th>
                      </tr>
                    </thead>
                    <tbody>
                      {paymentResult.errors.map((err) => (
                        <tr key={err.row} className="border-b border-amber-100">
                          <td className="px-2 py-1 font-mono">{err.row}</td>
                          <td className="px-2 py-1">{err.reason}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </div>
      </section>
    </>
  );
}
