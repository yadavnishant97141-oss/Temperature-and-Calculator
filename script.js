(function () {
  'use strict';

  var METER_MIN = -50;
  var METER_MAX = 150;
  var EPS = 1e-9;

  // Conversion modes: input unit -> output unit
  var MODES = {
    c2f: { from: 'C', to: 'F' },
    f2c: { from: 'F', to: 'C' },
    c2k: { from: 'C', to: 'K' },
    k2c: { from: 'K', to: 'C' }
  };

  // Color bands by Celsius value (upper bound is exclusive)
  var BANDS = [
    { max: 0,        color: '#5ef2ff', label: 'Freezing' },
    { max: 20,       color: '#3d8bff', label: 'Cool' },
    { max: 35,       color: '#34e89e', label: 'Comfortable' },
    { max: 50,       color: '#ff9f43', label: 'Warm' },
    { max: Infinity, color: '#ff4d8d', label: 'Hot' }
  ];

  function byId(id) { return document.getElementById(id); }

  var el = {
    input: byId('tempInput'),
    mode: byId('convType'),
    suffix: byId('unitSuffix'),
    error: byId('errorMsg'),
    convert: byId('convertBtn'),
    reset: byId('resetBtn'),
    resultCard: byId('resultCard'),
    resultValue: byId('resultValue'),
    resultNote: byId('resultNote'),
    arc: byId('gaugeArc'),
    needle: byId('needle'),
    gaugeValue: byId('gaugeValue'),
    gaugeStatus: byId('gaugeStatus'),
    badge: byId('statusBadge'),
    barTrack: byId('barTrack'),
    barFill: byId('barFill'),
    barPercent: byId('barPercent'),
    rangeNote: byId('rangeNote'),
    cardC: byId('cardC'),
    cardF: byId('cardF'),
    cardK: byId('cardK')
  };

  // ---------- Conversion helpers ----------
  function toCelsius(value, unit) {
    if (unit === 'F') return (value - 32) * 5 / 9;
    if (unit === 'K') return value - 273.15;
    return value;
  }

  function fromCelsius(c, unit) {
    if (unit === 'F') return (c * 9 / 5) + 32;
    if (unit === 'K') return c + 273.15;
    return c;
  }

  function symbol(unit) { return unit === 'K' ? ' K' : ' °' + unit; }

  function format(n) {
    if (Math.abs(n) < 0.005) n = 0; // avoid "-0.00"
    return n.toFixed(2);
  }

  function getBand(c) {
    for (var i = 0; i < BANDS.length; i++) {
      if (c < BANDS[i].max) return BANDS[i];
    }
    return BANDS[BANDS.length - 1];
  }

  // ---------- Validation ----------
  // Returns { ok: true, value } or { ok: false, message, empty }
  function validate(raw, unit) {
    var text = raw.trim();
    if (text === '') {
      return { ok: false, empty: true, message: '' };
    }
    var value = Number(text);
    if (!isFinite(value)) {
      return { ok: false, message: 'Enter a valid number, for example 25 or -40.5.' };
    }
    if (unit === 'K' && value < 0) {
      return { ok: false, message: 'Kelvin cannot be negative. Enter 0 K or higher.' };
    }
    if (toCelsius(value, unit) < -273.15 - EPS) {
      var limits = { C: '-273.15 °C', F: '-459.67 °F', K: '0 K' };
      return { ok: false, message: 'That is below absolute zero. The minimum is ' + limits[unit] + '.' };
    }
    return { ok: true, value: value };
  }

  // ---------- Rendering ----------
  function setMeters(c) {
    var band = getBand(c);
    var pct = (c - METER_MIN) / (METER_MAX - METER_MIN) * 100;
    var clamped = Math.min(100, Math.max(0, pct));

    document.documentElement.style.setProperty('--accent', band.color);
    el.arc.style.strokeDashoffset = String(100 - clamped);
    el.needle.style.transform = 'rotate(' + (-135 + clamped / 100 * 270) + 'deg)';
    el.barFill.style.width = clamped + '%';
    el.barTrack.setAttribute('aria-valuenow', String(Math.min(METER_MAX, Math.max(METER_MIN, c))));
    el.barPercent.textContent = clamped.toFixed(1) + '%';
    el.gaugeValue.textContent = format(c) + ' °C';
    el.gaugeStatus.textContent = band.label;
    el.badge.textContent = band.label;

    if (c < METER_MIN) {
      el.rangeNote.textContent = 'Below the meter range. Actual value: ' + format(c) + ' °C';
    } else if (c > METER_MAX) {
      el.rangeNote.textContent = 'Above the meter range. Actual value: ' + format(c) + ' °C';
    } else {
      el.rangeNote.textContent = '';
    }
  }

  function setIdle(note) {
    document.documentElement.style.setProperty('--accent', '#5ef2ff');
    el.arc.style.strokeDashoffset = '100';
    el.needle.style.transform = 'rotate(-135deg)';
    el.barFill.style.width = '0%';
    el.barTrack.setAttribute('aria-valuenow', String(METER_MIN));
    el.barPercent.textContent = '0%';
    el.rangeNote.textContent = '';
    el.gaugeValue.textContent = '--';
    el.gaugeStatus.textContent = 'Waiting for input';
    el.badge.textContent = 'Waiting for input';
    el.cardC.textContent = '--';
    el.cardF.textContent = '--';
    el.cardK.textContent = '--';
    el.resultValue.textContent = '--';
    el.resultNote.textContent = note;
  }

  function restartAnimation(node, className) {
    node.classList.remove('pulse', 'shake');
    void node.offsetWidth; // force reflow so the animation can replay
    node.classList.add(className);
  }

  // Main update. Returns true when the input is valid.
  function update() {
    var mode = MODES[el.mode.value];
    el.suffix.textContent = symbol(mode.from).trim();

    var check = validate(el.input.value, mode.from);

    if (!check.ok) {
      el.error.textContent = check.message;
      el.input.classList.toggle('invalid', !check.empty);
      setIdle(check.empty ? 'Enter a temperature to begin' : 'Fix the input to see a result');
      return false;
    }

    el.error.textContent = '';
    el.input.classList.remove('invalid');

    var c = toCelsius(check.value, mode.from);
    var f = fromCelsius(c, 'F');
    var k = fromCelsius(c, 'K');
    var result = fromCelsius(c, mode.to);

    el.cardC.textContent = format(c) + ' °C';
    el.cardF.textContent = format(f) + ' °F';
    el.cardK.textContent = format(k) + ' K';
    el.resultValue.textContent = format(result) + symbol(mode.to);
    el.resultNote.textContent = format(check.value) + symbol(mode.from) + ' = ' + format(result) + symbol(mode.to);

    setMeters(c);
    return true;
  }

  function onConvert() {
    var ok = update();
    restartAnimation(el.resultCard, ok ? 'pulse' : 'shake');
    if (!ok && el.input.value.trim() === '') {
      el.error.textContent = 'Enter a temperature before converting.';
      el.input.focus();
    }
  }

  function onReset() {
    el.input.value = '';
    el.mode.value = 'c2f';
    el.input.classList.remove('invalid');
    el.error.textContent = '';
    update();
    el.input.focus();
  }

  // ---------- Events (each attached once) ----------
  el.input.addEventListener('input', update);
  el.mode.addEventListener('change', update);
  el.convert.addEventListener('click', onConvert);
  el.reset.addEventListener('click', onReset);
  el.input.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') onConvert();
  });

  update();
})();
