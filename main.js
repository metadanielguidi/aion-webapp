const worker = new Worker('worker.js', { type: 'module' });
const chatLog = document.getElementById('chat-log');
const chatInput = document.getElementById('chat-input');

let pendingDefinitionWord = null;

function appendMessage(sender, text) {
    const div = document.createElement('div');
    div.innerText = `[${sender}]: ${text}`;
    chatLog.appendChild(div);
    chatLog.scrollTop = chatLog.scrollHeight;
}

worker.onmessage = function(e) {
    const { type, word, actions } = e.data;
    
    if (type === 'READY') {
        appendMessage('AION_SYS', 'WebAssembly physics matrix online. REM sleep active.');
    } 
    else if (type === 'UNKNOWN_WORD') {
        pendingDefinitionWord = word;
        appendMessage('AION', `I do not understand "${word}". Can you define it?`);
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

        if (pendingDefinitionWord) {
            // Fulfilling the Parent-Child Loop
            appendMessage('AION_SYS', `Wiring definition for "${pendingDefinitionWord}"... Dopamine flood injected.`);
            worker.postMessage({ type: 'DOPAMINE_FLOOD', payload: text });
            pendingDefinitionWord = null;
        } else {
            // Normal feed
            worker.postMessage({ type: 'INGEST_TEXT', payload: text });
        }
    }
});
