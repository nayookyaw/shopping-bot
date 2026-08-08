import { describe, expect, it } from "vitest";
import { assertExpectedText, assertPriceLimit, parsePrice } from "../src/safety.js";
import { loadConfig } from "../src/config.js";
import { writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

describe("parsePrice", () => {
  it("parses Singapore-dollar prices", () => {
    expect(parsePrice("S$3.63")).toBe(3.63);
    expect(parsePrice("SGD 1,299.00")).toBe(1299);
  });

  it("uses the lowest displayed price", () => {
    expect(parsePrice("S$8.00 - S$12.00")).toBe(8);
  });

  it("rejects text without a currency price", () => {
    expect(() => parsePrice("Unavailable")).toThrow(/Could not identify/);
  });
});

describe("auto-purchase configuration", () => {
  it("requires explicit authorization and a total cap", async () => {
    const path = join(tmpdir(), `lazada-config-${process.pid}.json`);
    await writeFile(path, JSON.stringify({
      productUrl: "https://www.lazada.sg/products/example.html",
      quantity: 1,
      maximumUnitPrice: 10,
      expectedTitleContains: "example",
      action: "auto-purchase",
      requireFinalConfirmation: true
    }));
    await expect(loadConfig(path)).rejects.toThrow(/maximumOrderTotal|autoPurchaseAuthorization/);
    await rm(path, { force: true });
  });
});

describe("safety assertions", () => {
  it("matches expected text without case sensitivity", () => {
    expect(() => assertExpectedText("Magnolia Fresh Milk", "fresh milk", "title")).not.toThrow();
  });

  it("stops when the price is over the cap", () => {
    expect(() => assertPriceLimit(10.01, 10)).toThrow(/Safety stop/);
  });
});
