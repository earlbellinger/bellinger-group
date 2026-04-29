const TAU = Math.PI * 2;
const C_AU_PER_DAY = 173.144632674240;
const ANIMATION_INTERVAL_MS = 98;
const THEME = {
  plotBg: "#0b1220",
  plotBorder: "#314052",
  title: "#eef5ff",
  subtitle: "#9aa8bd",
  label: "#c7d2e5",
  grid: "rgba(148, 163, 184, 0.20)",
  guide: "rgba(251, 191, 36, 0.18)",
  template: "#8fa3b7",
  time: "#fbbf24",
  ltte: "#38bdf8",
  observed: "#eef5ff",
  b1: "#2dd4bf",
  b1Band: "rgba(45, 212, 191, 0.18)",
  b2: "#a78bfa",
  marker: "#fb923c",
};

const BLAZHKO_KEYS = ["b1", "b2"];
const EFFECT_CHECKBOX_IDS = ["includeB1", "includeB2", "includeLtte"];
const STATIC_ELEMENT_IDS = [
  "sourceLabel",
  "statusLine",
  ...EFFECT_CHECKBOX_IDS,
  "addBlazhko",
  "addBinary",
  "resetB1",
  "resetB2",
  "resetLtte",
  "b1Group",
  "b2Group",
  "ltteGroup",
  "b1Controls",
  "b2Controls",
  "ltteControls",
  "blazhkoPanel",
  "lttePanels",
  "lttePanel",
  "playPause",
  "resetAnimation",
];

const OBSERVATION_SLIDERS = [
  { id: "obsBaseline", field: "baselineDays", formatter: formatBaseline },
  { id: "obsCount", field: "count", formatter: (value) => value.toFixed(0) },
  { id: "dutyCycle", field: "dutyCycle", formatter: (value) => value.toFixed(2) },
  { id: "magUncertainty", field: "magUncertainty", formatter: (value) => `${value.toFixed(3)} mag` },
];

const BLAZHKO_SLIDERS = [
  { suffix: "Period", field: "periodDays", formatter: (value) => `${value.toFixed(2)} d` },
  { suffix: "Amp", field: "amplitudeDepth", formatter: (value) => value.toFixed(3) },
  { suffix: "PhaseShift", field: "phaseShiftCycles", formatter: (value) => value.toFixed(4) },
  { suffix: "Mean", field: "meanShiftMag", formatter: (value) => `${value.toFixed(4)} mag` },
  { suffix: "PhaseOffset", field: "phaseOffset", formatter: (value) => value.toFixed(3) },
];

const LTTE_SLIDERS = [
  { id: "orbPeriod", field: "orbitalPeriodDays", formatter: formatYears },
  { id: "tPeri", field: "periastronPhase", formatter: (value) => value.toFixed(3) },
  { id: "ecc", field: "eccentricity", formatter: (value) => value.toFixed(3) },
  { id: "omega", field: "omegaDeg", formatter: (value) => `${value.toFixed(1)} deg` },
  { id: "asini", field: "asiniAu", formatter: (value) => `${value.toFixed(3)} AU` },
];

const state = {
  playing: true,
  windowStartPhase: 0,
  blazhkoSweepPhase: 0,
  orbitalSweepPhase: 0,
  lightcurve: null,
  controls: null,
  defaultControls: null,
  fixedMagDomain: null,
};

const elements = {};
const canvasIds = ["phasePlot", "timePlot", "observedPlot", "blazhkoPlot1", "blazhkoPlot2", "lttePlot"];
const sliderFormatters = buildSliderFormatters();

document.addEventListener("DOMContentLoaded", init);

async function init() {
  cacheElements();
  const payload = await loadLightcurvePayload();
  state.lightcurve = prepareLightcurve(payload);
  state.defaultControls = defaultsFromPayload(payload);
  state.controls = cloneControls(state.defaultControls);
  applyDefaultsToControls();
  bindControls();
  state.fixedMagDomain = computeFixedMagnitudeDomain();
  resizeAndDraw();
  window.addEventListener("resize", resizeAndDraw);
  requestAnimationFrame(animationLoop);
}

async function loadLightcurvePayload() {
  if (window.RRLYRAE_LIGHTCURVE_DATA) return window.RRLYRAE_LIGHTCURVE_DATA;

  const response = await fetch("./data/theoretical_lightcurve.json");
  if (!response.ok) throw new Error(`Could not load light curve data: ${response.status}`);
  return response.json();
}

function cacheElements() {
  for (const id of [...STATIC_ELEMENT_IDS, ...canvasIds]) {
    elements[id] = document.getElementById(id);
  }
  for (const id of Object.keys(sliderFormatters)) {
    elements[id] = document.getElementById(id);
    elements[`${id}Value`] = document.getElementById(`${id}Value`);
  }
}

