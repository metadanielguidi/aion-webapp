const worker = new Worker('worker.js', { type: 'module' });
const chatLog = document.getElementById('chat-log');
const chatInput = document.getElementById('chat-input');
const canvas = document.getElementById('topology-canvas');
const ctx = canvas.getContext('2d');
const resetBtn = document.getElementById('reset-btn');

function appendMessage(sender, text) {
    const div = document.createElement('div');
    div.innerText = `[${sender}]: ${text}`;
    chatLog.appendChild(div);
    chatLog.scrollTop = chatLog.scrollHeight;
}

resetBtn.addEventListener('click', () => {
    if (confirm("WARNING: This will obliterate the temporal matrix and all learned logic. Proceed?")) {
        worker.postMessage({ type: 'RESET_BRAIN' });
    }
});

worker.onmessage = function(e) {
    const { type, word, text } = e.data;
    
    if (type === 'READY') {
        appendMessage('AION_SYS', 'Omniscient Oracle Online. Awaiting temporal data ingestion.');
    } 
    else if (type === 'MATRIX_WIPED') {
        nodes.length = 0; 
        nodeMap.clear();
        chatLog.innerHTML = '<div>[AION_SYS]: MATRIX OBLITERATED. Tabula rasa achieved.</div>';
    }
    else if (type === 'NEW_CONCEPT') {
        addNode(word);
    }
    else if (type === 'ACTIVE_CONCEPT') {
        if (nodeMap.has(word)) nodeMap.get(word).pulse = 1.0; 
    }
    else if (type === 'AION_RESPONSE') {
        appendMessage('ORACLE', text);
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
    
    const textColor = '#00ffcc';
    const netColor = 'rgba(0, 255, 204, 0.15)';
    
    angle += 0.002;
    const cosA = Math.cos(angle);
    const sinA = Math.sin(angle);
    
    const projectedNodes = nodes.map(n => {
        const x = n.x * cosA - n.z * sinA;
        const z = n.x * sinA + n.z * cosA;
        const scale = 400 / (400 + z); 
        return { px: (width / 2) + x * scale, py: (height / 2) + n.y * scale, scale, z, ref: n };
    }).sort((a, b) => b.z - a.z); 
    
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
    
    for (const pn of projectedNodes) {
        pn.ref.pulse = Math.max(0, pn.ref.pulse - 0.03); 
        ctx.fillStyle = textColor;
        ctx.globalAlpha = Math.min(1, 0.2 + pn.ref.pulse + (pn.scale - 0.5));
        
        ctx.beginPath();
        ctx.arc(pn.px, pn.py, 2 * pn.scale + pn.ref.pulse * 6, 0, Math.PI * 2);
        ctx.fill();
        
        ctx.font = `${Math.floor(12 * pn.scale)}px monospace`;
        ctx.fillText(pn.ref.word, pn.px + 6, pn.py + 4);
    }
    ctx.globalAlpha = 1.0;
    
    requestAnimationFrame(render);
}
render();