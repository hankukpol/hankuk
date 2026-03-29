type AdminPlaceholderPageProps = {
  params: {
    division: string;
    slug: string[];
  };
};

export default function AdminPlaceholderPage({ params }: AdminPlaceholderPageProps) {
  const currentPath = params.slug.join(" / ");

  return (
    <div className="rounded-[10px] border border-slate-200-dashed border-slate-300 bg-white/80 p-8 shadow-[0_18px_50px_rgba(18,32,56,0.05)]">
      <p className="text-sm font-semibold uppercase tracking-[0.24em] text-slate-500">
        Placeholder
      </p>
      <h1 className="mt-4 text-2xl font-bold text-slate-950">{currentPath}</h1>
      <p className="mt-4 max-w-2xl text-sm leading-7 text-slate-600">
        이 경로는 문서상 라우트 구조를 먼저 고정하기 위해 준비중 화면으로 열어둔 상태입니다.
        다음 Phase에서 기능을 순차 구현합니다.
      </p>
    </div>
  );
}
