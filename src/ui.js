/**
 * Control panel wiring. Plain DOM against the markup in index.html -- no
 * lil-gui, which keeps the dependency list at three + vite.
 */

export function createUI({ onPreset, solarAngles }) {
  const params = {
    azimuth: 135,
    elevation: 38,
    manualOverride: false,
    manualState: 1,
  };

  const el = (id) => document.getElementById(id);

  const azInput = el('az');
  const elInput = el('el');
  const todInput = el('tod');
  const manualInput = el('manual');
  const stateInput = el('state');

  const azOut = el('azOut');
  const elOut = el('elOut');
  const todOut = el('todOut');
  const stateOut = el('stateOut');

  const fpsOut = el('fps');
  const bladesOut = el('blades');
  const movingOut = el('moving');
  const callsOut = el('calls');
  const shadowOut = el('shadow');

  function showSun() {
    azOut.textContent = `${Math.round(params.azimuth)}°`;
    elOut.textContent = `${Math.round(params.elevation)}°`;
  }

  azInput.addEventListener('input', () => {
    params.azimuth = Number(azInput.value);
    showSun();
  });

  elInput.addEventListener('input', () => {
    params.elevation = Number(elInput.value);
    showSun();
  });

  // Time of day drives both angles along a plausible equinox arc; it is an
  // addition to the two sliders, not a replacement, so it writes back to them.
  todInput.addEventListener('input', () => {
    const hour = Number(todInput.value);
    const { azimuth, elevation } = solarAngles(hour);

    params.azimuth = azimuth;
    params.elevation = Math.max(0, elevation);

    azInput.value = String(azimuth);
    elInput.value = String(Math.max(0, elevation));
    todOut.textContent = formatHour(hour);
    showSun();
  });

  manualInput.addEventListener('change', () => {
    params.manualOverride = manualInput.checked;
    stateInput.disabled = !manualInput.checked;
  });

  stateInput.addEventListener('input', () => {
    params.manualState = Number(stateInput.value);
    stateOut.textContent = params.manualState.toFixed(2);
  });

  document.querySelectorAll('button[data-preset]').forEach((btn) => {
    btn.addEventListener('click', () => onPreset(btn.dataset.preset));
  });

  showSun();
  todOut.textContent = formatHour(Number(todInput.value));

  return {
    params,

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
