import { redirect } from "next/navigation";

/** 진도·학습 분석 설정은 설정 > 성적 분석 기준으로 옮겼다. 예전 주소는 그리로 보낸다. */
export default function LearningPage({ params }: { params: { division: string } }) {
  redirect(`/${params.division}/admin/settings/exam-analysis`);
}