function buildSliderFormatters() {
  return Object.fromEntries([
    ...OBSERVATION_SLIDERS.map((descriptor) => [descriptor.id, descriptor.formatter]),
    ...BLAZHKO_KEYS.flatMap((key) =>
      BLAZHKO_SLIDERS.map((descriptor) => [sliderId(key, descriptor), descriptor.formatter]),
    ),
    ...LTTE_SLIDERS.map((descriptor) => [descriptor.id, descriptor.formatter]),
  ]);
}

function prepareLightcurve(payload) {
  const curve = payload.lightcurve;
  return {
    payload,
    sourceLabel: "Fourier template",
    fourier: payload.fourier_model,
    phase: curve.phase,
    mag: curve.mag_i,
    raw: curve.raw,
    periodDays: curve.period_days,
    meanMag: curve.mean_mag_i,
    minMag: curve.min_mag_i,
    maxMag: curve.max_mag_i,
  };
}

function defaultsFromPayload(payload) {
  const blazhko = payload.defaults.blazhko;
  const ltte = payload.defaults.ltte;
  return {
    includeB1: false,
    includeB2: false,
    includeLtte: false,
    observation: {
      baselineDays: 3652.5,
      count: 500,
      dutyCycle: 1,
      magUncertainty: 0.01,
    },
    b1: {
      periodDays: blazhko.period1.period_days,
      amplitudeDepth: blazhko.period1.amplitude_depth,
      phaseShiftCycles: blazhko.period1.phase_shift_cycles,
      meanShiftMag: blazhko.period1.mean_shift_mag,
      phaseOffset: blazhko.period1.phase_offset,
    },
    b2: {
      periodDays: blazhko.period2.period_days,
      amplitudeDepth: blazhko.period2.amplitude_depth,
      phaseShiftCycles: blazhko.period2.phase_shift_cycles,
      meanShiftMag: blazhko.period2.mean_shift_mag,
      phaseOffset: blazhko.period2.phase_offset,
    },
    ltte: {
      orbitalPeriodDays: ltte.orbital_period_days,
      referenceTPeri: ltte.t_peri_hjd_minus_2450000,
      periastronPhase: 0,
      eccentricity: ltte.eccentricity,
      omegaDeg: ltte.omega_deg,
      asiniAu: ltte.asini_au,
    },
    sources: {
      model: payload.source_model,
      blazhkoStar: blazhko.star_id,
      ltteStar: ltte.star_id,
    },
  };
}

function applyDefaultsToControls() {
  const controls = state.controls;
  elements.includeB1.checked = controls.includeB1;
  elements.includeB2.checked = controls.includeB2;
  elements.includeLtte.checked = controls.includeLtte;

  syncObservationSliders();
  for (const key of BLAZHKO_KEYS) syncBlazhkoSliders(key);
  syncLtteSliders();

  elements.sourceLabel.textContent = `${state.lightcurve.sourceLabel} P0 ${state.lightcurve.periodDays.toFixed(6)} d`;
}

function bindControls() {
  for (const id of Object.keys(sliderFormatters)) {
    elements[id].addEventListener("input", () => {
      readControls();
      updateSliderOutputs();
      resizeAndDraw();
    });
  }
  for (const id of EFFECT_CHECKBOX_IDS) {
    elements[id].addEventListener("change", () => {
      readControls();
      updatePanelVisibility();
      resizeAndDraw();
    });
  }

  elements.addBlazhko.addEventListener("click", () => {
    const nextKey = BLAZHKO_KEYS.find((key) => !elements[includeKeyForBlazhko(key)].checked);
    if (nextKey) elements[includeKeyForBlazhko(nextKey)].checked = true;
    readControls();
    updatePanelVisibility();
    resizeAndDraw();
  });

  elements.addBinary.addEventListener("click", () => {
    elements.includeLtte.checked = true;
    readControls();
    updatePanelVisibility();
    resizeAndDraw();
  });

  elements.resetB1.addEventListener("click", () => resetBlazhkoControls("b1"));
  elements.resetB2.addEventListener("click", () => resetBlazhkoControls("b2"));
  elements.resetLtte.addEventListener("click", resetLtteControls);

  elements.playPause.addEventListener("click", () => {
    state.playing = !state.playing;
    elements.playPause.textContent = state.playing ? "Pause" : "Play";
  });

  elements.resetAnimation.addEventListener("click", () => {
    state.windowStartPhase = 0;
    state.blazhkoSweepPhase = 0;
    state.orbitalSweepPhase = 0;
    resizeAndDraw();
  });

  readControls();
  updateSliderOutputs();
  updatePanelVisibility();
}

function setSlider(id, value) {
  elements[id].value = String(value);
  updateSliderFill(elements[id]);
}

function sliderId(prefix, descriptor) {
  return descriptor.id ?? `${prefix}${descriptor.suffix}`;
}

