import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  
  // Capture console messages
  page.on('console', msg => {
    const type = msg.type();
    const text = msg.text();
    console.log(`[BROWSER ${type.toUpperCase()}]`, text);
  });
  
  // Capture page errors
  page.on('pageerror', error => {
    console.error('[PAGE ERROR]', error.message);
    console.error('[PAGE ERROR STACK]', error.stack);
  });
  
  try {
    console.log('Navigating to http://localhost:5173...');
    await page.goto('http://localhost:5173', { waitUntil: 'networkidle', timeout: 10000 });
    
    // Wait a bit for React to render
    await page.waitForTimeout(2000);
    
    // Check if root has content
    const rootContent = await page.$eval('#root', el => el.innerHTML);
    console.log('\n[ROOT CONTENT LENGTH]', rootContent.length, 'characters');
    
    if (rootContent.length === 0) {
      console.log('\n❌ ROOT IS EMPTY - React did not render!');
    } else {
      console.log('\n✓ ROOT HAS CONTENT - React rendered successfully!');
    }
    
    // Take a screenshot
    await page.screenshot({ path: '/tmp/frontend-screenshot.png', fullPage: true });
    console.log('\n📸 Screenshot saved to /tmp/frontend-screenshot.png');
    
  } catch (error) {
    console.error('\n[TEST ERROR]', error.message);
  } finally {
    await browser.close();
  }
})();
