import { useId, useState } from "react";
import { createRoot } from "react-dom/client";
import { Modal } from "@/components/ui/Modal";
import { SlideOver } from "@/components/ui/SlideOver";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { ActionCompleteModal } from "@/components/ui/ActionCompleteModal";
import { DialogActions } from "@/components/ui/DialogActions";
import { AdminTabs, AdminTabPanel } from "@/components/ui/AdminTabs";

function Fixture() {
  const formId = useId();
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [complete, setComplete] = useState(false);
  const [modal, setModal] = useState(false);
  const [tab, setTab] = useState("first");
  const [submissions, setSubmissions] = useState(0);
  return <div className="admin-shell flex-col">
    <button className="admin-button" onClick={() => setOpen(true)}>Open fixture drawer</button>
    <button className="admin-button" onClick={() => setModal(true)}>Open fixture modal</button>
    <output aria-label="Submission count">{submissions}</output>
    <AdminTabs label="Fixture tabs" activeId={tab} onChange={setTab} idPrefix="fixture" items={[
      { id: "first", label: "First" }, { id: "disabled", label: "Disabled", disabled: true }, { id: "last", label: "Last" },
    ]} />
    <AdminTabPanel id="first" activeId={tab} idPrefix="fixture" className="admin-section"><input aria-label="Persistent draft" /></AdminTabPanel>
    <AdminTabPanel id="last" activeId={tab} idPrefix="fixture">Last panel</AdminTabPanel>
    <SlideOver open={open} onClose={() => setOpen(false)} title="Dialog keyboard and form fixture">
      <form id={formId} onSubmit={(event) => { event.preventDefault(); setSubmissions((n) => n + 1); }}>
        <label className="admin-field">Required value<input aria-label="Required value" required /></label>
        <button className="admin-button" type="button" onClick={() => setConfirm(true)}>Open nested confirm</button>
        <button className="admin-button" type="button" onClick={() => setComplete(true)}>Open nested completion</button>
        {Array.from({ length: 20 }, (_, i) => <p key={i} className="admin-help py-4">Scrollable content {i + 1}</p>)}
        <DialogActions><button className="admin-button admin-button-primary" type="submit" form={formId}>Submit fixture</button></DialogActions>
      </form>
    </SlideOver>
    <ConfirmDialog open={confirm} title="Nested confirmation" onConfirm={() => setConfirm(false)} onCancel={() => setConfirm(false)} />
    <ActionCompleteModal open={complete} title="Nested completion" onClose={() => setComplete(false)} />
    <Modal open={modal} onClose={() => setModal(false)} title="Central modal" footer={<button className="admin-button" onClick={() => setModal(false)}>Close fixture</button>}>
      {Array.from({ length: 20 }, (_, i) => <p key={i} className="admin-help py-4">Scrollable content {i + 1}</p>)}
    </Modal>
  </div>;
}

const host = document.createElement("div");
document.body.replaceChildren(host);
createRoot(host).render(<Fixture />);
