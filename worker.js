import init, { SpikingNetwork } from './pkg/aion_core.js';

let brain;
let dictionary = new Map();
let reverseDictionary = new Map();
let isIdle = true;
let idleTimer;
let wordQueue = [];
let lastProcessedNode = null;

// Expanded Python Stop Words Filter
const stopWords = new Set([
    "a", "about", "all", "an", "and", "any", "are", "as", "at", "be", "been", "but", 
    "by", "can", "could", "do", "for", "from", "has", "have", "how", "i", "if", 
    "in", "into", "is", "it", "its", "just", "may", "me", "more", "my", "no", "not", 
    "of", "on", "one", "only", "or", "our", "out", "should", "so", "some", "such", 
    "than", "that", "the", "their", "them", "then", "there", "these", "they", 
    "this", "those", "through", "to", "too", "very", "was", "we", "were", "what", 
    "when", "which", "while", "who", "why", "will", "with", "would", "you", "your",
    "does", "did", "define", "definition", "explain", "tell"
]);

const NODE_SYS_ALERT = 0;
const NODE_UI_DARKMODE = 1;

let nextAvailableNode = 2;

// --- INDEXED DB SETUP ---
const dbName = "AionMatrixDB";
let db;

function initDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(dbName, 1);
        request.onupgradeneeded = (event) => {
            db = event.target.result;
            if (!db.objectStoreNames.contains('memory')) {
                db.createObjectStore('memory');
            }
        };
        request.onsuccess = (event) => {
            db = event.target.result;
            resolve();
        };
        request.onerror = (event) => reject(event.target.error);
    });
}

async function setup() {
    await init();
    await initDB();
    
    // Boot the 1-Million-Node Matrix
    brain = new SpikingNetwork(1_000_000);
    
    // Hardcode core action nodes
    dictionary.set("[NODE_SYS_ALERT]", NODE_SYS_ALERT);
    dictionary.set("[NODE_UI_DARKMODE]", NODE_UI_DARKMODE);
    reverseDictionary.set(NODE_SYS_ALERT, "[NODE_SYS_ALERT]");
    reverseDictionary.set(NODE_UI_DARKMODE, "[NODE_UI_DARKMODE]");

    startREMSleepCycle();
    postMessage({ type: 'READY' });
}

function startREMSleepCycle() {
    setInterval(() => {
        if (!isIdle || nextAvailableNode <= 2) return;
        
        for (let i = 0; i < 3; i++) {
            let randomNode = Math.floor(Math.random() * nextAvailableNode);
            brain.inject_voltage(randomNode, 10.0); 
        }
        for(let c = 0; c < 20; c++) {
            brain.tick(0.016, true);
        }
    }, 1000);
}

function processText(text) {
    const words = text.toLowerCase().match(/\b\w+\b/g) || [];
    const validWords = words.filter(w => !stopWords.has(w) && w.length > 2);
    
    if (text.trim().endsWith('?')) {
        handleQuery(validWords);
        return;
    }

    wordQueue = [...wordQueue, ...validWords];
    lastProcessedNode = null; 
    processQueue();
}

function handleQuery(words) {
    const knownWords = words.filter(w => dictionary.has(w));
    if (knownWords.length === 0) {
        postMessage({ type: 'AION_RESPONSE', text: "READOUT: SIGNAL DECAYED. NO LOCAL CONCEPTS FOUND." });
        return;
    }

    knownWords.forEach(w => {
        const nodeIndex = dictionary.get(w);
        brain.inject_voltage(nodeIndex, 50.0);
    });

    for (let i = 0; i < 5; i++) {
        brain.tick(0.016, false);
    }

    let associations = [];
    for (let i = 2; i < nextAvailableNode; i++) {
        const word = reverseDictionary.get(i);
        if (!knownWords.includes(word)) {
            associations.push({ word, voltage: brain.get_voltage(i) });
        }
    }

    associations.sort((a, b) => b.voltage - a.voltage);
    const topConcepts = associations
        .slice(0, 4)
        .filter(a => a.voltage > 0.5)
        .map(a => a.word);

    if (topConcepts.length > 0) {
        postMessage({ type: 'AION_RESPONSE', text: `ATTRACTOR FIELD: ${topConcepts.join(" ⚡ ")}` });
    } else {
        postMessage({ type: 'AION_RESPONSE', text: "READOUT: INSUFFICIENT ENERGY TO FORM ATTRACTOR FIELD." });
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
            brain.flood_dopamine(); 
            postMessage({ type: 'NEW_CONCEPT', word });
        } else {
            postMessage({ type: 'ACTIVE_CONCEPT', word });
        }
        
        const nodeIndex = dictionary.get(word);

        if (lastProcessedNode !== null && lastProcessedNode !== nodeIndex) {
            brain.create_synapse(lastProcessedNode, nodeIndex, 1.5); 
            brain.create_synapse(nodeIndex, lastProcessedNode, 1.0); 
        }
        lastProcessedNode = nodeIndex;

        const voltage = brain.grade_stimulus(nodeIndex);
        brain.inject_voltage(nodeIndex, voltage);
        
        const actions = brain.tick(0.016, true);
        if (actions.length > 0) {
            postMessage({ type: 'ACTION_SPIKE', actions: Array.from(actions) });
        }
    }
    
    idleTimer = setTimeout(() => isIdle = true, 5000);
}

// --- MESSAGE HANDLER ---
self.onmessage = function(e) {
    const { type, payload } = e.data;
    
    if (type === 'INGEST_TEXT') {
        processText(payload);
    } 
    else if (type === 'RESET_BRAIN') {
        // 1. Clear WebAssembly Memory to prevent memory leaks
        if (brain) {
            brain.free(); 
        }
        
        // 2. Re-allocate a fresh 1-Million-Node matrix
        brain = new SpikingNetwork(1_000_000);
        
        // 3. Reset local dictionaries
        dictionary.clear();
        reverseDictionary.clear();
        dictionary.set("[NODE_SYS_ALERT]", NODE_SYS_ALERT);
        dictionary.set("[NODE_UI_DARKMODE]", NODE_UI_DARKMODE);
        reverseDictionary.set(NODE_SYS_ALERT, "[NODE_SYS_ALERT]");
        reverseDictionary.set(NODE_UI_DARKMODE, "[NODE_UI_DARKMODE]");
        nextAvailableNode = 2;
        
        // 4. Clear IndexedDB Data
        const tx = db.transaction('memory', 'readwrite');
        tx.objectStore('memory').clear();
        
        postMessage({ type: 'MATRIX_WIPED' });
    }
};

setup();
