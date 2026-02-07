
// State
let currentState = {
    location: null,
    date: new Date().getFullYear() === 2026
        ? new Date().toISOString().split('T')[0]
        : "2026-01-01",
    chart: null,
    loadedData: null,
    lastLoadedCode: null,
    allStations: []
};

// DOM Elements
const stationSelect = document.getElementById('station-select');
// locationList is removed
const datePicker = document.getElementById('date-picker');
const highTideList = document.getElementById('high-tide-list');
const lowTideList = document.getElementById('low-tide-list');
const ctx = document.getElementById('tideChart').getContext('2d');
const prefSelect = document.getElementById('pref-select');
const prevDayBtn = document.getElementById('prev-day');
const nextDayBtn = document.getElementById('next-day');
const tideTypeSpan = document.getElementById('tide-type');

// Geographical Order (North to South)
const PREFECTURE_ORDER = [
    "北海道", "青森", "岩手", "宮城", "秋田", "山形", "福島",
    "茨城", "栃木", "群馬", "埼玉", "千葉", "東京", "神奈川",
    "新潟", "富山", "石川", "福井", "山梨", "長野", "岐阜", "静岡", "愛知",
    "三重", "滋賀", "京都", "大阪", "兵庫", "奈良", "和歌山",
    "鳥取", "島根", "岡山", "広島", "山口",
    "徳島", "香川", "愛媛", "高知",
    "福岡", "佐賀", "長崎", "熊本", "大分", "宮崎", "鹿児島", "沖縄",
    "その他"
];

/**
 * Initialize Application
 */
async function init() {
    try {
        // Load station list with cache buster
        const response = await fetch(`data/stations.json?t=${Date.now()}`);
        if (!response.ok) throw new Error('Stations list not found');
        currentState.allStations = await response.json();

        // Extract unique prefectures and sort
        const prefectures = [...new Set(currentState.allStations.map(st => st.pref || "その他"))];
        prefectures.sort((a, b) => {
            const indexA = PREFECTURE_ORDER.indexOf(a);
            const indexB = PREFECTURE_ORDER.indexOf(b);
            // Handle unknown prefs (put them at the end if not in list)
            return (indexA === -1 ? 999 : indexA) - (indexB === -1 ? 999 : indexB);
        });

        // Populate prefecture dropdown
        prefectures.forEach(pref => {
            const option = document.createElement('option');
            option.value = pref;
            option.textContent = pref;
            prefSelect.appendChild(option);
        });

        // Populate initial datalist (all stations)
        // Populate initial datalist (all stations)
        updateStationList(currentState.allStations, true);

        // Ensure input shows current selection correctly with prefecture
        if (currentState.location) {
            // Also select the prefecture in dropdown if available
            if (currentState.location.pref) prefSelect.value = currentState.location.pref;

            // Set station select value
            stationSelect.value = currentState.location.code;
        } else {
            stationSelect.value = "";
        }

        // Set default date (2026)
        datePicker.value = currentState.date;
        // Limit date picker to 2026
        datePicker.min = "2026-01-01";
        datePicker.max = "2026-12-31";

        // Event Listeners
        // locationInput select listener removed as it's a dropdown now
        stationSelect.addEventListener('change', handleLocationChange);

        prefSelect.addEventListener('change', (e) => {
            const selectedPref = e.target.value;
            stationSelect.value = ""; // Reset station selection

            if (selectedPref) {
                const filtered = currentState.allStations.filter(st => st.pref === selectedPref);
                updateStationList(filtered, false); // Don't show pref prefix if filtered
            } else {
                updateStationList(currentState.allStations, true);
            }
        });

        // Date Navigation Listeners
        prevDayBtn.addEventListener('click', () => changeDate(-1));
        nextDayBtn.addEventListener('click', () => changeDate(1));

        datePicker.addEventListener('change', (e) => {
            currentState.date = e.target.value;
            renderCurrentData();
        });

        // Initial Fetch
        fetchAndRender();

    } catch (error) {
        console.error('Init error:', error);
        // Fallback or show error if data/stations.json is not yet generated
        showError('初期化に失敗しました。GitHub Actionsの完了をお待ちください。');
    }
}

