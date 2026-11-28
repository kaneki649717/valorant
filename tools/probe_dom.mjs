import { chromium } from "playwright";
const URL = process.argv[2] || "http://localhost:8599";
const browser = await chromium.launch({
  executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  headless: true,
});
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
page.on("pageerror", (e) => console.log("[pageerror]", e.message));
page.on("console", (m) => { if (m.type() === "error") console.log("[console.error]", m.text()); });
await page.goto(URL, { waitUntil: "domcontentloaded", timeout: 60000 });
await page.waitForTimeout(10000);
const frames = page.frames().map((f) => f.url());
console.log("frames:", JSON.stringify(frames, null, 2));
const iframes = await page.evaluate(() =>
  Array.from(document.querySelectorAll("iframe")).map((f) => ({
    title: f.title, src: f.src, id: f.id, name: f.name, cls: f.className,
  }))
);
console.log("iframes:", JSON.stringify(iframes, null, 2));
const bodyText = await page.evaluate(() => document.body.innerText.slice(0, 600));
console.log("bodyText:", bodyText);
await page.screenshot({ path: "C:\\Users\\1\\Desktop\\valorant-github-sync\\tools\\probe.png", fullPage: true });
await browser.close();
