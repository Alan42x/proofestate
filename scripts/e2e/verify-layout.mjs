import fs from "fs";
import path from "path";
import { chromium } from "playwright-core";

const chromePath = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const url = process.env.LAYOUT_URL || "http://localhost:5173/";
const outputDir = process.env.LAYOUT_OUTPUT_DIR || "/private/tmp/proofestate-layout";

const viewports = [
  { name: "desktop-1366", width: 1366, height: 768 },
  { name: "desktop-1440", width: 1440, height: 900 },
  { name: "desktop-1512", width: 1512, height: 900 },
  { name: "wide-1728", width: 1728, height: 950 },
  { name: "metamask-1180", width: 1180, height: 900 },
  { name: "metamask-1024", width: 1024, height: 900 },
  { name: "metamask-900", width: 900, height: 900 }
];
const languages = ["en", "zh"];

fs.mkdirSync(outputDir, { recursive: true });

const browser = await chromium.launch({
  executablePath: chromePath,
  headless: true
});

const failures = [];

for (const viewport of viewports) {
  for (const language of languages) {
    const page = await browser.newPage({ viewport });
    await page.goto(url, { waitUntil: "domcontentloaded" });
    await page.evaluate((nextLanguage) => {
      window.localStorage.setItem("proofestate-lang", nextLanguage);
    }, language);
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForTimeout(700);

    const result = await page.evaluate(() => {
      const root = document.documentElement;
      const body = document.body;
      const navSpans = [...document.querySelectorAll(".nav-item span")].map((node) => {
        const rect = node.getBoundingClientRect();
        return {
          text: node.textContent || "",
          width: rect.width,
          height: rect.height
        };
      });
      const actions = [...document.querySelectorAll(".outline-action, .primary-action, .gold-action")].map((node) => {
        const rect = node.getBoundingClientRect();
        return {
          text: node.textContent?.trim() || "",
          left: rect.left,
          right: rect.right,
          top: rect.top,
          bottom: rect.bottom,
          width: rect.width,
          height: rect.height
        };
      });
      const sidebar = document.querySelector(".sidebar")?.getBoundingClientRect();
      const sidebarFullWidth = sidebar ? sidebar.width > window.innerWidth * 0.78 : false;

      return {
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
        scrollWidth: Math.max(root.scrollWidth, body.scrollWidth),
        sidebarFullWidth,
        verticalNav: navSpans.filter((item) => item.text.length > 1 && (item.width < 20 || item.height > 38)),
        clippedActions: actions.filter(
          (item) =>
            item.width < 80 ||
            item.height < 32 ||
            item.left < -1 ||
            item.right > window.innerWidth + 1
        )
      };
    });

    const screenshotPath = path.join(outputDir, `${viewport.name}-${language}.png`);
    await page.screenshot({ path: screenshotPath, fullPage: true });
    await page.close();

    const overflow = result.scrollWidth > result.viewportWidth + 1;
    const desktopSidebarCollapsed = result.viewportWidth >= 900 && result.sidebarFullWidth;
    if (overflow || desktopSidebarCollapsed || result.verticalNav.length || result.clippedActions.length) {
      failures.push({
        viewport: `${viewport.name}-${language}`,
        overflow,
        desktopSidebarCollapsed,
        scrollWidth: result.scrollWidth,
        viewportWidth: result.viewportWidth,
        verticalNav: result.verticalNav,
        clippedActions: result.clippedActions
      });
    }

    console.log(
      `${viewport.name}-${language}: ${result.viewportWidth}x${result.viewportHeight}, scrollWidth=${result.scrollWidth}, screenshot=${screenshotPath}`
    );
  }
}

await browser.close();

if (failures.length) {
  console.error(JSON.stringify(failures, null, 2));
  process.exit(1);
}

console.log("Layout checks passed: no horizontal overflow, vertical nav text, or clipped action buttons.");
