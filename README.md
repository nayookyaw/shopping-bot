# Lazada Stock Monitor and Auto-Purchase Bot

This Node.js bot opens Lazada in a visible Chromium browser, monitors one configured product, and can submit one order as soon as the selected item becomes available.

The bot validates the product title, optional seller, selected variation, quantity, unit price, and final order total before clicking **Place Order** or **Pay Now**. It never attempts to bypass CAPTCHA, OTP, login, bank verification, or other security controls.

> **Warning:** `auto-purchase` mode can place a real order and charge your saved payment method. Review every value in `config/products.json` before starting it.

## Requirements

- Windows PowerShell
- Node.js 20 or newer
- A Lazada Singapore account
- A saved delivery address and payment method for immediate checkout

Check Node.js and npm:

```powershell
node --version
npm --version
```

## 1. Open the project

```powershell
cd C:\DSSG\source-codes\personal\integration-cart
```

## 2. Install dependencies

Run these commands once:

```powershell
npm install
npx playwright install chromium
```

## 3. Create the runtime configuration

The real configuration is intentionally excluded from Git. Create it from the example:

```powershell
Copy-Item config\products.example.json config\products.json
notepad config\products.json
```

If PowerShell reports that `products.json` already exists, edit the existing file:

```powershell
notepad config\products.json
```

## 4. Configure the product

### Safe add-to-cart test

Use this mode first to confirm the product link, title, variations, and Lazada login:

```json
{
  "productUrl": "https://s.lazada.sg/s.4zp6d",
  "quantity": 1,
  "maximumUnitPrice": 10,
  "expectedTitleContains": "milk",
  "expectedSellerContains": "",
  "variations": {},
  "action": "add-to-cart",
  "requireFinalConfirmation": true,
  "navigationTimeoutMs": 45000,
  "monitoring": {
    "pollIntervalMs": 5000,
    "timeoutMinutes": 120
  }
}
```

Run it with `npm start`, sign in when the browser opens, and answer the terminal prompts. The `.browser-profile` directory keeps the login session locally for later runs.

### Monitor and automatically purchase

After confirming the product works, use a complete configuration like this:

```json
{
  "productUrl": "https://s.lazada.sg/s.4zp6d",
  "quantity": 1,
  "maximumUnitPrice": 10,
  "maximumOrderTotal": 15,
  "expectedTitleContains": "milk",
  "expectedSellerContains": "",
  "variations": {},
  "action": "auto-purchase",
  "requireFinalConfirmation": true,
  "autoPurchaseAuthorization": "I AUTHORIZE ONE PURCHASE",
  "navigationTimeoutMs": 45000,
  "monitoring": {
    "pollIntervalMs": 5000,
    "timeoutMinutes": 120
  }
}
```

Configuration fields:

| Field | Meaning |
| --- | --- |
| `productUrl` | Lazada product or official Lazada short URL. |
| `quantity` | Number of units to purchase. |
| `maximumUnitPrice` | Highest permitted price for one unit, in SGD. |
| `maximumOrderTotal` | Highest permitted checkout total, including delivery and other charges. Required for auto-purchase. |
| `expectedTitleContains` | Case-insensitive text that must appear in the product title. Use a distinctive phrase. |
| `expectedSellerContains` | Optional expected seller text. An empty string disables this check. |
| `variations` | Visible option values such as size, colour, or pack. Values must match Lazada's displayed text. |
| `action` | `add-to-cart`, `checkout-ready`, or `auto-purchase`. |
| `autoPurchaseAuthorization` | Must exactly equal `I AUTHORIZE ONE PURCHASE` to enable automatic ordering. |
| `pollIntervalMs` | Time between the start of monitoring checks. `5000` means five seconds. |
| `timeoutMinutes` | Maximum monitoring duration. `120` means two hours; the allowed maximum is `1440` minutes. |

Example variation configuration:

```json
"variations": {
  "Pack size": "946ML",
  "Colour": "Blue"
}
```

Use `{}` if the item has no options.

## 5. Start monitoring

```powershell
npm start
```

Keep the PowerShell terminal and Chromium browser open. A five-second monitor displays output similar to:

```text
Auto-purchase armed for one order. Polling every 5s for up to 120 minutes.
Monitoring started at 09/08/2026, 5:00:00 am.

[5:00:00 am] Check #1 started
[5:00:01 am] Check #1 result: unavailable
Check #1 finished in 1.2s. Next check starts at approximately 5:00:05 am (waiting 3.8s).

[5:00:05 am] Check #2 started
```

When the item becomes available, the bot logs the match, opens checkout, validates the order, and clicks the final order button once:

```text
[5:02:10 am] Check #27 result: AVAILABLE
Product: Magnolia Fresh Milk at S$3.63
Order submission clicked once. Validated total: S$5.62.
```

Check the browser after submission for confirmation or any payment challenge.

## How the auto-purchase flow works

1. Open or refresh the configured product page.
2. Verify the product title and optional seller.
3. Select the configured variations and quantity.
4. Verify availability and the unit-price ceiling.
5. Use **Buy Now** to avoid intentionally purchasing unrelated cart items.
6. Verify the product, quantity, and final order-total ceiling at checkout.
7. Click **Place Order** or **Pay Now** once.
8. Stop monitoring immediately.

## Stop or restart the bot

Press `Ctrl+C` in PowerShell to stop monitoring.

After changing `config/products.json`, stop and restart the bot:

```powershell
npm start
```

The configuration is read only at startup. Editing it while the bot is running does not change the active limits.

## Run with another configuration

```powershell
npm start -- config\another-product.json
```

Each file can contain a different product and safety limits. Run only one instance per product/account unless you have deliberately considered duplicate-order risks.

## Validation

Run the compiler and tests after modifying the code:

```powershell
npm run check
npm test
```

## Troubleshooting

### `ENOENT: no such file or directory ... products.json`

Create the runtime file:

```powershell
Copy-Item config\products.example.json config\products.json
```

### Monitoring logs do not appear

Verify that the active `config/products.json` contains:

```json
"action": "auto-purchase"
```

Also ensure `maximumOrderTotal` and the exact authorization phrase are present. Stop the current process with `Ctrl+C` and run `npm start` again.

### `Could not find product title`

Look at the opened browser. Lazada may be showing login, CAPTCHA, account verification, a cookie popup, an expired short link, or a different regional page. Complete permitted manual steps, then restart the bot. If the product page is open normally but the error remains, Lazada may have changed its page markup and `src/lazada.ts` will need updated selectors.

### The product is available but the bot reports unavailable

- Confirm that the selected variation is actually in stock.
- Confirm the visible option text exactly matches `variations`.
- Confirm that `maximumUnitPrice` is high enough.
- Review the terminal for a safety error rather than an availability result.

### The final order is not submitted

The bot stops when the product identity, quantity, unit price, or final total cannot be verified. It also cannot complete CAPTCHA, OTP, 3-D Secure, missing delivery information, or payment verification. Review the browser and terminal message.

### Five-second checks are slower than expected

The interval is measured between the start of checks. If a Lazada page load itself takes longer than five seconds, checks cannot overlap; the bot logs the delay and starts the next one immediately. Frequent checks may cause Lazada to rate-limit the session or request verification.

## Security and operational notes

- Never store Lazada passwords, card numbers, OTPs, or exported cookies in this project.
- `.browser-profile/` and `config/products.json` are ignored by Git.
- Do not share the local browser profile; it contains authenticated session data.
- The bot does not bypass anti-bot or account-security measures.
- Review Lazada's current terms and use the bot responsibly.
- Product pages and checkout markup can change, so test with `add-to-cart` before relying on auto-purchase.