function syncSliderGroup(source, descriptors, prefix = "") {
  for (const descriptor of descriptors) {
    setSlider(sliderId(prefix, descriptor), source[descriptor.field]);
  }
}

function readSliderGroup(target, descriptors, prefix = "") {
  for (const descriptor of descriptors) {
    target[descriptor.field] = Number(elements[sliderId(prefix, descriptor)].value);
  }
}

function cloneControls(controls) {
  return JSON.parse(JSON.stringify(controls));
}

function resetBlazhkoControls(key) {
  state.controls[key] = cloneControls(state.defaultControls[key]);
  syncBlazhkoSliders(key);
  readControls();
  updateSliderOutputs();
  resizeAndDraw();
}

function resetLtteControls() {
  state.controls.ltte = cloneControls(state.defaultControls.ltte);
  syncLtteSliders();
  readControls();
  updateSliderOutputs();
  resizeAndDraw();
}

function syncObservationSliders() {
  syncSliderGroup(state.controls.observation, OBSERVATION_SLIDERS);
}

function syncBlazhkoSliders(key) {
  syncSliderGroup(state.controls[key], BLAZHKO_SLIDERS, key);
}

function syncLtteSliders() {
  syncSliderGroup(state.controls.ltte, LTTE_SLIDERS);
}

function readControls() {
  state.controls.includeB1 = elements.includeB1.checked;
  state.controls.includeB2 = elements.includeB2.checked;
  state.controls.includeLtte = elements.includeLtte.checked;
  readSliderGroup(state.controls.observation, OBSERVATION_SLIDERS);
  for (const key of BLAZHKO_KEYS) readSliderGroup(state.controls[key], BLAZHKO_SLIDERS, key);
  readSliderGroup(state.controls.ltte, LTTE_SLIDERS);
}

function updateSliderOutputs() {
  for (const [id, formatter] of Object.entries(sliderFormatters)) {
    elements[`${id}Value`].textContent = formatter(Number(elements[id].value));
    updateSliderFill(elements[id]);
  }
}

function updateSliderFill(slider) {
  const min = Number(slider.min || 0);
  const max = Number(slider.max || 100);
  const value = Number(slider.value);
  const progress = max > min ? ((value - min) / (max - min)) * 100 : 0;
  slider.style.setProperty("--slider-progress", `${Math.max(0, Math.min(100, progress))}%`);
}

function updatePanelVisibility() {
  const activeBlazhkoKeys = BLAZHKO_KEYS.filter((key) => state.controls[includeKeyForBlazhko(key)]);
  const showBlazhko = activeBlazhkoKeys.length > 0;
  const showBothBlazhko = activeBlazhkoKeys.length === BLAZHKO_KEYS.length;
  for (const key of BLAZHKO_KEYS) {
    const isIncluded = state.controls[includeKeyForBlazhko(key)];
    elements[`${key}Group`].classList.toggle("is-hidden", !isIncluded);
    elements[`${key}Controls`].classList.toggle("is-disabled", !isIncluded);
    for (const input of elements[`${key}Controls`].querySelectorAll("input")) input.disabled = !isIncluded;
  }

  elements.ltteGroup.classList.toggle("is-hidden", !state.controls.includeLtte);
  elements.blazhkoPanel.classList.toggle("is-hidden", !showBlazhko);
  elements.blazhkoPanel.classList.toggle("two-up", showBothBlazhko);
  elements.lttePanels.classList.toggle("is-hidden", !state.controls.includeLtte);
  elements.ltteControls.classList.toggle("is-disabled", !state.controls.includeLtte);
  elements.addBlazhko.disabled = showBothBlazhko;
  elements.addBlazhko.textContent = showBlazhko ? "Add Second Blazhko Period" : "Add Blazhko Period";
  elements.addBinary.disabled = state.controls.includeLtte;
  for (const input of elements.ltteControls.querySelectorAll("input")) input.disabled = !state.controls.includeLtte;
}

function includeKeyForBlazhko(key) {
  return `include${key.toUpperCase()}`;
}

function animationLoop(time) {
  if (!state.lastAnimationTime) state.lastAnimationTime = time;
  if (state.playing && time - state.lastAnimationTime >= ANIMATION_INTERVAL_MS) {
    state.windowStartPhase = mod(state.windowStartPhase + 0.1, 200000);
    state.blazhkoSweepPhase = mod(state.blazhkoSweepPhase + 0.05, 1);
    state.orbitalSweepPhase = mod(state.orbitalSweepPhase + 0.02, 1);
    state.lastAnimationTime = time;
    resizeAndDraw();
  }
  requestAnimationFrame(animationLoop);
}

function resizeAndDraw() {
  if (!state.lightcurve) return;
  drawTimePlot();
  drawObservedPlot();
  drawBlazhkoPlots();
  drawLttePanels();
  updateStatus();
}

