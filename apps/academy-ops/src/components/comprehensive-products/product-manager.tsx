"use client";

import Link from "next/link";
import { ExamCategory } from "@prisma/client";
import { useState, useTransition } from "react";
import { ActionModal } from "@/components/ui/action-modal";
import { useActionModalState } from "@/components/ui/use-action-modal-state";
import { EXAM_CATEGORY_LABEL } from "@/lib/constants";

type ProductRecord = {
  id: string;
  name: string;
  examCategory: ExamCategory;
  durationMonths: number;
  regularPrice: number;
  salePrice: number;
  features: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

type ProductManagerProps = {
  initialProducts: ProductRecord[];
};

type FormState = {
  name: string;
  examCategory: ExamCategory;
  durationMonths: string;
  regularPrice: string;
  salePrice: string;
  features: string;
  isActive: boolean;
};

const DEFAULT_FORM: FormState = {
  name: "",
  examCategory: ExamCategory.GONGCHAE,
  durationMonths: "",
  regularPrice: "",
  salePrice: "",
  features: "",
  isActive: true,
};

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    cache: "no-store",
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error ?? "요청에 실패했습니다.");
  return payload as T;
}

function calcDiscountRate(regular: number, sale: number): string {
  if (regular <= 0 || sale >= regular) return "-";
  const rate = Math.round(((regular - sale) / regular) * 100);
  return `${rate}%`;
}

const EXAM_CATEGORY_FILTERS: Array<{ value: ExamCategory | "ALL"; label: string }> = [
  { value: "ALL", label: "전체" },
  { value: ExamCategory.GONGCHAE, label: EXAM_CATEGORY_LABEL[ExamCategory.GONGCHAE] },
  { value: ExamCategory.GYEONGCHAE, label: EXAM_CATEGORY_LABEL[ExamCategory.GYEONGCHAE] },
  { value: ExamCategory.SOGANG, label: EXAM_CATEGORY_LABEL[ExamCategory.SOGANG] },
  { value: ExamCategory.CUSTOM, label: EXAM_CATEGORY_LABEL[ExamCategory.CUSTOM] },
];

