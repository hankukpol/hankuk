import { AdminRole } from "@prisma/client";
import { notFound } from "next/navigation";
import Link from "next/link";
import { requireAdminContext } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { TextbookEditForm } from "./textbook-edit-form";

export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ id: string }> };

export default async function TextbookEditPage({ params }: PageProps) {
  await requireAdminContext(AdminRole.TEACHER);

  const { id } = await params;
  const textbookId = Number(id);
  if (!Number.isInteger(textbookId) || textbookId <= 0) notFound();

  const textbook = await getPrisma().textbook.findUnique({
    where: { id: textbookId },
  });
  if (!textbook) notFound();

  return (
    <div className="p-8 sm:p-10">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 text-sm text-slate">
        <Link href="/admin/textbooks" className="transition hover:text-ink">
          교재 관리
        </Link>
        <span>/</span>
        <Link
          href={`/admin/textbooks/${textbookId}`}
          className="transition hover:text-ink"
        >
          {textbook.title}
        </Link>
        <span>/</span>
        <span className="text-ink">수정</span>
      </nav>

      {/* Header */}
      <div className="mt-6 flex items-start justify-between gap-4">
        <div>
          <div className="inline-flex rounded-full border border-ember/20 bg-ember/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-ember">
            교재 수정
          </div>
          <h1 className="mt-4 text-3xl font-semibold text-ink">{textbook.title} 수정</h1>
          <p className="mt-2 text-sm text-slate">
            교재 정보를 수정합니다. 교재명과 가격은 필수 항목입니다.
          </p>
        </div>
        <Link
          href={`/admin/textbooks/${textbookId}`}
          className="shrink-0 inline-flex items-center gap-1.5 rounded-full border border-ink/10 px-4 py-2 text-sm font-medium text-slate transition hover:border-ink/30 hover:text-ink"
        >
          ← 상세로
        </Link>
      </div>

      {/* Form */}
      <div className="mt-2 max-w-2xl rounded-[28px] border border-ink/10 bg-white p-6 shadow-panel sm:p-8">
        <TextbookEditForm
          textbook={{
            id: textbook.id,
            title: textbook.title,
            author: textbook.author,
            publisher: textbook.publisher,
            price: textbook.price,
            stock: textbook.stock,
            subject: textbook.subject,
            isActive: textbook.isActive,
          }}
        />
      </div>
    </div>
  );
}
