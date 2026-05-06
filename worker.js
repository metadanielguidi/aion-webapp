import init, { SpikingNetwork } from './pkg/aion_core.js';

let brain;
let dictionary = new Map(); // Maps words to node indices
let isIdle = true;
let idleTimer;
let wordQueue = [];

// Core Constants mapped from Rust
const NODE_SYS_ALERT = 0;
const NODE_UI_DARKMODE = 1;
dictionary.set("[NODE_SYS_ALERT]", NODE_SYS_ALERT);
dictionary.set("[NODE_UI_DARKMODE]", NODE_UI_DARKMODE);

let nextAvailableNode = 2;

async function setup() {
    await init();
    // Initialize 1 Million Node Matrix
    brain = new SpikingNetwork(1_000_000);
    startREMSleepCycle();
    postMessage({ type: 'READY' });
}

function startREMSleepCycle() {
    setInterval(() => {
        if (!isIdle) return;
        // REM Sleep: Consolidate Memory via Thermodynamic Decay
        for (let i = 0; i < 3; i++) {
            let randomNode = Math.floor(Math.random() * nextAvailableNode);
            brain.inject_voltage(randomNode, 10.0); // Force spike
        }
        
        // Tick 20 cycles for consolidation
        for(let c = 0; c < 20; c++) {
            brain.tick(0.016, true);
        }
    }, 1000); // Pulse every 1 second when idle
}

function processText(text, prepend = false) {
    const stopWords = new Set(["the", "is", "at", "which", "on", "and", "a"]);
    const words = text.toLowerCase().match(/\b\w+\b/g) || [];
    const validWords = words.filter(w => !stopWords.has(w));
    
    if (prepend) {
        wordQueue = [...validWords, ...wordQueue];
    } else {
        wordQueue = [...wordQueue, ...validWords];
    }
    
    processQueue();
}

function processQueue() {
    isIdle = false;
    clearTimeout(idleTimer);
    
    while (wordQueue.length > 0) {
        const word = wordQueue.shift();
        
        if (!dictionary.has(word)) {
            dictionary.set(word, nextAvailableNode++);
            // Signal main thread about new concept
            postMessage({ type: 'UNKNOWN_WORD', word });
            return; // Pause processing queue for Parent-Child loop
        }
        
        const nodeIndex = dictionary.get(word);
        const voltage = brain.grade_stimulus(nodeIndex);
        brain.inject_voltage(nodeIndex, voltage);
        
        // Tick Physics Engine
        const actions = brain.tick(0.016, true);
        
        if (actions.length > 0) {
            postMessage({ type: 'ACTION_SPIKE', actions: Array.from(actions) });
        }
    }
    
    idleTimer = setTimeout(() => isIdle = true, 5000);
}

self.onmessage = function(e) {
    const { type, payload } = e.data;
    
    if (type === 'INGEST_TEXT') {
        processText(payload);
    } else if (type === 'DOPAMINE_FLOOD') {
        brain.flood_dopamine();
        processText(payload, true); // Prepend definition words, then resume original queue
    } else if (type === 'SAVE_MEMORY') {
        // Serialization hook for IndexedDB would go here
    }
};

setup();
