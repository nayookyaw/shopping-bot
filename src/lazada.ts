import type { Locator, Page } from "playwright";
import type { BotConfig } from "./config.js";
import { assertExpectedText, assertPriceLimit, parsePrice } from "./safety.js";

async function firstVisible(locators: Locator[], description: string): Promise<Locator> {
  for (const locator of locators) {
    const first = locator.first();
    if (await first.isVisible().catch(() => false)) return first;
  }
  throw new Error(`Could not find ${description}. Lazada may have changed its page or requires manual login.`);
}

async function clickText(page: Page, text: string): Promise<void> {
  const exact = page.getByText(text, { exact: true });
  const candidate = await firstVisible(
    [exact, page.getByRole("button", { name: text, exact: true }), page.locator(`[title="${text.replaceAll('"', '\\"')}"]`)],
    `variation option "${text}"`,
  );
  await candidate.click();
}

async function setQuantity(page: Page, quantity: number): Promise<void> {
  if (quantity === 1) return;

  const input = page.locator('input[type="number"], input[class*="quantity" i]').first();
  if (await input.isVisible().catch(() => false)) {
    await input.fill(String(quantity));
    await input.blur();
    return;
  }

  const plus = await firstVisible(
    [page.getByRole("button", { name: /increase|plus|add/i }), page.locator('[class*="quantity"] button').last()],
    "quantity increase control",
  );
  for (let current = 1; current < quantity; current += 1) await plus.click();
}

export interface ProductSummary {
  title: string;
  seller: string;
  unitPrice: number;
  finalUrl: string;
}

export async function prepareProduct(page: Page, config: BotConfig): Promise<ProductSummary> {
  await page.goto(config.productUrl, { waitUntil: "domcontentloaded", timeout: config.navigationTimeoutMs });
  await page.waitForLoadState("networkidle", { timeout: 10_000 }).catch(() => undefined);

  const titleElement = await firstVisible(
    [page.locator("h1"), page.locator('[class*="pdp-mod-product-badge-title"]')],
    "product title",
  );
  const title = (await titleElement.innerText()).trim();
  assertExpectedText(title, config.expectedTitleContains, "Product title");

  const sellerElement = page.locator('[class*="seller-name" i], [class*="seller-link" i]').first();
  const seller = (await sellerElement.isVisible().catch(() => false))
    ? (await sellerElement.innerText()).trim()
    : "Unknown seller";
  if (config.expectedSellerContains) assertExpectedText(seller, config.expectedSellerContains, "Seller");

  for (const [variationName, option] of Object.entries(config.variations)) {
    console.log(`Selecting ${variationName}: ${option}`);
    await clickText(page, option);
  }

  const priceElement = await firstVisible(
    [
      page.locator('[class*="pdp-price_type_normal"]'),
      page.locator('[class*="pdp-price"]'),
      page.locator('[class*="price"]'),
    ],
    "current product price",
  );
  const unitPrice = parsePrice(await priceElement.innerText());
  assertPriceLimit(unitPrice, config.maximumUnitPrice);
  await setQuantity(page, config.quantity);

  return { title, seller, unitPrice, finalUrl: page.url() };
}

export async function addToCart(page: Page): Promise<void> {
  const button = await firstVisible(
    [page.getByRole("button", { name: /add to cart/i }), page.getByText("Add to Cart", { exact: true })],
    "Add to Cart button",
  );
  if (await button.isDisabled()) throw new Error("Product or selected variation is unavailable.");
  await button.click();
  await page.waitForTimeout(1_000);
}

export async function isAvailableForPurchase(page: Page): Promise<boolean> {
  const candidates = [
    page.getByRole("button", { name: /buy now/i }),
    page.getByRole("button", { name: /add to cart/i }),
  ];
  for (const candidate of candidates) {
    const button = candidate.first();
    if (await button.isVisible().catch(() => false) && !await button.isDisabled().catch(() => true)) return true;
  }
  return false;
}

export async function buyNow(page: Page): Promise<void> {
  const button = await firstVisible(
    [page.getByRole("button", { name: /buy now/i }), page.getByText("Buy Now", { exact: true })],
    "Buy Now button",
  );
  if (await button.isDisabled()) throw new Error("Product or selected variation is unavailable.");
  await button.click();
  await page.waitForLoadState("domcontentloaded").catch(() => undefined);
}

export async function placeValidatedOrder(
  page: Page,
  expectedTitle: string,
  expectedQuantity: number,
  maximumOrderTotal: number,
): Promise<number> {
  const bodyText = await page.locator("body").innerText();
  assertExpectedText(bodyText, expectedTitle, "Checkout product");

  const quantityEvidence = [
    `Qty: ${expectedQuantity}`,
    `Qty ${expectedQuantity}`,
    `Quantity: ${expectedQuantity}`,
    `x${expectedQuantity}`,
  ];
  if (!quantityEvidence.some((text) => bodyText.toLocaleLowerCase().includes(text.toLocaleLowerCase()))) {
    throw new Error(`Safety stop: could not verify checkout quantity ${expectedQuantity}.`);
  }

  const totalElement = await firstVisible(
    [
      page.locator('[class*="checkout-order-total" i]'),
      page.locator('[class*="grand-total" i]'),
      page.locator('[class*="order-total" i]'),
      page.getByText(/total/i).locator("xpath=following::*[contains(text(), '$')][1]"),
    ],
    "checkout order total",
  );
  const orderTotal = parsePrice(await totalElement.innerText());
  if (orderTotal > maximumOrderTotal) {
    throw new Error(
      `Safety stop: final order total S$${orderTotal.toFixed(2)} exceeds S$${maximumOrderTotal.toFixed(2)}.`,
    );
  }

  const placeOrder = await firstVisible(
    [
      page.getByRole("button", { name: /^place order$/i }),
      page.getByRole("button", { name: /^pay now$/i }),
      page.getByText(/^place order$/i),
    ],
    "Place Order button",
  );
  if (await placeOrder.isDisabled()) throw new Error("Place Order is disabled; payment or delivery details may be incomplete.");
  await placeOrder.click();
  return orderTotal;
}

export async function prepareCheckout(page: Page): Promise<void> {
  const cartLink = await firstVisible(
    [page.getByRole("link", { name: /cart/i }), page.locator('a[href*="/cart"]')],
    "cart link",
  );
  await cartLink.click();
  await page.waitForLoadState("domcontentloaded");

  const checkout = await firstVisible(
    [page.getByRole("button", { name: /check\s*out/i }), page.getByText(/check\s*out/i)],
    "checkout button",
  );
  await checkout.click();
  await page.waitForLoadState("domcontentloaded").catch(() => undefined);
}
