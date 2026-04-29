import { useState, useEffect, useRef, useCallback } from 'react';
import { useStore } from '@nanostores/react';
import { Plus, Trash2, Download, Image as ImageIcon, MessageSquare, Star, GripVertical, X } from 'lucide-react';
import {
  getGroupColor, getR2AvatarUrl, getOptimizedAvatarUrl, getHeaderStyle,
  GROUP_CONFIG, sortedGenEntries, fetchMemberData, deduplicateMembers,
  type MemberInfo,
} from './msg-styles';
import { $favorites, toggleFavorite, isFavorite, enrichFavorites } from '@/stores/favorites';
import { pickItemsInFavoriteOrder } from '@/utils/favorite-order';

// ── Types ──
interface ChatBox {
  id: number;
  name: string;
  time: string;
  body: string;
  isImageChat: boolean;
  imageDataUrl?: string;
}

// ── Helpers ──
function nowTimeStr(): string {
  return new Date().toLocaleString('zh-Hant', {
    month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
  });
}

// ── Canvas 2D helpers for export ──
function drawRoundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}

function wrapTextLines(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const lines: string[] = [];
  for (const para of text.split('\n')) {
    if (!para) { lines.push(''); continue; }
    let line = '';
    for (const char of para) {
      const test = line + char;
      if (ctx.measureText(test).width > maxWidth && line) {
        lines.push(line);
        line = char;
      } else {
        line = test;
      }
    }
    if (line) lines.push(line);
  }
  return lines;
}

