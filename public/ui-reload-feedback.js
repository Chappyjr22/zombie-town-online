/*
 * TOWN reload feedback layer
 * Presentation-only. Reads the existing ammo/reload DOM state so the game's
 * reload timing, weapon logic, multiplayer state, and input handling stay
 * completely untouched.
 */
(() => {
  const start = () => {
    const ammo = document.getElementById('ammo');
    const reload = document.getElementById('reloading');
    const wrap = document.getElementById('ammoWrap');
    if (!ammo || !reload || !wrap) return;

    const style = document.createElement('style');
    style.textContent = `
      @keyframes uiReloadNeeded {
        0%, 100% {
          color: #ff765f;
          text-shadow: 0 0 5px rgba(239,89,68,.38), 0 2px 7px #000;
        }
        50% {
          color: #ffc08a;
          text-shadow: 0 0 15px rgba(239,89,68,.78), 0 2px 7px #000;
        }
      }

      @keyframes uiReloadWorking {
        0%, 100% {
          color: #ff6b55;
          text-shadow: 0 0 5px rgba(239,89,68,.36), 0 2px 7px #000;
        }
        50% {
          color: #ffb16e;
          text-shadow: 0 0 13px rgba(239,89,68,.66), 0 2px 7px #000;
        }
      }

      @keyframes uiNoAmmoWarning {
        0%, 100% { opacity: .78; }
        50% { opacity: 1; }
      }

      #reloading {
        min-height: 12px;
        margin-top: 5px;
        font-size: 10px !important;
        font-weight: 900 !important;
        line-height: 1.15;
        letter-spacing: .25em !important;
        text-transform: uppercase;
        transition: color .08s linear, opacity .08s linear;
      }

      #ammoWrap.reload-idle #reloading {
        opacity: 0 !important;
        animation: none !important;
      }

      #ammoWrap.needs-reload {
        border-right-color: #ef5944 !important;
        box-shadow:
          0 10px 22px rgba(0,0,0,.58),
          0 0 18px rgba(239,89,68,.10) !important;
      }

      #ammoWrap.needs-reload #reloading {
        opacity: 1 !important;
        animation: uiReloadNeeded .68s ease-in-out infinite !important;
      }

      #ammoWrap.needs-reload #ammo {
        color: #ffe4d8 !important;
        text-shadow:
          0 4px 14px #000,
          0 0 13px rgba(239,89,68,.18) !important;
      }

      #ammoWrap.is-reloading {
        border-right-color: #e65b46 !important;
      }

      #ammoWrap.is-reloading #reloading {
        opacity: 1 !important;
        animation: uiReloadWorking .72s ease-in-out infinite !important;
      }

      #ammoWrap.is-reloading #ammo {
        opacity: .58;
        filter: saturate(.72);
      }

      #ammoWrap.no-ammo {
        border-right-color: #b9241c !important;
        box-shadow:
          0 10px 22px rgba(0,0,0,.58),
          0 0 22px rgba(157,27,21,.14) !important;
      }

      #ammoWrap.no-ammo #reloading {
        color: #f14f3e !important;
        opacity: 1 !important;
        animation: uiNoAmmoWarning 1.05s ease-in-out infinite !important;
        text-shadow: 0 0 11px rgba(217,48,38,.52), 0 2px 7px #000 !important;
      }

      #ammoWrap.no-ammo #ammo,
      #ammoWrap.no-ammo #ammo small {
        color: #d95342 !important;
      }

      @media (prefers-reduced-motion: reduce) {
        #ammoWrap.needs-reload #reloading,
        #ammoWrap.is-reloading #reloading,
        #ammoWrap.no-ammo #reloading {
          animation: none !important;
        }
      }
    `;
    document.head.appendChild(style);

    const states = ['reload-idle', 'needs-reload', 'is-reloading', 'no-ammo'];

    const inputLabel = () => {
      if (document.body.classList.contains('touch')) return 'RELOAD';
      try {
        const pads = navigator.getGamepads ? Array.from(navigator.getGamepads()) : [];
        if (pads.some((pad) => pad && pad.connected)) return 'RELOAD // X';
      } catch (_) {}
      return 'RELOAD // R';
    };

    const ammoCounts = () => {
      const nums = (ammo.textContent || '').match(/\d[\d,]*/g) || [];
      const read = (value) => Number(String(value || '0').replace(/,/g, '')) || 0;
      return { mag: read(nums[0]), reserve: read(nums[1]) };
    };

    let lastState = '';
    let lastText = '';

    const sync = () => {
      const { mag, reserve } = ammoCounts();
      // updHUD() writes this inline style from player.reloading. Reading the
      // inline value rather than computed CSS keeps this layer independent of
      // the visual styles that also target #reloading.
      const activelyReloading = parseFloat(reload.style.opacity || '0') >= .5;

      let state = 'reload-idle';
      let text = '';
      if (activelyReloading) {
        state = 'is-reloading';
        text = 'RELOADING...';
      } else if (mag <= 0 && reserve > 0) {
        state = 'needs-reload';
        text = inputLabel();
      } else if (mag <= 0 && reserve <= 0) {
        state = 'no-ammo';
        text = 'NO AMMO';
      }

      if (state !== lastState) {
        wrap.classList.remove(...states);
        wrap.classList.add(state);
        lastState = state;
      }
      if (text !== lastText) {
        reload.textContent = text;
        lastText = text;
      }
    };

    const ammoObserver = new MutationObserver(sync);
    ammoObserver.observe(ammo, { childList: true, characterData: true, subtree: true });

    const reloadObserver = new MutationObserver(sync);
    reloadObserver.observe(reload, { attributes: true, attributeFilter: ['style'] });

    const bodyObserver = new MutationObserver(sync);
    bodyObserver.observe(document.body, { attributes: true, attributeFilter: ['class'] });

    addEventListener('gamepadconnected', sync);
    addEventListener('gamepaddisconnected', sync);
    sync();
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
})();
