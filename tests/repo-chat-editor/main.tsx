import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import ChatEditor from '../../src/components/repo/ChatEditor';
import type { Message } from '../../src/types/repo';

function Fixture() {
  const [messages, setMessages] = useState<Message[]>(location.search.includes('long')
    ? Array.from({ length: 30 }, (_, index) => ({ id: `long_${index}`, speaker: 'me', text: `Message ${index}` }))
    : [
    { id: 'me', speaker: 'me', text: '今回のツアね' },
    { id: 'member', speaker: 'member', text: 'ありがとう' },
    { id: 'narration', speaker: 'narration', text: '笑顔で' },
    { id: 'image', speaker: 'narration', text: '写真', imageUrl: 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7' },
  ]);
  return <>
    <style>{`[data-chat-message-list] { max-height: 260px; overflow-y: auto; } [data-message-id] { min-height: 90px; }`}</style>
    <ChatEditor messages={messages} onChange={setMessages} memberName="山川宇衣" groupColor="#F19DB5" />
    <button id="outside">Outside editor</button>
    <output id="state">{JSON.stringify(messages)}</output>
  </>;
}
createRoot(document.getElementById('root')!).render(<Fixture />);
