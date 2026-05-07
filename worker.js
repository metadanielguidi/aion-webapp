import init, { SpikingNetwork } from './pkg/aion_core.js';

let brain;
let dictionary = new Map();
let reverseDictionary = new Map();
let isIdle = true;
let idleTimer;
let wordQueue = [];
let lastProcessedNode = null;
let initialQueueSize = 0; // Tracks size for the progress bar

const stopWords = new Set([
    "a", "about", "all", "an", "and", "any", "are", "as", "at", "be", "been", "but", 
    "by", "can", "could", "do", "for", "from", "has", "have", "how", "i", "if", 
    "in", "into", "is", "it", "its", "just", "may", "me", "more", "my", "no", "not", 
    "of", "on", "one", "only", "or", "our", "out", "should", "so", "some", "such", 
    "than", "that", "the", "their", "them", "then", "there", "these", "they", 
    "this", "those", "through", "to", "too", "very", "was", "we", "were", "what", 
    "when", "which", "while", "who", "why", "will", "with", "would", "you", "your",
    "does", "did", "define", "definition", "explain", "tell", "because", "therefore"
]);

let nextAvailableNode = 0; 

const dbName = "AionOracleDB";
let db;

function initDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(dbName, 1);
        request.onupgradeneeded = (event) => {
            db = event.target.result;
            if (!db.objectStoreNames.contains('memory')) db.createObjectStore('memory');
        };
        request.onsuccess = (event) => resolve(db = event.target.result);
        request.onerror = (event) => reject(event.target.error);
    });
}

async function saveMatrix() {
    if (!brain || nextAvailableNode === 0) return;
    const activeCount = nextAvailableNode;
    const maxEdgeIdx = brain.get_max_edge_index(activeCount);
    
    const memoryState = {
        dictionary: Array.from(dictionary.entries()),
        reverseDictionary: Array.from(reverseDictionary.entries()),
        nextAvailableNode,
        v: brain.export_v(activeCount),
        edge_ptrs: brain.export_edge_ptrs(activeCount),
        edge_lens: brain.export_edge_lens(activeCount),
        edge_dst: brain.export_edge_dst(maxEdgeIdx),
        edge_weight: brain.export_edge_weight(maxEdgeIdx)
    };
    
    const tx = db.transaction('memory', 'readwrite');
    tx.objectStore('memory').put(memoryState, 'latest_state');
}

async function loadMatrix() {
    return new Promise((resolve) => {
        const tx = db.transaction('memory', 'readonly');
        const request = tx.objectStore('memory').get('latest_state');
        request.onsuccess = (e) => {
            const state = e.target.result;
            if (state) {
                dictionary = new Map(state.dictionary);
                reverseDictionary = new Map(state.reverseDictionary);
                nextAvailableNode = state.nextAvailableNode;
                brain.import_v(state.v);
                brain.import_edge_ptrs(state.edge_ptrs);
                brain.import_edge_lens(state.edge_lens);
                brain.import_edge_dst(state.edge_dst);
                brain.import_edge_weight(state.edge_weight);
                postMessage({ type: 'AION_RESPONSE', text: "[SYSTEM]: Temporal logic matrix restored from disk." });
                for (let i = 0; i < nextAvailableNode; i++) {
                    postMessage({ type: 'NEW_CONCEPT', word: reverseDictionary.get(i) });
                }
            }
            resolve();
        };
        request.onerror = () => resolve();
    });
}

async function setup() {
    await init();
    await initDB();
    brain = new SpikingNetwork(1_000_000);
    await loadMatrix();
    startCognitiveMetabolism();
    postMessage({ type: 'READY' });
}

function startCognitiveMetabolism() {
    setInterval(() => {
        if (isIdle && nextAvailableNode > 10) {
            let randomNode = Math.floor(Math.random() * nextAvailableNode);
            brain.inject_voltage(randomNode, 2.0);
        }
        brain.tick(0.1, true); 
    }, 100);
}

function extractValidWords(rawStr) {
    const words = rawStr.toLowerCase().match(/\b\w+\b/g) || [];
    return words.filter(w => !stopWords.has(w) && w.length > 2);
}

function processText(text) {
    const oracleMatch = text.toUpperCase().match(/^ORACLE\((\d+)\):(.*)/);
    
    if (oracleMatch) {
        return handleOracle(extractValidWords(oracleMatch[2]), parseInt(oracleMatch[1], 10));
    } 
    else if (text.toUpperCase().startsWith('ORACLE:')) {
        return handleOracle(extractValidWords(text.substring(7)), 500); 
    }
    else if (text.trim().endsWith('?')) {
        return handleQuery(extractValidWords(text));
    }

    const newWords = extractValidWords(text);
    wordQueue = [...wordQueue, ...newWords];
    
    if (initialQueueSize === 0) {
        initialQueueSize = wordQueue.length;
    } else {
        initialQueueSize += newWords.length;
    }
    
    lastProcessedNode = null; 
    processQueue();
}

