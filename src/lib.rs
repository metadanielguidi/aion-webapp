use wasm_bindgen::prelude::*;
use js_sys::Math;

const RESTING_POTENTIAL: f32 = 0.2;
const MAX_WEIGHT: f32 = 10000.0; // CAPPED: Prevent runaway Hebbian bonds from blowing up into the trillions

#[wasm_bindgen]
pub struct SpikingNetwork {
    pub num_nodes: usize,
    pub num_active_nodes: usize, // <--- Added to track ingested concepts
    v: Vec<f32>,
    trace: Vec<f32>,
    leak: Vec<f32>,
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

        for i in 0..num_nodes {
            let pct = i as f32 / num_nodes as f32;
            if pct < 0.4 {
                leak[i] = 4.0;
            } else if pct < 0.8 {
                leak[i] = 0.5;
            } else {
                leak[i] = 0.02;
            }
        }

        Self {
            num_nodes,
            num_active_nodes: 0, // <--- Initialize to zero
            v: vec![RESTING_POTENTIAL; num_nodes],
            trace: vec![0.0; num_nodes],
            leak,
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

                // BLIND STDP REMOVED: 
                // Javascript now explicitly drives Hebbian learning using semantic 
                // vector similarities! The SNN only handles voltage propagation and decay.
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
                    
                    // MYELINATION & PRUNING (Long-Term Memory Consolidation):
                    // Simulates years of structured learning. Massive foundational bonds are 
                    // protected, while weak, fleeting noise is aggressively deleted.
                    let abs_w = w.abs();
                    let decay_rate = if abs_w > 1000.0 {
                        0.00005 // Core Curriculum (Myelinated): Almost immune to decay
                    } else if abs_w > 100.0 {
                        0.0005  // Established Knowledge: Slow decay
                    } else {
                        0.005   // Fleeting Memory: Decays rapidly if not reinforced
                    };
                    
                    // Decay pushes the weight back towards zero, whether positive or negative
                    if w > 0.0 {
                        w -= (w * decay_rate * dt) + (0.01 * dt); 
                    } else {
                        w += (abs_w * decay_rate * dt) + (0.01 * dt);
                    }
                    
                    if w.abs() <= 0.1 { // True Pruning Threshold handles both fading excitation and fading inhibition
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
    pub fn simulate_future(&self, inject_nodes: &[u32], ticks: usize, node_freqs: &[u32]) -> Vec<u32> {
        let mut sim_v = vec![RESTING_POTENTIAL; self.num_nodes];
        let mut sim_trace = vec![0.0; self.num_nodes];
        let mut sim_fatigue = vec![0.0; self.num_nodes];
        let mut spike_counts = vec![0; self.num_nodes];
        let dt = 0.1;

        // TRUE LINGUISTIC FREQUENCY: Base penalties on actual occurrences, not surviving edges.
        let mut max_freq = 1.0f32;
        for i in 0..self.num_active_nodes {
            let f = if i < node_freqs.len() { node_freqs[i] as f32 } else { 1.0 };
            if f > max_freq { max_freq = f; }
        }
        
        // Frequency thresholds (e.g., if max is 50,000, >1,000 occurrences is a massive hub)
        let core_threshold = f32::max(2.0, max_freq * 0.005);
        let hub_threshold = f32::max(10.0, max_freq * 0.02);

        for t in 0..ticks {
            // OPTIMIZED INJECTION: Pulse strongly a few times to start the cascade, then let the matrix resonate naturally
            if t == 0 || t == 50 || t == 100 {
                for &node in inject_nodes {
                    if (node as usize) < self.num_active_nodes { 
                        // CONTINUOUS INJECTION: We scale the injection voltage inversely by the hub penalty's square root.
                        // True domains get high voltage, but massive structural noise is dampened.
                        let freq = if (node as usize) < node_freqs.len() { node_freqs[node as usize] as f32 } else { 1.0 };
                        let linear_penalty = f32::max(1.0, freq / hub_threshold);
                        sim_v[node as usize] += 15.0 / linear_penalty.powf(0.5); 
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

                let src_freq = if src < node_freqs.len() { node_freqs[src] as f32 } else { 1.0 };
                let dispersion_factor = f32::max(1.0, (src_freq / core_threshold).powf(0.5));

                for i in 0..len {
                    let idx = ptr + i;
                    let target = self.edge_dst[idx];
                    let weight = self.edge_weight[idx];
                    
                    let target_freq = if target < node_freqs.len() { node_freqs[target] as f32 } else { 1.0 };
                    let target_penalty = f32::max(1.0, (target_freq / hub_threshold).powf(4.0));

                    sim_v[target] += (weight / dispersion_factor) / target_penalty;
                }
            }
        }

        let mut predictions: Vec<(usize, u32)> = spike_counts.into_iter()
            .enumerate()
            .filter(|(i, _)| !inject_nodes.contains(&(*i as u32)))
            .collect();
        
        predictions.sort_by(|a, b| {
            let ptr_a = self.edge_ptrs[a.0];
            let len_a = self.edge_lens[a.0];
            let mut max_w_a = 1.0f32;
            for i in 0..len_a {
                let w = self.edge_weight[ptr_a + i].abs();
                if w > max_w_a { max_w_a = w; }
            }
            
            let ptr_b = self.edge_ptrs[b.0];
            let len_b = self.edge_lens[b.0];
            let mut max_w_b = 1.0f32;
            for i in 0..len_b {
                let w = self.edge_weight[ptr_b + i].abs();
                if w > max_w_b { max_w_b = w; }
            }

            let freq_a = if a.0 < node_freqs.len() { node_freqs[a.0] as f32 } else { 1.0 };
            let freq_b = if b.0 < node_freqs.len() { node_freqs[b.0] as f32 } else { 1.0 };

            let core_bonus_a = f32::min(2.0, (freq_a / core_threshold).powf(0.5));
            let core_bonus_b = f32::min(2.0, (freq_b / core_threshold).powf(0.5));

            let hub_penalty_a = f32::max(1.0, (freq_a / hub_threshold).powf(4.0));
            let hub_penalty_b = f32::max(1.0, (freq_b / hub_threshold).powf(4.0));

            // HEBBIAN SUPREMACY + THE GOLDILOCKS TOPOLOGY:
            // By applying the hub penalty BEFORE squaring the weight, we ensure that 
            // massive structural noise is mathematically crushed rather than exponentially inflated!
            let penalized_w_a = max_w_a / hub_penalty_a;
            let score_a = (a.1 as f32) * penalized_w_a.powf(2.0) * core_bonus_a;
            
            let penalized_w_b = max_w_b / hub_penalty_b;
            let score_b = (b.1 as f32) * penalized_w_b.powf(2.0) * core_bonus_b;
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

    pub fn flood_dopamine(&mut self) { 
        self.global_dopamine += 5.0; 
        if self.global_dopamine > 50.0 { self.global_dopamine = 50.0; }
    }

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
                let new_weight = self.edge_weight[idx] + adjusted_delta;
                self.edge_weight[idx] = new_weight.clamp(-MAX_WEIGHT, MAX_WEIGHT);
                return;
            }
        }

        if adjusted_delta.abs() <= 0.001 { return; } // Accept new negative (inhibitory) bonds

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
    pub fn get_causal_topology(&self, active_nodes: &[u32], query_nodes: &[u32], node_freqs: &[u32]) -> Vec<f32> {
        let mut topology = Vec::new();
        // Use a 64-bit pair to track undirected edges and prevent redundant A->B and B->A duplication
        let mut seen_edges = std::collections::HashSet::new();
        
        let mut max_freq = 1.0f32;
        for i in 0..self.num_active_nodes {
            let f = if i < node_freqs.len() { node_freqs[i] as f32 } else { 1.0 };
            if f > max_freq { max_freq = f; }
        }
        
        // THE GOLDILOCKS CURVE (True Linguistic Frequency)
        let core_threshold = f32::max(2.0, max_freq * 0.005);
        let hub_threshold = f32::max(10.0, max_freq * 0.02);
        
        // Store all valid edges globally: (src, target, raw_weight, global_score)
        let mut all_edges: Vec<(usize, usize, f32, f32)> = Vec::new();

        for &src in active_nodes {
            let src_idx = src as usize;
            let ptr = self.edge_ptrs[src_idx];
            let len = self.edge_lens[src_idx];
            
            let is_query_src = query_nodes.contains(&(src_idx as u32));

            // Applies the raw penalty to suppress structural words
            let src_freq = if src_idx < node_freqs.len() { node_freqs[src_idx] as f32 } else { 1.0 };
            let mut src_hub_penalty = f32::max(1.0, (src_freq / hub_threshold).powf(4.0));
            if is_query_src {
                // CONSCIOUS EXEMPTION: Soften the penalty for explicitly queried nodes so they aren't crushed
                src_hub_penalty = src_hub_penalty.powf(0.5);
            }
            
            let src_core_bonus = f32::min(2.0, (src_freq / core_threshold).powf(0.5));
            
            let mut top_targets = Vec::new();

            for i in 0..len {
                let idx = ptr + i;
                let target = self.edge_dst[idx];
                let weight = self.edge_weight[idx];
                
                let is_active_target = active_nodes.contains(&(target as u32));
                let is_query_tgt = query_nodes.contains(&(target as u32));
                
                // THE GOLDILOCKS TOPOLOGY FILTER:
                let target_freq = if target < node_freqs.len() { node_freqs[target] as f32 } else { 1.0 };
                let dst_core_bonus = f32::min(2.0, (target_freq / core_threshold).powf(0.5));
                
                let mut dst_hub_penalty = f32::max(1.0, (target_freq / hub_threshold).powf(4.0));
                if is_query_tgt {
                    dst_hub_penalty = dst_hub_penalty.powf(0.5);
                }
                
                // SYNERGISTIC SEMANTIC SCORE (Hebbian Supremacy):
                // Applying the hub penalty to the raw weight BEFORE squaring it prevents the 
                // mathematical paradox of exponential stop-word inflation.
                let penalized_weight = weight / (src_hub_penalty * dst_hub_penalty);
                let mut semantic_score = penalized_weight.abs().powf(2.0) * src_core_bonus * dst_core_bonus;

                // CONSCIOUS ANCHOR: Magnify gravity for edges directly connected to the user's query.
                // We use addition rather than multiplication to prevent two frequent query nodes from exponentially feeding off each other.
                let mut anchor_multiplier = 1.0;
                
                // FOCAL GRAVITY (Conscious Anchor): The user's query generates massive focal gravity.
                // Because we softened the hub penalty for queried nodes, we apply the full multiplier!
                if is_query_src {
                    anchor_multiplier += 499.0;
                }
                if is_query_tgt {
                    anchor_multiplier += 499.0;
                }

                semantic_score *= anchor_multiplier;

                // SEMANTIC EVENT HORIZON: Allow both powerful excitatory (> 1.0) and inhibitory (< -1.0) bonds
                if is_active_target && weight.abs() > 1.0 && target != src_idx && semantic_score >= 400.0 {
                    // CAUSAL DIRECTIONALITY: We strictly track A -> B as a directed edge.
                    // This is essential for the Algorithmic Voicebox to formulate linear time-based sentences!
                    let edge_pair = ((src_idx as u64) << 32) | (target as u64);
                    
                    if !seen_edges.contains(&edge_pair) {
                        top_targets.push((target, weight, semantic_score, edge_pair));
                    }
                }
            }
            
            // PREVENTING THE STAR TOPOLOGY:
            // Sort this specific node's targets, and only allow it to contribute its top 2 edges.
            // This forces the matrix to walk the causal chain rather than radiating 12 edges from a single queried node!
            top_targets.sort_by(|a, b| b.2.partial_cmp(&a.2).unwrap_or(std::cmp::Ordering::Equal));
            
            for (target, weight, score, edge_pair) in top_targets.into_iter().take(3) {
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
            
            // GLOBAL DEGREE CAP 
            // Increased to 4 to allow deeper intersecting domain logic to emerge
            // while still preventing shallow star topologies.
            if src_deg < 4 && tgt_deg < 4 {
                degree_count.insert(src, src_deg + 1);
                degree_count.insert(target, tgt_deg + 1);
                
                topology.push(src as f32);
                topology.push(target as f32);
                topology.push(weight);
                topology.push(score); // EXPORT SEMANTIC SCORE TO JS
                
                edge_count += 1;
                if edge_count >= 16 { break; }
            }
        }
        
        topology
    }
}