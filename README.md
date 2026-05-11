# AION: Synergistic Cognitive Matrix

AION is a 100% offline, browser-native Artificial General Intelligence (AGI) experiment. It abandons traditional "chatbot" architectures in favor of a continuous physical framework, driven entirely by a temporal physics engine (Spiking Neural Network).

There are no APIs, no cloud servers, no Chatbot constraints, and no LLMs. AION relies exclusively on pure continuous mathematical graph extraction to synthesize temporal causality.

## 🧠 System Architecture

AION runs entirely within the browser's sandbox using parallel web workers and local hardware acceleration.

* **The Temporal Matrix (Hippocampus):** A massive-scale Spiking Neural Network (SNN) written in **Rust** and compiled to **WebAssembly (WASM)**. It models time, causality, and entropy.
* **The Sensory Cortex (Embeddings):** Powered by `transformers.js` running the `Xenova/all-MiniLM-L6-v2` ONNX model. It translates raw human language into 384-dimensional mathematical vectors for the SNN.
* **The Algorithmic Motor Cortex (Broca's Area):** A completely deterministic, zero-hallucination JavaScript graph synthesizer. It utilizes a Depth-First Search (DFS) algorithm to traverse the directed causal topology from root to effect, dynamically generating fluent, compound-complex sentences.
* **The Visual Cortex:** A highly optimized HTML5 Canvas 2D physics engine that renders the SNN's semantic topology and temporal connections in real-time.
* **Memory:** Persistent IndexedDB storage. AION caches both its multi-gigabyte Neocortex and its evolving network topology locally.

## 🧬 Core Philosophy

* **Zero Chatbots:** Standard AGI architectures rely on pre-trained LLMs to act as a "brain", dragging along immense human bias, safety filters, and hallucinations. AION eliminates the LLM completely, forcing the physical network to speak for itself.
* **Dynamic Habituation (Zero Hardcoded Filters):** AION does not use hardcoded English dictionaries or stop-word filters. Every word enters the matrix. The Spiking Neural Network naturally learns to habituate to structural noise (like "the" or "and") by dynamically scaling focal voltage penalties based on a node's topological edge count, mathematically mimicking human subconscious attention.
* **100% Offline & Private:** Once the ONNX embedding model is cached to your browser, AION can run entirely air-gapped.

## 🌀 Emergent Network Dynamics

To prevent structural noise from overwhelming true semantic domains, AION employs several mathematically derived constraints:
* **Cognitive Working Memory Window:** AION ingests text using a flattened sliding window, mapping dense semantic webs rather than simple linear chains. It also maintains a conversational context window, allowing you to ask cascading follow-up questions without the matrix experiencing "amnesia."
* **The Dream Cycle (Memory Consolidation):** While idle, the matrix actively co-activates concepts from its "Day Residue" to simulate hypothetical cascades. If a coherent topological bridge is formed, it establishes novel insights entirely on its own.
* **Semantic Plasticity (Vector Drifting):** Standard AI models have frozen understandings of words. AION dynamically mutates the foundational 384-dimensional math of its sensory vocabulary based on its own text exposure and internal dreams, developing a completely subjective understanding of reality over time.
* **Myelination & True Pruning (Long-Term Memory Consolidation):** The Spiking Neural Network simulates years of biological learning. Massive foundational bonds (core curriculum) become "myelinated" and almost immune to decay, while weak, fleeting noise is aggressively pruned and forgotten, allowing the matrix to grow a stable, compounding intelligence.
* **Conscious Focal Gravity:** When you query the matrix, the specific queried concepts bypass standard decay shields and receive a massive focal voltage injection (`499.0x`). This allows hyper-specific niche concepts (like "proton") to pierce through the background noise of massive documents.
* **The Goldilocks Curve:** A scale-invariant topology filter that mathematically rewards true domain concepts (e.g., "physics", "energy") with core multipliers, while applying massive exponential hub penalties to both primary and secondary stop-words based on the evolving maximum density of the graph.
* **Directed Causal Arrows:** The matrix strictly preserves the arrow of time. A -> B is tracked distinctly from B -> A, allowing the graph traversal algorithm to read the physics layer linearly from root causes to final emergent effects.
* **Hebbian Supremacy & The Semantic Event Horizon:** Physical synaptic weights are squared to enforce non-linear concentration. Any causal edge that fails to exceed the 400.0 "Semantic Event Horizon" score is annihilated, ensuring only the most profound mathematical truths are sent to the Neocortex for synthesis.

## ⚖️ AION vs. Pure LLMs

Standard Large Language Models (LLMs) do not actually reason; they predict the most statistically probable next word based on their training data. When asked to forecast complex events or map causal chains, they often hallucinate statistics, drift off-topic, or regurgitate internet consensus. 

AION solves this by separating **causation** from **translation**. 

Instead of asking a neural net to "guess" connections, AION's Spiking Neural Network calculates a strict, deterministic vector cascade and extracts explicitly directed **causal arrows** directly from its memory arrays. The DFS algorithmic voicebox then traces this logic waterfall from root causes to final effects, generating absolute, un-hallucinated truth.

## ⚙️ Hardware & Software Requirements

Because AION has jettisoned the LLM bloat, it is incredibly lightweight and operates instantly on almost any machine:

* **Browser:** Any modern web browser (Google Chrome, Firefox, Safari, Microsoft Edge).
* **Secure Context:** Web Workers require a secure context. You **cannot** open the `index.html` file directly from your file system. It must be served via a local HTTP server (`localhost` or `127.0.0.1`).

## 🚀 Installation & Boot Sequence

1. **Clone the Repository**

2. **Compile the Matrix (Rust to WASM):** You must have `wasm-pack` installed. Open your terminal in the root directory and run:
   ```bash
   wasm-pack build --target web
   ```
   *This will compile your SNN physics engine and generate the `/pkg` directory.*

3. **Start a Local Server:** * *Python:* Run `python3 -m http.server 8000` in the root directory.
   * *VS Code:* Use the "Live Server" extension.
   * *Node.js:* Use `npx serve`.

4. **Launch the Matrix:** Navigate to `http://localhost:8000` in your WebGPU-enabled browser.

## 📡 Operating Protocols

* **Bulk Ingestion:** Use the `Upload Temporal Data` button to feed AION `.txt` files. The SNN will build its semantic topology (visible in the background) based on the causal sequences in the text.
* **Querying:** Type concepts directly into the terminal (e.g., `what is bitcoin?`). The SNN will extract the relational edges, and the Algorithmic Voicebox will synthesize the physical outcome. If the concepts do not exist in its memory, it will explicitly state that no semantic anchors were found.
* **Tabula Rasa:** Click `HARD RESET MATRIX` to obliterate the current IndexedDB memory state, clearing the SNN's topology and dynamic habituation maps. (This does *not* delete the cached ONNX model).