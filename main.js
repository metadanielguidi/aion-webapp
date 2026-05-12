// Boot the Web Worker as a module
const worker = new Worker('worker.js?v=' + Date.now(), { type: 'module' });

// DOM Elements
const chatBox = document.getElementById('chat-box');
const chatInput = document.getElementById('chat-input');
const fileUpload = document.getElementById('file-upload');
const resetBtn = document.getElementById('reset-btn');
const canvas = document.getElementById('visual-cortex');
const ctx = canvas.getContext('2d');
let currentStreamNode = null; // Tracks the active streaming message

// --- THE VISUAL CORTEX (Topology Graph) ---
let nodes = [];
let actualEdges = []; // Tracks actual SNN physics edges
const nodeRadius = 3;
const connectionDistance = 150;
let offsetX = 0;
let offsetY = 0;
let scale = 1;

function resizeCanvas() {
    canvas.width = canvas.parentElement.clientWidth;
    canvas.height = canvas.parentElement.clientHeight;
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

function addNodeToGraph(word) {
    // Cap the number of visual nodes to prevent O(N^2) rendering lag
    if (nodes.length > 250) {
        // Prevent shifting out currently active/queried nodes
        const removeIdx = nodes.findIndex(n => !n.isQueried);
        if (removeIdx !== -1) {
            nodes.splice(removeIdx, 1);
        } else {
            nodes.shift();
        }
    }
    
    nodes.push({
        word: word,
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        vx: (Math.random() - 0.5) * 2,
        vy: (Math.random() - 0.5) * 2,
        isQueried: false // Tracks conscious attention
    });
}

// Optimized HTML5 Physics Loop for the UI
function animateTopology() {
    // Fading trail effect
    ctx.fillStyle = 'rgba(10, 10, 10, 0.2)'; 
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.save();
    ctx.translate(offsetX, offsetY);
    ctx.scale(scale, scale);

    ctx.strokeStyle = 'rgba(0, 255, 0, 0.15)'; // Neon Green Lines
    ctx.lineWidth = 1;

    for (let i = 0; i < nodes.length; i++) {
        let n1 = nodes[i];
        
        // Drift mechanics
        n1.x += n1.vx;
        n1.y += n1.vy;

        // Friction to prevent infinite acceleration
        n1.vx *= 0.99;
        n1.vy *= 0.99;

        // Bounce off walls
        if (n1.x < 0 || n1.x > canvas.width) n1.vx *= -1;
        if (n1.y < 0 || n1.y > canvas.height) n1.vy *= -1;
    }

    // Draw Actual SNN Edges
    for (let edge of actualEdges) {
        let n1 = nodes.find(n => n.word === edge.source);
        let n2 = nodes.find(n => n.word === edge.target);
        if (n1 && n2) {
            let dx = n1.x - n2.x;
            let dy = n1.y - n2.y;
            let distance = Math.sqrt(dx * dx + dy * dy);

            // Semantic Gravity (Pull Excitatory, Push Inhibitory)
            if (edge.weight > 0 && distance > 50) {
                n1.vx -= dx * 0.00005 * Math.min(10, edge.weight);
                n1.vy -= dy * 0.00005 * Math.min(10, edge.weight);
                n2.vx += dx * 0.00005 * Math.min(10, edge.weight);
                n2.vy += dy * 0.00005 * Math.min(10, edge.weight);
            } else if (edge.weight < 0 && distance < 300) {
                n1.vx += dx * 0.0001 * Math.min(10, Math.abs(edge.weight));
                n1.vy += dy * 0.0001 * Math.min(10, Math.abs(edge.weight));
                n2.vx -= dx * 0.0001 * Math.min(10, Math.abs(edge.weight));
                n2.vy -= dy * 0.0001 * Math.min(10, Math.abs(edge.weight));
            }

            // Draw Excitatory (Green) and Inhibitory (Red)
            let alpha = Math.min(0.9, 0.25 + (Math.abs(edge.weight) / 15));
            if (edge.weight > 0) {
                ctx.strokeStyle = `rgba(0, 255, 0, ${alpha})`;
            } else {
                ctx.strokeStyle = `rgba(255, 0, 0, ${alpha})`;
            }
            ctx.lineWidth = Math.min(4, Math.max(1, Math.abs(edge.weight) / 8));

            // Override for queried connections
            if (n1.isQueried || n2.isQueried) {
                ctx.strokeStyle = 'rgba(0, 204, 255, 0.4)';
                ctx.lineWidth = 1.5;
            }
            ctx.beginPath();
            ctx.moveTo(n1.x, n1.y);
            ctx.lineTo(n2.x, n2.y);
            ctx.stroke();
        }
    }

    // Draw Nodes
    for (let i = 0; i < nodes.length; i++) {
        let n1 = nodes[i];
        ctx.fillStyle = n1.isQueried ? '#00ccff' : '#00ff00';
        ctx.beginPath();
        ctx.arc(n1.x, n1.y, n1.isQueried ? nodeRadius * 2 : nodeRadius, 0, Math.PI * 2);
        
        if (n1.isQueried) {
            ctx.shadowBlur = 15;
            ctx.shadowColor = '#00ccff';
        }
        ctx.fill();

        // Draw the Word
        ctx.fillStyle = n1.isQueried ? '#00ccff' : 'rgba(0, 255, 0, 0.7)';
        ctx.font = n1.isQueried ? 'bold 12px monospace' : '10px monospace';
        ctx.fillText(n1.word, n1.x + 6, n1.y + 3);
        
        // Reset shadow for next items
        ctx.shadowBlur = 0;
    }
    
    ctx.restore();

    // Draw HUD Legend
    ctx.fillStyle = 'rgba(0, 20, 0, 0.85)';
    const legendY = Math.max(10, canvas.height - 140);
    ctx.fillRect(10, legendY, 220, 120);
    ctx.strokeStyle = '#0f0';
    ctx.lineWidth = 1;
    ctx.strokeRect(10, legendY, 220, 120);

    ctx.font = 'bold 12px monospace';
    ctx.fillStyle = '#0f0';
    ctx.fillText("VISUAL CORTEX LEGEND", 20, legendY + 20);
    
    ctx.font = '11px monospace';
    ctx.fillStyle = '#00ff00';
    ctx.beginPath(); ctx.arc(25, legendY + 40, nodeRadius, 0, Math.PI*2); ctx.fill();
    ctx.fillText("Metabolized Concept", 40, legendY + 44);

    ctx.fillStyle = '#00ccff';
    ctx.beginPath(); ctx.arc(25, legendY + 60, nodeRadius * 2, 0, Math.PI*2); ctx.fill();
    ctx.fillText("Queried (Conscious)", 40, legendY + 64);

    ctx.strokeStyle = 'rgba(0, 255, 0, 0.8)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(15, legendY + 80); ctx.lineTo(35, legendY + 80); ctx.stroke();
    ctx.fillStyle = '#0f0'; ctx.fillText("Excitatory Bond (Pull)", 40, legendY + 84);

    ctx.strokeStyle = 'rgba(255, 0, 0, 0.8)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(15, legendY + 100); ctx.lineTo(35, legendY + 100); ctx.stroke();
    ctx.fillText("Inhibitory Bond (Push)", 40, legendY + 104);

    requestAnimationFrame(animateTopology);
}
animateTopology(); // Start the visual cortex


// --- CHAT INTERFACE & LOGIC ---

function scrollToBottom(force = false) {
    // Only auto-scroll if the user is near the bottom, OR if we force it (like when sending a query)
    const distanceToBottom = chatBox.scrollHeight - chatBox.clientHeight - chatBox.scrollTop;
    if (force || distanceToBottom <= 50) {
        chatBox.scrollTop = chatBox.scrollHeight;
    }
}

function appendMessage(sender, text) {
    const msgDiv = document.createElement('div');
    msgDiv.className = `message ${sender.toLowerCase()}-message`;
    
    // Formatting the tags for the Matrix aesthetic
    if (sender === 'USER') {
        msgDiv.innerHTML = `<span class="tag">[USER]:</span> ${text}`;
    } else if (sender === 'DREAM') {
        msgDiv.innerHTML = `<span class="tag dream-tag">[DREAM]:</span> ${text}`;
    } else if (sender === 'AION_SYS') {
        msgDiv.innerHTML = `<span class="tag sys-tag">[AION_SYS]:</span> ${text}`;
    } else {
        msgDiv.innerHTML = `<span class="tag oracle-tag">[ORACLE]:</span> ${text}`;
    }
    
    chatBox.appendChild(msgDiv);
    scrollToBottom(sender === 'USER'); // Force scroll if the user just sent a message
}

// 1. Core Worker Message Router
worker.onmessage = function(e) {
    const { type, payload, text, progress, word } = e.data;

    if (type === 'AION_RESPONSE') {
        appendMessage('ORACLE', text);

    } 
    else if (type === 'AION_STREAM_START') {
        currentStreamNode = document.createElement('div');
        currentStreamNode.className = 'message oracle-message';
        currentStreamNode.innerHTML = `<span class="tag oracle-tag">[AION]:</span> <span class="content"></span>`;
        chatBox.appendChild(currentStreamNode);
        scrollToBottom(true); // Force scroll when AION starts its response
    }
    else if (type === 'AION_STREAM_CHUNK') {
        if (currentStreamNode) {
            const contentSpan = currentStreamNode.querySelector('.content');
            contentSpan.innerHTML += text.replace(/\n/g, '<br>');
            scrollToBottom();
        }
    }
    else if (type === 'AION_STREAM_END') {
        if (currentStreamNode) {
            const contentSpan = currentStreamNode.querySelector('.content');
            contentSpan.innerHTML += ` <span style="opacity: 0.5;">${text}</span>`;
            currentStreamNode = null;
            scrollToBottom();
        }
    }
    else if (type === 'AION_DREAM') {
        appendMessage('DREAM', text);
    }
    else if (type === 'NEW_CONCEPT') {
        addNodeToGraph(word);
    } 
    else if (type === 'DIGESTION_PROGRESS') {
        let progressTracker = document.getElementById('progress-tracker');
        if (!progressTracker) {
            progressTracker = document.createElement('div');
            progressTracker.id = 'progress-tracker';
            progressTracker.className = 'message sys-message';
            chatBox.appendChild(progressTracker);
        }
        progressTracker.innerHTML = `<span class="tag sys-tag">[AION_SYS]:</span> Ingesting Temporal Data: ${progress}%`;
        scrollToBottom();
        
        if (progress === 100) progressTracker.remove();
    } 
    else if (type === 'MATRIX_WIPED') {
        nodes = []; // Clear the visual cortex
        actualEdges = [];
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        appendMessage('AION_SYS', 'MATRIX OBLITERATED. Tabula rasa achieved.');
    }
    else if (type === 'EXPORT_DATA') {
        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(payload));
        const downloadAnchorNode = document.createElement('a');
        downloadAnchorNode.setAttribute("href", dataStr);
        downloadAnchorNode.setAttribute("download", "aion_universe_topology.json");
        document.body.appendChild(downloadAnchorNode);
        downloadAnchorNode.click();
        downloadAnchorNode.remove();
        appendMessage('AION_SYS', `Universe topology exported. ${payload.nodes.length} nodes and ${payload.links.length} core connections compiled for 3D visualization.`);
    }
    else if (type === 'VISUAL_CORTEX_UPDATE') {
        actualEdges = payload;
    }
};

