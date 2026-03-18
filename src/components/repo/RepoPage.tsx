import { useState, useRef, useCallback } from 'react';
import { PenLine, Users, Download, Send, Palette, Save, Plus, LogIn, FolderOpen, Trash2, X, ChevronDown, MessageSquare, TrendingUp, Sparkles } from 'lucide-react';
import type { Message, RepoData, TemplateId, AtmosphereTag, Member, GroupId } from '@/types/repo';
import { TEMPLATES, ATMOSPHERE_TAGS, GROUP_META } from '@/types/repo';
import { getMemberById, MOCK_REPOS } from '@/utils/repo-mock-data';
import MemberSelector from './MemberSelector';
import ChatEditor from './ChatEditor';
import RepoCommunity from './RepoCommunity';
import MeguriTemplate from './templates/MeguriTemplate';
import LineTemplate from './templates/LineTemplate';
import OshiColorTemplate from './templates/OshiColorTemplate';

type Tab = 'generator' | 'community';

interface SavedRepo {
  id: string;
  memberId: string;
  memberName: string;
  groupId: GroupId;
  memberImageUrl: string;
  label: string;         // e.g. "2026/3/8 第1部"
  savedAt: string;
  data: {
    eventDate: string;
    eventType: string;
    slotNumber: number;
    ticketCount: number;
    nickname: string;
    messages: Message[];
    tags: AtmosphereTag[];
    template: TemplateId;
  };
}

interface MemberFolder {
  memberId: string;
  memberName: string;
  groupId: GroupId;
  memberImageUrl: string;
  repos: SavedRepo[];
}

// Mock auth state (will be replaced with real auth)
interface AuthUser {
  id: string;
  name: string;
  avatar?: string;
}

const PLACEHOLDER_DATA: RepoData = {
  memberId: '',
  memberName: 'メンバー名',
  groupId: 'nogizaka',
  groupName: 'グループ名',
  memberImageUrl: '',
  eventDate: '2026/3/18',
  eventType: 'ミーグリ',
  slotNumber: 1,
  ticketCount: 1,
  nickname: 'ニックネーム',
  messages: [
    { id: 'ph1', speaker: 'me', text: 'こんにちは！' },
    { id: 'ph2', speaker: 'member', text: 'やっほー！来てくれてありがとう♪' },
  ],
  tags: [],
};

