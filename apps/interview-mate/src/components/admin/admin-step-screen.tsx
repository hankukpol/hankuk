"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { type ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import { ArrowRight, LoaderCircle } from "lucide-react";
import { toast } from "sonner";

import { getDefaultSessionId } from "@/components/admin/use-session-selection";
import { Badge } from "@/components/ui/badge";
import type { SessionSummary } from "@/lib/sessions";

type AcademyState = {
  academyName: string;
  updatedAt: string | null;
};

export type AdminStepKey =
  | "dashboard"
  | "sessions"
  | "roster"
  | "groups"
  | "rooms";

type AdminStepScreenProps = {
  step: AdminStepKey;
  title: string;
  description: string;
  children: (args: {
    academy: AcademyState;
    isLoading: boolean;
    refreshWorkspace: () => Promise<void>;
    selectedSession: SessionSummary | null;
    sessionId: string;
    sessions: SessionSummary[];
    setSessionId: (sessionId: string) => void;
  }) => ReactNode;
};

const STEPS: Array<{
  key: AdminStepKey;
  label: string;
  orderLabel: string;
  description: string;
}> = [
  {
    key: "sessions",
    label: "일정·예약 관리",
    orderLabel: "1",
    description: "면접 회차 생성, 예약 시간, 운영",
  },
  {
    key: "roster",
    label: "명단 관리",
    orderLabel: "2",
    description: "등록 명단 업로드와 교체",
  },
  {
    key: "groups",
    label: "조 편성",
    orderLabel: "3",
    description: "외부 편성 결과 반영",
  },
  {
    key: "rooms",
    label: "방 관리",
    orderLabel: "4",
    description: "방 상태, 멤버, 공지",
  },
  {
    key: "dashboard",
    label: "현황판",
    orderLabel: "상시",
    description: "통계와 CSV 내보내기",
  },
];

async function readJson<T>(response: Response): Promise<T> {
  const payload = (await response.json().catch(() => ({}))) as T & {
    message?: string;
  };

  if (!response.ok) {
    throw new Error(payload.message ?? "관리자 화면 데이터를 불러오지 못했습니다.");
  }

  return payload;
}

function buildPath(step: AdminStepKey) {
  if (step === "dashboard") {
    return "/admin/dashboard";
  }

  return `/admin/${step}`;
}

