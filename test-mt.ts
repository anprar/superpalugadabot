import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch({
    headless: true
  });
  const page = await browser.newPage();
  await page.goto('https://mailticking.com', { waitUntil: 'domcontentloaded' });
  
  await page.waitForTimeout(5000);
  
  const activeMail = await page.evaluate(() => {
    return {
      email: document.querySelector('#active-mail')?.value,
      code: document.querySelector('#active-mail')?.getAttribute('data-code')
    };
  });
  console.log("Active mail:", activeMail);
  
  const payload = await page.evaluate(async (mail) => {
    const res = await fetch('/get-emails?lang=en', {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify(mail)
    });
    return res.text();
  }, activeMail);
  
  console.log("Payload:", payload);
  await browser.close();
})();
