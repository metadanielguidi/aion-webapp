import init, { SpikingNetwork } from './pkg/aion_core.js';
import { pipeline, env } from 'https://cdn.jsdelivr.net/npm/@xenova/transformers@2.16.0';

env.allowLocalModels = false; 

let brain;
let extractor; 
let isIdle = true;
let isReady = false;
let isProcessingQueue = false;
let isThinking = false;
let idleTimer;
let wordQueue = [];
let recentNodes = [];
let initialQueueSize = 0;
let pendingQuery = null;
let conversationalMemory = [];
let quantitativeMemory = new Map();

const nodeVectors = new Map(); 
let dictionary = new Map();
let reverseDictionary = new Map();
const SEMANTIC_THRESHOLD = 0.85; 

// PURE DYNAMIC HABITUATION
let wordFrequencies = new Map();
let totalWordsIngested = 0;
const HABITUATION_THRESHOLD = 0.05; 
const GRACE_PERIOD = 20; 

let nextAvailableNode = 0; 
const dbName = "AionOracleDB";
let db;

function sendTelemetry(statusOverride = null) {
    let status = statusOverride;
    if (!status) {
        if (!isReady) status = "INITIALIZING";
        else if (isProcessingQueue) status = "INGESTING_DATA";
        else if (isThinking) status = "SYNTHESIZING";
        else status = "IDLE (METABOLIZING)";
    }
    
    let totalEdges = 0;
    if (brain && nextAvailableNode > 0) {
        const lens = brain.export_edge_lens(nextAvailableNode);
        for (let i = 0; i < lens.length; i++) {
            totalEdges += lens[i];
        }
    }

    postMessage({
        type: 'TELEMETRY_UPDATE',
        payload: { status, nodes: nextAvailableNode, words: totalWordsIngested, edges: totalEdges }
    });
}

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

function normalizeVector(vec) {
    let norm = 0;
    for (let i = 0; i < vec.length; i++) norm += vec[i] * vec[i];
    norm = Math.sqrt(norm);
    if (norm > 0) {
        for (let i = 0; i < vec.length; i++) vec[i] /= norm;
    }
}

function driftVectors(idA, idB, driftRate) {
    let vecA = nodeVectors.get(idA);
    let vecB = nodeVectors.get(idB);
    if (!vecA || !vecB) return;

    // Physically pull the foundational meanings of the two concepts toward each other
    for (let i = 0; i < vecA.length; i++) {
        let diff = vecB[i] - vecA[i];
        vecA[i] += diff * driftRate;
        vecB[i] -= diff * driftRate; 
    }
    // Re-normalize so they remain mathematically valid on the hypersphere
    normalizeVector(vecA);
    normalizeVector(vecB);
}

function initDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(dbName, 3); 
        request.onupgradeneeded = (event) => {
            db = event.target.result;
            if (!db.objectStoreNames.contains('memory')) db.createObjectStore('memory');
        };
        request.onsuccess = (event) => {
            db = event.target.result;
            
            // THE GHOST FIX: If you refresh, this tells the OLD worker 
            // to die immediately so the NEW worker can take the database lock.
            db.onversionchange = () => {
                db.close();
                console.log("[SYSTEM]: Old semantic connection severed for refresh.");
            };
            
            resolve(db);
        };
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
        edge_caps: brain.export_edge_caps(activeCount),
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
                
                // WAKE UP THE MATRIX: Tell the SNN exactly how many nodes it has!
                brain.set_active_count(nextAvailableNode);
                
                brain.import_v(state.v);
                brain.import_edge_ptrs(state.edge_ptrs);
                brain.import_edge_lens(state.edge_lens);
                if (state.edge_caps) brain.import_edge_caps(state.edge_caps);
                brain.import_edge_dst(state.edge_dst);
                brain.import_edge_weight(state.edge_weight);
                
                sendTelemetry();
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

    postMessage({ type: 'AION_RESPONSE', text: "[SYSTEM]: Biological Voicebox initialized." });

    await init();
    await initDB();
    brain = new SpikingNetwork(1_000_000);
    await loadMatrix();
    
    startCognitiveMetabolism();
    isReady = true;
    sendTelemetry();
    postMessage({ type: 'READY' });
}

function startCognitiveMetabolism() {
    // The "Dream Cycle" - Simulates memory consolidation during idle states.
    setInterval(() => {
        if (isIdle && !isProcessingQueue && !isThinking && nextAvailableNode > 25) { // Need a critical mass of concepts to dream
            dreamCycle();
        }
        
        // We still run a global decay tick. This is crucial. It ensures that
        // weak, hypothetical "dream" bonds that don't get reinforced will naturally die.
        // This is the "forgetting" part of learning.
        brain.tick(0.1, true); 

    }, 500); // A slower, more deliberate cycle than the rapid-fire ingestion ticks.
}