export function AdminStepScreen({
  step,
  title,
  description,
  children,
}: AdminStepScreenProps) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [academy, setAcademy] = useState<AcademyState>({
    academyName: "",
    updatedAt: null,
  });
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const rawSessionId = searchParams.get("session") ?? "";
  const sessionId = useMemo(
    () => getDefaultSessionId(sessions, rawSessionId),
    [rawSessionId, sessions],
  );
  const selectedSession = useMemo(
    () => sessions.find((session) => session.id === sessionId) ?? null,
    [sessionId, sessions],
  );

  const updateSessionParam = useCallback(
    (nextSessionId: string) => {
      const params = new URLSearchParams(searchParams.toString());

      if (nextSessionId) {
        params.set("session", nextSessionId);
      } else {
        params.delete("session");
      }

      const nextQuery = params.toString();
      router.replace(nextQuery ? `${pathname}?${nextQuery}` : pathname, {
        scroll: false,
      });
    },
    [pathname, router, searchParams],
  );

  const refreshWorkspace = useCallback(async () => {
    setIsLoading(true);

    try {
      const [academyPayload, sessionPayload] = await Promise.all([
        fetch("/api/admin/academy").then(
          readJson<{ academyName: string; updatedAt: string | null }>,
        ),
        fetch("/api/admin/sessions").then(
          readJson<{ sessions: SessionSummary[] }>,
        ),
      ]);

      setAcademy(academyPayload);
      setSessions(sessionPayload.sessions);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "관리자 화면 데이터를 불러오지 못했습니다.",
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshWorkspace();
  }, [refreshWorkspace]);

  useEffect(() => {
    if (isLoading || !sessions.length) {
      return;
    }

    if (sessionId !== rawSessionId) {
      updateSessionParam(sessionId);
    }
  }, [isLoading, rawSessionId, sessionId, sessions.length, updateSessionParam]);

  const currentStepIndex = STEPS.findIndex((item) => item.key === step);
  const nextStep =
    currentStepIndex >= 0 ? STEPS[currentStepIndex + 1] ?? null : null;

  const buildStepHref = useCallback(
    (target: AdminStepKey) => {
      const params = new URLSearchParams(searchParams.toString());

      if (sessionId) {
        params.set("session", sessionId);
      }

      const query = params.toString();
      const path = buildPath(target);

      return query ? `${path}?${query}` : path;
    },
    [searchParams, sessionId],
  );

  return (
    <main className="min-h-screen bg-slate-50">
      <div className="mx-auto flex min-h-screen w-full max-w-7xl flex-col gap-6 px-4 py-6 md:px-6">
        <div className="rounded-[10px] border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-5">
            <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone="brand">운영 플로우</Badge>
                  {selectedSession ? (
                    <Badge
                      tone={
                        selectedSession.status === "active" ? "success" : "neutral"
                      }
                    >
                      {selectedSession.name}
                    </Badge>
                  ) : null}
                </div>
                <div>
                  <h1 className="text-2xl font-semibold text-slate-950">{title}</h1>
                  <p className="mt-1 text-sm text-slate-500">{description}</p>
                </div>
                <p className="text-xs text-slate-400">
                  {academy.academyName || "Academy"} 기준으로 관리자 작업을
                  단계별 페이지로 나눴습니다.
                </p>
              </div>

              <div className="flex flex-col gap-3 sm:flex-row">
                <select
                  value={sessionId}
                  onChange={(event) => updateSessionParam(event.target.value)}
                  disabled={isLoading || sessions.length === 0}
                  className="w-full min-w-[240px] rounded-[12px] border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 disabled:cursor-not-allowed disabled:bg-slate-50 sm:w-auto"
                >
                  <option value="">면접 회차 선택</option>
                  {sessions.map((session) => (
                    <option key={session.id} value={session.id}>
                      {session.name}
                    </option>
                  ))}
                </select>

                {nextStep ? (
                  <Link
                    href={buildStepHref(nextStep.key)}
                    className="inline-flex items-center justify-center gap-2 rounded-[12px] bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white"
                  >
                    다음 단계 {nextStep.label}
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                ) : null}
              </div>
            </div>

            <div className="grid gap-3 lg:grid-cols-5">
              {STEPS.map((item) => {
                const active = item.key === step;

                return (
                  <Link
                    key={item.key}
                    href={buildStepHref(item.key)}
                    className={`rounded-[10px] border px-4 py-4 transition ${
                      active
                        ? "border-slate-950 bg-slate-950 text-white"
                        : "border-slate-200 bg-slate-50 text-slate-700 hover:bg-white"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span
                        className={`inline-flex h-7 min-w-7 items-center justify-center rounded-full px-2 text-xs font-semibold ${
                          active
                            ? "bg-white/15 text-white"
                            : "bg-white text-slate-500"
                        }`}
                      >
                        {item.orderLabel}
                      </span>
                    </div>
                    <p className="mt-3 text-sm font-semibold">{item.label}</p>
                    <p
                      className={`mt-1 text-xs ${
                        active ? "text-white/70" : "text-slate-500"
                      }`}
                    >
                      {item.description}
                    </p>
                  </Link>
                );
              })}
            </div>
          </div>
        </div>

        {isLoading ? (
          <div className="flex min-h-[320px] items-center justify-center rounded-[10px] border border-slate-200 bg-white">
            <div className="inline-flex items-center gap-3 text-sm text-slate-500">
              <LoaderCircle className="h-5 w-5 animate-spin" />
              면접 회차와 관리자 화면 데이터를 불러오고 있습니다.
            </div>
          </div>
        ) : (
          children({
            academy,
            isLoading,
            refreshWorkspace,
            selectedSession,
            sessionId,
            sessions,
            setSessionId: updateSessionParam,
          })
        )}
      </div>
    </main>
  );
}
