import type { ReactNode } from "react";
import type { DistrelecSkippedItem } from "@jev/shared";
import type { SelectionSummary, SupplierSelectionSummary } from "../../lib/selection";
import { formatSkippedReason, formatSubtotal } from "../../lib/format";

export type CartResult = { kind: "loading" } | { kind: "ok"; added: number } | { kind: "error"; message: string };
export type DistrelecCartResult =
  { kind: "loading" } | { kind: "ok"; added: number; skipped: DistrelecSkippedItem[] } | { kind: "error"; message: string };

interface SelectionBarProps {
  summary: SelectionSummary;
  digikeyConnected: boolean;
  distrelecConnected: boolean;
  cartResult: CartResult | null;
  distrelecCartResult: DistrelecCartResult | null;
  onSelectConfirmed: () => void;
  onSelectAll: () => void;
  onClear: () => void;
  onConnectDigikey: () => void;
  onAddToDigikeyCart: () => void;
  onAddToDistrelecCart: () => void;
}

function CartSummary({ summary, children }: { summary: SupplierSelectionSummary; children: ReactNode }) {
  return (
    <div className="selection-cart">
      <span className="selection-cart-count">
        {summary.count} selected{summary.count > 0 && ` (${formatSubtotal(summary.subtotal, summary.currency)})`}
      </span>
      {children}
    </div>
  );
}

function CartResultMessage({ result }: { result: CartResult }) {
  switch (result.kind) {
    case "loading":
      return (
        <span className="cart-result-loading">
          <span className="spinner" aria-hidden="true" /> Adding to your DigiKey cart…
        </span>
      );
    case "ok":
      return (
        <span className="cart-result-ok">
          ✓ {result.added} item(s) added to your DigiKey list —{" "}
          <a href="https://www.digikey.com/en/mylists" target="_blank" rel="noopener noreferrer">
            Open DigiKey →
          </a>
        </span>
      );
    case "error":
      return <span className="cart-result-error">Couldn&apos;t add to DigiKey cart: {result.message}</span>;
  }
}

function DistrelecCartResultMessage({ result }: { result: DistrelecCartResult }) {
  switch (result.kind) {
    case "loading":
      return (
        <span className="cart-result-loading">
          <span className="spinner" aria-hidden="true" /> Adding to your Distrelec cart…
        </span>
      );
    case "ok":
      return (
        <span className="cart-result-ok">
          ✓ {result.added} item(s) added to your Distrelec cart
          {result.skipped.length > 0 && (
            <>
              {" "}
              — {result.skipped.length} skipped ({result.skipped.map((s) => `${s.mpn}: ${formatSkippedReason(s.reason)}`).join(", ")})
            </>
          )}{" "}
          —{" "}
          <a href="https://www.distrelec.ch/en/" target="_blank" rel="noopener noreferrer">
            Open Distrelec →
          </a>
        </span>
      );
    case "error":
      return <span className="cart-result-error">Couldn&apos;t add to Distrelec cart: {result.message}</span>;
  }
}

export function SelectionBar(props: SelectionBarProps) {
  const { summary, digikeyConnected, distrelecConnected, cartResult, distrelecCartResult } = props;
  const addingToCart = cartResult?.kind === "loading";
  const addingToDistrelecCart = distrelecCartResult?.kind === "loading";

  return (
    <div className="selection-bar">
      <div className="selection-bar-top">
        <div className="selection-controls">
          <button type="button" className="link-btn" onClick={props.onSelectConfirmed}>
            Select all confirmed
          </button>
          <button type="button" className="link-btn" onClick={props.onSelectAll}>
            Select all
          </button>
          <button type="button" className="link-btn" onClick={props.onClear}>
            Clear
          </button>
        </div>
        <div className="selection-summary">
          <CartSummary summary={summary.DigiKey}>
            {digikeyConnected ? (
              <button
                type="button"
                className="cart-btn"
                disabled={summary.DigiKey.count === 0 || addingToCart}
                onClick={props.onAddToDigikeyCart}
              >
                Add to DigiKey cart
              </button>
            ) : (
              <button type="button" className="cart-btn cart-btn-connect" onClick={props.onConnectDigikey}>
                Connect DigiKey account
              </button>
            )}
          </CartSummary>
          <CartSummary summary={summary.Distrelec}>
            <button
              type="button"
              className="cart-btn"
              disabled={!distrelecConnected || summary.Distrelec.count === 0 || addingToDistrelecCart}
              title={distrelecConnected ? undefined : "No Distrelec session connected — run `npm run distrelec:login` on the server"}
              onClick={props.onAddToDistrelecCart}
            >
              Add to Distrelec cart
            </button>
          </CartSummary>
        </div>
      </div>
      {cartResult && (
        <div className="cart-result" role={cartResult.kind === "error" ? "alert" : "status"}>
          <CartResultMessage result={cartResult} />
        </div>
      )}
      {distrelecCartResult && (
        <div className="cart-result" role={distrelecCartResult.kind === "error" ? "alert" : "status"}>
          <DistrelecCartResultMessage result={distrelecCartResult} />
        </div>
      )}
    </div>
  );
}