async function imageToDataUrl(url: string): Promise<string> {
  try {
    // Route through api.46log.com proxy to avoid WAF challenge on media.46log.com
    const proxyUrl = url.replace('https://media.46log.com/', 'https://api.46log.com/api/media/');
    const res = await fetch(proxyUrl, { mode: 'cors' });
    const blob = await res.blob();
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch {
    return url;
  }
}

// ── Member Sidebar ──
function MemberSidebar({
  members,
  activeGroup,
  onSelectMember,
  onChangeGroup,
}: {
  members: MemberInfo[];
  activeGroup: string;
  onSelectMember: (m: MemberInfo) => void;
  onChangeGroup: (g: string) => void;
}) {
  const favorites = useStore($favorites);
  const groups = ['乃木坂46', '櫻坂46', '日向坂46'];
  const isFavTab = activeGroup === '__favorites__';
  const favoriteNames = favorites.map((favorite) => favorite.name);

  const filtered = isFavTab
    ? pickItemsInFavoriteOrder(members, favoriteNames, (member) => member.name)
    : members.filter((m) => {
        if (activeGroup === '櫻坂46') return m.group === '櫻坂46' || m.group === '樱坂46';
        return m.group === activeGroup;
      });

  const byGen: Record<string, MemberInfo[]> = {};
  filtered.forEach((m) => {
    const gen = isFavTab ? (m.group ? (GROUP_CONFIG[m.group]?.name || m.group) : '不明') : (m.generation || '不明');
    if (!byGen[gen]) byGen[gen] = [];
    byGen[gen].push(m);
  });

  return (
    <div className="flex flex-col h-full">
      {/* Group tabs + Favorites tab */}
      <div className="flex border-b border-[var(--border-primary)] shrink-0">
        {groups.map((g) => {
          const color = getGroupColor(g);
          const isActive = g === activeGroup;
          return (
            <button
              key={g}
              onClick={() => onChangeGroup(g)}
              className="flex-1 px-2 py-2 text-xs font-medium border-b-2 transition-colors cursor-pointer"
              style={{ borderColor: isActive ? color : 'transparent', color: isActive ? color : 'var(--text-tertiary)' }}
            >
              {GROUP_CONFIG[g]?.name || g}
            </button>
          );
        })}
        <button
          onClick={() => onChangeGroup('__favorites__')}
          className="flex-1 px-2 py-2 text-xs font-medium border-b-2 transition-colors cursor-pointer flex items-center justify-center gap-0.5"
          style={{ borderColor: isFavTab ? '#f59e0b' : 'transparent', color: isFavTab ? '#f59e0b' : 'var(--text-tertiary)' }}
        >
          <Star size={10} fill={isFavTab ? 'currentColor' : 'none'} /> 收藏
        </button>
      </div>

      {/* Favorites empty state */}
      {isFavTab && filtered.length === 0 && (
        <div className="flex-1 flex flex-col items-center justify-center px-4 text-center">
          <Star size={24} className="text-[var(--text-tertiary)] mb-2" />
          <p className="text-xs text-[var(--text-tertiary)]">还没有收藏成员</p>
          <p className="text-[10px] text-[var(--text-tertiary)] mt-1">浏览成员列表，点击 ⭐ 收藏</p>
        </div>
      )}

      {/* Member list */}
      <div className="flex-1 overflow-y-auto px-2 py-2">
        {(isFavTab ? Object.entries(byGen) : sortedGenEntries(byGen)).map(([gen, mems]) => (
          <div key={gen} className="mb-3">
            <p className="text-[10px] font-semibold text-[var(--text-tertiary)] uppercase tracking-wider mb-1.5">{gen}</p>
            <div className="space-y-0.5">
              {mems.map((m) => {
                const fav = isFavorite(m.name);
                return (
                  <div
                    key={m.name}
                    className="flex items-center gap-2 px-1.5 py-1.5 rounded-lg hover:bg-[var(--bg-tertiary)] transition-colors cursor-pointer group"
                    onClick={() => onSelectMember(m)}
                  >
                    <img
                      src={getOptimizedAvatarUrl(m.name, 80)}
                      alt=""
                      loading="lazy"
                      className="w-8 h-8 rounded-full object-cover shrink-0 border border-[var(--border-primary)]"
                      onError={(e) => {
                        const img = e.target as HTMLImageElement;
                        if (!img.dataset.fb) { img.dataset.fb = '1'; img.src = m.imageUrl; }
                      }}
                    />
                    <span className="text-xs text-[var(--text-primary)] truncate flex-1">{m.name}</span>
                    <button
                      onClick={(e) => { e.stopPropagation(); toggleFavorite({ name: m.name, group: m.group, imageUrl: m.imageUrl }); }}
                      className="text-[var(--text-tertiary)] hover:text-amber-500 transition-colors opacity-0 group-hover:opacity-100 cursor-pointer"
                      title={fav ? '取消收藏' : '收藏'}
                    >
                      <Star size={12} fill={fav ? 'currentColor' : 'none'} className={fav ? 'text-amber-500' : ''} />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Chat Preview ──
function ChatPreview({
  chatBoxes,
  headerName,
  headerGroup,
  avatarSrc,
  onUpdateChat,
  onDeleteChat,
  onHeaderNameChange,
  previewRef,
}: {
  chatBoxes: ChatBox[];
  headerName: string;
  headerGroup: string;
  avatarSrc: string;
  onUpdateChat: (id: number, field: keyof ChatBox, value: string) => void;
  onDeleteChat: (id: number) => void;
  onHeaderNameChange: (name: string) => void;
  previewRef: React.RefObject<HTMLDivElement | null>;
}) {
  const headerStyle = getHeaderStyle(headerGroup);

  return (
    <div ref={previewRef} className="bg-white" style={{ width: '100%', maxWidth: '500px' }}>
      {/* MSG header */}
      <div
        style={headerStyle}
        contentEditable
        suppressContentEditableWarning
        onBlur={(e) => onHeaderNameChange(e.currentTarget.textContent || '')}
      >
        {headerName}
      </div>

      {/* Chat boxes */}
      <div style={{ background: '#fff' }}>
        {chatBoxes.map((box) => (
          <div
            key={box.id}
            className="relative group"
            style={{ display: 'flex', padding: '24px 20px', borderBottom: '1px solid #f3f4f6', alignItems: 'flex-start' }}
          >
            {/* Delete button */}
            <button
              onClick={() => onDeleteChat(box.id)}
              className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded bg-red-50 text-red-400 hover:bg-red-100 hover:text-red-600 cursor-pointer"
              style={{ zIndex: 2 }}
            >
              <Trash2 size={12} />
            </button>

            {/* Avatar */}
            <img
              src={avatarSrc}
              alt=""
              style={{ width: '50px', height: '50px', borderRadius: '50%', border: '2px solid #e5e7eb', objectFit: 'cover', flexShrink: 0 }}
            />

            {/* Content */}
            <div style={{ flex: 1, marginLeft: '12px', minWidth: 0 }}>
              {/* Name + time + ⋯ (official MSG style) */}
              <div style={{ display: 'flex', alignItems: 'center', marginBottom: '14px' }}>
                <span
                  contentEditable
                  suppressContentEditableWarning
                  onBlur={(e) => onUpdateChat(box.id, 'name', e.currentTarget.textContent || '')}
                  style={{ fontWeight: 400, fontSize: '14px', color: '#8a8a8a', outline: 'none' }}
                >
                  {box.name}
                </span>
                <span style={{ margin: '0 12px', fontSize: '12px', color: '#c0c0c0' }}>·</span>
                <span
                  contentEditable
                  suppressContentEditableWarning
                  onBlur={(e) => onUpdateChat(box.id, 'time', e.currentTarget.textContent || '')}
                  style={{ fontSize: '12px', color: '#b0b0b0', outline: 'none' }}
                >
                  {box.time}
                </span>
                <span style={{ marginLeft: 'auto', fontSize: '16px', color: '#c0c0c0', letterSpacing: '1px', userSelect: 'none' }}>⋯</span>
              </div>

              {/* Body — wrapped in bubble */}
              {box.isImageChat ? (
                <div style={{ background: '#f7f7f7', borderRadius: '6px', padding: '12px 18px 18px', marginTop: '2px' }}>
                  {box.imageDataUrl ? (
                    <img
                      src={box.imageDataUrl}
                      alt=""
                      style={{ maxWidth: '100%', borderRadius: '8px', marginBottom: '4px' }}
                    />
                  ) : (
                    <ImageDropZone
                      onImageLoad={(dataUrl) => onUpdateChat(box.id, 'imageDataUrl' as keyof ChatBox, dataUrl)}
                    />
                  )}
                  {/* Editable text below image */}
                  <div
                    contentEditable
                    suppressContentEditableWarning
                    onBlur={(e) => onUpdateChat(box.id, 'body', e.currentTarget.innerHTML)}
                    onPaste={(e) => {
                      e.preventDefault();
                      const text = e.clipboardData.getData('text/plain');
                      document.execCommand('insertText', false, text);
                    }}
                    style={{ fontSize: '16px', lineHeight: 1.5, color: '#1f2937', outline: 'none', marginTop: box.imageDataUrl ? '10px' : '0', minHeight: '1.5em' }}
                    data-placeholder="添加文字（可选）"
                    dangerouslySetInnerHTML={{ __html: box.body }}
                  />
                </div>
              ) : (
                <TextChatBody
                  box={box}
                  onUpdateChat={onUpdateChat}
                />
              )}
            </div>
          </div>
        ))}

        {chatBoxes.length === 0 && (
          <div className="py-16 text-center">
            <MessageSquare size={32} className="mx-auto mb-3" style={{ color: '#d1d5db' }} />
            <p style={{ fontSize: '14px', color: '#9ca3af' }}>点击下方按钮添加对话框</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Text Chat Body (supports double-click/tap to insert inline image) ──
function TextChatBody({
  box,
  onUpdateChat,
}: {
  box: ChatBox;
  onUpdateChat: (id: number, field: keyof ChatBox, value: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleInsertImage = (file: File) => {
    if (!file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      if (!e.target?.result) return;
      const dataUrl = e.target.result as string;
      // Convert text chat to image chat with the selected image
      onUpdateChat(box.id, 'isImageChat' as keyof ChatBox, 'true');
      onUpdateChat(box.id, 'imageDataUrl' as keyof ChatBox, dataUrl);
    };
    reader.readAsDataURL(file);
  };

  return (
    <div>
      <div
        contentEditable
        suppressContentEditableWarning
        onBlur={(e) => onUpdateChat(box.id, 'body', e.currentTarget.innerHTML)}
        onPaste={(e) => {
          // Handle pasted images
          const items = e.clipboardData.items;
          for (let i = 0; i < items.length; i++) {
            if (items[i].type.startsWith('image/')) {
              e.preventDefault();
              const file = items[i].getAsFile();
              if (file) handleInsertImage(file);
              return;
            }
          }
          // Plain text paste
          e.preventDefault();
          const text = e.clipboardData.getData('text/plain');
          document.execCommand('insertText', false, text);
        }}
        onDoubleClick={() => inputRef.current?.click()}
        style={{ background: '#f7f7f7', borderRadius: '6px', padding: '14px 18px', marginTop: '2px', fontSize: '16px', lineHeight: 1.5, color: '#1f2937', outline: 'none' }}
        dangerouslySetInnerHTML={{ __html: box.body }}
      />
      <p
        data-hint="true"
        style={{ fontSize: '10px', color: '#c0c0c0', marginTop: '4px', userSelect: 'none' }}
        className="opacity-0 group-hover:opacity-100 transition-opacity"
      >
        双击可插入图片
      </p>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => { if (e.target.files?.[0]) handleInsertImage(e.target.files[0]); e.target.value = ''; }}
      />
    </div>
  );
}

// ── Image Drop Zone ──
function ImageDropZone({ onImageLoad }: { onImageLoad: (dataUrl: string) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  const handleFile = (file: File) => {
    if (!file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = (e) => { if (e.target?.result) onImageLoad(e.target.result as string); };
    reader.readAsDataURL(file);
  };

  return (
    <div
      className="border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors"
      style={{ borderColor: dragOver ? '#7BC7E8' : '#e5e7eb' }}
      onClick={() => inputRef.current?.click()}
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => { e.preventDefault(); setDragOver(false); if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]); }}
    >
      <ImageIcon size={24} className="mx-auto mb-2" style={{ color: '#d1d5db' }} />
      <p className="text-xs" style={{ color: '#9ca3af' }}>点击或拖拽图片到此处</p>
      <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={(e) => { if (e.target.files?.[0]) handleFile(e.target.files[0]); }} />
    </div>
  );
}

// ── Main Component ──
export default function MsgGenerator() {
  const [members, setMembers] = useState<MemberInfo[]>([]);
  const [activeGroup, setActiveGroup] = useState('乃木坂46');
  const [loading, setLoading] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Selected member state
  const [selectedName, setSelectedName] = useState('请选择成员');
  const [selectedGroup, setSelectedGroup] = useState('乃木坂46');
  const DEFAULT_AVATAR = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200' viewBox='0 0 200 200'%3E%3Crect width='200' height='200' fill='%23E0E0E0'/%3E%3Ccircle cx='100' cy='75' r='35' fill='%23BDBDBD'/%3E%3Cpath d='M 60 180 Q 60 120 100 120 Q 140 120 140 180 Z' fill='%23BDBDBD'/%3E%3C/svg%3E";
  const [avatarSrc, setAvatarSrc] = useState(DEFAULT_AVATAR);

  // Chat boxes
  const [chatBoxes, setChatBoxes] = useState<ChatBox[]>([
    { id: 1, name: '成员名', time: nowTimeStr(), body: '1. 从左侧选择成员<br>2. 点击文字可直接编辑', isImageChat: false },
  ]);
  const nextId = useRef(2);

  const previewRef = useRef<HTMLDivElement>(null);
  const [downloading, setDownloading] = useState(false);
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  // Load members (shared: R2 msg-avatars/members.json → fallback /data/member-images.json)
  useEffect(() => {
    fetchMemberData()
      .then((images) => {
        const deduped = deduplicateMembers(images);
        const list: MemberInfo[] = Object.entries(deduped)
          .map(([name, info]: [string, any]) => ({
            name,
            imageUrl: info.imageUrl || info.url,
            group: info.group,
            generation: info.generation,
          }));
        setMembers(list);

        // Enrich favorites with group info (for legacy migrated entries)
        enrichFavorites(list);

        // Auto-apply first favorite member
        const favs = $favorites.get();
        if (favs.length > 0) {
          const first = list.find((m) => m.name === favs[0].name);
          if (first) applyMember(first);
        }
      })
      .catch((e) => console.error('[MsgGenerator] Failed to load members:', e))
      .finally(() => setLoading(false));
  }, []);

  const applyMember = useCallback(async (m: MemberInfo) => {
    setSelectedName(m.name);
    setSelectedGroup(m.group);
    const r2Url = getR2AvatarUrl(m.name);
    setAvatarSrc(r2Url);
    // Update all chat box names
    setChatBoxes((prev) => prev.map((box) => ({ ...box, name: m.name })));
    setSidebarOpen(false);
    // Pre-convert to data URL for html2canvas (avoid cross-origin taint)
    const dataUrl = await imageToDataUrl(r2Url);
    setAvatarSrc(dataUrl);
  }, []);

  const addTextChat = useCallback(() => {
    const id = nextId.current++;
    setChatBoxes((prev) => [...prev, { id, name: selectedName, time: nowTimeStr(), body: '输入文字...', isImageChat: false }]);
  }, [selectedName]);

  const addImageChat = useCallback(() => {
    const id = nextId.current++;
    setChatBoxes((prev) => [...prev, { id, name: selectedName, time: nowTimeStr(), body: '', isImageChat: true }]);
  }, [selectedName]);

  const deleteChat = useCallback((id: number) => {
    setChatBoxes((prev) => prev.filter((b) => b.id !== id));
  }, []);

  const updateChat = useCallback((id: number, field: keyof ChatBox, value: string) => {
    setChatBoxes((prev) => prev.map((b) => (b.id === id ? { ...b, [field]: value } : b)));
  }, []);

  const downloadImage = useCallback(async () => {
    if (!previewRef.current || downloading) return;
    setDownloading(true);
    try {
      await document.fonts.ready;
      const el = previewRef.current;
      const rect = el.getBoundingClientRect();
      const scaleFactor = 1000 / rect.width;

      const canvas = document.createElement('canvas');
      canvas.width = Math.round(rect.width * scaleFactor);
      canvas.height = Math.round(rect.height * scaleFactor);
      const ctx = canvas.getContext('2d')!;
      ctx.scale(scaleFactor, scaleFactor);

      // Helpers: position relative to preview container
      const rx = (r: DOMRect) => r.left - rect.left;
      const ry = (r: DOMRect) => r.top - rect.top;

      // 1. White background
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, rect.width, rect.height);

      // 2. Header (gradient bg + centered text)
      const headerEl = el.children[0] as HTMLElement;
      if (headerEl) {
        const hR = headerEl.getBoundingClientRect();
        const hX = rx(hR), hY = ry(hR), hW = hR.width, hH = hR.height;
        if (selectedGroup === '日向坂46') {
          const g = ctx.createLinearGradient(hX, hY, hX + hW, hY);
          g.addColorStop(0.4, 'rgb(142,196,230)');
          g.addColorStop(1, 'rgb(167,123,208)');
          ctx.fillStyle = g;
          ctx.fillRect(hX, hY, hW, hH);
        } else if (selectedGroup === '樱坂46' || selectedGroup === '櫻坂46') {
          ctx.fillStyle = '#fff';
          ctx.fillRect(hX, hY, hW, hH);
          const g = ctx.createLinearGradient(hX, hY, hX + hW, hY);
          g.addColorStop(0, '#fff');
          g.addColorStop(0.4, 'rgb(243,144,177)');
          g.addColorStop(1, 'rgb(162,84,165)');
          ctx.fillStyle = g;
          ctx.fillRect(hX, hY + hH - 2, hW, 2);
        } else {
          const g = ctx.createLinearGradient(hX, hY, hX + hW, hY);
          g.addColorStop(0, 'rgb(196,133,230)');
          g.addColorStop(1, 'rgb(147,63,185)');
          ctx.fillStyle = g;
          ctx.fillRect(hX, hY, hW, hH);
        }
        const hCs = getComputedStyle(headerEl);
        ctx.fillStyle = hCs.color;
        ctx.font = `${hCs.fontWeight} ${hCs.fontSize} ${hCs.fontFamily}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(headerEl.textContent || '', hX + hW / 2, hY + hH / 2);
      }

      // 3. Chat boxes
      const chatContainer = el.children[1] as HTMLElement;
      if (chatContainer) {
        for (let i = 0; i < chatContainer.children.length; i++) {
          const boxEl = chatContainer.children[i] as HTMLElement;
          if (boxEl.classList.contains('py-16')) continue;
          const bxR = boxEl.getBoundingClientRect();

          // Bottom border
          ctx.strokeStyle = '#f3f4f6';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(rx(bxR), ry(bxR) + bxR.height - 0.5);
          ctx.lineTo(rx(bxR) + bxR.width, ry(bxR) + bxR.height - 0.5);
          ctx.stroke();

          // Avatar (direct child img)
          const avatarImg = boxEl.querySelector(':scope > img') as HTMLImageElement;
          if (avatarImg?.complete && avatarImg.naturalWidth > 0) {
            const aR = avatarImg.getBoundingClientRect();
            const aX = rx(aR), aY = ry(aR), radius = aR.width / 2;
            ctx.save();
            ctx.beginPath();
            ctx.arc(aX + radius, aY + radius, radius, 0, Math.PI * 2);
            ctx.clip();
            ctx.drawImage(avatarImg, aX, aY, aR.width, aR.height);
            ctx.restore();
            ctx.strokeStyle = '#e5e7eb';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(aX + radius, aY + radius, radius, 0, Math.PI * 2);
            ctx.stroke();
          }

          // Content div (first <div> child)
          const contentDiv = boxEl.querySelector(':scope > div') as HTMLElement;
          if (!contentDiv) continue;

          // Name/time row
          const nameRow = contentDiv.children[0] as HTMLElement;
          if (nameRow) {
            for (let j = 0; j < nameRow.children.length; j++) {
              const span = nameRow.children[j] as HTMLElement;
              const sR = span.getBoundingClientRect();
              const sCs = getComputedStyle(span);
              ctx.fillStyle = sCs.color;
              ctx.font = `${sCs.fontWeight} ${parseFloat(sCs.fontSize)}px ${sCs.fontFamily}`;
              ctx.textAlign = 'left';
              ctx.textBaseline = 'middle';
              ctx.fillText(span.textContent || '', rx(sR), ry(sR) + sR.height / 2);
            }
          }

          // Bubble (second child of content — TextChatBody wrapper or image chat div)
          const bubbleArea = contentDiv.children[1] as HTMLElement;
          if (!bubbleArea) continue;
          const baBg = getComputedStyle(bubbleArea).backgroundColor;
          const bubbleEl = (baBg === 'rgb(247, 247, 247)') ? bubbleArea : (bubbleArea.children[0] as HTMLElement);
          if (!bubbleEl) continue;

          const bubR = bubbleEl.getBoundingClientRect();
          ctx.fillStyle = '#f7f7f7';
          drawRoundedRect(ctx, rx(bubR), ry(bubR), bubR.width, bubR.height, 6);
          ctx.fill();

          // Image inside bubble (if present)
          const chatImg = bubbleEl.querySelector('img') as HTMLImageElement;
          if (chatImg?.complete && chatImg.naturalWidth > 0) {
            const iR = chatImg.getBoundingClientRect();
            ctx.save();
            drawRoundedRect(ctx, rx(iR), ry(iR), iR.width, iR.height, 8);
            ctx.clip();
            ctx.drawImage(chatImg, rx(iR), ry(iR), iR.width, iR.height);
            ctx.restore();
          }

          // Text content in bubble
          const textEl = (bubbleEl.hasAttribute('contenteditable') ? bubbleEl : bubbleEl.querySelector('[contenteditable]')) as HTMLElement | null;
          if (textEl) {
            const text = textEl.innerText.trim();
            if (text) {
              const tCs = getComputedStyle(textEl);
              ctx.fillStyle = tCs.color;
              const fontSize = parseFloat(tCs.fontSize);
              const lh = tCs.lineHeight === 'normal' ? fontSize * 1.5 : parseFloat(tCs.lineHeight);
              ctx.font = `${tCs.fontWeight} ${fontSize}px ${tCs.fontFamily}`;
              ctx.textAlign = 'left';
              ctx.textBaseline = 'top';
              const tR = textEl.getBoundingClientRect();
              const padL = parseFloat(tCs.paddingLeft);
              const padT = parseFloat(tCs.paddingTop);
              const maxW = tR.width - padL - parseFloat(tCs.paddingRight);
              const lines = wrapTextLines(ctx, text, maxW);
              for (let k = 0; k < lines.length; k++) {
                ctx.fillText(lines[k], rx(tR) + padL, ry(tR) + padT + k * lh);
              }
            }
          }
        }
      }

      const dataUrl = canvas.toDataURL('image/png');

      const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
      if (isMobile) {
        setPreviewImage(dataUrl);
      } else {
        const link = document.createElement('a');
        const name = selectedName.replace(/\s+/g, '');
        const date = new Date().toLocaleDateString('zh', { month: '2-digit', day: '2-digit' }).replace(/\//g, '');
        link.download = `${name}_${date}.png`;
        link.href = dataUrl;
        link.click();
      }
    } catch (err: any) {
      console.error('[MsgGenerator] Download failed:', err);
      alert(`下载失败: ${err?.message || err}`);
    } finally {
      setDownloading(false);
    }
  }, [selectedName, selectedGroup, downloading]);

  return (
    <div className="flex gap-4" style={{ minHeight: 'calc(100vh - 240px)' }}>
      {/* Sidebar - desktop */}
      <div className="hidden md:flex flex-col w-56 shrink-0 rounded-xl border border-[var(--border-primary)] bg-[var(--bg-primary)] overflow-hidden">
        {loading ? (
          <div className="p-4 space-y-2">
            {[...Array(8)].map((_, i) => (
              <div key={i} className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-[var(--bg-tertiary)] animate-pulse shrink-0" />
                <div className="h-3 flex-1 bg-[var(--bg-tertiary)] rounded animate-pulse" />
              </div>
            ))}
          </div>
        ) : (
          <MemberSidebar
            members={members}
            activeGroup={activeGroup}
            onSelectMember={applyMember}
            onChangeGroup={setActiveGroup}
          />
        )}
      </div>

      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex">
          <div className="absolute inset-0 bg-black/30" onClick={() => setSidebarOpen(false)} />
          <div className="relative w-72 max-w-[80vw] bg-[var(--bg-primary)] border-r border-[var(--border-primary)] shadow-xl h-full">
            <MemberSidebar
              members={members}
              activeGroup={activeGroup}
              onSelectMember={applyMember}
              onChangeGroup={setActiveGroup}
            />
          </div>
        </div>
      )}

      {/* Main area */}
      <div className="flex-1 flex flex-col items-center min-w-0">
        {/* Toolbar */}
        <div className="flex items-center gap-2 mb-4 flex-wrap justify-center">
          <button
            onClick={() => setSidebarOpen(true)}
            className="md:hidden px-3 py-1.5 text-xs rounded-lg border border-[var(--border-primary)] bg-[var(--bg-primary)] text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)] transition-colors cursor-pointer"
          >
            选择成员
          </button>
          <button
            onClick={addTextChat}
            className="flex items-center gap-1 px-3 py-1.5 text-xs rounded-lg border border-[var(--border-primary)] bg-[var(--bg-primary)] text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)] transition-colors cursor-pointer"
          >
            <Plus size={12} /> 文字对话
          </button>
          <button
            onClick={addImageChat}
            className="flex items-center gap-1 px-3 py-1.5 text-xs rounded-lg border border-[var(--border-primary)] bg-[var(--bg-primary)] text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)] transition-colors cursor-pointer"
          >
            <ImageIcon size={12} /> 图片对话
          </button>
          <button
            onClick={downloadImage}
            disabled={downloading}
            className="flex items-center gap-1 px-3 py-1.5 text-xs rounded-lg text-white transition-colors cursor-pointer disabled:opacity-60"
            style={{ background: getGroupColor(selectedGroup) }}
          >
            <Download size={12} /> {downloading ? '生成中...' : '下载图片'}
          </button>
        </div>

        {/* Preview area */}
        <div className="rounded-xl overflow-hidden border border-[var(--border-primary)] shadow-sm" style={{ maxWidth: '500px', width: '100%' }}>
          <ChatPreview
            chatBoxes={chatBoxes}
            headerName={selectedName}
            headerGroup={selectedGroup}
            avatarSrc={avatarSrc}
            onUpdateChat={updateChat}
            onDeleteChat={deleteChat}
            onHeaderNameChange={setSelectedName}
            previewRef={previewRef}
          />
        </div>
      </div>

      {/* Mobile image preview modal — long-press to save */}
      {previewImage && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70"
          onClick={() => setPreviewImage(null)}
        >
          <div className="relative max-w-[90vw] max-h-[90vh]" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={() => setPreviewImage(null)}
              className="absolute -top-3 -right-3 w-8 h-8 rounded-full bg-white text-gray-700 flex items-center justify-center shadow-lg cursor-pointer z-10"
            >
              <X size={16} />
            </button>
            <img
              src={previewImage}
              alt="MSG preview"
              className="max-w-full max-h-[85vh] rounded-lg shadow-2xl"
            />
            <p className="text-center text-white/80 text-sm mt-3">长按图片保存到相册</p>
          </div>
        </div>
      )}
    </div>
  );
}
