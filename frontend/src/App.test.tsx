import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { App } from "./App";
import { mockFetch } from "./test/mockFetch";

function tab(name: string) {
  return screen.getByRole("tab", { name });
}

describe("App", () => {
  it("starts on the Single Part tab and switches tabs", async () => {
    mockFetch({ "GET /api/digikey/status": { body: { connected: false } } });
    const user = userEvent.setup();
    render(<App />);

    expect(tab("Single Part")).toHaveAttribute("aria-selected", "true");
    expect(document.getElementById("panel-single")).toHaveClass("active");

    await user.click(tab("Batch (BOM)"));

    expect(tab("Batch (BOM)")).toHaveAttribute("aria-selected", "true");
    expect(document.getElementById("panel-batch")).toHaveClass("active");
    expect(document.getElementById("panel-single")).not.toHaveClass("active");
  });

  it("keeps both panels mounted, so switching tabs doesn't lose what you typed", async () => {
    mockFetch({ "GET /api/digikey/status": { body: { connected: false } } });
    const user = userEvent.setup();
    render(<App />);

    await user.type(screen.getByLabelText("Part number"), "STM32");
    await user.click(tab("Batch (BOM)"));
    await user.click(tab("Single Part"));

    expect(screen.getByLabelText("Part number")).toHaveValue("STM32");
  });

  it("on return from DigiKey's login, opens the Batch tab, shows the outcome, and cleans the URL", async () => {
    mockFetch({ "GET /api/digikey/status": { body: { connected: true } } });
    window.history.replaceState({}, "", "/?digikey=connected&keep=1");
    render(<App />);

    expect(tab("Batch (BOM)")).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText(/DigiKey account connected/)).toBeInTheDocument();
    expect(window.location.search).toBe("?keep=1");
  });

  it("ignores an unknown ?digikey value", () => {
    mockFetch({ "GET /api/digikey/status": { body: { connected: false } } });
    window.history.replaceState({}, "", "/?digikey=bogus");
    render(<App />);

    expect(tab("Single Part")).toHaveAttribute("aria-selected", "true");
    expect(window.location.search).toBe("");
  });

  it("asks the backend whether DigiKey is connected", async () => {
    const fetchMock = mockFetch({ "GET /api/digikey/status": { body: { connected: false } } });
    render(<App />);
    await screen.findByRole("tab", { name: "Single Part" });
    expect(fetchMock).toHaveBeenCalledWith("/api/digikey/status", undefined);
  });
});
