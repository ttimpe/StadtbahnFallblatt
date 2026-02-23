let displayData;
let drums = {
    lineFlaps: [],
    routeFlaps: [],
    destFlaps: []
};
let livePollingInterval = null;
let currentLiveTrip = null; // Tracks the trip currently being displayed

// We only need one flap per module now
function renderFlaps(containerId) {
    const container = document.getElementById(containerId);
    container.innerHTML = '';

    const flap = document.createElement('div');
    flap.className = 'split-flap';

    // Initial state
    flap.dataset.word = '';

    // The internal structure for 3D flipping. Inner .text-content allows proper centering for multi-line.
    flap.innerHTML = `
        <div class="flap-top empty"><div class="text-content"></div></div>
        <div class="flap-bottom empty"><div class="text-content"></div></div>
        <div class="flap-next-half empty"><div class="text-content"></div></div>
        <div class="flap-next-bottom empty"><div class="text-content"></div></div>
    `;

    container.appendChild(flap);
}

// Initialize
async function init() {
    try {
        const response = await fetch('data.json');
        displayData = await response.json();

        populateDrums();
        setupControls();

        // Initial blank state (1 flap each)
        renderFlaps('lineFlaps');
        renderFlaps('routeFlaps');
        renderFlaps('destFlaps');

        applyDefaultState(true);

    } catch (error) {
        console.error('Failed to load display data:', error);
    }
}

function buildStopHTML(abbr, isFirst) {
    const stop = displayData.stops[abbr];
    const name = (stop && stop.name) ? stop.name : abbr;
    let inner = (isFirst ? '' : ' - ') + name;
    if (stop && stop.busConnection) {
        inner += ' <img class="bus-icon" src="bus.svg">';
    }
    inner += '&nbsp;';
    return `<span class="stop-label">${inner}</span>`;
}

function populateDrums() {
    if (!displayData) return;

    // 1. Lines (Physical flaps on Drum 1)
    drums.lineFlaps = displayData.lines.map(line => ({
        id: line.id,
        text: line.text,
        bg: line.backgroundColor,
        fg: line.textColor,
        audio: line.audio
    }));
    // Inject hardware constants
    drums.lineFlaps.push({ id: "E_OVERRIDE", text: "E", bg: "black", fg: "yellow", audio: displayData.genericAudio.einsatzwagen });

    // 2. Destinations (Physical flaps on Drum 3)
    drums.destFlaps = displayData.destinations.map(dest => ({
        id: dest.id,
        text: dest.label,
        name: dest.name,
        audio: dest.audio
    }));
    // Inject hardware constants
    drums.destFlaps.push({ id: "TERMINUS", text: "ZUG ENDET HIER", name: "ZUG ENDET HIER", audio: displayData.genericAudio.zugEndet });
    drums.destFlaps.push({ id: "NO_SMOKING_DEST", text: "RAUCHEN VERBOTEN", name: "RAUCHEN VERBOTEN", audio: null });

    // 3. Routes (Physical flaps on Drum 2)
    drums.routeFlaps = displayData.routes.map(route => {
        let routeText = route.label;
        if ((!routeText || routeText.trim() === "") && route.stops && route.stops.length > 0) {
            routeText = route.stops.map((abbr, i) => buildStopHTML(abbr, i === 0)).join('');
        }
        return {
            id: route.id,
            text: routeText || "",
            stops: route.stops,
            isStopsBased: (!route.label || route.label.trim() === "") && route.stops && route.stops.length > 0
        };
    });
}