function updateStationList(stations, showPref = true) {
    // Clear existing options
    stationSelect.innerHTML = '<option value="">地点を選択...</option>';

    stations.forEach(st => {
        const option = document.createElement('option');
        option.value = st.code;
        const pref = (showPref && st.pref && st.pref !== "不明") ? `${st.pref} > ` : "";
        option.textContent = `${pref}${st.name}`;
        stationSelect.appendChild(option);
    });
}

function handleLocationChange(e) {
    const code = e.target.value;
    if (!code) return; // Selected default option

    const match = currentState.allStations.find(st => st.code === code);
    if (match) {
        currentState.location = match;
        fetchAndRender();
    }
}

/**
 * Load JMA Data from local JSON
 */
async function fetchAndRender() {
    try {
        if (!currentState.location) {
            // If no location selected, just update Tide Type as it depends only on date
            if (typeof updateTideType === 'function') {
                updateTideType(currentState.date);
            }
            return;
        }

        const code = currentState.location.code;

        // Only reload if station changed
        if (currentState.lastLoadedCode !== code) {
            const url = `data/raw/${code}.json`;
            const response = await fetch(url);
            if (!response.ok) throw new Error('Data file not found');
            currentState.loadedData = await response.json();
            currentState.lastLoadedCode = code;
        }

        renderCurrentData();

    } catch (error) {
        console.error('Error loading data:', error);
        showError('データの読み込みに失敗しました。');
    }
}

/**
 * Extract daily data and render
 */
function renderCurrentData() {
    const dateStr = currentState.date;

    // Always update Tide Type (Moon Age)
    if (typeof updateTideType === 'function') {
        updateTideType(dateStr);
    }

    if (!currentState.loadedData) return;

    const dayData = currentState.loadedData.find(d => d.date === dateStr);

    if (!dayData) {
        showError('該当する日付のデータがありません。');
        return;
    }

    // JMA data is in cm, convert to m for display consistency
    const hourlyHeights = dayData.hourly.map(h => h !== null ? h / 100 : null);
    const hourlyTimes = Array.from({ length: 24 }, (_, i) => `${dateStr}T${i.toString().padStart(2, '0')}:00`);

    processAndRender({
        hourly: {
            time: hourlyTimes,
            tide_height: hourlyHeights
        }
    });

    // Fetch and render weather if location has lat/lon
    if (currentState.location.lat && currentState.location.lon) {
        fetchWeatherData(currentState.location.lat, currentState.location.lon, dateStr);
    } else {
        document.getElementById('weather-container').innerHTML = '';
    }
}

