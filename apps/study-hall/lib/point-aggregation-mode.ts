import { isPolicyEffective, kstDate, type ManagementPolicy } from "@/lib/management-policy";

export type PointAggregationMode = "MONTHLY" | "COURSE";

export type PointAggregationInfo = {
  mode: PointAggregationMode;
  /** 화면 상단 한 줄에 그대로 넣는 짧은 문구. */
  label: string;
  /** 왜 그렇게 집계되는지에 대한 보조 설명. */
  description: string;
};

function formatMonthLabel(today: string) {
  const [year, month] = today.split("-");
  return `${year}년 ${Number(month)}월`;
}

/**
 * 경고 단계를 계산할 때 벌점을 어느 구간으로 모으는지 알려준다.
 *
 * 관리규정(managementPolicy)이 적용되고 monthlyPoints 가 켜져 있으면 월간 집계로,
 * 그렇지 않으면 학생별 과정 시작일부터의 누적으로 계산된다
 * (`listWarningStudents` 와 같은 조건을 쓴다). 관리규정이 켜지는 순간
 * 학생들의 경고 단계가 일제히 바뀌므로, 지금 어느 모드인지 화면에 항상 보여준다.
 */
export function getPointAggregationInfo(
  policy: ManagementPolicy | null | undefined,
  today: string = kstDate(),
): PointAggregationInfo {
  if (isPolicyEffective(policy ?? null, today) && policy?.monthlyPoints) {
    return {
      mode: "MONTHLY",
      label: `이번 달 (${formatMonthLabel(today)})`,
      description: "관리규정에 따라 매달 1일에 벌점이 초기화됩니다.",
    };
  }

  return {
    mode: "COURSE",
    // 과정 시작일은 학생마다 다르므로 단일 날짜를 쓸 수 없다.
    label: "학생별 과정 시작일부터 누적",
    description: "과정 시작일이 없는 학생은 등록일부터 누적합니다.",
  };
}
