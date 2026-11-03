const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto('http://localhost:5173');
  await page.click('button[aria-label="Профиль"]');
  await page.waitForTimeout(500);
  await page.click('text=Зарегистрироваться');
  await page.fill('input[placeholder="Введите email"]', 'testuser2@test.com');
  await page.fill('input[placeholder="Введите имя пользователя"]', 'testuser2');
  await page.fill('input[placeholder="Введите пароль"]', 'TestPass123');
  // Fill confirm password - find the second password field
  const inputs = await page.$$('form input');
  console.log('Input types:', inputs.map(i => i.inputValue()));
  await inputs[3].fill('TestPass123');
  console.log('Confirm value:', await inputs[3].inputValue());
  await inputs[3].dispatchEvent('input');
  await inputs[3].dispatchEvent('change');
  await page.click('form button[type="submit"]');
  await page.waitForTimeout(3000);
  // Check localStorage
  const storeData = await page.evaluate(() => JSON.parse(localStorage.getItem('pc-builder-account') || '{}'));
  console.log('activeAccountId:', storeData.state?.activeAccountId ? 'SET' : 'null');
  console.log('accounts count:', Object.keys(storeData.state?.accounts || {}).length);
  await browser.close();
})();