function updateStatus() {
  const active = [];
  if (state.controls.includeB1) active.push(`B1 ${state.controls.b1.periodDays.toFixed(2)} d`);
  if (state.controls.includeB2) active.push(`B2 ${state.controls.b2.periodDays.toFixed(2)} d`);
  if (state.controls.includeLtte) active.push(`Binary ${formatYears(state.controls.ltte.orbitalPeriodDays)}`);
  elements.statusLine.textContent = `${active.length ? active.join(" | ") : "unmodulated"} | time window starts at ${state.windowStartPhase.toFixed(1)} P0`;
}

function sampleBaseMag(phase) {
  const curve = state.lightcurve;
  const x = mod(phase, 1);
  const phases = curve.phase;
  const mags = curve.mag;
  const lastIndex = phases.length - 1;

  if (x < phases[0]) {
    return interpolate(phases[lastIndex] - 1, mags[lastIndex], phases[0], mags[0], x);
  }
  if (x >= phases[lastIndex]) {
    return interpolate(phases[lastIndex], mags[lastIndex], phases[0] + 1, mags[0], x);
  }

  let low = 0;
  let high = lastIndex;
  while (high - low > 1) {
    const mid = Math.floor((low + high) / 2);
    if (phases[mid] <= x) low = mid;
    else high = mid;
  }
  return interpolate(phases[low], mags[low], phases[high], mags[high], x);
}

function interpolate(x1, y1, x2, y2, x) {
  const t = (x - x1) / (x2 - x1);
  return y1 + t * (y2 - y1);
}

function magWithSnapshot(phase, snapshot) {
  return magWithModulators(phase, snapshot, activeModulators());
}

function magWithModulators(phase, snapshot, modulators) {
  const mean = state.lightcurve.meanMag;
  let ampScale = 1;
  let phaseShift = 0;
  let meanShift = 0;

  for (const modulator of modulators) {
    const phaseValue = snapshot?.blazhko?.[modulator.key] ?? 0;
    const wave = Math.sin(TAU * (phaseValue + modulator.phaseOffset));
    const phaseWave = Math.cos(TAU * (phaseValue + modulator.phaseOffset));
    ampScale += modulator.amplitudeDepth * wave;
    phaseShift += modulator.phaseShiftCycles * phaseWave;
    meanShift += modulator.meanShiftMag * wave;
  }

  const ltteShift = snapshot?.ltteShiftCycles ?? 0;
  const base = sampleBaseMag(phase - phaseShift - ltteShift);
  return mean + (base - mean) * ampScale + meanShift;
}

function magAtRelativeTime(relativeDays) {
  const p0 = state.lightcurve.periodDays;
  const delay = ltteDelayAtModelTimeDays(relativeDays);
  const emissionDays = relativeDays - delay;
  const pulsePhase = relativeDays / p0;
  const snapshot = {
    blazhko: {
      b1: emissionDays / state.controls.b1.periodDays,
      b2: emissionDays / state.controls.b2.periodDays,
    },
    ltteShiftCycles: delay / p0,
  };
  return magWithSnapshot(pulsePhase, snapshot);
}

function magAtModelTime(modelDays) {
  const p0 = state.lightcurve.periodDays;
  const delay = ltteDelayAtModelTimeDays(modelDays);
  const emissionDays = modelDays - delay;
  const pulsePhase = modelDays / p0;
  const snapshot = {
    blazhko: {
      b1: emissionDays / state.controls.b1.periodDays,
      b2: emissionDays / state.controls.b2.periodDays,
    },
    ltteShiftCycles: delay / p0,
  };
  return magWithSnapshot(pulsePhase, snapshot);
}

function activeModulators() {
  return BLAZHKO_KEYS
    .filter((key) => state.controls[includeKeyForBlazhko(key)])
    .map((key) => ({ key, ...state.controls[key] }));
}

function animatedLtteDelayDays(relativeDays = 0) {
  if (!state.controls.includeLtte) return 0;
  const orbit = state.controls.ltte;
  const tPeri = effectiveTPeri();
  const time = tPeri + state.orbitalSweepPhase * orbit.orbitalPeriodDays + relativeDays;
  return ltteDelayDays(
    time,
    orbit.orbitalPeriodDays,
    tPeri,
    orbit.eccentricity,
    (orbit.omegaDeg * Math.PI) / 180,
    orbit.asiniAu / C_AU_PER_DAY,
  );
}

function ltteDelayAtModelTimeDays(modelDays) {
  if (!state.controls.includeLtte) return 0;
  const orbit = state.controls.ltte;
  return ltteDelayDays(
    modelDays,
    orbit.orbitalPeriodDays,
    effectiveTPeri(),
    orbit.eccentricity,
    (orbit.omegaDeg * Math.PI) / 180,
    orbit.asiniAu / C_AU_PER_DAY,
  );
}

