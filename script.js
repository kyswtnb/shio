
// State
let currentState = {
    location: { name: "東京", code: "TK" },
    date: new Date().getFullYear() === 2026
        ? new Date().toISOString().split('T')[0]
        : "2026-01-01",
    chart: null,
    loadedData: null,
    lastLoadedCode: null,
    allStations: []
};

// DOM Elements
const locationInput = document.getElementById('location-input');
const locationList = document.getElementById('location-list');
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
        const initialMatch = currentState.allStations.find(st => st.code === currentState.location.code);
        if (initialMatch) {
            const pref = initialMatch.pref && initialMatch.pref !== "不明" ? `${initialMatch.pref} > ` : "";
            locationInput.value = `${pref}${initialMatch.name} (${initialMatch.code})`;
            // Also select the prefecture in dropdown if available
            if (initialMatch.pref) prefSelect.value = initialMatch.pref;
        } else {
            locationInput.value = `${currentState.location.name} (${currentState.location.code})`;
        }

        // Set default date (2026)
        datePicker.value = currentState.date;
        // Limit date picker to 2026
        datePicker.min = "2026-01-01";
        datePicker.max = "2026-12-31";

        // Event Listeners
        locationInput.addEventListener('focus', (e) => e.target.select());
        locationInput.addEventListener('change', handleLocationChange);

        prefSelect.addEventListener('change', (e) => {
            const selectedPref = e.target.value;
            locationInput.value = ''; // Clear input to encourage new selection

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
    locationList.innerHTML = stations.map(st => {
        const pref = (showPref && st.pref && st.pref !== "不明") ? `${st.pref} > ` : "";
        return `<option value="${pref}${st.name} (${st.code})"></option>`;
    }).join('');
}

function handleLocationChange(e) {
    const val = e.target.value;
    // Extract code from parentheses, e.g., "Station (TK)" -> "TK"
    const codeMatch = val.match(/\(([A-Z0-9]{2})\)$/);

    if (codeMatch) {
        const code = codeMatch[1];
        const match = currentState.allStations.find(st => st.code === code);
        if (match) {
            currentState.location = match;
            fetchAndRender();
        }
    } else {
        // Fallback to name match if no code found (less reliable but useful)
        const match = currentState.allStations.find(st => val.includes(st.name));
        if (match) {
            currentState.location = match;
            fetchAndRender();
        }
    }
}

/**
 * Load JMA Data from local JSON
 */
async function fetchAndRender() {
    try {
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
    if (!currentState.loadedData) return;

    const dateStr = currentState.date;
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

    // 4. Update Tide Type (Moon Age)
    if (typeof updateTideType === 'function') {
        updateTideType(dateStr);
    }
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