function dreamCycle() {
    // 1. THE DAY RESIDUE EFFECT (REM SLEEP): 
    // 50% of the time, the brain picks a concept it was actively thinking about recently 
    // to consolidate short-term memory into long-term structures.
    let nodeA;
    if (recentNodes.length > 0 && Math.random() > 0.5) {
        nodeA = recentNodes[Math.floor(Math.random() * recentNodes.length)];
    } else {
        nodeA = Math.floor(Math.random() * nextAvailableNode);
    }
    
    let nodeB = Math.floor(Math.random() * nextAvailableNode);
    while (nodeB === nodeA) {
        nodeB = Math.floor(Math.random() * nextAvailableNode);
    }

    // 2. Simulate the future cascade resulting from their co-activation.
    const dreamInput = new Uint32Array([nodeA, nodeB]);
    
    // Construct the frequency array to pass to WASM
    const nodeFreqs = new Uint32Array(nextAvailableNode);
    for (let i = 0; i < nextAvailableNode; i++) {
        const word = reverseDictionary.get(i);
        nodeFreqs[i] = wordFrequencies.get(word) || 1;
    }
    const dreamscape = brain.simulate_future(dreamInput, 250, nodeFreqs); // A short, high-energy simulation.

    // 3. Hebbian Learning: "Neurons that fire together, wire together."
    // If the dream was "coherent" (i.e., it formed a resonant bridge to other concepts),
    // we form a weak, hypothetical synaptic bond between the two seed nodes.
    if (dreamscape.length > 0) {
        const hypotheticalWeight = 1.0; // A very small initial bond, like a faint memory trace.
        brain.create_synapse(nodeA, nodeB, hypotheticalWeight);
        brain.create_synapse(nodeB, nodeA, hypotheticalWeight);
        
        // SEMANTIC PLASTICITY (INSIGHT INTEGRATION):
        // AION redefines the literal meaning of words based on its own internal insights.
        driftVectors(nodeA, nodeB, 0.02); // 2% heavy drift for a profound dream realization

        const wordA = reverseDictionary.get(nodeA);
        const wordB = reverseDictionary.get(nodeB);
        const dreamConcepts = Array.from(dreamscape).slice(0, 5).map(id => reverseDictionary.get(id)).join(', ');
        
        postMessage({ type: 'AION_DREAM', text: `Co-activating '${wordA}' and '${wordB}' generated a resonant cascade involving: [${dreamConcepts}]. A hypothetical bond was formed, and their vectors drifted closer.` });
    }
}

function targetedDreamCycle(nodeA, nodeB) {
    const dreamInput = new Uint32Array([nodeA, nodeB]);
    const nodeFreqs = new Uint32Array(nextAvailableNode);
    for (let i = 0; i < nextAvailableNode; i++) {
        const word = reverseDictionary.get(i);
        nodeFreqs[i] = wordFrequencies.get(word) || 1;
    }
    const dreamscape = brain.simulate_future(dreamInput, 250, nodeFreqs);

    const hypotheticalWeight = 100.0; // Increased massively to guarantee survival past the Semantic Event Horizon
    brain.create_synapse(nodeA, nodeB, hypotheticalWeight);
    brain.create_synapse(nodeB, nodeA, hypotheticalWeight);
    driftVectors(nodeA, nodeB, 0.05); // Force vector alignment

    const wordA = reverseDictionary.get(nodeA);
    const wordB = reverseDictionary.get(nodeB);

    if (dreamscape.length > 0) {
        const dreamConcepts = Array.from(dreamscape)
            .map(id => reverseDictionary.get(id))
            .filter(w => w && !QUERY_STOP_WORDS.has(w) && !conflictConcepts.has(w))
            .slice(0, 5)
            .join(', ');
        postMessage({ type: 'AION_DREAM', text: `Targeted co-activation of '${wordA}' and '${wordB}' generated a resonant cascade involving: [${dreamConcepts}]. A forced conceptual bridge was established.` });
    } else {
        postMessage({ type: 'AION_DREAM', text: `Targeted co-activation of '${wordA}' and '${wordB}' yielded no immediate resonance. Forcing a novel synaptic bridge.` });
    }
}

const QUERY_STOP_WORDS = new Set(['and', 'the', 'with', 'from', 'what', 'how', 'why', 'who', 'this', 'that', 'then', 'than', 'are', 'was', 'has', 'had', 'have', 'been', 'does', 'did', 'for', 'about', 'happens', 'into', 'onto', 'upon', 'will', 'would', 'could', 'should', 'shall', 'can', 'may', 'might', 'must', 'which', 'where', 'when', 'there', 'their', 'they', 'them', 'these', 'those', 'some', 'many', 'much', 'very']);
const conflictConcepts = new Set(["destroys", "opposes", "prevents", "suppresses", "crushes", "blocks", "hinders", "deters", "extinguishes", "kills", "against", "anti"]);

