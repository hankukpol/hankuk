export default function AdminLoading() {
  return (
    <div className="admin-flat-page" role="status" aria-live="polite" aria-busy="true">
      <div className="admin-skeleton h-8 w-48" aria-hidden="true" />
      <div className="admin-skeleton h-12 w-full" aria-hidden="true" />
      <p className="admin-help">로딩 중...</p>
    </div>
  );
}
