/*
 * TOWN feedback clarity layer.
 * Keeps purchase errors in the interaction prompt and draws directional
 * damage indicators using hit metadata surfaced by ui-feedback-html-patches.
 */
(() => {
  const start = () => {
    const hud = document.getElementById('hud');
    const prompt = document.getElementById('prompt');
    const toast = document.getElementById('toast');
    if (!hud) return;

    let damageLayer = document.getElementById('damageIndicators');
    if (!damageLayer) {
      damageLayer = document.createElement('div');
      damageLayer.id = 'damageIndicators';
      damageLayer.setAttribute('aria-hidden', 'true');
      hud.appendChild(damageLayer);
    }

    const replayClass = (el, cls) => {
      if (!el) return;
      el.classList.remove(cls);
      void el.offsetWidth;
      el.classList.add(cls);
    };

    const pulsePrompt = (reason = '') => {
      if (!prompt) return;
      prompt.dataset.denyReason = reason;
      replayClass(prompt, 'prompt-deny-flash');
      clearTimeout(pulsePrompt.timer);
      pulsePrompt.timer = setTimeout(() => {
        prompt.classList.remove('prompt-deny-flash');
        delete prompt.dataset.denyReason;
      }, 430);
    };

    addEventListener('town:prompt-deny', (event) => {
      const detail = event.detail || {};
      pulsePrompt(detail.reason || 'locked');
    });

    const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

    const showDamageIndicator = (detail = {}) => {
      const d = detail || {};
      const values = [d.sourceX, d.sourceZ, d.playerX, d.playerZ, d.yaw];
      if (!values.every(Number.isFinite)) return false;

      const dx = d.sourceX - d.playerX;
      const dz = d.sourceZ - d.playerZ;
      if (Math.hypot(dx, dz) < 0.01) return false;

      const sy = Math.sin(d.yaw);
      const cy = Math.cos(d.yaw);
      const forward = dx * -sy + dz * -cy;
      const right = dx * cy + dz * -sy;
      const angle = Math.atan2(right, forward) * 180 / Math.PI;
      const strength = clamp((Number(d.amount) || 10) / 48, .35, 1);

      const marker = document.createElement('div');
      marker.className = 'damage-indicator';
      marker.style.setProperty('--hit-angle', `${angle.toFixed(1)}deg`);
      marker.style.setProperty('--hit-strength', strength.toFixed(2));
      marker.innerHTML = '<span class="damage-indicator__chevron"></span>';
      damageLayer.appendChild(marker);

      const cleanup = () => marker.remove();
      marker.addEventListener('animationend', cleanup, { once: true });
      setTimeout(cleanup, 900);
      return true;
    };

    // Direct hook for gameplay damage. This avoids relying on event delivery
    // for the common zombie-hit path while retaining the event listener as a
    // compatibility fallback for any older transformed HTML still in cache.
    window.__townShowDamageIndicator = showDamageIndicator;
    addEventListener('town:player-hit', (event) => showDamageIndicator(event.detail || {}));

    // Safety net for old or unusual deny paths. If a duplicate center toast
    // still says the same thing as an interaction prompt, suppress it and
    // pulse the prompt instead. The class is removed automatically on the
    // next real toast.
    const syncToastSuppression = () => {
      if (!toast) return;
      const text = (toast.textContent || '').replace(/\s+/g, ' ').trim().toLowerCase();
      const duplicateDeny = text === 'not enough points'
        || text.includes('station power circuits first')
        || text === 'power required';
      toast.classList.toggle('toast-deny-suppressed', duplicateDeny);
      if (duplicateDeny) pulsePrompt(text.includes('power') ? 'power' : 'points');
    };

    if (toast) {
      new MutationObserver(syncToastSuppression).observe(toast, {
        childList: true,
        characterData: true,
        subtree: true
      });
      syncToastSuppression();
    }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
})();
