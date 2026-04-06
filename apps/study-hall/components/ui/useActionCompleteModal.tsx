"use client";

import { useCallback, useMemo, useState } from "react";

import { ActionCompleteModal } from "@/components/ui/ActionCompleteModal";

type ActionCompleteOptions = {
  title: string;
  description?: string;
  notice?: string;
  badge?: string;
  confirmLabel?: string;
  widthClassName?: string;
};

export function useActionCompleteModal() {
  const [options, setOptions] = useState<ActionCompleteOptions | null>(null);

  const closeActionComplete = useCallback(() => {
    setOptions(null);
  }, []);

  const showActionComplete = useCallback((nextOptions: ActionCompleteOptions) => {
    setOptions(nextOptions);
  }, []);

  const actionCompleteModal = useMemo(
    () => (
      <ActionCompleteModal
        open={options !== null}
        onClose={closeActionComplete}
        title={options?.title ?? "처리 완료"}
        description={options?.description}
        notice={options?.notice}
        badge={options?.badge}
        confirmLabel={options?.confirmLabel}
        widthClassName={options?.widthClassName}
      />
    ),
    [closeActionComplete, options],
  );

  return {
    showActionComplete,
    actionCompleteModal,
    closeActionComplete,
  };
}
