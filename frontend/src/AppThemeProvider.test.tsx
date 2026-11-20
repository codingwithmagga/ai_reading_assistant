import { render, screen } from "@testing-library/react";
import { useTheme } from "@mui/material";
import { describe, expect, it } from "vitest";
import { AppThemeProvider } from "./AppThemeProvider";
import { createAppTheme } from "./appTheme";

function ThemeProbe() {
  const theme = useTheme();

  return (
    <span>
      {theme.palette.mode}:{theme.palette.primary.main}:{theme.palette.background.default}
    </span>
  );
}

describe("AppThemeProvider", () => {
  it("provides the light theme to descendants", () => {
    render(
      <AppThemeProvider mode="light">
        <ThemeProbe />
      </AppThemeProvider>,
    );

    expect(screen.getByText("#53634d:#f5f2eb", { exact: false })).toBeInTheDocument();
  });

  it("provides the dark theme to descendants", () => {
    render(
      <AppThemeProvider mode="dark">
        <ThemeProbe />
      </AppThemeProvider>,
    );

    expect(screen.getByText("dark:#8eaa82:#171915")).toBeInTheDocument();
  });

  it("creates independent light and dark palettes", () => {
    const lightTheme = createAppTheme("light");
    const darkTheme = createAppTheme("dark");

    expect(lightTheme.palette.mode).toBe("light");
    expect(darkTheme.palette.mode).toBe("dark");
    expect(lightTheme.palette.background.default).not.toBe(
      darkTheme.palette.background.default,
    );
  });
});
