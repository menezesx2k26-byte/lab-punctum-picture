import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp,rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { createZoomBrowser,readBrowserZoom,captureZoomViewport } from './browser-zoom-evidence.mjs';

test('disposable Chromium uses actual 200 percent browser zoom with no pinch or viewport override',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'punctum-zoom-test-'));
  const server=createServer((_,res)=>{res.setHeader('Content-Type','text/html');res.end('<!doctype html><html><body><h1>Zoom local</h1></body></html>');});
  let context;
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  try {
    context=await createZoomBrowser(chromium,directory,process.env.CHROMIUM_EXECUTABLE||undefined);
    const page=context.pages()[0];
    await page.goto('http://127.0.0.1:'+server.address().port);
    const evidence=await readBrowserZoom(page);
    assert.equal(evidence.zoom,2);
    assert.equal(evidence.visualScale,1,'pinch scaling must remain unchanged');
    assert.equal(evidence.outerWidth,1280);
    assert.ok(Math.abs(evidence.cssWidth-640)<=1);
    assert.equal(evidence.innerWidth,evidence.cssWidth);
    assert.ok(evidence.scrollWidth<=evidence.innerWidth);
    const screenshot=await captureZoomViewport(page);
    assert.equal(screenshot.readUInt32BE(16),1280,'capture must include the full native viewport, not its CSS-sized top-left crop');
    assert.ok(screenshot.readUInt32BE(20)>800);
  } finally {
    await context?.close();
    await new Promise(resolve=>server.close(resolve));
    await rm(directory,{recursive:true,force:true});
  }
});
