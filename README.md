# Aion Project

Aion is a sophisticated AI project that runs entirely in the browser. It combines a custom-built Spiking Neural Network (SNN) with pre-trained transformer models to ingest, understand, and reason about textual information. It builds a dynamic semantic network from input text and uses this network to simulate causal chains of thought in response to queries.

## Core Features

*   **Spiking Neural Network (SNN):** At its heart is a high-performance SNN written in Rust and compiled to WebAssembly (`aion_core.js`). This handles the low-level neural simulation, including voltage dynamics, synaptic connections, and dopamine-like reward signals.
*   **Semantic Feature Extraction:** Utilizes the `Xenova/all-MiniLM-L6-v2` model via `transformers.js` to convert words into high-dimensional vectors, allowing for semantic similarity comparisons.
*   **Generative Reasoning:** Employs the `Xenova/Qwen1.5-0.5B-Chat` model to provide natural language explanations for the SNN's output, bridging the gap between the raw neural simulation and human understanding.
*   **Dynamic Habituation:** A unique feature that allows the system to learn which words are "structural noise" (like "the", "a", "is") without relying on hardcoded stop-word lists. It dynamically identifies and ignores words that appear with unusually high frequency in the source material.
*   **Persistent Memory:** The entire state of the network—including learned concepts (neurons), their semantic vectors, synaptic connections, and frequency data—is saved to the browser's IndexedDB. This allows Aion to retain its memory across sessions.
*   **Asynchronous Processing:** All heavy computation runs inside a Web Worker (`worker.js`), ensuring the main application UI remains responsive during text ingestion and simulation.
*   **Cognitive Metabolism:** A background process that periodically injects small amounts of energy into random neurons. This prevents the network from becoming static and encourages spontaneous, associative "thought patterns" during idle periods.

## How It Works

The system operates in two main modes: Ingestion and Conversation.

### 1. Ingestion Mode (`INGEST_TEXT`)

*   **Tokenization & Filtering:** Input text is broken down into individual words. Words that are too short or identified as "noise" through the dynamic habituation mechanism are discarded.
*   **Concept Mapping:** For each valid word, the system generates a semantic vector.
*   **Semantic Search:** It searches its existing network for a neuron (concept) with a semantically similar vector (using cosine similarity).
*   **Neuron Creation/Update:**
    *   If a close match (similarity > 0.85) is found, the word is mapped to that existing neuron.
    *   If no close match exists, a new neuron is created for this new concept. The system "rewards" itself for learning something new by flooding the network with dopamine (`brain.flood_dopamine()`), which likely strengthens recent synaptic formations.
*   **Synaptic Linking:** As words are processed sequentially, the system creates weighted, directed synapses between the corresponding neurons. This builds a temporal and causal map of how concepts relate to each other in the source text.
*   **Progress:** The worker reports digestion progress back to the main thread.

### 2. Conversation Mode (`USER_QUERY`)

*   **Query Translation:** The user's query is processed, and each word is mapped to its corresponding neuron in the network. Words not found in memory are mapped to the closest semantic equivalent if one exists.
*   **Physics Layer Simulation:** The identified neurons are stimulated within the SNN. The network then `simulate_future`, running the simulation forward in time to see which subsequent neurons are activated by the initial stimulus. This produces a "predicted" chain of concepts.
*   **LLM-Powered Explanation:**
    *   The initial concepts (from the query) and the predicted concepts (from the SNN) are formatted into a prompt.
    *   The `Qwen1.5-0.5B-Chat` model is invoked with this prompt, asking it to explain the scientific or logical causal relationship between the input and the predicted timeline.
    *   This generated explanation is sent back to the user, providing a high-level interpretation of the SNN's raw output.

## Interacting with the Worker

Communication with `worker.js` is handled via `postMessage` and `onmessage`.

### Sending Messages to the Worker

*   **`postMessage({ type: 'INGEST_TEXT', payload: 'Your text here...' })`**: To feed new information to the network.
*   **`postMessage({ type: 'USER_QUERY', payload: 'Your question here...' })`**: To ask a question or provide a prompt.
*   **`postMessage({ type: 'RESET_BRAIN' })`**: To completely wipe the network's memory and start fresh.

### Receiving Messages from the Worker

*   **`{ type: 'READY' }`**: Fired when all models and the Wasm module are initialized.
*   **`{ type: 'AION_RESPONSE', text: '...' }`**: Contains responses for the user, including system messages, SNN output, and LLM-generated explanations.
*   **`{ type: 'DIGESTION_PROGRESS', progress: ... }`**: A number from 0 to 100 indicating the progress of text ingestion.
*   **`{ type: 'NEW_CONCEPT', word: '...' }`**: Fired whenever a new word/concept is learned, useful for UI visualizations.
*   **`{ type: 'MATRIX_WIPED' }`**: Confirms that the brain has been reset.