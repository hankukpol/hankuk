import Link from "next/link";

type ExamFeatureDisabledNoticeProps = {
  title: string;
  message: string;
};

export default function ExamFeatureDisabledNotice({
  title,
  message,
}: ExamFeatureDisabledNoticeProps) {
  return (
    <section className="rounded-xl border border-amber-200 bg-amber-50 p-8">
      <p className="text-lg font-semibold text-amber-900">{title}</p>
      <p className="mt-2 text-sm leading-6 text-amber-800">
        {message}
      </p>
      <p className="mt-2 text-xs text-amber-700">
        관리자 설정에 따라 현재 이 페이지는 비활성화되어 있습니다.
      </p>
      <Link
        href="/"
        className="mt-5 inline-flex rounded-lg bg-amber-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-amber-800"
      >
        메인으로 돌아가기
      </Link>
    </section>
  );
}