// Periodically poll the matrix for the true physical edges of the visible nodes
setInterval(() => {
    if (nodes.length > 0) {
        worker.postMessage({ type: 'REQUEST_VISUAL_EDGES', payload: nodes.map(n => n.word) });
    }
}, 1000);

// 2. User Input Handlers
chatInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && chatInput.value.trim() !== '') {
        const text = chatInput.value;
        appendMessage('USER', text);
        chatInput.value = '';
        
        // Command to export the universe
        if (text.trim().toLowerCase() === '/export') {
            worker.postMessage({ type: 'REQUEST_EXPORT' });
            return;
        }

        // VISUAL CORTEX SYNC: Highlight queried nodes in neon blue
        const queryWords = text.toLowerCase().match(/\b\w+\b/g) || [];
        
        // Ensure the queried words are actually on the canvas (they might have been shifted out)
        queryWords.forEach(w => {
            if (!nodes.find(n => n.word === w)) {
                addNodeToGraph(w);
            }
        });
        nodes.forEach(n => n.isQueried = queryWords.includes(n.word));

        // Route to the Native Conversational Handler
        worker.postMessage({ type: 'USER_QUERY', payload: text }); 
    }
});

// 3. Bulk Text Ingestion Handler
fileUpload.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = (event) => {
        appendMessage('AION_SYS', `Initiating bulk ingestion of: ${file.name}...`);
        worker.postMessage({ type: 'INGEST_TEXT', payload: event.target.result });
    };
    reader.readAsText(file);
    
    // Reset input so you can upload the same file again if needed
    e.target.value = ''; 
});

