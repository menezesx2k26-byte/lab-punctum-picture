import { mkdir,writeFile } from 'node:fs/promises';
import { join } from 'node:path';

/** Dedicated disposable profile; never opens the user's browser profile. */
export async function createZoomBrowser(chromium, directory, executablePath) {
  await mkdir(directory,{recursive:true});
  await mkdir(join(directory,'Default'));
  // Chromium HostZoomMap's default storage partition key is 'x'. Setting its
  // browser preference applies real page zoom, unlike a CSS zoom, a smaller
  // emulated viewport or CDP pinch scaling. Verify it via Page.getLayoutMetrics.
  // https://chromium.googlesource.com/chromium/src/+/HEAD/chrome/browser/profiles/host_zoom_map_browsertest.cc
  await writeFile(join(directory,'Default','Preferences'),JSON.stringify({
    partition:{default_zoom_level:{x:Math.log(2)/Math.log(1.2)}},
  }),{flag:'wx'});
  return chromium.launchPersistentContext(directory,{
    executablePath,headless:true,viewport:null,reducedMotion:'reduce',
    args:['--no-sandbox','--disable-dev-shm-usage','--window-size=1280,900'],
  });
}

export async function readBrowserZoom(page) {
  const session=await page.context().newCDPSession(page);
  try {
    const metrics=await session.send('Page.getLayoutMetrics');
    const dom=await page.evaluate(()=>({innerWidth,outerWidth,devicePixelRatio,
      visualScale:visualViewport.scale,scrollWidth:document.documentElement.scrollWidth}));
    return {zoom:metrics.cssVisualViewport.zoom,cssWidth:metrics.cssLayoutViewport.clientWidth,
      cssHeight:metrics.cssLayoutViewport.clientHeight,...dom};
  } finally { await session.detach(); }
}
