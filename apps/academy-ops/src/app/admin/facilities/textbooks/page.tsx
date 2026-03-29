import { AdminRole } from "@prisma/client";
import { requireAdminContext } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { TextbookSalesManager } from "./textbook-sales-manager";

export const dynamic = "force-dynamic";

export type TextbookRow = {
  id: number;
  title: string;
  author: string | null;
  publisher: string | null;
  price: number;
  stock: number;
  subject: string | null;
  isActive: boolean;
};

export type SaleRow = {
  id: number;
  textbookId: number;
  textbookTitle: string;
  examNumber: string | null;
  staffName: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  note: string | null;
  soldAt: string;
};

export default async function TextbookFacilitiesPage() {
  await requireAdminContext(AdminRole.ACADEMIC_ADMIN);

  const today = new Date();
  const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 0, 0, 0, 0);
  const endOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59, 999);

  const [rawTextbooks, rawTodaySales] = await getPrisma().$transaction([
    getPrisma().textbook.findMany({
      where: { isActive: true },
      orderBy: [{ subject: "asc" }, { title: "asc" }],
    }),
    getPrisma().textbookSale.findMany({
      where: { soldAt: { gte: startOfDay, lte: endOfDay } },
      include: {
        textbook: { select: { title: true } },
        staff: { select: { name: true } },
      },
      orderBy: { soldAt: "desc" },
    }),
  ]);

  const textbooks: TextbookRow[] = rawTextbooks.map((t) => ({
    id: t.id,
    title: t.title,
    author: t.author,
    publisher: t.publisher,
    price: t.price,
    stock: t.stock,
    subject: t.subject,
    isActive: t.isActive,
  }));

  const todaySales: SaleRow[] = rawTodaySales.map((s) => ({
    id: s.id,
    textbookId: s.textbookId,
    textbookTitle: s.textbook.title,
    examNumber: s.examNumber,
    staffName: s.staff.name,
    quantity: s.quantity,
    unitPrice: s.unitPrice,
    totalPrice: s.totalPrice,
    note: s.note,
    soldAt: s.soldAt.toISOString(),
  }));

  return (
    <div className="p-8 sm:p-10">
      <div className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-forest">
        시설 관리
      </div>
      <h1 className="mt-4 text-3xl font-semibold">교재 판매</h1>
      <p className="mt-2 text-sm text-slate">
        교재 현장 판매를 등록하고 판매 이력을 기간별로 조회합니다.
      </p>
      <div className="mt-8">
        <TextbookSalesManager textbooks={textbooks} initialTodaySales={todaySales} />
      </div>
    </div>
  );
}