async function fetchWeatherData(lat, lon, date) {
    const container = document.getElementById('weather-container');
    container.innerHTML = '<p style="text-align:center; color:#666;">天気情報を読み込み中...</p>';

    try {
        const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&hourly=weather_code,wind_speed_10m,wind_direction_10m,temperature_2m&timezone=Asia%2FTokyo&start_date=${date}&end_date=${date}`;

        const response = await fetch(url);
        if (!response.ok) throw new Error('Weather API error');

        const data = await response.json();

        if (!data.hourly) throw new Error('No weather data');

        renderWeatherChart(data.hourly);

    } catch (e) {
        console.error(e);
        container.innerHTML = '<p style="text-align:center; color:#999;">天気情報の取得に失敗しました</p>';
    }
}

function renderWeatherChart(hourlyData) {
    const container = document.getElementById('weather-container');
    container.innerHTML = '<canvas id="weatherChart" height="150"></canvas>';

    const ctxWeather = document.getElementById('weatherChart').getContext('2d');

    // Mapping WMO Weather Codes to Japanese/Icons (Simple)
    // 0: Clear, 1-3: Cloudy, 45-48: Fog, 51-67: Rain, 71-77: Snow, 80-82: Showers, 95-99: Thunderstorm
    const getWeatherIcon = (code) => {
        if (code === 0) return '☀️'; // Clear
        if (code <= 3) return '☁️'; // Cloudy
        if (code <= 48) return '🌫️'; // Fog
        if (code <= 67) return '🌧️'; // Rain
        if (code <= 77) return '❄️'; // Snow
        if (code <= 82) return '🌧️'; // Showers
        if (code <= 99) return '⚡'; // Thunderstorm
        return '❓';
    };

    const labels = hourlyData.time.map(t => t.split('T')[1].substring(0, 5));
    const windSpeeds = hourlyData.wind_speed_10m;
    const weatherCodes = hourlyData.weather_code;
    const windDirs = hourlyData.wind_direction_10m;
    const temperatures = hourlyData.temperature_2m;

    new Chart(ctxWeather, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [
                {
                    label: '風速 (m/s)',
                    data: windSpeeds,
                    backgroundColor: 'rgba(54, 162, 235, 0.5)',
                    borderColor: 'rgba(54, 162, 235, 1)',
                    borderWidth: 1,
                    yAxisID: 'y',
                    order: 2
                },
                {
                    label: '気温 (°C)',
                    data: temperatures,
                    type: 'line',
                    borderColor: 'rgba(255, 99, 132, 1)',
                    backgroundColor: 'rgba(255, 99, 132, 0.2)',
                    borderWidth: 2,
                    pointRadius: 2,
                    tension: 0.4,
                    yAxisID: 'y1',
                    order: 1
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { position: 'top' },
                tooltip: {
                    callbacks: {
                        afterLabel: function (context) {
                            if (context.dataset.yAxisID === 'y1') return null; // Skip extra info for temp
                            const index = context.dataIndex;
                            const code = weatherCodes[index];
                            const dir = windDirs[index];
                            return ` 天気: ${getWeatherIcon(code)}  風向: ${dir}°`;
                        }
                    }
                }
            },
            scales: {
                x: {
                    grid: { display: false }
                },
                y: {
                    beginAtZero: true,
                    title: { display: true, text: '風速 (m/s)' },
                    position: 'left'
                },
                y1: {
                    beginAtZero: false,
                    title: { display: true, text: '気温 (°C)' },
                    position: 'right',
                    grid: { display: false }
                }
            }
        },
        plugins: [{
            id: 'weatherIcons',
            afterDraw: (chart) => {
                const ctx = chart.ctx;
                const xAxis = chart.scales.x;
                const yAxis = chart.scales.y;

                ctx.save();
                ctx.textAlign = 'center';

                weatherCodes.forEach((code, index) => {
                    const x = xAxis.getPixelForTick(index);
                    const y = yAxis.top - 25; // Weather icon position

                    // 1. Draw Weather Icon
                    ctx.font = '16px serif';
                    ctx.fillStyle = '#000';
                    ctx.fillText(getWeatherIcon(code), x, y);

                    // 2. Draw Wind Direction Arrow
                    const dir = windDirs[index];
                    const arrowY = yAxis.top - 5; // Position arrow below weather icon

                    ctx.save();
                    ctx.translate(x, arrowY);
                    // Rotate: Wind from North (0deg) blows to South. 
                    // Arrow pointing UP is 0deg. We want it pointing DOWN for North wind.
                    // So rotate by dir + 180.
                    ctx.rotate((dir + 180) * Math.PI / 180);

                    // Draw Arrow
                    ctx.font = '14px sans-serif';
                    ctx.fillStyle = '#666';
                    ctx.fillText('↑', 0, 5); // 5 is offset to center text vertically
                    ctx.restore();
                });

                ctx.restore();
            }
        }]
    });
}

function showError(msg) {
    highTideList.innerHTML = '<li class="error">データなし</li>';
    lowTideList.innerHTML = '<li class="error">データなし</li>';
    if (currentState.chart) {
        currentState.chart.destroy();
        currentState.chart = null;
    }
    const width = ctx.canvas.width;
    const height = ctx.canvas.height;
    ctx.clearRect(0, 0, width, height);
    ctx.font = '16px sans-serif';
    ctx.fillStyle = '#ff6b6b';
    ctx.textAlign = 'center';
    ctx.fillText(msg, width / 2, height / 2);
}

/**
 * Process Data and Render UI
 */
function processAndRender(data) {
    const hourlyTimes = data.hourly.time;
    const hourlyHeights = data.hourly.tide_height;

    // 1. Render Chart
    if (currentState.chart) {
        currentState.chart.destroy();
    }

    const labels = Array.from({ length: 24 }, (_, i) => `${i}:00`);

    currentState.chart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: '潮位 (m)',
                data: hourlyHeights,
                borderColor: '#0077be',
                backgroundColor: 'rgba(0, 119, 190, 0.1)',
                borderWidth: 3,
                tension: 0.4,
                fill: true,
                pointRadius: 3,
                pointHoverRadius: 6
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: { mode: 'index', intersect: false },
                annotation: {
                    annotations: {
                        line1: {
                            type: 'line',
                            yMin: 0,
                            yMax: 0,
                            borderColor: 'rgba(0,0,0,0.2)',
                            borderWidth: 1,
                            borderDash: [5, 5]
                        },
                        currentTimeLine: getCurrentTimeAnnotation()
                    }
                }
            },
            interaction: { mode: 'nearest', axis: 'x', intersect: false },
            scales: {
                y: {
                    title: { display: true, text: '高さ (m)' },
                    suggestedMin: -0.5,
                    suggestedMax: 2.5
                }
            }
        }
    });

    // 2. Calculate High/Low Tides (Peaks)
    const peaks = findPeaks(hourlyTimes, hourlyHeights);

    // 3. Update Text Lists
    updateTideLists(peaks);

    // 4. Update Tide Type (Moon Age) - Moved to renderCurrentData
}

function changeDate(days) {
    const currentDate = new Date(currentState.date);
    currentDate.setDate(currentDate.getDate() + days);

    const year = currentDate.getFullYear();
    // Limit to 2026 for now as data is for 2026
    if (year !== 2026) return; // Simple guard

    currentState.date = currentDate.toISOString().split('T')[0];
    datePicker.value = currentState.date;
    renderCurrentData();
}

/**
 * Calculate Tide Type based on Moon Age
 * Approximation for 2026
 */
function updateTideType(dateStr) {
    const date = new Date(dateStr);
    // Simple Moon Age Calculation
    // Known constant: 2026-01-18 was New Moon (Age ~ 0 / 29.5)
    // Ref: 2026-01-18 20:55 is New Moon.

    // Days since base date (using Jan 18 2026 as base for simplicity)
    const baseDate = new Date("2026-01-18T21:00:00+09:00");
    // Set time to noon to avoid timezone flip issues on diff
    const targetDate = new Date(`${dateStr}T12:00:00+09:00`);

    const diffTime = targetDate - baseDate;
    const diffDays = diffTime / (1000 * 60 * 60 * 24);

    let moonAge = diffDays % 29.53059;
    if (moonAge < 0) moonAge += 29.53059;

    let type = "";
    // Standard Japanese Tide Type Mapping (approximate)
    if (moonAge >= 0 && moonAge < 3.0) type = "大潮";
    else if (moonAge >= 3.0 && moonAge < 6.0) type = "中潮";
    else if (moonAge >= 6.0 && moonAge < 9.0) type = "小潮";
    else if (moonAge >= 9.0 && moonAge < 10.0) type = "長潮";
    else if (moonAge >= 10.0 && moonAge < 14.0) type = "若潮";
    else if (moonAge >= 14.0 && moonAge < 17.0) type = "大潮";
    else if (moonAge >= 17.0 && moonAge < 20.0) type = "中潮";
    else if (moonAge >= 20.0 && moonAge < 23.0) type = "小潮";
    else if (moonAge >= 23.0 && moonAge < 24.0) type = "長潮";
    else if (moonAge >= 24.0) type = "若潮"; // 24 to 29.5
    else type = "大潮"; // Loop back

    if (!tideTypeSpan) return;
    tideTypeSpan.textContent = `${type} (月齢${moonAge.toFixed(1)})`;

    // Update Day of Week
    const daysOfWeek = ["(日)", "(月)", "(火)", "(水)", "(木)", "(金)", "(土)"];
    const weekday = daysOfWeek[date.getDay()];
    const dateWeekdaySpan = document.getElementById('date-weekday');
    if (dateWeekdaySpan) {
        dateWeekdaySpan.textContent = weekday;
        // Optional: Color for Sat/Sun
        if (date.getDay() === 0) dateWeekdaySpan.style.color = 'red';
        else if (date.getDay() === 6) dateWeekdaySpan.style.color = 'blue';
        else dateWeekdaySpan.style.color = 'inherit';
    }
}

/**
 * Helper to get current time line annotation
 */
function getCurrentTimeAnnotation() {
    const today = new Date().toISOString().split('T')[0];
    if (currentState.date !== today) return null;

    const now = new Date();
    // Chart labels are 0:00 to 23:00, so x value is hour + min/60
    const xValue = now.getHours() + now.getMinutes() / 60;

    return {
        type: 'line',
        xMin: xValue,
        xMax: xValue,
        borderColor: '#ff6b6b',
        borderWidth: 2,
        label: {
            display: true,
            content: '現在',
            position: 'start',
            backgroundColor: 'rgba(255, 107, 107, 0.8)',
            color: '#fff',
            font: { size: 10 }
        }
    };
}

/**
 * Find peaks (High/Low) using quadratic interpolation
 */
function findPeaks(times, heights) {
    const peaks = [];

    for (let i = 1; i < heights.length - 1; i++) {
        const y1 = heights[i - 1];
        const y2 = heights[i];
        const y3 = heights[i + 1];

        if (y1 === null || y2 === null || y3 === null) continue;

        const isHigh = y2 > y1 && y2 > y3;
        const isLow = y2 < y1 && y2 < y3;

        if (isHigh || isLow) {
            const a = (y1 + y3 - 2 * y2) / 2;
            const b = (y3 - y1) / 2;
            const c = y2;

            const xOffset = -b / (2 * a);
            const peakVal = a * xOffset * xOffset + b * xOffset + c;

            const baseTime = new Date(times[i]);
            const peakTimeMs = baseTime.getTime() + (xOffset * 60 * 60 * 1000);
            const peakDate = new Date(peakTimeMs);

            peaks.push({
                type: isHigh ? 'high' : 'low',
                time: formatTime(peakDate),
                level: peakVal.toFixed(2)
            });
        }
    }
    return peaks;
}

function formatTime(date) {
    const h = date.getHours().toString().padStart(2, '0');
    const m = date.getMinutes().toString().padStart(2, '0');
    return `${h}:${m}`;
}

function updateTideLists(peaks) {
    highTideList.innerHTML = '';
    lowTideList.innerHTML = '';

    if (peaks.length === 0) {
        highTideList.innerHTML = '<li>データなし</li>';
        lowTideList.innerHTML = '<li>データなし</li>';
        return;
    }

    peaks.forEach(p => {
        const li = document.createElement('li');
        li.innerHTML = `<span class="time">${p.time}</span><span class="level">${p.level}m</span>`;

        if (p.type === 'high') {
            highTideList.appendChild(li);
        } else {
            lowTideList.appendChild(li);
        }
    });

    if (highTideList.children.length === 0) highTideList.innerHTML = '<li>なし</li>';
    if (lowTideList.children.length === 0) lowTideList.innerHTML = '<li>なし</li>';
}

// Start
init();
