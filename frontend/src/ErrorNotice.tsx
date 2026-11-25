import { ReactNode, useEffect, useState } from "react";
import { Alert, AlertTitle, Box, IconButton } from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
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
    <Alert
      severity="error"
      role="alert"
      action={
        <IconButton
          size="small"
          aria-label={copy.dismissError}
          onClick={() => {
            setVisible(false);
            onDismiss();
          }}
        >
          <CloseIcon fontSize="small" />
        </IconButton>
      }
      sx={{ alignItems: "flex-start", mb: 1 }}
    >
      <AlertTitle>{title ?? copy.errorTitle}</AlertTitle>
      <Box sx={{ display: "grid", gap: 1 }}>
        <div>{message}</div>
        {children}
      </Box>
    </Alert>
  );
}