export function ProductManager({ initialProducts }: ProductManagerProps) {
  const [products, setProducts] = useState<ProductRecord[]>(initialProducts);
  const [filterCategory, setFilterCategory] = useState<ExamCategory | "ALL">("ALL");
  const [form, setForm] = useState<FormState>(DEFAULT_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const confirmModal = useActionModalState();

  const filteredProducts = products.filter((product) => {
    if (filterCategory !== "ALL" && product.examCategory !== filterCategory) return false;
    return true;
  });

  function setField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function openCreate() {
    setEditingId(null);
    setForm(DEFAULT_FORM);
    setErrorMessage(null);
    setSuccessMessage(null);
    setIsFormOpen(true);
  }

  function openEdit(product: ProductRecord) {
    setEditingId(product.id);
    setForm({
      name: product.name,
      examCategory: product.examCategory,
      durationMonths: String(product.durationMonths),
      regularPrice: String(product.regularPrice),
      salePrice: String(product.salePrice),
      features: product.features ?? "",
      isActive: product.isActive,
    });
    setErrorMessage(null);
    setSuccessMessage(null);
    setIsFormOpen(true);
  }

  function closeForm() {
    setIsFormOpen(false);
    setEditingId(null);
    setForm(DEFAULT_FORM);
    setErrorMessage(null);
  }

  function handleSave() {
    setErrorMessage(null);
    setSuccessMessage(null);

    startTransition(async () => {
      try {
        const body = {
          name: form.name,
          examCategory: form.examCategory,
          durationMonths: form.durationMonths ? Number(form.durationMonths) : undefined,
          regularPrice: form.regularPrice !== "" ? Number(form.regularPrice) : undefined,
          salePrice: form.salePrice !== "" ? Number(form.salePrice) : undefined,
          features: form.features || null,
          isActive: form.isActive,
        };

        if (editingId !== null) {
          const result = await requestJson<{ product: ProductRecord }>(
            `/api/settings/comprehensive-products/${editingId}`,
            { method: "PATCH", body: JSON.stringify(body) },
          );
          setProducts((prev) =>
            prev.map((p) => (p.id === editingId ? result.product : p)),
          );
          setSuccessMessage("상품을 수정했습니다.");
        } else {
          const result = await requestJson<{ product: ProductRecord }>(
            "/api/settings/comprehensive-products",
            { method: "POST", body: JSON.stringify(body) },
          );
          setProducts((prev) => [result.product, ...prev]);
          setSuccessMessage("상품을 추가했습니다.");
        }

        closeForm();
      } catch (error) {
        setErrorMessage(
          error instanceof Error ? error.message : "저장에 실패했습니다.",
        );
      }
    });
  }

  function handleDelete(product: ProductRecord) {
    confirmModal.openModal({
      badgeLabel: "삭제 확인",
      badgeTone: "warning",
      title: `상품 삭제: ${product.name}`,
      description: "이 상품을 삭제하시겠습니까? 삭제한 상품은 다시 복구할 수 없습니다.",
      details: [
        `상품명: ${product.name}`,
        `수험유형: ${EXAM_CATEGORY_LABEL[product.examCategory]}`,
        `수강기간: ${product.durationMonths}개월`,
        `판매가: ${product.salePrice.toLocaleString()}원`,
      ],
      cancelLabel: "취소",
      confirmLabel: "삭제",
      confirmTone: "danger",
      onConfirm: () => {
        confirmModal.closeModal();
        setSuccessMessage(null);
        setErrorMessage(null);

        startTransition(async () => {
          try {
            await requestJson<{ success: true }>(
              `/api/settings/comprehensive-products/${product.id}`,
              { method: "DELETE" },
            );
            setProducts((prev) => prev.filter((p) => p.id !== product.id));
            setSuccessMessage("상품을 삭제했습니다.");
          } catch (error) {
            setErrorMessage(
              error instanceof Error ? error.message : "삭제에 실패했습니다.",
            );
          }
        });
      },
    });
  }

  return (
    <div className="space-y-6">
      {/* Top bar */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex gap-1">
          {EXAM_CATEGORY_FILTERS.map((f) => (
            <button
              key={f.value}
              type="button"
              onClick={() => setFilterCategory(f.value)}
              className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                filterCategory === f.value
                  ? "bg-ink text-white"
                  : "border border-ink/10 bg-white text-slate hover:border-ink/30"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={openCreate}
          className="inline-flex items-center gap-2 rounded-full bg-ember px-4 py-2 text-sm font-medium text-white transition hover:bg-ember/90"
        >
          <span>+</span>
          <span>새 상품 추가</span>
        </button>
      </div>

      {/* Messages */}
      {successMessage ? (
        <div className="rounded-2xl border border-forest/20 bg-forest/10 px-4 py-3 text-sm text-forest">
          {successMessage}
        </div>
      ) : null}
      {errorMessage && !isFormOpen ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {errorMessage}
        </div>
      ) : null}

      {/* Table */}
      <div className="overflow-hidden rounded-[28px] border border-ink/10 bg-white">
        <table className="min-w-full divide-y divide-ink/10 text-sm">
          <thead>
            <tr>
              {[
                "상품명",
                "수험유형",
                "수강기간(개월)",
                "정가(원)",
                "판매가(원)",
                "할인율",
                "활성",
                "액션",
              ].map((header) => (
                <th
                  key={header}
                  className="bg-mist/50 px-4 py-3 text-left text-xs font-medium uppercase text-slate"
                >
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-ink/10">
            {filteredProducts.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-10 text-center text-sm text-slate">
                  조건에 맞는 상품이 없습니다.
                </td>
              </tr>
            ) : null}

            {filteredProducts.map((product) => (
              <tr key={product.id} className="transition hover:bg-mist/30">
                <td className="px-4 py-3 font-medium text-ink">
                  <div>{product.name}</div>
                  {product.features ? (
                    <div className="mt-0.5 line-clamp-1 text-xs text-slate">
                      {product.features}
                    </div>
                  ) : null}
                </td>
                <td className="px-4 py-3 text-slate">
                  {EXAM_CATEGORY_LABEL[product.examCategory]}
                </td>
                <td className="px-4 py-3 tabular-nums text-ink">{product.durationMonths}개월</td>
                <td className="px-4 py-3 tabular-nums text-slate line-through">
                  {product.regularPrice.toLocaleString()}원
                </td>
                <td className="px-4 py-3 tabular-nums font-medium text-ink">
                  {product.salePrice.toLocaleString()}원
                </td>
                <td className="px-4 py-3">
                  <span className="text-xs font-semibold text-ember">
                    {calcDiscountRate(product.regularPrice, product.salePrice)}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${
                      product.isActive
                        ? "bg-forest/10 text-forest"
                        : "bg-slate/10 text-slate"
                    }`}
                  >
                    {product.isActive ? "활성" : "비활성"}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex gap-2">
                    <Link
                      href={`/admin/settings/comprehensive-products/${product.id}`}
                      className="inline-flex items-center rounded-full border border-forest/20 px-3 py-1 text-xs font-semibold text-forest transition hover:border-forest/40 hover:bg-forest/5"
                    >
                      상세
                    </Link>
                    <button
                      type="button"
                      onClick={() => openEdit(product)}
                      disabled={isPending}
                      className="inline-flex items-center rounded-full border border-ink/10 px-3 py-1 text-xs font-semibold transition hover:border-ember/30 hover:text-ember disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      수정
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(product)}
                      disabled={isPending}
                      className="inline-flex items-center rounded-full border border-red-200 px-3 py-1 text-xs font-semibold text-red-700 transition hover:border-red-400 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      삭제
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Create / Edit Modal */}
      <ActionModal
        open={isFormOpen}
        badgeLabel={editingId !== null ? "상품 수정" : "상품 추가"}
        badgeTone="default"
        title={editingId !== null ? "종합반 상품 수정" : "새 종합반 상품 추가"}
        description={
          editingId !== null
            ? "상품 정보를 수정합니다."
            : "새 종합반 상품을 등록합니다. 상품명, 수험유형, 수강기간, 정가·판매가는 필수 항목입니다."
        }
        panelClassName="max-w-lg"
        cancelLabel="취소"
        confirmLabel={isPending ? "저장 중..." : editingId !== null ? "수정 저장" : "상품 추가"}
        isPending={isPending}
        onClose={closeForm}
        onConfirm={handleSave}
      >
        <div className="space-y-4">
          {errorMessage ? (
            <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {errorMessage}
            </div>
          ) : null}

          {/* 상품명 */}
          <div>
            <label className="mb-1.5 block text-sm font-medium">
              상품명 <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setField("name", e.target.value)}
              placeholder="예: 공채 12개월 기본반"
              className="w-full rounded-2xl border border-ink/10 px-4 py-3 text-sm outline-none focus:border-ink/30"
            />
          </div>

          {/* 수험유형 + 수강기간 */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1.5 block text-sm font-medium">
                수험유형 <span className="text-red-500">*</span>
              </label>
              <select
                value={form.examCategory}
                onChange={(e) => setField("examCategory", e.target.value as ExamCategory)}
                className="w-full rounded-2xl border border-ink/10 px-4 py-3 text-sm outline-none focus:border-ink/30"
              >
                {(Object.keys(EXAM_CATEGORY_LABEL) as ExamCategory[]).map((cat) => (
                  <option key={cat} value={cat}>
                    {EXAM_CATEGORY_LABEL[cat]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium">
                수강기간(개월) <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                min={1}
                value={form.durationMonths}
                onChange={(e) => setField("durationMonths", e.target.value)}
                placeholder="예: 12"
                className="w-full rounded-2xl border border-ink/10 px-4 py-3 text-sm outline-none focus:border-ink/30"
              />
            </div>
          </div>

          {/* 정가 + 판매가 */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1.5 block text-sm font-medium">
                정가 (원) <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                min={0}
                value={form.regularPrice}
                onChange={(e) => setField("regularPrice", e.target.value)}
                placeholder="예: 3600000"
                className="w-full rounded-2xl border border-ink/10 px-4 py-3 text-sm outline-none focus:border-ink/30"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium">
                판매가 (원) <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                min={0}
                value={form.salePrice}
                onChange={(e) => setField("salePrice", e.target.value)}
                placeholder="예: 3100000"
                className="w-full rounded-2xl border border-ink/10 px-4 py-3 text-sm outline-none focus:border-ink/30"
              />
            </div>
          </div>

          {/* 할인율 미리보기 */}
          {form.regularPrice && form.salePrice ? (
            <p className="text-xs text-slate">
              할인율:{" "}
              <span className="font-semibold text-ember">
                {calcDiscountRate(Number(form.regularPrice), Number(form.salePrice))}
              </span>
              {" "}({Number(form.regularPrice).toLocaleString()}원 →{" "}
              {Number(form.salePrice).toLocaleString()}원)
            </p>
          ) : null}

          {/* 혜택 내용 */}
          <div>
            <label className="mb-1.5 block text-sm font-medium">혜택 내용 (선택)</label>
            <textarea
              rows={3}
              value={form.features}
              onChange={(e) => setField("features", e.target.value)}
              placeholder="예: 기본+심화+문제풀이"
              className="w-full resize-none rounded-2xl border border-ink/10 px-4 py-3 text-sm outline-none focus:border-ink/30"
            />
          </div>

          {/* 활성여부 */}
          <div className="flex items-center gap-3">
            <input
              id="product-is-active"
              type="checkbox"
              checked={form.isActive}
              onChange={(e) => setField("isActive", e.target.checked)}
              className="h-4 w-4 rounded border-ink/20 accent-ember"
            />
            <label htmlFor="product-is-active" className="text-sm font-medium">
              활성 상품으로 설정
            </label>
          </div>
        </div>
      </ActionModal>

      {/* Delete confirm modal */}
      <ActionModal
        open={Boolean(confirmModal.modal)}
        badgeLabel={confirmModal.modal?.badgeLabel ?? ""}
        badgeTone={confirmModal.modal?.badgeTone}
        title={confirmModal.modal?.title ?? ""}
        description={confirmModal.modal?.description ?? ""}
        details={confirmModal.modal?.details ?? []}
        cancelLabel={confirmModal.modal?.cancelLabel}
        confirmLabel={confirmModal.modal?.confirmLabel ?? "확인"}
        confirmTone={confirmModal.modal?.confirmTone}
        isPending={isPending}
        onClose={confirmModal.closeModal}
        onConfirm={confirmModal.modal?.onConfirm}
      />
    </div>
  );
}
