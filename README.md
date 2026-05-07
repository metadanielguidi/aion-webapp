# AION: Synergistic Cognitive Matrix

AION is a 100% offline, browser-native Artificial General Intelligence (AGI) experiment. It Abandons traditional "chatbot" architectures in favor of a continuous physical framework, bridging a temporal physics engine (Spiking Neural Network) with a WebGPU-accelerated Neocortex (Llama 3).

There are no APIs, no cloud servers, and no hardcoded personas. AION relies on raw local hardware plasticity to synthesize temporal causality.

## 🧠 System Architecture

AION runs entirely within the browser's sandbox using parallel web workers and local hardware acceleration.

* **The Temporal Matrix (Hippocampus):** A massive-scale Spiking Neural Network (SNN) written in **Rust** and compiled to **WebAssembly (WASM)**. It models time, causality, and entropy.
* **The Sensory Cortex (Embeddings):** Powered by `transformers.js` running the `Xenova/all-MiniLM-L6-v2` ONNX model. It translates raw human language into 384-dimensional mathematical vectors for the SNN.
* **The Neocortical Synthesis (Voicebox):** Powered by **WebGPU** via `@mlc-ai/web-llm`. AION runs a quantized 8-Billion parameter Llama 3 model directly on your local graphics card to synthesize the SNN's raw physics outputs into intelligent, hallucination-free human language.
* **The Visual Cortex:** A highly optimized HTML5 Canvas 2D physics engine that renders the SNN's semantic topology and temporal connections in real-time.
* **Memory:** Persistent IndexedDB storage. AION caches both its multi-gigabyte Neocortex and its evolving network topology locally.

## 🧬 Core Philosophy

* **Zero Epicycles:** AION does not use rigid "Assistant" roleplay prompts. The Llama 3 model acts as a pure grammatical extension of the SNN, forcing synergistic causality rather than disconnected text prediction.
* **Pure Dynamic Habituation:** AION does not use hardcoded English dictionaries or stop-words. It utilizes Zipf's Law and emergent mathematics to dynamically filter structural noise as it ingests data.
* **100% Offline & Private:** Once the models are cached to your browser, AION can run entirely air-gapped.

## ⚙️ Hardware & Software Requirements

Because AION bypasses the CPU to run an 8B parameter model directly in the browser, your environment must meet strict requirements:

* **Browser:** A modern, WebGPU-enabled browser (Google Chrome or Microsoft Edge recommended). Safari and Firefox require experimental flags.
* **Hardware:** A dedicated GPU or high-end integrated graphics with at least **4.5GB to 8GB of available VRAM/Unified Memory**.
* **Secure Context:** WebGPU and Web Workers require a secure context. You **cannot** open the `index.html` file directly from your file system. It must be served via a local HTTP server (`localhost` or `127.0.0.1`).

## 🚀 Installation & Boot Sequence

1. **Clone the Repository:** Ensure your directory structure is perfectly aligned:
   ```text
   /aion
   ├── index.html
   ├── main.js
   ├── worker.js
   ├── Cargo.toml
   ├── src/
   │   └── lib.rs
   └── /pkg
       ├── aion_core.js
       └── aion_core_bg.wasm
   ```


2. **Start a Local Server:** * *Python:* Run `python3 -m http.server 8000` in the root directory.
* *VS Code:* Use the "Live Server" extension.
* *Node.js:* Use `npx serve`.


3. **Launch the Matrix:** Navigate to `http://localhost:8000` in your WebGPU-enabled browser.
4. **The Initial Boot (Patience Required):** On the very first launch, the Web Worker will download the ~4.5GB Llama 3 model in chunks and compile it into WebGPU shaders. **This will take several minutes.** Progress is tracked in the UI terminal. Subsequent boots will load almost instantly from the IndexedDB cache.

## 📡 Operating Protocols

* **Bulk Ingestion:** Use the `Upload Temporal Data` button to feed AION `.txt` files. The SNN will build its semantic topology (visible in the background) based on the causal sequences in the text.
* **Querying:** Type concepts directly into the terminal (e.g., `what is hardware?`). The SNN will calculate the temporal cascade, and the WebGPU Neocortex will synthesize the physical outcome.
* **Tabula Rasa:** Click `HARD RESET MATRIX` to obliterate the current IndexedDB memory state, clearing the SNN's topology and dynamic habituation maps. (This does *not* delete the cached Llama 3 model).

---

*Note: Running AION heavily utilizes local GPU resources. Expect high hardware utilization and fan speeds during prolonged cognitive metabolism.*