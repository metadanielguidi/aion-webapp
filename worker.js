import init, { SpikingNetwork } from './pkg/aion_core.js';
import { pipeline, env } from 'https://cdn.jsdelivr.net/npm/@xenova/transformers@2.16.0';

env.allowLocalModels = false; 

let brain;
let extractor; 
let generator; 
let isIdle = true;
let idleTimer;
let wordQueue = [];
let lastProcessedNode = null;
let initialQueueSize = 0;

const nodeVectors = new Map(); 
let dictionary = new Map();
let reverseDictionary = new Map();
const SEMANTIC_THRESHOLD = 0.85; 

// --- PURE DYNAMIC HABITUATION ---
// No hardcoded English dictionaries. Pure mathematical emergence.
let wordFrequencies = new Map();
let totalWordsIngested = 0;
// Set to 4%. Core concepts will survive, but structural noise ("the", "is") will breach this easily.
const HABITUATION_THRESHOLD = 0.04; 
const GRACE_PERIOD = 20; // Let it adapt quickly even on tiny test files

let nextAvailableNode = 0; 
const dbName = "AionOracleDB";
let db;

function cosineSimilarity(vecA, vecB) {
    let dotProduct = 0, normA = 0, normB = 0;
    for (let i = 0; i < vecA.length; i++) {
        dotProduct += vecA[i] * vecB[i];
        normA += vecA[i] * vecA[i];
        normB += vecB[i] * vecB[i];
    }
    if (normA === 0 || normB === 0) return 0;
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

function initDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(dbName, 3); 
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
        nodeVectors: Array.from(nodeVectors.entries()),
        totalWordsIngested,
        wordFrequencies: Array.from(wordFrequencies.entries()), 
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
                
                if (state.nodeVectors) {
                    const parsedVectors = new Map(state.nodeVectors);
                    for (let [id, arr] of parsedVectors.entries()) {
                        nodeVectors.set(id, new Float32Array(Object.values(arr)));
                    }
                }

                if (state.totalWordsIngested !== undefined) {
                    totalWordsIngested = state.totalWordsIngested;
                    wordFrequencies = new Map(state.wordFrequencies);
                }

                nextAvailableNode = state.nextAvailableNode;
                brain.import_v(state.v);
                brain.import_edge_ptrs(state.edge_ptrs);
                brain.import_edge_lens(state.edge_lens);
                brain.import_edge_dst(state.edge_dst);
                brain.import_edge_weight(state.edge_weight);
                
                postMessage({ type: 'AION_RESPONSE', text: "[SYSTEM]: Temporal logic and semantic topology restored." });
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
    postMessage({ type: 'AION_RESPONSE', text: "[SYSTEM]: Booting ONNX Senses..." });
    extractor = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2', { quantized: true });

    // UPGRADED: A 0.5 Billion parameter logic model. 
    // WARNING: This will take a minute to download on the first boot (~350MB).
    postMessage({ type: 'AION_RESPONSE', text: "[SYSTEM]: Booting Qwen-0.5B Voicebox (This may take a minute to cache)..." });
    generator = await pipeline('text-generation', 'Xenova/Qwen1.5-0.5B-Chat', { quantized: true });

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

function extractValidWords(rawStr, isLearning = false) {
    const words = rawStr.toLowerCase().match(/\b\w+\b/g) || [];
    const validWords = [];

    for (let w of words) {
        if (w.length <= 2) continue; // Pure length filter

        if (isLearning) {
            wordFrequencies.set(w, (wordFrequencies.get(w) || 0) + 1);
            totalWordsIngested++;
        }

        const frequencyRatio = (wordFrequencies.get(w) || 0) / Math.max(1, totalWordsIngested);

        // Dynamic tuning: If a word is > 4% of the dataset, it's noise.
        if (totalWordsIngested > GRACE_PERIOD && frequencyRatio > HABITUATION_THRESHOLD) {
            continue; 
        }
        validWords.push(w);
    }
    return validWords;
}

// Handles bulk ingestion from the upload button
function processText(text) {
    const newWords = extractValidWords(text, true); // true = update frequency map
    wordQueue = [...wordQueue, ...newWords];
    
    if (initialQueueSize === 0) initialQueueSize = wordQueue.length;
    else initialQueueSize += newWords.length;
    
    lastProcessedNode = null; 
    processQueueAsync();
}

async function processQueueAsync() {
    isIdle = false;
    clearTimeout(idleTimer);

    const digestionLimit = 20; 
    let processedThisCycle = 0;

    while (wordQueue.length > 0 && processedThisCycle < digestionLimit) {
        const word = wordQueue.shift();
        processedThisCycle++;
        
        let targetNodeIndex = null;

        if (dictionary.has(word)) {
            targetNodeIndex = dictionary.get(word);
        } else {
            const output = await extractor(word, { pooling: 'mean', normalize: true });
            const incomingVector = output.data;
            
            let bestMatchId = null;
            let highestSimilarity = 0;

            for (let [id, vec] of nodeVectors.entries()) {
                const sim = cosineSimilarity(incomingVector, vec);
                if (sim > highestSimilarity) {
                    highestSimilarity = sim;
                    bestMatchId = id;
                }
            }

            if (highestSimilarity > SEMANTIC_THRESHOLD) {
                targetNodeIndex = bestMatchId;
            } else {
                targetNodeIndex = nextAvailableNode++;
                dictionary.set(word, targetNodeIndex);
                reverseDictionary.set(targetNodeIndex, word);
                nodeVectors.set(targetNodeIndex, incomingVector); 
                brain.flood_dopamine(); 
                
                // FIXED: Re-added the message to update the Visual Cortex!
                postMessage({ type: 'NEW_CONCEPT', word }); 
            }
        }

        if (lastProcessedNode !== null && lastProcessedNode !== targetNodeIndex) {
            brain.create_synapse(lastProcessedNode, targetNodeIndex, 1.8); 
            brain.create_synapse(targetNodeIndex, lastProcessedNode, 0.4); 
        }
        lastProcessedNode = targetNodeIndex;

        brain.inject_voltage(targetNodeIndex, brain.grade_stimulus(targetNodeIndex));
        brain.tick(0.016, true);
    }
    
    if (initialQueueSize > 0) {
        const processed = initialQueueSize - wordQueue.length;
        const percentage = Math.floor((processed / initialQueueSize) * 100);
        postMessage({ type: 'DIGESTION_PROGRESS', progress: percentage });
    }
    
    if (wordQueue.length > 0) {
        setTimeout(processQueueAsync, 10);
    } else {
        initialQueueSize = 0;
        postMessage({ type: 'DIGESTION_PROGRESS', progress: 100 });
        postMessage({ type: 'AION_RESPONSE', text: "[SYSTEM]: Semantic assimilation complete." });
        
        idleTimer = setTimeout(() => {
            isIdle = true;
            saveMatrix();
        }, 5000);
    }
}

async function handleConversation(text) {
    // false = do not update frequency map
    const words = extractValidWords(text, false); 
    let nodeIds = [];
    let translatedWords = [];
    
    for (let word of words) {
        if (dictionary.has(word)) {
            nodeIds.push(dictionary.get(word));
            translatedWords.push(word);
        } else {
            const output = await extractor(word, { pooling: 'mean', normalize: true });
            let bestMatchId = null;
            let highestSimilarity = 0;

            for (let [id, vec] of nodeVectors.entries()) {
                const sim = cosineSimilarity(output.data, vec);
                if (sim > highestSimilarity) {
                    highestSimilarity = sim;
                    bestMatchId = id;
                }
            }

            if (highestSimilarity > SEMANTIC_THRESHOLD) {
                nodeIds.push(bestMatchId);
                translatedWords.push(reverseDictionary.get(bestMatchId));
            }
        }
    }

    if (nodeIds.length === 0) {
        return postMessage({ type: 'AION_RESPONSE', text: "[ORACLE ERROR]: Zero semantic anchors found in memory for that query." });
    }

    const uintIds = new Uint32Array(nodeIds);
    const predictedIds = brain.simulate_future(uintIds, 500);
    const predictedWords = Array.from(predictedIds).map(id => reverseDictionary.get(id));
    
    if (predictedWords.length > 0) {
       postMessage({ type: 'AION_RESPONSE', text: `[PHYSICS LAYER]: ⚡ ${predictedWords.join(" ⚡ ")}` });
        
        // 1. PLAIN TEXT FORMATTING: No special tokens to get stripped.
        // 2. STRICT PERSONA: Removed "Voicebox" roleplay so it doesn't hallucinate about itself.
        const promptText = `System: You are an analytical logic engine. Explain the scientific causal relationship between the Input concepts and the resulting Timeline in one short paragraph.\n\nUser:\nInput: ${translatedWords.join(", ")}\nTimeline: ${predictedWords.join(", ")}\n\nAssistant:\n`;
        
        try {
            const output = await generator(promptText, {
                max_new_tokens: 150,
                temperature: 0.3,
                repetition_penalty: 1.2
            });

            // 3. BULLETPROOF EXTRACTION: Split exactly at the Assistant line
            let rawText = output[0].generated_text;
            let finalOutput = "";

            if (rawText.includes("Assistant:\n")) {
                // Grab everything after "Assistant:"
                finalOutput = rawText.split("Assistant:\n")[1].trim();
            } else {
                // Fallback
                finalOutput = rawText.replace(promptText, "").trim();
            }

            // Only post if it actually generated text
            if (finalOutput.length > 0) {
                postMessage({ type: 'AION_RESPONSE', text: `[AION]: ${finalOutput}` });
            } else {
                postMessage({ type: 'AION_RESPONSE', text: `[AION ERROR]: Model generated a blank sequence.` });
            }

        } catch (err) {
            postMessage({ type: 'AION_RESPONSE', text: `[VOICEBOX ERROR]: Neural synthesis failed. ${err.message}` });
        }

    } else {
        postMessage({ type: 'AION_RESPONSE', text: `[AION]: The causal energy for that concept decays into entropy. No clear future state found.` });
    }
}

self.onmessage = function(e) {
    const { type, payload } = e.data;
    
    if (type === 'USER_QUERY') {
        handleConversation(payload);
    } 
    else if (type === 'INGEST_TEXT') {
        processText(payload);
    }
    else if (type === 'RESET_BRAIN') {
        if (brain) brain.free(); 
        brain = new SpikingNetwork(1_000_000);
        dictionary.clear();
        reverseDictionary.clear();
        nodeVectors.clear();
        wordFrequencies.clear();
        totalWordsIngested = 0;
        nextAvailableNode = 0;
        initialQueueSize = 0;
        const tx = db.transaction('memory', 'readwrite');
        tx.objectStore('memory').clear();
        postMessage({ type: 'MATRIX_WIPED' });
    }
};

setup();