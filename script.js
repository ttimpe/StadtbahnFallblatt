let displayData;
let drums = {
    lineFlaps: [],
    routeFlaps: [],
    destFlaps: []
};

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

function populateDrums() {
    let allLines = new Set([""]); // Blank flap start state
    let lineColors = { "": { bg: "navy", fg: "white" } };
    let allDests = new Set(["", "ZUG ENDET HIER"]);
    let allRoutes = new Set([""]);

    displayData.lines.forEach(line => {
        const lineText = line.number.trim();
        allLines.add(lineText);

        // Cache the default color for this line text (for when it spins past as an intermediate flap)
        let bg = line.backgroundColor || 'navy';
        let fg = line.textColor || 'white';
        lineColors[lineText] = { bg, fg };

        line.destinations.forEach(dest => {
            const destMetadata = displayData.destinations.find(d => d.id === dest.id);
            if (destMetadata) {
                allDests.add(destMetadata.name);
            }

            if (dest.route && dest.route.length > 0) {
                // Pre-calculate all continuous forward sequences (suffixes) for physical drum parity
                for (let i = 0; i < dest.route.length; i++) {
                    const upcomingStops = dest.route.slice(i);
                    const routeString = upcomingStops.map(abbr => {
                        const stop = displayData.stops[abbr];
                        if (!stop) return abbr;
                        return stop.busConnection ? `${stop.name} 🚌` : stop.name;
                    }).join(" - ");
                    allRoutes.add(routeString);
                }
            } else if (dest.description) {
                allRoutes.add(dest.description);
            }
        });
    });

    // Manually push 'E' since it was removed from data.json lines array
    allLines.add('E');
    lineColors['E'] = { bg: 'black', fg: 'yellow' };

    // Rathaus default state
    allRoutes.add("StadtBahnen in Richtung");
    allDests.add("Jahnplatz/HBF");

    // HBF / JPL default state
    allLines.add("🚭");
    lineColors["🚭"] = { bg: "white", fg: "black" };
    allDests.add("RAUCHEN VERBOTEN");

    drums.lineFlaps = Array.from(allLines);
    drums.lineColors = lineColors;
    drums.destFlaps = Array.from(allDests);
    drums.routeFlaps = Array.from(allRoutes);
}

