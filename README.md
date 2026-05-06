# AION: Spiking Neural Network Matrix

AION is an experimental WebAssembly-based physics matrix and Spiking Neural Network (SNN), written in Rust and interfaced via JavaScript. It acts as an autonomous neural environment that parses text, learns new concepts via unsupervised contextual learning, and can asynchronously trigger DOM actions (like UI toggles and alerts) based on "Motor Cortex" node spikes.

## Architecture

- **Rust SNN Core (`src/lib.rs`)**: A high-performance 1-Million-Node physics matrix utilizing a flat Compressed Sparse Row (CSR) topology. Handles thermodynamic memory decay, Hebbian STDP learning, and quantum neural tunneling.
- **Web Worker (`worker.js`)**: Runs the Wasm SNN off the main thread. It manages the dictionary of words-to-nodes, runs the REM sleep lifecycle (spontaneous consolidation), and signals spikes back to the UI.
- **Main Thread (`main.js`)**: Drives the UI, captures user input, renders a real-time 3D projection of the neural clusters, and displays associated thoughts when the network is queried.

## Prerequisites

You will need the following tools installed:
1. Rust & Cargo
2. wasm-pack
3. Node.js (or any basic HTTP server like Python's `http.server`)

## Building the Matrix

To compile the Rust code to WebAssembly, run the following command in the root directory:

```bash
wasm-pack build --target web
```

This will generate a `pkg/` directory containing the `.wasm` binary and the generated JavaScript bindings (`aion_core.js`).

## Running the Project

Because the project relies on ES Modules and Web Workers, it **cannot** be opened simply by double-clicking the `index.html` file (due to CORS restrictions on `file://` protocols).

You must serve the directory using a local HTTP server.

### Using Python 3 (Easiest)
```bash
python -m http.server 8000
```
Then navigate to `http://localhost:8000` in your browser.

### Using Node.js (npx)
```bash
npx serve .
```

## Features

- **REM Sleep Cycle**: The matrix naturally pulses itself with random stimuli to consolidate memory via thermodynamic decay when idle.
- **Semantic Gravity Grading**: Dynamically determines how heavily to inject voltage based on the novelty and connection density of a given node.
- **Motor Cortex Output**: SNN Spikes reaching reserved system nodes (`[NODE_SYS_ALERT]`, `[NODE_UI_DARKMODE]`) trigger actual browser events.