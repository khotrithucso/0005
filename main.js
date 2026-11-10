// BẮT LỖI RUNTIME TOÀN CỤC TRÁNH TRẮNG MÀN HÌNH
window.onerror = function (msg, url, line) {
  console.log("App Error: " + msg + " line: " + line);
  return false;
};

// CẤU HÌNH APP & ADMOB ADAPTIVE BANNER
const APP_CONFIG = {
  bannerAdId: "ca-app-pub-3940256099942544/6300978111"
};

// 1. CHUYỂN TAB NAVIGATION
function switchTab(tabId, btnEl) {
  document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
  
  const targetTab = document.getElementById(tabId);
  if (targetTab) targetTab.classList.add('active');
  if (btnEl) btnEl.classList.add('active');
}

// 2. CẬP NHẬT GIAO DIỆN VÒNG CUNG (GAUGE METER)
function updateGauge(pct) {
  const fillCircle = document.getElementById('gauge-fill');
  if (!fillCircle) return;
  
  // Tính toán stroke-dashoffset dựa trên tỉ lệ % pin
  const maxDash = 502;
  const offset = maxDash - (maxDash * (pct / 100) * 0.75);
  fillCircle.style.strokeDashoffset = offset;
}

// 3. ĐỌC DỮ LIỆU TỪ NATIVE ANDROID BRIDGE HOẶC GIẢ LẬP KHI TEST TRÊN BÌNH THƯỜNG
function fetchBatteryStats() {
  let stats;

  if (window.AndroidBattery && window.AndroidBattery.getBatteryStats) {
    try {
      stats = JSON.parse(window.AndroidBattery.getBatteryStats());
    } catch (e) {
      console.log('Error parsing Android stats:', e);
    }
  }

  // Nếu chạy trên trình duyệt PC / Spck Editor không có Android Native Bridge -> Dùng Mock Data
  if (!stats || typeof stats.level === 'undefined') {
    stats = {
      level: 77.99,
      voltage: 4105,
      temp: 36.0,
      current: 606000, // microampere
      isCharging: true,
      plugType: 1
    };
  }

  // Quy đổi dòng điện về mA (Android trả về uA nếu > 10000)
  let currentmA = Math.abs(stats.current) > 10000 ? Math.round(stats.current / 1000) : stats.current;
  if (!stats.isCharging) currentmA = -Math.abs(currentmA);

  // Tính công suất Watt (W = V * A)
  let voltageV = stats.voltage / 1000.0;
  let powerW = ((voltageV * Math.abs(currentmA)) / 1000.0).toFixed(1);
  let powermW = Math.round(voltageV * Math.abs(currentmA));

  // Cập nhật lên UI
  document.getElementById('val-battery-pct').innerText = `${stats.level.toFixed(2)}%`;
  document.getElementById('lbl-charge-status').innerText = stats.isCharging ? 'SẠC' : 'ĐANG XẢ';
  document.getElementById('lbl-power-mw').innerText = `${stats.isCharging ? '+' : '-'}${powermW} mW`;
  
  document.getElementById('val-voltage').innerText = `${stats.voltage} mV`;
  document.getElementById('val-current').innerText = `${currentmA >= 0 ? '+' : ''}${currentmA} mA`;
  document.getElementById('val-power').innerText = `${stats.isCharging ? '+' : '-'}${powerW} W`;
  document.getElementById('val-temp').innerText = `${stats.temp.toFixed(1)}°C`;
  document.getElementById('val-health').innerText = `99%`;
  document.getElementById('val-plug').innerText = stats.plugType === 2 ? 'USB' : 'AC';

  updateGauge(stats.level);
  recordHistoryPoint(currentmA, stats.temp);
}

// 4. VẼ ĐỒ THỊ NHIỆT ĐỘ & DÒNG ĐIỆN BẰNG CANVAS NGUYÊN BẢN (KHÔNG CẦN THƯ VIỆN NGOÀI)
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

  const w = canvas.width;
  const h = canvas.height;

  ctx.clearRect(0, 0, w, h);

  if (historyPoints.length < 2) return;

  // Vẽ đường Tốc độ sạc (Màu xanh)
  ctx.beginPath();
  ctx.strokeStyle = '#2d5a39';
  ctx.lineWidth = 3;
  for (let i = 0; i < historyPoints.length; i++) {
    let x = (i / (historyPoints.length - 1)) * w;
    let y = h - (historyPoints[i].current / 1500) * h;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();

  // Vẽ đường Nhiệt độ (Màu nâu)
  ctx.beginPath();
  ctx.strokeStyle = '#8d6e63';
  ctx.lineWidth = 2;
  for (let i = 0; i < historyPoints.length; i++) {
    let x = (i / (historyPoints.length - 1)) * w;
    let y = h - ((historyPoints[i].temp - 20) / 30) * h;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();
}

// 5. KHỞI TẠO ADMOB BANNER
async function initAdMob() {
  if (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.AdMob) {
    try {
      const { AdMob } = window.Capacitor.Plugins;
      await AdMob.initialize({});
      AdMob.showBanner({
        adId: APP_CONFIG.bannerAdId,
        adSize: 'ADAPTIVE_BANNER',
        position: 'BOTTOM_CENTER',
        margin: 0
      });
    } catch (e) {
      console.log('AdMob Init Error:', e);
    }
  }
}

// LÊN LỊCH CHẠY
document.addEventListener('DOMContentLoaded', () => {
  fetchBatteryStats();
  setInterval(fetchBatteryStats, 2000); // Cập nhật dữ liệu pin mỗi 2s
  setTimeout(initAdMob, 1200);
});
 