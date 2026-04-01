"use client";

import {
  PAYMENT_METHODS,
  parseStoredPaymentMethod,
  serializePaymentMethodValue,
} from "@/lib/payment-meta";

type PaymentMethodSelectProps = {
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  disabled?: boolean;
  selectClassName?: string;
  inputClassName?: string;
};

export function PaymentMethodSelect({
  value,
  onChange,
  required = false,
  disabled = false,
  selectClassName = "w-full rounded-[10px] border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-slate-400",
  inputClassName = "w-full rounded-[10px] border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-slate-400",
}: PaymentMethodSelectProps) {
  const parsed = parseStoredPaymentMethod(value);
  const selectedValue = parsed?.value ?? "";
  const customLabel = selectedValue === "other" ? parsed?.customLabel ?? "" : "";

  return (
    <div className="space-y-2">
      <select
        value={selectedValue}
        onChange={(event) => {
          const nextValue = event.target.value;

          if (!nextValue) {
            onChange("");
            return;
          }

          if (nextValue === "other") {
            onChange("other");
            return;
          }

          onChange(nextValue);
        }}
        disabled={disabled}
        required={required}
        className={selectClassName}
      >
        {!required ? <option value="">결제수단 선택</option> : null}
        {PAYMENT_METHODS.map((method) => (
          <option key={method.value} value={method.value}>
            {method.label}
          </option>
        ))}
      </select>

      {selectedValue === "other" ? (
        <input
          value={customLabel}
          onChange={(event) =>
            onChange(serializePaymentMethodValue("other", event.target.value) ?? "other")
          }
          disabled={disabled}
          placeholder="기타 결제수단 입력"
          className={inputClassName}
        />
      ) : null}
    </div>
  );
}
