import Link from "next/link";

type EmptyStateProps = {
  title: string;
  description?: string;
  action?: {
    label: string;
    href?: string;
    onClick?: () => void;
  };
  icon?: React.ReactNode;
};

export function EmptyState({ title, description, action, icon }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      {icon ? (
        <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-full border border-ink/10 bg-mist text-slate/50">
          {icon}
        </div>
      ) : (
        <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-full border border-ink/10 bg-mist">
          <svg
            className="h-7 w-7 text-slate/40"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
            />
          </svg>
        </div>
      )}
      <h3 className="text-sm font-semibold text-ink">{title}</h3>
      {description ? (
        <p className="mt-1.5 max-w-xs text-xs leading-6 text-slate">{description}</p>
      ) : null}
      {action ? (
        <div className="mt-5">
          {action.href ? (
            <Link
              href={action.href}
              className="inline-flex items-center rounded-full bg-ink px-5 py-2 text-xs font-semibold text-white transition hover:bg-forest"
            >
              {action.label}
            </Link>
          ) : (
            <button
              type="button"
              onClick={action.onClick}
              className="inline-flex items-center rounded-full bg-ink px-5 py-2 text-xs font-semibold text-white transition hover:bg-forest"
            >
              {action.label}
            </button>
          )}
        </div>
      ) : null}
    </div>
  );
}
