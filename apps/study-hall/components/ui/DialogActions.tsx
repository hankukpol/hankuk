"use client";

import { createContext, type ReactNode, useContext, useState } from "react";
import { createPortal } from "react-dom";

const FooterTarget = createContext<HTMLDivElement | null | undefined>(undefined);

/** Keep actions from nested, reusable forms outside the scrolling dialog body. */
export function DialogContent({ children, footer }: { children: ReactNode; footer?: ReactNode }) {
  const [target, setTarget] = useState<HTMLDivElement | null>(null);

  return (
    <FooterTarget.Provider value={target}>
      <div className="admin-dialog-body">{children}</div>
      <div ref={setTarget} className="admin-dialog-actions-slot">
        {footer ? <div className="admin-dialog-footer">{footer}</div> : null}
      </div>
    </FooterTarget.Provider>
  );
}

/** Submit buttons must keep an explicit form={formId} association when portalled. */
export function DialogActions({ children }: { children: ReactNode }) {
  const target = useContext(FooterTarget);
  if (target === undefined) return <div className="flex flex-wrap justify-end gap-2">{children}</div>;
  if (!target) return null;
  return createPortal(<div className="admin-dialog-footer">{children}</div>, target);
}
