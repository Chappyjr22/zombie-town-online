function replaceOnce(html, search, replacement, label) {
  if (!html.includes(search)) {
    console.warn(`[perf] collision patch not applied: ${label}`);
    return html;
  }
  return html.replace(search, replacement);
}

export function applyCollisionPerformancePatches(html) {
  let out = html;

  // Cache the expensive orientation math once when a collider is created and
  // keep a conservative circular bound for a very cheap broadphase reject.
  out = replaceOnce(out, `function addYawCollider(x,z,w,d,rot,top,bot,pad){
  const p=pad||0;
  colliders.push({x,z,halfW:w/2+p,halfD:d/2+p,rot:rot||0,oriented:true,
    top:top===undefined?99:top,bot:bot===undefined?-99:bot});
}`, `function addYawCollider(x,z,w,d,rot,top,bot,pad){
  const p=pad||0,R=rot||0,halfW=w/2+p,halfD=d/2+p;
  colliders.push({x,z,halfW,halfD,rot:R,c:Math.cos(R),s:Math.sin(R),boundR:Math.hypot(halfW,halfD),oriented:true,
    top:top===undefined?99:top,bot:bot===undefined?-99:bot});
}`, 'cache oriented collider bounds');

  // Zombies call resolveCircle every movement frame. On Crossroads/Overpass
  // the old version transformed against every oriented prop on the map even
  // when the prop was forty metres away. Reject distant AABBs/OBBs before
  // clamp, sqrt, or trig work.
  out = replaceOnce(out, `function resolveCircle(p,r,y){
  for(let i=0;i<colliders.length;i++){
    const b=colliders[i];
    if(y!==undefined && (y>=b.top-0.12 || y+1.75<b.bot)) continue;  // on top of it, or entirely below it
    let px=p.x,pz=p.z,c=1,s=0,minX=b.minX,maxX=b.maxX,minZ=b.minZ,maxZ=b.maxZ;
    if(b.oriented){
      c=Math.cos(b.rot);s=Math.sin(b.rot);
      const dx=p.x-b.x,dz=p.z-b.z;
      px=c*dx-s*dz;pz=s*dx+c*dz;
      minX=-b.halfW;maxX=b.halfW;minZ=-b.halfD;maxZ=b.halfD;
    }
    const cx=clamp(px,minX,maxX),cz=clamp(pz,minZ,maxZ);
    let dx=px-cx,dz=pz-cz,d2=dx*dx+dz*dz;
    if(d2<r*r){
      if(d2>1e-8){const d=Math.sqrt(d2);px+=dx/d*(r-d);pz+=dz/d*(r-d);}
      else{
        const l=px-minX,rr=maxX-px,back=pz-minZ,front=maxZ-pz,m=Math.min(l,rr,back,front);
        if(m===l)px=minX-r; else if(m===rr)px=maxX+r; else if(m===back)pz=minZ-r; else pz=maxZ+r;
      }
      if(b.oriented){
        p.x=b.x+c*px+s*pz;p.z=b.z-s*px+c*pz;
      }else{p.x=px;p.z=pz;}
    }
  }
  p.x=clamp(p.x,-BND+1.2,BND-1.2); p.z=clamp(p.z,-BND+1.2,BND-1.2);
}`, `function resolveCircle(p,r,y){
  for(let i=0;i<colliders.length;i++){
    const b=colliders[i];
    if(y!==undefined && (y>=b.top-0.12 || y+1.75<b.bot)) continue;
    let px=p.x,pz=p.z,c=1,s=0,minX=b.minX,maxX=b.maxX,minZ=b.minZ,maxZ=b.maxZ;
    if(b.oriented){
      const br=b.boundR;
      if(Math.abs(p.x-b.x)>br+r||Math.abs(p.z-b.z)>br+r) continue;
      c=b.c;s=b.s;
      const dx=p.x-b.x,dz=p.z-b.z;
      px=c*dx-s*dz;pz=s*dx+c*dz;
      minX=-b.halfW;maxX=b.halfW;minZ=-b.halfD;maxZ=b.halfD;
    }else if(p.x<minX-r||p.x>maxX+r||p.z<minZ-r||p.z>maxZ+r) continue;
    const cx=clamp(px,minX,maxX),cz=clamp(pz,minZ,maxZ);
    let dx=px-cx,dz=pz-cz,d2=dx*dx+dz*dz;
    if(d2<r*r){
      if(d2>1e-8){const d=Math.sqrt(d2);px+=dx/d*(r-d);pz+=dz/d*(r-d);}
      else{
        const l=px-minX,rr=maxX-px,back=pz-minZ,front=maxZ-pz,m=Math.min(l,rr,back,front);
        if(m===l)px=minX-r; else if(m===rr)px=maxX+r; else if(m===back)pz=minZ-r; else pz=maxZ+r;
      }
      if(b.oriented){p.x=b.x+c*px+s*pz;p.z=b.z-s*px+c*pz;}
      else{p.x=px;p.z=pz;}
    }
  }
  p.x=clamp(p.x,-BND+1.2,BND-1.2); p.z=clamp(p.z,-BND+1.2,BND-1.2);
}`, 'resolveCircle broadphase');

  // blockedAt is called repeatedly by zombie steering probes. The cached
  // orientation and radius turn the common far-away case into two abs checks.
  out = replaceOnce(out, `function blockedAt(x,z,r,y){
  for(let i=0;i<colliders.length;i++){
    const b=colliders[i];
    if(y!==undefined && (y>=b.top-0.12 || y+1.75<b.bot)) continue;
    if(b.oriented){
      const c=Math.cos(b.rot),s=Math.sin(b.rot),dx=x-b.x,dz=z-b.z;
      const lx=c*dx-s*dz,lz=s*dx+c*dz;
      const qx=lx-clamp(lx,-b.halfW,b.halfW),qz=lz-clamp(lz,-b.halfD,b.halfD);
      if(qx*qx+qz*qz<r*r) return true;
    }else if(x>b.minX-r&&x<b.maxX+r&&z>b.minZ-r&&z<b.maxZ+r) return true;
  }
  return false;
}`, `function blockedAt(x,z,r,y){
  for(let i=0;i<colliders.length;i++){
    const b=colliders[i];
    if(y!==undefined && (y>=b.top-0.12 || y+1.75<b.bot)) continue;
    if(b.oriented){
      const dx=x-b.x,dz=z-b.z,br=b.boundR;
      if(Math.abs(dx)>br+r||Math.abs(dz)>br+r) continue;
      const lx=b.c*dx-b.s*dz,lz=b.s*dx+b.c*dz;
      const qx=lx-clamp(lx,-b.halfW,b.halfW),qz=lz-clamp(lz,-b.halfD,b.halfD);
      if(qx*qx+qz*qz<r*r) return true;
    }else if(x>b.minX-r&&x<b.maxX+r&&z>b.minZ-r&&z<b.maxZ+r) return true;
  }
  return false;
}`, 'blockedAt broadphase');

  return out;
}