function setupControls() {
    const devLocSelect = document.getElementById('devLocSelect');
    const platformSelect = document.getElementById('platformSelect');
    const kursInput = document.getElementById('kursInput');
    const lineSelect = document.getElementById('lineSelect');
    const destSelect = document.getElementById('destSelect');
    const triggerBtn = document.getElementById('triggerBtn');
    const resetBtn = document.getElementById('resetBtn');

    // Populate Device Locations
    const allowedLocations = ['HBF', 'JPL', 'RTH'];
    const sortedStops = Object.keys(displayData.stops)
        .filter(abbr => allowedLocations.includes(abbr))
        .sort((a, b) => displayData.stops[a].name.localeCompare(displayData.stops[b].name));

    sortedStops.forEach(abbr => {
        const option = document.createElement('option');
        option.value = abbr;
        option.textContent = displayData.stops[abbr].name;
        devLocSelect.appendChild(option);
    });
    if (displayData.deviceLocation && allowedLocations.includes(displayData.deviceLocation)) {
        devLocSelect.value = displayData.deviceLocation;
    }

    const updatePlatforms = (location) => {
        platformSelect.innerHTML = '<option value="" disabled selected>Gleis...</option>';
        let count = 0;
        if (location === 'HBF') count = 4;
        else if (location === 'JPL' || location === 'RTH') count = 2;

        for (let i = 1; i <= count; i++) {
            const option = document.createElement('option');
            option.value = i;
            option.textContent = `Gleis ${i}`;
            platformSelect.appendChild(option);
        }

        if (count > 0) {
            platformSelect.value = '1';
            const platformNumEl = document.querySelector('.platform-number');
            if (platformNumEl) platformNumEl.textContent = '1';
        }
    };

    // Initialize platforms based on default location
    if (devLocSelect.value) {
        updatePlatforms(devLocSelect.value);
    }

    devLocSelect.addEventListener('change', (e) => {
        displayData.deviceLocation = e.target.value;
        updatePlatforms(e.target.value);
        if (!destSelect.value) applyDefaultState(false);
    });

    platformSelect.addEventListener('change', (e) => {
        const platformNumEl = document.querySelector('.platform-number');
        if (platformNumEl) platformNumEl.textContent = e.target.value;
        updateTriggerState();
        if (!destSelect.value) applyDefaultState(false);
    });

    // Populate logical lines (unique line numbers)
    const uniqueLines = [...new Set(displayData.lines.map(l => (l.text || "").trim()))]
        .filter(t => t !== "" && t !== "E" && t !== "🚭");

    uniqueLines.sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));

    uniqueLines.forEach(lineText => {
        const option = document.createElement('option');
        option.value = lineText;
        option.textContent = `Linie ${lineText}`;
        lineSelect.appendChild(option);
    });
    // Add speciale/E optionally if needed, but the user said "selection of logical lines"
    const eOption = document.createElement('option');
    eOption.value = "E";
    eOption.textContent = "Linie E (Einsatzwagen)";
    lineSelect.appendChild(eOption);

    // Populate logical destinations
    displayData.destinations.filter(d => !d.id.startsWith('BLANK')).forEach(dest => {
        const option = document.createElement('option');
        option.value = dest.id;
        option.textContent = dest.name || dest.label || dest.id;
        destSelect.appendChild(option);
    });

    const updateTriggerState = () => {
        const kursValid = kursInput.value.trim() !== "" && /^\d{1,2}$/.test(kursInput.value.trim());
        triggerBtn.disabled = !(lineSelect.value && destSelect.value && platformSelect.value && kursValid);
    };

    kursInput.addEventListener('input', (e) => {
        // Allow only digits
        e.target.value = e.target.value.replace(/\D/g, '').slice(0, 2);
        updateTriggerState();
    });

    lineSelect.addEventListener('change', updateTriggerState);
    destSelect.addEventListener('change', updateTriggerState);
    platformSelect.addEventListener('change', updateTriggerState);

    triggerBtn.addEventListener('click', async () => {
        await triggerDisplayUpdate(lineSelect.value, destSelect.value, kursInput.value);
    });

    resetBtn.addEventListener('click', async () => {
        devLocSelect.value = "";
        platformSelect.value = "";
        kursInput.value = "";
        lineSelect.value = "";
        destSelect.value = "";
        triggerBtn.disabled = true;
        document.getElementById('einsatzCheck').checked = false;

        displayData.deviceLocation = '';

        document.documentElement.style.setProperty('--line-bg', '');
        document.documentElement.style.setProperty('--line-fg', '');

        const p1 = updateFlapById('lineFlaps', 'BLANK_BLUE'); // Or whatever is the primary blank
        const p2 = updateFlapById('routeFlaps', 'BLANK');
        const p3 = updateFlapById('destFlaps', 'BLANK_1');
        await Promise.all([p1, p2, p3]);
    });

    const liveCheck = document.getElementById('liveCheck');
    liveCheck.addEventListener('change', (e) => {
        if (e.target.checked) {
            startLivePolling();
        } else {
            stopLivePolling();
        }
    });
}

