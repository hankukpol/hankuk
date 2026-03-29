"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";

type ShortcutNavItem = {
  href: string;
  label: string;
  description: string;
  group: string;
};

type ShortcutItem = {
  keyLabel: string;
  description: string;
};

const SHORTCUTS: ShortcutItem[] = [
  { keyLabel: "Ctrl/Cmd + K", description: "빠른 페이지 이동 팔레트 열기 또는 닫기" },
  { keyLabel: "?", description: "단축키 안내 열기 또는 닫기" },
  { keyLabel: "Esc", description: "열려 있는 단축키 모달 닫기" },
  { keyLabel: "Ctrl/Cmd + Enter", description: "현재 편집 중인 주요 폼 저장" },
];

function isTypingTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  const element = target.closest<HTMLElement>(
    'input, textarea, select, [contenteditable="true"], [role="textbox"], [role="combobox"], [role="searchbox"], [role="spinbutton"]',
  ) ?? target;

  const tagName = element.tagName;
  if (tagName === "INPUT" || tagName === "TEXTAREA" || tagName === "SELECT") {
    return true;
  }

  const role = element.getAttribute("role");
  if (role === "textbox" || role === "combobox" || role === "searchbox" || role === "spinbutton") {
    return true;
  }

  return element.isContentEditable;
}

function getFocusableElements(container: HTMLElement | null) {
  if (!container) {
    return [] as HTMLElement[];
  }

  return Array.from(
    container.querySelectorAll<HTMLElement>(
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ),
  ).filter((element) => !element.hasAttribute("disabled") && element.tabIndex >= 0);
}

function hasBlockingDialog(dialogs: Array<HTMLElement | null>, allowWhenOpen: boolean) {
  if (allowWhenOpen) {
    return false;
  }

  const activeDialogs = Array.from(document.querySelectorAll<HTMLElement>('[role="dialog"][aria-modal="true"]'));
  return activeDialogs.some((dialog) => !dialogs.includes(dialog));
}

function matchesQuickNav(item: ShortcutNavItem, normalizedQuery: string) {
  if (!normalizedQuery) {
    return true;
  }

  const haystack = [item.label, item.description, item.group, item.href].join(" ").toLowerCase();
  return haystack.includes(normalizedQuery);
}

