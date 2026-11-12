import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { measureConservativeContrast } from './contrast-pixel-evidence.mjs';

test('rendered gradient contrast uses a conservative pixel bound and refuses mixed or transparent groups',async()=>{
  const browser=await chromium.launch({executablePath:process.env.CHROMIUM_EXECUTABLE||undefined,headless:true,args:['--no-sandbox']});
  try {
    const page=await browser.newPage();
    await page.setContent('<style>p{color:white;background:linear-gradient(90deg,#111,#333);padding:10px;font:16px Arial}#bad{background:linear-gradient(90deg,#111,white)}</style><p id="good">Texto branco</p><p id="bad">Texto branco</p><p id="mixed">Texto <span style="color:yellow">diferente</span></p><div style="opacity:.5"><p id="group">Grupo transparente</p></div>');
    const good=await measureConservativeContrast(page,'#good');
    assert.equal(good.status,'CONSERVATIVE_BOUND_PASSES');
    assert.ok(good.minimumRatio>12);
    assert.equal(await page.locator('#good').evaluate(el=>el.style.webkitTextFillColor),'','temporary text mask must be restored');
    assert.equal((await measureConservativeContrast(page,'#bad')).status,'REQUIRES_MANUAL_REVIEW');
    assert.equal((await measureConservativeContrast(page,'#mixed')).status,'UNSUPPORTED_COMPOSITING');
    assert.equal((await measureConservativeContrast(page,'#group')).status,'UNSUPPORTED_COMPOSITING');
  } finally { await browser.close(); }
});
