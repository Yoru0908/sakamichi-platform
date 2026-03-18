// FAD特效工具 - 使用 subtitle.js 中更健壮的解析和生成逻辑
document.addEventListener('DOMContentLoaded', function() {
  // 全局变量
  let segments = []; // {start, end, text, effects, isAss, originalLine, textIndex}
  let assHeader = '';
  let assStyles = '';
  let currentFile = null;
  let currentFileType = null;

  // 初始化DOM元素
  const dropArea = document.getElementById('drop-area');
  const fileInput = document.getElementById('file-input');
  const previewFad = document.getElementById('preview-fad');
  const fadInDuration = document.getElementById('fad-in-duration');
  const fadOutDuration = document.getElementById('fad-out-duration');
  const btnApplyFad = document.getElementById('btn-apply-fad');
  const btnClearFad = document.getElementById('btn-clear-fad');
  const btnExportFadAss = document.getElementById('btn-export-fad-ass');
  const btnQuickSrt = document.getElementById('btn-quick-srt');
  const btnQuickAss = document.getElementById('btn-quick-ass');
  const btnQuickTxtTs = document.getElementById('btn-quick-txt-ts');
  const btnQuickTxt = document.getElementById('btn-quick-txt');
  const filenameQuick = document.getElementById('filename-quick');
  const btnDonate = document.getElementById('btn-donate');
  const donateModal = document.getElementById('donate-modal');
  const closeDonateModal = document.getElementById('close-donate-modal');

  // 初始化事件监听
  initEventListeners();

  function initEventListeners() {
    dropArea.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropArea.classList.add('border-violet-500');
    });

    dropArea.addEventListener('dragleave', () => {
      dropArea.classList.remove('border-violet-500');
    });

    dropArea.addEventListener('drop', (e) => {
      e.preventDefault();
      dropArea.classList.remove('border-violet-500');
      if (e.dataTransfer.files.length) {
        handleFile(e.dataTransfer.files[0]);
      }
    });

    fileInput.addEventListener('change', (e) => {
      if (e.target.files.length) {
        handleFile(e.target.files[0]);
      }
    });

    btnApplyFad.addEventListener('click', applyFadToAll);
    btnClearFad.addEventListener('click', clearFadFromAll);
    btnExportFadAss.addEventListener('click', exportFadAss);

    btnQuickSrt.addEventListener('click', () => quickExport('srt'));
    btnQuickAss.addEventListener('click', () => quickExport('ass'));
    btnQuickTxtTs.addEventListener('click', () => quickExport('txt-ts'));
    btnQuickTxt.addEventListener('click', () => quickExport('txt'));

    btnDonate?.addEventListener('click', () => {
      donateModal?.classList.remove('hidden');
      donateModal?.classList.add('flex');
    });

    closeDonateModal?.addEventListener('click', () => {
      donateModal?.classList.add('hidden');
      donateModal?.classList.remove('flex');
    });
  }

  function handleFile(file) {
    currentFile = file;
    const reader = new FileReader();
    
    reader.onload = function(e) {
      const content = e.target.result;
      const fileName = file.name.replace(/\.[^/.]+$/, "");
      filenameQuick.value = fileName;
      
      const fileExt = file.name.split('.').pop().toLowerCase();
      
      if (fileExt === 'json') {
        currentFileType = 'json';
        segments = parseJsonToSegments(content);
      } else if (fileExt === 'srt') {
        currentFileType = 'srt';
        segments = parseSrtToSegments(content);
      } else if (fileExt === 'ass') {
        currentFileType = 'ass';
        segments = parseAssToSegments(content);
      } else if (fileExt === 'txt') {
        currentFileType = 'txt';
        segments = parseTxtToSegments(content);
      } else {
        alert('不支持的文件类型，请上传 JSON, SRT, ASS 或 TXT 文件。');
        return;
      }
      refreshPreview();
    };
    
    reader.readAsText(file, 'utf-8');
  }

  function refreshPreview() {
    previewFad.value = toAss(segments, true); // Always show ASS preview in FAD tool
  }

  // --- 时间格式化与转换 ---
  const fmtSrtTime = (sec) => {
    const ms = Math.floor((sec % 1) * 1000);
    const s = Math.floor(sec) % 60;
    const m = Math.floor(sec / 60) % 60;
    const h = Math.floor(sec / 3600);
    const pad = (n, z = 2) => String(n).padStart(z, '0');
    return `${pad(h)}:${pad(m)}:${pad(s)},${pad(ms, 3)}`;
  };

  const fmtAssTime = (sec) => {
    const cs = Math.floor((sec % 1) * 100);
    const s = Math.floor(sec) % 60;
    const m = Math.floor(sec / 60) % 60;
    const h = Math.floor(sec / 3600);
    const pad = (n, z = 2) => String(n).padStart(z, '0');
    return `${h}:${pad(m)}:${pad(s)}.${pad(cs)}`;
  };
  
  const parseSrtTimeToSeconds = (timeStr) => {
    const [h, m, s_ms] = timeStr.split(':');
    const [s, ms] = (s_ms || '0,0').replace('.',',').split(',');
    return (Number(h) || 0) * 3600 + (Number(m) || 0) * 60 + (Number(s) || 0) + (Number(ms) || 0) / 1000;
  };

  const parseAssTimeToSeconds = (timeStr) => {
    const parts = timeStr.split(':');
    const h = parseInt(parts[0], 10) || 0;
    const m = parseInt(parts[1], 10) || 0;
    const lastPart = parts[2];
    let s, fractional;
    if (lastPart.includes('.')) {
      const [seconds, centiseconds] = lastPart.split('.');
      s = parseInt(seconds, 10) || 0;
      fractional = parseInt(centiseconds.padEnd(2, '0'), 10) / 100;
    } else {
      s = parseInt(lastPart, 10) || 0;
      fractional = 0;
    }
    return h * 3600 + m * 60 + s + fractional;
  };

  // --- 字幕解析 ---
  
  function parseAssToSegments(assContent) {
    const lines = assContent.split(/\r?\n/);
    const segments = [];
    let headerLines = [], styleLines = [], eventLines = [];
    let currentSection = '';
    let formatFields = [];
    let startIndex = -1, endIndex = -1, textIndex = -1;

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith('[Script Info]')) currentSection = 'info';
      else if (trimmed.startsWith('[V4+ Styles]')) currentSection = 'styles';
      else if (trimmed.startsWith('[Events]')) currentSection = 'events';

      if (currentSection === 'info') headerLines.push(line);
      else if (currentSection === 'styles') styleLines.push(line);
      else if (currentSection === 'events') eventLines.push(line);
      else headerLines.push(line); // Lines before any section are part of header
    }
    
    assHeader = headerLines.join('\n') + '\n';
    assStyles = styleLines.join('\n') + '\n';

    const formatLine = eventLines.find(line => line.startsWith('Format:'));
    if (formatLine) {
      formatFields = formatLine.substring(7).split(',').map(f => f.trim());
      startIndex = formatFields.indexOf('Start');
      endIndex = formatFields.indexOf('End');
      textIndex = formatFields.indexOf('Text');
    }

    for (const line of eventLines) {
      if (line.startsWith('Dialogue:')) {
        const lineContent = line.substring(9);
        const parts = lineContent.split(',');
        
        if (parts.length >= formatFields.length) {
            const text = parts.slice(textIndex).join(',');
            const effectMatch = text.match(/^\{([^}]+)\}/);
            const effects = effectMatch ? effectMatch[1] : '';
            const cleanText = text.replace(/^\{[^}]+\}/, '');

            segments.push({
                start: parseAssTimeToSeconds(parts[startIndex]),
                end: parseAssTimeToSeconds(parts[endIndex]),
                text: cleanText,
                effects: effects,
                isAss: true,
                originalLine: line,
                format: formatFields,
                lineParts: parts,
                textIndex: textIndex
            });
        }
      }
    }
    return segments;
  }

  function parseSrtToSegments(srtContent) {
    const blocks = srtContent.trim().replace(/\r/g, '').split(/\n\n+/);
    const segments = [];
    for (const block of blocks) {
      const lines = block.split('\n');
      if (lines.length < 2) continue;
      const timeLine = lines.find(l => l.includes('-->'));
      if (!timeLine) continue;
      const [startStr, endStr] = timeLine.split(' --> ');
      const text = lines.slice(lines.indexOf(timeLine) + 1).join('\n').trim();
      if (startStr && endStr && text) {
        segments.push({
          start: parseSrtTimeToSeconds(startStr.trim()),
          end: parseSrtTimeToSeconds(endStr.trim()),
          text: text,
          effects: '',
        });
      }
    }
    return segments;
  }
  
  function parseTxtToSegments(txtContent) {
      // Simplified TXT parser, assuming "HH:MM:SS Text" format
      const lines = txtContent.trim().split('\n');
      const segments = [];
      const timestampRegex = /(\d{2}:\d{2}:\d{2})(.?\d{3})?\s*(.*)/;

      for (let i = 0; i < lines.length; i++) {
          const match = lines[i].trim().match(timestampRegex);
          if (match) {
              const timeStr = match[1] + (match[2] || ',000').replace('.', ',');
              const text = match[3].trim();
              const start = parseSrtTimeToSeconds(timeStr);
              let end = start + 2; // Default duration
              if (i + 1 < lines.length) {
                  const nextMatch = lines[i + 1].trim().match(timestampRegex);
                  if (nextMatch) {
                      const nextTimeStr = nextMatch[1] + (nextMatch[2] || ',000').replace('.', ',');
                      end = parseSrtTimeToSeconds(nextTimeStr);
                  }
              }
              segments.push({ start, end, text, effects: '' });
          }
      }
      return segments;
  }

  function parseJsonToSegments(json) {
      // Simplified JSON parser for Whisper/Capcut format
      try {
          const data = JSON.parse(json);
          if (data.segments) { // Whisper format
              return data.segments.map(s => ({
                  start: s.start,
                  end: s.end,
                  text: s.text.trim(),
                  effects: ''
              }));
          } else if (data.materials && data.materials.texts) { // Capcut format
              return data.materials.texts.map(t => ({
                  start: t.start_time / 1000000,
                  end: (t.start_time + t.duration) / 1000000,
                  text: t.content,
                  effects: ''
              }));
          }
      } catch (e) {
          console.error("JSON parsing failed:", e);
      }
      return [];
  }

  // --- 字幕生成 ---

  function toSrt(segs) {
    return segs.map((seg, i) => `${i + 1}\n${fmtSrtTime(seg.start)} --> ${fmtSrtTime(seg.end)}\n${seg.text}\n`).join('\n');
  }

  function toAss(segs, previewMode = false) {
    const eventsHeader = '[Events]\n' + (segs[0]?.format ? `Format: ${segs[0].format.join(', ')}\n` : 'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n');
    
    const eventLines = segs.map(s => {
      const textWithEffects = (s.effects ? `{${s.effects}}` : '') + s.text;
      if (s.isAss) {
        // Reconstruct from original parts to preserve all fields
        s.lineParts[s.textIndex] = textWithEffects;
        return `Dialogue: ${s.lineParts.join(',')}`;
      } else {
        // Create a new default Dialogue line
        const start = fmtAssTime(s.start);
        const end = fmtAssTime(s.end);
        return `Dialogue: 0,${start},${end},Default,,0,0,0,,${textWithEffects}`;
      }
    }).join('\n');

    if (previewMode) {
      return `${eventsHeader}${eventLines}`;
    }

    const header = assHeader || `[Script Info]
Title: Converted by FAD Tool
ScriptType: v4.00+
PlayResX: 1920
PlayResY: 1080

`;
    const styles = assStyles || `[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,Arial,48,&H00FFFFFF,&H000000FF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,2,2,2,10,10,10,1

`;
    return `${header}${styles}${eventsHeader}${eventLines}`;
  }

  // --- FAD 特效逻辑 ---

  function applyFadToAll() {
    if (segments.length === 0) {
      alert('请先上传并解析文件');
      return;
    }
    const fadeIn = parseInt(fadInDuration.value) || 0;
    const fadeOut = parseInt(fadOutDuration.value) || 0;
    const fadTag = `\\fad(${fadeIn},${fadeOut})`;

    segments.forEach(s => {
      let effects = s.effects || '';
      // 移除现有的 fad 效果，以避免重复
      effects = effects.replace(/\\fad\([^)]+\)/g, '').trim();
      // 添加新的 fad 效果
      s.effects = effects ? `${fadTag} ${effects}` : fadTag;
    });
    
    refreshPreview();
  }

  function clearFadFromAll() {
    if (segments.length === 0) {
      alert('请先上传并解析文件');
      return;
    }
    segments.forEach(s => {
      s.effects = (s.effects || '').replace(/\\fad\([^)]+\)/g, '').trim();
    });
    refreshPreview();
  }

  function exportFadAss() {
    if (segments.length === 0) {
      alert('请先上传文件');
      return;
    }
    // 应用当前设置的FAD
    applyFadToAll();
    // 导出
    const fileName = filenameQuick.value || 'subtitle';
    downloadFile(`${fileName}_fad.ass`, toAss(segments));
  }

  // --- 快速导出 ---

  function quickExport(format) {
    if (segments.length === 0) {
      alert('请先上传文件');
      return;
    }
    
    const fileName = filenameQuick.value || 'subtitle';
    let content = '';
    let ext = format;

    switch (format) {
      case 'srt':
        content = toSrt(segments);
        break;
      case 'ass':
        content = toAss(segments);
        break;
      case 'txt-ts':
        content = segments.map(s => `${fmtSrtTime(s.start)} ${s.text}`).join('\n');
        ext = 'txt';
        break;
      case 'txt':
        content = segments.map(s => s.text).join('\n');
        ext = 'txt';
        break;
    }
    downloadFile(`${fileName}.${ext}`, content);
  }

  // --- 文件下载 ---
  function downloadFile(filename, content) {
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 100);
  }
});
