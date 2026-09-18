import React from "react";

interface ModalProps {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  emphasis?: boolean;
}

// docs/09 §9: short, single-purpose actions are modals; docs/09 §12 excludes
// confirmation dialogs and wizards entirely, so every modal here is one step.
export function Modal({ title, onClose, children, emphasis }: ModalProps): React.ReactElement {
  React.useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className={`modal${emphasis ? " sandbox" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(event) => event.stopPropagation()}
      >
        <h2>{title}</h2>
        {children}
      </div>
    </div>
  );
}
