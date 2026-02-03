/**
 * shio - Tide Table Application
 * Uses parsed 2026 JMA Tide Data
 */

// Stations with JMA data
const LOCATIONS = [
    { name: "東京 (Tokyo)", code: "TK" },
    { name: "大阪 (Osaka)", code: "OS" },
    { name: "名古屋 (Nagoya)", code: "NG" },
    { name: "釧路 (Kushiro)", code: "QS" }
];

// State
let currentState = {
    location: LOCATIONS[0],
    date: "2026-01-01", // Default to Jan 1st since we have 2026 data
    chart: null,
    loadedData: null,
    lastLoadedCode: null
};

// DOM Elements
const locationSelect = document.getElementById('location-select');
const datePicker = document.getElementById('date-picker');
const highTideList = document.getElementById('high-tide-list');
const lowTideList = document.getElementById('low-tide-list');
const ctx = document.getElementById('tideChart').getContext('2d');

/**
 * Initialize Application
 */
function init() {
    // Populate Location Select
    LOCATIONS.forEach((loc, index) => {
        const option = document.createElement('option');
        option.value = index;
        option.textContent = loc.name;
        locationSelect.appendChild(option);
    });

    // Set default date (2026)
    datePicker.value = currentState.date;
    // Limit date picker to 2026
    datePicker.min = "2026-01-01";
    datePicker.max = "2026-12-31";

    // Event Listeners
    locationSelect.addEventListener('change', (e) => {
        currentState.location = LOCATIONS[e.target.value];
        fetchAndRender();
    });

    datePicker.addEventListener('change', (e) => {
        currentState.date = e.target.value;
        renderCurrentData();
    });

    // Initial Fetch
    fetchAndRender();
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
                        }
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
