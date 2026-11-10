window.onerror = function(msg, url, line) {
  console.log("App Error: " + msg + " line: " + line);
  return false;
};

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
      const raw = window.AndroidBattery.getBatteryStats();
      stats = JSON.parse(raw);
    } catch (e) {
      console.log('Error parsing stats:', e);
    }
  }
  
  // Nếu chưa lấy được phần cứng Native (chạy trên Web Preview)
  if (!stats || !stats.nativeOK) {
    document.getElementById('lbl-native-status').innerText = "⚠️ Chạy chế độ Web (Chưa nhận Native Bridge)";
    return;
  }
  
  document.getElementById('lbl-native-status').innerText = "✅ Đã kết nối phần cứng Android trực tiếp";
  
  // Quy đổi dòng điện (uA -> mA)
  let currentmA = Math.abs(stats.current) > 10000 ? Math.round(stats.current / 1000) : stats.current;
  if (!stats.isCharging && currentmA > 0) currentmA = -currentmA;
  
  let voltageV = stats.voltage / 1000.0;
  let powerW = ((voltageV * Math.abs(currentmA)) / 1000.0).toFixed(1);
  let powermW = Math.round(voltageV * Math.abs(currentmA));
  
  // Cập nhật thông số PIN THỰC TẾ
  document.getElementById('val-battery-pct').innerText = `${stats.level.toFixed(1)}%`;
  document.getElementById('lbl-charge-status').innerText = stats.isCharging ? 'ĐANG SẠC' : 'ĐANG XẢ';
  document.getElementById('lbl-power-mw').innerText = `${stats.isCharging ? '+' : '-'}${powermW} mW`;
  
  document.getElementById('val-voltage').innerText = `${stats.voltage} mV`;
  document.getElementById('val-current').innerText = `${currentmA >= 0 ? '+' : ''}${currentmA} mA`;
  document.getElementById('val-power').innerText = `${stats.isCharging ? '+' : '-'}${powerW} W`;
  document.getElementById('val-temp').innerText = `${stats.temp.toFixed(1)}°C`;
  
  let plugStr = 'KHÔNG';
  if (stats.plugType === 1) plugStr = 'AC (Sạc củ)';
  else if (stats.plugType === 2) plugStr = 'USB';
  else if (stats.plugType === 4) plugStr = 'KHIÊN KHÔNG DÂY';
  document.getElementById('val-plug').innerText = plugStr;
  
  // Cập nhật THÔNG TIN THIẾT BỊ THỰC TẾ (Model, Nhà sản xuất, Bo mạch)
  document.getElementById('val-device-model').innerText = stats.model || 'Unknown';
  document.getElementById('val-device-vendor').innerText = stats.manufacturer || 'Unknown';
  document.getElementById('val-device-board').innerText = stats.board || 'Unknown';
  
  updateGauge(stats.level);
  recordHistoryPoint(currentmA, stats.temp);
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
  canvas.height = canvas.offsetHeight || 160;
  
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
}

document.addEventListener('DOMContentLoaded', () => {
  fetchBatteryStats();
  setInterval(fetchBatteryStats, 2000);
});