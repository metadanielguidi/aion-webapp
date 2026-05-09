use wasm_bindgen::prelude::*;
use js_sys::Math;

const RESTING_POTENTIAL: f32 = 0.2;
const MAX_WEIGHT: f32 = 10000.0; // UNCAPPED: Allow true Hebbian bonds to grow exponentially

#[wasm_bindgen]
pub struct SpikingNetwork {
    pub num_nodes: usize,
    pub num_active_nodes: usize, // <--- Added to track ingested concepts
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
            num_active_nodes: 0, // <--- Initialize to zero
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

    #[wasm_bindgen]
    pub fn set_active_count(&mut self, count: usize) {
        self.num_active_nodes = count;
    }

    pub fn tick(&mut self, dt: f32, learning: bool) {
        self.global_dopamine += (1.0 - self.global_dopamine) * 0.05 * dt;
        let mut spikes = Vec::new();

        // OPTIMIZED: Only process active nodes
        for i in 0..self.num_active_nodes {
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
            
            // INCREASED FATIGUE: Exhuasts the node so it can't get trapped in an infinite echo chamber
            self.fatigue[src] += 2.5; 

            let ptr = self.edge_ptrs[src];
            let len = self.edge_lens[src];
            let dilution_factor = f32::max(1.0, (len as f32).powf(0.3)); 

            for i in 0..len {
                let idx = ptr + i;
                let target = self.edge_dst[idx];
                let weight = self.edge_weight[idx];
                self.v[target] += weight / dilution_factor;

                if learning && self.trace[target] > 0.1 {
                    let increase = self.plast[target] * 25.0 * self.global_dopamine;
                    self.create_synapse(target, src, increase);
                }
            }
        }

        // OPTIMIZED SYNAPTIC SHIELDING
        if learning {
            for i in 0..self.num_active_nodes {
                let ptr = self.edge_ptrs[i];
                let mut len = self.edge_lens[i];
                let mut j = 0;
                while j < len {
                    let idx = ptr + j;
                    let mut w = self.edge_weight[idx];
                    w -= w * 0.001 * dt; 
                    
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
    }

    /// --- PREDICTIVE CODING (THE ORACLE SANDBOX) ---
    #[wasm_bindgen]
    pub fn simulate_future(&self, inject_nodes: &[u32], ticks: usize) -> Vec<u32> {
        let mut sim_v = vec![RESTING_POTENTIAL; self.num_nodes];
        let mut sim_trace = vec![0.0; self.num_nodes];
        let mut sim_fatigue = vec![0.0; self.num_nodes];
        let mut spike_counts = vec![0; self.num_nodes];
        let dt = 0.1;

        // DYNAMIC NETWORK METRICS: Find the maximum graph density to calculate relative thresholds
        let mut max_len = 1.0f32;
        for i in 0..self.num_active_nodes {
            let l = self.edge_lens[i] as f32;
            if l > max_len { max_len = l; }
        }
        
        // THE GOLDILOCKS CURVE (Perfected for Secondary Stop-Words)
        // Core threshold set to 3% to naturally demote obscure words, while letting domains rise.
        // Hub threshold set to 8% to catch secondary stop-words (which, these) that previously evaded the 20% mark.
        let core_threshold = f32::max(3.0, max_len * 0.03);
        let hub_threshold = f32::max(12.0, max_len * 0.08);

        for t in 0..ticks {
            // OPTIMIZED INJECTION: Pulse strongly a few times to start the cascade, then let the matrix resonate naturally
            if t == 0 || t == 50 || t == 100 {
                for &node in inject_nodes {
                    if (node as usize) < self.num_active_nodes { 
                        // CONSCIOUS OVERRIDE: 
                        // If the user explicitly queries a concept, it bypasses subconscious habituation.
                        // It receives the full 15.0V focal injection to guarantee it anchors the cascade!
                        sim_v[node as usize] += 15.0; 
                    } 
                }
            }

            let mut spikes = Vec::new();
            // OPTIMIZED: Only simulate active nodes
            for i in 0..self.num_active_nodes {
                sim_fatigue[i] *= 1.0 - (0.05 * dt);
                sim_v[i] += (RESTING_POTENTIAL - sim_v[i]) * self.leak[i] * dt;
                sim_trace[i] = f32::max(0.0, sim_trace[i] - self.leak[i] * 0.8 * dt);

                let threshold = RESTING_POTENTIAL + 1.0 + sim_fatigue[i];
                if sim_v[i] > threshold {
                    spikes.push(i);
                    spike_counts[i] += 1;
                }
            }

            for &src in &spikes {
                sim_trace[src] = 1.0;
                sim_v[src] = RESTING_POTENTIAL;
                // GENTLE FATIGUE: Allow domain clusters to physically resonate without infinite ping-ponging
                sim_fatigue[src] += 2.0;

                let ptr = self.edge_ptrs[src];
                let len = self.edge_lens[src];

                let dispersion_factor = f32::max(1.0, (len as f32 / core_threshold).powf(0.5));

                for i in 0..len {
                    let idx = ptr + i;
                    let target = self.edge_dst[idx];
                    let weight = self.edge_weight[idx];
                    
                    let target_len = self.edge_lens[target] as f32;
                    let target_penalty = f32::max(1.0, (target_len / hub_threshold).powf(3.0));

                    sim_v[target] += (weight / dispersion_factor) / target_penalty;
                }
            }
        }

        let min_edges = if self.num_active_nodes < 200 { 1 } else { 3 };

        let mut predictions: Vec<(usize, u32)> = spike_counts.into_iter()
            .enumerate()
            .filter(|(i, _)| !inject_nodes.contains(&(*i as u32)))
            // DYNAMIC STRUCTURAL ANCHOR: Small toy matrices allow 1 edge, while 
            // large adult matrices require 3+ to filter out obscure noise.
            .filter(|(i, _)| self.edge_lens[*i] >= min_edges)
            .collect();
        
        predictions.sort_by(|a, b| {
            let ptr_a = self.edge_ptrs[a.0];
            let len_a = self.edge_lens[a.0];
            let mut max_w_a = 1.0f32;
            for i in 0..len_a {
                let w = self.edge_weight[ptr_a + i];
                if w > max_w_a { max_w_a = w; }
            }
            
            let ptr_b = self.edge_ptrs[b.0];
            let len_b = self.edge_lens[b.0];
            let mut max_w_b = 1.0f32;
            for i in 0..len_b {
                let w = self.edge_weight[ptr_b + i];
                if w > max_w_b { max_w_b = w; }
            }

            let core_bonus_a = f32::min(2.0, (len_a as f32 / core_threshold).powf(0.5));
            let core_bonus_b = f32::min(2.0, (len_b as f32 / core_threshold).powf(0.5));

            let hub_penalty_a = f32::max(1.0, (len_a as f32 / hub_threshold).powf(3.0));
            let hub_penalty_b = f32::max(1.0, (len_b as f32 / hub_threshold).powf(3.0));

            // HEBBIAN SUPREMACY + THE GOLDILOCKS TOPOLOGY:
            // Squaring the maximum weight enforces that repeated, concentrated bonds 
            // obliterate random, one-off stop-word bonds.
            let score_a = ((a.1 as f32) * max_w_a.powf(2.0) * core_bonus_a) / hub_penalty_a;
            let score_b = ((b.1 as f32) * max_w_b.powf(2.0) * core_bonus_b) / hub_penalty_b;
            score_b.partial_cmp(&score_a).unwrap_or(std::cmp::Ordering::Equal)
        });

        predictions.into_iter()
            .take(15) // MAXIMUM EXPANSION: Allows the matrix to dream further into the future
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

    pub fn get_voltage(&self, node_index: usize) -> f32 {
        if node_index < self.num_active_nodes { self.v[node_index] } else { 0.0 }
    }

    pub fn flood_dopamine(&mut self) { self.global_dopamine += 15.0; }

    pub fn inject_voltage(&mut self, node_index: usize, amount: f32) {
        if node_index < self.num_active_nodes { self.v[node_index] += amount; }
    }

    #[wasm_bindgen]
    pub fn create_synapse(&mut self, src: usize, dst: usize, weight_delta: f32) {
        let ptr = self.edge_ptrs[src];
        let len = self.edge_lens[src];

        // Remove the harsh learning penalties entirely. Let the matrix build massive bonds!
        let adjusted_delta = weight_delta; 

        for i in 0..len {
            let idx = ptr + i;
            if self.edge_dst[idx] == dst {
                self.edge_weight[idx] = f32::min(MAX_WEIGHT, self.edge_weight[idx] + adjusted_delta);
                return;
            }
        }

        if adjusted_delta <= 0.0 { return; }

        if len < self.edge_caps[src] {
            let idx = ptr + len;
            self.edge_dst[idx] = dst;
            self.edge_weight[idx] = adjusted_delta; // Use adjusted delta for new synapses too
            self.edge_lens[src] += 1;
        } else {
            let new_ptr = self.edge_dst.len();
            let new_cap = usize::max(4, self.edge_caps[src] * 2);
            for i in 0..len {
                self.edge_dst.push(self.edge_dst[ptr + i]);
                self.edge_weight.push(self.edge_weight[ptr + i]);
            }
            self.edge_dst.push(dst);
            self.edge_weight.push(adjusted_delta); // Use adjusted delta here too
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
    #[wasm_bindgen] pub fn export_edge_caps(&self, active: usize) -> Vec<u32> { self.edge_caps[0..active].iter().map(|&x| x as u32).collect() }
    #[wasm_bindgen] pub fn import_edge_caps(&mut self, data: &[u32]) { for (i, &v) in data.iter().enumerate() { if i < self.num_nodes { self.edge_caps[i] = v as usize; } } }
    
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
    #[wasm_bindgen]
    pub fn get_causal_topology(&self, active_nodes: &[u32], inject_nodes: &[u32]) -> Vec<f32> {
        let mut topology = Vec::new();
        // Use a 64-bit pair to track undirected edges and prevent redundant A->B and B->A duplication
        let mut seen_edges = std::collections::HashSet::new();
        
        let min_edges = if self.num_active_nodes < 200 { 1 } else { 3 };

        // DYNAMIC NETWORK METRICS: Ensure the Goldilocks curve scales with graph size
        let mut max_len = 1.0f32;
        for i in 0..self.num_active_nodes {
            let l = self.edge_lens[i] as f32;
            if l > max_len { max_len = l; }
        }
        
        // THE GOLDILOCKS CURVE (Perfected for Secondary Stop-Words)
        // Core threshold set to 3% to gracefully reward domains without over-exalting them.
        // Hub threshold set to 8% to confidently crush secondary stop-words.
        let core_threshold = f32::max(3.0, max_len * 0.03);
        let hub_threshold = f32::max(12.0, max_len * 0.08);
        
        // Store all valid edges globally: (src, target, raw_weight, global_score)
        let mut all_edges: Vec<(usize, usize, f32, f32)> = Vec::new();

        for &src in active_nodes {
            let src_idx = src as usize;
            let ptr = self.edge_ptrs[src_idx];
            let len = self.edge_lens[src_idx];
            
            // THE OBSCURE SOURCE FILTER:
            // Prevent rare query words from hijacking the graph if they haven't formed enough edges.
            if len < min_edges { continue; }

            let is_input_src = inject_nodes.contains(&(src as u32));
            
            // CONSCIOUS OVERRIDE: User queried nodes bypass the source hub penalty
            let src_hub_penalty = if is_input_src { 
                1.0 
            } else { 
                f32::max(1.0, ((len as f32) / hub_threshold).powf(3.0)) 
            };
            
            let src_core_bonus = f32::min(2.0, ((len as f32) / core_threshold).powf(0.5));
            
            let mut top_targets = Vec::new();

            for i in 0..len {
                let idx = ptr + i;
                let target = self.edge_dst[idx];
                let weight = self.edge_weight[idx];
                
                let is_active_target = active_nodes.contains(&(target as u32));
                
                // DYNAMIC STRUCTURAL ANCHOR: Prevent the graph from anchoring to 
                // obscure rare words just because they have a low hub penalty.
                if self.edge_lens[target] < min_edges { continue; }

                // THE GOLDILOCKS TOPOLOGY FILTER:
                // 1. Core Bonus: Rewards established domain concepts (10-40 edges)
                // 2. Hub Penalty: Crushes massive structural noise like "the" (100+ edges)
                let target_len = self.edge_lens[target] as f32;
                let dst_core_bonus = f32::min(2.0, (target_len / core_threshold).powf(0.5));
                
                let is_input_dst = inject_nodes.contains(&(target as u32));
                let dst_hub_penalty = if is_input_dst {
                    1.0
                } else {
                    f32::max(1.0, (target_len / hub_threshold).powf(3.0))
                };
                
                // SYNERGISTIC SEMANTIC SCORE (Hebbian Supremacy):
                // Squaring the physical weight mathematically guarantees that words which repeatedly 
                // form concentrated bonds (domains) obliterate words that form random, dispersed bonds (noise).
                let semantic_score = (weight.powf(2.0) * src_core_bonus * dst_core_bonus) / (src_hub_penalty * dst_hub_penalty);

                // SEMANTIC EVENT HORIZON: Only edges with a score >= 400.0 have the gravity to survive.
                if is_active_target && weight > 1.0 && target != src_idx && semantic_score >= 400.0 {
                    let edge_pair = if src_idx < target { 
                        ((src_idx as u64) << 32) | (target as u64) 
                    } else { 
                        ((target as u64) << 32) | (src_idx as u64) 
                    };
                    
                    if !seen_edges.contains(&edge_pair) {
                        top_targets.push((target, weight, semantic_score, edge_pair));
                    }
                }
            }
            
            // PREVENTING THE STAR TOPOLOGY:
            // Sort this specific node's targets, and only allow it to contribute its top 2 edges.
            // This forces the matrix to walk the causal chain rather than radiating 12 edges from a single queried node!
            top_targets.sort_by(|a, b| b.2.partial_cmp(&a.2).unwrap_or(std::cmp::Ordering::Equal));
            
            for (target, weight, score, edge_pair) in top_targets.into_iter().take(2) {
                seen_edges.insert(edge_pair);
                all_edges.push((src_idx, target, weight, score));
            }
        }
        
        // SORT GLOBALLY BY SEMANTIC SCORE
        all_edges.sort_by(|a, b| b.3.partial_cmp(&a.3).unwrap_or(std::cmp::Ordering::Equal));
        
        let mut degree_count = std::collections::HashMap::new();
        let mut edge_count = 0;
        
        for (src, target, weight, score) in all_edges {
            let src_deg = *degree_count.get(&src).unwrap_or(&0);
            let tgt_deg = *degree_count.get(&target).unwrap_or(&0);
            
            // GLOBAL DEGREE CAP (Preventing the Inverse Star Topology)
            // By enforcing that no single concept can participate in more than 3 edges, 
            // we guarantee a deep, cascading topological chain instead of a shallow star!
            if src_deg < 3 && tgt_deg < 3 {
                degree_count.insert(src, src_deg + 1);
                degree_count.insert(target, tgt_deg + 1);
                
                topology.push(src as f32);
                topology.push(target as f32);
                topology.push(weight);
                topology.push(score); // EXPORT SEMANTIC SCORE TO JS
                
                edge_count += 1;
                if edge_count >= 12 { break; }
            }
        }
        
        topology
    }
}