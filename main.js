window.onerror = function(msg, url, line) {
  console.log("App Error: " + msg + " line: " + line);
  return false;
};

let currentIntervalMs = parseInt(localStorage.getItem('af_interval')) || 2000;
let batteryTimer = null;

// BIẾN LƯU % PIN ẢO TÍCH HỢP TÍCH PHÂN DÒNG ĐIỆN (COULOMB COUNTING)
let virtualLevel = null;
let lastTimestamp = Date.now();

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
  
  // Dữ liệu Fallback khi test trên Web
  if (!stats || !stats.nativeOK) {
    stats = {
      level: 79.0,
      voltage: 4052,
      temp: 38.0,
      current: -552000, // uA
      chargeCounter: 3895000,
      isCharging: false,
      plugType: 0,
      health: "Tốt",
      model: "SM-A055F",
      manufacturer: "samsung",
      board: "a05m",
      nativeOK: false
    };
    document.getElementById('lbl-native-status').innerText = "⚠️ Chế độ Web (Chưa nhận Native Bridge)";
  } else {
    document.getElementById('lbl-native-status').innerText = "✅ Đã kết nối phần cứng Android";
  }
  
  // 1. XỬ LÝ DÒNG ĐIỆN (mA) VÀ CÔNG SUẤT (W)
  let currentmA = Math.abs(stats.current) > 10000 ? Math.round(stats.current / 1000) : stats.current;
  if (!stats.isCharging && currentmA > 0) currentmA = -currentmA; // Nếu xả pin thì mang dấu âm
  
  let voltageV = stats.voltage / 1000.0;
  let powerW = ((voltageV * Math.abs(currentmA)) / 1000.0).toFixed(1);
  let powermW = Math.round(voltageV * Math.abs(currentmA));
  
  // 2. THUẬT TOÁN COULOMB COUNTING TÍNH % PIN THẬP PHÂN THỰC TẾ
  let osLevel = parseFloat(stats.level) || 0; // Số nguyên Android OS gửi về (VD: 79.0)
  let now = Date.now();
  let dtSeconds = (now - lastTimestamp) / 1000.0; // Thời gian trôi qua giữa 2 lần đọc (giây)
  lastTimestamp = now;
  
  // Giả định dung lượng pin mặc định thiết bị (VD: 5000 mAh)
  let designCapacitymAh = 5000;
  
  if (virtualLevel === null) {
    virtualLevel = osLevel; // Khởi tạo lần đầu
  } else {
    // Công thức tích phân: Delta_Q (mAh) = (dòng_mA * thời_gian_s) / 3600
    // Delta_% = (Delta_Q / dung_lượng_mAh) * 100
    let deltaPct = ((currentmA * (dtSeconds / 3600.0)) / designCapacitymAh) * 100.0;
    virtualLevel += deltaPct;
    
    // Ép biên độ: Không cho % ảo lệch quá 0.99% so với % thật của Android OS
    if (virtualLevel > osLevel + 0.99) virtualLevel = osLevel + 0.99;
    if (virtualLevel < osLevel - 0.99) virtualLevel = osLevel - 0.99;
  }
  
  // Nếu Android OS vừa nhảy sang 1% mới (VD từ 79% xuống 78%), đồng bộ ngay
  if (Math.floor(virtualLevel) !== Math.floor(osLevel)) {
    virtualLevel = osLevel;
  }
  
  let pct2Decimal = virtualLevel.toFixed(2); // Định dạng 2 chữ số thập phân
  
  // 3. CHẨN ĐOÁN CỦ SẠC
  let chargerQuality = "Chưa cắm sạc";
  if (stats.isCharging) {
    if (powerW >= 15) chargerQuality = "⚡ Sạc siêu nhanh (Fast Charge)";
    else if (powerW >= 7.5) chargerQuality = "🔌 Sạc tiêu chuẩn";
    else chargerQuality = "🐢 Sạc chậm / Nguồn yếu";
  }
  document.getElementById('lbl-charger-type').innerText = chargerQuality;
  
  // 4. CẬP NHẬT GIAO DIỆN APP
  document.getElementById('val-battery-pct').innerText = `${pct2Decimal.replace('.', ',')}%`;
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
  
  // CẬP NHẬT THÔNG TIN THIẾT BỊ
  const healthEl = document.getElementById('val-health-pct');
  if (healthEl) healthEl.innerText = `${pct2Decimal.replace('.', ',')}% ${stats.health}`;
  
  const counterEl = document.getElementById('val-charge-counter');
  if (counterEl) counterEl.innerText = stats.chargeCounter ? `${Math.round(stats.chargeCounter / 1000)} mAh` : '-- uAh';
  
  document.getElementById('val-device-model').innerText = stats.model;
  document.getElementById('val-device-vendor').innerText = stats.manufacturer;
  document.getElementById('val-device-board').innerText = stats.board;
  
  updateGauge(virtualLevel);
  recordHistoryPoint(currentmA, stats.temp);
  updateAOD(pct2Decimal.replace('.', ','), stats.isCharging, powerW);
  
  checkAlarms(virtualLevel, stats.temp);
}

function changeInterval(ms, btnEl) {
  currentIntervalMs = ms;
  localStorage.setItem('af_interval', ms);
  
  document.querySelectorAll('.interval-btn').forEach(b => b.classList.remove('active'));
  if (btnEl) btnEl.classList.add('active');
  
  if (batteryTimer) clearInterval(batteryTimer);
  batteryTimer = setInterval(fetchBatteryStats, currentIntervalMs);
  fetchBatteryStats();
}

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

document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('.interval-btn').forEach(btn => {
    if (parseInt(btn.getAttribute('data-ms')) === currentIntervalMs) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });
  
  const aodBtn = document.getElementById('btn-aod');
  if (aodBtn) aodBtn.onclick = () => toggleAOD(true);
  
  batteryTimer = setInterval(fetchBatteryStats, currentIntervalMs);
  fetchBatteryStats();
});