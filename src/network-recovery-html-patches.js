function replaceOnce(html, search, replacement, label) {
  if (!html.includes(search)) {
    console.warn(`[net] recovery patch not applied: ${label}`);
    return html;
  }
  return html.replace(search, replacement);
}

export function applyNetworkRecoveryPatches(html) {
  let out = html;

  out = replaceOnce(out,
    `reconnectTimer:null,nextHeartbeat:0,lastPong:0,runId:'',`,
    `reconnectTimer:null,nextHeartbeat:0,lastPong:0,runId:'',resumeAfterReconnect:false,`,
    'remember running state');

  out = replaceOnce(out, `    if(!manual){
      setNetStatus('Connection interrupted · recovering');
      if(net.reconnectAttempts===0) toast('Connection interrupted · recovering…');
      netAttemptReconnect(code);
    }`, `    if(!manual){
      if(net.activeGame&&game.running){
        net.resumeAfterReconnect=true;
        game.running=false;
        player.firing=false;
        player.vel.x=0;player.vel.z=0;
      }
      setNetStatus('Connection interrupted · recovering');
      if(net.reconnectAttempts===0) toast('Connection interrupted · recovering…');
      netAttemptReconnect(code);
    }`, 'freeze on network loss');

  out = replaceOnce(out, `      if(m.room&&m.room.paused){
        if(!net.pausedByHost)applySessionPause(true);
      }else if(net.pausedByHost)applySessionPause(false);`, `      if(m.room&&m.room.paused){
        net.resumeAfterReconnect=false;
        if(!net.pausedByHost)applySessionPause(true);
      }else{
        if(net.pausedByHost)applySessionPause(false);
        else if(net.resumeAfterReconnect){
          net.resumeAfterReconnect=false;
          game.running=true;last=performance.now()/1000;
        }
      }`, 'resume after reconnect');

  out = replaceOnce(out,
    `net.nextSave=0; net.nextHeartbeat=0; net.lastPong=0; net.runId=''; net.zombieSeq=1; net.pausedByHost=false;`,
    `net.nextSave=0; net.nextHeartbeat=0; net.lastPong=0; net.runId=''; net.resumeAfterReconnect=false; net.zombieSeq=1; net.pausedByHost=false;`,
    'reset recovery state');

  return out;
}
