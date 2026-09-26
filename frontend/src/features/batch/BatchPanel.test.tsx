import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { BatchJob } from "@jev/shared";
import { BatchPanel } from "./BatchPanel";
import { POLL_INTERVAL_MS } from "../../hooks/useBatchJob";
import { navigateTo } from "../../lib/navigate";
import { makeJob, makeNotFound, makeResult, makeRow } from "../../test/fixtures";
import { mockFetch, requestBody } from "../../test/mockFetch";

vi.mock("../../lib/navigate", () => ({ navigateTo: vi.fn() }));

const JOB_ID = "batch_1";

function doneJob(overrides: Partial<BatchJob> = {}): BatchJob {
  return makeJob(
    [
      makeRow(
        "STM32F407VGT6",
        [
          makeResult({ confidence: 1, price: "14.64" }),
          makeResult({ supplier: "Distrelec", manufacturer: "ST", price: "20.10", currency: "CHF", confidence: 0.6 }),
        ],
        25
      ),
      makeRow("RC0805FR-071KL", [makeResult({ manufacturer: "YAGEO", price: "0.10", confidence: 1 })], 500),
      makeRow("ZZZ-NOT-REAL", [makeNotFound(), makeNotFound({ supplier: "Distrelec" })]),
    ],
    { id: JOB_ID, ...overrides }
  );
}

function batchRoutes(job: BatchJob | BatchJob[]) {
  return {
    "POST /api/batch": { status: 202, body: { jobId: JOB_ID, total: 3, rowErrors: [] } },
    [`GET /api/batch/${JOB_ID}`]: Array.isArray(job) ? job.map((body) => ({ body })) : { body: job },
  };
}

async function uploadAndRun(user: ReturnType<typeof userEvent.setup>, contents = "MPN\nSTM32F407VGT6\n") {
  await user.upload(screen.getByLabelText(/click to choose a file/i), new File([contents], "bom.csv", { type: "text/csv" }));
  await user.click(screen.getByRole("button", { name: /upload & run/i }));
}

function renderPanel(props: Partial<Parameters<typeof BatchPanel>[0]> = {}) {
  return render(<BatchPanel digikeyConnected={false} digikeyReturnOutcome={null} {...props} />);
}

function checkbox(mpn: string, supplier: "DigiKey" | "Distrelec") {
  return screen.getByRole("checkbox", { name: `Select ${mpn} from ${supplier}` });
}

describe("BatchPanel — upload", () => {
  it("keeps 'Upload & run' disabled until a file is chosen, and shows the chosen file name", async () => {
    const user = userEvent.setup();
    renderPanel();
    const run = screen.getByRole("button", { name: /upload & run/i });
    expect(run).toBeDisabled();

    await user.upload(screen.getByLabelText(/click to choose a file/i), new File(["MPN\nA\n"], "my-bom.csv", { type: "text/csv" }));

    expect(run).toBeEnabled();
    expect(screen.getByText("my-bom.csv")).toBeInTheDocument();
  });

  it("sends the file's text content as { csv }", async () => {
    const user = userEvent.setup();
    const fetchMock = mockFetch(batchRoutes(doneJob()));
    renderPanel();

    await uploadAndRun(user, "MPN,Qty\nSTM32F407VGT6,25\n");

    await screen.findByRole("table");
    expect(requestBody(fetchMock, "POST /api/batch")).toEqual({ csv: "MPN,Qty\nSTM32F407VGT6,25\n" });
  });

  it("shows why an upload was rejected, including the per-row detail (e.g. an Excel file)", async () => {
    const user = userEvent.setup();
    mockFetch({
      "POST /api/batch": {
        status: 400,
        body: {
          error: "No valid rows found in the uploaded file.",
          rowErrors: [{ row: 0, message: 'This doesn\'t look like a CSV file. If this is an Excel file, use "Save As"…' }],
        },
      },
    });
    renderPanel();

    await uploadAndRun(user);

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("No valid rows found in the uploaded file.");
    expect(alert).toHaveTextContent("This doesn't look like a CSV file.");
    expect(screen.getByRole("button", { name: /upload & run/i })).toBeEnabled();
  });

  it("reports an unreachable server", async () => {
    const user = userEvent.setup();
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    renderPanel();

    await uploadAndRun(user);

    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't reach the server. Is it running?");
  });

  it("lists rows the parser skipped", async () => {
    const user = userEvent.setup();
    mockFetch(batchRoutes(doneJob({ parseErrors: [{ row: 3, message: "Missing part number — row skipped." }] })));
    renderPanel();

    await uploadAndRun(user);

    expect(await screen.findByText("Row 3: Missing part number — row skipped.")).toBeInTheDocument();
  });
});

