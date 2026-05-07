use wasm_bindgen::prelude::*;
use js_sys::Math;

const RESTING_POTENTIAL: f32 = 0.2;
const MAX_WEIGHT: f32 = 10.0; // INCREASED: Allows for stronger causal bonds

#[wasm_bindgen]
pub struct SpikingNetwork {
    pub num_nodes: usize,
    v: Vec<f32>,
    trace: Vec<f32>,
    leak: Vec<f32>,
    plast: Vec<f32>,
    fatigue: Vec<f32>,
    global_dopamine: f32,
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

        for i in 0..num_nodes {
            let pct = i as f32 / num_nodes as f32;
            if pct < 0.4 {
                leak[i] = 4.0; plast[i] = 0.2;
            } else if pct < 0.8 {
                leak[i] = 0.5; plast[i] = 0.08;
            } else {
                leak[i] = 0.02; plast[i] = 0.02;
            }
        }

        Self {
            num_nodes,
            v: vec![RESTING_POTENTIAL; num_nodes],
            trace: vec![0.0; num_nodes],
            leak, plast,
            fatigue: vec![0.0; num_nodes],
            global_dopamine: 1.0,
            edge_ptrs: (0..num_nodes).map(|i| i * 4).collect(),
            edge_lens: vec![0; num_nodes],
            edge_caps: vec![4; num_nodes],
            edge_dst: vec![0; num_nodes * 4],
            edge_weight: vec![0.0; num_nodes * 4],
        }
    }

    pub fn tick(&mut self, dt: f32, learning: bool) {
        self.global_dopamine += (1.0 - self.global_dopamine) * 0.05 * dt;
        let mut spikes = Vec::new();

        for i in 0..self.num_nodes {
            self.fatigue[i] *= 1.0 - (0.05 * dt);
            self.v[i] += (RESTING_POTENTIAL - self.v[i]) * self.leak[i] * dt;
            self.trace[i] = f32::max(0.0, self.trace[i] - self.leak[i] * 0.8 * dt);

            let threshold = RESTING_POTENTIAL + 1.0 + self.fatigue[i];
            
            if self.v[i] > threshold {
                spikes.push(i);
            } else {
                let distance = threshold - self.v[i];
                if distance < 0.3 {
                    let prob = f32::exp(-distance * 10.0) * 0.05;
                    if (Math::random() as f32) < prob { spikes.push(i); }
                }
            }
        }

        for &src in &spikes {
            self.trace[src] = 1.0;
            self.v[src] = RESTING_POTENTIAL;
            self.fatigue[src] += 0.1;

            let ptr = self.edge_ptrs[src];
            let len = self.edge_lens[src];
            // DECREASED: Weakened the dilution limit so signals survive branching paths
            let dilution_factor = f32::max(1.0, (len as f32).powf(0.3)); 

            for i in 0..len {
                let idx = ptr + i;
                let target = self.edge_dst[idx];
                let weight = self.edge_weight[idx];

                self.v[target] += weight / dilution_factor;

                if learning && self.trace[target] > 0.1 {
                    let increase = self.plast[target] * 15.0 * self.global_dopamine;
                    self.create_synapse(target, src, increase);
                }
            }
        }

        for i in 0..self.num_nodes {
            let ptr = self.edge_ptrs[i];
            let mut len = self.edge_lens[i];
            let mut j = 0;
            
            while j < len {
                let idx = ptr + j;
                let mut w = self.edge_weight[idx];
                w -= 0.02 * f32::exp(-w) * dt;
                
                if w <= 0.0 {
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
    }

    /// --- PREDICTIVE CODING (THE ORACLE SANDBOX) ---
    #[wasm_bindgen]
    pub fn simulate_future(&self, inject_nodes: &[u32], ticks: usize) -> Vec<u32> {
        let mut sim_v = self.v.clone();
        let mut sim_trace = self.trace.clone();
        let mut sim_fatigue = self.fatigue.clone();
        let mut spike_counts = vec![0; self.num_nodes];
        let dt = 0.1;

        for t in 0..ticks {
            if t % 10 == 0 {
                for &node in inject_nodes {
                    // INCREASED: Inject a massive 5.0V spike to force the cascade forward
                    if (node as usize) < self.num_nodes { sim_v[node as usize] += 5.0; } 
                }
            }

            let mut spikes = Vec::new();
            for i in 0..self.num_nodes {
                sim_fatigue[i] *= 1.0 - (0.05 * dt);
                sim_v[i] += (RESTING_POTENTIAL - sim_v[i]) * self.leak[i] * dt;
                sim_trace[i] = f32::max(0.0, sim_trace[i] - self.leak[i] * 0.8 * dt);

                let threshold = RESTING_POTENTIAL + 1.0 + sim_fatigue[i];
                if sim_v[i] > threshold {
                    spikes.push(i);
                    spike_counts[i] += 1;
                } else {
                    let distance = threshold - sim_v[i];
                    if distance < 0.3 {
                        let prob = f32::exp(-distance * 10.0) * 0.05;
                        if (Math::random() as f32) < prob { 
                            spikes.push(i); 
                            spike_counts[i] += 1; 
                        }
                    }
                }
            }

            for &src in &spikes {
                sim_trace[src] = 1.0;
                sim_v[src] = RESTING_POTENTIAL;
                sim_fatigue[src] += 0.1;

                let ptr = self.edge_ptrs[src];
                let len = self.edge_lens[src];
                // DECREASED DILUTION
                let dilution_factor = f32::max(1.0, (len as f32).powf(0.3));

                for i in 0..len {
                    let idx = ptr + i;
                    let target = self.edge_dst[idx];
                    let weight = self.edge_weight[idx];
                    sim_v[target] += weight / dilution_factor;
                }
            }
        }

        let mut predictions: Vec<(usize, u32)> = spike_counts.into_iter()
            .enumerate()
            .filter(|(i, _)| !inject_nodes.contains(&(*i as u32)))
            .collect();
        
        predictions.sort_by(|a, b| b.1.cmp(&a.1));

        predictions.into_iter()
            .take(6)
            // DECREASED FILTER: Allow any node that spiked at least once to be reported
            .filter(|&(_, count)| count > 0) 
            .map(|(i, _)| i as u32)
            .collect()
    }

    pub fn grade_stimulus(&self, node_index: usize) -> f32 {
        let edges = self.edge_lens[node_index] as f32;
        let novelty = 40.0 / (edges.sqrt() + 1.0);
        let gravity = (edges + 1.0).log10() * 6.0;
        5.0 + novelty + gravity
    }

    pub fn get_voltage(&self, node_index: usize) -> f32 { self.v[node_index] }
    pub fn flood_dopamine(&mut self) { self.global_dopamine += 15.0; }
    pub fn inject_voltage(&mut self, node_index: usize, amount: f32) { self.v[node_index] += amount; }

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

        if len < self.edge_caps[src] {
            let idx = ptr + len;
            self.edge_dst[idx] = dst;
            self.edge_weight[idx] = weight_delta;
            self.edge_lens[src] += 1;
        } else {
            let new_ptr = self.edge_dst.len();
            let new_cap = usize::max(4, self.edge_caps[src] * 2);
            for i in 0..len {
                self.edge_dst.push(self.edge_dst[ptr + i]);
                self.edge_weight.push(self.edge_weight[ptr + i]);
            }
            self.edge_dst.push(dst);
            self.edge_weight.push(weight_delta);
            for _ in (len + 1)..new_cap {
                self.edge_dst.push(0);
                self.edge_weight.push(0.0);
            }
            self.edge_ptrs[src] = new_ptr;
            self.edge_lens[src] = len + 1;
            self.edge_caps[src] = new_cap;
        }
    }

    #[wasm_bindgen] pub fn export_v(&self, active: usize) -> Vec<f32> { self.v[0..active].to_vec() }
    #[wasm_bindgen] pub fn import_v(&mut self, data: &[f32]) { for (i, &v) in data.iter().enumerate() { if i < self.num_nodes { self.v[i] = v; } } }
    #[wasm_bindgen] pub fn export_edge_ptrs(&self, active: usize) -> Vec<u32> { self.edge_ptrs[0..active].iter().map(|&x| x as u32).collect() }
    #[wasm_bindgen] pub fn import_edge_ptrs(&mut self, data: &[u32]) { for (i, &v) in data.iter().enumerate() { if i < self.num_nodes { self.edge_ptrs[i] = v as usize; } } }
    #[wasm_bindgen] pub fn export_edge_lens(&self, active: usize) -> Vec<u32> { self.edge_lens[0..active].iter().map(|&x| x as u32).collect() }
    #[wasm_bindgen] pub fn import_edge_lens(&mut self, data: &[u32]) { for (i, &v) in data.iter().enumerate() { if i < self.num_nodes { self.edge_lens[i] = v as usize; } } }
    
    #[wasm_bindgen]
    pub fn get_max_edge_index(&self, active_count: usize) -> usize {
        let mut max_idx = 0;
        for i in 0..active_count {
            let end = self.edge_ptrs[i] + self.edge_lens[i];
            if end > max_idx { max_idx = end; }
        }
        max_idx
    }

    #[wasm_bindgen] pub fn export_edge_dst(&self, max: usize) -> Vec<u32> { self.edge_dst[0..max].iter().map(|&x| x as u32).collect() }
    #[wasm_bindgen] pub fn import_edge_dst(&mut self, data: &[u32]) {
        if data.len() > self.edge_dst.len() { self.edge_dst.resize(data.len(), 0); }
        for (i, &v) in data.iter().enumerate() { self.edge_dst[i] = v as usize; }
    }
    #[wasm_bindgen] pub fn export_edge_weight(&self, max: usize) -> Vec<f32> { self.edge_weight[0..max].to_vec() }
    #[wasm_bindgen] pub fn import_edge_weight(&mut self, data: &[f32]) {
        if data.len() > self.edge_weight.len() { self.edge_weight.resize(data.len(), 0.0); }
        for (i, &v) in data.iter().enumerate() { self.edge_weight[i] = v; }
    }
}