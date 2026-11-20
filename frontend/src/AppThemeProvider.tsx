import { CssBaseline, ThemeProvider } from "@mui/material";
import { ReactNode, useMemo } from "react";
import { AppThemeMode, createAppTheme } from "./appTheme";

interface AppThemeProviderProps {
  children: ReactNode;
  mode: AppThemeMode;
}

export function AppThemeProvider({
  children,
  mode,
}: AppThemeProviderProps) {
  const theme = useMemo(() => createAppTheme(mode), [mode]);

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      {children}
    </ThemeProvider>
  );
}
