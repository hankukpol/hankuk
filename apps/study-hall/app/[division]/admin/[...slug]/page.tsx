type AdminPlaceholderPageProps = {
  params: {
    division: string;
    slug: string[];
  };
};

export default function AdminPlaceholderPage({ params }: AdminPlaceholderPageProps) {
  const currentPath = params.slug.join(" / ");

  return (
    <div className="admin-flat-page">
      <h1 className="admin-page-title">{currentPath}</h1>
      <p className="admin-empty-state">
        이 경로는 문서상 라우트 구조를 먼저 고정하기 위해 준비중 화면으로 열어둔 상태입니다.
        다음 Phase에서 기능을 순차 구현합니다.
      </p>
    </div>
  );
}
