"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";

import { getShellLocation, type ShellRole } from "@/components/layout/AdminSidebar";
import { breadcrumbSteps } from "@/lib/admin-breadcrumbs";

/**
 * 화면 위치 표시: `메뉴 묶음 › 메뉴 › 하위 화면`. 모든 관리자 화면 제목 위에 같은 자리로 놓인다(DESIGN.md 0절 13항).
 * 768px 미만은 상단 바 제목이 위치를 대신하므로 숨긴다.
 */
export function AdminBreadcrumb({ role, divisionSlug, pathname }: { role: ShellRole; divisionSlug: string; pathname: string }) {
  const location = getShellLocation(role, divisionSlug, pathname);
  if (!location) return null;
  const relative = pathname.slice(location.basePath.length);
  const steps = breadcrumbSteps(relative);
  const atMenuRoot = steps.length === 0;

  return (
    <nav className="admin-breadcrumb" aria-label="현재 위치">
      <ol>
        <li><span>{location.section}</span></li>
        <li>
          <ChevronRight aria-hidden="true" />
          {atMenuRoot ? <span aria-current="page">{location.label}</span> : <Link href={location.href} prefetch={false}>{location.label}</Link>}
        </li>
        {steps.map((step, index) => (
          <li key={`${step.label}-${index}`}>
            <ChevronRight aria-hidden="true" />
            {step.href && index < steps.length - 1
              ? <Link href={`${location.basePath}/${step.href}`} prefetch={false}>{step.label}</Link>
              : <span aria-current={index === steps.length - 1 ? "page" : undefined}>{step.label}</span>}
          </li>
        ))}
      </ol>
    </nav>
  );
}
