"use client";

import Link from "next/link";

export type BreadcrumbItem = {
  label: string;
  href?: string;
};

export type BreadcrumbsProps = {
  items: BreadcrumbItem[];
};

export function Breadcrumbs({ items }: BreadcrumbsProps) {
  const allItems: BreadcrumbItem[] = [
    { label: "대시보드", href: "/admin" },
    ...items,
  ];

  return (
    <nav aria-label="breadcrumb" className="mb-5 flex items-center flex-wrap gap-1 text-sm">
      {allItems.map((item, index) => {
        const isLast = index === allItems.length - 1;
        return (
          <span key={index} className="flex items-center gap-1">
            {index > 0 && (
              <span className="text-slate/50 select-none">/</span>
            )}
            {isLast || !item.href ? (
              <span
                className="max-w-[200px] truncate font-medium text-ink"
                title={item.label}
              >
                {item.label}
              </span>
            ) : (
              <Link
                href={item.href}
                className="text-slate transition hover:text-ember"
              >
                {item.label}
              </Link>
            )}
          </span>
        );
      })}
    </nav>
  );
}
