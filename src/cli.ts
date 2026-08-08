import { resolve } from "node:path";
import { chromium } from "playwright";
import { loadConfig } from "./config.js";
import { addToCart, buyNow, isAvailableForPurchase, placeValidatedOrder, prepareCheckout, prepareProduct } from "./lazada.js";
import { confirm, waitForUser } from "./prompts.js";

async function main(): Promise<void> {
  const configPath = resolve(process.argv[2] ?? "config/products.json");
  const config = await loadConfig(configPath);
  const profilePath = resolve(".browser-profile");

  console.log(`Loading configuration: ${configPath}`);
  console.log("A visible Chromium window will open. Complete login or verification manually.");

  const context = await chromium.launchPersistentContext(profilePath, {
    headless: false,
    viewport: { width: 1440, height: 900 },
    locale: "en-SG",
  });

  try {
    const page = context.pages()[0] ?? await context.newPage();
    if (config.action === "auto-purchase") {
      const deadline = Date.now() + config.monitoring.timeoutMinutes * 60_000;
      let attempt = 0;
      console.log(
        `Auto-purchase armed for one order. Polling every ${config.monitoring.pollIntervalMs / 1000}s ` +
        `for up to ${config.monitoring.timeoutMinutes} minutes.`,
      );
      console.log(`Monitoring started at ${new Date().toLocaleString()}. Keep this terminal and browser open.`);

      while (Date.now() < deadline) {
        attempt += 1;
        const attemptStartedAt = Date.now();
        console.log(
          `\n[${new Date(attemptStartedAt).toLocaleTimeString()}] Check #${attempt} started ` +
          `(URL: ${config.productUrl})`,
        );
        try {
          const summary = await prepareProduct(page, config);
          if (!await isAvailableForPurchase(page)) {
            console.log(`[${new Date().toLocaleTimeString()}] Check #${attempt} result: unavailable`);
          } else {
            console.log(`[${new Date().toLocaleTimeString()}] Check #${attempt} result: AVAILABLE`);
            console.log(`Product: ${summary.title} at S$${summary.unitPrice.toFixed(2)}`);
            await buyNow(page);
            const total = await placeValidatedOrder(
              page,
              config.expectedTitleContains,
              config.quantity,
              config.maximumOrderTotal!,
            );
            console.log(`Order submission clicked once. Validated total: S$${total.toFixed(2)}.`);
            await waitForUser("Check the browser for the Lazada order result or any payment challenge.");
            return;
          }
        } catch (error: unknown) {
          const message = error instanceof Error ? error.message : String(error);
          const url = page.url().toLocaleLowerCase();
          if (/captcha|login|verify|security/.test(url) || /captcha|verification|log in|sign in/i.test(message)) {
            throw new Error(`Manual account verification is required. Auto-purchase stopped. ${message}`);
          }
          console.log(`[${new Date().toLocaleTimeString()}] Check #${attempt} result: ERROR - ${message}`);
        }
        const durationMs = Date.now() - attemptStartedAt;
        const waitMs = Math.max(0, config.monitoring.pollIntervalMs - durationMs);
        const nextCheck = new Date(Date.now() + waitMs);
        console.log(
          `Check #${attempt} finished in ${(durationMs / 1000).toFixed(1)}s. ` +
          `Next check starts at approximately ${nextCheck.toLocaleTimeString()} ` +
          `(waiting ${(waitMs / 1000).toFixed(1)}s).`,
        );
        if (waitMs === 0) {
          console.log("The check took longer than the configured interval; starting the next check immediately.");
        }
        await page.waitForTimeout(waitMs);
      }
      throw new Error("Monitoring timeout reached without placing an order.");
    }

    const summary = await prepareProduct(page, config).catch(async (error: unknown) => {
      console.error(error instanceof Error ? error.message : error);
      await waitForUser("If Lazada is asking you to log in, verify your account, or dismiss a popup, do that now.");
      return prepareProduct(page, config);
    });

    console.log("\nValidated product");
    console.log(`  Title: ${summary.title}`);
    console.log(`  Seller: ${summary.seller}`);
    console.log(`  Unit price: S$${summary.unitPrice.toFixed(2)}`);
    console.log(`  Quantity: ${config.quantity}`);
    console.log(`  URL: ${summary.finalUrl}`);

    if (!await confirm("Add this item to your Lazada cart?")) {
      console.log("Cancelled without changing the cart.");
      return;
    }
    await addToCart(page);
    console.log("Item added to cart.");

    if (config.action === "checkout-ready") {
      if (!await confirm("Open checkout and prepare the order summary?")) {
        console.log("Stopped with the item in the cart.");
        return;
      }
      await prepareCheckout(page);
      console.log("Checkout is ready. Review shipping, vouchers, quantity, seller, and total in the browser.");
    }

    await waitForUser("The bot will not click Place Order. Complete or close the purchase manually.");
  } finally {
    await context.close();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
