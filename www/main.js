window.onerror = function (msg, url, line) {
  console.log("App Error: " + msg + " line: " + line);
  return false;
};

// GLOBAL STATES & CONFIG
let currentIntervalMs = parseInt(localStorage.getItem('af_interval')) || 2000;
let currentTheme = localStorage.getItem('af_theme') || 'theme-default';
let tempUnit = localStorage.getItem('af_temp_unit') || 'C';
let batteryTimer = null;
let aodTimer = null;

// COULOMB COUNTING REAL-TIME INTEGRATION
let virtualLevel = null;
let lastTimestamp = Date.now();
const DESIGN_CAPACITY_MAH = 5000;

// HISTORY & SESSION LOGS
let historyPoints = [];
let sessionLogs = JSON.parse(localStorage.getItem('af_session_logs')) || [];
let isChargingSession = false;
let sessionStartLevel = 0;
let sessionStartTime = null;

// WEB AUDIO SYNTHESIZER FOR ALARMS (KHÔNG CẦN FILE MP3 NGOÀI)
function playAlarmChime() {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();

    const notes = [523.25, 659.25, 783.99]; // Nốt C5, E5, G5
    notes.forEach((freq, index) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, ctx.currentTime + index * 0.12);

      gain.gain.setValueAtTime(0.3, ctx.currentTime + index * 0.12);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + index * 0.12 + 0.3);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(ctx.currentTime + index * 0.12);
      osc.stop(ctx.currentTime + index * 0.12 + 0.3);
    });
  } catch (e) {
    console.log("Audio Error:", e);
  }
}

function testAlarmSound() {
  playAlarmChime();
  if (navigator.vibrate) navigator.vibrate([100, 50, 100]);
}

// TAB NAVIGATION
function switchTab(tabId, btnEl) {
  document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
  
  const targetTab = document.getElementById(tabId);
  if (targetTab) targetTab.classList.add('active');
  if (btnEl) btnEl.classList.add('active');
}

// THEME SWITCHER
function selectTheme(themeName, btnEl) {
  currentTheme = themeName;
  localStorage.setItem('af_theme', themeName);
  document.body.className = themeName;

  document.querySelectorAll('.theme-btn').forEach(b => b.classList.remove('active'));
  if (btnEl) btnEl.classList.add('active');
}

// TEMPERATURE UNIT TOGGLE
function changeTempUnit(unit) {
  tempUnit = unit;
  localStorage.setItem('af_temp_unit', unit);
  const btnC = document.getElementById('btn-unit-c');
  const btnF = document.getElementById('btn-unit-f');
  if (btnC) btnC.classList.toggle('active', unit === 'C');
  if (btnF) btnF.classList.toggle('active', unit === 'F');
  fetchBatteryStats();
}

// UPDATE SVG GAUGE CIRCLE
function updateGauge(pct, isCharging, powerW, tempC) {
  const fillCircle = document.getElementById('gauge-fill');
  if (!fillCircle) return;
  const maxDash = 502;
  const offset = maxDash - (maxDash * (pct / 100) * 0.75);
  fillCircle.style.strokeDashoffset = offset;

  if (tempC >= 42.0) {
    fillCircle.style.stroke = "#e53935"; // Màu đỏ khi quá nhiệt
  } else if (pct >= 99.5) {
    fillCircle.style.stroke = "#1e88e5"; // Màu xanh dương khi đầy 100%
  } else if (isCharging) {
    fillCircle.style.stroke = powerW >= 10 ? "var(--accent-green)" : "#ffa726";
  } else {
    fillCircle.style.stroke = pct <= 15 ? "#e53935" : "var(--accent-green)";
  }
}