function handleQuery(words) {
    const knownWords = words.filter(w => dictionary.has(w));
    if (knownWords.length === 0) return postMessage({ type: 'AION_RESPONSE', text: "READOUT: NO TEMPORAL DATA FOUND FOR THOSE VARIABLES." });

    knownWords.forEach(w => brain.inject_voltage(dictionary.get(w), 50.0));
    for (let i = 0; i < 5; i++) brain.tick(0.016, false);

    let associations = [];
    for (let i = 0; i < nextAvailableNode; i++) {
        const word = reverseDictionary.get(i);
        if (!knownWords.includes(word)) associations.push({ word, voltage: brain.get_voltage(i) });
    }

    associations.sort((a, b) => b.voltage - a.voltage);
    const topConcepts = associations.slice(0, 5).filter(a => a.voltage > 0.5).map(a => a.word);

    if (topConcepts.length > 0) postMessage({ type: 'AION_RESPONSE', text: `CORRELATION FIELD: ${topConcepts.join(" ⚡ ")}` });
    else postMessage({ type: 'AION_RESPONSE', text: "READOUT: INSUFFICIENT DATA TO FORM CORRELATIONS." });
}

function handleOracle(words, horizon) {
    const knownWords = words.filter(w => dictionary.has(w));
    if (knownWords.length === 0) {
        return postMessage({ type: 'AION_RESPONSE', text: "[ORACLE ERROR]: Unrecognized baseline variables. Ingest historical data first." });
    }

    const nodeIds = new Uint32Array(knownWords.map(w => dictionary.get(w)));
    const predictedIds = brain.simulate_future(nodeIds, horizon);
    const predictedWords = Array.from(predictedIds).map(id => reverseDictionary.get(id));
    
    if (predictedWords.length > 0) {
        postMessage({ type: 'AION_RESPONSE', text: `[PROJECTION T+${horizon}]: Causal trajectory strongly indicates emergent states: ⚡ ${predictedWords.join(" ⚡ ")}` });
    } else {
        postMessage({ type: 'AION_RESPONSE', text: `[PROJECTION T+${horizon}]: Topology stable. Causality decays into entropy.` });
    }
}

function processQueue() {
    isIdle = false;
    clearTimeout(idleTimer);

    const digestionLimit = 200; // Limit processing to 200 words per chunk to prevent browser freezing
    let processedThisCycle = 0;

    while (wordQueue.length > 0 && processedThisCycle < digestionLimit) {
        const word = wordQueue.shift();
        processedThisCycle++;
        
        if (!dictionary.has(word)) {
            const nodeIndex = nextAvailableNode++;
            dictionary.set(word, nodeIndex);
            reverseDictionary.set(nodeIndex, word);
            brain.flood_dopamine(); 
            postMessage({ type: 'NEW_CONCEPT', word });
        }
        
        const nodeIndex = dictionary.get(word);

        if (lastProcessedNode !== null && lastProcessedNode !== nodeIndex) {
            brain.create_synapse(lastProcessedNode, nodeIndex, 1.8); 
            brain.create_synapse(nodeIndex, lastProcessedNode, 0.4); 
        }
        lastProcessedNode = nodeIndex;

        brain.inject_voltage(nodeIndex, brain.grade_stimulus(nodeIndex));
        brain.tick(0.016, true);
    }
    
    // Broadcast progress to the UI
    if (initialQueueSize > 0) {
        const processed = initialQueueSize - wordQueue.length;
        const percentage = Math.floor((processed / initialQueueSize) * 100);
        postMessage({ type: 'DIGESTION_PROGRESS', progress: percentage });
    }
    
    if (wordQueue.length > 0) {
        // Yield to the main thread, then process the next chunk
        setTimeout(processQueue, 10);
    } else {
        // Digestion fully complete
        initialQueueSize = 0;
        postMessage({ type: 'DIGESTION_PROGRESS', progress: 100 });
        postMessage({ type: 'AION_RESPONSE', text: "[SYSTEM]: Bulk data assimilation complete. Matrix crystallized." });
        
        idleTimer = setTimeout(() => {
            isIdle = true;
            saveMatrix();
        }, 5000);
    }
}

self.onmessage = function(e) {
    const { type, payload } = e.data;
    if (type === 'INGEST_TEXT') processText(payload);
    else if (type === 'RESET_BRAIN') {
        if (brain) brain.free(); 
        brain = new SpikingNetwork(1_000_000);
        dictionary.clear();
        reverseDictionary.clear();
        nextAvailableNode = 0;
        initialQueueSize = 0;
        const tx = db.transaction('memory', 'readwrite');
        tx.objectStore('memory').clear();
        postMessage({ type: 'MATRIX_WIPED' });
    }
};

setup();