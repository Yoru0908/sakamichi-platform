import { useState, type CSSProperties } from 'react';
import type { Message } from '@/types/repo';
import { proxyImageUrl } from '@/utils/proxy-image';
import NarrationText from './NarrationText';

function Photo({ source, paired }: { source: string; paired: boolean }) {
  const [landscape, setLandscape] = useState(false);
  return <img data-repo-inline-photo src={proxyImageUrl(source) ?? source} alt=""
    onLoad={event => setLandscape(event.currentTarget.naturalWidth > event.currentTarget.naturalHeight)}
    className="rounded-lg object-contain mx-auto"
    style={{ display: 'block', maxWidth: '100%', maxHeight: paired ? 160 : landscape ? 240 : 112, width: landscape || paired ? '100%' : 'auto', height: 'auto' }} />;
}

export default function NarrationRow({ messages, textClassName, textStyle }: {
  messages: Message[]; textClassName: string; textStyle?: CSSProperties;
}) {
  const paired = messages.length === 2;
  const contents = messages.map(message => <div key={message.id} className="text-center space-y-1.5" style={{ minWidth: 0 }}>
    {message.imageUrl && <Photo key={message.imageUrl} source={message.imageUrl} paired={paired} />}
    {message.text && <NarrationText text={message.text} color={message.narrationColor} className={textClassName} style={textStyle} />}
  </div>);
  return paired ? <div data-repo-image-pair style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', alignItems: 'start', gap: 8 }}>{contents}</div> : contents[0];
}
