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
        <span className="flex h-10 w-10 items-center justify-center rounded-[12px] bg-[var(--division-color)] text-white">
          <ShieldCheck className="h-[18px] w-[18px]" />
        </span>
        <div>
          <h2 className="text-[15px] font-bold text-slate-900">{title}</h2>
          <p className="text-[13px] text-slate-500">{description}</p>
        </div>
      </div>
      <div className="space-y-3">
        <label className="block space-y-1.5">
          <span className="text-[12px] font-semibold text-slate-500">연락처</span>
          <input
            value={phone}
            onChange={(event) => onPhoneChange?.(event.target.value)}
            className="input-modern"
            placeholder="010-1234-5678"
          />
        </label>
        {notice ? (
          <p className="rounded-[12px] bg-slate-50 px-4 py-3 text-[13px] leading-[1.6] text-slate-600">
            {notice}
          </p>
        ) : null}
        <button
          type="button"
          onClick={onSubmit}
          disabled={disabled || isPending}
          className="btn-primary"
        >
          {isPending ? <LoaderCircle className="h-4 w-4 animate-spin" /> : null}
          {actionLabel}
        </button>
      </div>
    </div>
  );
}
