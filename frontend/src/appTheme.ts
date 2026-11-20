import { createTheme } from "@mui/material";

export type AppThemeMode = "light" | "dark";

export function createAppTheme(mode: AppThemeMode) {
  const light = mode === "light";

  return createTheme({
    palette: {
      mode,
      primary: {
        main: light ? "#53634d" : "#90a4ae",
        contrastText: light ? "#ffffff" : "#0d1318",
      },
      background: {
        default: light ? "#f5f2eb" : "hsl(220, 30%, 7%)",
        paper: light ? "#fffefa" : "hsl(220, 22%, 12%)",
      },
      text: {
        primary: light ? "#24231f" : "#e7edf2",
        secondary: light ? "#5f5b52" : "#b1bbc4",
      },
      divider: light ? "#d5d0c4" : "#3d4852",
      error: {
        main: light ? "#b5483d" : "#ff8a80",
      },
    },
    shape: {
      borderRadius: 8,
    },
    typography: {
      fontFamily:
        'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      h4: {
        fontWeight: 700,
      },
      h5: {
        fontWeight: 700,
      },
      h6: {
        fontWeight: 650,
      },
    },
    components: {
      MuiButton: {
        defaultProps: {
          disableElevation: true,
        },
        styleOverrides: {
          root: {
            textTransform: "none",
            minHeight: 44,
          },
        },
      },
      MuiCard: {
        styleOverrides: {
          root: {
            borderWidth: 1,
            borderStyle: "solid",
          },
        },
      },
      MuiTextField: {
        defaultProps: {
          variant: "outlined",
        },
      },
    },
  });
}