function ltteDelayDays(time, period, tPeri, eccentricity, omega, amplitudeDays) {
  const e = Math.min(0.95, Math.max(0, eccentricity));
  const meanAnomaly = mod(TAU * (time - tPeri) / period, TAU);
  let eccentricAnomaly = meanAnomaly;
  for (let index = 0; index < 15; index += 1) {
    eccentricAnomaly -=
      (eccentricAnomaly - e * Math.sin(eccentricAnomaly) - meanAnomaly) /
      (1 - e * Math.cos(eccentricAnomaly));
  }
  const trueAnomaly = Math.atan2(
    Math.sqrt(1 - e * e) * Math.sin(eccentricAnomaly),
    Math.cos(eccentricAnomaly) - e,
  );
  return (amplitudeDays * (1 - e * e) * Math.sin(trueAnomaly + omega)) / (1 + e * Math.cos(trueAnomaly));
}

function drawLttePhasePlot() {
  if (!state.controls.includeLtte) return;
  const canvas = elements.phasePlot;
  const ctx = setupCanvas(canvas);
  const bounds = plotBounds(canvas, 62, 22, 26, 50);
  const yDomain = currentMagnitudeDomain();
  drawFrame(ctx, bounds, [0, 2], yDomain, {
    title: "LTTE Phase Shift",
    subtitle: `LTTE only | orbital phase ${state.orbitalSweepPhase.toFixed(2)}`,
    xLabel: "Pulsation phase",
    yLabel: "I magnitude",
  });

  const basePoints = [];
  const effectPoints = [];
  const referenceDays = state.windowStartPhase * state.lightcurve.periodDays;
  const delayShift = animatedLtteDelayDays(referenceDays) / state.lightcurve.periodDays;
  for (let index = 0; index <= 900; index += 1) {
    const x = (2 * index) / 900;
    basePoints.push([x, sampleBaseMag(x)]);
    effectPoints.push([x, sampleBaseMag(x - delayShift)]);
  }
  drawLine(ctx, bounds, [0, 2], yDomain, basePoints, THEME.template, 1.4, 0.6);
  drawLine(ctx, bounds, [0, 2], yDomain, effectPoints, THEME.ltte, 2.4, 1);
  drawLegend(ctx, bounds, [
    ["Template", THEME.template],
    ["LTTE shifted", THEME.ltte],
  ]);
}

function drawTimePlot() {
  const canvas = elements.timePlot;
  const ctx = setupCanvas(canvas);
  const bounds = plotBounds(canvas, 62, 22, 26, 50);
  const yDomain = currentMagnitudeDomain();
  drawFrame(ctx, bounds, [0, 50], yDomain, {
    title: "Animated Time Window",
    subtitle: `Fifty pulsation phases | step 0.1 P0 | start ${state.windowStartPhase.toFixed(1)} P0`,
    xLabel: "Elapsed pulsation phase in window",
    yLabel: "I magnitude",
  });

  const basePoints = [];
  const points = [];
  const startDays = state.windowStartPhase * state.lightcurve.periodDays;
  for (let index = 0; index <= 4000; index += 1) {
    const elapsedPhase = (50 * index) / 4000;
    const relativeDays = startDays + elapsedPhase * state.lightcurve.periodDays;
    basePoints.push([elapsedPhase, sampleBaseMag(state.windowStartPhase + elapsedPhase)]);
    points.push([elapsedPhase, magAtRelativeTime(relativeDays)]);
  }
  drawLine(ctx, bounds, [0, 50], yDomain, basePoints, THEME.template, 1.3, 0.5);
  drawLine(ctx, bounds, [0, 50], yDomain, points, THEME.time, 2.2, 1);
}

function drawObservedPlot() {
  const canvas = elements.observedPlot;
  const ctx = setupCanvas(canvas);
  const bounds = plotBounds(canvas, 62, 22, 26, 50);
  const yDomain = expandDomain(currentMagnitudeDomain(), state.controls.observation.magUncertainty * 1.4);
  const observations = buildObservedSample();
  const baselineLabel = formatBaseline(state.controls.observation.baselineDays);
  drawFrame(ctx, bounds, [0, 2], yDomain, {
    title: "Phase-Folded Observed Light Curve",
    subtitle: `${observations.length} observations | baseline ${baselineLabel}`,
    xLabel: "Pulsation phase",
    yLabel: "I magnitude",
  });

  drawObservedPoints(ctx, bounds, [0, 2], yDomain, observations);
}

