import Link from "next/link";
import { Home } from "lucide-react";

export default function NotFound() {
  return (
    <main className="admin-main admin-content-frame admin-flat-page">
      <section>
        <h1 className="admin-page-title">페이지를 찾을 수 없습니다</h1>
        <p className="admin-page-description">주소가 변경되었거나 현재 사용할 수 없는 페이지입니다.</p>
      </section>
      <div>
        <Link href="/" className="admin-button">
          <Home className="h-5 w-5" />홈으로
        </Link>
      </div>
    </main>
  );
}
