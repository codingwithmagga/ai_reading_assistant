import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { App } from "./App";

describe("App", () => {
  it("defaults to German and allows switching the interface language", () => {
    window.localStorage.removeItem("ui-language");
    const { unmount } = render(<App />);

    expect(
      screen.getByRole("heading", { name: "Spoilerfreier Lesebegleiter" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/aktuellen Leseposition/)).toBeInTheDocument();

    const languageSelect = screen.getByRole("combobox", { name: "Sprache" });
    fireEvent.change(languageSelect, { target: { value: "en" } });

    expect(
      screen.getByRole("heading", { name: "Spoiler-Free Reading Assistant" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/current reading position/)).toBeInTheDocument();
    expect(window.localStorage.getItem("ui-language")).toBe("en");

    unmount();
    render(<App />);
    expect(
      screen.getByRole("heading", { name: "Spoiler-Free Reading Assistant" }),
    ).toBeInTheDocument();
  });
});