function buildObservedSample() {
  const observation = state.controls.observation;
  const duty = Math.max(0, Math.min(1, observation.dutyCycle));
  if (duty <= 0 || observation.count <= 0) return [];

  const startDays = 0;
  const endDays = startDays + observation.baselineDays;
  const firstDay = Math.floor(startDays);
  const dayCount = Math.max(1, Math.ceil(endDays) - firstDay);
  const observations = [];
  const target = Math.round(observation.count);
  const maxAttempts = Math.max(target * 5, dayCount * 6);

  for (let attempt = 0; attempt < maxAttempts && observations.length < target; attempt += 1) {
    const dayStart = firstDay + Math.floor(hash01(attempt, 11) * dayCount);
    const visibleStart = Math.max(startDays, dayStart);
    const visibleEnd = Math.min(endDays, dayStart + duty);
    if (visibleEnd <= visibleStart) continue;

    const t = visibleStart + hash01(attempt, 17) * (visibleEnd - visibleStart);
    const pulsationPhase = mod(t / state.lightcurve.periodDays, 1);
    const noise = normal01(attempt, 29) * observation.magUncertainty;
    observations.push({
      phase: pulsationPhase,
      mag: magAtModelTime(t) + noise,
      uncertainty: observation.magUncertainty,
    });
  }

  return observations;
}

function drawObservedPoints(ctx, bounds, xDomain, yDomain, observations) {
  ctx.save();
  ctx.strokeStyle = THEME.observed;
  ctx.fillStyle = THEME.observed;
  ctx.lineWidth = 0.9;
  for (const point of observations) {
    for (const xValue of [point.phase, point.phase + 1]) {
      const x = mapX(bounds, xDomain, xValue);
      const y = mapY(bounds, yDomain, point.mag);
      if (point.uncertainty <= 0) {
        ctx.beginPath();
        ctx.arc(x, y, 1.6, 0, TAU);
        ctx.fill();
        continue;
      }
      const yTop = mapY(bounds, yDomain, point.mag - point.uncertainty);
      const yBottom = mapY(bounds, yDomain, point.mag + point.uncertainty);
      ctx.beginPath();
      ctx.moveTo(x, yTop);
      ctx.lineTo(x, yBottom);
      ctx.stroke();
    }
  }
  ctx.restore();
}

function formatBaseline(days) {
  if (days < 365.25) return `${Math.round(days)} d`;
  return formatYears(days);
}

function formatYears(days) {
  const years = days / 365.25;
  if (Math.abs(years - Math.round(years)) < 0.002) return `${Math.round(years)} yr`;
  return `${years < 10 ? years.toFixed(2) : years.toFixed(1)} yr`;
}

function expandDomain(domain, padding) {
  return [domain[0] - padding, domain[1] + padding];
}

function drawBlazhkoPlots() {
  const activeKeys = BLAZHKO_KEYS.filter((key) => state.controls[includeKeyForBlazhko(key)]);
  if (activeKeys.length === 0) return;
  const panels = activeKeys.map((key, index) => [
    index === 0 ? "blazhkoPlot1" : "blazhkoPlot2",
    key,
    `Blazhko Period ${key.slice(1)}`,
  ]);
  elements.blazhkoPlot2.classList.toggle("is-hidden", panels.length < 2);

  for (const [canvasId, key, label] of panels) {
    drawSingleBlazhkoPanel(elements[canvasId], key, label);
  }
}

function drawLttePanels() {
  if (!state.controls.includeLtte) return;
  drawLttePhasePlot();
  drawLttePlot();
}

function drawSingleBlazhkoPanel(canvas, variedKey, title) {
  const ctx = setupCanvas(canvas);
  const bounds = plotBounds(canvas, 62, 22, 26, 50);
  const yDomain = currentMagnitudeDomain();
  const center = state.blazhkoSweepPhase;
  const low = mod(center - 0.05, 1);
  const high = mod(center + 0.05, 1);
  drawFrame(ctx, bounds, [0, 2], yDomain, {
    title,
    subtitle: `Phase window ${low.toFixed(2)} to ${high.toFixed(2)}`,
    xLabel: "Pulsation phase",
    yLabel: "I magnitude",
  });

  const basePoints = [];
  const lowerPoints = [];
  const upperPoints = [];
  const centerPoints = [];
  for (let index = 0; index <= 720; index += 1) {
    const x = (2 * index) / 720;
    basePoints.push([x, sampleBaseMag(x)]);
    lowerPoints.push([x, magWithSnapshot(x, snapshotForBlazhko(variedKey, center - 0.05))]);
    upperPoints.push([x, magWithSnapshot(x, snapshotForBlazhko(variedKey, center + 0.05))]);
    centerPoints.push([x, magWithSnapshot(x, snapshotForBlazhko(variedKey, center))]);
  }
  drawBand(ctx, bounds, [0, 2], yDomain, lowerPoints, upperPoints, THEME.b1Band);
  drawLine(ctx, bounds, [0, 2], yDomain, basePoints, THEME.template, 1.1, 0.5);
  drawLine(ctx, bounds, [0, 2], yDomain, centerPoints, variedKey === "b1" ? THEME.b1 : THEME.b2, 2.2, 1);
}