function extractValidWords(rawStr, isLearning = false) {
    const words = rawStr.toLowerCase().match(/\b\w+\b/g) || [];
    const validWords = [];

    for (let w of words) {
        if (w.length <= 2) continue; // Keep the basic 2-letter filter

        if (isLearning) {
            totalWordsIngested++; 
            wordFrequencies.set(w, (wordFrequencies.get(w) || 0) + 1);
            validWords.push(w);
        } else {
            // PRAGMATIC SHIELD: Prevent basic structural words from becoming supercharged query anchors
            if (QUERY_STOP_WORDS.has(w)) continue;

            // DYNAMIC ATTENTION (Listening Filter):
            // If parsing a user query, automatically ignore words that the matrix has 
            // learned are ubiquitous structural noise (e.g. > 0.5% of the total corpus).
            if (totalWordsIngested > 10000) {
                const freq = wordFrequencies.get(w) || 0;
                if ((freq / totalWordsIngested) > 0.005) continue; // Skip "with", "does", etc.
            }
            validWords.push(w);
        }
    }
    return validWords;
}

function processText(text) {
    const newWords = extractValidWords(text, true); 
    wordQueue = [...wordQueue, ...newWords];
    
    if (initialQueueSize === 0) initialQueueSize = wordQueue.length;
    else initialQueueSize += newWords.length;
    
    recentNodes = []; 
    if (!isProcessingQueue) {
        processQueueAsync();
    }
}

async function processQueueAsync() {
    isProcessingQueue = true;
    isIdle = false;
    clearTimeout(idleTimer);

    const digestionLimit = 100; // Increased to speed up bulk ingestion
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
                
                // SYNCHRONIZE: Tell WASM a new node exists
                brain.set_active_count(nextAvailableNode); 
                
                dictionary.set(word, targetNodeIndex);
                reverseDictionary.set(targetNodeIndex, word);
                nodeVectors.set(targetNodeIndex, incomingVector); 
                brain.flood_dopamine(); 
                
                sendTelemetry();
                postMessage({ type: 'NEW_CONCEPT', word }); 
            }
        }

        // COGNITIVE WORKING MEMORY WINDOW
        // We use the Sensory Cortex (embeddings) to modulate the temporal bonds.
        // Semantically similar concepts form massive Hebbian bonds, while grammatical filler is suppressed!
        let distance = 1;
        const currentVec = nodeVectors.get(targetNodeIndex);
        for (let i = recentNodes.length - 1; i >= 0; i--) {
            const prevNode = recentNodes[i];
            if (prevNode !== targetNodeIndex) {
                let sim = 0.1; // default low similarity
                const prevVec = nodeVectors.get(prevNode);
                if (currentVec && prevVec) {
                    sim = cosineSimilarity(currentVec, prevVec);
                }
                
                // STEEP SEMANTIC CLIFF: Dense embedding models mathematically cluster syntactic roles.
                // RESTORED BALANCE: Widen the excitatory net so AION can properly ingest Wikipedia.
                let semanticMultiplier;
                if (sim >= 0.40) {
                    semanticMultiplier = sim * 3.0; // Excitatory bond
                } else if (sim < 0.15) {
                    semanticMultiplier = -3.0; // Inhibitory bond (Unrelated noise)
                } else {
                    semanticMultiplier = 0.1; // Weak neutral noise
                }

                // DYNAMIC ANTAGONISM: Antonyms share vector space. To differentiate them, we check the active context.
                // If combative concepts are in Working Memory, we invert the bonds into explicit mathematical inhibition!
                const conflictConcepts = new Set(["destroys", "opposes", "prevents", "suppresses", "crushes", "blocks", "hinders", "deters", "extinguishes", "kills", "against", "anti"]);
                for (let n of recentNodes) {
                    if (conflictConcepts.has(reverseDictionary.get(n))) {
                        semanticMultiplier = -Math.abs(semanticMultiplier) * 1.5;
                        break;
                    }
                }

                const forwardWeight = (25.0 / distance) * semanticMultiplier;
                const backwardWeight = (5.0 / distance) * semanticMultiplier;
                brain.create_synapse(prevNode, targetNodeIndex, forwardWeight); 
                brain.create_synapse(targetNodeIndex, prevNode, backwardWeight); 
                
                // SEMANTIC PLASTICITY (SENSORY INTEGRATION): 
                // Concepts read closely together gradually pull each other's foundational meaning over time.
                if (distance <= 2) {
                    if (semanticMultiplier > 0) {
                        driftVectors(prevNode, targetNodeIndex, 0.005); // Excitatory: Pull together
                    } else if (semanticMultiplier < 0) {
                        driftVectors(prevNode, targetNodeIndex, -0.005); // Inhibitory: Push apart (Neuroplasticity!)
                    }
                }
            }
            distance++;
        }
        
        recentNodes.push(targetNodeIndex);
        if (recentNodes.length > 6) { // INCREASED to 6 to capture longer semantic gaps
            recentNodes.shift();
        }

        brain.inject_voltage(targetNodeIndex, brain.grade_stimulus(targetNodeIndex));
        brain.tick(0.016, true);
    }
    
    if (initialQueueSize > 0) {
        const processed = initialQueueSize - wordQueue.length;
        const percentage = Math.floor((processed / initialQueueSize) * 100);
        sendTelemetry();
        postMessage({ type: 'DIGESTION_PROGRESS', progress: percentage });
    }
    
    if (wordQueue.length > 0) {
        setTimeout(processQueueAsync, 1);
    } else {
        isProcessingQueue = false;
        initialQueueSize = 0;
        postMessage({ type: 'DIGESTION_PROGRESS', progress: 100 });
        sendTelemetry();
        
        idleTimer = setTimeout(() => {
            isIdle = true;
            saveMatrix();
        }, 5000);
        
        if (pendingQuery) {
            const q = pendingQuery;
            pendingQuery = null;
            if (q && q.type === "AGI_CONTINUE") {
                setTimeout(() => executeAutonomousLoop(q.text, q.iteration), 500);
            } else {
                postMessage({ type: 'AION_RESPONSE', text: "[SYSTEM]: Semantic assimilation complete." });
                setTimeout(() => executeAutonomousLoop(q), 500);
            }
        } else {
            // AGI BUTTERFLY EFFECT: Automatically predict the future based on newly ingested physics.
            let recentWords = recentNodes.map(n => reverseDictionary.get(n)).filter(w => w && !QUERY_STOP_WORDS.has(w) && !conflictConcepts.has(w));
            if (recentWords.length > 0) {
                postMessage({ type: 'AION_RESPONSE', text: "[SYSTEM]: Physics assimilated. Autonomously extrapolating downstream temporal consequences..." });
                setTimeout(() => executeAutonomousLoop(recentWords.join(" ")), 100);
            } else {
                postMessage({ type: 'AION_RESPONSE', text: "[SYSTEM]: Semantic assimilation complete." });
            }
        }
    }
}

