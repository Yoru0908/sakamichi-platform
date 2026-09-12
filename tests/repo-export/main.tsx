import React from 'react';
import { createRoot } from 'react-dom/client';
import Meguri from '../../src/components/repo/templates/MeguriTemplate';
import Line from '../../src/components/repo/templates/LineTemplate';
import Oshi from '../../src/components/repo/templates/OshiColorTemplate';
// @ts-ignore test-only virtual module supplied by the regression runner
import LegacyMeguri from 'virtual:baseline-MeguriTemplate';
// @ts-ignore test-only virtual module supplied by the regression runner
import LegacyLine from 'virtual:baseline-LineTemplate';
// @ts-ignore test-only virtual module supplied by the regression runner
import LegacyOshi from 'virtual:baseline-OshiColorTemplate';
import { exportRepoElementAsPng } from '../../src/utils/repo-image-export';
import { withNarrationColor } from '../../src/components/repo/narration-color';
import type { Message, RepoData } from '../../src/types/repo';
import '../../src/styles/global.css';

const params = new URLSearchParams(location.search);
const color = params.get('color') || undefined;
const canvas = document.createElement('canvas');
canvas.width = canvas.height = 32;
const context = canvas.getContext('2d')!;
context.fillStyle = '#ff00ff'; context.fillRect(0, 0, 32, 32);
const image = canvas.toDataURL();
const messages: Message[] = Array.from({ length: color ? 48 : 8 }, (_, index) => ({
  id: String(index), speaker: index % 3 === 0 ? 'narration' : index % 3 === 1 ? 'me' : 'member',
  text: index % 3 === 0 ? `${index} 笑顔で手を振ってくれました\n第二行の説明 😊 ${color ? '長い旁白を途中で切らない。'.repeat(5) : ''}` : `${index} ありがとう！\n続きの会話もそのまま表示します。`,
  ...(index === 6 ? { imageUrl: image } : {}),
}));
if (color) messages[messages.length - 1] = { id: 'last', speaker: 'narration', text: 'END 最後の旁白\n' + 'UNBROKEN'.repeat(24) };
const data: RepoData = {
  memberId: 'fixture', memberName: 'Export Fixture', groupId: 'sakurazaka', groupName: '櫻坂46', memberImageUrl: image,
  userAvatar: image, eventDate: '2026/9/11', eventType: 'ミーグリ', slotNumber: 1, ticketCount: 10, nickname: 'テスト',
  messages: withNarrationColor(messages, color), tags: [],
};
const templates = params.has('legacy') ? [LegacyMeguri, LegacyLine, LegacyOshi] : [Meguri, Line, Oshi];
const Template = templates[Number(params.get('template') || 0)];
createRoot(document.getElementById('root')!).render(<>
  <button id="export" onClick={() => exportRepoElementAsPng(document.getElementById('capture')!, 'fixture.png')}>Export</button>
  <div id="capture" style={{ width: 380 }}>
    <Template data={data} />
    <div data-end-marker style={{ width: 380, height: 4, backgroundColor: '#00ffff' }} />
  </div>
</>);