function startLivePolling() {
    if (livePollingInterval) return;
    console.log("Starting Live Polling...");
    // Initial fetch
    fetchLiveData();
    // Poll every 20 seconds
    livePollingInterval = setInterval(fetchLiveData, 20000);
}

async function stopLivePolling() {
    console.log("Stopping Live Polling...");
    if (livePollingInterval) {
        clearInterval(livePollingInterval);
        livePollingInterval = null;
    }
    currentLiveTrip = null;
    await applyDefaultState(false);
}

async function fetchLiveData() {
    const loc = displayData.deviceLocation;
    const stopObj = displayData.stops[loc];
    if (!stopObj || !stopObj.efaId) {
        console.warn("No EFA ID for current location:", loc);
        return;
    }

    const platform = document.getElementById('platformSelect').value;
    if (!platform) {
        console.warn("No platform selected for live data.");
        return;
    }

    const url = new URL(displayData.efaEndpoint);
    url.searchParams.set('outputFormat', 'rapidJSON');
    url.searchParams.set('type_dm', 'any');
    url.searchParams.set('name_dm', stopObj.efaId);
    url.searchParams.set('useRealtime', '1');
    url.searchParams.set('deleteAssignedStops_dm', '1');
    url.searchParams.set('mode', 'direct');

    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        const data = await response.json();
        processLiveData(data, platform);
    } catch (err) {
        console.error("Failed to fetch live data:", err);
    }
}

function processLiveData(data, selectedPlatform) {
    if (!data.stopEvents) return;

    const now = new Date();

    // Find relevant trips for our platform, excluding cancelled ones
    const platformTrips = data.stopEvents.filter(event => {
        if (Array.isArray(event.realtimeStatus) && event.realtimeStatus.includes('CANCELLED')) return false;

        const p1 = (event.location.properties.platform || "").toLowerCase();
        const p2 = (event.location.properties.platformName || "").toLowerCase();
        const sel = String(selectedPlatform).toLowerCase();

        // Match "1", "Gleis 1", "Steig 1", "Gleis 1 (U)" etc.
        return p1 === sel ||
            p2 === sel ||
            p2.includes("gleis " + sel) ||
            p2.includes("steig " + sel) ||
            p2.startsWith(sel + " ");
    });

    if (platformTrips.length === 0) {
        // No trips for this platform, clear if necessary
        checkAndClearExpiredTrip(now);
        return;
    }

    // Sort by estimated or planned time
    platformTrips.sort((a, b) => {
        const timeA = new Date(a.departureTimeEstimated || a.departureTimePlanned);
        const timeB = new Date(b.departureTimeEstimated || b.departureTimePlanned);
        return timeA - timeB;
    });

    const nextTrip = platformTrips[0];
    const depTime = new Date(nextTrip.departureTimeEstimated || nextTrip.departureTimePlanned);
    const timeToDepMs = depTime - now;

    // Timing Logic:
    // - Appear 30s before (30000ms)
    // - Disappear 10s after (-10000ms)

    if (timeToDepMs <= 30000 && timeToDepMs >= -10000) {
        // Within display window
        const tripId = nextTrip.transportation.id + "_" + nextTrip.departureTimePlanned;
        if (currentLiveTrip !== tripId) {
            displayLiveTrip(nextTrip);
            currentLiveTrip = tripId;
        }
    } else {
        // Outside display window
        checkAndClearExpiredTrip(now);
    }
}