describe("BatchPanel — results", () => {
  it("shows stat chips, a row per real result, and a not-found line", async () => {
    const user = userEvent.setup();
    mockFetch(batchRoutes(doneJob()));
    const { container } = renderPanel();

    await uploadAndRun(user);
    await screen.findByRole("table");

    const chips = [...container.querySelectorAll(".chip")].map((c) => c.textContent);
    expect(chips).toEqual(["3Parts", "2Confirmed match", "1Needs review", "0Weak match", "1Not found"]);
    expect(screen.getAllByRole("checkbox")).toHaveLength(3);
    expect(screen.getByText("No match found on either supplier.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Download report (CSV)" })).toHaveAttribute("href", `/api/batch/${JOB_ID}/export.csv`);
  });

  it("renders supplier-provided text as text, never as HTML", async () => {
    const user = userEvent.setup();
    const hostile = '<img src=x onerror="alert(1)">';
    mockFetch(batchRoutes(makeJob([makeRow(hostile, [makeResult({ manufacturer: hostile })])], { id: JOB_ID })));
    const { container } = renderPanel();

    await uploadAndRun(user);
    await screen.findByRole("table");

    expect(container.querySelector("img")).toBeNull();
    expect(screen.getAllByText(hostile).length).toBeGreaterThan(0);
  });
});

describe("BatchPanel — selection", () => {
  async function setup() {
    const user = userEvent.setup();
    mockFetch(batchRoutes(doneJob()));
    renderPanel();
    await uploadAndRun(user);
    await screen.findByRole("table");
    return user;
  }

  function cartCounts() {
    return screen.getAllByText(/selected/).map((el) => el.textContent);
  }

  it("pre-checks only confirmed matches and summarises them per supplier", async () => {
    await setup();
    expect(checkbox("STM32F407VGT6", "DigiKey")).toBeChecked();
    expect(checkbox("RC0805FR-071KL", "DigiKey")).toBeChecked();
    expect(checkbox("STM32F407VGT6", "Distrelec")).not.toBeChecked(); // 0.6 = needs review
    expect(cartCounts()).toEqual(["2 selected (~USD 14.74)", "0 selected"]);
  });

  it("updates the summary when a box is toggled", async () => {
    const user = await setup();
    await user.click(checkbox("STM32F407VGT6", "DigiKey"));
    await user.click(checkbox("STM32F407VGT6", "Distrelec"));

    expect(checkbox("STM32F407VGT6", "DigiKey")).not.toBeChecked();
    expect(cartCounts()).toEqual(["1 selected (~USD 0.10)", "1 selected (~CHF 20.10)"]);
  });

  it("Select all / Clear / Select all confirmed", async () => {
    const user = await setup();

    await user.click(screen.getByRole("button", { name: "Select all" }));
    expect(screen.getAllByRole("checkbox").every((c) => (c as HTMLInputElement).checked)).toBe(true);

    await user.click(screen.getByRole("button", { name: "Clear" }));
    expect(screen.getAllByRole("checkbox").some((c) => (c as HTMLInputElement).checked)).toBe(false);

    await user.click(screen.getByRole("button", { name: "Select all confirmed" }));
    expect(cartCounts()).toEqual(["2 selected (~USD 14.74)", "0 selected"]);
  });

  it("keeps the user's choices while the batch is still running, and defaults only new results", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const firstRow = makeRow("A", [makeResult({ confidence: 1 })]);
    const running = makeJob([firstRow, makeRow("B", [], 1, { digikeyDone: false, distrelecDone: false })], {
      id: JOB_ID,
      status: "running",
      completed: 2,
    });
    const done = makeJob([firstRow, makeRow("B", [makeResult({ confidence: 0.95 })])], { id: JOB_ID });
    mockFetch(batchRoutes([running, done]));
    renderPanel();

    await uploadAndRun(user);
    expect(await screen.findByText("Checking…")).toBeInTheDocument();
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "50");

    await user.click(checkbox("A", "DigiKey")); // user unchecks a confirmed match mid-run
    await act(() => vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS));

    expect(await screen.findByRole("checkbox", { name: "Select B from DigiKey" })).toBeChecked();
    expect(checkbox("A", "DigiKey")).not.toBeChecked();
    expect(screen.getByRole("link", { name: "Download report (CSV)" })).toBeInTheDocument();
  });

  it("starts a new batch with fresh defaults", async () => {
    const user = userEvent.setup();
    // Like the real backend: every upload gets its own job id.
    mockFetch({
      "POST /api/batch": [
        { status: 202, body: { jobId: "batch_1", total: 3, rowErrors: [] } },
        { status: 202, body: { jobId: "batch_2", total: 3, rowErrors: [] } },
      ],
      "GET /api/batch/batch_1": { body: doneJob({ id: "batch_1" }) },
      "GET /api/batch/batch_2": { body: doneJob({ id: "batch_2" }) },
    });
    renderPanel();
    await uploadAndRun(user);
    await screen.findByRole("table");
    await user.click(screen.getByRole("button", { name: "Clear" }));
    expect(checkbox("STM32F407VGT6", "DigiKey")).not.toBeChecked();

    await uploadAndRun(user);

    expect(await screen.findByRole("link", { name: "Download report (CSV)" })).toHaveAttribute("href", "/api/batch/batch_2/export.csv");
    expect(checkbox("STM32F407VGT6", "DigiKey")).toBeChecked();
  });
});

