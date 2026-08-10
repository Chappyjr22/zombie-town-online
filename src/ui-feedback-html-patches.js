function replaceOnce(html, search, replacement, label) {
  if (!html.includes(search)) {
    console.warn(`[ui] HTML patch not applied: ${label}`);
    return html;
  }
  return html.replace(search, replacement);
}

export function applyUiFeedbackPatches(html) {
  let out = html;

  out = replaceOnce(out, `function makeRemoteNameTag(name,col){
  const canvas=document.createElement('canvas'),w=512,h=96;
  canvas.width=w;canvas.height=h;
  const c=canvas.getContext('2d');
  c.clearRect(0,0,w,h);
  c.fillStyle='rgba(4,6,10,.76)';
  c.beginPath();c.moveTo(28,10);c.lineTo(w-28,10);c.quadraticCurveTo(w-10,10,w-10,28);
  c.lineTo(w-10,h-28);c.quadraticCurveTo(w-10,h-10,w-28,h-10);
  c.lineTo(28,h-10);c.quadraticCurveTo(10,h-10,10,h-28);
  c.lineTo(10,28);c.quadraticCurveTo(10,10,28,10);c.closePath();c.fill();
  c.fillStyle='#'+col.getHexString();c.fillRect(24,h-15,w-48,5);
  c.fillStyle='#f2ead6';c.font='700 34px Arial';c.textAlign='center';c.textBaseline='middle';
  c.shadowColor='rgba(0,0,0,.95)';c.shadowBlur=7;
  c.fillText(String(name||'Survivor').slice(0,18),w/2,h/2-3,w-42);
  const map=new THREE.CanvasTexture(canvas);map.colorSpace=THREE.SRGBColorSpace;
  const material=new THREE.SpriteMaterial({map,transparent:true,depthTest:true,depthWrite:false});
  const sprite=new THREE.Sprite(material);sprite.scale.set(2.8,.525,1);
  sprite.renderOrder=5;
  return sprite;
}`, `function makeRemoteNameTag(name,col){
  const canvas=document.createElement('canvas'),w=512,h=112;
  canvas.width=w;canvas.height=h;
  const c=canvas.getContext('2d'),accent='#'+col.getHexString();
  c.clearRect(0,0,w,h);
  c.fillStyle='rgba(2,4,7,.91)';
  c.beginPath();c.moveTo(30,8);c.lineTo(w-34,8);c.lineTo(w-9,31);c.lineTo(w-9,h-22);
  c.lineTo(w-22,h-9);c.lineTo(22,h-9);c.lineTo(9,h-22);c.lineTo(9,27);c.closePath();c.fill();
  c.strokeStyle='rgba(241,232,216,.24)';c.lineWidth=2;c.stroke();
  c.fillStyle=accent;c.fillRect(9,24,7,h-47);
  const grd=c.createLinearGradient(24,0,w-28,0);grd.addColorStop(0,accent);grd.addColorStop(.72,accent);grd.addColorStop(1,'rgba(0,0,0,0)');
  c.fillStyle=grd;c.fillRect(24,h-16,w-48,5);
  c.fillStyle='rgba(240,181,92,.92)';c.font='900 12px Arial';c.textAlign='left';c.textBaseline='middle';
  c.fillText('SURVIVOR //',31,28);
  c.fillStyle='#fff2df';c.font='900 38px Arial';c.textAlign='center';
  c.shadowColor='rgba(0,0,0,1)';c.shadowBlur=10;
  c.fillText(String(name||'Survivor').slice(0,18),w/2,67,w-58);
  const map=new THREE.CanvasTexture(canvas);map.colorSpace=THREE.SRGBColorSpace;
  const material=new THREE.SpriteMaterial({map,transparent:true,depthTest:true,depthWrite:false});
  const sprite=new THREE.Sprite(material);sprite.scale.set(3.15,.69,1);
  sprite.renderOrder=5;
  return sprite;
}`, 'multiplayer gamertag readability');

  return out;
}
