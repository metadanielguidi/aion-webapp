use wasm_bindgen::prelude::*;
use js_sys::Math;

const RESTING_POTENTIAL: f32 = 0.2;
const MAX_WEIGHT: f32 = 2.5;

// Motor Cortex / Action Nodes
pub const NODE_SYS_ALERT: usize = 0;
pub const NODE_UI_DARKMODE: usize = 1;

#[wasm_bindgen]
pub struct SpikingNetwork {
    pub num_nodes: usize,
    
    // Contiguous Biological States
    v: Vec<f32>,
    trace: Vec<f32>,
    leak: Vec<f32>,
    plast: Vec<f32>,
    fatigue: Vec<f32>,
    
    global_dopamine: f32,

    // Dynamic CSR Arena (Flat Network Topology)
    edge_ptrs: Vec<usize>,
    edge_lens: Vec<usize>,
    edge_caps: Vec<usize>,
    edge_dst: Vec<usize>,
    edge_weight: Vec<f32>,
}

#[wasm_bindgen]
impl SpikingNetwork {
    #[wasm_bindgen(constructor)]
    pub fn new(num_nodes: usize) -> Self {
        let mut leak = vec![0.0; num_nodes];
        let mut plast = vec![0.0; num_nodes];

        // Biome Allocation: Fast (40%), Medium (40%), Slow (20%)
        for i in 0..num_nodes {
            let pct = i as f32 / num_nodes as f32;
            if pct < 0.4 {
                leak[i] = 4.0; 
                plast[i] = 0.2;
            } else if pct < 0.8 {
                leak[i] = 0.5; 
                plast[i] = 0.08;
            } else {
                leak[i] = 0.02; 
                plast[i] = 0.02;
            }
        }

        Self {
            num_nodes,
            v: vec![RESTING_POTENTIAL; num_nodes],
            trace: vec![0.0; num_nodes],
            leak,
            plast,
            fatigue: vec![0.0; num_nodes],
            global_dopamine: 1.0,
            
            // Allocate an initial block of memory for 4 edges per node
            edge_ptrs: (0..num_nodes).map(|i| i * 4).collect(),
            edge_lens: vec![0; num_nodes],
            edge_caps: vec![4; num_nodes],
            edge_dst: vec![0; num_nodes * 4],
            edge_weight: vec![0.0; num_nodes * 4],
        }
    }

    /// The Main Physics Loop
    pub fn tick(&mut self, dt: f32, learning: bool) -> Vec<u32> {
        self.global_dopamine += (1.0 - self.global_dopamine) * 0.05 * dt;
        let mut spikes = Vec::new();

        // 1. Biological Decay & Quantum Spiking
        for i in 0..self.num_nodes {
            // Global healing
            self.fatigue[i] *= 1.0 - (0.05 * dt);
            
            // Voltage & Trace leak
            self.v[i] += (RESTING_POTENTIAL - self.v[i]) * self.leak[i] * dt;
            self.trace[i] = f32::max(0.0, self.trace[i] - self.leak[i] * 0.8 * dt);

            let threshold = RESTING_POTENTIAL + 1.0 + self.fatigue[i];
            
            if self.v[i] > threshold {
                spikes.push(i);
            } else {
                let distance = threshold - self.v[i];
                if distance < 0.3 {
                    // Quantum-Neural Tunneling
                    let prob = f32::exp(-distance * 10.0) * 0.05;
                    if (Math::random() as f32) < prob {
                        spikes.push(i);
                    }
                }
            }
        }

        let mut action_triggers = Vec::new();

        // 2. Cascade & Forward Transmission
        for &src in &spikes {
            self.trace[src] = 1.0;
            self.v[src] = RESTING_POTENTIAL; // Reset
            self.fatigue[src] += 0.1; // Exhaustion from spike

            // Monitor Motor Cortex Actions
            if src == NODE_SYS_ALERT || src == NODE_UI_DARKMODE {
                action_triggers.push(src as u32);
            }

            let ptr = self.edge_ptrs[src];
            let len = self.edge_lens[src];
            let dilution_factor = f32::max(1.0, (len as f32).powf(0.6));

            for i in 0..len {
                let idx = ptr + i;
                let target = self.edge_dst[idx];
                let weight = self.edge_weight[idx];

                // Energy Dilution Injection
                self.v[target] += weight / dilution_factor;

                // 3. Hebbian STDP (Target back to Source)
                if learning && self.trace[target] > 0.1 {
                    let increase = self.plast[target] * 15.0 * self.global_dopamine;
                    self.create_synapse(target, src, increase);
                }
            }
        }

        // 4. Thermodynamic Memory Decay (Pruning)
        for i in 0..self.num_nodes {
            let ptr = self.edge_ptrs[i];
            let mut len = self.edge_lens[i];
            let mut j = 0;
            
            while j < len {
                let idx = ptr + j;
                let mut w = self.edge_weight[idx];
                
                w -= 0.02 * f32::exp(-w) * dt;
                
                if w <= 0.0 {
                    // O(1) Deletion via Swap-Remove
                    let last_idx = ptr + len - 1;
                    self.edge_dst[idx] = self.edge_dst[last_idx];
                    self.edge_weight[idx] = self.edge_weight[last_idx];
                    len -= 1;
                } else {
                    self.edge_weight[idx] = w;
                    j += 1;
                }
            }
            self.edge_lens[i] = len;
        }

        action_triggers
    }