function setupControls() {
    const devLocSelect = document.getElementById('devLocSelect');
    const lineSelect = document.getElementById('lineSelect');
    const destSelect = document.getElementById('destSelect');
    const triggerBtn = document.getElementById('triggerBtn');
    const resetBtn = document.getElementById('resetBtn');

    // Populate Device Locations (only allow HBF, JPL, RTH)
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
    // Set initial device location from data.json
    if (displayData.deviceLocation && allowedLocations.includes(displayData.deviceLocation)) {
        devLocSelect.value = displayData.deviceLocation;
    }

    devLocSelect.addEventListener('change', (e) => {
        displayData.deviceLocation = e.target.value;
        if (!destSelect.value) {
            applyDefaultState(false);
        }
    });

    // Populate lines
    displayData.lines.forEach(line => {
        const option = document.createElement('option');
        option.value = line.id;
        option.textContent = line.number.trim();
        lineSelect.appendChild(option);
    });

    lineSelect.addEventListener('change', (e) => {
        const lineId = e.target.value;
        const line = displayData.lines.find(l => l.id === lineId);

        // Populate destinations
        destSelect.innerHTML = '<option value="" disabled selected>Select Destination...</option>';
        line.destinations.forEach((dest, index) => {
            const destMetadata = displayData.destinations.find(d => d.id === dest.id);
            const option = document.createElement('option');
            option.value = index;
            option.textContent = destMetadata ? destMetadata.name : dest.id;
            destSelect.appendChild(option);
        });

        destSelect.disabled = false;
        triggerBtn.disabled = true;

        if (displayData.deviceLocation === 'RTH') {
            applyDefaultState(false);
        } else {
            // Revert back to true blank if not at RTH
            updateFlapWord('lineFlaps', '');
            updateFlapWord('routeFlaps', '');
            updateFlapWord('destFlaps', '');
        }
    });

    destSelect.addEventListener('change', () => {
        triggerBtn.disabled = false;
    });


    triggerBtn.addEventListener('click', async () => {
        const lineId = lineSelect.value;
        const destIdx = destSelect.value;
        await triggerDisplayUpdate(lineId, destIdx);
    });

    resetBtn.addEventListener('click', async () => {
        devLocSelect.value = "";
        lineSelect.value = "";
        destSelect.innerHTML = '<option value="" disabled selected>Select Destination...</option>';
        destSelect.disabled = true;
        triggerBtn.disabled = true;
        document.getElementById('einsatzCheck').checked = false;

        displayData.deviceLocation = '';

        document.documentElement.style.setProperty('--line-bg', '');
        document.documentElement.style.setProperty('--line-fg', '');

        const lineFlapsContainer = document.getElementById('lineFlaps');
        if (lineFlapsContainer) {
            lineFlapsContainer.dataset.targetBg = '';
            lineFlapsContainer.dataset.targetFg = '';
        }

        const p1 = updateFlapWord('lineFlaps', '');
        const p2 = updateFlapWord('routeFlaps', '');
        const p3 = updateFlapWord('destFlaps', '');
        await Promise.all([p1, p2, p3]);
    });
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

async function triggerDisplayUpdate(lineId, destId) {
    const line = displayData.lines.find(l => l.id === lineId);
    if (!line || destId === "") return;
    const dest = line.destinations[destId];
    const destMetadata = displayData.destinations.find(d => d.id === dest.id);
    const destName = destMetadata ? destMetadata.name : dest.id;

    console.log(`Triggering update to Line ${line.number}, Dest: ${destName}`);

    const isEinsatzwagen = document.getElementById('einsatzCheck').checked;
    const isTerminus = dest.route && dest.route.length > 0 && dest.route[dest.route.length - 1] === displayData.deviceLocation;

    if (isTerminus) {
        document.documentElement.style.setProperty('--line-bg', '');
        document.documentElement.style.setProperty('--line-fg', '');

        const lineFlapsContainer = document.getElementById('lineFlaps');
        if (lineFlapsContainer) {
            lineFlapsContainer.dataset.targetBg = '';
            lineFlapsContainer.dataset.targetFg = '';
        }

        let pGong = Promise.resolve();
        if (displayData.gong && displayData.gong.notes) {
            // Do not await the gong immediately, play it in parallel while the flaps turn
            pGong = playGong(displayData.gong.notes, displayData.gong.durationMs);
        }

        const p1 = updateFlapWord('lineFlaps', '');
        const p2 = updateFlapWord('routeFlaps', '');
        const p3 = updateFlapWord('destFlaps', 'ZUG ENDET HIER');

        let pAudioBuffers = Promise.resolve([]);
        if (displayData.genericAudio && displayData.genericAudio.zugEndet) {
            pAudioBuffers = preloadAudioSequence([displayData.genericAudio.zugEndet]);
        }

        // Await BOTH the flaps turning and the gong resonating before speaking
        await Promise.all([pGong, p1, p2, p3]);

        const loadedBuffers = await pAudioBuffers;
        if (loadedBuffers.length > 0) {
            await playDecodedSequence(loadedBuffers);
        }
        return;
    }

    // Update colors via CSS variables mapped to the LINE (Phase 12 schema)
    let bgColor = line.backgroundColor || 'navy';
    let fgColor = line.textColor || 'white';

    document.documentElement.style.setProperty('--line-bg', bgColor);
    document.documentElement.style.setProperty('--line-fg', fgColor);

    // Save target color locally for the line flap animation
    const lineFlapsContainer = document.getElementById('lineFlaps');
    if (lineFlapsContainer) {
        lineFlapsContainer.dataset.targetBg = bgColor;
        lineFlapsContainer.dataset.targetFg = fgColor;
    }

    // Filter upcoming stops based on deviceLocation
    let upcomingRoute = [];
    if (dest.route && dest.route.length > 0) {
        const devLocIdx = dest.route.indexOf(displayData.deviceLocation);
        if (devLocIdx !== -1) {
            // Cut off everything up to the current stop
            upcomingRoute = dest.route.slice(devLocIdx + 1);
        } else {
            upcomingRoute = [...dest.route];
        }

        // Omit the final destination stop from the route if it's the last element
        if (upcomingRoute.length > 0 && upcomingRoute[upcomingRoute.length - 1] === dest.id) {
            upcomingRoute.pop();
        }
    }

    // Format stops string using the filtered upcoming array
    let routeString = "";
    if (upcomingRoute.length > 0) {
        routeString = upcomingRoute.map(abbr => {
            const stop = displayData.stops[abbr];
            if (!stop) return abbr;
            return stop.busConnection ? `${stop.name} 🚌` : stop.name;
        }).join(" - ");
    } else if (dest.description) {
        routeString = dest.description; // E.g., "Bitte nicht einsteigen"
    }

    // Start flipping words and play gong UN-AWAITED in parallel initially
    const finalLineText = isEinsatzwagen ? 'E' : line.number.trim();

    let pGong = Promise.resolve();
    if (displayData.gong && displayData.gong.notes) {
        pGong = playGong(displayData.gong.notes, displayData.gong.durationMs);
    }

    const p1 = updateFlapWord('lineFlaps', finalLineText);
    const p2 = updateFlapWord('routeFlaps', routeString);
    const p3 = updateFlapWord('destFlaps', destName);

    // Assemble dynamic explicit audio arrays (Phase 8 schema)
    const audioSlices = [];

    // 1. Spoken line identifier (e.g., L1.mp3) or Einsatzwagen override
    audioSlices.push(isEinsatzwagen ? displayData.genericAudio.einsatzwagen : line.audio);

    // 2. Spoken route stops are derived directly from the visually calculated upcomingRoute
    // Always inject "Richtung"
    audioSlices.push('audio/Richtung.mp3');

    if (upcomingRoute.length > 0) {
        upcomingRoute.forEach(abbr => {
            const stop = displayData.stops[abbr];
            if (stop && stop.audio) {
                audioSlices.push(stop.audio);
            }
        });
    }

    // 3. Spoken destination
    if (destMetadata && destMetadata.audio) {
        audioSlices.push(destMetadata.audio);
    }

    // Immediately trigger pre-fetching and decoding of all audio files while the physical flaps turn!
    const pAudioBuffers = preloadAudioSequence(audioSlices);

    // Wait until ALL flaps have finished animating AND the gong has stopped before playing the audio sequence
    await Promise.all([pGong, p1, p2, p3]);

    const loadedBuffers = await pAudioBuffers;
    if (loadedBuffers.length > 0) {
        await playDecodedSequence(loadedBuffers);
    }
}

function applyDefaultState(immediate = false) {
    if (!displayData) return;

    let rLine = '';
    let rRoute = '';
    let rDest = '';

    let targetBg = '';
    let targetFg = '';

    if (displayData.deviceLocation === 'RTH') {
        rRoute = 'StadtBahnen in Richtung';
        rDest = 'Jahnplatz/HBF';
    } else if (displayData.deviceLocation === 'HBF' || displayData.deviceLocation === 'JPL') {
        rLine = '🚭';
        rRoute = '';
        rDest = 'RAUCHEN VERBOTEN';
        targetBg = '#ffffff';
        targetFg = '#000000';
    }

    if (immediate) {
        const lineFlap = document.querySelector('#lineFlaps .split-flap');
        const routeFlap = document.querySelector('#routeFlaps .split-flap');
        const destFlap = document.querySelector('#destFlaps .split-flap');

        if (lineFlap) {
            lineFlap.parentNode.dataset.targetBg = targetBg;
            lineFlap.parentNode.dataset.targetFg = targetFg;
            lineFlap.dataset.word = rLine;
            lineFlap.querySelectorAll('.text-content').forEach(el => el.textContent = rLine);
            applyColorsToFlap(lineFlap, rLine, 'lineFlaps');
        }
        if (routeFlap) {
            routeFlap.dataset.word = rRoute;
            routeFlap.querySelectorAll('.text-content').forEach(el => el.textContent = rRoute);
            applyColorsToFlap(routeFlap, rRoute, 'routeFlaps');
        }
        if (destFlap) {
            destFlap.dataset.word = rDest;
            destFlap.querySelectorAll('.text-content').forEach(el => el.textContent = rDest);
            applyColorsToFlap(destFlap, rDest, 'destFlaps');
        }
    } else {
        const lineFlapsContainer = document.getElementById('lineFlaps');
        if (lineFlapsContainer) {
            lineFlapsContainer.dataset.targetBg = targetBg;
            lineFlapsContainer.dataset.targetFg = targetFg;
        }

        updateFlapWord('lineFlaps', rLine);
        updateFlapWord('routeFlaps', rRoute);
        updateFlapWord('destFlaps', rDest);
    }
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

function applyColorsToFlap(flap, word, containerId) {
    const top = flap.querySelector('.flap-top');
    const bottom = flap.querySelector('.flap-bottom');
    const nextHalf = flap.querySelector('.flap-next-half');
    const nextBottom = flap.querySelector('.flap-next-bottom');

    const isEmpty = word.trim() === "";

    if (containerId === 'lineFlaps') {
        const colors = drums.lineColors[word] || drums.lineColors[""];
        let bg = colors.bg;
        let fg = colors.fg;

        // Determine if we should use the target color override (Phase 10 fix)
        // If it's the final target word, use dataset properties if set
        if (word === flap.dataset.word) {
            bg = flap.parentNode.dataset.targetBg || bg;
            fg = flap.parentNode.dataset.targetFg || fg;
        }

        [top, bottom, nextHalf, nextBottom].forEach(el => {
            el.style.backgroundColor = bg;
            el.style.color = fg;
            if (isEmpty) {
                el.classList.add('empty');
            } else {
                el.classList.remove('empty');
            }
        });
    } else {
        [top, bottom, nextHalf, nextBottom].forEach(el => {
            if (isEmpty) {
                el.classList.add('empty');
            } else {
                el.classList.remove('empty');
            }
            // Route and Dest always use inherited --dest-bg and --dest-fg from module-unit which are static navy/white
            el.style.backgroundColor = '';
            el.style.color = '';
        });
    }
}

async function processFlipQueue(flap, sequence) {
    const top = flap.querySelector('.flap-top');
    const bottom = flap.querySelector('.flap-bottom');
    const nextHalf = flap.querySelector('.flap-next-half');
    const nextBottom = flap.querySelector('.flap-next-bottom');

    const container = flap.closest('.flap-container');
    const containerId = container ? container.id : null;

    for (let i = 0; i < sequence.length; i++) {
        const word = sequence[i];

        // 1. Prepare next state
        nextHalf.querySelector('.text-content').textContent = word;
        nextBottom.querySelector('.text-content').textContent = word;
        applyColorsToFlap(flap, word, containerId);

        // 2. Play audio tick
        playFlapSound(); // Changed from playTick() to playFlapSound()

        // 3. Animate top half falling
        top.style.animation = 'none';
        void top.offsetWidth; // trigger reflow
        top.style.animation = 'flipDownTop 0.1s ease-in forwards';

        await new Promise(r => setTimeout(r, 50));

        // 4. Halfway point: bottom half swap
        bottom.querySelector('.text-content').textContent = word;
        bottom.style.animation = 'none';
        void bottom.offsetWidth;
        bottom.style.animation = 'flipDownBottom 0.1s ease-out forwards';

        await new Promise(r => setTimeout(r, 50));

        // 5. Cleanup for next flip
        top.querySelector('.text-content').textContent = word;
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
