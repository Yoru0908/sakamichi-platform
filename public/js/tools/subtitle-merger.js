// subtitle-merger.js

// This script should be loaded before the main subtitle.js

const MERGER_LOGIC = (() => {
  'use strict';

  // 合并逻辑中用到的常量
  const SENTENCE_START_CONNECTORS = [
    'だから', 'それで', 'そこで', 'すると', 'そしたら', 'そして', 'それから',
    'でも', 'しかし', 'それでも', 'それなのに', 'それに', 'あと', 'また',
    'さらに', 'ところで', 'じゃあ', 'じゃ', 'では', 'それでは', 'それじゃあ',
    'つまり', '例えば', 'ちなみに', 'または', 'それとも'
  ];
  const POLITE_FORMS = ['です', 'ます', 'ました', 'でした'];
  const SENTENCE_END_CONNECTORS = {
    strong: ['から', 'ので', 'けど', 'けれど', 'けれども'],
    weak: ['が', 'のに', 'し', 'たら', 'なら', 'ば', 'れば', 'と', 'て', 'で', '時に'],
    taiGen: ['の', 'こと', 'もの', 'ところ', 'ため', 'よう', 'という', 'って', 'とか']
  };
  const SENTENCE_BREAK_WORDS = ['ね', 'よ', 'かな'];
  const COMMON_AHOLE_WORDS = new Set(['うん', 'はい', 'ええ', 'そう']);
  const GREETING_WORDS = new Set(['こんにちは', 'こんばんは']);
  const STANDALONE_RESPONSE_WORDS = new Set(['いや']);
  const CONSECUTIVE_BREAK_PHRASES = new Set(['ありがとうございます', 'こんにちは', 'こんばんは']);

  const calculateMergeScore = (prev, nxt, maxLen, mode, gapMs) => {
    const prevText = prev.text.trim();
    const nxtText = nxt.text.trim();

    // --- Highest Priority Rules ---
    // Rule: Force merge if next is just "です" (all modes)
    if (nxtText === 'です') {
        return 100;
    }
    // Rule: Force break in live mode if next starts with "です" but isn't just "です"
    if (mode === 'live' && nxtText.startsWith('です') && nxtText !== 'です') {
        return -100;
    }

    let score = 0;
    const combinedLength = (prev.text + ' ' + nxt.text).replace(/\s/g, '').length;
    const prevDuration = (prev.end - prev.start) * 1000;
    const nxtDuration = (nxt.end - nxt.start) * 1000;
    const IDEAL_SHORT_DURATION = 2000;
    const durationDecay = (baseScore) => Math.max(0, baseScore * (1 - prevDuration / IDEAL_SHORT_DURATION));

    // --- Mode-Specific High-Priority Rules ---
    if (mode === 'radio') { // Default mode is 'radio'
        if (prevText === nxtText && CONSECUTIVE_BREAK_PHRASES.has(prevText)) {
            return -100; // Radio/Default: Strictly break on consecutive phrases
        }
    }

    // --- Common Negative Scoring (with mode adjustments) ---
    let baseNegativeScore = 50;

    // Rule: Standalone response words (e.g., いや)
    if (STANDALONE_RESPONSE_WORDS.has(nxtText)) {
        if (mode === 'interview' && gapMs <= 200) {
            // Interview mode: exempt if gap is small, do nothing
        } else {
            // Live and Radio/Default apply penalty. Radio gets a higher penalty.
            score -= (mode === 'radio') ? 75 : baseNegativeScore;
        }
    }

    // Rule: Starts with a sentence connector
    if (SENTENCE_START_CONNECTORS.some(c => nxtText.startsWith(c))) {
        score -= baseNegativeScore;
    }

    // Rule: Previous sentence ends with polite form
    let politeFormPenalty = 25;
    if (mode === 'live') {
        politeFormPenalty = 10; // Live mode: reduce penalty
    }
    if (POLITE_FORMS.some(pf => prevText.endsWith(pf))) {
        score -= politeFormPenalty;
    }

    // Rule: Previous sentence ends with a break word
    if (SENTENCE_BREAK_WORDS.some(bw => prevText.endsWith(bw))) {
        score -= 15;
    }

    // --- Common Positive Scoring (with mode adjustments) ---
    let connected = false;
    let strongConnectorBonus = 20;
    let weakConnectorBonus = 5;
    let incompleteSentenceBonus = 30;

    if (mode === 'live') {
        strongConnectorBonus = 30; // Live mode: encourage merging
        incompleteSentenceBonus = 40;
    }

    // Rule: Ends with strong/weak connectors
    if (combinedLength < maxLen - 5) {
        for (const word of SENTENCE_END_CONNECTORS.strong) {
            if (prevText.endsWith(word)) {
                score += durationDecay(strongConnectorBonus);
                connected = true;
                break;
            }
        }
    }
    if (!connected) {
        for (const word of SENTENCE_END_CONNECTORS.taiGen) {
            if (prevText.endsWith(word)) {
                score += durationDecay(strongConnectorBonus);
                connected = true;
                break;
            }
        }
    }
    if (!connected && (combinedLength < maxLen - 5)) {
        for (const word of SENTENCE_END_CONNECTORS.weak) {
            if (prevText.endsWith(word)) {
                score += durationDecay(weakConnectorBonus);
                connected = true;
                break;
            }
        }
    }

    // Rule: Incomplete sentence structure
    if (!connected && !POLITE_FORMS.some(pf => prevText.endsWith(pf)) && !SENTENCE_BREAK_WORDS.some(bw => prevText.endsWith(bw))) {
        score += incompleteSentenceBonus;
    }

    // Rule: Next sentence is polite and short
    if (POLITE_FORMS.some(pf => nxtText.endsWith(pf)) && nxtDuration <= IDEAL_SHORT_DURATION) {
        score += 15;
    }
    
    // Rule: Previous sentence is a short affirmation
    if (prev.text.replace(/\s/g, '').length <= 3 && COMMON_AHOLE_WORDS.has(prevText)) {
        score += 15;
    }

    // --- Final Length Penalty ---
    score -= (combinedLength - maxLen) * 3;

    return score;
  };

  const mergeSegments = (segs, baseGapMs, dynamicEnable, dynamicCount, dynamicMs, maxLen, mode = 'radio') => {
    const out = [];
    if (segs.length === 0) return out;

    let cur = { ...segs[0] };

    for (let i = 1; i < segs.length; i++) {
      const prev = cur;
      const nxt = segs[i];
      const gapMs = Math.max(0, (nxt.start - prev.end) * 1000);
      const combinedLength = (prev.text + ' ' + nxt.text).replace(/\s/g, '').length;
      
      const score = calculateMergeScore(prev, nxt, maxLen, mode, gapMs);
      const dynamicGap = Math.min(baseGapMs + score * 20, 1500);

      let shouldMerge = false;

      if (gapMs <= dynamicGap) {
        if (combinedLength <= maxLen) {
          shouldMerge = true;
        } else {
          if (score > 15 && combinedLength <= maxLen + 10) { // Break length limit threshold
            shouldMerge = true;
          }
        }
      }

      if (shouldMerge) {
        const nxtText = nxt.text.trim();
        let mergedText;
        
        // Special "です" move logic for radio and interview modes
        if ((mode === 'radio' || mode === 'interview') && nxtText.startsWith('です') && nxtText !== 'です') {
            mergedText = `${prev.text}です ${nxtText.substring(2).trim()}`.trim();
        } else {
            mergedText = `${prev.text} ${nxt.text}`.trim();
        }

        cur = {
          start: prev.start,
          end: Math.max(prev.end, nxt.end),
          text: mergedText,
        };
      } else {
        // Not merging, but check for special reconstruction case in live mode
        const nxtText = nxt.text.trim();
        if (mode === 'live' && nxtText.startsWith('です') && nxtText !== 'です') {
            // Reconstruct text without merging timestamps
            prev.text = `${prev.text}です`.trim();
            out.push(prev);
            cur = { ...nxt, text: nxtText.substring(2).trim() };
        } else {
            // Default behavior: push previous segment and move to the next one
            out.push(prev);
            cur = { ...nxt };
        }
      }
    }
    out.push(cur);
    return out;
  };

  // Expose the main function
  return {
    mergeSegments: mergeSegments
  };

})();