// MAIN BATTERY FETCH & COULOMB COUNTING
function fetchBatteryStats() {
  let stats = null;

  if (window.AndroidBattery && typeof window.AndroidBattery.getBatteryStats === 'function') {
    try {
      stats = JSON.parse(window.AndroidBattery.getBatteryStats());
    } catch (e) {
      console.log('Error parsing stats:', e);
    }
  }

  // Web Browser Fallback khi test trên trình duyệt PC
  if (!stats || !stats.nativeOK) {
    stats = {
      level: 79.0,
      voltage: 4105,
      temp: 36.0,
      current: -552000,
      chargeCounter: 3895000,
      isCharging: false,
      plugType: 0,
      health: "Tốt",
      model: "SM-A055F",
      manufacturer: "samsung",
      board: "a05m",
      nativeOK: false
    };
    const navStatus = document.getElementById('lbl-native-status');
    if (navStatus) navStatus.innerText = "⚠️ Chế độ Web Preview (Chưa kết nối Bridge)";
  } else {
    const navStatus = document.getElementById('lbl-native-status');
    if (navStatus) navStatus.innerText = "✅ Đã kết nối phần cứng Android";
  }

  // 1. Dòng điện & Công suất
  let currentmA = Math.abs(stats.current) > 10000 ? Math.round(stats.current / 1000) : stats.current;
  if (!stats.isCharging && currentmA > 0) currentmA = -currentmA;

  let voltageV = stats.voltage / 1000.0;
  let powerW = ((voltageV * Math.abs(currentmA)) / 1000.0).toFixed(1);
  let powermW = Math.round(voltageV * Math.abs(currentmA));

  // 2. Tích phân Dòng điện (Coulomb Counting) cho % lẻ mượt
  let osLevel = parseFloat(stats.level) || 0;
  let now = Date.now();
  let dtSeconds = (now - lastTimestamp) / 1000.0;
  lastTimestamp = now;

  if (virtualLevel === null) {
    virtualLevel = osLevel;
  } else {
    let deltaPct = ((currentmA * (dtSeconds / 3600.0)) / DESIGN_CAPACITY_MAH) * 100.0;
    virtualLevel += deltaPct;

    if (virtualLevel > osLevel + 0.99) virtualLevel = osLevel + 0.99;
    if (virtualLevel < osLevel - 0.99) virtualLevel = osLevel - 0.99;
  }

  if (Math.floor(virtualLevel) !== Math.floor(osLevel)) {
    virtualLevel = osLevel;
  }

  let pct2Decimal = virtualLevel.toFixed(2);

  // 3. Đánh giá chất lượng củ sạc
  let chargerQuality = "Chưa cắm sạc";
  if (stats.isCharging) {
    if (powerW >= 18) chargerQuality = "⚡ Sạc siêu nhanh (Super Fast Charge)";
    else if (powerW >= 10) chargerQuality = "🔌 Sạc nhanh tiêu chuẩn";
    else if (powerW >= 5) chargerQuality = "🔋 Sạc thường (Standard Charge)";
    else chargerQuality = "🐢 Sạc chậm / Cáp nguồn yếu";
  }
  const chargerTypeEl = document.getElementById('lbl-charger-type');
  if (chargerTypeEl) chargerTypeEl.innerText = chargerQuality;

  // 4. Nhiệt độ theo đơn vị
  let displayTemp = stats.temp;
  let tempUnitStr = "°C";
  if (tempUnit === 'F') {
    displayTemp = (stats.temp * 9 / 5) + 32;
    tempUnitStr = "°F";
  }

  // 5. Cập nhật DOM
  const pctEl = document.getElementById('val-battery-pct');
  if (pctEl) pctEl.innerText = `${pct2Decimal.replace('.', ',')}%`;
  
  const statusEl = document.getElementById('lbl-charge-status');
  if (statusEl) statusEl.innerText = stats.isCharging ? 'ĐANG SẠC' : 'ĐANG XẢ';
  
  const powerMwEl = document.getElementById('lbl-power-mw');
  if (powerMwEl) powerMwEl.innerText = `${stats.isCharging ? '+' : '-'}${powermW} mW`;
  
  const voltEl = document.getElementById('val-voltage');
  if (voltEl) voltEl.innerText = `${stats.voltage} mV`;
  
  const currEl = document.getElementById('val-current');
  if (currEl) currEl.innerText = `${currentmA >= 0 ? '+' : ''}${currentmA} mA`;
  
  const powEl = document.getElementById('val-power');
  if (powEl) powEl.innerText = `${stats.isCharging ? '+' : '-'}${powerW} W`;
  
  const tempEl = document.getElementById('val-temp');
  if (tempEl) tempEl.innerText = `${displayTemp.toFixed(1)}${tempUnitStr}`;
  
  const healthEl = document.getElementById('val-health');
  if (healthEl) healthEl.innerText = stats.health;
  
  let plugStr = 'KHÔNG';
  if (stats.plugType === 1) plugStr = 'AC (Củ sạc)';
  else if (stats.plugType === 2) plugStr = 'USB';
  else if (stats.plugType === 4) plugStr = 'Không dây';
  const plugEl = document.getElementById('val-plug');
  if (plugEl) plugEl.innerText = plugStr;

  // TAB 2: Health & Wear
  const healthPctEl = document.getElementById('val-health-pct');
  if (healthPctEl) healthPctEl.innerText = `${pct2Decimal.replace('.', ',')}% ${stats.health}`;
  
  let currentCapmAh = stats.chargeCounter ? Math.round(stats.chargeCounter / 1000) : Math.round((virtualLevel / 100) * DESIGN_CAPACITY_MAH);
  const counterEl = document.getElementById('val-charge-counter');
  if (counterEl) counterEl.innerText = `${currentCapmAh} mAh`;
  
  let wearLevelPct = Math.max(0, ((DESIGN_CAPACITY_MAH - currentCapmAh) / DESIGN_CAPACITY_MAH) * 100).toFixed(1);
  const wearEl = document.getElementById('val-wear-level');
  if (wearEl) wearEl.innerText = `${wearLevelPct}%`;

  // Profile
  const modelEl = document.getElementById('val-device-model');
  if (modelEl) modelEl.innerText = stats.model || 'SM-A055F';
  
  const vendorEl = document.getElementById('val-device-vendor');
  if (vendorEl) vendorEl.innerText = stats.manufacturer || 'samsung';
  
  const boardEl = document.getElementById('val-device-board');
  if (boardEl) boardEl.innerText = stats.board || 'a05m';

  // Gauge & Session tracking
  updateGauge(virtualLevel, stats.isCharging, parseFloat(powerW), stats.temp);
  recordHistoryPoint(currentmA, stats.temp);
  trackSession(stats.isCharging, virtualLevel, powerW);

  // Alarms & AOD
  checkAlarms(virtualLevel, stats.temp);
  updateAOD(pct2Decimal.replace('.', ','), stats.isCharging, powerW, displayTemp.toFixed(1) + tempUnitStr, stats.voltage);
}

