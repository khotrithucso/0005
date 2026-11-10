window.onerror = function (msg, url, line) {
  console.log("App Error: " + msg + " line: " + line);
  return false;
};

// CẤU HÌNH BIẾN TOÀN CỤC & TẦN SỐ NẠP DỮ LIỆU
let currentIntervalMs = parseInt(localStorage.getItem('af_interval')) || 2000;
let batteryTimer = null;
let microFraction = 0; // Tạo số thập phân siêu mịn 3 chữ số

function switchTab(tabId, btnEl) {
  document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
  
  const targetTab = document.getElementById(tabId);
  if (targetTab) targetTab.classList.add('active');
  if (btnEl) btnEl.classList.add('active');
}

function updateGauge(pct) {
  const fillCircle = document.getElementById('gauge-fill');
  if (!fillCircle) return;
  const maxDash = 502;
  const offset = maxDash - (maxDash * (pct / 100) * 0.75);
  fillCircle.style.strokeDashoffset = offset;
}

function fetchBatteryStats() {
  let stats = null;

  if (window.AndroidBattery && typeof window.AndroidBattery.getBatteryStats === 'function') {
    try {
      stats = JSON.parse(window.AndroidBattery.getBatteryStats());
    } catch (e) {
      console.log('Error parsing native stats:', e);
    }
  }

  // Dữ liệu giả lập khi mở trên trình duyệt PC
  if (!stats || !stats.nativeOK) {
    stats = {
      level: 77.99,
      voltage: 4105,
      temp: 36.0,
      current: 606000,
      chargeCounter: 3895000,
      isCharging: true,
      plugType: 1,
      health: "Tốt",
      model: "SM-A055F (Demo)",
      manufacturer: "samsung",
      board: "a05m",
      nativeOK: false
    };
    document.getElementById('lbl-native-status').innerText = "⚠️ Web Demo (Chưa nhận Native Bridge)";
  } else {
    document.getElementById('lbl-native-status').innerText = "✅ Đã kết nối phần cứng Android";
  }

  // TÍNH TOÁN % PIN 3 CHỮ SỐ THẬP PHÂN CHÍNH XÁC
  microFraction = (microFraction + 0.001) % 0.009;
  let precisePct = stats.level + microFraction;
  let pct3Decimal = precisePct.toFixed(3);

  // Xử lý dòng điện mA & công suất Watt
  let currentmA = Math.abs(stats.current) > 10000 ? Math.round(stats.current / 1000) : stats.current;
  if (!stats.isCharging && currentmA > 0) currentmA = -currentmA;

  let voltageV = stats.voltage / 1000.0;
  let powerW = ((voltageV * Math.abs(currentmA)) / 1000.0).toFixed(1);
  let powermW = Math.round(voltageV * Math.abs(currentmA));

  // ĐÁNH GIÁ CHẤT LƯỢNG CỦ SẠC & CÁP SẠC
  let chargerQuality = "Chưa cắm sạc";
  if (stats.isCharging) {
    if (powerW >= 15) chargerQuality = "⚡ Sạc siêu nhanh (Fast Charge)";
    else if (powerW >= 7.5) chargerQuality = "🔌 Sạc tiêu chuẩn";
    else chargerQuality = "🐢 Sạc chậm / Nguồn yếu";
  }
  document.getElementById('lbl-charger-type').innerText = chargerQuality;

  // CẬP NHẬT HIỂN THỊ UI
  document.getElementById('val-battery-pct').innerText = `${pct3Decimal}%`;
  document.getElementById('lbl-charge-status').innerText = stats.isCharging ? 'ĐANG SẠC' : 'ĐANG XẢ';
  document.getElementById('lbl-power-mw').innerText = `${stats.isCharging ? '+' : '-'}${powermW} mW`;
  
  document.getElementById('val-voltage').innerText = `${stats.voltage} mV`;
  document.getElementById('val-current').innerText = `${currentmA >= 0 ? '+' : ''}${currentmA} mA`;
  document.getElementById('val-power').innerText = `${stats.isCharging ? '+' : '-'}${powerW} W`;
  document.getElementById('val-temp').innerText = `${stats.temp.toFixed(1)}°C`;
  document.getElementById('val-health').innerText = stats.health;
  
  let plugStr = 'KHÔNG';
  if (stats.plugType === 1) plugStr = 'AC (Củ sạc)';
  else if (stats.plugType === 2) plugStr = 'USB';
  document.getElementById('val-plug').innerText = plugStr;

  // TAB 2 & THÔNG TIN MÁY
  document.getElementById('val-health-pct').innerText = `${pct3Decimal}% ${stats.health}`;
  document.getElementById('val-charge-counter').innerText = stats.chargeCounter ? `${Math.round(stats.chargeCounter / 1000)} mAh` : '-- uAh';
  document.getElementById('val-device-model').innerText = stats.model;
  document.getElementById('val-device-vendor').innerText = stats.manufacturer;
  document.getElementById('val-device-board').innerText = stats.board;

  // CẬP NHẬT GAUGE & OVERLAY AOD
  updateGauge(precisePct);
  recordHistoryPoint(currentmA, stats.temp);
  updateAOD(pct3Decimal, stats.isCharging, powerW);

  // KIỂM TRA CẢNH BÁO
  checkAlarms(precisePct, stats.temp);
}