async function displayLiveTrip(trip) {
    console.log("Displaying Live Trip:", trip.transportation.disassembledName, "to", trip.transportation.destination.name);

    const lineText = trip.transportation.disassembledName;
    const destName = trip.transportation.destination.name;

    // Try to find matching logical line and destination
    let logicalLine = lineText;
    // Map EFA names to our internal IDs if possible
    // For now, naive matching or use destination name
    let logicalDest = null;

    // Try finding by name in destinations with fuzzy matching
    const matchedDest = displayData.destinations.find(d => {
        const internalName = (d.name || "").toLowerCase().replace(/[^a-z0-9]/g, '');
        const efaName = (destName || "").toLowerCase().replace(/[^a-z0-9]/g, '');
        return internalName.includes(efaName) || efaName.includes(internalName);
    });

    if (matchedDest) {
        logicalDest = matchedDest.id;
    } else {
        // Fallback: search for any destination with this name
        console.warn("No internal mapping for destination:", destName);
        logicalDest = "BLANK_1"; // Or generic
    }

    // Trigger update (Kurs 0 for live data)
    await triggerDisplayUpdate(logicalLine, logicalDest, "0");
}

async function checkAndClearExpiredTrip(now) {
    if (currentLiveTrip) {
        console.log("Clearing livedata display...");
        currentLiveTrip = null;
        await applyDefaultState(false);
    }
}

// --- Audio Context for Electronic Gong ---
let audioCtx;

function initAudioContext() {
    if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioCtx.state === 'suspended') {
        audioCtx.resume();
    }
}

function midiToFreq(midi) {
    return 440 * Math.pow(2, (midi - 69) / 12);
}

function playGong(notes, durationMs) {
    return new Promise((resolve) => {
        initAudioContext();

        const durationSec = durationMs / 1000;
        let startTime = audioCtx.currentTime;

        const overlapFactor = 0.3;
        const stepSec = durationSec * (1 - overlapFactor);

        notes.forEach((midiNote, index) => {
            const freq = midiToFreq(midiNote);
            const time = startTime + (index * stepSec);

            const osc = audioCtx.createOscillator();
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(freq, time);

            const gainNode = audioCtx.createGain();

            gainNode.gain.setValueAtTime(0, time);
            gainNode.gain.linearRampToValueAtTime(0.8, time + 0.05);
            gainNode.gain.exponentialRampToValueAtTime(0.01, time + durationSec);

            osc.connect(gainNode);
            gainNode.connect(audioCtx.destination);

            osc.start(time);
            osc.stop(time + durationSec);
        });

        const totalDuration = (notes.length - 1) * stepSec + durationSec;
        setTimeout(() => {
            resolve();
        }, totalDuration * 1000);
    });
}

// Generate a heavy, metallic "clack" using dual oscillators for weight and snap
function playFlapSound() {
    if (!audioCtx || audioCtx.state !== 'running') return;

    const time = audioCtx.currentTime;
    const duration = 0.05; // Longer tail for heavier metal plate resonance

    // 1. Thud component (Weight of the metal plate falling)
    const osc1 = audioCtx.createOscillator();
    osc1.type = 'sawtooth';
    osc1.frequency.setValueAtTime(150, time);
    osc1.frequency.exponentialRampToValueAtTime(50, time + duration);

    const gain1 = audioCtx.createGain();
    gain1.gain.setValueAtTime(0, time);
    gain1.gain.linearRampToValueAtTime(2.0, time + 0.002); // Maximum punch/loudness
    gain1.gain.exponentialRampToValueAtTime(0.01, time + duration);

    const filter1 = audioCtx.createBiquadFilter();
    filter1.type = 'lowpass';
    filter1.frequency.value = 600;

    osc1.connect(filter1);
    filter1.connect(gain1);
    gain1.connect(audioCtx.destination);

    // 2. Snappy click component (Metal striking metal upon stop)
    const osc2 = audioCtx.createOscillator();
    osc2.type = 'square';
    osc2.frequency.setValueAtTime(800, time);

    const gain2 = audioCtx.createGain();
    gain2.gain.setValueAtTime(0, time);
    gain2.gain.linearRampToValueAtTime(1.0, time + 0.001); // Sharp attack
    gain2.gain.exponentialRampToValueAtTime(0.01, time + 0.03);

    const filter2 = audioCtx.createBiquadFilter();
    filter2.type = 'highpass';
    filter2.frequency.value = 2000;

    osc2.connect(filter2);
    filter2.connect(gain2);
    gain2.connect(audioCtx.destination);

    osc1.start(time);
    osc1.stop(time + duration);
    osc2.start(time);
    osc2.stop(time + 0.03);
}