export default function RepoPage() {
  const [activeTab, setActiveTab] = useState<Tab>('community');
  const [sidebarOpen, setSidebarOpen] = useState(true);

  // Mock auth (toggle for demo)
  const [user, setUser] = useState<AuthUser | null>(null);

  // Saved repos grouped by member
  const [savedRepos, setSavedRepos] = useState<SavedRepo[]>([]);
  const [activeRepoId, setActiveRepoId] = useState<string | null>(null);
  const [expandedMemberId, setExpandedMemberId] = useState<string | null>(null);

  // Generator state
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null);
  const [eventDate, setEventDate] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
  });
  const [eventType, setEventType] = useState('ミーグリ');
  const [slotNumber, setSlotNumber] = useState(1);
  const [ticketCount, setTicketCount] = useState(1);
  const [nickname, setNickname] = useState('');
  const [messages, setMessages] = useState<Message[]>([
    { id: 'init_1', speaker: 'me', text: '' },
    { id: 'init_2', speaker: 'member', text: '' },
  ]);
  const [tags, setTags] = useState<AtmosphereTag[]>([]);
  const [template, setTemplate] = useState<TemplateId>('meguri');
  const [customMemberAvatar, setCustomMemberAvatar] = useState<string | undefined>();
  const [userAvatar, setUserAvatar] = useState<string | undefined>();

  const previewRef = useRef<HTMLDivElement>(null);

  const selectedMember = selectedMemberId ? getMemberById(selectedMemberId) : null;
  const groupColor = selectedMember ? GROUP_META[selectedMember.group].color : '#742581';

  function handleMemberSelect(member: Member) {
    setSelectedMemberId(member.id);
    setCustomMemberAvatar(undefined); // reset custom avatar when changing member
  }

  function handleAvatarUpload(file: File, target: 'member' | 'user') {
    const reader = new FileReader();
    reader.onload = (e) => {
      if (e.target?.result) {
        if (target === 'member') setCustomMemberAvatar(e.target.result as string);
        else setUserAvatar(e.target.result as string);
      }
    };
    reader.readAsDataURL(file);
  }

  function toggleTag(tag: AtmosphereTag) {
    setTags(prev =>
      prev.includes(tag) ? prev.filter(t => t !== tag) : prev.length < 2 ? [...prev, tag] : prev,
    );
  }

  // Build preview data: always show something
  const repoData: RepoData = selectedMember
    ? {
        memberId: selectedMember.id,
        memberName: selectedMember.name,
        groupId: selectedMember.group,
        groupName: selectedMember.groupName,
        memberImageUrl: customMemberAvatar || selectedMember.imageUrl,
        eventDate,
        eventType,
        slotNumber,
        ticketCount,
        nickname,
        userAvatar,
        customMemberAvatar,
        messages: messages.filter(m => m.text.trim() || m.imageUrl),
        tags,
      }
    : PLACEHOLDER_DATA;

  const hasContent = selectedMember && messages.some(m => m.text.trim() || m.imageUrl);

  // Group repos by member for sidebar
  const memberFolders: MemberFolder[] = (() => {
    const map = new Map<string, MemberFolder>();
    for (const repo of savedRepos) {
      if (!map.has(repo.memberId)) {
        map.set(repo.memberId, {
          memberId: repo.memberId,
          memberName: repo.memberName,
          groupId: repo.groupId,
          memberImageUrl: repo.memberImageUrl,
          repos: [],
        });
      }
      map.get(repo.memberId)!.repos.push(repo);
    }
    return Array.from(map.values());
  })();

  // Save current repo
  function handleSave() {
    if (!selectedMember) {
      alert('先にメンバーを選択してください');
      return;
    }
    const id = activeRepoId || `repo_${Date.now()}`;
    const saved: SavedRepo = {
      id,
      memberId: selectedMember.id,
      memberName: selectedMember.name,
      groupId: selectedMember.group,
      memberImageUrl: selectedMember.imageUrl,
      label: `${eventDate} 第${slotNumber}部`,
      savedAt: new Date().toISOString(),
      data: { eventDate, eventType, slotNumber, ticketCount, nickname, messages, tags, template },
    };
    setSavedRepos(prev => {
      const idx = prev.findIndex(r => r.id === id);
      if (idx >= 0) { const next = [...prev]; next[idx] = saved; return next; }
      return [saved, ...prev];
    });
    setActiveRepoId(id);
    setExpandedMemberId(selectedMember.id);
  }

  // Load a saved repo
  function loadRepo(repo: SavedRepo) {
    setActiveRepoId(repo.id);
    setSelectedMemberId(repo.memberId);
    setEventDate(repo.data.eventDate);
    setEventType(repo.data.eventType);
    setSlotNumber(repo.data.slotNumber);
    setTicketCount(repo.data.ticketCount);
    setNickname(repo.data.nickname);
    setMessages(repo.data.messages);
    setTags(repo.data.tags);
    setTemplate(repo.data.template);
    setExpandedMemberId(repo.memberId);
  }

  // New blank repo under a specific member
  function newRepoForMember(memberId: string) {
    const member = getMemberById(memberId);
    setActiveRepoId(null);
    setSelectedMemberId(memberId);
    setNickname('');
    setMessages([{ id: 'init_1', speaker: 'me', text: '' }, { id: 'init_2', speaker: 'member', text: '' }]);
    setTags([]);
    setExpandedMemberId(memberId);
  }

  // New completely blank repo
  function newRepo() {
    setActiveRepoId(null);
    setSelectedMemberId(null);
    setNickname('');
    setMessages([{ id: 'init_1', speaker: 'me', text: '' }, { id: 'init_2', speaker: 'member', text: '' }]);
    setTags([]);
  }

  function deleteRepo(id: string) {
    setSavedRepos(prev => prev.filter(r => r.id !== id));
    if (activeRepoId === id) newRepo();
  }

  const handleDownload = useCallback(async () => {
    if (!previewRef.current) return;
    try {
      const html2canvas = (await import('html2canvas')).default;
      const canvas = await html2canvas(previewRef.current, {
        scale: 2,
        useCORS: true,
        allowTaint: true,
        backgroundColor: '#ffffff',
      });
      const link = document.createElement('a');
      link.download = `repo_${selectedMember?.name || 'repo'}_${eventDate.replace(/\//g, '-')}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
    } catch (err) {
      console.error('Download failed:', err);
      alert('画像の生成に失敗しました。');
    }
  }, [selectedMember, eventDate]);

  function renderPreview() {
    switch (template) {
      case 'meguri':     return <MeguriTemplate data={repoData} />;
      case 'line':       return <LineTemplate data={repoData} />;
      case 'oshi-color': return <OshiColorTemplate data={repoData} />;
    }
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {activeTab === 'community' ? (
        <>
          {/* Page header (matching photocard page layout) */}
          <div className="flex items-center justify-between mb-8">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <MessageSquare size={20} className="text-[var(--color-brand-nogi)]" />
                <h1 className="text-2xl font-bold text-[var(--text-primary)]">握手Repo</h1>
              </div>
              <p className="text-sm text-[var(--text-tertiary)]">记录你的线上见面会对话，浏览社区精彩互动</p>
            </div>
            <button
              type="button"
              onClick={() => setActiveTab('generator')}
              className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white rounded-lg transition-opacity hover:opacity-90"
              style={{ backgroundColor: 'var(--color-brand-nogi)' }}
            >
              <Sparkles size={14} /> 写Repo
            </button>
          </div>

          {/* Stats bar (matching photocard page with colored icon backgrounds) */}
          <div className="grid grid-cols-3 gap-4 mb-8">
            <div className="flex items-center gap-3 rounded-xl border border-[var(--border-primary)] bg-[var(--bg-primary)] px-4 py-3">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: 'color-mix(in srgb, var(--color-brand-nogi) 10%, transparent)', color: 'var(--color-brand-nogi)' }}>
                <MessageSquare size={16} />
              </div>
              <div>
                <p className="text-lg font-bold text-[var(--text-primary)]">{MOCK_REPOS.length.toLocaleString()}</p>
                <p className="text-[10px] text-[var(--text-tertiary)]">总作品数</p>
              </div>
            </div>
            <div className="flex items-center gap-3 rounded-xl border border-[var(--border-primary)] bg-[var(--bg-primary)] px-4 py-3">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: 'color-mix(in srgb, var(--color-brand-sakura) 10%, transparent)', color: 'var(--color-brand-sakura)' }}>
                <Users size={16} />
              </div>
              <div>
                <p className="text-lg font-bold text-[var(--text-primary)]">{new Set(MOCK_REPOS.map(r => r.userId)).size}</p>
                <p className="text-[10px] text-[var(--text-tertiary)]">创作者</p>
              </div>
            </div>
            <div className="flex items-center gap-3 rounded-xl border border-[var(--border-primary)] bg-[var(--bg-primary)] px-4 py-3">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: 'color-mix(in srgb, var(--color-brand-hinata) 10%, transparent)', color: 'var(--color-brand-hinata)' }}>
                <TrendingUp size={16} />
              </div>
              <div>
                <p className="text-lg font-bold text-[var(--text-primary)]">+{MOCK_REPOS.filter(r => { const d = new Date(r.createdAt); const now = new Date(); return d.toDateString() === now.toDateString(); }).length}</p>
                <p className="text-[10px] text-[var(--text-tertiary)]">今日新增</p>
              </div>
            </div>
          </div>

          {/* Create CTA (matching photocard page) */}
          <div className="rounded-xl border border-[var(--border-primary)] bg-gradient-to-r from-[var(--bg-primary)] to-[var(--bg-secondary)] p-6 mb-8">
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
              <div className="flex-1">
                <h2 className="text-base font-semibold text-[var(--text-primary)] mb-1">写下你的握手会记录</h2>
                <p className="text-xs text-[var(--text-tertiary)]">
                  选择成员 → 输入对话 → 选择模板 → 生成并下载精美图片
                </p>
              </div>
              <button
                type="button"
                onClick={() => setActiveTab('generator')}
                className="flex items-center gap-1.5 px-5 py-2.5 text-sm font-medium text-white rounded-lg transition-opacity hover:opacity-90 shrink-0"
                style={{ backgroundColor: 'var(--color-brand-nogi)' }}
              >
                <Sparkles size={14} /> 进入生成器
              </button>
            </div>
          </div>

          {/* Community content */}
          <RepoCommunity />
        </>
      ) : (
        <>
          {/* Generator header */}
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <button type="button" onClick={() => setActiveTab('community')}
                className="p-2 rounded-lg hover:bg-[var(--bg-tertiary)] text-[var(--text-tertiary)]">
                <X size={20} />
              </button>
              <div>
                <h2 className="text-xl font-bold text-[var(--text-primary)]">创建Repo</h2>
                <p className="text-xs text-[var(--text-tertiary)]">选择成员 → 输入对话 → 预览 → 下载或发布</p>
              </div>
            </div>
          </div>

          {/* Generator: 2-column layout (editor + preview) */}
          <div className="flex flex-col lg:flex-row gap-6">
            {/* Left: Editor */}
            <div className="lg:w-[440px] shrink-0 space-y-4">
              {/* My Repos - horizontal compact bar */}
              {savedRepos.length > 0 && (
                <div className="bg-[var(--bg-primary)] rounded-xl border border-[var(--border-primary)] p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <FolderOpen size={14} className="text-[var(--text-tertiary)]" />
                    <h3 className="text-xs font-semibold text-[var(--text-secondary)]">我的Repo</h3>
                    <div className="flex-1" />
                    <button type="button" onClick={newRepo} className="text-[10px] text-[var(--color-brand-nogi)] hover:underline">+ 新建</button>
                  </div>
                  <div className="flex gap-1.5 overflow-x-auto pb-1">
                    {memberFolders.map(folder => {
                      const color = GROUP_META[folder.groupId]?.color || '#999';
                      return folder.repos.map(repo => (
                        <button key={repo.id} type="button" onClick={() => loadRepo(repo)}
                          className={`shrink-0 flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[10px] transition-colors ${
                            activeRepoId === repo.id ? 'bg-[var(--bg-tertiary)] font-medium' : 'hover:bg-[var(--bg-tertiary)]'
                          }`}>
                          <div className="w-4 h-4 rounded-full flex items-center justify-center text-white text-[7px] font-bold" style={{ backgroundColor: color }}>
                            {folder.memberName.charAt(0)}
                          </div>
                          <span className="text-[var(--text-secondary)] whitespace-nowrap">{repo.label}</span>
                        </button>
                      ));
                    })}
                  </div>
                </div>
              )}

              <div className="bg-[var(--bg-primary)] rounded-xl border border-[var(--border-primary)] p-5 space-y-4">
                <h3 className="text-sm font-semibold text-[var(--text-primary)]">基本信息</h3>
                <MemberSelector selectedMemberId={selectedMemberId} onSelect={handleMemberSelect} />
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-[var(--text-tertiary)] mb-1">日期</label>
                    <input type="text" value={eventDate} onChange={e => setEventDate(e.target.value)} placeholder="2026/3/8"
                      className="w-full px-3 py-2 rounded-lg border border-[var(--border-secondary)] bg-[var(--bg-primary)] text-sm outline-none focus:border-[var(--color-brand-nogi)]" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-[var(--text-tertiary)] mb-1">活动</label>
                    <select value={eventType} onChange={e => setEventType(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border border-[var(--border-secondary)] bg-[var(--bg-primary)] text-sm outline-none">
                      <option>ミーグリ</option><option>オンラインミート&グリート</option><option>個別握手会</option><option>全国握手会</option>
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-[var(--text-tertiary)] mb-1">场次</label>
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-[var(--text-tertiary)]">第</span>
                      <input type="number" min={1} max={20} value={slotNumber} onChange={e => setSlotNumber(Number(e.target.value))}
                        className="flex-1 px-3 py-2 rounded-lg border border-[var(--border-secondary)] bg-[var(--bg-primary)] text-sm outline-none" />
                      <span className="text-sm text-[var(--text-tertiary)]">部</span>
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-[var(--text-tertiary)] mb-1">券数</label>
                    <input type="number" min={1} max={30} value={ticketCount} onChange={e => setTicketCount(Number(e.target.value))}
                      className="w-full px-3 py-2 rounded-lg border border-[var(--border-secondary)] bg-[var(--bg-primary)] text-sm outline-none" />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-[var(--text-tertiary)] mb-1">昵称</label>
                  <input type="text" value={nickname} onChange={e => setNickname(e.target.value)} placeholder="见面会上被叫的名字"
                    className="w-full px-3 py-2 rounded-lg border border-[var(--border-secondary)] bg-[var(--bg-primary)] text-sm outline-none" />
                </div>
              </div>

              <div className="bg-[var(--bg-primary)] rounded-xl border border-[var(--border-primary)] p-5">
                <ChatEditor messages={messages} onChange={setMessages} memberName={selectedMember?.name || ''} groupColor={groupColor} />
              </div>

              <div className="bg-[var(--bg-primary)] rounded-xl border border-[var(--border-primary)] p-5">
                <h3 className="text-xs font-medium text-[var(--text-tertiary)] mb-2">氛围标签（最多2个）</h3>
                <div className="flex flex-wrap gap-1.5">
                  {ATMOSPHERE_TAGS.map(t => (
                    <button key={t.id} type="button" onClick={() => toggleTag(t.id)}
                      className={`px-3 py-1.5 text-xs rounded-full transition-all ${tags.includes(t.id) ? 'bg-[var(--text-primary)] text-white shadow-sm' : 'bg-[var(--bg-tertiary)] text-[var(--text-secondary)] hover:bg-[var(--border-primary)]'}`}>
                      {t.emoji} {t.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Right: Preview */}
            <div className="flex-1 min-w-0">
              <div className="sticky top-20 space-y-4">
                <div className="bg-[var(--bg-primary)] rounded-xl border border-[var(--border-primary)] p-4">
                  <h3 className="text-xs font-medium text-[var(--text-tertiary)] mb-2">模板选择</h3>
                  <div className="flex gap-2">
                    {TEMPLATES.map(t => (
                      <button key={t.id} type="button" onClick={() => setTemplate(t.id)}
                        className={`flex-1 px-3 py-2 rounded-lg text-xs transition-all text-center ${template === t.id ? 'bg-[var(--text-primary)] text-white shadow-sm' : 'bg-[var(--bg-tertiary)] text-[var(--text-secondary)]'}`}>
                        <div className="font-medium">{t.label}</div>
                      </button>
                    ))}
                  </div>
                </div>
                <div className={`bg-[var(--bg-primary)] rounded-xl border border-[var(--border-primary)] p-6 flex justify-center ${!hasContent ? 'opacity-50' : ''}`}>
                  <div ref={previewRef}>{renderPreview()}</div>
                </div>
                <div className="flex gap-2">
                  <button type="button" onClick={handleDownload} disabled={!hasContent}
                    className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-lg bg-[var(--text-primary)] text-white text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                    <Download size={14} /> 下载图片
                  </button>
                  <button type="button" onClick={handleSave}
                    className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-lg border border-[var(--border-primary)] text-sm font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)] transition-colors">
                    <Save size={14} /> {activeRepoId ? '覆盖保存' : '保存'}
                  </button>
                  <button type="button" disabled={!hasContent}
                    className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed text-white"
                    style={{ backgroundColor: groupColor }}>
                    <Send size={14} /> 发布
                  </button>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