describe("BatchPanel — DigiKey cart", () => {
  it("offers to connect DigiKey when no account is connected", async () => {
    const user = userEvent.setup();
    mockFetch(batchRoutes(doneJob()));
    renderPanel({ digikeyConnected: false });

    await uploadAndRun(user);
    await user.click(await screen.findByRole("button", { name: "Connect DigiKey account" }));

    expect(navigateTo).toHaveBeenCalledWith("/api/digikey/oauth/start");
    expect(screen.queryByRole("button", { name: "Add to DigiKey cart" })).toBeNull();
  });

  it("sends exactly the selected DigiKey items with their BOM quantities, and reports success", async () => {
    const user = userEvent.setup();
    const fetchMock = mockFetch({
      ...batchRoutes(doneJob()),
      "POST /api/digikey/cart/add": { body: { listId: "l1", addedIdentifiers: ["x", "y"] } },
    });
    renderPanel({ digikeyConnected: true });
    await uploadAndRun(user);
    await screen.findByRole("table");

    await user.click(screen.getByRole("button", { name: "Add to DigiKey cart" }));

    expect(await screen.findByText(/2 item\(s\) added to your DigiKey list/)).toBeInTheDocument();
    expect(requestBody(fetchMock, "POST /api/digikey/cart/add")).toEqual({
      items: [
        { mpn: "STM32F407VGT6", manufacturer: "STMicroelectronics", quantity: 25 },
        { mpn: "RC0805FR-071KL", manufacturer: "YAGEO", quantity: 500 },
      ],
    });
  });

  it("shows the server's error when adding to the cart fails", async () => {
    const user = userEvent.setup();
    mockFetch({
      ...batchRoutes(doneJob()),
      "POST /api/digikey/cart/add": { status: 502, body: { error: "DigiKey MyLists create-list failed: 429" } },
    });
    renderPanel({ digikeyConnected: true });
    await uploadAndRun(user);
    await screen.findByRole("table");

    await user.click(screen.getByRole("button", { name: "Add to DigiKey cart" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't add to DigiKey cart: DigiKey MyLists create-list failed: 429");
  });

  it("disables 'Add to DigiKey cart' when nothing from DigiKey is selected", async () => {
    const user = userEvent.setup();
    mockFetch(batchRoutes(doneJob()));
    renderPanel({ digikeyConnected: true });
    await uploadAndRun(user);
    await screen.findByRole("table");

    await user.click(screen.getByRole("button", { name: "Clear" }));

    expect(screen.getByRole("button", { name: "Add to DigiKey cart" })).toBeDisabled();
  });

  it("keeps the Distrelec cart button disabled (not built yet)", async () => {
    const user = userEvent.setup();
    mockFetch(batchRoutes(doneJob()));
    renderPanel({ digikeyConnected: true });
    await uploadAndRun(user);

    const bar = (await screen.findByRole("button", { name: "Add to Distrelec cart" })).closest(".selection-bar") as HTMLElement;
    expect(within(bar).getByRole("button", { name: "Add to Distrelec cart" })).toBeDisabled();
  });
});

describe("BatchPanel — DigiKey return banner", () => {
  it.each([
    ["connected", /DigiKey account connected/],
    ["denied", /wasn't approved/],
    ["error", /Something went wrong connecting your DigiKey account/],
  ] as const)("shows a banner for the %s outcome", (outcome, text) => {
    renderPanel({ digikeyReturnOutcome: outcome });
    expect(screen.getByText(text)).toBeInTheDocument();
  });

  it("clears the banner once a new batch starts", async () => {
    const user = userEvent.setup();
    mockFetch(batchRoutes(doneJob()));
    renderPanel({ digikeyReturnOutcome: "connected" });

    await uploadAndRun(user);
    await screen.findByRole("table");

    expect(screen.queryByText(/DigiKey account connected/)).toBeNull();
  });
});