async function triggerDisplayUpdate(logicalLine, logicalDest, kursValue) {
    if (!displayData) return;

    // Kurs Override Logic
    const k = parseInt(kursValue, 10);
    const isSpecialKurs = [90, 91, 92, 93, 94, 95, 96, 97, 98].includes(k);

    if (isSpecialKurs) {
        if ([90, 91, 92, 94, 96, 97, 98].includes(k)) {
            logicalDest = "NICHT_EINSTEIGEN";
        } else if (k === 93) {
            logicalDest = "SONDERFAHRT";
        } else if (k === 95) {
            logicalDest = "CITYEXPRESS";
        }
    }

    // 1. Resolve logical selection to physical flaps using mapping
    let trip = (displayData.trips || []).find(t =>
        t.line.trim() === logicalLine.trim() &&
        t.dest === logicalDest
    );

    let lineFlapId, routeFlapId, destFlapId;

    if (trip) {
        lineFlapId = trip.flaps.line;
        routeFlapId = trip.flaps.route;
        destFlapId = trip.flaps.dest;
    } else {
        // FALLBACK: Use provided dest and find any valid route for this dest
        destFlapId = logicalDest;

        // Simple heuristic: find first trip that goes to this destination to steal its route
        const fallbackTrip = (displayData.trips || []).find(t => t.dest === logicalDest);
        routeFlapId = fallbackTrip ? fallbackTrip.flaps.route : 'BLANK';

        // Find best fallback Line flap (E with matching color group if possible)
        const sampleLine = displayData.lines.find(l => l.text.trim() === logicalLine.trim());
        const intendedColor = sampleLine ? sampleLine.backgroundColor : 'navy';

        const eFallback = displayData.lines.find(l =>
            l.text.trim() === "E" &&
            l.backgroundColor === intendedColor
        );

        lineFlapId = eFallback ? eFallback.id : "E_OVERRIDE";
    }

    if (isSpecialKurs) {
        lineFlapId = 'BLANK_BLUE'; // Use any blank flap
    }

    const lineFlapObj = drums.lineFlaps.find(f => f.id === lineFlapId);
    const routeFlapObj = drums.routeFlaps.find(f => f.id === routeFlapId);
    const destFlapObj = drums.destFlaps.find(f => f.id === destFlapId);

    if (!lineFlapObj || !routeFlapObj || !destFlapObj) return;

    const isEinsatzwagen = !isSpecialKurs && (document.getElementById('einsatzCheck').checked || logicalLine === "E");

    // Check for terminus logic
    const isTerminus = routeFlapObj.stops && routeFlapObj.stops.length > 0 && routeFlapObj.stops[routeFlapObj.stops.length - 1] === displayData.deviceLocation;

    if (isTerminus) {
        document.documentElement.style.setProperty('--line-bg', '');
        document.documentElement.style.setProperty('--line-fg', '');

        let pGong = Promise.resolve();
        if (displayData.gong && displayData.gong.notes) {
            pGong = playGong(displayData.gong.notes, displayData.gong.durationMs);
        }

        const p1 = updateFlapById('lineFlaps', 'BLANK_BLUE');
        const p2 = updateFlapById('routeFlaps', 'BLANK');
        const p3 = updateFlapById('destFlaps', 'TERMINUS');

        const pAudio = preloadAudioSequence([displayData.genericAudio.zugEndet]);
        await Promise.all([pGong, p1, p2, p3]);
        const buffers = await pAudio;
        if (buffers.length > 0) await playDecodedSequence(buffers);
        return;
    }

    // Normal trip
    let bgColor = lineFlapObj.bg || 'navy';
    let fgColor = lineFlapObj.fg || 'white';

    document.documentElement.style.setProperty('--line-bg', bgColor);
    document.documentElement.style.setProperty('--line-fg', fgColor);

    // Audio sequence & Visual route filtering
    let upcomingRoute = [];
    if (routeFlapObj.stops) {
        const idx = routeFlapObj.stops.indexOf(displayData.deviceLocation);
        upcomingRoute = idx !== -1 ? routeFlapObj.stops.slice(idx + 1) : [...routeFlapObj.stops];
        if (upcomingRoute.length > 0 && upcomingRoute[upcomingRoute.length - 1] === destFlapObj.id) {
            upcomingRoute.pop();
        }
    }

    if (routeFlapObj.isStopsBased) {
        routeFlapObj.text = upcomingRoute.map((abbr, i) => buildStopHTML(abbr, i === 0)).join('');
    }

    const audioSlices = [];
    if (isSpecialKurs) {
        // Skip prefix for special Kurs
        if (destFlapObj.audio) audioSlices.push(destFlapObj.audio);
    } else {
        audioSlices.push(isEinsatzwagen ? displayData.genericAudio.einsatzwagen : lineFlapObj.audio);
        audioSlices.push('audio/Richtung.mp3');
        upcomingRoute.forEach(abbr => {
            const stop = displayData.stops[abbr];
            if (stop && stop.audio) audioSlices.push(stop.audio);
        });
        if (destFlapObj.audio) audioSlices.push(destFlapObj.audio);
    }

    const pAudio = preloadAudioSequence(audioSlices);

    let pGong = Promise.resolve();
    if (displayData.gong && displayData.gong.notes) {
        pGong = playGong(displayData.gong.notes, displayData.gong.durationMs);
    }

    const p1 = updateFlapById('lineFlaps', lineFlapId);
    const p2 = updateFlapById('routeFlaps', routeFlapId);
    const p3 = updateFlapById('destFlaps', destFlapId);

    await Promise.all([pGong, p1, p2, p3]);
    const buffers = await pAudio;
    if (buffers.length > 0) await playDecodedSequence(buffers);
}

