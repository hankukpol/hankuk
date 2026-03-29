"use client";

import { useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { PassType } from "@prisma/client";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import type { GraduateDetail } from "./page";
import { GraduateEditForm } from "./graduate-edit-form";

const PASS_TYPE_LABEL: Record<PassType, string> = {
  WRITTEN_PASS: "필기합격",
  FINAL_PASS: "최종합격",
  APPOINTED: "임용",
  WRITTEN_FAIL: "필기불합격",
  FINAL_FAIL: "최종불합격",
};

const PASS_TYPE_COLOR: Record<PassType, string> = {
  WRITTEN_PASS: "bg-sky-50 text-sky-700 border-sky-200",
  FINAL_PASS: "bg-forest/10 text-forest border-forest/20",
  APPOINTED: "bg-amber-50 text-amber-700 border-amber-200",
  WRITTEN_FAIL: "bg-ink/5 text-slate border-ink/10",
  FINAL_FAIL: "bg-red-50 text-red-600 border-red-200",
};

const EXAM_TYPE_LABEL: Record<string, string> = {
  GONGCHAE: "공채",
  GYEONGCHAE: "경채",
};

const SUBJECT_LABEL: Record<string, string> = {
  CONSTITUTIONAL_LAW: "헌법",
  CRIMINAL_LAW: "형법",
  CRIMINAL_PROCEDURE: "형사소송법",
  POLICE_SCIENCE: "경찰학",
  ENGLISH: "영어",
  KOREAN: "국어",
  MATHEMATICS: "수학",
  ADMINISTRATIVE_LAW: "행정법",
  GENERAL_KNOWLEDGE: "일반상식",
};

const SNAPSHOT_TYPES: PassType[] = ["WRITTEN_PASS", "FINAL_PASS", "APPOINTED"];

interface Props {
  detail: GraduateDetail;
}

export function GraduateDetailClient({ detail }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [activeTab, setActiveTab] = useState<PassType | null>(
    detail.scoreSnapshots.length > 0 ? detail.scoreSnapshots[0].snapshotType : null,
  );
  const [creatingType, setCreatingType] = useState<PassType | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editOpen, setEditOpen] = useState(false);

  const activeSnapshot = detail.scoreSnapshots.find((s) => s.snapshotType === activeTab) ?? null;
  const existingTypes = new Set(detail.scoreSnapshots.map((s) => s.snapshotType));

  function handleCreateSnapshot(type: PassType) {
    setCreatingType(type);
    setError(null);
    startTransition(async () => {
      try {
        const res = await fetch(`/api/graduates/${detail.id}/snapshot`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ snapshotType: type }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "스냅샷 생성 실패");
        setActiveTab(type);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "스냅샷 생성 실패");
      } finally {
        setCreatingType(null);
      }
    });
  }

  function handleDeleteSnapshot(type: PassType) {
    if (!confirm(`${PASS_TYPE_LABEL[type]} 스냅샷을 삭제하시겠습니까?`)) return;
    startTransition(async () => {
      await fetch(`/api/graduates/${detail.id}/snapshot?type=${type}`, { method: "DELETE" });
      if (activeTab === type) setActiveTab(null);
      router.refresh();
    });
  }

  const monthlyData = activeSnapshot?.monthlyAverages ?? [];
  const subjectEntries = activeSnapshot
    ? Object.entries(activeSnapshot.subjectAverages).sort(([a], [b]) => a.localeCompare(b))
    : [];

  return (
    <div className="mt-8 space-y-6">
      {/* 수정 폼 */}
      {editOpen && (
        <GraduateEditForm
          detail={detail}
          onClose={() => setEditOpen(false)}
        />
      )}

      {/* 기본 정보 카드 */}
      <div className="rounded-[28px] border border-ink/10 bg-white p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold">기본 정보</h2>
          {!editOpen && (
            <button
              onClick={() => setEditOpen(true)}
              className="rounded-[16px] border border-ink/20 px-3 py-1.5 text-xs font-medium text-slate transition-colors hover:border-forest hover:text-forest"
            >
              수정
            </button>
          )}
        </div>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          <InfoItem
            label="학번"
            value={
              <a
                href={`/admin/students/${detail.examNumber}`}
                className="text-forest hover:underline font-medium"
              >
                {detail.examNumber}
              </a>
            }
          />
          <InfoItem label="이름" value={detail.student.name} />
          <InfoItem label="연락처" value={detail.student.mobile ?? "-"} />
          <InfoItem label="수험 유형" value={EXAM_TYPE_LABEL[detail.student.examType] ?? detail.student.examType} />
          <InfoItem
            label="합격 구분"
            value={
              <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${PASS_TYPE_COLOR[detail.passType]}`}>
                {PASS_TYPE_LABEL[detail.passType]}
              </span>
            }
          />
          <InfoItem
            label="합격일"
            value={
              detail.finalPassDate
                ? fmtDate(detail.finalPassDate)
                : detail.writtenPassDate
                ? fmtDate(detail.writtenPassDate)
                : "-"
            }
          />
          {detail.writtenPassDate && <InfoItem label="필기합격일" value={fmtDate(detail.writtenPassDate)} />}
          {detail.finalPassDate && <InfoItem label="최종합격일" value={fmtDate(detail.finalPassDate)} />}
          {detail.appointedDate && <InfoItem label="임용일" value={fmtDate(detail.appointedDate)} />}
          <InfoItem label="수강 기간" value={detail.enrolledMonths != null ? `${detail.enrolledMonths}개월` : "-"} />
          <InfoItem label="담당 직원" value={detail.staff.name} />
          <InfoItem label="시험명" value={detail.examName} />
          <InfoItem label="등록일" value={fmtDate(detail.createdAt)} />
        </div>

        {detail.testimony && (
          <div className="mt-4 border-t border-ink/10 pt-4">
            <p className="text-xs font-medium text-slate mb-1">합격 수기</p>
            <p className="text-sm leading-relaxed text-ink whitespace-pre-wrap">{detail.testimony}</p>
            {detail.isPublic && (
              <span className="mt-1 inline-block rounded-full bg-forest/10 px-2 py-0.5 text-xs text-forest">포털 공개</span>
            )}
          </div>
        )}
        {detail.note && (
          <div className="mt-3 border-t border-ink/10 pt-3">
            <p className="text-xs font-medium text-slate mb-1">내부 메모</p>
            <p className="text-sm text-slate">{detail.note}</p>
          </div>
        )}
      </div>

      {/* 관련 학생 정보 카드 */}
      <div className="rounded-[28px] border border-ink/10 bg-white p-6">
        <h2 className="text-base font-semibold mb-4">관련 학생 정보</h2>
        <div className="flex flex-wrap items-center gap-6">
          <div>
            <p className="text-xs font-medium text-slate mb-0.5">학번</p>
            <a
              href={`/admin/students/${detail.examNumber}`}
              className="text-sm font-medium text-forest hover:underline"
            >
              {detail.examNumber}
            </a>
          </div>
          <div>
            <p className="text-xs font-medium text-slate mb-0.5">이름</p>
            <p className="text-sm font-medium text-ink">{detail.student.name}</p>
          </div>
          <div>
            <p className="text-xs font-medium text-slate mb-0.5">연락처</p>
            <p className="text-sm font-medium text-ink">{detail.student.mobile ?? "-"}</p>
          </div>
          <div>
            <p className="text-xs font-medium text-slate mb-0.5">수강 등록 이력</p>
            <p className="text-sm font-medium text-ink">{detail.student.courseEnrollmentCount}건</p>
          </div>
          <a
            href={`/admin/students/${detail.examNumber}`}
            className="ml-auto rounded-[20px] border border-forest/30 bg-forest/5 px-4 py-2 text-sm font-medium text-forest transition-colors hover:bg-forest/10"
          >
            학생 프로필 보기 →
          </a>
        </div>
      </div>

      {/* 성적 스냅샷 섹션 */}
      <div className="rounded-[28px] border border-ink/10 bg-white p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold">성적 스냅샷</h2>
          <p className="text-xs text-slate">합격 시점의 성적 요약 데이터</p>
        </div>

        {error && (
          <div className="mb-4 rounded-[12px] bg-red-50 px-4 py-2.5 text-sm text-red-600">{error}</div>
        )}

        {/* 스냅샷 탭 + 생성 버튼 */}
        <div className="flex flex-wrap gap-2 mb-6">
          {SNAPSHOT_TYPES.map((type) => {
            const has = existingTypes.has(type);
            return has ? (
              <button
                key={type}
                onClick={() => setActiveTab(type)}
                className={`rounded-full border px-4 py-1.5 text-xs font-medium transition-colors ${
                  activeTab === type
                    ? "bg-ink text-white border-ink"
                    : "border-ink/20 text-slate hover:border-ink/40"
                }`}
              >
                {PASS_TYPE_LABEL[type]}
              </button>
            ) : (
              <button
                key={type}
                onClick={() => handleCreateSnapshot(type)}
                disabled={isPending}
                className="rounded-full border border-dashed border-ink/30 px-4 py-1.5 text-xs font-medium text-slate hover:border-forest hover:text-forest transition-colors disabled:opacity-50"
              >
                {creatingType === type ? "생성 중..." : `+ ${PASS_TYPE_LABEL[type]} 스냅샷 생성`}
              </button>
            );
          })}
        </div>

        {activeSnapshot == null ? (
          <div className="rounded-[20px] bg-mist/60 py-10 text-center text-sm text-slate">
            스냅샷이 없습니다. 위 버튼으로 성적 스냅샷을 생성하세요.
          </div>
        ) : (
          <div className="space-y-6">
            {/* 요약 KPI */}
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <KpiCard
                label="전체 평균"
                value={activeSnapshot.overallAverage != null ? `${activeSnapshot.overallAverage}점` : "-"}
                sub="수강 기간 전체"
              />
              <KpiCard
                label="마지막 월 평균"
                value={activeSnapshot.finalMonthAverage != null ? `${activeSnapshot.finalMonthAverage}점` : "-"}
                sub="합격 직전 월"
              />
              <KpiCard
                label="처음 3개월 평균"
                value={activeSnapshot.first3MonthsAvg != null ? `${activeSnapshot.first3MonthsAvg}점` : "-"}
                sub="수강 초기"
              />
              <KpiCard
                label="마지막 3개월 평균"
                value={activeSnapshot.last3MonthsAvg != null ? `${activeSnapshot.last3MonthsAvg}점` : "-"}
                sub="합격 직전 3개월"
              />
            </div>

            {/* 월별 추이 차트 */}
            {monthlyData.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold mb-3">월별 점수 추이</h3>
                <div className="h-56 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={monthlyData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                      <XAxis
                        dataKey="month"
                        tick={{ fontSize: 11, fill: "#4B5563" }}
                        tickFormatter={(v) => v.slice(2)}
                      />
                      <YAxis domain={[40, 100]} tick={{ fontSize: 11, fill: "#4B5563" }} />
                      <Tooltip
                        formatter={(value) => [`${value}점`, "평균"]}
                        labelStyle={{ color: "#111827", fontSize: 12 }}
                        contentStyle={{ borderRadius: 12, border: "1px solid #e5e7eb" }}
                      />
                      <ReferenceLine y={80} stroke="#1F4D3A" strokeDasharray="4 4" label={{ value: "80점", fontSize: 11, fill: "#1F4D3A" }} />
                      <Line
                        type="monotone"
                        dataKey="avg"
                        stroke="#C55A11"
                        strokeWidth={2}
                        dot={{ r: 4, fill: "#C55A11" }}
                        activeDot={{ r: 6 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}

            {/* 과목별 평균 */}
            {subjectEntries.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold mb-3">과목별 평균 (합격 시점)</h3>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                  {subjectEntries.map(([sub, avg]) => (
                    <div key={sub} className="rounded-[16px] border border-ink/10 bg-mist/50 px-4 py-3">
                      <p className="text-xs text-slate mb-0.5">{SUBJECT_LABEL[sub] ?? sub}</p>
                      <p className="text-lg font-bold">
                        {avg}
                        <span className="text-xs font-normal text-slate ml-0.5">점</span>
                      </p>
                      <div className="mt-1.5 h-1.5 rounded-full bg-ink/10 overflow-hidden">
                        <div
                          className="h-full rounded-full bg-ember"
                          style={{ width: `${Math.min(avg, 100)}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 스냅샷 메타 + 삭제 */}
            <div className="flex items-center justify-between pt-2 border-t border-ink/10">
              <p className="text-xs text-slate">
                생성일: {fmtDate(activeSnapshot.createdAt)} · 수강 기간: {activeSnapshot.totalEnrolledMonths}개월
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => handleCreateSnapshot(activeSnapshot.snapshotType)}
                  disabled={isPending}
                  className="text-xs text-slate hover:text-forest transition-colors disabled:opacity-50"
                >
                  재생성
                </button>
                <button
                  onClick={() => handleDeleteSnapshot(activeSnapshot.snapshotType)}
                  disabled={isPending}
                  className="text-xs text-red-400 hover:text-red-600 transition-colors disabled:opacity-50"
                >
                  삭제
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function InfoItem({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div>
      <p className="text-xs font-medium text-slate mb-0.5">{label}</p>
      <p className="text-sm font-medium text-ink">{value}</p>
    </div>
  );
}

function KpiCard({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="rounded-[20px] border border-ink/10 bg-mist/50 px-4 py-4">
      <p className="text-xs font-medium text-slate">{label}</p>
      <p className="mt-1 text-2xl font-bold text-ink">{value}</p>
      <p className="mt-0.5 text-xs text-slate/70">{sub}</p>
    </div>
  );
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("ko-KR", { year: "numeric", month: "2-digit", day: "2-digit" });
}
