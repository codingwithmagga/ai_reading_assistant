import { ReactNode, useEffect, useState } from "react";
import { Copy } from "./i18n";

export function ErrorNotice({
  copy,
  message,
  onDismiss,
  children,
  title,
}: {
  copy: Copy;
  message: ReactNode;
  onDismiss: () => void;
  children?: ReactNode;
  title?: string;
}) {
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    setVisible(true);
  }, [message]);
  if (!visible) {
    return null;
  }
  return (
    <details className="message error error-notice" open role="alert">
      <summary>{title ?? copy.errorTitle}</summary>
      <div className="error-notice-content">
        <div>{message}</div>
        {children}
      </div>
      <button
        type="button"
        className="error-notice-dismiss"
        aria-label={copy.dismissError}
        onClick={() => {
          setVisible(false);
          onDismiss();
        }}
      >
        ×
      </button>
    </details>
  );
}
