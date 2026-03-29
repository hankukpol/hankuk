"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts";

export type ExamTypeEntry = { examType: string; count: number };
export type StatusEntry = { status: string; count: number };
export type MonthlyEntry = { month: string; count: number };
export type GenerationEntry = { generation: string; count: number };

export type StatsChartsData = {
  examTypeDistribution: ExamTypeEntry[];
  statusDistribution: StatusEntry[];
  monthlyNewStudents: MonthlyEntry[];
  gradeDistribution: GenerationEntry[];
};

const PIE_COLORS = [
  "#1F4D3A",
  "#C55A11",
  "#3B82F6",
  "#8B5CF6",
  "#F59E0B",
  "#EC4899",
];

const EXAM_TYPE_LABEL: Record<string, string> = {
  GONGCHAE: "공채",
  GYEONGCHAE: "경채",
};

const STATUS_LABEL: Record<string, string> = {
  PENDING: "신청",
  ACTIVE: "수강 중",
  WAITING: "대기",
  SUSPENDED: "휴원",
  COMPLETED: "수강 완료",
  WITHDRAWN: "퇴원",
  CANCELLED: "취소",
};

const STATUS_COLORS: Record<string, string> = {
  PENDING: "#F59E0B",
  ACTIVE: "#1F4D3A",
  WAITING: "#3B82F6",
  SUSPENDED: "#8B5CF6",
  COMPLETED: "#4B5563",
  WITHDRAWN: "#DC2626",
  CANCELLED: "#9CA3AF",
};

function formatMonthLabel(month: string) {
  const [y, m] = month.split("-");
  return `${y.slice(2)}년 ${Number(m)}월`;
}

export function StatsCharts({ data }: { data: StatsChartsData }) {
  const { examTypeDistribution, statusDistribution, monthlyNewStudents, gradeDistribution } = data;

  const examTypePieData = examTypeDistribution
    .filter((d) => d.count > 0)
    .map((d, i) => ({
      name: EXAM_TYPE_LABEL[d.examType] ?? d.examType,
      value: d.count,
      color: PIE_COLORS[i % PIE_COLORS.length],
    }));

  const statusPieData = statusDistribution
    .filter((d) => d.count > 0)
    .map((d) => ({
      name: STATUS_LABEL[d.status] ?? d.status,
      value: d.count,
      color: STATUS_COLORS[d.status] ?? "#9CA3AF",
    }));

  const monthlyFormatted = monthlyNewStudents.map((d) => ({
    label: formatMonthLabel(d.month),
    count: d.count,
  }));

  return (
    <div className="space-y-10">
      {/* Row 1: examType Pie + statusDistribution Pie */}
      <div className="grid gap-6 xl:grid-cols-2">
        {/* 시험 유형 분포 */}
        <article className="rounded-[28px] border border-ink/10 bg-white p-5 sm:p-6">
          <h2 className="text-xl font-semibold">시험 유형 분포</h2>
          <p className="mt-1 text-sm text-slate">전체 학생의 응시 유형별 비율</p>
          {examTypePieData.length > 0 ? (
            <>
              <div className="mt-4" style={{ height: 300 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={examTypePieData}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={110}
                      paddingAngle={3}
                    >
                      {examTypePieData.map((entry, index) => (
                        <Cell key={`cell-exam-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value) => [`${value}명`]} />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="mt-2 flex flex-wrap justify-center gap-x-4 gap-y-1">
                {examTypePieData.map((entry) => (
                  <div key={entry.name} className="flex items-center gap-1.5 text-xs text-slate">
                    <span
                      className="inline-block h-2.5 w-2.5 rounded-full"
                      style={{ backgroundColor: entry.color }}
                    />
                    <span className="font-medium text-ink">{entry.name}</span>
                    <span>{entry.value}명</span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="mt-8 text-center text-sm text-slate">데이터 없음</div>
          )}
        </article>

        {/* 수강 상태 분포 */}
        <article className="rounded-[28px] border border-ink/10 bg-white p-5 sm:p-6">
          <h2 className="text-xl font-semibold">수강 상태 분포</h2>
          <p className="mt-1 text-sm text-slate">학생별 최근 수강 상태 현황</p>
          {statusPieData.length > 0 ? (
            <>
              <div className="mt-4" style={{ height: 300 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={statusPieData}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={110}
                      paddingAngle={3}
                    >
                      {statusPieData.map((entry, index) => (
                        <Cell key={`cell-status-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value) => [`${value}명`]} />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="mt-2 flex flex-wrap justify-center gap-x-4 gap-y-1">
                {statusPieData.map((entry) => (
                  <div key={entry.name} className="flex items-center gap-1.5 text-xs text-slate">
                    <span
                      className="inline-block h-2.5 w-2.5 rounded-full"
                      style={{ backgroundColor: entry.color }}
                    />
                    <span className="font-medium text-ink">{entry.name}</span>
                    <span>{entry.value}명</span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="mt-8 text-center text-sm text-slate">수강 데이터 없음</div>
          )}
        </article>
      </div>

      {/* Row 2: monthly new students BarChart */}
      <article className="rounded-[28px] border border-ink/10 bg-white p-5 sm:p-6">
        <h2 className="text-xl font-semibold">월별 신규 수강생</h2>
        <p className="mt-1 text-sm text-slate">최근 12개월 등록 학생 수</p>
        <div className="mt-6" style={{ height: 300 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={monthlyFormatted}
              margin={{ top: 5, right: 20, left: 0, bottom: 5 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 11, fill: "#4B5563" }}
                interval={0}
                angle={-30}
                textAnchor="end"
                height={50}
              />
              <YAxis tick={{ fontSize: 12, fill: "#4B5563" }} allowDecimals={false} />
              <Tooltip formatter={(value) => [`${value}명`, "신규 학생"]} />
              <Bar dataKey="count" name="신규 학생" fill="#1F4D3A" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </article>

      {/* Row 3: generation distribution BarChart */}
      {gradeDistribution.length > 0 && (
        <article className="rounded-[28px] border border-ink/10 bg-white p-5 sm:p-6">
          <h2 className="text-xl font-semibold">기수별 학생 분포</h2>
          <p className="mt-1 text-sm text-slate">등록 기수별 학생 수</p>
          <div className="mt-6" style={{ height: 300 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={gradeDistribution.map((d) => ({ label: `${d.generation}기`, count: d.count }))}
                margin={{ top: 5, right: 20, left: 0, bottom: 5 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                <XAxis dataKey="label" tick={{ fontSize: 12, fill: "#4B5563" }} />
                <YAxis tick={{ fontSize: 12, fill: "#4B5563" }} allowDecimals={false} />
                <Tooltip formatter={(value) => [`${value}명`, "학생 수"]} />
                <Bar dataKey="count" name="학생 수" fill="#C55A11" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </article>
      )}
    </div>
  );
}
