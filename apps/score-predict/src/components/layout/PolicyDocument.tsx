/**
 * 이용약관·개인정보처리방침 공통 표시 컴포넌트.
 * 본문은 관리자 사이트 설정(site.termsOfService / site.privacyPolicy)에서 관리한다.
 */
export default function PolicyDocument({
  title,
  content,
}: {
  title: string;
  content: string;
}) {
  const body = content.trim();

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-10">
      <h1 className="text-xl font-bold text-slate-900 sm:text-2xl">{title}</h1>
      <section className="mt-6 rounded-xl border border-slate-200 bg-white p-5 sm:p-6">
        {body ? (
          <p className="whitespace-pre-line text-sm leading-7 text-slate-700">{body}</p>
        ) : (
          <p className="text-sm text-slate-500">
            아직 등록된 내용이 없습니다. 관리자 사이트 설정에서 본문을 등록해 주세요.
          </p>
        )}
      </section>
    </main>
  );
}
