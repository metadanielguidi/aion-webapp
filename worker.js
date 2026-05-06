import init, { SpikingNetwork } from './pkg/aion_core.js';

let brain;
let dictionary = new Map(); // Maps words to node indices
let reverseDictionary = new Map(); // Maps node indices back to words
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
    const stopWords = new Set(["the", "is", "at", "which", "on", "and", "a", "to", "of", "in"]);
    const words = text.toLowerCase().match(/\b\w+\b/g) || [];
    const validWords = words.filter(w => !stopWords.has(w));
    
    // Intercept Queries
    if (text.trim().endsWith('?')) {
        handleQuery(validWords);
        return;
    }

    if (prepend) {
        wordQueue = [...validWords, ...wordQueue];
    } else {
        wordQueue = [...wordQueue, ...validWords];
    }
    
    processQueue();
}

function handleQuery(words) {
    const knownWords = words.filter(w => dictionary.has(w));
    
    if (knownWords.length === 0) {
        postMessage({ type: 'AION_RESPONSE', text: "*silence* (No known concepts in query)" });
        return;
    }

    // Inject massive voltage into the queried concepts
    knownWords.forEach(w => {
        const nodeIndex = dictionary.get(w);
        brain.inject_voltage(nodeIndex, 50.0); // Big spike
    });

    // Let the brain process for a few frames (without learning/dopamine)
    for (let i = 0; i < 5; i++) {
        brain.tick(0.016, false);
    }

    // Read the resulting voltages to see what else "lit up"
    let associations = [];
    for (let i = 2; i < nextAvailableNode; i++) {
        const word = reverseDictionary.get(i);
        if (!knownWords.includes(word)) {
            associations.push({ word, voltage: brain.get_voltage(i) });
        }
    }

    // Sort by highest voltage and take the top 3 strongly activated concepts
    associations.sort((a, b) => b.voltage - a.voltage);
    const topConcepts = associations
        .slice(0, 3)
        .filter(a => a.voltage > 0.5) // Only include if it actually received current
        .map(a => a.word);

    if (topConcepts.length > 0) {
        postMessage({ type: 'AION_RESPONSE', text: topConcepts.join(" ... ") });
    } else {
        postMessage({ type: 'AION_RESPONSE', text: "*blank stare* (No strong associations)" });
    }
}

function processQueue() {
    isIdle = false;
    clearTimeout(idleTimer);

    while (wordQueue.length > 0) {
        const word = wordQueue.shift();
        
        if (!dictionary.has(word)) {
            const nodeIndex = nextAvailableNode++;
            dictionary.set(word, nodeIndex);
            reverseDictionary.set(nodeIndex, word);
            brain.flood_dopamine(); // Spontaneous dopamine release on novel stimuli
            postMessage({ type: 'NEW_CONCEPT', word });
        } else {
            postMessage({ type: 'ACTIVE_CONCEPT', word });
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
    } else if (type === 'SAVE_MEMORY') {
        // Serialization hook for IndexedDB would go here
    }
};

setup();
