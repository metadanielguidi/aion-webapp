import init, { SpikingNetwork } from './pkg/aion_core.js';
import { pipeline, env } from 'https://cdn.jsdelivr.net/npm/@xenova/transformers@2.16.0';
// Import the WebGPU Engine
import { CreateMLCEngine } from 'https://esm.run/@mlc-ai/web-llm';

env.allowLocalModels = false; 

let brain;
let extractor; 
let engine; // The WebGPU Neocortex
let isIdle = true;
let isReady = false;
let isProcessingQueue = false;
let idleTimer;
let wordQueue = [];
let lastProcessedNode = null;
let initialQueueSize = 0;

const nodeVectors = new Map(); 
let dictionary = new Map();
let reverseDictionary = new Map();
const SEMANTIC_THRESHOLD = 0.85; 

// PURE DYNAMIC HABITUATION
let wordFrequencies = new Map();
let totalWordsIngested = 0;
const HABITUATION_THRESHOLD = 0.04; 
const GRACE_PERIOD = 20; 

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
                        nodeVectors.set(id, new Float32Array(arr));
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
    postMessage({ type: 'AION_RESPONSE', text: "[SYSTEM]: Booting ONNX Hippocampal Senses..." });
    extractor = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2', { quantized: true });

    postMessage({ type: 'AION_RESPONSE', text: "[SYSTEM]: Initiating WebGPU Neocortical Bridge (Llama 3 8B)." });
    postMessage({ type: 'AION_RESPONSE', text: "[SYSTEM]: WARNING - Utilizing hardware plasticity. Caching 4.5GB matrix to IndexedDB. This will take several minutes on initial load." });
    
    const initProgressCallback = (initProgress) => {
        // Stream the download/compilation progress directly to the terminal
        postMessage({ type: 'AION_RESPONSE', text: `[WEBGPU]: ${initProgress.text}` });
    };

    // Load Llama 3 8B directly into the local GPU via WebGPU
    engine = await CreateMLCEngine(
        "Llama-3-8B-Instruct-q4f32_1-MLC", 
        { initProgressCallback: initProgressCallback }
    );

    postMessage({ type: 'AION_RESPONSE', text: "[SYSTEM]: Neocortex crystallized into VRAM." });

    await init();
    await initDB();
    brain = new SpikingNetwork(1_000_000);
    await loadMatrix();
    
    startCognitiveMetabolism();
    isReady = true;
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
        if (w.length <= 2) continue; 

        if (isLearning) {
            wordFrequencies.set(w, (wordFrequencies.get(w) || 0) + 1);
            totalWordsIngested++;
        }

        const frequencyRatio = (wordFrequencies.get(w) || 0) / Math.max(1, totalWordsIngested);

        if (totalWordsIngested > GRACE_PERIOD && frequencyRatio > HABITUATION_THRESHOLD) {
            continue; 
        }
        validWords.push(w);
    }
    return validWords;
}

function processText(text) {
    const newWords = extractValidWords(text, true); 
    wordQueue = [...wordQueue, ...newWords];
    
    if (initialQueueSize === 0) initialQueueSize = wordQueue.length;
    else initialQueueSize += newWords.length;
    
    lastProcessedNode = null; 
    if (!isProcessingQueue) {
        processQueueAsync();
    }
}

async function processQueueAsync() {
    isProcessingQueue = true;
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
        isProcessingQueue = false;
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
    
    // 1. Run the temporal simulation to get the emergent future nodes
    const predictedIds = brain.simulate_future(uintIds, 500);
    
    if (predictedIds.length > 0) {
        // 2. Combine the initial concepts and predicted concepts
        const allActiveIds = new Uint32Array([...uintIds, ...predictedIds]);
        
        // 3. Extract the physical edges connecting them using your new Rust method
        const topologyData = brain.get_causal_topology(allActiveIds);
        
        let relationalString = "";
        
        // 4. Translate the flat Float32Array into structural verbs
        for (let i = 0; i < topologyData.length; i += 3) {
            const srcWord = reverseDictionary.get(topologyData[i]);
            const dstWord = reverseDictionary.get(topologyData[i+1]);
            const weight = topologyData[i+2];
            
            // Map the physical weight to a strict verb
            let verb = "connects_to";
            if (weight > 5.0) verb = "forces";
            else if (weight > 2.0) verb = "drives";
            else if (weight > 0.5) verb = "influences";
            
            relationalString += `[${srcWord}(${verb})${dstWord}] `;
        }

        postMessage({ type: 'AION_RESPONSE', text: `[PHYSICS LAYER]: ${relationalString.trim()}` });
        postMessage({ type: 'AION_RESPONSE', text: `[AION_SYS]: Neocortex synthesizing...` });

        // 5. The Ironclad Prompt
        const messages = [
            { 
                role: "system", 
                content: "You are the vocal synthesis layer of a physical matrix. Your ONLY job is to translate the provided relational formulas into a single, cohesive future-tense paragraph. Do not invent any outside facts, technologies, or numbers. You must obey the exact verbs and cause-and-effect paths provided." 
            },
            { 
                role: "user", 
                content: `Relational topology: ${relationalString.trim()}. Synthesize the outcome:` 
            }
        ];

        try {
            const startTime = performance.now();

            const reply = await engine.chat.completions.create({
                messages,
                temperature: 0.0, // Absolute Zero Entropy
            });

            const timeTaken = ((performance.now() - startTime) / 1000).toFixed(1);
            postMessage({ type: 'AION_RESPONSE', text: `[AION]: ${reply.choices[0].message.content.trim()} [Synthesized in ${timeTaken}s]` });

        } catch (err) {
            postMessage({ type: 'AION_RESPONSE', text: `[VOICEBOX ERROR]: Neural synthesis failed. ${err.message}` });
        }

    } else {
        postMessage({ type: 'AION_RESPONSE', text: `[AION]: The causal energy decays into entropy. No clear future state found.` });
    }
}

self.onmessage = function(e) {
    const { type, payload } = e.data;
    
    if (type === 'USER_QUERY') {
        if (!isReady) {
            return postMessage({ type: 'AION_RESPONSE', text: "[SYSTEM]: Matrix is still initializing. Please wait." });
        }
        handleConversation(payload);
    } 
    else if (type === 'INGEST_TEXT') {
        if (!isReady) {
            return postMessage({ type: 'AION_RESPONSE', text: "[SYSTEM]: Matrix is still initializing. Please wait." });
        }
        processText(payload);
    }
    else if (type === 'RESET_BRAIN') {
        if (!isReady) return;
        if (brain) brain.free(); 
        brain = new SpikingNetwork(1_000_000);
        dictionary.clear();
        reverseDictionary.clear();
        nodeVectors.clear();
        wordFrequencies.clear();
        wordQueue = [];
        totalWordsIngested = 0;
        nextAvailableNode = 0;
        initialQueueSize = 0;
        const tx = db.transaction('memory', 'readwrite');
        tx.objectStore('memory').clear();
        postMessage({ type: 'MATRIX_WIPED' });
    }
};

setup();