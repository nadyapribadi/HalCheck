import React from "react";

// docs/09 §11: success is a brief dismissible toast; rejection is never a
// toast and is always rendered inline by the screen that produced it.
export function useToast(): { show: (message: string) => void; element: React.ReactElement | null } {
  const [message, setMessage] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!message) return;
    const timer = window.setTimeout(() => setMessage(null), 4000);
    return () => window.clearTimeout(timer);
  }, [message]);

  return {
    show: setMessage,
    element: message ? (
      <div className="toast" role="status" onClick={() => setMessage(null)}>
        {message}
      </div>
    ) : null,
  };
}
