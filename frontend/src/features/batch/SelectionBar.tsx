import type { ReactNode } from "react";
import type { SelectionSummary, SupplierSelectionSummary } from "../../lib/selection";
import { formatSubtotal } from "../../lib/format";

export type CartResult = { kind: "loading" } | { kind: "ok"; added: number } | { kind: "error"; message: string };

interface SelectionBarProps {
  summary: SelectionSummary;
  digikeyConnected: boolean;
  cartResult: CartResult | null;
  onSelectConfirmed: () => void;
  onSelectAll: () => void;
  onClear: () => void;
  onConnectDigikey: () => void;
  onAddToDigikeyCart: () => void;
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

export function SelectionBar(props: SelectionBarProps) {
  const { summary, digikeyConnected, cartResult } = props;
  const addingToCart = cartResult?.kind === "loading";

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
            <button type="button" className="cart-btn" disabled title="Not built yet — needs a connected Distrelec account">
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
    </div>
  );
}
