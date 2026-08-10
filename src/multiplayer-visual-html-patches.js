function replaceOnce(html, search, replacement, label) {
  if (!html.includes(search)) {
    console.warn(`[multiplayer-visual] HTML patch not applied: ${label}`);
    return html;
  }
  return html.replace(search, replacement);
}

export function applyMultiplayerVisualPatches(html) {
  let out = html;

  // Replicated shot effects must follow the same coordinate convention as the
  // shooter's camera, not the authored weapon/model axis. In this game yaw=0
  // looks down world -Z (see player/editor movement: fx=-sin(yaw), fz=-cos(yaw)).
  // Deriving direction from the remote gun transform can therefore reverse a
  // perfectly valid muzzle transform when the model hierarchy uses a different
  // local forward axis. Build the camera forward vector explicitly instead.
  // This is also shared by remote grenades, keeping all replicated projectiles
  // on the same forward convention.
  out = replaceOnce(out, `const _remoteAimObj=new THREE.Object3D();
const _remoteOrg=new THREE.Vector3(), _remoteDir=new THREE.Vector3();
function remoteFireOriginDir(r){
  r.flash.getWorldPosition(_remoteOrg);
  _remoteAimObj.rotation.set(r.pitch,r.yaw,0);
  _remoteAimObj.updateMatrixWorld();
  _remoteAimObj.getWorldDirection(_remoteDir);
  return {org:_remoteOrg,dir:_remoteDir};
}`, `const _remoteOrg=new THREE.Vector3(), _remoteDir=new THREE.Vector3();
function remoteFireOriginDir(r){
  r.g.updateMatrixWorld(true);
  r.flash.getWorldPosition(_remoteOrg);
  const cp=Math.cos(r.pitch);
  _remoteDir.set(-Math.sin(r.yaw)*cp,Math.sin(r.pitch),-Math.cos(r.yaw)*cp).normalize();
  return {org:_remoteOrg,dir:_remoteDir};
}`, 'remote projectile camera direction');

  // If the previous multiplayer visual pass already replaced the original
  // helper before this file version is served, upgrade that implementation too.
  out = replaceOnce(out, `const _remoteOrg=new THREE.Vector3(), _remoteAimPoint=new THREE.Vector3(), _remoteDir=new THREE.Vector3();
function remoteFireOriginDir(r){
  // remoteFire updates r.g.rotation immediately from the shot event, so force
  // the world matrices current before sampling the visible muzzle transform.
  r.g.updateMatrixWorld(true);
  r.flash.getWorldPosition(_remoteOrg);
  const forwardZ=r.flash.position.z>=0?1:-1;
  _remoteAimPoint.set(r.flash.position.x,r.flash.position.y,r.flash.position.z+forwardZ);
  r.weaponHolder.localToWorld(_remoteAimPoint);
  _remoteDir.copy(_remoteAimPoint).sub(_remoteOrg).normalize();
  return {org:_remoteOrg,dir:_remoteDir};
}`, `const _remoteOrg=new THREE.Vector3(), _remoteDir=new THREE.Vector3();
function remoteFireOriginDir(r){
  r.g.updateMatrixWorld(true);
  r.flash.getWorldPosition(_remoteOrg);
  const cp=Math.cos(r.pitch);
  _remoteDir.set(-Math.sin(r.yaw)*cp,Math.sin(r.pitch),-Math.cos(r.yaw)*cp).normalize();
  return {org:_remoteOrg,dir:_remoteDir};
}`, 'upgrade remote projectile direction');

  // The firing hand was still authored too close to the chest centerline.
  // Move the weapon/trigger hand forward and slightly outward so the support
  // hand naturally follows the fore-end away from the torso as well.
  out = replaceOnce(out,
    `_remoteHandR.set(compact?.095:.125,1.37+lift,(compact?-.10:-.08)+recoilZ);`,
    `_remoteHandR.set(compact?.13:.17,1.35+lift,(compact?-.18:-.16)+recoilZ);`,
    'remote firing-hand clearance');

  // Give the support palm a little more outboard clearance instead of letting
  // long-gun fore-ends pull it back through the vest.
  out = replaceOnce(out,
    `_remoteHandL.x-=wd.underGrip?.018:(wd.cls==='sniper'?.132:(compact?.035:.075));`,
    `_remoteHandL.x-=wd.underGrip?.032:(wd.cls==='sniper'?.145:(compact?.055:.095));`,
    'remote support-hand clearance');

  // Wider, lower elbows keep both forearms outside the chest silhouette while
  // preserving the shouldered/tactical look and the existing two-bone IK.
  out = replaceOnce(out, `        _remoteElbowL.set(-.36,1.29+lift*.20,
          compact?-.02:lerp(-.10,_remoteHandL.z,.34));`, `        _remoteElbowL.set(-.40,1.25+lift*.20,
          compact?-.07:lerp(-.14,_remoteHandL.z,.30));`, 'remote left-elbow clearance');

  out = replaceOnce(out,
    `_remoteElbowR.set(.36,1.30+lift*.18,.045);`,
    `_remoteElbowR.set(.40,1.26+lift*.18,-.015);`,
    'remote right-elbow clearance');

  return out;
}
