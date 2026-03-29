"use client";

import { useCallback, useRef, useState } from "react";

interface ConfirmOptions {
  title: string;
  description?: string;
  variant?: "default" | "danger";
  confirmLabel?: string;
  cancelLabel?: string;
}

interface ModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  variant?: "default" | "danger";
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function useConfirmModal() {
  const [state, setState] = useState<{
    open: boolean;
    title: string;
    description: string;
    variant: "default" | "danger";
    confirmLabel: string;
    cancelLabel: string;
  }>({
    open: false,
    title: "",
    description: "",
    variant: "default",
    confirmLabel: "확인",
    cancelLabel: "취소",
  });

  const resolverRef = useRef<((confirmed: boolean) => void) | null>(null);

  const confirm = useCallback((options: ConfirmOptions): Promise<boolean> => {
    return new Promise<boolean>((resolve) => {
      resolverRef.current = resolve;
      setState({
        open: true,
        title: options.title,
        description: options.description ?? "",
        variant: options.variant ?? "default",
        confirmLabel: options.confirmLabel ?? "확인",
        cancelLabel: options.cancelLabel ?? "취소",
      });
    });
  }, []);

  const handleConfirm = useCallback(() => {
    resolverRef.current?.(true);
    resolverRef.current = null;
    setState((prev) => ({ ...prev, open: false }));
  }, []);

  const handleCancel = useCallback(() => {
    resolverRef.current?.(false);
    resolverRef.current = null;
    setState((prev) => ({ ...prev, open: false }));
  }, []);

  const handleOpenChange = useCallback((open: boolean) => {
    if (!open) {
      resolverRef.current?.(false);
      resolverRef.current = null;
    }
    setState((prev) => ({ ...prev, open }));
  }, []);

  const modalProps: ModalProps = {
    open: state.open,
    onOpenChange: handleOpenChange,
    title: state.title,
    description: state.description,
    variant: state.variant,
    confirmLabel: state.confirmLabel,
    cancelLabel: state.cancelLabel,
    onConfirm: handleConfirm,
    onCancel: handleCancel,
  };

  return { confirm, modalProps };
}