async function applyDefaultState(immediate = false) {
    let p1, p2, p3;
    const currentPlatform = document.getElementById('platformSelect').value;
    if (displayData.deviceLocation === 'RTH' && currentPlatform === '1') {
        const lineId = 'BLANK_BLUE';
        const routeId = 'HEADER';
        const destId = 'RTH_STILL';
        if (immediate) {
            setFlapImmediate('lineFlaps', lineId);
            setFlapImmediate('routeFlaps', routeId);
            setFlapImmediate('destFlaps', destId);
            return Promise.resolve();
        } else {
            p1 = updateFlapById('lineFlaps', lineId);
            p2 = updateFlapById('routeFlaps', routeId);
            p3 = updateFlapById('destFlaps', destId);
        }
    } else if (displayData.deviceLocation === 'HBF' || displayData.deviceLocation === 'JPL') {
        const lineId = 'NO_SMOKING';
        const routeId = 'BLANK';
        const destId = 'NO_SMOKING_DEST';
        if (immediate) {
            setFlapImmediate('lineFlaps', lineId);
            setFlapImmediate('routeFlaps', routeId);
            setFlapImmediate('destFlaps', destId);
            return Promise.resolve();
        } else {
            p1 = updateFlapById('lineFlaps', lineId);
            p2 = updateFlapById('routeFlaps', routeId);
            p3 = updateFlapById('destFlaps', destId);
        }
    } else {
        // Absolute fallback
        if (immediate) {
            setFlapImmediate('lineFlaps', 'BLANK_BLUE');
            setFlapImmediate('routeFlaps', 'BLANK');
            setFlapImmediate('destFlaps', 'BLANK_1');
            return Promise.resolve();
        } else {
            p1 = updateFlapById('lineFlaps', 'BLANK_BLUE');
            p2 = updateFlapById('routeFlaps', 'BLANK');
            p3 = updateFlapById('destFlaps', 'BLANK_1');
        }
    }
    await Promise.all([p1, p2, p3]);
}

