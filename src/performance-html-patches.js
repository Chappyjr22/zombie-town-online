function replaceOnce(html, search, replacement, label) {
  if (!html.includes(search)) {
    console.warn(`[perf] HTML patch not applied: ${label}`);
    return html;
  }
  return html.replace(search, replacement);
}

export function applyPerformancePatches(html) {
  let out = html;

  // Crossroads imports hundreds of static low-poly-town nodes. Keep them
  // visually identical in solo High quality, but in multiplayer avoid using
  // every tiny prop as both a shadow caster and a bullet-raycast target.
  // Static imported transforms are frozen after placement so Three.js does
  // not rebuild their local matrices every frame.
  out = replaceOnce(out, `function placeTownAsset(file,x,z,rotY,opts){
  opts=opts||{};
  loadTownAssetTemplate(file).then(template=>{
    const obj=template.clone(true);
    obj.position.set(x,opts.y||0,z);
    obj.rotation.y=rotY||0;
    if(opts.scale)obj.scale.setScalar(opts.scale);
    obj.traverse(o=>{ if(o.isMesh){ o.castShadow=true; o.receiveShadow=true; blockers.push(o); } });
    worldRoot.add(obj);
  }).catch(err=>console.warn('town asset failed to load: '+file,err));
  if(opts.collide){
    const [w,d,top]=opts.collide;
    addYawCollider(x,z,w,d,rotY||0,top===undefined?2.4:top,0,0.04);
  }
}`, `function placeTownAsset(file,x,z,rotY,opts){
  opts=opts||{};
  loadTownAssetTemplate(file).then(template=>{
    const obj=template.clone(true);
    obj.position.set(x,opts.y||0,z);
    obj.rotation.y=rotY||0;
    if(opts.scale)obj.scale.setScalar(opts.scale);
    const castStaticShadow=SET.quality==='High'&&!net.connected;
    const rayBlock=!!opts.collide||/(Building|House|Church|Wall|Road|Roof|Rock|Fence|Car|Door)/i.test(file);
    obj.traverse(o=>{
      o.updateMatrix();o.matrixAutoUpdate=false;
      if(o.isMesh){o.castShadow=castStaticShadow;o.receiveShadow=true;if(rayBlock)blockers.push(o);}
    });
    obj.updateMatrixWorld(true);
    worldRoot.add(obj);
  }).catch(err=>console.warn('town asset failed to load: '+file,err));
  if(opts.collide){
    const [w,d,top]=opts.collide;
    addYawCollider(x,z,w,d,rotY||0,top===undefined?2.4:top,0,0.04);
  }
}`, 'Crossroads static asset optimization');

  // Overpass has even more repeated sourced pieces. The original loader made
  // every material double-sided because one flat roof tile needed an
  // underside. Restrict that workaround to the actual zero-thickness roof
  // tile, freeze static transforms, and use the same multiplayer shadow/ray
  // budget as Crossroads.
  out = replaceOnce(out, `function placeFps2Asset(file,x,z,rotY,opts){
  opts=opts||{};
  loadFps2AssetTemplate(file).then(template=>{
    const obj=template.clone(true);
    obj.position.set(x,opts.y||0,z);
    obj.rotation.y=rotY||0;
    if(opts.scale)obj.scale.setScalar(opts.scale);
    obj.traverse(o=>{
      if(o.isMesh){
        o.castShadow=true; o.receiveShadow=true; blockers.push(o);
        // Several of this pack's flat roof/floor tiles are zero-thickness
        // single quads (e.g. SM_Building_RoofFloor_01 is a bare 2.5x2.5
        // plane) that only render from the side their source normal faces -
        // fine for the pack's own demo camera shots looking down/outward,
        // but players here walk directly underneath them and were seeing
        // straight through to the sky. Force double-sided so every angle
        // renders.
        const mats=Array.isArray(o.material)?o.material:[o.material];
        for(const m of mats) if(m) m.side=THREE.DoubleSide;
      }
    });
    worldRoot.add(obj);
  }).catch(err=>console.warn('fps2 asset failed to load: '+file,err));
  if(opts.collide){
    const [w,d,top]=opts.collide;
    addYawCollider(x,z,w,d,rotY||0,top===undefined?2.4:top,0,0.04);
  }
}`, `function placeFps2Asset(file,x,z,rotY,opts){
  opts=opts||{};
  loadFps2AssetTemplate(file).then(template=>{
    const obj=template.clone(true);
    obj.position.set(x,opts.y||0,z);
    obj.rotation.y=rotY||0;
    if(opts.scale)obj.scale.setScalar(opts.scale);
    const castStaticShadow=SET.quality==='High'&&!net.connected;
    const rayBlock=!!opts.collide||/(Building|Wall|Floor|Border|Fence|Rock|Road|Door|Roof)/i.test(file);
    const needsUnderside=file==='SM_Building_RoofFloor_01.glb';
    obj.traverse(o=>{
      o.updateMatrix();o.matrixAutoUpdate=false;
      if(o.isMesh){
        o.castShadow=castStaticShadow;o.receiveShadow=true;if(rayBlock)blockers.push(o);
        if(needsUnderside){
          const mats=Array.isArray(o.material)?o.material:[o.material];
          for(const m of mats)if(m&&m.side!==THREE.DoubleSide){m.side=THREE.DoubleSide;m.needsUpdate=true;}
        }
      }
    });
    obj.updateMatrixWorld(true);
    worldRoot.add(obj);
  }).catch(err=>console.warn('fps2 asset failed to load: '+file,err));
  if(opts.collide){
    const [w,d,top]=opts.collide;
    addYawCollider(x,z,w,d,rotY||0,top===undefined?2.4:top,0,0.04);
  }
}`, 'Overpass static asset optimization');

  // Fire and lamp point lights used to bypass the distance-light budget.
  out = replaceOnce(out,
    `const L=new THREE.PointLight(0xff7a22,intensity,13*scale,1.8);L.position.y=.75*scale;g.add(L);`,
    `const L=new THREE.PointLight(0xff7a22,intensity,13*scale,1.8);L.position.y=.75*scale;g.add(L);cullableLights.push(L);`,
    'fire lights join culling budget');
  out = replaceOnce(out,
    `const L=new THREE.PointLight(0xffa93c,1.35,19,1.7); L.position.copy(lightPos); worldRoot.add(L);`,
    `const L=new THREE.PointLight(0xffa93c,1.35,19,1.7); L.position.copy(lightPos); worldRoot.add(L);cullableLights.push(L);`,
    'street lights join culling budget');

  // Keep fewer forward-rendered local lights active while online. Forward
  // lighting cost scales with every visible fragment, which is particularly
  // expensive on the two imported maps.
  out = replaceOnce(out,
    `if(cullableLights.length<=CULLABLE_LIGHT_CAP||game.time<nextLightCull) return;`,
    `const lightCap=net.connected?10:CULLABLE_LIGHT_CAP;if(cullableLights.length<=lightCap||game.time<nextLightCull) return;`,
    'online light cap');
  out = replaceOnce(out,
    `ranked[i].L.visible=i<CULLABLE_LIGHT_CAP;`,
    `ranked[i].L.visible=i<lightCap;`,
    'online light cap visibility');

  // An inactive remote muzzle PointLight still occupies a light slot in the
  // material shaders. The flash mesh already provides the visible remote
  // muzzle flash, so retain the state object without adding another light to
  // the scene for each teammate.
  out = replaceOnce(out,
    `const shotLight=new THREE.PointLight(0xffb45d,0,5,2);weaponHolder.add(flash,shotLight);`,
    `const shotLight={position:new THREE.Vector3(),intensity:0};weaponHolder.add(flash);`,
    'remote muzzle light removal');

  // These pools deliberately keep light counts stable to avoid shader
  // recompiles. Smaller pools keep that stability while cutting the permanent
  // per-fragment light cost. Pool exhaustion already has graceful fallbacks.
  out = replaceOnce(out, `const DYNAMIC_LIGHT_POOL_SIZE=4;`, `const DYNAMIC_LIGHT_POOL_SIZE=3;`, 'dynamic light pool size');
  out = replaceOnce(out, `const DROP_LIGHT_POOL_SIZE=6;`, `const DROP_LIGHT_POOL_SIZE=4;`, 'drop light pool size');

  // The roadside lamps are intentionally removed from Overpass. Besides the
  // requested visual cleanup, this removes ten PointLights and ten collision
  // poles from the map.
  out = replaceOnce(out, `  streetLamp(-2.5,18,Math.PI/2);   streetLamp(7.5,20.5,-Math.PI/2);
  streetLamp(-2.5,23.5,Math.PI/2); streetLamp(7.5,28,-Math.PI/2);
  streetLamp(-2.5,34,Math.PI/2);
  streetLamp(7.5,-20.5,-Math.PI/2); streetLamp(-2.5,-18,Math.PI/2);
  streetLamp(7.5,-28,-Math.PI/2);   streetLamp(-2.5,-23.5,Math.PI/2);
  streetLamp(7.5,-34,-Math.PI/2);`,
    `  // Roadside street lamps removed: cleaner Overpass silhouette and ten fewer PointLights.`,
    'remove Overpass roadside lamps');

  return out;
}
