"use client";

import { useState } from "react";
import type { ActionModalProps } from "@/components/ui/action-modal";

export type ActionModalConfig = Omit<ActionModalProps, "open" | "onClose"> & {
  onClose?: () => void;
};

export function useActionModalState() {
  const [modal, setModal] = useState<ActionModalConfig | null>(null);

  function closeModal() {
    const onClose = modal?.onClose;
    setModal(null);
    onClose?.();
  }

  return {
    modal,
    openModal: setModal,
    closeModal,
  };
}
