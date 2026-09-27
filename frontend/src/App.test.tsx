import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { App } from "./App";
import { mockFetch } from "./test/mockFetch";

function tab(name: string) {
  return screen.getByRole("tab", { name });
}

const DISTRELEC_STATUS_DISCONNECTED = { "GET /api/distrelec/status": { body: { connected: false } } };

describe("App", () => {
  it("starts on the Single Part tab and switches tabs", async () => {
    mockFetch({ "GET /api/digikey/status": { body: { connected: false } }, ...DISTRELEC_STATUS_DISCONNECTED });
    const user = userEvent.setup();
    render(<App />);

    expect(tab("Single Part")).toHaveAttribute("aria-selected", "true");
    expect(document.getElementById("panel-single")).toHaveClass("active");

    await user.click(tab("Parts List"));

    expect(tab("Parts List")).toHaveAttribute("aria-selected", "true");
    expect(document.getElementById("panel-batch")).toHaveClass("active");
    expect(document.getElementById("panel-single")).not.toHaveClass("active");
  });

  it("keeps both panels mounted, so switching tabs doesn't lose what you typed", async () => {
    mockFetch({ "GET /api/digikey/status": { body: { connected: false } }, ...DISTRELEC_STATUS_DISCONNECTED });
    const user = userEvent.setup();
    render(<App />);

    await user.type(screen.getByLabelText("Part number"), "STM32");
    await user.click(tab("Parts List"));
    await user.click(tab("Single Part"));

    expect(screen.getByLabelText("Part number")).toHaveValue("STM32");
  });

  it("on return from DigiKey's login, opens the Parts List tab, shows the outcome, and cleans the URL", async () => {
    mockFetch({ "GET /api/digikey/status": { body: { connected: true } }, ...DISTRELEC_STATUS_DISCONNECTED });
    window.history.replaceState({}, "", "/?digikey=connected&keep=1");
    render(<App />);

    expect(tab("Parts List")).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText(/DigiKey account connected/)).toBeInTheDocument();
    expect(window.location.search).toBe("?keep=1");
  });

  it("ignores an unknown ?digikey value", () => {
    mockFetch({ "GET /api/digikey/status": { body: { connected: false } }, ...DISTRELEC_STATUS_DISCONNECTED });
    window.history.replaceState({}, "", "/?digikey=bogus");
    render(<App />);

    expect(tab("Single Part")).toHaveAttribute("aria-selected", "true");
    expect(window.location.search).toBe("");
  });

  it("asks the backend whether DigiKey is connected", async () => {
    const fetchMock = mockFetch({ "GET /api/digikey/status": { body: { connected: false } }, ...DISTRELEC_STATUS_DISCONNECTED });
    render(<App />);
    await screen.findByRole("tab", { name: "Single Part" });
    expect(fetchMock).toHaveBeenCalledWith("/api/digikey/status", undefined);
  });

  it("asks the backend whether a Distrelec session is connected", async () => {
    const fetchMock = mockFetch({
      "GET /api/digikey/status": { body: { connected: false } },
      "GET /api/distrelec/status": { body: { connected: true, expiresAt: "2026-01-01T00:00:00.000Z" } },
    });
    render(<App />);
    await screen.findByRole("tab", { name: "Single Part" });
    expect(fetchMock).toHaveBeenCalledWith("/api/distrelec/status", undefined);
  });

  it("shows the active tab's label as the top bar title, and it updates when the tab changes", async () => {
    mockFetch({ "GET /api/digikey/status": { body: { connected: false } }, ...DISTRELEC_STATUS_DISCONNECTED });
    const user = userEvent.setup();
    render(<App />);

    expect(document.querySelector(".topbar-title")).toHaveTextContent("Single Part");

    await user.click(tab("Parts List"));

    expect(document.querySelector(".topbar-title")).toHaveTextContent("Parts List");
  });

  it("reflects each supplier's connection status as a pill in the top bar", async () => {
    mockFetch({
      "GET /api/digikey/status": { body: { connected: true } },
      "GET /api/distrelec/status": { body: { connected: false } },
    });
    render(<App />);

    const digikeyPill = await screen.findByText("DigiKey");
    expect(digikeyPill.closest(".status-pill")).toHaveClass("connected");

    const distrelecPill = screen.getByText("Distrelec");
    expect(distrelecPill.closest(".status-pill")).not.toHaveClass("connected");
  });
});

describe("App — sidebar collapse", () => {
  it("collapses the sidebar, hiding text labels while keeping nav buttons reachable by name", async () => {
    mockFetch({ "GET /api/digikey/status": { body: { connected: false } }, ...DISTRELEC_STATUS_DISCONNECTED });
    const user = userEvent.setup();
    render(<App />);

    expect(screen.getByText("Component Sourcing")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Collapse sidebar" }));

    expect(screen.queryByText("Component Sourcing")).toBeNull();
    // Still reachable by its accessible name (aria-label) even with the visible label hidden.
    expect(tab("Single Part")).toBeInTheDocument();
    expect(tab("Parts List")).toBeInTheDocument();
  });

  it("expands the sidebar again from the collapsed state", async () => {
    mockFetch({ "GET /api/digikey/status": { body: { connected: false } }, ...DISTRELEC_STATUS_DISCONNECTED });
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: "Collapse sidebar" }));
    await user.click(screen.getByRole("button", { name: "Expand sidebar" }));

    expect(screen.getByText("Component Sourcing")).toBeInTheDocument();
  });

  it("switching tabs while collapsed still updates which panel is active", async () => {
    mockFetch({ "GET /api/digikey/status": { body: { connected: false } }, ...DISTRELEC_STATUS_DISCONNECTED });
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: "Collapse sidebar" }));
    await user.click(tab("Parts List"));

    expect(document.getElementById("panel-batch")).toHaveClass("active");
    expect(document.querySelector(".topbar-title")).toHaveTextContent("Parts List");
  });
});