export function AdminShortcutReference({ items }: { items: ShortcutNavItem[] }) {
  const router = useRouter();
  const [openPanel, setOpenPanel] = useState<"help" | "palette" | null>(null);
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const helpDialogRef = useRef<HTMLDivElement | null>(null);
  const paletteDialogRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const titleId = useId();
  const descriptionId = useId();
  const normalizedQuery = query.trim().toLowerCase();
  const filteredItems = useMemo(
    () => items.filter((item) => matchesQuickNav(item, normalizedQuery)),
    [items, normalizedQuery],
  );

  useEffect(() => {
    if (selectedIndex <= filteredItems.length - 1) {
      return;
    }

    setSelectedIndex(filteredItems.length === 0 ? 0 : filteredItems.length - 1);
  }, [filteredItems, selectedIndex]);

  function closePanel() {
    setOpenPanel(null);
    setQuery("");
    setSelectedIndex(0);
  }

  function openPanelByType(nextPanel: "help" | "palette") {
    setOpenPanel((current) => (current === nextPanel ? null : nextPanel));
    setQuery("");
    setSelectedIndex(0);
  }

  const navigateTo = useCallback((item: ShortcutNavItem | undefined) => {
    if (!item) {
      return;
    }

    setOpenPanel(null);
    setQuery("");
    setSelectedIndex(0);
    router.push(item.href);
  }, [router]);

  useEffect(() => {
    function handleGlobalKeyDown(event: KeyboardEvent) {
      if (event.defaultPrevented) {
        return;
      }

      const modifierPressed = event.ctrlKey || event.metaKey;
      const dialogs = [helpDialogRef.current, paletteDialogRef.current];
      const hasExternalDialog = hasBlockingDialog(dialogs, openPanel !== null);

      if (
        modifierPressed &&
        !event.altKey &&
        !event.shiftKey &&
        event.key.toLowerCase() === "k"
      ) {
        if (isTypingTarget(event.target) || hasExternalDialog) {
          return;
        }

        event.preventDefault();
        openPanelByType("palette");
        return;
      }

      if (!modifierPressed && !event.altKey && event.key === "?") {
        if (isTypingTarget(event.target) || hasExternalDialog) {
          return;
        }

        event.preventDefault();
        openPanelByType("help");
      }
    }

    document.addEventListener("keydown", handleGlobalKeyDown);
    return () => document.removeEventListener("keydown", handleGlobalKeyDown);
  }, [openPanel]);

  useEffect(() => {
    if (!openPanel) {
      return undefined;
    }

    const activeDialog = openPanel === "help" ? helpDialogRef.current : paletteDialogRef.current;
    const triggerElement = triggerRef.current;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const focusTimer = window.setTimeout(() => {
      if (openPanel === "palette") {
        searchInputRef.current?.focus();
        return;
      }

      const [firstFocusable] = getFocusableElements(activeDialog);
      (firstFocusable ?? activeDialog)?.focus();
    }, 0);

    function handleOpenPanelKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        closePanel();
        return;
      }

      if (openPanel === "palette") {
        if (event.key === "ArrowDown") {
          event.preventDefault();
          setSelectedIndex((current) => {
            if (filteredItems.length === 0) {
              return 0;
            }

            return current >= filteredItems.length - 1 ? 0 : current + 1;
          });
          return;
        }

        if (event.key === "ArrowUp") {
          event.preventDefault();
          setSelectedIndex((current) => {
            if (filteredItems.length === 0) {
              return 0;
            }

            return current <= 0 ? filteredItems.length - 1 : current - 1;
          });
          return;
        }

        if (event.key === "Enter") {
          const activeElement = document.activeElement;
          if (!paletteDialogRef.current?.contains(activeElement)) {
            return;
          }

          if (activeElement === searchInputRef.current) {
            event.preventDefault();
            navigateTo(filteredItems[selectedIndex] ?? filteredItems[0]);
          }
          return;
        }
      }

      if (event.key !== "Tab") {
        return;
      }

      const focusableElements = getFocusableElements(activeDialog);
      if (focusableElements.length === 0) {
        event.preventDefault();
        activeDialog?.focus();
        return;
      }

      const firstElement = focusableElements[0];
      const lastElement = focusableElements[focusableElements.length - 1];
      const activeElement = document.activeElement instanceof HTMLElement ? document.activeElement : null;

      if (event.shiftKey) {
        if (!activeElement || activeElement === firstElement || !activeDialog?.contains(activeElement)) {
          event.preventDefault();
          lastElement.focus();
        }
        return;
      }

      if (!activeElement || activeElement === lastElement || !activeDialog?.contains(activeElement)) {
        event.preventDefault();
        firstElement.focus();
      }
    }

    document.addEventListener("keydown", handleOpenPanelKeyDown);

    return () => {
      window.clearTimeout(focusTimer);
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleOpenPanelKeyDown);
      triggerElement?.focus();
    };
  }, [filteredItems, navigateTo, openPanel, selectedIndex]);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => openPanelByType("help")}
        className="inline-flex items-center rounded-full border border-white/10 px-3 py-2 text-xs font-semibold text-gray-300 transition hover:border-white/20 hover:bg-white/5 hover:text-white"
        aria-haspopup="dialog"
        aria-expanded={openPanel === "help"}
        aria-controls="admin-shortcut-reference"
      >
        단축키 안내
      </button>

      {openPanel === "help" ? (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-ink/55 px-4 py-8"
          onClick={closePanel}
        >
          <div
            id="admin-shortcut-reference"
            ref={helpDialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            aria-describedby={descriptionId}
            tabIndex={-1}
            className="w-full max-w-lg rounded-[28px] border border-ink/10 bg-white p-6 shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="inline-flex rounded-full border border-ink/10 bg-mist px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-slate">
                  Shortcut Reference
                </p>
                <h2 id={titleId} className="mt-4 text-2xl font-semibold text-ink">
                  관리자 단축키 안내
                </h2>
                <p id={descriptionId} className="mt-3 text-sm leading-7 text-slate">
                  입력창에 포커스가 없을 때 동작하는 전역 단축키와 저장 단축키를 한 번에 확인합니다.
                </p>
              </div>
              <button
                type="button"
                onClick={closePanel}
                className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-ink/10 text-sm font-semibold text-slate transition hover:border-ink/20 hover:text-ink"
                aria-label="단축키 안내 닫기"
              >
                닫기
              </button>
            </div>

            <div className="mt-6 overflow-hidden rounded-[24px] border border-ink/10">
              <table className="min-w-full text-sm">
                <caption className="sr-only">관리자 화면 단축키 목록</caption>
                <thead className="bg-mist/80 text-left">
                  <tr>
                    <th className="px-4 py-3 font-semibold">키</th>
                    <th className="px-4 py-3 font-semibold">설명</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink/10 bg-white">
                  {SHORTCUTS.map((shortcut) => (
                    <tr key={shortcut.keyLabel}>
                      <td className="px-4 py-3 align-top">
                        <kbd className="inline-flex min-w-[92px] items-center justify-center rounded-full border border-ink/10 bg-mist px-3 py-1 font-semibold text-ink">
                          {shortcut.keyLabel}
                        </kbd>
                      </td>
                      <td className="px-4 py-3 text-slate">{shortcut.description}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-5 rounded-[24px] border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-800">
              물음표와 빠른 이동 단축키는 <code>input</code>, <code>textarea</code>, <code>select</code>, 편집 가능한 영역에서는 실행되지 않습니다.
            </div>
          </div>
        </div>
      ) : null}

      {openPanel === "palette" ? (
        <div
          className="fixed inset-0 z-[70] flex items-start justify-center bg-ink/55 px-4 py-10"
          onClick={closePanel}
        >
          <div
            ref={paletteDialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            aria-describedby={descriptionId}
            tabIndex={-1}
            className="w-full max-w-2xl rounded-[28px] border border-ink/10 bg-white p-5 shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="inline-flex rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-sky-700">
                  Quick Navigation
                </p>
                <h2 id={titleId} className="mt-4 text-2xl font-semibold text-ink">
                  관리자 빠른 이동
                </h2>
                <p id={descriptionId} className="mt-3 text-sm leading-7 text-slate">
                  메뉴 이름, 설명, 그룹명으로 검색할 수 있습니다. <kbd className="rounded border border-ink/10 bg-mist px-2 py-1 text-xs">Enter</kbd> 로 바로 이동합니다.
                </p>
              </div>
              <button
                type="button"
                onClick={closePanel}
                className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-ink/10 text-sm font-semibold text-slate transition hover:border-ink/20 hover:text-ink"
                aria-label="빠른 이동 닫기"
              >
                닫기
              </button>
            </div>

            <div className="mt-5 rounded-[24px] border border-ink/10 bg-mist/40 p-3">
              <input
                ref={searchInputRef}
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setSelectedIndex(0);
                }}
                placeholder="페이지 이름 또는 설명 검색"
                className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm text-ink outline-none transition focus:border-forest/30"
              />
            </div>

            <div className="mt-4 max-h-[420px] overflow-y-auto rounded-[24px] border border-ink/10 bg-white">
              {filteredItems.length === 0 ? (
                <div className="px-5 py-10 text-center text-sm text-slate">검색 결과가 없습니다.</div>
              ) : (
                <ul className="divide-y divide-ink/10">
                  {filteredItems.map((item, index) => {
                    const selected = index === selectedIndex;

                    return (
                      <li key={item.href}>
                        <button
                          type="button"
                          onMouseEnter={() => setSelectedIndex(index)}
                          onClick={() => navigateTo(item)}
                          className={`flex w-full items-start justify-between gap-4 px-5 py-4 text-left transition ${
                            selected ? "bg-forest/10" : "bg-white hover:bg-mist/60"
                          }`}
                        >
                          <div>
                            <p className="text-sm font-semibold text-ink">{item.label}</p>
                            <p className="mt-1 text-sm text-slate">{item.description}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate">{item.group}</p>
                            <p className="mt-2 font-mono text-xs text-slate">{item.href}</p>
                          </div>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

