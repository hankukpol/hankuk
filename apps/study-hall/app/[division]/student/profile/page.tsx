import { notFound } from "next/navigation";
import { IdCard, MapPin, ShieldCheck } from "lucide-react";

import { StudentPortalFrame } from "@/components/student-view/StudentPortalFrame";
import { PortalSectionHeader } from "@/components/student-view/StudentPortalUi";
import { requireDivisionStudentAccess } from "@/lib/auth";
import { isNotFoundError } from "@/lib/errors";
import {
  getStudentStatusLabel,
  getStudentStatusToneClass,
  getWarningStageLabel,
  getWarningStageToneClass,
  toDemeritPoints,
} from "@/lib/student-meta";
import { getDivisionFeatureSettings, getDivisionTheme } from "@/lib/services/settings.service";
import { getStudentDetail } from "@/lib/services/student.service";

type StudentProfilePageProps = {
  params: {
    division: string;
  };
};

/** 저장된 값은 "YYYY-MM-DD" 이거나 ISO 문자열이다. 앞 10자만 쓰면 시간대에 흔들리지 않는다. */
function formatDate(value: string | null) {
  if (!value) return null;
  const [year, month, day] = value.slice(0, 10).split("-");
  return year && month && day ? `${year}. ${Number(month)}. ${Number(day)}.` : null;
}

function formatPeriod(start: string | null, end: string | null) {
  const from = formatDate(start);
  const to = formatDate(end);
  if (from && to) return `${from} ~ ${to}`;
  if (from) return `${from} ~`;
  if (to) return `~ ${to}`;
  return "미등록";
}

/**
 * 내 정보.
 *
 * 신원 요약은 원래 모든 학생 화면 위쪽에 붙어 있었다. 학생이 자기 수험번호와 좌석을
 * 매번 다시 읽을 일은 없는데 여섯 칸이 화면 첫 자리를 차지해, 정작 보러 온 출결과
 * 성적을 아래로 밀어냈다. 그렇다고 아예 없애면 "지금 보고 있는 게 내 기록이 맞나"를
 * 확인할 데가 사라진다. 그래서 화면마다 붙는 대신 이 한 페이지로 옮겼다.
 */
export default async function StudentProfilePage({ params }: StudentProfilePageProps) {
  const session = await requireDivisionStudentAccess(params.division);

  try {
    const [division, student, settings] = await Promise.all([
      getDivisionTheme(params.division),
      getStudentDetail(params.division, session.studentId),
      getDivisionFeatureSettings(params.division),
    ]);

    const demeritPoints = student.demeritPoints ?? toDemeritPoints(student.netPoints);

    return (
      <StudentPortalFrame
        division={{ slug: params.division, ...division }}
        student={student}
        current="profile"
        attendanceEnabled={settings.featureFlags.attendanceManagement}
        pointsEnabled={settings.featureFlags.pointManagement}
        examsEnabled={settings.featureFlags.examManagement}
        title="내 정보"
        description="지금 보고 있는 기록이 본인의 것인지 이 화면에서 확인할 수 있습니다."
      >
        <section>
          <PortalSectionHeader
            title="본인 확인"
            description="다른 사람의 기록이 보인다면 로그아웃 후 다시 로그인해 주세요."
            icon={<IdCard className="h-5 w-5" />}
          />

          {/* DESIGN.md 8절 — 학생 포털 요약은 테두리 상자가 아니라 1px 선으로만 나눈 평면 격자다. */}
          <dl className="admin-portal-summary mt-4">
            <div>
              <dt>이름</dt>
              <dd>{student.name}</dd>
            </div>
            <div>
              <dt>수험번호</dt>
              <dd>{student.studentNumber}</dd>
            </div>
            <div>
              <dt>연락처</dt>
              <dd>{student.phone || "미등록"}</dd>
            </div>
            <div>
              <dt>직렬</dt>
              <dd>{student.studyTrack || "미지정"}</dd>
            </div>
          </dl>
        </section>

        <section>
          <PortalSectionHeader
            title="자습 배정"
            icon={<MapPin className="h-5 w-5" />}
          />

          <dl className="admin-portal-summary mt-4">
            <div>
              <dt>소속</dt>
              <dd>{division.fullName}</dd>
            </div>
            <div>
              <dt>자습실</dt>
              <dd>{student.studyRoomName || "미배정"}</dd>
            </div>
            <div>
              <dt>좌석</dt>
              <dd>{student.seatDisplay || student.seatLabel || "미배정"}</dd>
            </div>
            <div>
              <dt>수강 기간</dt>
              <dd>{formatPeriod(student.courseStartDate, student.courseEndDate)}</dd>
            </div>
          </dl>
        </section>

        <section>
          <PortalSectionHeader
            title="현재 상태"
            description="상벌점과 경고 단계의 자세한 내역은 상벌점 화면에 있습니다."
            icon={<ShieldCheck className="h-5 w-5" />}
          />

          <dl className="admin-portal-summary mt-4">
            <div>
              <dt>상태</dt>
              <dd className={getStudentStatusToneClass(student.status)}>
                {getStudentStatusLabel(student.status)}
              </dd>
            </div>
            <div>
              <dt>경고 단계</dt>
              <dd className={getWarningStageToneClass(student.warningStage)}>
                {student.warningStageLabel ?? getWarningStageLabel(student.warningStage)}
              </dd>
            </div>
            <div>
              <dt>벌점</dt>
              <dd>{demeritPoints}점</dd>
            </div>
            {/* 상점을 따로 집계하지 않는 지점에서는 누적 점수가 벌점을 음수로 뒤집은
                같은 값이다. 같은 수를 두 번 적는 대신 등록일을 둔다 — 칸을 비우면
                격자에 회색 구멍이 남는다. */}
            {student.meritPoints !== undefined ? (
              <div>
                <dt>상점</dt>
                <dd>{student.meritPoints}점</dd>
              </div>
            ) : (
              <div>
                <dt>등록일</dt>
                <dd>{formatDate(student.enrolledAt) ?? "-"}</dd>
              </div>
            )}
          </dl>
        </section>
      </StudentPortalFrame>
    );
  } catch (error) {
    if (isNotFoundError(error)) {
      notFound();
    }

    throw error;
  }
}
