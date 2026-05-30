import { chromium } from "playwright-core";

const chromePath = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const url = process.env.E2E_URL || "http://localhost:5173/";

const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || chromePath,
  headless: true
});

try {
  const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".wallet-gate", { timeout: 5000 });

  const hasDashboardNav = await page.locator('[aria-label="Dashboard navigation"]').count();
  if (hasDashboardNav !== 0) {
    throw new Error("Disconnected users should not see the dashboard navigation.");
  }

  const connectButton = page.getByRole("button", { name: /connect wallet|连接钱包/i });
  await connectButton.waitFor({ timeout: 5000 });

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  if (overflow) {
    throw new Error("Wallet gate has horizontal overflow.");
  }

  console.log(`Wallet gate smoke passed at ${url}`);
} finally {
  await browser.close();
}
