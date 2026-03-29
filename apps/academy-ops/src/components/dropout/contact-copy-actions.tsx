"use client";

import { useState } from "react";

type ContactRow = {
  examNumber: string;
  name: string;
  phone: string | null;
};

function normalizePhone(phone: string | null) {
  return String(phone ?? "").trim();
}

async function copyText(text: string) {
  await navigator.clipboard.writeText(text);
}

export function DropoutContactCopyActions({ rows }: { rows: ContactRow[] }) {
  const [notice, setNotice] = useState<string | null>(null);
  const validRows = rows.filter((row) => normalizePhone(row.phone));
  const missingCount = rows.length - validRows.length;

  async function handleCopyPhones() {
    if (validRows.length === 0) {
      setNotice("복사할 연락처가 없습니다.");
      return;
    }

    await copyText(validRows.map((row) => normalizePhone(row.phone)).join("\n"));
    setNotice(`연락처 ${validRows.length}건을 복사했습니다.`);
  }

  async function handleCopyLabeled() {
    if (validRows.length === 0) {
      setNotice("복사할 연락처가 없습니다.");
      return;
    }

    await copyText(
      validRows
        .map((row) => `${row.examNumber}\t${row.name}\t${normalizePhone(row.phone)}`)
        .join("\n"),
    );
    setNotice(`수험번호·이름·연락처 ${validRows.length}건을 복사했습니다.`);
  }

  return (
    <div className="rounded-[24px] border border-ink/10 bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm text-slate">
          연락처 있음 {validRows.length}명
          {missingCount > 0 ? ` / 누락 ${missingCount}명` : ""}
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => {
              void handleCopyPhones();
            }}
            className="rounded-full border border-ink/10 px-4 py-2 text-sm font-semibold text-ink transition hover:bg-mist"
          >
            연락처만 복사
          </button>
          <button
            type="button"
            onClick={() => {
              void handleCopyLabeled();
            }}
            className="rounded-full border border-ink/10 px-4 py-2 text-sm font-semibold text-ink transition hover:bg-mist"
          >
            이름 포함 복사
          </button>
        </div>
      </div>
      {notice ? <p className="mt-2 text-xs text-slate">{notice}</p> : null}
    </div>
  );
}

export function CopyPhoneButton({
  examNumber,
  phone,
}: {
  examNumber: string;
  phone: string | null;
}) {
  const [notice, setNotice] = useState<string | null>(null);
  const normalizedPhone = normalizePhone(phone);

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        disabled={!normalizedPhone}
        onClick={() => {
          if (!normalizedPhone) {
            setNotice("연락처 없음");
            return;
          }

          void copyText(normalizedPhone).then(() => {
            setNotice("복사됨");
          });
        }}
        className="rounded-full border border-ink/10 px-3 py-1 text-xs font-semibold text-ink transition hover:bg-mist disabled:cursor-not-allowed disabled:text-slate"
      >
        연락처 복사
      </button>
      <span className="text-xs text-slate">
        {normalizedPhone || `${examNumber} 연락처 없음`}
        {notice ? ` · ${notice}` : ""}
      </span>
    </div>
  );
}
