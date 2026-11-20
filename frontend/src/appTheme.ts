import { createTheme } from "@mui/material";

export type AppThemeMode = "light" | "dark";

export function createAppTheme(mode: AppThemeMode) {
  const light = mode === "light";

  return createTheme({
    palette: {
      mode,
      primary: {
        main: light ? "#53634d" : "#8eaa82",
        contrastText: light ? "#ffffff" : "#12160f",
      },
      background: {
        default: light ? "#f5f2eb" : "#171915",
        paper: light ? "#fffefa" : "#22261f",
      },
      text: {
        primary: light ? "#24231f" : "#f3f0e8",
        secondary: light ? "#5f5b52" : "#c1c3ba",
      },
      divider: light ? "#d5d0c4" : "#51574d",
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