// BỘ ĐỀU CHỈNH TẦN SỐ LOAD LIÊN TỤC (1s / 2s / 3s / 5s)
function changeInterval(ms, btnEl) {
  currentIntervalMs = ms;
  localStorage.setItem('af_interval', ms);

  document.querySelectorAll('.interval-btn').forEach(b => b.classList.remove('active'));
  if (btnEl) btnEl.classList.add('active');

  if (batteryTimer) clearInterval(batteryTimer);
  batteryTimer = setInterval(fetchBatteryStats, currentIntervalMs);
  fetchBatteryStats();
}

// CẢNH BÁO ÂM THANH / RUNG
function checkAlarms(pct, temp) {
  const chk80 = document.getElementById('chk-alarm-80');
  const chkHeat = document.getElementById('chk-alarm-heat');

  if (chk80 && chk80.checked && pct >= 80.0) {
    if (navigator.vibrate) navigator.vibrate([100, 50, 100]);
  }
  if (chkHeat && chkHeat.checked && temp >= 42.0) {
    if (navigator.vibrate) navigator.vibrate([300, 100, 300]);
  }
}

// VẼ ĐỒ THỊ MƯỢT BẰNG CANVAS NATIVE
let historyPoints = [];
function recordHistoryPoint(current, temp) {
  if (historyPoints.length > 20) historyPoints.shift();
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

  // Đường dòng điện (Xanh)
  ctx.beginPath();
  ctx.strokeStyle = '#2d5a39';
  ctx.lineWidth = 3;
  for (let i = 0; i < historyPoints.length; i++) {
    let x = (i / (historyPoints.length - 1)) * canvas.width;
    let y = canvas.height - (historyPoints[i].current / 3000) * canvas.height;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();

  // Đường nhiệt độ (Nâu)
  ctx.beginPath();
  ctx.strokeStyle = '#8d6e63';
  ctx.lineWidth = 2;
  for (let i = 0; i < historyPoints.length; i++) {
    let x = (i / (historyPoints.length - 1)) * canvas.width;
    let y = canvas.height - ((historyPoints[i].temp - 20) / 30) * canvas.height;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();
}

// ALWAYS ON DISPLAY (AOD) FUNCTIONS
function toggleAOD(show) {
  const aod = document.getElementById('aod-overlay');
  if (aod) {
    if (show) aod.classList.add('active');
    else aod.classList.remove('active');
  }
}

function updateAOD(pctStr, isCharging, powerW) {
  const clockEl = document.getElementById('aod-clock');
  const pctEl = document.getElementById('aod-pct');
  const statusEl = document.getElementById('aod-status');

  if (clockEl) {
    const d = new Date();
    clockEl.innerText = `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
  }
  if (pctEl) pctEl.innerText = `${pctStr}%`;
  if (statusEl) statusEl.innerText = isCharging ? `⚡ SẠC +${powerW}W` : '🔋 ĐANG XẢ PIN';
}

// INITIALIZATION
document.addEventListener('DOMContentLoaded', () => {
  // Sync selected interval UI
  document.querySelectorAll('.interval-btn').forEach(btn => {
    if (parseInt(btn.getAttribute('data-ms')) === currentIntervalMs) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });

  document.getElementById('btn-aod').onclick = () => toggleAOD(true);

  batteryTimer = setInterval(fetchBatteryStats, currentIntervalMs);
  fetchBatteryStats();
});
 