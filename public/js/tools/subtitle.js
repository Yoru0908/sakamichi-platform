(() => {
  const initSubtitleTool = () => {
    const root = document.getElementById('subtitle-tool-root');
    if (!root || root.dataset.initialized === 'true') return;
    root.dataset.initialized = 'true';

    const ui = {
    file: document.getElementById('file-input'),
    dropZone: document.getElementById('drop-zone'),
    gap: document.getElementById('gap-slider'),
    gapLabel: document.getElementById('gap-label'),
    shortPriority: document.getElementById('short-priority'),
    shortThreshold: document.getElementById('short-threshold'),
    len: document.getElementById('len-slider'),
    lenLabel: document.getElementById('len-label'),
    btnMerge: document.getElementById('btn-merge'),
    previewSrc: document.getElementById('preview-src'),
    previewMerged: document.getElementById('preview-merged'),
    // 快速导出（原始）控件
    quickName: document.getElementById('filename-quick'),
    quickSrt: document.getElementById('btn-quick-srt'),
    quickAss: document.getElementById('btn-quick-ass'),
    quickTxtTs: document.getElementById('btn-quick-txt-ts'),
    quickTxt: document.getElementById('btn-quick-txt'),
    donateBtn: document.getElementById('btn-donate'),
    // 合并导出控件
    mergeSrt: document.getElementById('btn-merge-export-srt'),
    mergeTxtTs: document.getElementById('btn-merge-export-txt-ts'),
    mergeTxt: document.getElementById('btn-merge-export-txt'),
    // 文本替换控件
    replaceAdd: document.getElementById('replace-add'),
    replaceRows: document.getElementById('replace-rows'),
    replaceApply: document.getElementById('replace-apply'),
    // 预设按钮
    presetLive: document.getElementById('preset-live'),
    presetInterview: document.getElementById('preset-interview'),
    presetRadio: document.getElementById('preset-radio'),
    resetSettings: document.getElementById('reset-settings'),
    dynamicThresholdEnable: document.getElementById('dynamic-threshold-enable'),
    dynamicWordCount: document.getElementById('dynamic-word-count'),
    dynamicThreshold: document.getElementById('dynamic-threshold'),
    // 工具切换
    btnToolMerge: document.getElementById('btn-tool-merge'),
    btnToolFad: document.getElementById('btn-tool-fad'),
    toolMergeView: document.getElementById('tool-merge-view'),
    toolFadView: document.getElementById('tool-fad-view'),
    // FAD 工具
    previewFad: document.getElementById('preview-fad'),
    fadInDuration: document.getElementById('fad-in-duration'),
    fadeOutDuration: document.getElementById('fad-out-duration'),
    btnApplyFad: document.getElementById('btn-apply-fad'),
    btnClearFad: document.getElementById('btn-clear-fad'),
    btnExportFadAss: document.getElementById('btn-export-fad-ass'),
    // Capcut Path Modal
    capcutPathToggle: document.getElementById('capcut-path-toggle'),
    capcutPathModal: document.getElementById('capcut-path-modal'),
    closeCapcutModal: document.getElementById('close-capcut-modal'),
    };

  const defaultSettings = {
    gap: 500,
    len: 36,
    dynamicThresholdEnable: true,
    dynamicWordCount: 2,
    dynamicThreshold: 800,
    fillers: 'none',
  };

  let segments = []; // {start,end,text,...} in seconds
  let mergedSegments = [];
  let assHeader = '';
  let assStyles = '';
  let currentMergeMode = 'radio'; // Default mode
  let currentTool = 'merge'; // 'merge' or 'fad'

  const switchTool = (toolName) => {
    if (currentTool === toolName) return;
    currentTool = toolName;

    const isMerge = toolName === 'merge';
    ui.toolMergeView.classList.toggle('hidden', !isMerge);
    ui.toolFadView.classList.toggle('hidden', isMerge);

    const switcher = document.getElementById('tool-switcher');
    if (switcher) {
      if (isMerge) {
        switcher.classList.remove('fad-active');
      } else {
        switcher.classList.add('fad-active');
      }
    }
    // When switching, refresh the preview to show the correct format
    refreshSrcPreview();
  };

  ui.btnToolMerge?.addEventListener('click', () => switchTool('merge'));
  ui.btnToolFad?.addEventListener('click', () => switchTool('fad'));

  // Modal logic
  ui.capcutPathToggle?.addEventListener('click', () => {
    ui.capcutPathModal?.classList.remove('hidden');
    ui.capcutPathModal?.classList.add('flex');
  });
  ui.closeCapcutModal?.addEventListener('click', () => {
    ui.capcutPathModal?.classList.add('hidden');
    ui.capcutPathModal?.classList.remove('flex');
  });


  const showStatus = (msg, type) => {
    const el = document.getElementById('parse-status');
    if (!el) return;
    el.textContent = msg;
    el.className = 'mt-3 px-3 py-2 rounded-lg text-xs font-medium ' + (
      type === 'error'   ? 'bg-red-50 text-red-700' :
      type === 'warn'    ? 'bg-yellow-50 text-yellow-700' :
      type === 'loading' ? 'bg-blue-50 text-blue-700' :
                           'bg-green-50 text-green-700'
    );
  };

  const handleFile = (f) => {
    if (!f) return;

    const MAX_SIZE = 60 * 1024 * 1024; // 60 MB hard limit
    const WARN_SIZE = 10 * 1024 * 1024; // 10 MB soft warn
    const sizeMB = (f.size / 1024 / 1024).toFixed(1);
    if (f.size > MAX_SIZE) {
      showStatus(`文件过大 (${sizeMB} MB)，请上传 60 MB 以内的文件。CapCut 请删除素材后导出。`, 'error');
      return;
    }

    const rawName = f.name || '';
    currentBaseName = basenameNoExt(rawName) || 'subtitle';

    if (f.size > WARN_SIZE) {
      showStatus(`文件较大 (${sizeMB} MB)，解析中…`, 'loading');
    }
    
    const reader = new FileReader();
    reader.onload = () => {
      const content = reader.result;
      const fileExt = rawName.split('.').pop().toLowerCase();
      const trimmedContent = content.trim();
      
      const isAssFile = fileExt === 'ass' || trimmedContent.includes('[Script Info]') || trimmedContent.includes('[Events]');

      const parse = () => {
        if (fileExt === 'json' || trimmedContent.startsWith('{') || trimmedContent.startsWith('[')) {
          segments = parseJsonToSegments(content);
          const guessed = guessBaseNameFromJson(content);
          if (guessed) currentBaseName = guessed;
          switchTool('merge');
        } else if (isAssFile) {
          segments = parseAssToSegments(content);
          switchTool('fad');
        } else if (fileExt === 'srt' || trimmedContent.includes('-->')) {
          segments = parseSrtToSegments(content);
          switchTool('merge');
        } else {
          segments = parseTxtToSegments(content);
          switchTool('merge');
        }

        refreshSrcPreview();
        mergedSegments = [];
        ui.previewMerged.value = '';

        if (segments.length === 0) {
          showStatus('⚠️ 未找到字幕数据。CapCut 请确认选的是 draft_content.json；当前文件格式可能不支持。（详情见浏览器控制台）', 'error');
          console.warn('[subtitle] 0 segments found. File extension:', fileExt, '| file size:', (f.size/1024/1024).toFixed(1)+'MB');
        } else {
          showStatus(`✅ 解析完成，共 ${segments.length} 条字幕。`, 'ok');
        }
      };

      // yield to UI thread for large files so the "loading" status renders first
      if (f.size > WARN_SIZE) {
        setTimeout(parse, 20);
      } else {
        parse();
      }
    };
    reader.readAsText(f, 'utf-8');
  };

  const fmt = (sec) => {
    const ms = Math.floor((sec % 1) * 1000);
    const s = Math.floor(sec) % 60;
    const m = Math.floor(sec / 60) % 60;
    const h = Math.floor(sec / 3600);
    const pad = (n, z=2)=> String(n).padStart(z,'0');
    return `${pad(h)}:${pad(m)}:${pad(s)},${pad(ms,3)}`;
  };

  // 辅助：安全文件名/去扩展名
  const sanitizeFilename = (s) => (s || '').replace(/[\\\/:*?"<>|]+/g, '_').trim();
  const basenameNoExt = (p) => {
    if (!p || typeof p !== 'string') return '';
    const base = p.split(/[\\\/]/).pop() || '';
    return base.replace(/\.[^.]+$/, '');
  };

  // 仅基于 material_name 推断默认导出名（去除 .mp3/.mp4）
  const guessBaseNameFromJson = (json) => {
    try {
      const data = typeof json === 'string' ? JSON.parse(json) : json;
      const stripMediaExt = (s) => (typeof s === 'string') ? s.replace(/\.(mp3|mp4)$/i, '') : '';
      const pick = (s) => sanitizeFilename(stripMediaExt(s).trim());

      if (typeof data?.material_name === 'string' && data.material_name.trim()) return pick(data.material_name);
      const videos = Array.isArray(data?.materials?.videos) ? data.materials.videos : [];
      for (const v of videos) {
        if (typeof v?.material_name === 'string' && v.material_name.trim()) return pick(v.material_name);
      }
      // BFS with depth limit to avoid hanging on huge files
      const MAX_DEPTH = 4;
      const q = [{ node: data, depth: 0 }];
      while (q.length) {
        const { node: cur, depth } = q.shift();
        if (!cur || typeof cur !== 'object' || depth > MAX_DEPTH) continue;
        if (typeof cur.material_name === 'string' && cur.material_name.trim()) return pick(cur.material_name);
        for (const k in cur) {
          const vv = cur[k];
          if (vv && typeof vv === 'object') q.push({ node: vv, depth: depth + 1 });
        }
      }
      return '';
    } catch { return ''; }
  };


  const toSrt = (segs) => segs.map((seg,i)=>`${i+1}\n${fmt(seg.start)} --> ${fmt(seg.end)}\n${seg.text.replace(/\\N/g, '\n')}\n`).join('\n');

  const toAss = (segs, previewMode = false) => {
    const eventsHeader = '[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n';
    
    const eventLines = segs.map(s => {
      if (s.isAss) {
        // For ASS segments, reconstruct the line from original parts
        const textWithEffects = (s.effects ? `{${s.effects}}` : '') + s.text;
        const dialogueParts = s.originalLine.split(',');
        dialogueParts[9] = textWithEffects; // Assuming Text is the 10th field (index 9)
        return dialogueParts.join(',');
      } else {
        // For SRT/TXT segments, create a new Dialogue line
        const start = fmt(s.start).replace(',', '.').slice(1, -1); // 0:00:00.00
        const end = fmt(s.end).replace(',', '.').slice(1, -1);
        const text = (s.effects ? `{${s.effects}}` : '') + s.text;
        const fields = [
          s.layer || 0, start, end, s.style || 'Default', s.name || '',
          s.marginL || '0', s.marginR || '0', s.marginV || '0', s.effect || '', text
        ];
        return `Dialogue: ${fields.join(',')}`;
      }
    }).join('\n');

    if (previewMode) {
      return `${eventsHeader}${eventLines}`;
    }

    const header = assHeader || '[Script Info]\nTitle: Converted by Sakamichi Tools\nScriptType: v4.00+\nPlayResX: 1920\nPlayResY: 1080\n\n';
    const styles = assStyles || '[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\nStyle: Default,Arial,78,&H00FFFFFF,&H000000FF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,2,2,2,10,10,10,1\n\n';
    return `${header}${styles}${eventsHeader}${eventLines}`;
  };

  const parseAssTimeToSeconds = (timeStr) => {
    const parts = timeStr.split(':');
    const h = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10);
    const s_ms = parts[2].split('.');
    const s = parseInt(s_ms[0], 10);
    const ms = parseInt(s_ms[1].padEnd(3, '0'), 10);
    return h * 3600 + m * 60 + s + ms / 1000;
  };

  const parseAssToSegments = (assContent) => {
    const lines = assContent.split(/\r?\n/);
    const segments = [];
    
    let headerLines = [], styleLines = [], eventLines = [];
    let currentSection = '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith('[Script Info]')) currentSection = 'info';
      else if (trimmed.startsWith('[V4+ Styles]')) currentSection = 'styles';
      else if (trimmed.startsWith('[Events]')) currentSection = 'events';

      if (currentSection === 'info') headerLines.push(line);
      else if (currentSection === 'styles') styleLines.push(line);
      else if (currentSection === 'events') eventLines.push(line);
      else headerLines.push(line);
    }
    
    assHeader = headerLines.join('\n') + '\n\n';
    assStyles = styleLines.join('\n') + '\n\n';

    for (const line of eventLines) {
      if (line.startsWith('Dialogue:')) {
        const parts = line.split(',');
        const startStr = parts[1];
        const endStr = parts[2];
        const textWithEffects = parts.slice(9).join(',');
        
        const effectMatch = textWithEffects.match(/^\{([^}]+)\}/);
        const effects = effectMatch ? effectMatch[1] : '';
        const text = textWithEffects.replace(/^\{[^}]+\}/, '');

        segments.push({
          start: parseAssTimeToSeconds(startStr),
          end: parseAssTimeToSeconds(endStr),
          text: text,
          effects: effects,
          isAss: true,
          originalLine: line,
        });
      }
    }
    return segments;
  };

  const parseSrtTimeToSeconds = (timeStr) => {
    const [h, m, s_ms] = timeStr.split(':');
    const [s, ms] = (s_ms || '0,0').replace('.',',').split(',');
    return (Number(h) || 0) * 3600 + (Number(m) || 0) * 60 + (Number(s) || 0) + (Number(ms) || 0) / 1000;
  };

  const parseSrtToSegments = (srtContent) => {
    const blocks = srtContent.trim().replace(/\r/g, '').split(/\n\n+/);
    const segments = [];

    for (const block of blocks) {
      const lines = block.split('\n');
      if (lines.length === 0) continue;

      let timeLineIndex = -1;
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes('-->')) {
          timeLineIndex = i;
          break;
        }
      }

      if (timeLineIndex === -1) continue;

      const timeLine = lines[timeLineIndex];
      const [startStr, endStr] = timeLine.split(' --> ');
      if (!startStr || !endStr) continue;

      const text = lines.slice(timeLineIndex + 1).join('\n').trim();
      if (!text) continue;

      try {
        const start = parseSrtTimeToSeconds(startStr.trim());
        const end = parseSrtTimeToSeconds(endStr.trim());
        
        if (isNaN(start) || isNaN(end)) continue;

        segments.push({
          start,
          end,
          text,
          effects: '', style: 'Default', name: '', marginL: '0', marginR: '0', marginV: '0', effect: '', layer: 0,
        });
      } catch (e) {
        console.error(`Skipping invalid SRT block: "${block}"`, e);
      }
    }
    return segments;
  };

  const parseTxtToSegments = (txtContent) => {
    const lines = txtContent.trim().split('\n');
    const segments = [];
    // 更宽松的时间戳匹配，允许中括号、允许缺省小时
    const timestampRegex = /\[?((\d{2}:)?\d{2}:\d{2}[,.]\d{3})\]?/;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      const match = line.match(timestampRegex);
      if (match) {
        let timeStr = match[1];
        // 补全小时部分
        if (timeStr.match(/^\d{2}:\d{2}[,.]/)) {
          timeStr = '00:' + timeStr;
        }
        const text = line.replace(timestampRegex, '').trim();
        const start = parseSrtTimeToSeconds(timeStr);
        
        let end = start + 2; // 默认时长
        // 寻找下一行的时间戳作为结束时间
        for (let j = i + 1; j < lines.length; j++) {
          const nextLineMatch = lines[j].trim().match(timestampRegex);
          if (nextLineMatch) {
            let nextTimeStr = nextLineMatch[1];
            if (nextTimeStr.match(/^\d{2}:\d{2}[,.]/)) {
              nextTimeStr = '00:' + nextTimeStr;
            }
            end = parseSrtTimeToSeconds(nextTimeStr);
            break;
          }
        }
        segments.push({ start, end, text, effects: '', style: 'Default', name: '', marginL: '0', marginR: '0', marginV: '0', effect: '', layer: 0 });
      }
    }
    return segments;
  };

  const parseJsonToSegments = (json) => {
    try {
      const data = typeof json === 'string' ? JSON.parse(json) : json;

      // 1) 通用模式：数组或 data.segments
      let arr = Array.isArray(data) ? data : (Array.isArray(data?.segments) ? data.segments : []);

      // 辅助：从任意结构中提取“纯文本”
      const extractText = (val) => {
        if (!val) return '';
        if (typeof val === 'string') {
          const s = val.trim();
          // 如果是 JSON 字符串，尝试解析后继续提取内部的 text
          if ((s.startsWith('{') && s.endsWith('}')) || (s.startsWith('[') && s.endsWith(']'))) {
            try { return extractText(JSON.parse(s)); } catch { return s; }
          }
          return s;
        }
        if (typeof val === 'object') {
          if (typeof val.text === 'string') return val.text;
          if (val.content) {
            if (typeof val.content === 'string') return extractText(val.content);
            if (typeof val.content.text === 'string') return val.content.text;
            if (Array.isArray(val.content.texts)) {
              return val.content.texts.map(t => (t && (t.text || ''))).join('');
            }
          }
          if (Array.isArray(val.texts)) return val.texts.map(t => (t && (t.text || ''))).join('');
          if (Array.isArray(val.rich_text)) return val.rich_text.map(t => (t && (t.text || ''))).join('');
          if (typeof val.name === 'string') return val.name;
        }
        return '';
      };

      // 2) CapCut 模式：从 tracks + materials 中提取
      const capcutExtract = () => {
        const results = [];
        const materialsMap = new Map();
        // 合并所有文本/字幕材料（用 || 会在 texts=[] 时误跳过 subtitles）
        const allTextMaterials = [
          ...(Array.isArray(data?.materials?.texts)    ? data.materials.texts    : []),
          ...(Array.isArray(data?.materials?.subtitles) ? data.materials.subtitles : []),
          ...(Array.isArray(data?.materials?.captions)  ? data.materials.captions  : []),
        ];
        for (const t of allTextMaterials) {
          const id = t.id || t.material_id || t.mid || t.materialId;
          const content = extractText(t);
          if (id) materialsMap.set(id, content);
        }
        console.debug('[subtitle] CapCut materialMap size:', materialsMap.size);

        const tracks = data?.tracks || data?.main_track || data?.editor_tracks || [];
        const trackList = Array.isArray(tracks) ? tracks : [];
        for (const track of trackList) {
          const segs = track?.segments || track?.clips || [];
          for (const seg of (Array.isArray(segs) ? segs : [])) {
            const matId = seg.material_id || seg.materialId || seg.target_material_id || seg.ref_material_id || seg.id;
            let text = (matId && materialsMap.get(matId)) || extractText(seg) || extractText(seg.content) || seg?.text || '';

            let start = null, end = null;
            const tr = seg.target_timerange || seg.target_time_range || seg.time_range || seg.timerange || seg.timeRange;
            if (tr && tr.start != null && tr.duration != null) {
              const st = Number(tr.start);
              const du = Number(tr.duration);
              if (!Number.isNaN(st) && !Number.isNaN(du)) {
                start = st / 1e6; // CapCut 常为微秒
                end = (st + du) / 1e6;
              }
            } else {
              const s = seg.start ?? seg.start_time ?? seg.startTime ?? seg.begin;
              const e = seg.end ?? seg.end_time ?? seg.endTime ?? seg.finish;
              if (s != null && e != null) {
                let st = Number(s), en = Number(e);
                if (!Number.isNaN(st) && !Number.isNaN(en)) {
                  // 粗略判断单位：优先微秒，其次毫秒，最后秒
                  if (st > 10000 || en > 10000) { st /= 1e6; en /= 1e6; }
                  else if (st > 1000 || en > 1000) { st /= 1000; en /= 1000; }
                  start = st; end = en;
                }
              }
            }

            if (text && start != null && end != null && end > start) {
              results.push({ start, end, text: String(text) });
            }
          }
        }
        results.sort((a,b)=> a.start - b.start || a.end - b.end);
        console.debug('[subtitle] CapCut extracted segments:', results.length);
        return results;
      };

      let mapped = [];
      if (arr.length) {
        mapped = arr.map((s) => {
          const start = s.start ?? s.startTime ?? s.begin ?? s.from ?? s.t0;
          const end = s.end ?? s.endTime ?? s.finish ?? s.to ?? s.t1;
          const text = (s.text ?? s.content ?? s.sentence ?? s.caption ?? '').toString();
          return { start, end, text };
        }).filter(s => s.start != null && s.end != null && String(s.text).trim().length > 0);
      } else {
        mapped = capcutExtract();
      }

      // 归一化单位（对通用模式）
      const norm = mapped.map(s => {
        let st = Number(s.start), en = Number(s.end);
        if (Array.isArray(data) || Array.isArray(data?.segments)) {
          // 对普通 JSON 的单位推断：
          // 如果 start/end 看起来像毫秒级整数时间戳 (e.g., > 10000), 则 /1000
          // Whisper 等工具使用秒为单位的浮点数，此逻辑不应影响它们
          if (Number.isInteger(st) && Number.isInteger(en) && (st > 10000 || en > 10000)) {
             st /= 1000; en /= 1000;
          }
        }
        return {
          start: st,
          end: en,
          text: String(s.text).replace(/\r?\n/g, ' ').trim(),
          effects: '', style: 'Default', name: '', marginL: '0', marginR: '0', marginV: '0', effect: '', layer: 0,
        };
      }).filter(s => !Number.isNaN(s.start) && !Number.isNaN(s.end) && s.end > s.start);

      norm.sort((a,b)=> a.start - b.start || a.end - b.end);
      return norm;
    } catch (e) {
      console.error('[subtitle] 解析 JSON 失败:', e);
      return [];
    }
  };

  const refreshSrcPreview = () => {
    if (currentTool === 'merge') {
      ui.previewSrc.value = toSrt(segments);
    } else if (currentTool === 'fad') {
      ui.previewFad.value = toAss(segments, true); // Enable preview mode
    }
  };
  const refreshMergedPreview = () => {
    ui.previewMerged.value = toSrt(mergedSegments);
  };
  
    // ===== 文本清理（删除语气词/标签 + 文本替换）=====
    const collectReplaceRows = () => {
      const rows = Array.from(ui.replaceRows?.querySelectorAll('.replace-row') || []);
      replaceRules = rows.map(row => {
        const from = row.querySelector('.replace-from')?.value ?? '';
        const to = row.querySelector('.replace-to')?.value ?? '';
        return { from: String(from), to: String(to) };
      }).filter(r => r.from);
    };
  
    const buildJaFillerRegex = (selected) => {
      // 已弃用：保留以兼容旧代码路径
      const list = Array.isArray(selected) ? selected.filter(Boolean) : [];
      if (list.length === 0) return null;
      const escaped = list.map(s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
      return new RegExp(`(${escaped.join('|')})`, 'g');
    };
  
    // 已按用户要求：不再进行标签/括注清理
    const stripCaptionTags = (text) => String(text ?? '');
  
    // ===== 上下文安全的语气词删除 =====
    
    //   const HIGH_RISK_STANDALONE_ONLY = new Set([
      const HIGH_RISK_STANDALONE_ONLY = new Set([
        'はい','そう','うん','あの','その','あのー','あのう','そのー', // 原有高风险
        'いや', 'すごい', 'すっご', 'こう', 'えっ', 'あれ', 'あー','えー' // 新增高风险
      ]);
      const LOW_RISK_EMBED_OK = new Set([
        'えっと','えーと','えーっと','んー','まー','なんか','まあ','イェ','イェー','じゃんじゃん', // 原有低风险
        'ははは', 'はは', 'へへ', 'ふふ', 'ええ', 'ああ', 'ふん', 'ふふん','あああ', 'うーん', 'そのね', 'あのね', 'ねえ', // 新增低风险
      ]);
      const ALL_FILLERS = new Set([...HIGH_RISK_STANDALONE_ONLY, ...LOW_RISK_EMBED_OK]);
      const PROTECTED_PHRASES = [
        'あの時','その時','この時','はいつも','すごく','すごいんだ','すっごい'
      ];
      const escapeRe = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  
    const removeStandaloneFillers = (segs, selected, opts = {}) => {
      const DEFAULT_GAP_MS = Number(opts.DEFAULT_GAP_MS ?? 200);
      const HIGH_RISK_GAP_MS = Number(opts.HIGH_RISK_GAP_MS ?? 100);
      const selectedSet = new Set(selected);
      const out = [];
      for (let i = 0; i < segs.length; i++) {
        const cur = segs[i];
        const prev = segs[i - 1];
        const next = segs[i + 1];
        const textTrim = String(cur.text || '').trim();
  
        let shouldDrop = false;
        if (selectedSet.has(textTrim)) {
          const gapPrev = prev ? Math.max(0, (cur.start - prev.end) * 1000) : Infinity;
          const gapNext = next ? Math.max(0, (next.start - cur.end) * 1000) : Infinity;
          const minGap = Math.min(gapPrev, gapNext);
          if (HIGH_RISK_STANDALONE_ONLY.has(textTrim)) {
            if (minGap >= HIGH_RISK_GAP_MS) shouldDrop = true;
          } else {
            if (minGap >= DEFAULT_GAP_MS) shouldDrop = true;
          }
        }
        if (!shouldDrop) out.push(cur);
      }
      return out;
    };
  
    const cleanEmbeddedFillers = (segs, selected) => {
      const selectedSet = new Set(selected);
      const protectedRe = PROTECTED_PHRASES.length ? new RegExp(PROTECTED_PHRASES.map(escapeRe).join('|')) : null;

      const resultSegs = [];
      for (const s of segs || []) {
        let newText = String(s.text || '');

        if (!protectedRe || !protectedRe.test(newText)) {
          let cleanedText = '';
          let currentIndex = 0;
          while (currentIndex < newText.length) {
            let foundFiller = false;
            for (const filler of selected) {
              if (newText.substring(currentIndex).startsWith(filler)) {
                if (LOW_RISK_EMBED_OK.has(filler)) {
                  currentIndex += filler.length;
                  foundFiller = true;
                  break;
                }
                if (HIGH_RISK_STANDALONE_ONLY.has(filler)) {
                  const nextText = newText.substring(currentIndex + filler.length).trimStart();
                  let followedByFiller = false;
                  for (const nextFiller of selected) {
                    if (nextText.startsWith(nextFiller)) {
                      followedByFiller = true;
                      break;
                    }
                  }
                  if (followedByFiller) {
                    currentIndex += filler.length;
                    foundFiller = true;
                    break;
                  }
                }
              }
            }
            if (!foundFiller) {
              cleanedText += newText[currentIndex];
              currentIndex++;
            }
          }
          newText = cleanedText;
        }
        
        newText = newText.replace(/\s{2,}/g, ' ').trim();

        if (newText.length > 0) {
          resultSegs.push({
            ...s, // Preserve all original fields
            text: newText,
          });
        }
      }
      return resultSegs;
    };
  
    const applyCleanup = (inputSegs) => {
      const selected = Array.from(document.querySelectorAll('.jp-filler:checked')).map(cb => cb.value);
      const selectedSet = new Set(selected);

      // New pre-filtering logic for pure filler lines
      const allFillersSorted = [...ALL_FILLERS].sort((a, b) => b.length - a.length);
      const preFilteredSegs = (inputSegs || []).filter(seg => {
        let tempText = seg.text.trim();
        if (!tempText) return true;

        // Create a regex to find any filler word
        const allFillersRegex = new RegExp(allFillersSorted.map(escapeRe).join('|'), 'g');
        
        // Scrape all known fillers from the string
        const remainingText = tempText.replace(allFillersRegex, '').replace(/[,、。.\s]/g, '');

        // If nothing remains, it's a pure filler line
        if (remainingText.length === 0) {
            // Now check if it contains at least one SELECTED filler
            const selectedFillersSorted = [...selectedSet].sort((a, b) => b.length - a.length);
            if (selectedFillersSorted.length > 0) {
                const selectedFillersRegex = new RegExp(selectedFillersSorted.map(escapeRe).join('|'));
                if (selectedFillersRegex.test(tempText)) {
                    return false; // Drop this segment entirely
                }
            }
        }
        return true; // Keep this segment
      });

      // 阶段一：独立行删除（高风险 100ms，其他 200ms）
      const after1 = removeStandaloneFillers(preFilteredSegs, selected, { DEFAULT_GAP_MS: 200, HIGH_RISK_GAP_MS: 100 });
      // 阶段二：句内低风险清理（带边界+保护短语）
      let cleaned = cleanEmbeddedFillers(after1, selected);
      // 文本替换规则（保持原有逻辑）
      const applyRules = (t) => {
        let out = t;
        replaceRules.forEach(({ from, to }) => {
          if (!from) return;
          const re = new RegExp(from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
          out = out.replace(re, to);
        });
        return out;
      };
      cleaned = cleaned.map(s => ({ ...s, text: applyRules(s.text) })).filter(s => s.text && s.text.trim());
      return cleaned;
    };
  
    const recomputeCleanedPreview = () => {
      collectReplaceRows();
      const cleaned = applyCleanup(segments);
      ui.previewSrc.value = toSrt(cleaned);
      // 若用户已执行过合并，则基于清理后的文本重新合并以便右侧预览也更新
      if (mergedSegments && mergedSegments.length) {
        const baseGap = Number(ui.gap.value || 500);
        const dynamicEnable = !!ui.dynamicThresholdEnable.checked;
        const dynamicCount = Number(ui.dynamicWordCount.value || 2);
        const dynamicMs = Number(ui.dynamicThreshold.value || 800);
        const maxLen = Number(ui.len.value || 36);
        mergedSegments = mergeSegments(cleaned, baseGap, dynamicEnable, dynamicCount, dynamicMs, maxLen, currentMergeMode);
        refreshMergedPreview();
      }
    };
  
    const getCleanedSegments = () => {
      collectReplaceRows();
      return applyCleanup(segments);
    };
  
    // ===== 语气词全选与分组折叠逻辑 =====
    const getAllFillerCheckboxes = () => Array.from(document.querySelectorAll('input.jp-filler'));
    const getGroupCheckboxes = (group) => {
      const panel = document.getElementById(`panel-${group}`);
      return panel ? Array.from(panel.querySelectorAll('input.jp-filler')) : [];
    };
    const updateGroupCount = (group) => {
      const boxes = getGroupCheckboxes(group);
      const checked = boxes.filter(b => b.checked).length;
      const allChecked = checked === boxes.length;
      const cntEl = document.getElementById(`count-${group}`);
      if (cntEl) cntEl.textContent = `${checked}/${boxes.length}`;

      const toggleBtn = document.querySelector(`.group-toggle-select[data-group="${group}"]`);
      if (toggleBtn) {
        if (allChecked) {
          toggleBtn.classList.add('bg-violet-600', 'text-white');
          toggleBtn.classList.remove('bg-gray-100');
        } else {
          toggleBtn.classList.remove('bg-violet-600', 'text-white');
          toggleBtn.classList.add('bg-gray-100');
        }
      }
    };
    const updateAllCounts = () => ['fill','laugh','kou','emph'].forEach(updateGroupCount);
  
    // 统一：将每个语气词 label 的可见文字与 input 的 value 保持一致
    const normalizeFillerLabels = () => {
      const inputs = Array.from(document.querySelectorAll('input.jp-filler'));
      inputs.forEach(input => {
        const label = input.closest('label');
        if (!label) return;
        // label 结构为: <label> <input .../> 文本 </label>
        // 获取除 input 外的文本节点，重写为 value
        // 简化处理：直接重置为 "<input/> 空格 + value"
        const val = String(input.value || '').trim();
        // 保留 input 元素，重建文本
        // 找到 input 之后的所有节点，移除并追加规范文本
        const nodes = Array.from(label.childNodes);
        nodes.forEach(n => {
          if (n !== input) label.removeChild(n);
        });
        label.appendChild(document.createTextNode(` ${val}`));
      });
    };
  
    // 全选按钮（标题右侧）
    document.getElementById('btn-filler-select-all')?.addEventListener('click', () => {
      const all = getAllFillerCheckboxes();
      if (!all.length) return;
      const allChecked = all.every(cb => cb.checked);
      all.forEach(cb => { cb.checked = !allChecked; });
      updateAllCounts();
      recomputeCleanedPreview();
    });
  
    // 分组“选择/取消”与“展开”按钮
    document.addEventListener('click', (e) => {
      const toggleBtn = e.target.closest && e.target.closest('.group-toggle-select');
      if (toggleBtn) {
        const group = toggleBtn.getAttribute('data-group');
        const boxes = getGroupCheckboxes(group);
        if (boxes.length) {
          const allChecked = boxes.every(cb => cb.checked);
          boxes.forEach(cb => { cb.checked = !allChecked; });
          updateGroupCount(group);
          recomputeCleanedPreview();
        }
        return;
      }
      const expandBtn = e.target.closest && e.target.closest('.group-expand');
      if (expandBtn) {
        const group = expandBtn.getAttribute('data-group');
        const panel = document.getElementById(`panel-${group}`);
        if (panel) panel.classList.toggle('hidden');
        return;
      }
    });
  
    // 单个语气词勾选变更时，立刻刷新预览并更新计数
    document.addEventListener('change', (e) => {
      const t = e.target;
      if (t && t.classList && t.classList.contains('jp-filler')) {
        // 更新所属分组计数
        const groups = ['fill','laugh','kou','emph'];
        for (const g of groups) updateGroupCount(g);
        recomputeCleanedPreview();
      }
    });
  
    // 初始执行一次，确保任何手动修改后也能对齐显示
    normalizeFillerLabels();
    updateAllCounts();

  const download = (content, name) => {
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    URL.revokeObjectURL(a.href);
    a.remove();
  };

  // 绑定事件
  let currentBaseName = 'subtitle';
  ui.file?.addEventListener('change', (e)=>{
    const f = e.target.files && e.target.files[0];
    handleFile(f);
    e.target.value = '';
  });

  if (ui.dropZone) {
    ui.dropZone.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.stopPropagation();
      ui.dropZone.classList.add('bg-violet-50');
    });

    ui.dropZone.addEventListener('drop', (e) => {
      e.preventDefault();
      e.stopPropagation();
      
      ui.dropZone.classList.remove('bg-violet-50');

      const files = e.dataTransfer.files;
      if (files.length) {
        handleFile(files[0]);
      }
    });

    ui.dropZone.addEventListener('dragenter', (e) => {
      e.preventDefault();
      e.stopPropagation();
      ui.dropZone.classList.add('bg-violet-50');
    });

    ui.dropZone.addEventListener('dragleave', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.target === ui.dropZone) {
        ui.dropZone.classList.remove('bg-violet-50');
      }
    });
  }

  const updateLabels = () => {
    ui.gapLabel.textContent = `${ui.gap.value}ms`;
    ui.lenLabel.textContent = ui.len.value;
  };
  ui.gap?.addEventListener('input', updateLabels);
  ui.len?.addEventListener('input', updateLabels);
  document.querySelectorAll('[data-preset]')?.forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const v = btn.getAttribute('data-preset');
      ui.gap.value = v;
      updateLabels();
    });
  });

  ui.btnMerge?.addEventListener('click', ()=>{
    const baseGap = Number(ui.gap.value || 500);
    const dynamicEnable = !!ui.dynamicThresholdEnable.checked;
    const dynamicCount = Number(ui.dynamicWordCount.value || 2);
    const dynamicMs = Number(ui.dynamicThreshold.value || 800);
    const maxLen = Number(ui.len.value || 36);

    // 合并前做一次清理，使语气词/标签删除与替换在合并结果中生效
    collectReplaceRows();
    const cleaned = applyCleanup(segments);
    // Use the merge function from the external merger logic
    if (window.MERGER_LOGIC && typeof window.MERGER_LOGIC.mergeSegments === 'function') {
      mergedSegments = window.MERGER_LOGIC.mergeSegments(cleaned, baseGap, dynamicEnable, dynamicCount, dynamicMs, maxLen, currentMergeMode);
    } else {
      console.error('Merger logic not found. Make sure subtitle-merger.js is loaded.');
      mergedSegments = cleaned; // Fallback to cleaned segments
    }
    refreshMergedPreview();
  });

  // 文本替换：添加一行（放在全局，页面加载后即可使用）
  const addReplaceRow = (fromVal = '', toVal = '') => {
    const container = ui.replaceRows;
    if (!container) return;
    const row = document.createElement('div');
    row.className = 'replace-row flex items-center gap-2';
    row.innerHTML = `
      <span class="text-sm text-gray-600">将</span>
      <input class="replace-from flex-1 p-2 border rounded text-sm" placeholder="原文本" value="${fromVal.replace(/&/g,'&').replace(/"/g,'"')}">
      <span class="text-sm text-gray-600">替换为</span>
      <input class="replace-to flex-1 p-2 border rounded text-sm" placeholder="新文本" value="${toVal.replace(/&/g,'&').replace(/"/g,'"')}">
      <button class="replace-remove px-2 py-1 text-xs bg-gray-200 text-gray-700 rounded hover:bg-gray-300" title="删除此行">✕</button>
    `;
    row.querySelector('.replace-remove').addEventListener('click', ()=> row.remove());
    container.appendChild(row);
  };
  ui.replaceAdd?.addEventListener('click', ()=> addReplaceRow());

  // 文本替换：应用按钮 -> 刷新合并前预览
  ui.replaceApply?.addEventListener('click', ()=>{
    recomputeCleanedPreview();
    const btn = ui.replaceApply;
    if (!btn) return;
    const originalText = btn.textContent;
    btn.textContent = '✓ 应用成功';
    btn.classList.remove('bg-gray-600', 'hover:bg-gray-700');
    btn.classList.add('bg-green-500', 'hover:bg-green-600');
    setTimeout(() => {
      btn.textContent = originalText;
      btn.classList.remove('bg-green-500', 'hover:bg-green-600');
      btn.classList.add('bg-gray-600', 'hover:bg-gray-700');
    }, 1500);
  });

  // 绑定导出按钮（快速导出与合并导出）
  const quickBase = () => (ui.quickName?.value?.trim() || currentBaseName || 'subtitle');

  const donateModal = document.getElementById('donate-modal');
  const closeDonateModal = document.getElementById('close-donate-modal');

  ui.donateBtn?.addEventListener('click', () => {
    donateModal?.classList.remove('hidden');
    donateModal?.classList.add('flex');
  });

  closeDonateModal?.addEventListener('click', () => {
    donateModal?.classList.add('hidden');
    donateModal?.classList.remove('flex');
  });

  const bind = (el, builder, baseFn) => {
    if (!el) return;
    el.addEventListener('click', ()=>{
      const base = (baseFn ? baseFn() : (currentBaseName || 'subtitle'));
      const { content, ext } = builder();
      download(content, `${base}.${ext}`);
    });
  };

  // 快速导出：始终导出原始
  bind(ui.quickSrt,   ()=> ({ content: toSrt(segments), ext: 'srt' }), quickBase);
  bind(ui.quickAss,   ()=> ({ content: toAss(segments), ext: 'ass' }), quickBase);
  bind(ui.quickTxtTs, ()=> ({ content: toSrt(segments), ext: 'txt' }), quickBase);
  bind(ui.quickTxt,   ()=> ({ content: segments.map(s=>s.text).join('\n'), ext: 'txt' }), quickBase);
  // 合并导出：优先导出合并结果
  bind(ui.mergeSrt,   ()=> ({ content: toSrt(mergedSegments.length ? mergedSegments : segments), ext: 'srt' }));
  bind(ui.mergeTxtTs, ()=> ({ content: toSrt(mergedSegments.length ? mergedSegments : segments), ext: 'txt' }));
  bind(ui.mergeTxt,   ()=> ({ content: (mergedSegments.length ? mergedSegments : segments).map(s=>s.text).join('\n'), ext: 'txt' }));

  // FAD 工具事件
  const applyFadEffects = (fadeIn, fadeOut) => {
    const fadTag = `\\fad(${fadeIn},${fadeOut})`;
    segments.forEach(s => {
      let effects = s.effects || '';
      effects = effects.replace(/\\fad\([^)]+\)/g, '').replace(/\\fade\([^)]+\)/g, '').trim();
      s.effects = (effects ? `${effects}${fadTag}` : fadTag).replace(/\\\\/g, '\\');
    });
  };

  const clearFadEffects = () => {
    segments.forEach(s => {
      s.effects = (s.effects || '').replace(/\\fad\([^)]+\)/g, '').replace(/\\fade\([^)]+\)/g, '').trim();
    });
  };

  ui.btnApplyFad?.addEventListener('click', () => {
    const fadeIn = parseInt(ui.fadInDuration.value, 10) || 0;
    const fadeOut = parseInt(ui.fadeOutDuration.value, 10) || 0;
    if (fadeIn > 0 || fadeOut > 0) {
      applyFadEffects(fadeIn, fadeOut);
    }
    refreshSrcPreview();
  });

  ui.btnClearFad?.addEventListener('click', () => {
    clearFadEffects();
    refreshSrcPreview();
  });

  ui.btnExportFadAss?.addEventListener('click', () => {
    const fadeIn = parseInt(ui.fadInDuration.value, 10) || 0;
    const fadeOut = parseInt(ui.fadeOutDuration.value, 10) || 0;
    if (fadeIn > 0 || fadeOut > 0) {
      applyFadEffects(fadeIn, fadeOut);
    }
    const content = toAss(segments);
    const base = quickBase();
    download(content, `${base}.ass`);
  });


  const updatePresetButtonUI = (activePreset) => {
    const presets = ['live', 'interview', 'radio'];
    presets.forEach(p => {
      const btn = ui[`preset${p.charAt(0).toUpperCase() + p.slice(1)}`];
      if (btn) {
        if (p === activePreset) {
          btn.classList.add('bg-violet-600', 'text-white', 'border-violet-600');
          btn.classList.remove('bg-white', 'border-gray-300', 'hover:bg-gray-100');
        } else {
          btn.classList.remove('bg-violet-600', 'text-white', 'border-violet-600');
          btn.classList.add('bg-white', 'border-gray-300', 'hover:bg-gray-100');
        }
      }
    });
  };

  const applyPreset = (settings, presetName) => {
    currentMergeMode = presetName || 'radio'; // Set the merge mode, default to 'radio'
    ui.gap.value = settings.gap;
    ui.len.value = settings.len;
    ui.dynamicThresholdEnable.checked = settings.dynamicThresholdEnable;
    ui.dynamicWordCount.value = settings.dynamicWordCount;
    ui.dynamicThreshold.value = settings.dynamicThreshold;
    
    const allFillers = getAllFillerCheckboxes();
    allFillers.forEach(cb => {
      const isLowRisk = LOW_RISK_EMBED_OK.has(cb.value);
      if (settings.fillers === 'all') {
        cb.checked = true;
      } else if (settings.fillers === 'low') {
        cb.checked = isLowRisk;
      } else {
        cb.checked = false;
      }
    });

    updateLabels();
    updateAllCounts();
    recomputeCleanedPreview();
    updatePresetButtonUI(presetName);
  };

  ui.presetLive?.addEventListener('click', () => {
    applyPreset({ gap: 600, len: 20, dynamicThresholdEnable: true, dynamicWordCount: 6, dynamicThreshold: 1200, fillers: 'all' }, 'live');
  });

  ui.presetInterview?.addEventListener('click', () => {
    applyPreset({ gap: 250, len: 26, dynamicThresholdEnable: true, dynamicWordCount: 2, dynamicThreshold: 500, fillers: 'low' }, 'interview');
  });

  ui.presetRadio?.addEventListener('click', () => {
    applyPreset({ gap: 350, len: 20, dynamicThresholdEnable: true, dynamicWordCount: 2, dynamicThreshold: 600, fillers: 'low' }, 'radio');
  });

  ui.resetSettings?.addEventListener('click', () => {
    applyPreset(defaultSettings, null);
  });

  const settingsControls = [ui.gap, ui.len, ui.dynamicThresholdEnable, ui.dynamicWordCount, ui.dynamicThreshold];
  settingsControls.forEach(control => {
    control?.addEventListener('input', () => {
      updatePresetButtonUI(null);
      updateLabels();
    });
  });
  root.addEventListener('change', (e) => {
    if (e.target && e.target.classList.contains('jp-filler')) {
      updatePresetButtonUI(null);
    }
  });

  updateLabels();
  };

  document.addEventListener('astro:page-load', initSubtitleTool);

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initSubtitleTool, { once: true });
  } else {
    initSubtitleTool();
  }
})();