// 4. Matrix Reset Protocol
resetBtn.addEventListener('click', () => {
    // Remove the GPU tracker if it exists so it prints fresh on reload
    const gpuTracker = document.getElementById('gpu-tracker');
    if (gpuTracker) gpuTracker.remove();
    
    worker.postMessage({ type: 'RESET_BRAIN' });
});

// 5. Canvas Zoom, Pan, and Click Controls
let isDraggingCanvas = false;
let hasDraggedCanvas = false;
let dragStartX = 0, dragStartY = 0;

canvas.addEventListener('mousedown', (e) => {
    isDraggingCanvas = true;
    hasDraggedCanvas = false;
    dragStartX = e.clientX - offsetX;
    dragStartY = e.clientY - offsetY;
});

canvas.addEventListener('mousemove', (e) => {
    if (isDraggingCanvas) {
        offsetX = e.clientX - dragStartX;
        offsetY = e.clientY - dragStartY;
        hasDraggedCanvas = true;
    }
});

canvas.addEventListener('mouseup', () => isDraggingCanvas = false);
canvas.addEventListener('mouseleave', () => isDraggingCanvas = false);

canvas.addEventListener('click', (e) => {
    if (hasDraggedCanvas) return; // Ignore click if panning
    const rect = canvas.getBoundingClientRect();
    const mouseX = (e.clientX - rect.left - offsetX) / scale;
    const mouseY = (e.clientY - rect.top - offsetY) / scale;

    for (let i = 0; i < nodes.length; i++) {
        let n = nodes[i];
        let dx = mouseX - n.x;
        let dy = mouseY - n.y;
        if (Math.sqrt(dx * dx + dy * dy) < nodeRadius * 4) {
            chatInput.value = `what is ${n.word}?`;
            chatInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
            break;
        }
    }
});

canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    const zoomIntensity = 0.1;
    const wheel = e.deltaY < 0 ? 1 : -1;
    const zoomFactor = Math.exp(wheel * zoomIntensity);
    
    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    offsetX = mouseX - (mouseX - offsetX) * zoomFactor;
    offsetY = mouseY - (mouseY - offsetY) * zoomFactor;
    scale *= zoomFactor;
}, { passive: false });

// 6. Focus Mode (Hide UI)
let isUiHidden = false;
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        isUiHidden = !isUiHidden;
        const elements = [chatBox, chatInput, fileUpload, resetBtn];
        
        elements.forEach(el => {
            if (!el) return;
            
            // Find the highest parent container of the UI element that does NOT contain the canvas
            let target = el;
            let current = el.parentElement;
            while (current && current !== document.body && current !== document.documentElement) {
                if (current.contains(canvas)) break;
                target = current;
                current = current.parentElement;
            }
            
            target.style.transition = 'opacity 0.3s ease';
            target.style.opacity = isUiHidden ? '0.1' : '1';
            target.style.pointerEvents = isUiHidden ? 'none' : 'auto';
        });
    }
});

// Initial Boot Sequence Log
appendMessage('AION_SYS', 'Matrix initializing... Press [ESC] to toggle UI visibility and view the full Visual Cortex.');