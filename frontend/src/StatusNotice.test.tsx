import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { StatusNotice } from "./StatusNotice";

afterEach(cleanup);

describe("StatusNotice", () => {
  it("renders an accessible polite status", () => {
    render(<StatusNotice loading>Wird geladen</StatusNotice>);

    expect(screen.getByRole("status")).toHaveTextContent("Wird geladen");
  });

  it("renders a compact status without a spinner", () => {
    render(<StatusNotice>Bereit</StatusNotice>);

    expect(screen.getByRole("status")).toHaveTextContent("Bereit");
  });
});