function snapshotForBlazhko(variedKey, phaseValue) {
  const blazhko = {
    b1: variedKey === "b1" ? phaseValue : 0.25,
    b2: variedKey === "b2" ? phaseValue : 0.25,
  };
  return {
    blazhko,
    ltteShiftCycles: 0,
  };
}

function drawLttePlot() {
  if (!state.controls.includeLtte) return;
  const canvas = elements.lttePlot;
  const ctx = setupCanvas(canvas);
  const bounds = plotBounds(canvas, 60, 22, 28, 50);
  const points = [];
  let minDelay = Infinity;
  let maxDelay = -Infinity;
  const orbit = state.controls.ltte;
  const tPeri = effectiveTPeri();
  for (let index = 0; index <= 900; index += 1) {
    const phase = (2 * index) / 900;
    const delayMinutes =
      ltteDelayDays(
        tPeri + phase * orbit.orbitalPeriodDays,
        orbit.orbitalPeriodDays,
        tPeri,
        orbit.eccentricity,
        (orbit.omegaDeg * Math.PI) / 180,
        orbit.asiniAu / C_AU_PER_DAY,
      ) * 1440;
    minDelay = Math.min(minDelay, delayMinutes);
    maxDelay = Math.max(maxDelay, delayMinutes);
    points.push([phase, delayMinutes]);
  }

  const pad = Math.max(2, (maxDelay - minDelay) * 0.12);
  const yDomain = [minDelay - pad, maxDelay + pad];
  drawFrame(ctx, bounds, [0, 2], yDomain, {
    title: "Light Travel Time Delay",
    subtitle: `Orbital phase ${state.orbitalSweepPhase.toFixed(2)} | periastron phase ${orbit.periastronPhase.toFixed(3)}`,
    xLabel: "Orbital phase",
    yLabel: "Delay, minutes",
    invertY: false,
  });
  drawLine(ctx, bounds, [0, 2], yDomain, points, THEME.ltte, 2.1, 1, false);
  drawOrbitalMarker(ctx, bounds, [0, 2], yDomain);
}

function drawOrbitalMarker(ctx, bounds, xDomain, yDomain) {
  for (const phase of [state.orbitalSweepPhase, state.orbitalSweepPhase + 1]) {
    const x = mapX(bounds, xDomain, phase);
    ctx.save();
    ctx.strokeStyle = THEME.marker;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(x, bounds.top);
    ctx.lineTo(x, bounds.bottom);
    ctx.stroke();
    ctx.restore();
  }
}

function effectiveTPeri() {
  const orbit = state.controls.ltte;
  return orbit.referenceTPeri + orbit.periastronPhase * orbit.orbitalPeriodDays;
}

function currentMagnitudeDomain() {
  if (state.fixedMagDomain) return state.fixedMagDomain;
  return computeFixedMagnitudeDomain();
}

function computeFixedMagnitudeDomain() {
  const samples = [];
  const allModulators = [
    { key: "b1", ...state.controls.b1 },
    { key: "b2", ...state.controls.b2 },
  ];

  for (let phaseIndex = 0; phaseIndex <= 240; phaseIndex += 1) {
    const phase = (2 * phaseIndex) / 240;
    samples.push(sampleBaseMag(phase));
    for (let b1Index = 0; b1Index <= 12; b1Index += 1) {
      for (let b2Index = 0; b2Index <= 12; b2Index += 1) {
        samples.push(
          magWithModulators(
            phase,
            {
              blazhko: {
                b1: b1Index / 12,
                b2: b2Index / 12,
              },
              ltteShiftCycles: 0,
            },
            allModulators,
          ),
        );
      }
    }
  }

  const min = Math.min(...samples);
  const max = Math.max(...samples);
  const pad = Math.max(0.025, (max - min) * 0.10);
  return [min - pad, max + pad];
}

function setupCanvas(canvas) {
  const rect = canvas.getBoundingClientRect();
  const styles = getComputedStyle(canvas);
  const width = Math.max(260, rect.width || Number.parseFloat(styles.width) || 260);
  const height = Math.max(160, rect.height || Number.parseFloat(styles.height) || 200);
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.floor(width * dpr);
  canvas.height = Math.floor(height * dpr);
  const ctx = canvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);
  ctx.canvasCssWidth = width;
  ctx.canvasCssHeight = height;
  return ctx;
}

function plotBounds(canvas, left, top, right, bottom) {
  const width = canvas.width / (window.devicePixelRatio || 1);
  const height = canvas.height / (window.devicePixelRatio || 1);
  return {
    left,
    top,
    right: width - right,
    bottom: height - bottom,
    width: width - left - right,
    height: height - top - bottom,
  };
}