    /// Semantic Gravity grading for a specific node
    pub fn grade_stimulus(&self, node_index: usize) -> f32 {
        let edges = self.edge_lens[node_index] as f32;
        let novelty = 40.0 / (edges.sqrt() + 1.0);
        let gravity = (edges + 1.0).log10() * 6.0;
        5.0 + novelty + gravity
    }

    /// Allow JavaScript to read the voltage of a node to see if it is "thinking" about it
    pub fn get_voltage(&self, node_index: usize) -> f32 {
        self.v[node_index]
    }

    pub fn flood_dopamine(&mut self) {
        self.global_dopamine += 15.0;
    }

    pub fn inject_voltage(&mut self, node_index: usize, amount: f32) {
        self.v[node_index] += amount;
    }

    /// Creates or strengthens a directed synapse from a source to a destination node.
    #[wasm_bindgen]
    pub fn create_synapse(&mut self, src: usize, dst: usize, weight_delta: f32) {
        let ptr = self.edge_ptrs[src];
        let len = self.edge_lens[src];

        for i in 0..len {
            let idx = ptr + i;
            if self.edge_dst[idx] == dst {
                self.edge_weight[idx] = f32::min(MAX_WEIGHT, self.edge_weight[idx] + weight_delta);
                return;
            }
        }

        if weight_delta <= 0.0 { return; }

        // Dynamic Arena Expansion
        if len < self.edge_caps[src] {
            let idx = ptr + len;
            self.edge_dst[idx] = dst;
            self.edge_weight[idx] = weight_delta;
            self.edge_lens[src] += 1;
        } else {
            let new_ptr = self.edge_dst.len();
            let new_cap = usize::max(4, self.edge_caps[src] * 2);
            
            // Relocate block to end of arena
            for i in 0..len {
                self.edge_dst.push(self.edge_dst[ptr + i]);
                self.edge_weight.push(self.edge_weight[ptr + i]);
            }
            
            self.edge_dst.push(dst);
            self.edge_weight.push(weight_delta);
            
            // Pad capacity
            for _ in (len + 1)..new_cap {
                self.edge_dst.push(0);
                self.edge_weight.push(0.0);
            }
            
            self.edge_ptrs[src] = new_ptr;
            self.edge_lens[src] = len + 1;
            self.edge_caps[src] = new_cap;
        }
    }

    /// --- MEMORY PERSISTENCE EXPORTS ---

    #[wasm_bindgen]
    pub fn export_v(&self, active_count: usize) -> Vec<f32> {
        self.v[0..active_count].to_vec()
    }

    #[wasm_bindgen]
    pub fn import_v(&mut self, data: &[f32]) {
        for (i, &val) in data.iter().enumerate() {
            if i < self.num_nodes { self.v[i] = val; }
        }
    }

    // Export/Import the CSR Pointers (Where a node's connections start)
    #[wasm_bindgen]
    pub fn export_edge_ptrs(&self, active_count: usize) -> Vec<u32> {
        self.edge_ptrs[0..active_count].iter().map(|&x| x as u32).collect()
    }

    #[wasm_bindgen]
    pub fn import_edge_ptrs(&mut self, data: &[u32]) {
        for (i, &val) in data.iter().enumerate() {
            if i < self.num_nodes { self.edge_ptrs[i] = val as usize; }
        }
    }

    // Export/Import the CSR Lengths (How many connections a node has)
    #[wasm_bindgen]
    pub fn export_edge_lens(&self, active_count: usize) -> Vec<u32> {
        self.edge_lens[0..active_count].iter().map(|&x| x as u32).collect()
    }

    #[wasm_bindgen]
    pub fn import_edge_lens(&mut self, data: &[u32]) {
        for (i, &val) in data.iter().enumerate() {
            if i < self.num_nodes { self.edge_lens[i] = val as usize; }
        }
    }

    // For the actual destinations and weights, we need the maximum pointer used
    #[wasm_bindgen]
    pub fn get_max_edge_index(&self, active_count: usize) -> usize {
        let mut max_idx = 0;
        for i in 0..active_count {
            let end_idx = self.edge_ptrs[i] + self.edge_lens[i];
            if end_idx > max_idx { max_idx = end_idx; }
        }
        max_idx
    }

    #[wasm_bindgen]
    pub fn export_edge_dst(&self, max_idx: usize) -> Vec<u32> {
        self.edge_dst[0..max_idx].iter().map(|&x| x as u32).collect()
    }

    #[wasm_bindgen]
    pub fn import_edge_dst(&mut self, data: &[u32]) {
        // Ensure capacity
        if data.len() > self.edge_dst.len() {
            self.edge_dst.resize(data.len(), 0);
        }
        for (i, &val) in data.iter().enumerate() {
            self.edge_dst[i] = val as usize;
        }
    }

    #[wasm_bindgen]
    pub fn export_edge_weight(&self, max_idx: usize) -> Vec<f32> {
        self.edge_weight[0..max_idx].to_vec()
    }

    #[wasm_bindgen]
    pub fn import_edge_weight(&mut self, data: &[f32]) {
        if data.len() > self.edge_weight.len() {
            self.edge_weight.resize(data.len(), 0.0);
        }
        for (i, &val) in data.iter().enumerate() {
            self.edge_weight[i] = val;
        }
    }
}
