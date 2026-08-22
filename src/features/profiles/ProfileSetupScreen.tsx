// docs/09_ui_specification.md, Core Screening App UI section, §22.

import { useState, type FormEvent } from "react";
import type { IntendedMarket, ScreeningProfile } from "../../engine/types";

const MARKET_OPTIONS: { value: IntendedMarket; label: string }[] = [
  { value: "malaysia", label: "Malaysia (JAKIM)" },
  { value: "indonesia", label: "Indonesia (BPJPH)" },
];

const PRODUCT_TYPE_OPTIONS = ["Cosmetic — skincare", "Cosmetic — personal care"];

interface ProfileSetupScreenProps {
  onCreate: (profile: ScreeningProfile) => void;
}

export function ProfileSetupScreen({ onCreate }: ProfileSetupScreenProps) {
  const [intendedMarket, setIntendedMarket] = useState<IntendedMarket | "">("");
  const [productType, setProductType] = useState("");

  const canStart = intendedMarket !== "" && productType !== "";

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!canStart) return;

    onCreate({
      profileId: crypto.randomUUID(),
      intendedMarket: intendedMarket as IntendedMarket,
      productType,
      createdAt: new Date().toISOString(),
    });
  }

  return (
    <section className="screen">
      <h1>Start a screening profile</h1>
      <p className="disclaimer">
        This is a screening opinion, not a certification, and not a religious ruling.
      </p>

      <form onSubmit={handleSubmit}>
        <label htmlFor="intended-market">
          Intended Market
          <select
            id="intended-market"
            value={intendedMarket}
            onChange={(event) => setIntendedMarket(event.target.value as IntendedMarket)}
          >
            <option value="" disabled>
              Select a market
            </option>
            {MARKET_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <label htmlFor="product-type">
          Product Type
          <select
            id="product-type"
            value={productType}
            onChange={(event) => setProductType(event.target.value)}
          >
            <option value="" disabled>
              Select a product type
            </option>
            {PRODUCT_TYPE_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>

        <button type="submit" disabled={!canStart}>
          Start Screening
        </button>
      </form>
    </section>
  );
}
