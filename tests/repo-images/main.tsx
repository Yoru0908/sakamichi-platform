import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import ChatEditor from '../../src/components/repo/ChatEditor';
import Meguri from '../../src/components/repo/templates/MeguriTemplate';
import Line from '../../src/components/repo/templates/LineTemplate';
import Oshi from '../../src/components/repo/templates/OshiColorTemplate';
import { groupImageMessages } from '../../src/components/repo/image-layout';
import { exportRepoElementAsPng } from '../../src/utils/repo-image-export';
import type { Message, RepoData } from '../../src/types/repo';
import '../repo-export/styles.css';
const canvas = document.createElement('canvas'); canvas.width = 80; canvas.height = 160;
const ctx = canvas.getContext('2d')!;
['#ff0000', '#00ff00', '#0000ff', '#ff00ff'].forEach((color, i) => { ctx.fillStyle = color; ctx.fillRect(i % 2 * 40, Math.floor(i / 2) * 80, 40, 80); });
const photo = canvas.toDataURL();
const initial: Message[] = [
  { id: 'one', speaker: 'narration', text: '第一张', imageUrl: photo },
  { id: 'two', speaker: 'narration', text: '第二张', imageUrl: photo },
  { id: 'three', speaker: 'narration', text: '第三张', imageUrl: photo },
  { id: 'talk', speaker: 'member', text: 'ありがとう！' },
];
function App() {
  const [messages, setMessages] = useState(initial);
  const [template, setTemplate] = useState(0);
  const Template = [Meguri, Line, Oshi][template];
  const data: RepoData = { memberId: 'test', memberName: 'Fixture', groupId: 'sakurazaka', groupName: '櫻坂46', memberImageUrl: photo, eventDate: '2026/9/15', eventType: 'ミーグリ', slotNumber: 1, ticketCount: 1, messages, tags: [] };
  return <>
    <ChatEditor messages={messages} onChange={setMessages} memberName="Fixture" groupColor="#f19db5" />
    <button id="reload" onClick={() => setMessages(JSON.parse(JSON.stringify(messages)))}>JSON reload</button>
    <select id="template" value={template} onChange={e => setTemplate(Number(e.target.value))}>{[0,1,2].map(i => <option key={i}>{i}</option>)}</select>
    <button id="export" onClick={() => exportRepoElementAsPng(document.getElementById('capture')!, 'images.png')}>Export</button>
    <pre id="state">{JSON.stringify(messages)}</pre>
    <pre id="groups">{JSON.stringify(groupImageMessages(messages).map(row => row.map(m => m.id)))}</pre>
    <div id="capture" style={{ width: 380 }}><Template data={data} /></div>
  </>;
}
createRoot(document.getElementById('root')!).render(<App />);
