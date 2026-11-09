import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { App } from "./App";

describe("App", () => {
  it("explains the spoiler-free reading position", () => {
    render(<App />);

    expect(
      screen.getByRole("heading", { name: "Spoilerfreier Lesebegleiter" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/aktuellen Leseposition/),
    ).toBeInTheDocument();
  });
});
