function replaceOnce(html, search, replacement, label) {
  if (!html.includes(search)) {
    console.warn(`[net] HTML patch not applied: ${label}`);
    return html;
  }
  return html.replace(search, replacement);
}

export function applyNetworkPatches(html) {
  let out = html;

  out = replaceOnce(out, `const net={
  ws:null,code:'',id:'',host:false,connected:false,manualClose:false,token:'',reconnectAttempts:0,
  players:new Map(),remotes:new Map(),nextState:0,nextWorld:0,nextSave:0,zombieSeq:1,activeGame:false,
  pausedByHost:false,roomBest:null,pendingLeaves:new Map()
};`, `const net={
  ws:null,code:'',id:'',host:false,connected:false,manualClose:false,token:'',reconnectAttempts:0,
  reconnectTimer:null,nextHeartbeat:0,lastPong:0,runId:'',
  players:new Map(),remotes:new Map(),nextState:0,nextWorld:0,nextSave:0,zombieSeq:1,activeGame:false,
  pausedByHost:false,roomBest:null,pendingLeaves:new Map()
};`, 'network reconnect state');

  // A reconnect identity should survive a page refresh or a new tab while the
  // server-side grace window is active. The old sessionStorage-only token was
  // lost too easily during the exact failure mode it was supposed to recover.
  out = replaceOnce(out, `function netTokenKey(code){ return 'town:token:'+code; }
function netLoadToken(code){ try{return sessionStorage.getItem(netTokenKey(code))||'';}catch(e){return '';} }
function netSaveToken(code,token){ try{sessionStorage.setItem(netTokenKey(code),token);}catch(e){} }`, `function netTokenKey(code){ return 'town:token:'+code; }
function netLoadToken(code){
  try{return localStorage.getItem(netTokenKey(code))||sessionStorage.getItem(netTokenKey(code))||'';}catch(e){return '';}
}
function netSaveToken(code,token){
  try{localStorage.setItem(netTokenKey(code),token);sessionStorage.setItem(netTokenKey(code),token);}catch(e){}
}`, 'persistent reconnect token');

  out = replaceOnce(out, `function netLoadoutKey(code){ return 'town:loadout:'+code; }
function netSaveLoadout(){
  if(!net.code) return;
  try{
    sessionStorage.setItem(netLoadoutKey(net.code),JSON.stringify({
      points:player.points,perks:player.perks,slot:player.slot,
      guns:player.guns.map(g=>({id:g.def.id,ammo:g.ammo,res:g.res,pack:g.pack||0}))
    }));
  }catch(e){}
}
function netLoadLoadout(code){
  try{const raw=sessionStorage.getItem(netLoadoutKey(code));return raw?JSON.parse(raw):null;}catch(e){return null;}
}
function netClearLoadout(code){ try{sessionStorage.removeItem(netLoadoutKey(code));}catch(e){} }`, `function netLoadoutKey(code){ return 'town:loadout:'+code; }
function netSaveLoadout(){
  if(!net.code) return null;
  const snapshot={
    runId:net.runId||'',points:player.points,perks:player.perks,slot:player.slot,
    guns:player.guns.map(g=>({id:g.def.id,ammo:g.ammo,res:g.res,pack:g.pack||0})),
    hp:player.hp,maxHp:player.maxHp,grenades:player.grenades,claymores:player.claymores,
    downs:player.downs||0,kills:player.kills||0,headshots:player.headshots||0
  };
  try{localStorage.setItem(netLoadoutKey(net.code),JSON.stringify(snapshot));}catch(e){}
  return snapshot;
}
function netLoadLoadout(code){
  try{const raw=localStorage.getItem(netLoadoutKey(code));return raw?JSON.parse(raw):null;}catch(e){return null;}
}
function netClearLoadout(code){ try{localStorage.removeItem(netLoadoutKey(code));sessionStorage.removeItem(netLoadoutKey(code));}catch(e){} }`, 'durable local checkpoint');

  out = replaceOnce(out, `function applySavedLoadout(saved){
  if(!saved) return;
  player.perks={};
  if(saved.perks) for(const k in saved.perks) if(PERKS[k]&&saved.perks[k]) player.perks[k]=true;
  player.maxHp=has('jugg')?250:100; player.hp=player.maxHp;
  player.points=Math.max(0,Math.round(+saved.points)||0);
  if(Array.isArray(saved.guns)&&saved.guns.length){
    const guns=[];
    for(const sg of saved.guns){
      const def=DEFS[sg.id]; if(!def) continue;
      guns.push({def,ammo:clamp(Math.round(+sg.ammo)||0,0,999),
        res:clamp(Math.round(+sg.res)||0,0,9999),pack:clamp(Math.round(+sg.pack)||0,0,MAX_PACK)});
    }
    if(guns.length) player.guns=guns;
  }
  player.slot=clamp(Math.round(+saved.slot)||0,0,player.guns.length-1);
  renderPerks(); updHUD();
}`, `function applySavedLoadout(saved){
  if(!saved) return;
  if(saved.runId&&net.runId&&saved.runId!==net.runId) return;
  player.perks={};
  if(saved.perks) for(const k in saved.perks) if(PERKS[k]&&saved.perks[k]) player.perks[k]=true;
  player.maxHp=has('jugg')?250:100;
  player.hp=clamp(Number.isFinite(+saved.hp)?+saved.hp:player.maxHp,1,player.maxHp);
  player.points=Math.max(0,Math.round(+saved.points)||0);
  if(Array.isArray(saved.guns)&&saved.guns.length){
    const guns=[];
    for(const sg of saved.guns){
      const def=DEFS[sg.id]; if(!def) continue;
      guns.push({def,ammo:clamp(Math.round(+sg.ammo)||0,0,999),
        res:clamp(Math.round(+sg.res)||0,0,9999),pack:clamp(Math.round(+sg.pack)||0,0,MAX_PACK)});
    }
    if(guns.length) player.guns=guns;
  }
  player.slot=clamp(Math.round(+saved.slot)||0,0,player.guns.length-1);
  player.grenades=clamp(Math.round(+saved.grenades)||0,0,GRENADE_MAX);
  player.claymores=clamp(Math.round(+saved.claymores)||0,0,CLAYMORE_MAX);
  player.downs=Math.max(0,Math.round(+saved.downs)||0);
  player.kills=Math.max(0,Math.round(+saved.kills)||0);
  player.headshots=Math.max(0,Math.round(+saved.headshots)||0);
  renderPerks(); updHUD();
}`, 'checkpoint restore fields');

  // Host world snapshots do not need to run as fast as local rendering. The
  // replica interpolation already smooths them, so 160ms saves bandwidth and
  // Durable Object message dispatches without making zombies look jerky.
  out = replaceOnce(out, `net.nextWorld=game.time+.12;`, `net.nextWorld=game.time+.16;`, 'host world sync interval');

  // A token reconnect goes straight to the WebSocket endpoint. Doing a status
  // preflight first made a four-player room reject its own reconnect while the
  // old socket was still being retired, and several flapping clients could
  // also pile into the REST rate limiter together.
  out = replaceOnce(out, `  setNetStatus('Checking room '+code);
  try{
    const check=await fetch('/api/rooms/'+code);
    const info=await check.json();
    if(!check.ok||!info.exists) throw new Error('Room not found');
    if(info.players>=4) throw new Error('Room is full');
  }catch(e){
    setNetStatus(e.message||'Could not reach room');
    // A failed status preflight is expected while the network is still down. Keep using
    // the same bounded retry loop instead of silently stopping after the first attempt.
    if(isRetry) netAttemptReconnect(code); else sfxDeny();
    return;
  }
  const token=netLoadToken(code);`, `  const token=netLoadToken(code);
  if(!isRetry&&!token){
    setNetStatus('Checking room '+code);
    try{
      const check=await fetch('/api/rooms/'+code);
      const info=await check.json();
      if(!check.ok||!info.exists) throw new Error('Room not found');
      if(info.players>=4) throw new Error('Room is full');
    }catch(e){
      setNetStatus(e.message||'Could not reach room');sfxDeny();return;
    }
  }`, 'skip reconnect REST preflight');

  out = replaceOnce(out, `  ws.onmessage=e=>netHandle(e.data);
  ws.onerror=()=>setNetStatus('Connection failed');
  ws.onclose=e=>{
    if(net.ws!==ws) return;
    const manual=net.manualClose; net.connected=false; net.ws=null;
    if(!manual){
      setNetStatus('Disconnected from room');toast('Online room disconnected');
      netAttemptReconnect(code);
    }
  };`, `  ws.onopen=()=>{net.lastPong=performance.now()/1000;net.nextHeartbeat=0;};
  ws.onmessage=e=>{
    net.lastPong=performance.now()/1000;
    if(e.data==='pong') return;
    netHandle(e.data);
  };
  ws.onerror=()=>setNetStatus('Connection interrupted');
  ws.onclose=e=>{
    if(net.ws!==ws) return;
    const manual=net.manualClose; net.connected=false; net.ws=null;
    if(!manual){
      setNetStatus('Connection interrupted · recovering');
      if(net.reconnectAttempts===0) toast('Connection interrupted · recovering…');
      netAttemptReconnect(code);
    }
  };`, 'websocket heartbeat handlers');

  out = replaceOnce(out, `function netAttemptReconnect(code){
  if(net.manualClose||net.reconnectAttempts>=5) return;
  net.reconnectAttempts++;
  setNetStatus('Reconnecting… ('+net.reconnectAttempts+'/5)');
  setTimeout(()=>{
    if(net.manualClose||net.connected) return;
    netConnect(code,true);
  },1500);
}`, `function netAttemptReconnect(code){
  if(net.manualClose||net.connected||net.reconnectAttempts>=12) return;
  net.reconnectAttempts++;
  const attempt=net.reconnectAttempts;
  const delay=Math.min(8000,800*Math.pow(1.55,attempt-1))+Math.random()*450;
  setNetStatus('Reconnecting… ('+attempt+'/12)');
  if(net.reconnectTimer) clearTimeout(net.reconnectTimer);
  net.reconnectTimer=setTimeout(()=>{
    net.reconnectTimer=null;
    if(net.manualClose||net.connected) return;
    netConnect(code,true);
  },delay);
}`, 'reconnect backoff');

  out = replaceOnce(out, `function netDisconnect(showMenu,keepState){
  net.manualClose=true;`, `function netDisconnect(showMenu,keepState){
  net.manualClose=true;
  if(net.reconnectTimer){clearTimeout(net.reconnectTimer);net.reconnectTimer=null;}`, 'clear reconnect timer');

  out = replaceOnce(out, `    net.nextState=0; net.nextWorld=0; net.zombieSeq=1; net.pausedByHost=false;`, `    net.nextState=0; net.nextWorld=0; net.nextSave=0; net.nextHeartbeat=0; net.lastPong=0; net.runId=''; net.zombieSeq=1; net.pausedByHost=false;`, 'reset reconnect fields');

  // Server checkpoints are the authoritative fallback when the page itself is
  // gone. Keep the existing browser snapshot too so a normal refresh restores
  // instantly even before the network round-trip completes.
  out = replaceOnce(out, `  if(net.connected&&net.activeGame&&game.running&&game.time>=net.nextSave){
    net.nextSave=game.time+2; netSaveLoadout();
  }
  if(!net.connected||!game.running||game.time<net.nextState) return;
  net.nextState=game.time+.05;`, `  const wallNow=performance.now()/1000;
  if(net.connected&&net.ws&&net.ws.readyState===WebSocket.OPEN){
    if(wallNow>=net.nextHeartbeat){
      net.nextHeartbeat=wallNow+15;
      try{net.ws.send('ping');}catch(e){}
    }
    if(net.lastPong&&wallNow-net.lastPong>45){
      try{net.ws.close(4000,'Heartbeat timeout');}catch(e){}
      return;
    }
  }
  if(net.connected&&net.activeGame&&game.running&&game.time>=net.nextSave){
    net.nextSave=game.time+3;
    const checkpoint=netSaveLoadout();
    if(checkpoint) netSend({type:'checkpoint',checkpoint});
  }
  if(!net.connected||!game.running||game.time<net.nextState) return;
  net.nextState=game.time+.08;`, 'heartbeat checkpoint and state throttle');

  // The Durable Object returns its latest matching-run checkpoint in welcome.
  out = replaceOnce(out, `    net.roomBest=(m.room&&m.room.leaderboard)||net.roomBest;`, `    net.roomBest=(m.room&&m.room.leaderboard)||net.roomBest;
    net.runId=(m.room&&m.room.runId)||net.runId||'';`, 'welcome run id');

  out = replaceOnce(out, `        if(hadToken){
          const saved=netLoadLoadout(net.code);
          if(saved){applySavedLoadout(saved);toast('Loadout restored');}
        }`, `        if(hadToken){
          const local=netLoadLoadout(net.code);
          const saved=m.resume||(local&&(!local.runId||!net.runId||local.runId===net.runId)?local:null);
          if(saved){applySavedLoadout(saved);toast(m.resume?'Progress restored from room':'Loadout restored');}
        }`, 'server checkpoint restore');

  out = replaceOnce(out, `  } else if(m.type==='start'&&MAPS[m.map]){
    // A brand new match for the whole room - any loadout snapshot left over
    // from a previous match in this same room code is stale now.
    netClearLoadout(net.code);
    applyRules(m.rules);`, `  } else if(m.type==='start'&&MAPS[m.map]){
    // A brand new match for the whole room - any loadout snapshot left over
    // from a previous match in this same room code is stale now.
    net.runId=String(m.runId||'');
    netClearLoadout(net.code);
    applyRules(m.rules);`, 'new run id');

  return out;
}
