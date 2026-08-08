import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import { z } from "zod";

const ConfigSchema = z.object({
  productUrl: z.string().url().refine(
    (url) => ["lazada.sg", "www.lazada.sg", "s.lazada.sg"].includes(new URL(url).hostname),
    "productUrl must use an official lazada.sg hostname",
  ),
  quantity: z.number().int().min(1).max(99).default(1),
  maximumUnitPrice: z.number().positive(),
  expectedTitleContains: z.string().min(1),
  expectedSellerContains: z.string().default(""),
  variations: z.record(z.string().min(1)).default({}),
  action: z.enum(["add-to-cart", "checkout-ready", "auto-purchase"]).default("add-to-cart"),
  requireFinalConfirmation: z.literal(true),
  navigationTimeoutMs: z.number().int().min(5_000).max(120_000).default(45_000),
  monitoring: z.object({
    pollIntervalMs: z.number().int().min(5_000).max(300_000).default(15_000),
    timeoutMinutes: z.number().int().min(1).max(1_440).default(120),
  }).default({}),
  maximumOrderTotal: z.number().positive().optional(),
  autoPurchaseAuthorization: z.string().optional(),
}).superRefine((config, context) => {
  if (config.action !== "auto-purchase") return;
  if (config.maximumOrderTotal === undefined) {
    context.addIssue({ code: "custom", path: ["maximumOrderTotal"], message: "Required for auto-purchase" });
  }
  if (config.autoPurchaseAuthorization !== "I AUTHORIZE ONE PURCHASE") {
    context.addIssue({
      code: "custom",
      path: ["autoPurchaseAuthorization"],
      message: 'Must exactly equal "I AUTHORIZE ONE PURCHASE" for auto-purchase',
    });
  }
});

export type BotConfig = z.infer<typeof ConfigSchema>;

export async function loadConfig(path: string): Promise<BotConfig> {
  let contents: string;
  try {
    contents = await readFile(path, "utf8");
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      throw new Error(
        `Configuration ${basename(path)} does not exist. Run: ` +
        "Copy-Item config/products.example.json config/products.json",
      );
    }
    throw error;
  }
  const raw: unknown = JSON.parse(contents);
  return ConfigSchema.parse(raw);
}