let unresolvableConcepts = new Set();

async function executeAutonomousLoop(text, iteration = 1) {
    isThinking = true;
    sendTelemetry();
    
    postMessage({ type: 'AION_RESPONSE', text: `[AGI LOOP ${iteration}/4]: Synthesizing vector topology for objective...` });
    
    const words = extractValidWords(text, false); 
    let nodeIds = [];
    let mappedMsg = "";
    let unknownConcepts = [];
    
    for (let word of words) {
        if (dictionary.has(word)) {
            nodeIds.push(dictionary.get(word));
        } else {
            if (!unresolvableConcepts.has(word)) {
                const output = await extractor(word, { pooling: 'mean', normalize: true });
                let bestMatchId = null;
                let highestSimilarity = 0;

                for (let [id, vec] of nodeVectors.entries()) {
                    const sim = cosineSimilarity(output.data, vec);
                    if (sim > SEMANTIC_THRESHOLD && sim > highestSimilarity) {
                        highestSimilarity = sim;
                        bestMatchId = id;
                    }
                }

                if (bestMatchId !== null) {
                    nodeIds.push(bestMatchId);
                    const matchedWord = reverseDictionary.get(bestMatchId);
                    mappedMsg += `[Mapped '${word}' -> '${matchedWord}'] `;
                } else {
                    unknownConcepts.push(word);
                }
            }
        }
    }
    
    
    const wikiConcepts = unknownConcepts.filter(w => !conflictConcepts.has(w) && !QUERY_STOP_WORDS.has(w));
    
        if (wikiConcepts.length > 0) {
            const concept = wikiConcepts[0]; 
            postMessage({ type: 'AION_RESPONSE', text: `[AGI LOOP]: Missing knowledge on '${concept}'. Sourcing live telemetry and global knowledge...` });
            
            let dataFound = false;
            let ingestedText = "";

            try {
                const coinRes = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(concept)}&vs_currencies=usd&include_24hr_change=true`);
                if (coinRes.ok) {
                    const data = await coinRes.json();
                    if (data[concept]) {
                        const change = data[concept].usd_24h_change;
                        const price = data[concept].usd;
                        quantitativeMemory.set(concept, { price, change });
                        let momentum = change > 5 ? "surges" : change > 0 ? "grows" : change < -5 ? "crashes" : "drops";
                        ingestedText = `${concept} ${momentum}.`;
                        dataFound = true;
                    }
                }
            } catch (e) {}

            if (!dataFound) {
                try {
                    const res = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(concept)}`);
                    if (res.ok) {
                        const data = await res.json();
                        if (data.type === 'standard' && data.extract) {
                            ingestedText = data.extract;
                            dataFound = true;
                        }
                    }
                } catch (e) {}
            }

            if (dataFound) {
                postMessage({ type: 'AION_RESPONSE', text: `[AGI LOOP]: Data successfully acquired for '${concept}'. Metabolizing into Spiking Neural Network...` });
                pendingQuery = { type: "AGI_CONTINUE", text: text, iteration: iteration };
                return processText(ingestedText);
            } else {
                postMessage({ type: 'AION_RESPONSE', text: `[AGI LOOP]: Failed to acquire external data for '${concept}'. Marking as unresolvable entropy.` });
                unresolvableConcepts.add(concept);
                return setTimeout(() => executeAutonomousLoop(text, iteration), 500);
            }
        }

        if (nodeIds.length === 0) {
            postMessage({ type: 'AION_RESPONSE', text: `[AGI FAILURE]: Zero valid semantic anchors could be mapped. The matrix cannot proceed.` });
            isThinking = false;
            sendTelemetry();
            return;
        }

        if (mappedMsg !== "") {
            postMessage({ type: 'AION_RESPONSE', text: `[SYSTEM_NOTE]: ${mappedMsg.trim()}` });
        }
        
        const nodeFreqs = new Uint32Array(nextAvailableNode);
        for (let i = 0; i < nextAvailableNode; i++) {
            const word = reverseDictionary.get(i);
            nodeFreqs[i] = wordFrequencies.get(word) || 1;
        }
        
        for (let id of nodeIds) {
            if (!conversationalMemory.includes(id)) conversationalMemory.push(id);
        }
        if (conversationalMemory.length > 10) conversationalMemory = conversationalMemory.slice(conversationalMemory.length - 10);
        const contextIds = new Uint32Array(conversationalMemory);

        const predictedIds = brain.simulate_future(contextIds, 500, nodeFreqs);
        const allActiveIds = new Uint32Array([...contextIds, ...predictedIds]);
        const topologyData = brain.get_causal_topology(allActiveIds, contextIds, nodeFreqs);

        let connectedQueryNodes = 0;
        for (let id of nodeIds) {
            let found = false;
            for (let i = 0; i < topologyData.length; i += 4) {
                if (topologyData[i] === id || topologyData[i+1] === id) { found = true; break; }
            }
            if (found) connectedQueryNodes++;
        }

        let isSuccess = false;
        if (nodeIds.length > 1) {
            isSuccess = (topologyData.length > 0 && connectedQueryNodes >= 2);
        } else {
            isSuccess = (topologyData.length > 0);
        }

        if (isSuccess) {
            postMessage({ type: 'AION_RESPONSE', text: `[AGI SUCCESS]: Autonomous objective resolved. Synthesizing final chronological timeline...` });
            
            let displayString = "";
            let promptString = "";
            let futureConcepts = Array.from(predictedIds)
                .map(id => reverseDictionary.get(id))
                .filter(w => w && !QUERY_STOP_WORDS.has(w) && !conflictConcepts.has(w) && w.length > 2)
                .join(", ");
            
            let maxScore = -Infinity; 
            let minScore = Infinity;
            for (let i = 0; i < topologyData.length; i += 4) {
                const srcWord = reverseDictionary.get(topologyData[i]);
                const dstWord = reverseDictionary.get(topologyData[i+1]);
                if (conflictConcepts.has(srcWord) || conflictConcepts.has(dstWord) || QUERY_STOP_WORDS.has(srcWord) || QUERY_STOP_WORDS.has(dstWord)) continue;

                if (topologyData[i+3] > maxScore) maxScore = topologyData[i+3];
                if (topologyData[i+3] < minScore) minScore = topologyData[i+3];
            }
            
            let scoreRange = maxScore - minScore;
            if (scoreRange === 0 || !isFinite(scoreRange)) scoreRange = 1.0;

            for (let i = 0; i < topologyData.length; i += 4) {
                const srcWord = reverseDictionary.get(topologyData[i]);
                const dstWord = reverseDictionary.get(topologyData[i+1]);
                
                if (conflictConcepts.has(srcWord) || conflictConcepts.has(dstWord) || QUERY_STOP_WORDS.has(srcWord) || QUERY_STOP_WORDS.has(dstWord)) continue;

                const weight = topologyData[i+2];
                const score = topologyData[i+3];
                const pct = (score - minScore) / scoreRange;
                const selector = Math.floor(score) % 3;
                let verb = "";
                
                if (weight < 0) {
                    const verbs85 = ["destroys", "obliterates", "crushes"];
                    const verbs60 = ["suppresses", "prevents", "blocks"];
                    const verbs40 = ["inhibits", "restricts", "hinders"];
                    const verbs20 = ["diminishes", "weakens", "reduces"];
                    const verbs05 = ["discourages", "deters", "resists"];
                    const verbsBase = ["opposes", "pushes_away", "conflicts_with"];
                    verb = verbsBase[selector];
                    if (pct >= 0.85) verb = verbs85[selector];
                    else if (pct > 0.60) verb = verbs60[selector];
                    else if (pct > 0.40) verb = verbs40[selector];
                    else if (pct > 0.20) verb = verbs20[selector];
                    else if (pct > 0.05) verb = verbs05[selector];
                } else {
                    const verbs85 = ["dictates", "governs", "determines"];
                    const verbs60 = ["forces", "compels", "triggers"];
                    const verbs40 = ["drives", "propels", "shapes"];
                    const verbs20 = ["generates", "creates", "yields"];
                    const verbs05 = ["influences", "affects", "modifies"];
                    const verbsBase = ["interacts_with", "connects_to", "relates_to"];
                    verb = verbsBase[selector];
                    if (pct >= 0.85) verb = verbs85[selector];
                    else if (pct > 0.60) verb = verbs60[selector];
                    else if (pct > 0.40) verb = verbs40[selector];
                    else if (pct > 0.20) verb = verbs20[selector];
                    else if (pct > 0.05) verb = verbs05[selector];
                }
                
                let displayScore = score >= 1000000 ? (score / 1000000).toFixed(1) + "M" : (score >= 1000 ? (score / 1000).toFixed(1) + "k" : score.toFixed(1));
                displayString += `[${srcWord}(${verb})${dstWord}:${displayScore}] `;
            }

            postMessage({ type: 'AION_RESPONSE', text: `[PHYSICS LAYER]: ${displayString.trim()}` });

            const startTime = performance.now();
            let graph = new Map();
            let inDegree = new Map();
            let allNodes = new Set();
            
            for (let i = 0; i < topologyData.length; i += 4) {
                const srcWord = reverseDictionary.get(topologyData[i]);
                const dstWord = reverseDictionary.get(topologyData[i+1]);
                if (conflictConcepts.has(srcWord) || conflictConcepts.has(dstWord) || QUERY_STOP_WORDS.has(srcWord) || QUERY_STOP_WORDS.has(dstWord)) continue;

                const weight = topologyData[i+2];
                const score = topologyData[i+3];
                const pct = (score - minScore) / scoreRange;
                const selector = Math.floor(score) % 3;
                let verb = "";
                
                if (weight < 0) {
                    const verbs85 = ["destroys", "obliterates", "crushes"];
                    const verbs60 = ["suppresses", "prevents", "blocks"];
                    const verbs40 = ["inhibits", "restricts", "hinders"];
                    const verbs20 = ["diminishes", "weakens", "reduces"];
                    const verbs05 = ["discourages", "deters", "resists"];
                    const verbsBase = ["opposes", "pushes away", "conflicts with"];
                    verb = verbsBase[selector];
                    if (pct >= 0.85) verb = verbs85[selector];
                    else if (pct > 0.60) verb = verbs60[selector];
                    else if (pct > 0.40) verb = verbs40[selector];
                    else if (pct > 0.20) verb = verbs20[selector];
                    else if (pct > 0.05) verb = verbs05[selector];
                } else {
                    const verbs85 = ["dictates", "governs", "determines"];
                    const verbs60 = ["forces", "compels", "triggers"];
                    const verbs40 = ["drives", "propels", "shapes"];
                    const verbs20 = ["generates", "creates", "yields"];
                    const verbs05 = ["influences", "affects", "modifies"];
                    const verbsBase = ["interacts with", "connects to", "relates to"];
                    verb = verbsBase[selector];
                    if (pct >= 0.85) verb = verbs85[selector];
                    else if (pct > 0.60) verb = verbs60[selector];
                    else if (pct > 0.40) verb = verbs40[selector];
                    else if (pct > 0.20) verb = verbs20[selector];
                    else if (pct > 0.05) verb = verbs05[selector];
                }

                if (!graph.has(srcWord)) graph.set(srcWord, []);
                graph.get(srcWord).push({ dst: dstWord, verb, pct });
                
                if (!inDegree.has(dstWord)) inDegree.set(dstWord, 0);
                if (!inDegree.has(srcWord)) inDegree.set(srcWord, 0);
                inDegree.set(dstWord, inDegree.get(dstWord) + 1);
                
                allNodes.add(srcWord);
                allNodes.add(dstWord);
            }

            let roots = [];
            for (let node of allNodes) {
                if (inDegree.get(node) === 0 && graph.has(node)) roots.push(node);
            }
            if (roots.length === 0 && graph.size > 0) {
                let bestNode = Array.from(graph.keys())[0];
                let maxOut = 0;
                for (let [k, v] of graph.entries()) {
                    if (v.length > maxOut) { maxOut = v.length; bestNode = k; }
                }
                roots.push(bestNode);
            }

            let visited = new Set();
            let sentences = [];

            function traverse(node, depth) {
                if (visited.has(node)) return "";
                visited.add(node);
                let edges = graph.get(node);
                if (!edges || edges.length === 0) return "";
                edges.sort((a, b) => b.pct - a.pct);
                
                let descriptions = [];
                for (let edge of edges) {
                    if (visited.has(edge.dst)) continue;
                    let nextStr = traverse(edge.dst, depth + 1);
                    if (nextStr === "") {
                        descriptions.push(`${edge.verb} ${edge.dst}`);
                    } else {
                        const transitionSelector = Math.floor(edge.pct * 100) % 3;
                        const transitionsDepth0 = ["which in turn", "and subsequently", "and thereby"];
                        const transitionsDepthN = ["which ultimately", "and finally", "which cascades and"];
                        if (depth === 0) {
                            descriptions.push(`${edge.verb} ${edge.dst}, ${transitionsDepth0[transitionSelector]} ${nextStr}`);
                        } else {
                            descriptions.push(`${edge.verb} ${edge.dst} (${transitionsDepthN[transitionSelector]} ${nextStr})`);
                        }
                    }
                }
                if (descriptions.length === 0) return "";
                if (descriptions.length === 1) return descriptions[0];
                if (descriptions.length === 2) return descriptions.join(" and ");
                return descriptions.slice(0, -1).join(", ") + ", and " + descriptions[descriptions.length - 1];
            }

            for (let root of roots) {
                let chain = traverse(root, 0);
                if (chain && chain !== root) sentences.push(`${root} ${chain}`);
            }

            let paragraph = "";
            if (sentences.length > 0) {
                paragraph = sentences.map(s => s.charAt(0).toUpperCase() + s.slice(1) + ".").join(" ");
                if (futureConcepts) paragraph += ` The chronological timeline extrapolates toward emergent future states involving: ${futureConcepts}.`;
                
                let quantForecast = [];
                for (let queryNode of nodeIds) {
                    const queryWord = reverseDictionary.get(queryNode);
                    if (quantitativeMemory.has(queryWord)) {
                        const quantData = quantitativeMemory.get(queryWord);
                        let semanticMultiplier = 1.0;
                        const analysisTxt = paragraph.toLowerCase();
                        if (analysisTxt.includes("surge") || analysisTxt.includes("grow") || analysisTxt.includes("dictate") || analysisTxt.includes("drive")) {
                            semanticMultiplier = 1.12; 
                        } else if (analysisTxt.includes("crash") || analysisTxt.includes("drop") || analysisTxt.includes("destroy") || analysisTxt.includes("suppress")) {
                            semanticMultiplier = 0.88; 
                        }
                        if (semanticMultiplier !== 1.0) {
                            const projectedPrice = (quantData.price * semanticMultiplier).toFixed(2);
                            quantForecast.push(`Quantitative translation projects ${queryWord.toUpperCase()} valuation shifting toward $${projectedPrice}.`);
                        }
                    }
                }
                if (quantForecast.length > 0) paragraph += " " + quantForecast.join(" ");
            } else {
                paragraph = "The matrix detects resonance, but the causal topology is too densely entangled to extract a linear narrative.";
            }

            postMessage({ type: 'AION_STREAM_START' });
            const wordsToType = paragraph.split(" ");
            for (let w of wordsToType) postMessage({ type: 'AION_STREAM_CHUNK', text: w + " " });
            
            const timeTaken = ((performance.now() - startTime) / 1000).toFixed(3);
            postMessage({ type: 'AION_STREAM_END', text: `[Synthesized algorithmically in ${timeTaken}s]` });

            isThinking = false;
            sendTelemetry();
            return;
        }

        if (iteration >= 4) {
            postMessage({ type: 'AION_RESPONSE', text: `[AGI FAILURE]: Maximum loops reached. The causal energy decays into entropy. No definitive future state found.` });
            isThinking = false;
            sendTelemetry();
            return;
        }

        postMessage({ type: 'AION_RESPONSE', text: `[AGI LOOP]: Causal topology disconnected. Engaging targeted abstract reasoning to force a dream bridge...` });
        
        if (nodeIds.length >= 2) {
            let missingNodes = nodeIds.filter(id => {
                for (let i = 0; i < topologyData.length; i += 4) {
                    if (topologyData[i] === id || topologyData[i+1] === id) return false;
                }
                return true;
            });
            let nA = nodeIds[0];
            let nB = missingNodes.length > 0 ? missingNodes[0] : nodeIds[1];
            if (nA === nB && nodeIds.length > 1) nB = nodeIds[1];
            targetedDreamCycle(nA, nB);
        } else {
            dreamCycle();
        }
        setTimeout(() => executeAutonomousLoop(text, iteration + 1), 1000);
}

