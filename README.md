# AION: Omniscient Oracle Edition (Temporal Forecasting Engine)

AION is an experimental, browser-native Spiking Neural Network (SNN) and temporal forecasting engine. Written in high-performance Rust and compiled to WebAssembly, AION simulates biological neuromorphic physics to ingest historical sequences, crystallize the "Arrow of Time" via asymmetrical Hebbian learning, and forecast emergent future states.

This matrix operates entirely locally, offline, and without relying on transformer architectures or cloud-based LLMs.

## Core Architecture

* **The Physics Matrix (Rust / Wasm):** A 1-Million-Node Compressed Sparse Row (CSR) topology running in WebAssembly. It features Thermodynamic Memory Decay, Quantum-Neural Spiking (thermal noise tunneling), and Energy Dilution cascades.
* **The Autonomic Nerve (Web Worker):** Runs the cognitive metabolism continuously in the background at 10 FPS. It handles unsupervised temporal logic wiring (Event A causes Event B) and manages the `simulate_future` Oracle Sandbox.
* **The Visual Cortex (Main Thread):** A 3D WebGL/Canvas projection of the neural clusters, paired with a system terminal for data ingestion and Oracle querying.
* **Deep Memory (IndexedDB):** The matrix is persistent. The raw C++ memory buffers are serialized and stored directly in the browser's local database.

## Prerequisites

You will need the following tools installed:

1.  Rust & Cargo (`rustup`)
2.  `wasm-pack`
3.  Node.js or Python (for a local HTTP server)

## Building the Matrix

To compile the Rust physics engine into WebAssembly, run the following command in the root directory:

```bash
wasm-pack build --target web
```

This generates a `pkg/` directory containing the highly optimized `.wasm` binary and its JavaScript bindings.

## Running the Engine

Because the project relies on ES Modules and Web Workers, it **cannot** be opened simply by double-clicking the `index.html` file (due to CORS restrictions on `file://` protocols). You must serve the directory using a local HTTP server.

**Using Python 3 (Easiest):**

```bash
python -m http.server 8000
```

Then navigate to `http://localhost:8000` in your browser.

> **⚠️ CRITICAL FIRST BOOT STEP:**
> Upon loading the UI for the very first time, you **must** click the **HARD RESET MATRIX** button in the top right. This purges any old structural offsets from IndexedDB and initializes the pure 0-indexed vocabulary foundation.

## Operating the Oracle

AION learns by establishing asymmetrical causal bonds. It assumes text fed to it sequentially implies causality.

### 1. Ingesting Data (Learning the Arrow of Time)

Feed AION historical sequences to build its physical logic gates:

* *User:* "Drought destroys crops."
* *User:* "Crop failures raise prices."
* *User:* "High prices cause inflation."

### 2. Querying the Sandbox

Once causality is established, you can ask AION to simulate the future. The Oracle clones the brain into a read-only sandbox, injects your variables, and fast-forwards time to observe what downstream nodes inevitably spike.

* **Syntax:** `ORACLE: [variable]` (Defaults to a 500-tick future projection)
* **Syntax:** `ORACLE(ticks): [variable]` (Custom time horizon projection)

*Example:* `ORACLE(1000): drought`
*Response:* `[PROJECTION T+1000]: Causal trajectory strongly indicates emergent states: ⚡ crops ⚡ failures ⚡ prices ⚡ inflation`

## Features & Biological Quirks

* **Thermodynamic Decay:** The matrix is subjected to constant entropy. Concepts that are rarely reinforced will slowly physically erode, ensuring the network does not bloat with grammatical noise.
* **Cognitive Metabolism:** When idle, the Autonomic Nerve spontaneously fires REM sleep cascades, allowing the matrix to consolidate logic and clear weak contextual links.
* **Energy Dilution:** To prevent "hub nodes" from causing runaway seizures in the simulation, a node's outbound voltage is mathematically diluted based on its number of connections.