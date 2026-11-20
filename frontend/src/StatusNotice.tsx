import { Alert, AlertProps, CircularProgress, Stack } from "@mui/material";
import { ReactNode } from "react";

export function StatusNotice({
  children,
  loading = false,
  ...props
}: AlertProps & {
  children: ReactNode;
  loading?: boolean;
}) {
  return (
    <Alert
      severity="info"
      role="status"
      aria-live="polite"
      variant="outlined"
      {...props}
    >
      <Stack direction="row" alignItems="center" spacing={1}>
        {loading && <CircularProgress size={16} aria-hidden="true" />}
        <span>{children}</span>
      </Stack>
    </Alert>
  );
}