self.onmessage = function(e) {
    const { type, payload } = e.data;
    
    if (type === 'USER_QUERY') {
        if (!isReady) {
            return postMessage({ type: 'AION_RESPONSE', text: "[SYSTEM]: Matrix is still initializing. Please wait." });
        }
        if (isProcessingQueue) {
            return postMessage({ type: 'AION_RESPONSE', text: "[SYSTEM]: Cognitive matrix is currently assimilating temporal data. Please wait for digestion to complete." });
        }
        
        if (isThinking) {
            return postMessage({ type: 'AION_RESPONSE', text: "[SYSTEM]: The Neocortex is currently synthesizing a response. Please wait." });
        }
        
        const text = payload.trim();
        const lowerText = text.toLowerCase();
        const isQuestion = text.includes('?') || lowerText.startsWith('what') || lowerText.startsWith('how') || lowerText.startsWith('why') || lowerText.startsWith('who') || lowerText.startsWith('does') || lowerText.startsWith('can') || lowerText.startsWith('is');
        
        if (isQuestion && !lowerText.startsWith('/learn ')) {
            unresolvableConcepts.clear();
            postMessage({ type: 'AION_RESPONSE', text: `[AGI SYSTEM]: Objective received. Commencing autonomous research and prediction loop...` });
            executeAutonomousLoop(text, 1);
        } else {
            const cleanText = lowerText.startsWith('/learn ') ? text.substring(7) : text;
            postMessage({ type: 'AION_RESPONSE', text: "[SYSTEM]: Metabolizing declarative physics into the Neocortex..." });
            processText(cleanText);
        }
    } 
    else if (type === 'INGEST_TEXT') {
        if (!isReady) {
            return postMessage({ type: 'AION_RESPONSE', text: "[SYSTEM]: Matrix is still initializing. Please wait." });
        }
        processText(payload);
    }
   else if (type === 'RESET_BRAIN') {
        if (!isReady) return;

        // 1. KILL THE GHOSTS: Stop all background saves and metabolism
        clearTimeout(idleTimer);
        isProcessingQueue = false;
        wordQueue = [];
        recentNodes = [];

        if (brain) brain.free(); 
        brain = new SpikingNetwork(1_000_000);
        
        // RESET: Initialize the WASM count back to zero
        brain.set_active_count(0); 

        dictionary.clear();
        reverseDictionary.clear();
        nodeVectors.clear();
        wordFrequencies.clear();
        totalWordsIngested = 0;
        nextAvailableNode = 0;
        initialQueueSize = 0;
        conversationalMemory = [];
        unresolvableConcepts.clear();
        quantitativeMemory.clear();

        const tx = db.transaction('memory', 'readwrite');
        tx.objectStore('memory').clear();

        tx.oncomplete = () => {
            sendTelemetry("OFFLINE (WIPED)");
            postMessage({ type: 'MATRIX_WIPED' });
        };
    }
    else if (type === 'REQUEST_EXPORT') {
        if (!isReady || !brain) return;
        
        let totalEdges = 0;
        let graphNodes = [];
        let graphLinks = [];
        
        if (nextAvailableNode > 0) {
            const lens = brain.export_edge_lens(nextAvailableNode);
            const ptrs = brain.export_edge_ptrs(nextAvailableNode);
            const maxEdgeIdx = brain.get_max_edge_index(nextAvailableNode);
            const dsts = brain.export_edge_dst(maxEdgeIdx);
            const weights = brain.export_edge_weight(maxEdgeIdx);
            
            for (let i = 0; i < nextAvailableNode; i++) {
                const sourceWord = reverseDictionary.get(i);
                const freq = wordFrequencies.get(sourceWord) || 1;
                
                // Export Nodes
                graphNodes.push({ id: sourceWord, val: freq });
                totalEdges += lens[i];
                
                // Export Edges (Filter out noise weights < 5.0 to keep the 3D graph performant)
                let ptr = ptrs[i];
                let len = lens[i];
                for (let j = 0; j < len; j++) {
                    let idx = ptr + j;
                    let dst = dsts[idx];
                    let w = weights[idx];
                // Lowered export threshold from 5.0 to 2.0 to ensure finer inhibitory threads are visible
                if (Math.abs(w) >= 2.0 && i !== dst) {
                        const targetWord = reverseDictionary.get(dst);
                        graphLinks.push({ source: sourceWord, target: targetWord, weight: w });
                    }
                }
            }
        }
        
        const exportState = {
            nodes: graphNodes,
            links: graphLinks
        };
        
        postMessage({ type: 'EXPORT_DATA', payload: exportState });
    }
};

setup();