function setFlapImmediate(containerId, flapId) {
    const drum = getDrumForContainer(containerId);
    const idx = drum.findIndex(f => f.id === flapId);
    if (idx === -1) return;
    const flap = document.querySelector(`#${containerId} .split-flap`);
    flap.dataset.index = idx;
    const obj = drum[idx];
    flap.querySelectorAll('.text-content').forEach(el => el.innerHTML = obj.text);
    applyColorsToFlap(flap, obj);
}

function updateFlapById(containerId, targetId) {
    const container = document.getElementById(containerId);
    const flap = container.querySelector('.split-flap');
    const drum = getDrumForContainer(containerId);
    const targetIndex = drum.findIndex(f => f.id === targetId);

    if (targetIndex === -1) return Promise.resolve();

    const currentIndex = parseInt(flap.dataset.index) || 0;
    if (currentIndex === targetIndex) {
        applyColorsToFlap(flap, drum[targetIndex]);
        return Promise.resolve();
    }

    let diff = targetIndex - currentIndex;
    if (diff < 0) diff += drum.length;

    const sequence = [];
    for (let i = 1; i <= diff; i++) {
        sequence.push(drum[(currentIndex + i) % drum.length]);
    }

    flap.dataset.index = targetIndex;
    return processFlipQueue(flap, sequence);
}

function getDrumForContainer(containerId) {
    if (containerId === 'lineFlaps') return drums.lineFlaps;
    if (containerId === 'routeFlaps') return drums.routeFlaps;
    if (containerId === 'destFlaps') return drums.destFlaps;
    return [];
}

function updateFlapWord(containerId, targetWord) {
    const container = document.getElementById(containerId);
    if (!container) return Promise.resolve();
    const flap = container.querySelector('.split-flap');
    if (!flap) return Promise.resolve();

    // Update the visual representation
    return updateFlap(flap, targetWord);
}

function updateFlap(flap, targetWord) {
    const currentWord = flap.dataset.word || "";

    if (currentWord === targetWord) {
        // Still apply final colors/styles even if text hasn't changed (Phase 10 fix)
        const container = flap.closest('.flap-container');
        const containerId = container ? container.id : null;
        applyColorsToFlap(flap, targetWord, containerId);
        return Promise.resolve();
    }

    flap.dataset.word = targetWord;

    const drum = getDrumForFlap(flap);
    const startIndex = drum.indexOf(currentWord);
    const targetIndex = drum.indexOf(targetWord);

    if (startIndex === -1 || targetIndex === -1) {
        console.warn(`Word not in drum: "${currentWord}" or "${targetWord}"`);
        // Fallback: immediate update
        const container = flap.closest('.flap-container');
        const containerId = container ? container.id : null;
        applyColorsToFlap(flap, targetWord, containerId);
        flap.querySelectorAll('.text-content').forEach(el => el.textContent = targetWord);
        return Promise.resolve();
    }

    let diff = targetIndex - startIndex;
    if (diff < 0) diff += drum.length;

    const sequence = [];
    for (let i = 1; i <= diff; i++) {
        sequence.push(drum[(startIndex + i) % drum.length]);
    }

    return processFlipQueue(flap, sequence);
}

function getDrumForFlap(flap) {
    const container = flap.closest('.flap-container');
    if (container.id === 'lineFlaps') return drums.lineFlaps;
    if (container.id === 'routeFlaps') return drums.routeFlaps;
    if (container.id === 'destFlaps') return drums.destFlaps;
    return [];
}

