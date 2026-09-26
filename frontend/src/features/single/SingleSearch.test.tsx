import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { SingleSearch } from "./SingleSearch";
import { makeNotFound, makeResult } from "../../test/fixtures";
import { mockFetch, requestBody } from "../../test/mockFetch";

async function search(mpn: string) {
  const user = userEvent.setup();
  render(<SingleSearch />);
  await user.type(screen.getByLabelText("Part number"), mpn);
  await user.click(screen.getByRole("button", { name: "Search" }));
  return user;
}

describe("SingleSearch", () => {
  it("sends the trimmed part number and shows one section per supplier", async () => {
    const fetchMock = mockFetch({
      "POST /api/source": {
        body: {
          results: [
            makeResult({ confidence: 1 }),
            makeResult({ supplier: "Distrelec", manufacturer: "ST", price: "20.1", currency: "CHF", stock: 584, confidence: 0.97 }),
          ],
          errors: [],
        },
      },
    });

    await search("  STM32F407VGT6  ");

    const distrelec = (await screen.findByRole("heading", { name: "Distrelec" })).closest("section") as HTMLElement;
    expect(within(distrelec).getByText("ST")).toBeInTheDocument();
    expect(within(distrelec).getByText("CHF 20.1")).toBeInTheDocument();
    expect(within(distrelec).getByText("Confirmed match (97%)")).toBeInTheDocument();
    expect(within(distrelec).getByRole("link", { name: "View on Distrelec →" })).toHaveAttribute("target", "_blank");
    expect(screen.getByRole("heading", { name: "DigiKey" })).toBeInTheDocument();
    expect(requestBody(fetchMock, "POST /api/source")).toEqual({ mpn: "STM32F407VGT6" });
  });

  it("notes when a supplier matched several manufacturers", async () => {
    mockFetch({
      "POST /api/source": {
        body: { results: [makeResult({ manufacturer: "Microchip" }), makeResult({ manufacturer: "Atmel" })], errors: [] },
      },
    });

    await search("ATMEGA328P-PU");

    expect(await screen.findByText("2 manufacturers found")).toBeInTheDocument();
  });

  it("shows a not-found card for a supplier that doesn't stock the part", async () => {
    mockFetch({ "POST /api/source": { body: { results: [makeNotFound({ supplier: "Distrelec" })], errors: [] } } });

    await search("LM358P");

    expect(await screen.findByText(/doesn't appear to stock this part/)).toBeInTheDocument();
  });

  it("explains a supplier that crashed instead of silently leaving it out", async () => {
    mockFetch({
      "POST /api/source": { body: { results: [makeResult()], errors: [{ supplier: "Distrelec", message: "pipeline timed out" }] } },
    });

    await search("STM32F407VGT6");

    expect(await screen.findByText("Something went wrong checking this supplier: pipeline timed out")).toBeInTheDocument();
  });

  it("says so when neither supplier returned anything", async () => {
    mockFetch({ "POST /api/source": { body: { results: [], errors: [] } } });

    await search("NOTHING");

    expect(await screen.findByRole("alert")).toHaveTextContent("No results from either supplier.");
  });

  it("shows the server's error message", async () => {
    mockFetch({ "POST /api/source": { status: 500, body: { error: "DigiKey token request failed" } } });

    await search("STM32F407VGT6");

    expect(await screen.findByRole("alert")).toHaveTextContent("DigiKey token request failed");
    expect(screen.getByRole("button", { name: "Search" })).toBeEnabled();
  });

  it("shows a loading message while searching and disables the button", async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    vi.stubGlobal("fetch", async () => {
      await gate;
      return new Response(JSON.stringify({ results: [makeResult()], errors: [] }), { status: 200 });
    });

    await search("STM32F407VGT6");

    expect(screen.getByRole("status")).toHaveTextContent('Searching DigiKey and Distrelec for "STM32F407VGT6"');
    expect(screen.getByRole("button", { name: "Search" })).toBeDisabled();

    release();
    expect(await screen.findByRole("heading", { name: "DigiKey" })).toBeInTheDocument();
    expect(screen.queryByRole("status")).toBeNull();
  });
});
