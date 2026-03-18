function fixSrt() {
    const srtContent = document.getElementById('preview-src').value;
    if (!srtContent) {
        alert('请先加载 SRT 内容');
        return;
    }

    try {
        const fixedContent = fixSrtContent(srtContent);
        document.getElementById('preview-fixed').value = fixedContent;
        
        const summaryPanel = document.getElementById('summary-panel');
        summaryPanel.innerHTML = `<p class="text-green-600 font-semibold">修复完成！请在右侧预览并导出。</p>`;
    } catch (e) {
        const summaryPanel = document.getElementById('summary-panel');
        summaryPanel.innerHTML = `<p class="text-red-600 font-semibold">修复失败: ${e.message}</p>`;
        console.error(e);
    }
}

function fixSrtContent(srtContent) {
    // --- Robust Timestamp Parser ---
    const parseTimestamp = (ts) => {
        const parts = ts.replace(',', '.').split(':');
        let h = 0, m = 0, s = 0, ms = 0;
        try {
            if (parts.length === 3) { // HH:MM:SS.ms
                h = parseInt(parts[0], 10);
                m = parseInt(parts[1], 10);
                const secParts = parts[2].split('.');
                s = parseInt(secParts[0], 10);
                ms = secParts[1] ? parseInt(secParts[1].padEnd(3, '0').substring(0,3), 10) : 0;
            } else if (parts.length === 2) { // MM:SS.ms
                m = parseInt(parts[0], 10);
                const secParts = parts[1].split('.');
                s = parseInt(secParts[0], 10);
                ms = secParts[1] ? parseInt(secParts[1].padEnd(3, '0').substring(0,3), 10) : 0;
            } else {
                return NaN;
            }
            if ([h, m, s, ms].some(isNaN)) return NaN;
            return h * 3600000 + m * 60000 + s * 1000 + ms;
        } catch (e) {
            return NaN;
        }
    };

    // --- SRT Parser to Structured Data ---
    const lines = srtContent.split(/\r?\n/);
    const subtitleBlocks = [];
    let currentBlock = null;
    for (const line of lines) {
        if (!currentBlock) {
            if (/^\d+$/.test(line.trim())) {
                currentBlock = { index: line.trim(), text: [] };
            }
            continue;
        }
        if (!currentBlock.time) {
            if (line.includes('-->')) {
                currentBlock.time = line;
            }
            continue;
        }
        if (line.trim() === '') {
            if (currentBlock.time) subtitleBlocks.push(currentBlock);
            currentBlock = null;
        } else {
            currentBlock.text.push(line);
        }
    }
    if (currentBlock && currentBlock.time) subtitleBlocks.push(currentBlock);

    // --- Stage 1: Fix Time Order (Format Errors) ---
    let lastEndMs = 0;
    for (const block of subtitleBlocks) {
        const [startStr, endStr] = block.time.split(' --> ');
        block.startMs = parseTimestamp(startStr);
        block.endMs = parseTimestamp(endStr);

        if (isNaN(block.startMs) || isNaN(block.endMs)) continue;

        if (block.startMs < lastEndMs) {
            while (block.startMs < lastEndMs) block.startMs += 60000;
        }
        if (block.endMs < block.startMs) {
            while (block.endMs < block.startMs) block.endMs += 60000;
        }
        lastEndMs = block.endMs;
    }

    // --- Stage 2: Batch Translation for Gaps (Timeline Breaks) ---
    const TWO_MINUTES = 2 * 60 * 1000;
    let totalOffset = 0;
    for (let i = 1; i < subtitleBlocks.length; i++) {
        const prevBlock = subtitleBlocks[i - 1];
        const currBlock = subtitleBlocks[i];

        if (isNaN(currBlock.startMs) || isNaN(prevBlock.endMs)) continue;
        
        currBlock.startMs -= totalOffset;
        currBlock.endMs -= totalOffset;

        const gap = currBlock.startMs - prevBlock.endMs;
        if (gap > TWO_MINUTES) {
            const offset = gap;
            totalOffset += offset;
            currBlock.startMs -= offset;
            currBlock.endMs -= offset;
        }
    }
    
    // --- Rebuild SRT String ---
    const formatTimestamp = (ms) => {
        if (isNaN(ms)) return "INVALID_TIMESTAMP";
        const h = Math.floor(ms / 3600000);
        const m = Math.floor((ms % 3600000) / 60000);
        const s = Math.floor((ms % 60000) / 1000);
        const mmm = ms % 1000;
        return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(mmm).padStart(3, '0')}`;
    };

    let fixedContent = '';
    for (const block of subtitleBlocks) {
        if (block.time && !isNaN(block.startMs) && !isNaN(block.endMs)) {
            fixedContent += block.index + '\n';
            fixedContent += `${formatTimestamp(block.startMs)} --> ${formatTimestamp(block.endMs)}\n`;
            fixedContent += block.text.join('\n') + '\n\n';
        }
    }
    return fixedContent.trim();
}


// Event Listeners for the UI
document.addEventListener('DOMContentLoaded', () => {
    const dropArea = document.getElementById('drop-area');
    const fileInput = document.getElementById('file-input');
    const previewSrc = document.getElementById('preview-src');
    const btnFix = document.getElementById('btn-fix');
    const btnExport = document.getElementById('btn-export-fixed');
    const filenameInput = document.getElementById('filename-fixed');

    const handleFile = (file) => {
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (e) => {
            previewSrc.value = e.target.result;
            const originalFilename = file.name.replace(/\.[^/.]+$/, "");
            filenameInput.value = `${originalFilename}_fixed`;
            document.getElementById('summary-panel').innerHTML = '';
            document.getElementById('preview-fixed').value = '';
            
            // Automatically trigger the fix function after a file is loaded
            fixSrt();
        };
        reader.readAsText(file, 'UTF-8');
    };

    // --- Unified Event Handling ---
    if (dropArea) {
        // Clicking anywhere in the drop area opens the file dialog
        dropArea.addEventListener('click', () => fileInput.click());

        // Drag and drop events
        dropArea.addEventListener('dragover', (e) => {
            e.preventDefault();
            dropArea.classList.add('border-violet-400', 'bg-violet-50');
        });

        dropArea.addEventListener('dragleave', () => {
            dropArea.classList.remove('border-violet-400', 'bg-violet-50');
        });

        dropArea.addEventListener('drop', (e) => {
            e.preventDefault();
            dropArea.classList.remove('border-violet-400', 'bg-violet-50');
            const files = e.dataTransfer.files;
            if (files.length > 0) {
                handleFile(files[0]);
            }
        });
    }

    // The actual file input element handles the file selection
    if (fileInput) {
        fileInput.addEventListener('change', () => {
            if (fileInput.files.length > 0) {
                handleFile(fileInput.files[0]);
            }
        });
    }

    if (btnFix) {
        btnFix.addEventListener('click', fixSrt);
    }

    if (btnExport) {
        btnExport.addEventListener('click', () => {
            const fixedContent = document.getElementById('preview-fixed').value;
            if (!fixedContent) {
                alert('没有可导出的修复后内容');
                return;
            }
            const blob = new Blob([fixedContent], { type: 'text/plain;charset=utf-8' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${filenameInput.value || 'fixed_subtitle'}.srt`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        });
    }
    
    // For the top nav menu
    const t = document.getElementById('mobile-menu-toggle');
    const mm = document.getElementById('mobile-menu');
    if (t && mm) {
      t.addEventListener('click', ()=>{
        const closed = mm.classList.contains('hidden');
        if (closed) { mm.classList.remove('hidden','max-h-0','opacity-0'); mm.classList.add('max-h-96','opacity-100'); } 
        else { mm.classList.add('max-h-0','opacity-0'); mm.classList.remove('max-h-96','opacity-100'); setTimeout(()=> mm.classList.add('hidden'), 280); }
      });
    }
});