function applyColorsToFlap(flap, obj) {
    const top = flap.querySelector('.flap-top');
    const bottom = flap.querySelector('.flap-bottom');
    const nextHalf = flap.querySelector('.flap-next-half');
    const nextBottom = flap.querySelector('.flap-next-bottom');

    const isEmpty = (obj.text || "").trim() === "";

    [top, bottom, nextHalf, nextBottom].forEach(el => {
        el.style.backgroundColor = obj.bg || '';
        el.style.color = obj.fg || '';
        if (isEmpty) el.classList.add('empty');
        else el.classList.remove('empty');
    });
}

async function processFlipQueue(flap, sequence) {
    const top = flap.querySelector('.flap-top');
    const bottom = flap.querySelector('.flap-bottom');
    const nextHalf = flap.querySelector('.flap-next-half');
    const nextBottom = flap.querySelector('.flap-next-bottom');

    for (let i = 0; i < sequence.length; i++) {
        const obj = sequence[i];

        // 1. Prepare next state
        nextHalf.querySelector('.text-content').innerHTML = obj.text;
        nextBottom.querySelector('.text-content').innerHTML = obj.text;
        applyColorsToFlap(flap, obj);

        // 2. Play audio tick
        playFlapSound();

        // 3. Animate top
        top.style.animation = 'none';
        void top.offsetWidth;
        top.style.animation = 'flipDownTop 0.1s ease-in forwards';

        await new Promise(r => setTimeout(r, 50));

        // 4. Swap bottom
        bottom.querySelector('.text-content').innerHTML = obj.text;
        bottom.style.animation = 'none';
        void bottom.offsetWidth;
        bottom.style.animation = 'flipDownBottom 0.1s ease-out forwards';

        await new Promise(r => setTimeout(r, 50));

        // 5. Cleanup
        top.querySelector('.text-content').innerHTML = obj.text;
    }
}

// --- Advanced Gapless Audio Sequencer ---
// Global sequence player with re-trigger protection and memory caching
let currentSource = null;
let currentSequenceAction = null;

async function preloadAudioSequence(urls) {
    initAudioContext();
    const buffers = [];
    for (const url of urls) {
        try {
            const response = await fetch(url);
            if (!response.ok) continue; // Skip missing files
            const arrayBuffer = await response.arrayBuffer();

            // Use legacy callback signature for Safari compatibility
            const audioBuffer = await new Promise((resolve, reject) => {
                audioCtx.decodeAudioData(arrayBuffer, resolve, reject);
            });
            buffers.push(audioBuffer);
        } catch (err) {
            console.warn(`Error decoding audio: ${url}`, err);
        }
    }
    return buffers;
}

async function playDecodedSequence(buffers) {
    stopCurrentAudio();
    if (!audioCtx) return;

    // Resume context if Safari suspended the hardware graph during the visual flap animation
    if (audioCtx.state === 'suspended') {
        try {
            await audioCtx.resume();
        } catch (e) {
            console.warn("Could not resume audio context", e);
        }
    }

    if (buffers.length === 0) return;

    return new Promise((resolve) => {
        let startTime = audioCtx.currentTime + 0.1; // Tiny graph flush buffer
        let lastSource = null;

        for (const buffer of buffers) {
            const source = audioCtx.createBufferSource();
            source.buffer = buffer;
            source.connect(audioCtx.destination);
            source.start(startTime);
            startTime += buffer.duration;
            lastSource = source;
        }

        currentSource = lastSource;

        if (lastSource) {
            let handled = false;
            const cleanup = () => {
                if (handled) return;
                handled = true;
                currentSource = null;
                currentSequenceAction = null;
                resolve();
            };
            currentSequenceAction = cleanup;
            lastSource.onended = cleanup;
        } else {
            resolve();
        }
    });
}

function stopCurrentAudio() {
    if (currentSource) {
        try {
            currentSource.stop();
        } catch (e) { }
        currentSource = null;
    }
    if (currentSequenceAction) {
        currentSequenceAction(); // Resolve any waiting promises
        currentSequenceAction = null;
    }
}

// Start
document.addEventListener('DOMContentLoaded', init);
