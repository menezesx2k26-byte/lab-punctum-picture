import { writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

/** A sufficient pixel bound, never an automatic failure or full WCAG signoff.
 * Scan the WHOLE background rectangle, including pixels outside glyphs. This
 * can underestimate contrast, so a low bound requires manual review.
 * Mixed text colors, opacity groups and unsupported compositing fail closed.
 */
export async function measureConservativeContrast(page,selector,capturePath) {
  const locator=page.locator(selector);
  if(await locator.count()!==1)return {status:'UNSUPPORTED_COMPOSITING',reason:'selector is not unique'};
  await locator.scrollIntoViewIfNeeded();
  await page.evaluate(()=>document.fonts.ready);
  const inspect=root=>{
    const nodes=[];
    const rect=root.getBoundingClientRect();
    const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);
    let text;
    while((text=walker.nextNode())){
      if(text.textContent.trim()&&text.parentElement){
        const range=document.createRange();range.selectNodeContents(text);
        if([...range.getClientRects()].some(box=>box.left<rect.left-.5||box.top<rect.top-.5||
          box.right>rect.right+.5||box.bottom>rect.bottom+.5))return {reason:'text paints outside capture box'};
        nodes.push(text.parentElement);
      }
    }
    if(!nodes.length)return {reason:'no text'};
    const parents=[...new Set(nodes)];
    if(parents.some(el=>el.namespaceURI!=='http://www.w3.org/1999/xhtml'))return {reason:'non-HTML text paint'};
    const base=getComputedStyle(parents[0]);
    const color=base.color;
    for(const node of parents){
      const computed=getComputedStyle(node);
      if(computed.color!==color||computed.webkitTextFillColor!==color||parseFloat(computed.webkitTextStrokeWidth)>0)
        return {reason:'mixed or stroked text'};
      for(let el=node;el;el=el.parentElement){
        const s=getComputedStyle(el);
        if(s.opacity!=='1'||s.mixBlendMode!=='normal'||s.filter!=='none'||s.backdropFilter!=='none'||
          s.backgroundClip==='text'||s.transform!=='none'||s.maskImage!=='none'||
          s.webkitMaskImage!=='none'||s.clipPath!=='none'||s.clip!=='auto'||s.webkitBoxReflect!=='none')
          return {reason:'opacity, blend, filter, mask, reflection, transform or text clipping'};
        if(el.getAnimations().some(a=>a.playState==='running'))return {reason:'active ancestor animation'};
        const box=el.getBoundingClientRect();
        if((s.overflowX!=='visible'&&(rect.left<box.left-.5||rect.right>box.right+.5))||
          (s.overflowY!=='visible'&&(rect.top<box.top-.5||rect.bottom>box.bottom+.5)))
          return {reason:'ancestor clips capture box'};
        for(const pseudo of ['::before','::after']){
          const content=getComputedStyle(el,pseudo).content;
          if(!['none','normal','""','\'\''].includes(content))return {reason:'textual pseudo content'};
        }
      }
    }
    if(rect.width*rect.height>1000000)return {reason:'capture exceeds pixel budget'};
    if(root.getAnimations({subtree:true}).some(a=>a.playState==='running'))return {reason:'active animation'};
    const sizes=parents.map(el=>{
      const s=getComputedStyle(el);
      return {size:parseFloat(s.fontSize),weight:parseInt(s.fontWeight,10)};
    });
    const captureBox={x:rect.left+scrollX,y:rect.top+scrollY,width:rect.width,height:rect.height};
    if(devicePixelRatio!==1||visualViewport.scale!==1||captureBox.x<0||captureBox.y<0||rect.width<=0||rect.height<=0)
      return {reason:'noncanonical capture metrics'};
    return {color,captureBox,threshold:sizes.every(s=>s.size>=24||(s.size>=18.6667&&s.weight>=700))?3:4.5};
  };
  const style=await locator.evaluate(inspect);
  if(style.reason)return {status:'UNSUPPORTED_COMPOSITING',...style};
  // Hold only temporary inline style values in the page. Restore priorities
  // and missing properties exactly, even if screenshot or decoding fails.
  const saved=await locator.evaluate(root=>{
    const parents=new Set();const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);let text;
    while((text=walker.nextNode()))if(text.textContent.trim())parents.add(text.parentElement);
    return [...parents].map(el=>{
      const index=[root,...root.querySelectorAll('*')].indexOf(el);
      const values=['-webkit-text-fill-color','text-shadow','text-decoration-color'].map(key=>
        ({key,value:el.style.getPropertyValue(key),priority:el.style.getPropertyPriority(key)}));
      for(const {key} of values)el.style.setProperty(key,key==='text-shadow'?'none':'transparent','important');
      return {index,values};
    });
  });
  let screenshot;
  try {
    const session=await page.context().newCDPSession(page);
    try {
      // Capture the inspected rectangle directly. Locator screenshot's scroll/
      // animation stabilization can alter ancestor layout after inspection.
      const captured=await session.send('Page.captureScreenshot',{format:'png',fromSurface:true,
        captureBeyondViewport:true,clip:{...style.captureBox,scale:1}});
      screenshot=Buffer.from(captured.data,'base64');
    } finally {await session.detach();}
  }
  finally {
    await locator.evaluate((root,entries)=>{
      const elements=[root,...root.querySelectorAll('*')];
      for(const entry of entries)for(const {key,value,priority} of entry.values){
        if(value)elements[entry.index].style.setProperty(key,value,priority);
        else elements[entry.index].style.removeProperty(key);
      }
    },saved);
  }
  const after=await locator.evaluate(inspect);
  if(JSON.stringify(after)!==JSON.stringify(style))
    return {status:'UNSUPPORTED_COMPOSITING',reason:'paint or geometry changed during capture'};
  if(capturePath)await writeFile(capturePath,screenshot);
  const measured=await page.evaluate(async({base64,color})=>{
    const numbers=color.match(/[\d.]+/g)?.map(Number);
    if(!/^rgba?\(/.test(color)||!numbers||numbers.length<3)return null;
    const alpha=numbers[3]??1;
    const bytes=Uint8Array.from(atob(base64),c=>c.charCodeAt(0));
    const bitmap=await createImageBitmap(new Blob([bytes],{type:'image/png'}));
    try {
      if(bitmap.width*bitmap.height>1000000)return null;
      const canvas=new OffscreenCanvas(bitmap.width,bitmap.height);
      const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.drawImage(bitmap,0,0);
      const pixels=ctx.getImageData(0,0,bitmap.width,bitmap.height).data;
      const linear=x=>{x/=255;return x<=.04045?x/12.92:((x+.055)/1.055)**2.4;};
      const lum=c=>.2126*linear(c[0])+.7152*linear(c[1])+.0722*linear(c[2]);
      let minimumRatio=Infinity,worstBackground=null;
      for(let i=0;i<pixels.length;i+=4){
        if(pixels[i+3]!==255)return null;
        const bg=[pixels[i],pixels[i+1],pixels[i+2]];
        const fg=numbers.slice(0,3).map((n,c)=>n*alpha+bg[c]*(1-alpha));
        const values=[lum(bg),lum(fg)].sort((a,b)=>a-b);
        const ratio=(values[1]+.05)/(values[0]+.05);
        if(ratio<minimumRatio){minimumRatio=ratio;worstBackground=bg;}
      }
      return {minimumRatio,worstBackground,pixels:bitmap.width*bitmap.height};
    } finally {bitmap.close();}
  },{base64:screenshot.toString('base64'),color:style.color});
  if(!measured)return {status:'UNSUPPORTED_COMPOSITING',reason:'unsupported color, alpha or pixel budget',...style};
  return {status:measured.minimumRatio>=style.threshold?'CONSERVATIVE_BOUND_PASSES':'REQUIRES_MANUAL_REVIEW',
    ...style,...measured,backgroundSha256:createHash('sha256').update(screenshot).digest('hex')};
}