function drawFrame(ctx, bounds, xDomain, yDomain, options) {
  const invertY = options.invertY !== false;
  ctx.save();
  ctx.fillStyle = THEME.plotBg;
  ctx.fillRect(0, 0, ctx.canvasCssWidth, ctx.canvasCssHeight);
  ctx.strokeStyle = THEME.plotBorder;
  ctx.lineWidth = 1;
  ctx.strokeRect(bounds.left, bounds.top, bounds.width, bounds.height);

  ctx.font = "700 15px Inter, system-ui, sans-serif";
  ctx.fillStyle = THEME.title;
  ctx.fillText(options.title, bounds.left, 15);
  ctx.font = "12px Inter, system-ui, sans-serif";
  ctx.fillStyle = THEME.subtitle;
  ctx.fillText(options.subtitle, bounds.left, 34);

  drawTicks(ctx, bounds, xDomain, yDomain, invertY);
  ctx.font = "12px Inter, system-ui, sans-serif";
  ctx.fillStyle = THEME.label;
  ctx.textAlign = "center";
  ctx.fillText(options.xLabel, bounds.left + bounds.width / 2, bounds.bottom + 37);
  ctx.save();
  ctx.translate(14, bounds.top + bounds.height / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.fillText(options.yLabel, 0, 0);
  ctx.restore();
  ctx.restore();
}

function drawTicks(ctx, bounds, xDomain, yDomain, invertY) {
  ctx.save();
  ctx.font = "11px Inter, system-ui, sans-serif";
  ctx.fillStyle = THEME.subtitle;
  ctx.strokeStyle = THEME.grid;
  ctx.lineWidth = 1;

  for (const tick of linearTicks(xDomain[0], xDomain[1], 9)) {
    const x = mapX(bounds, xDomain, tick);
    ctx.textAlign = "center";
    ctx.fillText(formatTick(tick), x, bounds.bottom + 17);
  }

  for (const tick of linearTicks(yDomain[0], yDomain[1], 6)) {
    const y = mapY(bounds, yDomain, tick, invertY);
    ctx.textAlign = "right";
    ctx.fillText(formatTick(tick), bounds.left - 8, y + 4);
  }
  ctx.restore();
}

function drawLine(ctx, bounds, xDomain, yDomain, points, color, width, alpha = 1, invertY = true) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.globalAlpha = alpha;
  ctx.lineWidth = width;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.beginPath();
  points.forEach(([xValue, yValue], index) => {
    const x = mapX(bounds, xDomain, xValue);
    const y = mapY(bounds, yDomain, yValue, invertY);
    if (index === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();
  ctx.restore();
}

function drawBand(ctx, bounds, xDomain, yDomain, lower, upper, color) {
  ctx.save();
  ctx.fillStyle = color;
  ctx.beginPath();
  lower.forEach(([xValue, yValue], index) => {
    const x = mapX(bounds, xDomain, xValue);
    const y = mapY(bounds, yDomain, yValue);
    if (index === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  for (let index = upper.length - 1; index >= 0; index -= 1) {
    const [xValue, yValue] = upper[index];
    ctx.lineTo(mapX(bounds, xDomain, xValue), mapY(bounds, yDomain, yValue));
  }
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawLegend(ctx, bounds, rows) {
  ctx.save();
  ctx.font = "12px Inter, system-ui, sans-serif";
  ctx.textAlign = "left";
  const x = bounds.right - 160;
  let y = bounds.top + 18;
  for (const [label, color] of rows) {
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(x, y - 4);
    ctx.lineTo(x + 24, y - 4);
    ctx.stroke();
    ctx.fillStyle = THEME.label;
    ctx.fillText(label, x + 32, y);
    y += 19;
  }
  ctx.restore();
}

function mapX(bounds, domain, value) {
  return bounds.left + ((value - domain[0]) / (domain[1] - domain[0])) * bounds.width;
}

function mapY(bounds, domain, value, invertY = true) {
  const ratio = (value - domain[0]) / (domain[1] - domain[0]);
  return invertY ? bounds.top + ratio * bounds.height : bounds.bottom - ratio * bounds.height;
}

function linearTicks(min, max, count) {
  const values = [];
  const step = (max - min) / (count - 1);
  for (let index = 0; index < count; index += 1) values.push(min + step * index);
  return values;
}

function hash01(index, salt) {
  const value = Math.sin((index + 1) * 12.9898 + salt * 78.233) * 43758.5453123;
  return value - Math.floor(value);
}

function normal01(index, salt) {
  const u1 = Math.max(1.0e-9, hash01(index, salt));
  const u2 = hash01(index, salt + 101);
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(TAU * u2);
}

function formatTick(value) {
  const abs = Math.abs(value);
  if (abs >= 100) return value.toFixed(0);
  if (abs >= 10) return value.toFixed(1);
  return value.toFixed(2);
}

function mod(value, base) {
  return ((value % base) + base) % base;
}
