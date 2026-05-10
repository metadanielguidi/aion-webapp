// Boot the Web Worker as a module
const worker = new Worker('worker.js', { type: 'module' });

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
const nodeRadius = 3;
const connectionDistance = 150;

function resizeCanvas() {
    canvas.width = canvas.parentElement.clientWidth;
    canvas.height = canvas.parentElement.clientHeight;
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

function addNodeToGraph(word) {
    // Cap the number of visual nodes to prevent O(N^2) rendering lag
    if (nodes.length > 250) {
        nodes.shift();
    }
    
    nodes.push({
        word: word,
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        vx: (Math.random() - 0.5) * 2,
        vy: (Math.random() - 0.5) * 2
    });
}

// Optimized HTML5 Physics Loop for the UI
function animateTopology() {
    // Fading trail effect
    ctx.fillStyle = 'rgba(10, 10, 10, 0.2)'; 
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.strokeStyle = 'rgba(0, 255, 0, 0.15)'; // Neon Green Lines
    ctx.lineWidth = 1;

    for (let i = 0; i < nodes.length; i++) {
        let n1 = nodes[i];
        
        // Drift mechanics
        n1.x += n1.vx;
        n1.y += n1.vy;

        // Bounce off walls
        if (n1.x < 0 || n1.x > canvas.width) n1.vx *= -1;
        if (n1.y < 0 || n1.y > canvas.height) n1.vy *= -1;

        // Draw connections
        for (let j = i + 1; j < nodes.length; j++) {
            let n2 = nodes[j];
            let dx = n1.x - n2.x;
            let dy = n1.y - n2.y;
            let distance = Math.sqrt(dx * dx + dy * dy);

            if (distance < connectionDistance) {
                ctx.beginPath();
                ctx.moveTo(n1.x, n1.y);
                ctx.lineTo(n2.x, n2.y);
                ctx.stroke();
            }
        }

        // Draw the Node
        ctx.fillStyle = '#00ff00';
        ctx.beginPath();
        ctx.arc(n1.x, n1.y, nodeRadius, 0, Math.PI * 2);
        ctx.fill();

        // Draw the Word
        ctx.fillStyle = 'rgba(0, 255, 0, 0.7)';
        ctx.font = '10px monospace';
        ctx.fillText(n1.word, n1.x + 6, n1.y + 3);
    }

    requestAnimationFrame(animateTopology);
}
animateTopology(); // Start the visual cortex


// --- CHAT INTERFACE & LOGIC ---

function appendMessage(sender, text) {
    const msgDiv = document.createElement('div');
    msgDiv.className = `message ${sender.toLowerCase()}-message`;
    
    // Formatting the tags for the Matrix aesthetic
    if (sender === 'USER') {
        msgDiv.innerHTML = `<span class="tag">[USER]:</span> ${text}`;
    } else if (sender === 'AION_SYS') {
        msgDiv.innerHTML = `<span class="tag sys-tag">[AION_SYS]:</span> ${text}`;
    } else {
        msgDiv.innerHTML = `<span class="tag oracle-tag">[ORACLE]:</span> ${text}`;
    }
    
    chatBox.appendChild(msgDiv);
    chatBox.scrollTop = chatBox.scrollHeight;
}

// 1. Core Worker Message Router
worker.onmessage = function(e) {
    const { type, payload, text, progress, word } = e.data;

    if (type === 'AION_RESPONSE') {
        
        // THE WEBGPU TERMINAL FILTER
        // Prevents the massive Llama 3 download stream from flooding the chat
        if (text.startsWith('[WEBGPU]:')) {
            let gpuTracker = document.getElementById('gpu-tracker');
            if (!gpuTracker) {
                gpuTracker = document.createElement('div');
                gpuTracker.id = 'gpu-tracker';
                gpuTracker.className = 'message sys-message'; 
                chatBox.appendChild(gpuTracker);
            }
            gpuTracker.innerHTML = `<span class="tag sys-tag">[AION_SYS]:</span> ${text}`;
            chatBox.scrollTop = chatBox.scrollHeight;
        } else {
            appendMessage('ORACLE', text);
        }

    } 
    else if (type === 'AION_STREAM_START') {
        currentStreamNode = document.createElement('div');
        currentStreamNode.className = 'message oracle-message';
        currentStreamNode.innerHTML = `<span class="tag oracle-tag">[AION]:</span> <span class="content"></span>`;
        chatBox.appendChild(currentStreamNode);
        chatBox.scrollTop = chatBox.scrollHeight;
    }
    else if (type === 'AION_STREAM_CHUNK') {
        if (currentStreamNode) {
            const contentSpan = currentStreamNode.querySelector('.content');
            contentSpan.innerHTML += text.replace(/\n/g, '<br>');
            chatBox.scrollTop = chatBox.scrollHeight;
        }
    }
    else if (type === 'AION_STREAM_END') {
        if (currentStreamNode) {
            const contentSpan = currentStreamNode.querySelector('.content');
            contentSpan.innerHTML += ` <span style="opacity: 0.5;">${text}</span>`;
            currentStreamNode = null;
            chatBox.scrollTop = chatBox.scrollHeight;
        }
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
        chatBox.scrollTop = chatBox.scrollHeight;
        
        if (progress === 100) progressTracker.remove();
    } 
    else if (type === 'MATRIX_WIPED') {
        nodes = []; // Clear the visual cortex
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        appendMessage('AION_SYS', 'MATRIX OBLITERATED. Tabula rasa achieved.');
    }
};

// 2. User Input Handlers
chatInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && chatInput.value.trim() !== '') {
        const text = chatInput.value;
        appendMessage('USER', text);
        chatInput.value = '';
        
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

// Initial Boot Sequence Log
appendMessage('AION_SYS', 'Matrix initializing...');