// SESSION TRACKING (LOGGING START/STOP CHARGE)
function trackSession(isCharging, pct, powerW) {
  if (isCharging && !isChargingSession) {
    isChargingSession = true;
    sessionStartTime = new Date();
    sessionStartLevel = pct;
  } else if (!isCharging && isChargingSession) {
    isChargingSession = false;
    let endTime = new Date();
    let durationMin = Math.round((endTime - sessionStartTime) / 60000);
    
    if (durationMin >= 1) {
      let logEntry = {
        date: sessionStartTime.toLocaleTimeString('vi-VN', {hour:'2-digit', minute:'2-digit'}),
        startPct: sessionStartLevel.toFixed(1),
        endPct: pct.toFixed(1),
        duration: durationMin
      };
      sessionLogs.unshift(logEntry);
      if (sessionLogs.length > 10) sessionLogs.pop();
      localStorage.setItem('af_session_logs', JSON.stringify(sessionLogs));
      renderSessionLogs();
    }
  }
}

function renderSessionLogs() {
  const container = document.getElementById('session-logs-list');
  if (!container) return;

  if (sessionLogs.length === 0) {
    container.innerHTML = '<div class="empty-log">Chưa có dữ liệu phiên sạc nào được ghi lại.</div>';
    return;
  }

  container.innerHTML = sessionLogs.map(log => `
    <div class="log-item">
      <span>🕒 ${log.date} (${log.duration} phút)</span>
      <strong>${log.startPct}% ➔ ${log.endPct}%</strong>
    </div>
  `).join('');
}

function clearSessionLogs() {
  sessionLogs = [];
  localStorage.removeItem('af_session_logs');
  renderSessionLogs();
}

