/**
 * Control panel wiring. Plain DOM against the markup in index.html -- no
 * lil-gui, which keeps the dependency list at three + vite.
 */

/**
 * @param onExplain toggles the explanation mode.
 * @param onSceneChange called when another scene is picked.
 */
export function createUI({ onPreset, onExplain, onSceneChange, solarAngles }) {
  const el = (id) => document.getElementById(id);

  const todInput = el('tod');
  const explainBtn = el('explainBtn');
  const manualInput = el('manual');
  const stateInput = el('state');
  const animateInput = el('animate');

  const todOut = el('todOut');
  const stateOut = el('stateOut');
  const sunControls = el('sunControls');
  const modeNote = el('modeNote');
  const modeInputs = [...document.querySelectorAll('input[name="mode"]')];

  const fpsOut = el('fps');
  const bladesOut = el('blades');
  const movingOut = el('moving');
  const callsOut = el('calls');
  const shadowOut = el('shadow');

  // The markup carries the starting values.
  const params = {
    /** The hot afternoon's sun, in degrees: set from the east-west slider. */
    azimuth: 0,
    elevation: 0,
    /**
     * 'day' (normal daylight), 'hot' (hot afternoon, louvres track the sun),
     * 'night' or 'storm' (wind and rain, louvres slightly open).
     */
    mode: modeInputs.find((input) => input.checked)?.value ?? 'hot',
    manualOverride: false,
    manualState: 1,
    autoAnimate: false,
  };

  // One slider runs the sun east to west along its June arc.
  function followPath() {
    const hour = Number(todInput.value);
    const { azimuth, elevation } = solarAngles(hour);
    params.azimuth = azimuth;
    params.elevation = Math.max(0, elevation);
    todOut.textContent = formatHour(hour);
  }
  todInput.addEventListener('input', followPath);

  // Scenes: only the hot afternoon has a sun to steer, so only it shows the sun slider.
  const MODE_NOTES = {
    day: 'Soft daylight, no glare · louvres fully open',
    hot: 'Strong sun · the louvres track it',
    night: 'Night · louvres fully open',
    storm: 'Strong wind, heavy rain · louvres slightly open',
  };
  function showMode() {
    sunControls.hidden = params.mode !== 'hot';
    modeNote.textContent = MODE_NOTES[params.mode];
  }
  modeInputs.forEach((input) =>
    input.addEventListener('change', () => {
      if (!input.checked) return;
      params.mode = input.value;
      showMode();
      onSceneChange?.();
    })
  );

  explainBtn.addEventListener('click', () => {
    explainBtn.blur(); // so the arrow keys step the explanation, not the focus
    onExplain?.();
  });

  function syncOverrideEnabled() {
    // Auto-animate drives the same override channel, so it takes the slider too.
    params.manualOverride = manualInput.checked || params.autoAnimate;
    stateInput.disabled = !manualInput.checked || params.autoAnimate;
  }

  manualInput.addEventListener('change', syncOverrideEnabled);

  animateInput.addEventListener('change', () => {
    params.autoAnimate = animateInput.checked;
    syncOverrideEnabled();
  });

  stateInput.addEventListener('input', () => {
    params.manualState = Number(stateInput.value);
    stateOut.textContent = params.manualState.toFixed(2);
  });

  document.querySelectorAll('button[data-preset]').forEach((btn) => {
    btn.addEventListener('click', () => onPreset(btn.dataset.preset));
  });

  // Start from whatever the markup has ticked (by default neither: the scene drives the louvres).
  params.autoAnimate = animateInput.checked;
  syncOverrideEnabled();

  followPath(); // start the sun on its path, at the markup's time
  showMode();

  return {
    params,

    /** Shows whether the explanation is running, on its button. */
    setExplaining(on) {
      explainBtn.textContent = on ? 'Exit explanation' : 'How the snowflake works';
      explainBtn.classList.toggle('on', on);
    },

    /** Called each frame while auto-animate runs, to drive the override slider. */
    setAnimatedState(v) {
      params.manualState = v;
      stateInput.value = String(v);
      stateOut.textContent = v.toFixed(2);
    },

    setStats({ fps, blades, moving, calls, shadow }) {
      fpsOut.textContent = fps.toFixed(0);
      fpsOut.style.color = fps >= 55 ? '#7fe8a4' : fps >= 40 ? '#e8d27f' : '#e8877f';
      bladesOut.textContent = blades.toLocaleString();
      movingOut.textContent = `${moving} module${moving === 1 ? '' : 's'}`;
      callsOut.textContent = String(calls);
      shadowOut.textContent = `${shadow}²`;
    },
  };
}

function formatHour(hour) {
  const h = Math.floor(hour);
  const m = Math.round((hour - h) * 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}
