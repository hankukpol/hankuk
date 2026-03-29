"use client";

import { useState, useTransition } from "react";

type KeywordGroup = {
  type: "present" | "absent";
  label: string;
  keywords: string[];
  color: string;
  badgeColor: string;
  badgeDeleteColor: string;
};

type KeywordManagerProps = {
  initialPresent: string[];
  initialAbsent: string[];
  canEdit: boolean;
};

export function KeywordManager({ initialPresent, initialAbsent, canEdit }: KeywordManagerProps) {
  const [present, setPresent] = useState<string[]>(initialPresent);
  const [absent, setAbsent] = useState<string[]>(initialAbsent);
  const [newPresent, setNewPresent] = useState("");
  const [newAbsent, setNewAbsent] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const groups: KeywordGroup[] = [
    {
      type: "present",
      label: "출석 키워드",
      keywords: present,
      color: "border-forest/20 bg-forest/5",
      badgeColor: "border-forest/30 bg-forest/10 text-forest",
      badgeDeleteColor: "hover:bg-red-100 hover:text-red-700",
    },
    {
      type: "absent",
      label: "결석 키워드",
      keywords: absent,
      color: "border-red-200 bg-red-50/50",
      badgeColor: "border-red-200 bg-red-50 text-red-700",
      badgeDeleteColor: "hover:bg-red-200 hover:text-red-900",
    },
  ];

  function addKeyword(type: "present" | "absent") {
    const value = type === "present" ? newPresent.trim() : newAbsent.trim();
    if (!value) return;

    if (type === "present") {
      if (present.includes(value)) {
        setError("이미 존재하는 출석 키워드입니다.");
        return;
      }
      setPresent((prev) => [...prev, value]);
      setNewPresent("");
    } else {
      if (absent.includes(value)) {
        setError("이미 존재하는 결석 키워드입니다.");
        return;
      }
      setAbsent((prev) => [...prev, value]);
      setNewAbsent("");
    }
    setError(null);
  }

  function removeKeyword(type: "present" | "absent", keyword: string) {
    if (type === "present") {
      setPresent((prev) => prev.filter((k) => k !== keyword));
    } else {
      setAbsent((prev) => prev.filter((k) => k !== keyword));
    }
  }

  async function handleSave() {
    setError(null);
    setSuccess(null);
    if (present.length === 0) {
      setError("출석 키워드는 최소 1개 이상 필요합니다.");
      return;
    }
    if (absent.length === 0) {
      setError("결석 키워드는 최소 1개 이상 필요합니다.");
      return;
    }

    setSaving(true);
    try {
      const response = await fetch("/api/settings/attendance-keywords", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ present, absent }),
      });
      const result = await response.json();
      if (!response.ok) {
        setError(result.error ?? "저장에 실패했습니다.");
        return;
      }
      setSuccess("키워드가 저장되었습니다. 이후 카카오톡 파싱에 반영됩니다.");
    } catch {
      setError("네트워크 오류가 발생했습니다.");
    } finally {
      setSaving(false);
    }
  }

  async function handleReset() {
    if (!confirm("기본 키워드로 초기화하시겠습니까?")) return;
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const response = await fetch("/api/settings/attendance-keywords", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ present: [], absent: [] }), // 서버가 빈 배열은 기본값으로 처리
      });
      if (response.ok) {
        // Re-fetch to get defaults
        const fetchResponse = await fetch("/api/settings/attendance-keywords");
        const fetchResult = await fetchResponse.json();
        if (fetchResponse.ok && fetchResult.data) {
          setPresent(fetchResult.data.present);
          setAbsent(fetchResult.data.absent);
          setSuccess("기본 키워드로 초기화되었습니다.");
        }
      }
    } catch {
      setError("초기화 중 오류가 발생했습니다.");
    } finally {
      setSaving(false);
    }
  }

  const isLoading = saving || isPending;

  return (
    <div className="space-y-8">
      {/* 알림 메시지 */}
      {error && (
        <div className="rounded-[20px] border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700">
          {error}
        </div>
      )}
      {success && (
        <div className="rounded-[20px] border border-forest/20 bg-forest/5 px-5 py-4 text-sm text-forest">
          {success}
        </div>
      )}

      {/* 키워드 그룹 */}
      {groups.map((group) => (
        <div
          key={group.type}
          className={`overflow-hidden rounded-[28px] border bg-white shadow-panel ${group.color}`}
        >
          {/* 카드 헤더 */}
          <div className="border-b border-ink/5 bg-mist/40 px-6 py-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-3">
                  <h3 className="text-lg font-semibold text-ink">{group.label}</h3>
                  <span
                    className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-semibold ${group.badgeColor}`}
                  >
                    {group.keywords.length}개
                  </span>
                </div>
                <p className="mt-1 text-sm text-slate">
                  {group.type === "present"
                    ? "메시지에 이 단어가 포함되면 출석(AttendType.NORMAL)으로 판별합니다."
                    : "메시지에 이 단어가 포함되면 결석(AttendType.ABSENT)으로 판별합니다."}
                </p>
              </div>
            </div>
          </div>

          {/* 키워드 배지 목록 */}
          <div className="px-6 py-5">
            {group.keywords.length === 0 ? (
              <p className="text-sm text-slate">키워드가 없습니다.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {group.keywords.map((keyword) => (
                  <span
                    key={keyword}
                    className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium ${group.badgeColor}`}
                  >
                    {keyword}
                    {canEdit && (
                      <button
                        type="button"
                        onClick={() => removeKeyword(group.type, keyword)}
                        disabled={isLoading}
                        className={`ml-0.5 flex h-4 w-4 items-center justify-center rounded-full text-xs transition ${group.badgeDeleteColor} disabled:opacity-40`}
                        aria-label={`${keyword} 삭제`}
                      >
                        ×
                      </button>
                    )}
                  </span>
                ))}
              </div>
            )}

            {/* 키워드 추가 폼 */}
            {canEdit && (
              <div className="mt-4 flex gap-2">
                <input
                  type="text"
                  value={group.type === "present" ? newPresent : newAbsent}
                  onChange={(e) => {
                    if (group.type === "present") setNewPresent(e.target.value);
                    else setNewAbsent(e.target.value);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addKeyword(group.type);
                    }
                  }}
                  placeholder="키워드 입력 후 Enter 또는 추가 클릭"
                  className="flex-1 rounded-2xl border border-ink/10 bg-white px-4 py-2.5 text-sm placeholder:text-slate/60 focus:border-ember/40 focus:outline-none"
                  disabled={isLoading}
                />
                <button
                  type="button"
                  onClick={() => addKeyword(group.type)}
                  disabled={isLoading}
                  className="inline-flex items-center rounded-2xl bg-ember px-4 py-2.5 text-sm font-medium text-white transition hover:bg-ember/90 disabled:opacity-40"
                >
                  추가
                </button>
              </div>
            )}
          </div>
        </div>
      ))}

      {/* 저장 버튼 */}
      {canEdit && (
        <div className="flex flex-wrap items-center justify-between gap-4">
          <button
            type="button"
            onClick={() => startTransition(() => { void handleReset(); })}
            disabled={isLoading}
            className="inline-flex items-center rounded-xl border border-ink/10 px-4 py-2 text-sm font-medium text-slate transition hover:border-ink/30 hover:text-ink disabled:opacity-40"
          >
            기본값으로 초기화
          </button>
          <button
            type="button"
            onClick={() => startTransition(() => { void handleSave(); })}
            disabled={isLoading}
            className="inline-flex items-center rounded-xl bg-ember px-5 py-2.5 text-sm font-medium text-white transition hover:bg-ember/90 disabled:opacity-40"
          >
            {isLoading ? "저장 중..." : "변경사항 저장"}
          </button>
        </div>
      )}
    </div>
  );
}
