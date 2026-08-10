/*
 * TOWN final gameplay feedback state layer.
 * Reads existing HUD output and adds semantic presentation classes only.
 * No gameplay, damage, points, weapon, zombie, or networking state is changed.
 */
(() => {
  const start = () => {
    const hud = document.getElementById('hud');
    if (!hud) return;

    const hpFill = document.getElementById('hpfill');
    const hpBar = document.getElementById('hpbar');
    const perks = document.getElementById('perks');
    const downed = document.getElementById('downed');
    const prompt = document.getElementById('prompt');
    const toast = document.getElementById('toast');
    const bossHud = document.getElementById('bossHud');
    const bossFill = document.getElementById('bossFill');
    const banner = document.getElementById('banner');
    const teamPoints = document.getElementById('teamPoints');
    const downedIndicators = document.getElementById('downedIndicators');

    const toggle = (el, cls, on) => {
      if (el) el.classList.toggle(cls, !!on);
    };

    const readPercent = (el, fallback = 100) => {
      if (!el) return fallback;
      const value = parseFloat(el.style.width || '');
      if (Number.isFinite(value)) return Math.max(0, Math.min(100, value));
      return fallback;
    };

    const readOpacity = (el) => {
      if (!el) return 0;
      const inline = parseFloat(el.style.opacity || '');
      if (Number.isFinite(inline)) return inline;
      const computed = parseFloat(getComputedStyle(el).opacity || '0');
      return Number.isFinite(computed) ? computed : 0;
    };

    const syncVitals = () => {
      const hp = readPercent(hpFill);
      toggle(hud, 'feedback-low', hp <= 50 && hp > 0);
      toggle(hud, 'feedback-critical', hp <= 25 && hp > 0);
      toggle(hud, 'feedback-downed', readOpacity(downed) >= .5 || hp <= 0);
      if (hpBar) hpBar.dataset.hp = `${Math.round(hp)}%`;

      let hasJugg = false;
      if (perks) {
        hasJugg = Array.from(perks.children).some((perk) => {
          const label = `${perk.title || ''} ${perk.textContent || ''}`.toLowerCase();
          return label.includes('jugger');
        });
      }
      toggle(hud, 'has-jugg', hasJugg);
    };

    const usingGamepad = () => {
      try {
        if (!navigator.getGamepads) return false;
        return Array.from(navigator.getGamepads()).some((pad) => pad && pad.connected);
      } catch (_) {
        return false;
      }
    };

    const interactionKey = () => {
      if (document.body.classList.contains('touch')) return 'USE';
      return usingGamepad() ? 'X' : 'F';
    };

    let currentPromptClass = '';
    const syncPrompt = () => {
      if (!prompt) return;

      const text = (prompt.textContent || '').replace(/\s+/g, ' ').trim();
      const lower = text.toLowerCase();
      let context = 'INTERACT //';
      let cls = '';

      if (prompt.classList.contains('poor')) {
        context = 'INSUFFICIENT POINTS //';
        cls = 'prompt-poor';
      } else if (/turn on .*power|activate .*power|power required|station power/.test(lower)) {
        context = 'POWER REQUIRED //';
        cls = 'prompt-power';
      } else if (/revive /.test(lower)) {
        context = 'REVIVE // TEAMMATE';
        cls = 'prompt-revive';
      } else if (/pack-a-punch|master upgrade|fully upgrade|fully packed/.test(lower)) {
        context = 'WEAPON UPGRADE //';
        cls = 'prompt-pap';
      } else if (/mystery box|take .*box|roll .*box/.test(lower)) {
        context = 'MYSTERY BOX //';
        cls = 'prompt-box';
      } else if (/juggernog|quick revive|speed cola|double tap|stamin|mule kick/.test(lower)) {
        context = 'PERK MACHINE //';
        cls = 'prompt-perk';
      } else if (/open |door|gate|passage|shortcut|unlock/.test(lower)) {
        context = 'ACCESS //';
        cls = 'prompt-door';
      } else if (/buy |ammo|grenade|claymore/.test(lower)) {
        context = 'PURCHASE //';
        cls = 'prompt-buy';
      }

      if (cls !== currentPromptClass) {
        if (currentPromptClass) prompt.classList.remove(currentPromptClass);
        if (cls) prompt.classList.add(cls);
        currentPromptClass = cls;
      }
      if (prompt.dataset.context !== context) prompt.dataset.context = context;

      const key = prompt.querySelector('b');
      const wanted = interactionKey();
      if (key && key.textContent !== wanted) key.textContent = wanted;
    };

    const toastClasses = [
      'toast-power', 'toast-maxammo', 'toast-instakill', 'toast-doublepoints',
      'toast-nuke', 'toast-firesale', 'toast-perk', 'toast-pap', 'toast-revive'
    ];

    const syncToast = () => {
      if (!toast) return;
      toast.classList.remove(...toastClasses);
      const text = (toast.textContent || '').replace(/\s+/g, ' ').trim();
      const lower = text.toLowerCase();
      let kicker = text ? 'SURVIVAL UPDATE //' : '';

      if (lower === 'max ammo') {
        toast.classList.add('toast-power', 'toast-maxammo');
        kicker = 'POWER-UP // AMMUNITION RESTORED';
      } else if (lower === 'insta-kill') {
        toast.classList.add('toast-power', 'toast-instakill');
        kicker = 'POWER-UP // LETHAL DAMAGE';
      } else if (lower === 'double points') {
        toast.classList.add('toast-power', 'toast-doublepoints');
        kicker = 'POWER-UP // SCORE MULTIPLIER';
      } else if (lower === 'nuke') {
        toast.classList.add('toast-power', 'toast-nuke');
        kicker = 'POWER-UP // AREA PURGE';
      } else if (lower === 'fire sale') {
        toast.classList.add('toast-power', 'toast-firesale');
        kicker = 'POWER-UP // BOXES ACTIVE';
      } else if (/juggernog|quick revive|speed cola|double tap|stamin|mule kick/.test(lower)) {
        toast.classList.add('toast-perk');
        kicker = 'PERK ACQUIRED //';
      } else if (/packed|pack-a-punch|upgrade/.test(lower)) {
        toast.classList.add('toast-pap');
        kicker = 'WEAPON MODIFIED //';
      } else if (/reviv/.test(lower)) {
        toast.classList.add('toast-revive');
        kicker = 'SURVIVOR STATUS //';
      }
      if (toast.dataset.kicker !== kicker) toast.dataset.kicker = kicker;
    };

    const syncBoss = () => {
      if (!bossHud || !bossFill) return;
      const hp = readPercent(bossFill);
      const visible = readOpacity(bossHud) > .05;
      toggle(bossHud, 'boss-active', visible);
      toggle(bossHud, 'boss-low', visible && hp <= 35 && hp > 12);
      toggle(bossHud, 'boss-critical', visible && hp <= 12 && hp > 0);
      if (bossHud.dataset.hp !== `${Math.round(hp)}%`) bossHud.dataset.hp = `${Math.round(hp)}%`;
    };

    const syncBanner = () => {
      if (!banner) return;
      const text = (banner.textContent || '').replace(/\s+/g, ' ').trim().toLowerCase();
      toggle(banner, 'banner-boss', text.includes('boss round'));
      toggle(banner, 'banner-lockdown', text.includes('containment lockdown'));
    };

    const syncTeam = () => {
      if (!teamPoints) return;
      const rows = Array.from(teamPoints.children).filter((el) => el.tagName === 'DIV');
      const count = rows.length ? `${rows.length} ACTIVE` : '';
      if (teamPoints.dataset.count !== count) teamPoints.dataset.count = count;
      toggle(hud, 'multiplayer-active', rows.length > 1);
    };

    const syncDownedTeam = () => {
      if (!downedIndicators) return;
      const active = Array.from(downedIndicators.querySelectorAll('.downArrow')).some((arrow) => {
        return arrow.style.display && arrow.style.display !== 'none';
      });
      toggle(hud, 'has-downed-teammate', active);
    };

    let promptQueued = false;
    const queuePrompt = () => {
      if (promptQueued) return;
      promptQueued = true;
      requestAnimationFrame(() => {
        promptQueued = false;
        syncPrompt();
      });
    };

    let downedQueued = false;
    const queueDowned = () => {
      if (downedQueued) return;
      downedQueued = true;
      requestAnimationFrame(() => {
        downedQueued = false;
        syncDownedTeam();
      });
    };

    if (hpFill) new MutationObserver(syncVitals).observe(hpFill, { attributes: true, attributeFilter: ['style'] });
    if (downed) new MutationObserver(syncVitals).observe(downed, { attributes: true, attributeFilter: ['style'] });
    if (perks) new MutationObserver(syncVitals).observe(perks, { childList: true, subtree: true });
    if (prompt) new MutationObserver(queuePrompt).observe(prompt, { childList: true, characterData: true, subtree: true, attributes: true, attributeFilter: ['class'] });
    if (toast) new MutationObserver(syncToast).observe(toast, { childList: true, characterData: true, subtree: true });
    if (bossHud) new MutationObserver(syncBoss).observe(bossHud, { attributes: true, attributeFilter: ['style'] });
    if (bossFill) new MutationObserver(syncBoss).observe(bossFill, { attributes: true, attributeFilter: ['style'] });
    if (banner) new MutationObserver(syncBanner).observe(banner, { childList: true, characterData: true, subtree: true });
    if (teamPoints) new MutationObserver(syncTeam).observe(teamPoints, { childList: true, subtree: true });
    if (downedIndicators) new MutationObserver(queueDowned).observe(downedIndicators, { childList: true, subtree: true, attributes: true, attributeFilter: ['style', 'class'] });

    const bodyObserver = new MutationObserver(queuePrompt);
    bodyObserver.observe(document.body, { attributes: true, attributeFilter: ['class'] });
    addEventListener('gamepadconnected', queuePrompt);
    addEventListener('gamepaddisconnected', queuePrompt);

    syncVitals();
    syncPrompt();
    syncToast();
    syncBoss();
    syncBanner();
    syncTeam();
    syncDownedTeam();

    window.__townUiFeedback = {
      syncVitals,
      syncPrompt,
      syncToast,
      syncBoss,
      syncTeam,
      syncDownedTeam
    };
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
})();
