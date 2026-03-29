import { LoaderCircle, ShieldCheck } from "lucide-react";

type PhoneVerifyProps = {
  title: string;
  description: string;
  actionLabel: string;
  phone?: string;
  onPhoneChange?: (value: string) => void;
  onSubmit?: () => void;
  isPending?: boolean;
  disabled?: boolean;
  notice?: string | null;
};

export function PhoneVerify({
  title,
  description,
  actionLabel,
  phone = "",
  onPhoneChange,
  onSubmit,
  isPending = false,
  disabled = false,
  notice,
}: PhoneVerifyProps) {
  return (
    <div className="surface-card p-5">
      <div className="mb-4 flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-[10px] bg-[var(--division-color-light)] text-[var(--division-color)]">
          <ShieldCheck className="h-5 w-5" />
        </span>
        <div>
          <h2 className="text-base font-semibold text-slate-950">{title}</h2>
          <p className="text-sm text-slate-500">{description}</p>
        </div>
      </div>
      <div className="space-y-3">
        <label className="block space-y-1">
          <span className="text-sm font-medium text-slate-700">연락처</span>
          <input
            value={phone}
            onChange={(event) => onPhoneChange?.(event.target.value)}
            className="w-full rounded-[10px] border border-slate-200 bg-white px-3 py-2 text-sm placeholder:text-slate-400 focus:border-[var(--division-color)] focus:outline-none focus:ring-1 focus:ring-[var(--division-color)]"
            placeholder="010-1234-5678"
          />
        </label>
        {notice ? (
          <p className="rounded-[10px] border border-slate-200 bg-slate-50 px-3 py-3 text-sm leading-6 text-slate-600">
            {notice}
          </p>
        ) : null}
        <button
          type="button"
          onClick={onSubmit}
          disabled={disabled || isPending}
          className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-[var(--division-color)] px-5 py-2.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isPending ? <LoaderCircle className="h-4 w-4 animate-spin" /> : null}
          {actionLabel}
        </button>
      </div>
    </div>
  );
}