// EXPORT HISTORY TO CSV
function exportHistoryCSV() {
  if (historyPoints.length === 0) {
    alert("Chưa có dữ liệu lịch sử để xuất!");
    return;
  }
  let csvContent = "data:text/csv;charset=utf-8,Lan,DongDien_mA,NhietDo_C\n";
  historyPoints.forEach((pt, idx) => {
    csvContent += `${idx + 1},${pt.current},${pt.temp}\n`;
  });
  const encodedUri = encodeURI(csvContent);
  const link = document.createElement("a");
  link.setAttribute("href", encodedUri);
  link.setAttribute("download", "ampereflow_battery_history.csv");
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

// DUAL-AXIS CANVAS CHART
function recordHistoryPoint(current, temp) {
  if (historyPoints.length > 25) historyPoints.shift();
  historyPoints.push({ current: Math.abs(current), temp: temp });
  renderChart();
}

function renderChart() {
  const canvas = document.getElementById('batteryChart');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  canvas.width = canvas.offsetWidth || 300;
  canvas.height = canvas.offsetHeight || 150;

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (historyPoints.length < 2) return;

  const w = canvas.width;
  const h = canvas.height;

  // 1. Dòng điện (Xanh)
  ctx.beginPath();
  ctx.strokeStyle = getComputedStyle(document.body).getPropertyValue('--accent-green').trim() || '#2d5a39';
  ctx.lineWidth = 3;
  for (let i = 0; i < historyPoints.length; i++) {
    let x = (i / (historyPoints.length - 1)) * w;
    let y = h - (historyPoints[i].current / 3000) * (h - 20) - 10;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();

  // 2. Nhiệt độ (Nâu / Cam)
  ctx.beginPath();
  ctx.strokeStyle = '#ff9800';
  ctx.lineWidth = 2;
  for (let i = 0; i < historyPoints.length; i++) {
    let x = (i / (historyPoints.length - 1)) * w;
    let y = h - ((historyPoints[i].temp - 20) / 30) * (h - 20) - 10;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();
}

// SMART ALARMS
function checkAlarms(pct, temp) {
  const chk80 = document.getElementById('chk-alarm-80');
  const chk100 = document.getElementById('chk-alarm-100');
  const chkHeat = document.getElementById('chk-alarm-heat');
  const chkSound = document.getElementById('chk-alarm-sound');

  let trigger = false;
  if (chk80 && chk80.checked && pct >= 80.0 && pct < 81.0) trigger = true;
  if (chk100 && chk100.checked && pct >= 99.8) trigger = true;
  if (chkHeat && chkHeat.checked && temp >= 42.0) trigger = true;

  if (trigger) {
    if (chkSound && chkSound.checked) playAlarmChime();
    if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
  }
}

// REFRESH INTERVAL SELECTOR
function changeInterval(ms, btnEl) {
  currentIntervalMs = ms;
  localStorage.setItem('af_interval', ms);

  document.querySelectorAll('.interval-btn').forEach(b => b.classList.remove('active'));
  if (btnEl) btnEl.classList.add('active');

  if (batteryTimer) clearInterval(batteryTimer);
  batteryTimer = setInterval(fetchBatteryStats, currentIntervalMs);
  fetchBatteryStats();
}

// ALWAYS ON DISPLAY (AOD) WITH ANTI-BURN-IN PIXEL SHIFTING
function toggleAOD(show) {
  const aod = document.getElementById('aod-overlay');
  if (aod) {
    if (show) {
      aod.classList.add('active');
      startAodPixelShift();
    } else {
      aod.classList.remove('active');
      if (aodTimer) clearInterval(aodTimer);
    }
  }
}

function startAodPixelShift() {
  if (aodTimer) clearInterval(aodTimer);
  aodTimer = setInterval(() => {
    const shiftBox = document.getElementById('aod-shift-box');
    if (!shiftBox) return;
    const randomX = Math.floor(Math.random() * 30) - 15;
    const randomY = Math.floor(Math.random() * 30) - 15;
    shiftBox.style.transform = `translate(${randomX}px, ${randomY}px)`;
  }, 60000);
}

function updateAOD(pctStr, isCharging, powerW, tempStr, voltage) {
  const clockEl = document.getElementById('aod-clock');
  const pctEl = document.getElementById('aod-pct');
  const statusEl = document.getElementById('aod-status');
  const subInfoEl = document.getElementById('aod-sub-info');

  if (clockEl) {
    const d = new Date();
    clockEl.innerText = `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
  }
  if (pctEl) pctEl.innerText = `${pctStr}%`;
  if (statusEl) statusEl.innerText = isCharging ? `⚡ SẠC +${powerW}W` : '🔋 ĐANG XẢ PIN';
  if (subInfoEl) subInfoEl.innerText = `${tempStr} · ${voltage} mV`;
}

// DOM INITIALIZATION
document.addEventListener('DOMContentLoaded', () => {
  document.body.className = currentTheme;
  document.querySelectorAll('.theme-btn').forEach(btn => {
    btn.classList.toggle('active', btn.getAttribute('data-theme') === currentTheme);
  });

  document.querySelectorAll('.interval-btn').forEach(btn => {
    btn.classList.toggle('active', parseInt(btn.getAttribute('data-ms')) === currentIntervalMs);
  });

  changeTempUnit(tempUnit);

  const aodBtn = document.getElementById('btn-aod');
  if (aodBtn) aodBtn.onclick = () => toggleAOD(true);

  const themeQuickBtn = document.getElementById('btn-theme-quick');
  if (themeQuickBtn) {
    themeQuickBtn.onclick = () => {
      const themes = ['theme-default', 'theme-oled', 'theme-neon'];
      let idx = (themes.indexOf(currentTheme) + 1) % themes.length;
      selectTheme(themes[idx], document.querySelector(`.theme-btn[data-theme="${themes[idx]}"]`));
    };
  }

  renderSessionLogs();

  batteryTimer = setInterval(fetchBatteryStats, currentIntervalMs);
  fetchBatteryStats();
});
 