import { chromium } from 'playwright';

const url = 'http://192.168.1.10:8090/film/matrix';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1365, height: 768 } });
await page.goto(url, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(1200);

const info = await page.evaluate(() => {
  const nav = document.querySelector('.menu-pill');
  const films = nav?.querySelectorAll('a')[1];
  const rect = films?.getBoundingClientRect();
  const cx = rect ? rect.left + rect.width / 2 : 0;
  const cy = rect ? rect.top + rect.height / 2 : 0;
  const topEl = rect ? document.elementFromPoint(cx, cy) : null;
  return {
    filmsRect: rect ? { left: rect.left, top: rect.top, width: rect.width, height: rect.height } : null,
    topEl: topEl ? {
      tag: topEl.tagName,
      cls: topEl.className,
      id: topEl.id
    } : null,
    topElPath: topEl ? (() => {
      const arr = [];
      let n = topEl;
      for (let i = 0; i < 6 && n; i++) {
        arr.push(`${n.tagName.toLowerCase()}#${n.id || ''}.${(n.className || '').toString().replace(/\s+/g,'.')}`);
        n = n.parentElement;
      }
      return arr;
    })() : []
  };
});

console.log(JSON.stringify(info, null, 2));

const before = page.url();
await page.locator('.menu-pill a', { hasText: 'Séries' }).click({ timeout: 3000 });
await page.waitForTimeout(1200);
const after = page.url();
console.log('before=', before);
console.log('after=', after);

await browser.close();
