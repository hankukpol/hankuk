"use client";

/**
 * 결제 액션 섹션 (클라이언트 컴포넌트)
 *
 * allowPoint가 true인 경우 PointDiscountSection을 표시하고,
 * 포인트 적용 금액을 PayButton에 전달합니다.
 */

import { useState } from "react";
import { PayButton } from "./PayButton";
import { PointDiscountSection } from "./point-discount-section";

type PaySectionProps = {
  linkId: number;
  token: string;
  orderName: string;
  finalAmount: number;
  allowPoint: boolean;
  contactPhone: string | null;
  contactPhoneHref: string | null;
};

export function PaySection({
  linkId,
  token,
  orderName,
  finalAmount,
  allowPoint,
  contactPhone,
  contactPhoneHref,
}: PaySectionProps) {
  const [pointAmount, setPointAmount] = useState(0);
  const [examNumber, setExamNumber] = useState("");

  const handlePointApplied = (pts: number, examNum: string) => {
    setPointAmount(pts);
    setExamNumber(examNum);
  };

  return (
    <>
      {allowPoint && (
        <PointDiscountSection
          linkId={linkId}
          totalAmount={finalAmount}
          allowPoint={allowPoint}
          onPointApplied={handlePointApplied}
        />
      )}
      <div className="px-6 pb-6">
        <PayButton
          linkId={linkId}
          token={token}
          orderName={orderName}
          finalAmount={finalAmount}
          pointAmount={pointAmount}
          examNumber={examNumber || undefined}
          contactPhone={contactPhone}
          contactPhoneHref={contactPhoneHref}
        />
      </div>
    </>
  );
}
