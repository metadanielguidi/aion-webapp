const worker = new Worker('worker.js', { type: 'module' });
const chatLog = document.getElementById('chat-log');
const chatInput = document.getElementById('chat-input');
const canvas = document.getElementById('topology-canvas');
const ctx = canvas.getContext('2d');

function appendMessage(sender, text) {
    const div = document.createElement('div');
    div.innerText = `[${sender}]: ${text}`;
    chatLog.appendChild(div);
    chatLog.scrollTop = chatLog.scrollHeight;
}

worker.onmessage = function(e) {
    const { type, word, actions, text } = e.data;
    
    if (type === 'READY') {
        appendMessage('AION_SYS', 'WebAssembly physics matrix online. REM sleep active.');
    } 
    else if (type === 'NEW_CONCEPT') {
        appendMessage('AION_SYS', `Novel stimuli detected. Wiring new neural cluster for: "${word}"`);
        addNode(word);
    }
    else if (type === 'ACTIVE_CONCEPT') {
        if (nodeMap.has(word)) {
            nodeMap.get(word).pulse = 1.0; // Trigger a visual flash
        }
    }
    else if (type === 'AION_RESPONSE') {
        appendMessage('AION', text);
    }
    else if (type === 'ACTION_SPIKE') {
        actions.forEach(action => {
            if (action === 0) { // NODE_SYS_ALERT
                alert("AION: System Alert triggered autonomously by matrix!");
            } else if (action === 1) { // NODE_UI_DARKMODE
                document.body.classList.toggle('dark-mode');
                appendMessage('AION_SYS', 'Motor Cortex fired [NODE_UI_DARKMODE]');
            }
        });
    }
};

chatInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && chatInput.value.trim() !== '') {
        const text = chatInput.value;
        appendMessage('USER', text);
        chatInput.value = '';

        worker.postMessage({ type: 'INGEST_TEXT', payload: text });
    }
});


// --- 3D Topology Visualization Engine ---

let width, height;
function resize() {
    width = canvas.clientWidth;
    height = canvas.clientHeight;
    canvas.width = width;
    canvas.height = height;
}
window.addEventListener('resize', resize);
resize();

const nodes = [];
const nodeMap = new Map();
let angle = 0;

function addNode(word) {
    // Distribute nodes randomly on a 3D sphere boundary
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos((Math.random() * 2) - 1);
    const r = 100 + Math.random() * 150; 
    
    const node = {
        word,
        x: r * Math.sin(phi) * Math.cos(theta),
        y: r * Math.sin(phi) * Math.sin(theta),
        z: r * Math.cos(phi),
        pulse: 1.0
    };
    nodes.push(node);
    nodeMap.set(word, node);
}

function render() {
    ctx.clearRect(0, 0, width, height);
    
    // React dynamically to AION's autonomous Dark Mode triggers
    const isDark = document.body.classList.contains('dark-mode');
    const textColor = isDark ? '#ff0055' : '#00ffcc';
    const netColor = isDark ? 'rgba(255, 0, 85, 0.15)' : 'rgba(0, 255, 204, 0.15)';
    
    angle += 0.002; // Slow rotation speed
    const cosA = Math.cos(angle);
    const sinA = Math.sin(angle);
    
    // Project 3D points into 2D perspective
    const projectedNodes = nodes.map(n => {
        const x = n.x * cosA - n.z * sinA;
        const z = n.x * sinA + n.z * cosA;
        
        const scale = 400 / (400 + z); // Perspective division
        return { 
            px: (width / 2) + x * scale, 
            py: (height / 2) + n.y * scale, 
            scale, z, ref: n 
        };
    }).sort((a, b) => b.z - a.z); // Z-Sorting (Painter's Algorithm)
    
    // Draw Synaptic Web Connections
    ctx.strokeStyle = netColor;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (let i = 0; i < projectedNodes.length; i++) {
        for (let j = i + 1; j < Math.min(i + 4, projectedNodes.length); j++) {
            ctx.moveTo(projectedNodes[i].px, projectedNodes[i].py);
            ctx.lineTo(projectedNodes[j].px, projectedNodes[j].py);
        }
    }
    ctx.stroke();
    
    // Draw Neural Nodes
    for (const pn of projectedNodes) {
        pn.ref.pulse = Math.max(0, pn.ref.pulse - 0.03); // Decay the pulse
        
        ctx.fillStyle = textColor;
        ctx.globalAlpha = Math.min(1, 0.2 + pn.ref.pulse + (pn.scale - 0.5));
        
        // Node core
        ctx.beginPath();
        ctx.arc(pn.px, pn.py, 2 * pn.scale + pn.ref.pulse * 6, 0, Math.PI * 2);
        ctx.fill();
        
        // Concept label
        ctx.font = `${Math.floor(12 * pn.scale)}px monospace`;
        ctx.fillText(pn.ref.word, pn.px + 6, pn.py + 4);
    }
    ctx.globalAlpha = 1.0;
    
    requestAnimationFrame(render);
}
render();
