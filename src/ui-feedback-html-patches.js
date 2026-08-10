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

  // The focus prompt already knows when a purchase is unaffordable. Do not
  // spawn a second center-screen toast on top of it when the player presses F.
  out = replaceOnce(out, `function doBuy(){
  const it=game.focus; if(!it) return;
  const c=it.cost();
  if(player.points<c){ sfxDeny(); toast('Not enough points'); return; }`, `function doBuy(){
  const it=game.focus; if(!it) return;
  const c=it.cost();
  if(player.points<c){
    sfxDeny();
    window.dispatchEvent(new CustomEvent('town:prompt-deny',{detail:{reason:'points',message:'Not enough points'}}));
    return;
  }`, 'insufficient-points prompt feedback');

  // Locked gates and unpowered perk machines also keep their explanation in
  // the interaction prompt instead of stacking a duplicate toast over it.
  out = replaceOnce(out,
    `if(!mapGateReady(gate)){toast(mapGateLockText(gate));sfxDeny();return;}`,
    `if(!mapGateReady(gate)){const message=mapGateLockText(gate);sfxDeny();window.dispatchEvent(new CustomEvent('town:prompt-deny',{detail:{reason:'locked',message}}));return;}`,
    'locked map-gate prompt feedback');

  out = replaceOnce(out,
    `if(this.locked()){toast('Activate both station power circuits first');sfxDeny();return false;}`,
    `if(this.locked()){sfxDeny();window.dispatchEvent(new CustomEvent('town:prompt-deny',{detail:{reason:'power',message:'Activate both station power circuits first'}}));return false;}`,
    'locked perk prompt feedback');

  // Give the presentation layer enough context to draw a directional hit arc.
  // Damage rules stay exactly the same, only attacker position metadata is
  // surfaced through a DOM event.
  out = replaceOnce(out, `function hurtPlayer(amount){
  if(!player.alive||player.downed||player.invuln>0) return;
  player.hp-=amount; player.lastHit=game.time;
  sfxHurt(clamp(.38+amount/120,.38,.56));
  ui.vig.style.opacity=clamp(.35+(1-player.hp/player.maxHp)*.6,0,1);
  if(player.hp<=0){ player.hp=0; goDown(); }
  updHUD();
}`, `function hurtPlayer(amount,sourceX=null,sourceZ=null){
  if(!player.alive||player.downed||player.invuln>0) return;
  if(Number.isFinite(sourceX)&&Number.isFinite(sourceZ)){
    window.dispatchEvent(new CustomEvent('town:player-hit',{detail:{
      sourceX,sourceZ,playerX:player.pos.x,playerZ:player.pos.z,yaw:player.yaw,amount
    }}));
  }
  player.hp-=amount; player.lastHit=game.time;
  sfxHurt(clamp(.38+amount/120,.38,.56));
  ui.vig.style.opacity=clamp(.35+(1-player.hp/player.maxHp)*.6,0,1);
  if(player.hp<=0){ player.hp=0; goDown(); }
  updHUD();
}`, 'directional player-hit metadata');

  out = replaceOnce(out,
    `if(kind==='nade'&&pd<radius) hurtPlayer(dmg*(1-pd/radius)*0.35);`,
    `if(kind==='nade'&&pd<radius) hurtPlayer(dmg*(1-pd/radius)*0.35,pos.x,pos.z);`,
    'grenade hit direction');

  out = replaceOnce(out,
    `hurtPlayer(clamp(+e.amount||0,0,100));`,
    `hurtPlayer(clamp(+e.amount||0,0,100),Number(e.sourceX),Number(e.sourceZ));`,
    'network hit direction receive');

  out = replaceOnce(out, `if(!net.connected||targetId===net.id) hurtPlayer(amount);
      else netHostDirect(targetId,{type:'player_damage',amount});`, `if(!net.connected||targetId===net.id) hurtPlayer(amount,z.pos.x,z.pos.z);
      else netHostDirect(targetId,{type:'player_damage',amount,sourceX:z.pos.x,sourceZ:z.pos.z});`, 'zombie hit direction send');

  return out;
}
