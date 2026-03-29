"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { format, startOfMonth, subDays } from "date-fns";
import { ko } from "date-fns/locale";
import { CalendarDays, ChevronDown } from "lucide-react";
import { DayPicker, type DateRange } from "react-day-picker";

type DateRangePickerProps = {
  fromName: string;
  toName: string;
  defaultFrom?: string;
  defaultTo?: string;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  align?: "left" | "right";
};

function parseDateValue(value?: string) {
  if (!value) {
    return undefined;
  }

  const parsed = new Date(`${value}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

function normalizeRange(from?: Date, to?: Date): DateRange | undefined {
  const normalizedFrom = from ?? to;
  const normalizedTo = to ?? from;

  if (!normalizedFrom || !normalizedTo) {
    if (!normalizedFrom && !normalizedTo) {
      return undefined;
    }

    return {
      from: normalizedFrom,
      to: normalizedTo,
    };
  }

  if (normalizedFrom.getTime() <= normalizedTo.getTime()) {
    return { from: normalizedFrom, to: normalizedTo };
  }

  return {
    from: normalizedTo,
    to: normalizedFrom,
  };
}

function formatInputValue(value?: Date) {
  return value ? format(value, "yyyy-MM-dd") : "";
}

function formatDisplayValue(value?: Date) {
  return value ? format(value, "yyyy-MM-dd") : "";
}

function buildLabel(range: DateRange | undefined, placeholder: string) {
  if (!range?.from) {
    return placeholder;
  }

  const fromLabel = formatDisplayValue(range.from);
  const toLabel = formatDisplayValue(range.to ?? range.from);
  return `${fromLabel} ~ ${toLabel}`;
}

export function DateRangePicker({
  fromName,
  toName,
  defaultFrom,
  defaultTo,
  placeholder = "날짜 범위 선택",
  disabled = false,
  className = "",
  align = "left",
}: DateRangePickerProps) {
  const initialRange = useMemo(
    () => normalizeRange(parseDateValue(defaultFrom), parseDateValue(defaultTo)),
    [defaultFrom, defaultTo],
  );
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [range, setRange] = useState<DateRange | undefined>(initialRange);
  const [month, setMonth] = useState<Date>(initialRange?.from ?? startOfMonth(new Date()));

  useEffect(() => {
    setRange(initialRange);
    setMonth(initialRange?.from ?? startOfMonth(new Date()));
  }, [initialRange]);

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, []);

  function commitRange(nextRange: DateRange | undefined) {
    setRange(nextRange);
    if (nextRange?.from) {
      setMonth(nextRange.from);
    }
    if (nextRange?.from && nextRange?.to) {
      setIsOpen(false);
    }
  }

  function setQuickRange(nextRange: DateRange | undefined) {
    commitRange(nextRange);
    setIsOpen(false);
  }

  const hiddenFrom = formatInputValue(range?.from);
  const hiddenTo = formatInputValue(range?.to ?? range?.from);
  const label = buildLabel(range, placeholder);
  const popoverClassName = align === "right" ? "right-0" : "left-0";

  return (
    <div ref={containerRef} className={`date-range-picker relative ${className}`}>
      <input type="hidden" name={fromName} value={hiddenFrom} />
      <input type="hidden" name={toName} value={hiddenTo} />
      <button
        type="button"
        disabled={disabled}
        onClick={() => setIsOpen((current) => !current)}
        className="inline-flex min-h-[52px] w-full items-center justify-between gap-3 rounded-2xl border border-ink/10 bg-white px-4 py-3 text-left text-sm transition hover:border-ember/30 hover:text-ember disabled:cursor-not-allowed disabled:bg-mist/40 disabled:text-slate"
      >
        <span className="flex min-w-0 items-center gap-3">
          <CalendarDays className="h-4 w-4 shrink-0 text-slate" />
          <span className="truncate">{label}</span>
        </span>
        <ChevronDown className={`h-4 w-4 shrink-0 text-slate transition ${isOpen ? "rotate-180" : ""}`} />
      </button>
      {isOpen ? (
        <div className={`absolute top-full z-40 mt-2 w-[320px] max-w-[calc(100vw-2rem)] rounded-[24px] border border-ink/10 bg-white p-4 shadow-2xl ${popoverClassName}`}>
          <div className="mb-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => {
                const today = new Date();
                setQuickRange({ from: today, to: today });
              }}
              className="rounded-full border border-ink/10 px-3 py-1.5 text-xs font-semibold transition hover:border-ember/30 hover:text-ember"
            >
              오늘
            </button>
            <button
              type="button"
              onClick={() => {
                const today = new Date();
                setQuickRange({ from: subDays(today, 6), to: today });
              }}
              className="rounded-full border border-ink/10 px-3 py-1.5 text-xs font-semibold transition hover:border-ember/30 hover:text-ember"
            >
              최근 7일
            </button>
            <button
              type="button"
              onClick={() => {
                const today = new Date();
                setQuickRange({ from: startOfMonth(today), to: today });
              }}
              className="rounded-full border border-ink/10 px-3 py-1.5 text-xs font-semibold transition hover:border-ember/30 hover:text-ember"
            >
              이번 달
            </button>
            <button
              type="button"
              onClick={() => setQuickRange(undefined)}
              className="rounded-full border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-700 transition hover:bg-red-50"
            >
              초기화
            </button>
          </div>
          <DayPicker
            locale={ko}
            mode="range"
            selected={range}
            month={month}
            onMonthChange={setMonth}
            onSelect={commitRange}
            showOutsideDays
            className="mx-auto"
          />
          <div className="mt-3 rounded-2xl bg-mist/70 px-3 py-2 text-xs leading-6 text-slate">
            범위를 선택하면 GET 필터에 바로 반영됩니다. 하루만 선택하면 같은 날짜 기준으로 조회합니다.
          </div>
        </div>
      ) : null}
    </div>
  );
}