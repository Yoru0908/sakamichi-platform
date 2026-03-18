import { useState, useRef, useCallback } from 'react';
import { PenLine, Users, Download, Send, Palette, Save, Plus, LogIn, FolderOpen, Trash2, X, ChevronDown } from 'lucide-react';
import type { Message, RepoData, TemplateId, AtmosphereTag, Member, GroupId } from '@/types/repo';
import { TEMPLATES, ATMOSPHERE_TAGS, GROUP_META } from '@/types/repo';
import { getMemberById } from '@/utils/repo-mock-data';
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
  const [activeTab, setActiveTab] = useState<Tab>('generator');
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
    <div>
      {/* Sub-header: tab switcher + auth (platform Navbar is above) */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button type="button" onClick={() => setSidebarOpen(!sidebarOpen)} className="lg:hidden p-1.5 rounded-lg hover:bg-[var(--bg-tertiary)]">
              <FolderOpen size={18} />
            </button>
            <div className="flex items-center gap-1 bg-[var(--bg-tertiary)] rounded-lg p-0.5">
              {([['generator', PenLine, '生成器'], ['community', Users, '社区']] as [Tab, typeof PenLine, string][]).map(
                ([tab, Icon, label]) => (
                  <button
                    key={tab}
                    type="button"
                    onClick={() => setActiveTab(tab)}
                    className={`flex items-center gap-1.5 px-4 py-1.5 text-sm rounded-md transition-all ${
                      activeTab === tab ? 'bg-[var(--bg-primary)] text-[var(--text-primary)] shadow-sm font-medium' : 'text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]'
                    }`}
                  >
                    <Icon size={14} />
                    {label}
                  </button>
                ),
              )}
            </div>
          </div>

          {/* Demo auth (will be replaced by platform auth) */}
          {user ? (
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-full bg-[var(--color-brand-nogi)] flex items-center justify-center text-[10px] text-white font-bold">
                {user.name.charAt(0)}
              </div>
              <button type="button" onClick={() => setUser(null)} className="text-[10px] text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]">
                logout
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setUser({ id: 'demo', name: 'ヨル' })}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg bg-[var(--text-primary)] text-white hover:opacity-90 transition-opacity"
            >
              <LogIn size={12} /> ログイン
            </button>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-8">
        {activeTab === 'generator' ? (
          <div className="flex gap-5">
            {/* Left sidebar: My Repos */}
            {sidebarOpen && (
              <div className="hidden lg:block w-[200px] shrink-0">
                <div className="sticky top-20 space-y-3">
                  <div className="bg-white rounded-2xl border border-gray-200 p-3">
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="text-xs font-semibold text-gray-600">マイレポ</h3>
                      <button type="button" onClick={newRepo} className="p-1 rounded-md hover:bg-gray-100 text-gray-400 hover:text-gray-600" title="新規">
                        <Plus size={14} />
                      </button>
                    </div>

                    {!user ? (
                      <div className="text-center py-6">
                        <LogIn size={20} className="mx-auto text-gray-300 mb-2" />
                        <p className="text-[10px] text-gray-400">ログインすると</p>
                        <p className="text-[10px] text-gray-400">レポを保存できます</p>
                      </div>
                    ) : memberFolders.length === 0 ? (
                      <div className="text-center py-6">
                        <FolderOpen size={20} className="mx-auto text-gray-300 mb-2" />
                        <p className="text-[10px] text-gray-400">保存されたレポはありません</p>
                        <p className="text-[10px] text-gray-400 mt-1">メンバーを選択して保存すると</p>
                        <p className="text-[10px] text-gray-400">ここに表示されます</p>
                      </div>
                    ) : (
                      <div className="space-y-1.5 max-h-[60vh] overflow-y-auto">
                        {memberFolders.map(folder => {
                          const isExpanded = expandedMemberId === folder.memberId;
                          const color = GROUP_META[folder.groupId]?.color || '#999';
                          return (
                            <div key={folder.memberId}>
                              {/* Member header */}
                              <button
                                type="button"
                                onClick={() => setExpandedMemberId(isExpanded ? null : folder.memberId)}
                                className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-gray-50 transition-colors"
                              >
                                <div
                                  className="w-7 h-7 rounded-full shrink-0 flex items-center justify-center text-white text-[10px] font-bold"
                                  style={{ backgroundColor: color }}
                                >
                                  {folder.memberName.charAt(0)}
                                </div>
                                <div className="flex-1 text-left min-w-0">
                                  <div className="text-[11px] font-medium truncate">{folder.memberName}</div>
                                  <div className="text-[9px] text-gray-400">{folder.repos.length} 件</div>
                                </div>
                                <ChevronDown size={12} className={`text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                              </button>

                              {/* Repo list under this member */}
                              {isExpanded && (
                                <div className="ml-4 pl-2 border-l-2 space-y-0.5 mt-0.5" style={{ borderColor: color + '40' }}>
                                  {folder.repos.map(repo => (
                                    <div
                                      key={repo.id}
                                      className={`group flex items-center gap-1.5 px-2 py-1.5 rounded-md cursor-pointer transition-colors text-[10px] ${
                                        activeRepoId === repo.id ? 'bg-gray-100 font-medium' : 'hover:bg-gray-50'
                                      }`}
                                      onClick={() => loadRepo(repo)}
                                    >
                                      <div className="flex-1 min-w-0 truncate text-gray-600">{repo.label}</div>
                                      <button
                                        type="button"
                                        onClick={e => { e.stopPropagation(); deleteRepo(repo.id); }}
                                        className="shrink-0 opacity-0 group-hover:opacity-100 text-gray-300 hover:text-red-400"
                                      >
                                        <Trash2 size={10} />
                                      </button>
                                    </div>
                                  ))}
                                  <button
                                    type="button"
                                    onClick={() => newRepoForMember(folder.memberId)}
                                    className="w-full px-2 py-1 text-[10px] text-gray-400 hover:text-gray-600 text-left"
                                  >
                                    ＋ 新規レポ
                                  </button>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Middle: Editor panel */}
            <div className="w-full lg:w-[380px] shrink-0 space-y-4">
              <div className="bg-white rounded-2xl border border-gray-200 p-5 space-y-4">
                <h2 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                  <PenLine size={14} /> 基本情報
                </h2>
                <MemberSelector selectedMemberId={selectedMemberId} onSelect={handleMemberSelect} />
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">日付</label>
                    <input type="text" value={eventDate} onChange={e => setEventDate(e.target.value)} placeholder="2026/3/8"
                      className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm outline-none focus:ring-2 focus:ring-gray-200" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">イベント</label>
                    <select value={eventType} onChange={e => setEventType(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm outline-none focus:ring-2 focus:ring-gray-200 bg-white">
                      <option>ミーグリ</option>
                      <option>オンラインミート&グリート</option>
                      <option>個別握手会</option>
                      <option>全国握手会</option>
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">部</label>
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-gray-400">第</span>
                      <input type="number" min={1} max={20} value={slotNumber} onChange={e => setSlotNumber(Number(e.target.value))}
                        className="flex-1 px-3 py-2 rounded-xl border border-gray-200 text-sm outline-none focus:ring-2 focus:ring-gray-200" />
                      <span className="text-sm text-gray-400">部</span>
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">枚数</label>
                    <input type="number" min={1} max={30} value={ticketCount} onChange={e => setTicketCount(Number(e.target.value))}
                      className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm outline-none focus:ring-2 focus:ring-gray-200" />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">ニックネーム</label>
                  <input type="text" value={nickname} onChange={e => setNickname(e.target.value)} placeholder="ミーグリで呼ばれる名前"
                    className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm outline-none focus:ring-2 focus:ring-gray-200" />
                </div>
              </div>

              {/* Avatar settings */}
              <div className="bg-white rounded-2xl border border-gray-200 p-5 space-y-3">
                <h2 className="text-xs font-medium text-gray-500">アバター設定</h2>
                <div className="grid grid-cols-2 gap-3">
                  {/* Member avatar */}
                  <div>
                    <div className="text-[10px] text-gray-400 mb-1.5">メンバー</div>
                    <label className="cursor-pointer block">
                      <div className="w-14 h-14 rounded-sm overflow-hidden bg-gray-100 mx-auto relative group">
                        {customMemberAvatar ? (
                          <img src={customMemberAvatar} alt="" className="w-full h-full object-cover" />
                        ) : selectedMember ? (
                          <img src={selectedMember.imageUrl} alt="" className="w-full h-full object-cover"
                            onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-gray-300 text-xs">未選択</div>
                        )}
                        <div className="absolute inset-0 bg-black/30 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                          <span className="text-white text-[9px]">変更</span>
                        </div>
                      </div>
                      <input type="file" accept="image/*" className="hidden"
                        onChange={e => e.target.files?.[0] && handleAvatarUpload(e.target.files[0], 'member')} />
                    </label>
                    {customMemberAvatar && (
                      <button type="button" onClick={() => setCustomMemberAvatar(undefined)}
                        className="text-[9px] text-gray-400 hover:text-red-400 mt-1 block mx-auto">リセット</button>
                    )}
                  </div>
                  {/* User avatar */}
                  <div>
                    <div className="text-[10px] text-gray-400 mb-1.5">自分</div>
                    <label className="cursor-pointer block">
                      <div className="w-14 h-14 rounded-full overflow-hidden bg-gray-100 mx-auto relative group">
                        {userAvatar ? (
                          <img src={userAvatar} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-gray-300 text-lg font-bold">自</div>
                        )}
                        <div className="absolute inset-0 bg-black/30 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity rounded-full">
                          <span className="text-white text-[9px]">変更</span>
                        </div>
                      </div>
                      <input type="file" accept="image/*" className="hidden"
                        onChange={e => e.target.files?.[0] && handleAvatarUpload(e.target.files[0], 'user')} />
                    </label>
                    {userAvatar && (
                      <button type="button" onClick={() => setUserAvatar(undefined)}
                        className="text-[9px] text-gray-400 hover:text-red-400 mt-1 block mx-auto">リセット</button>
                    )}
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-2xl border border-gray-200 p-5">
                <ChatEditor messages={messages} onChange={setMessages} memberName={selectedMember?.name || ''} groupColor={groupColor} />
              </div>

              <div className="bg-white rounded-2xl border border-gray-200 p-5">
                <h2 className="text-xs font-medium text-gray-500 mb-2">雰囲気タグ（最大2つ）</h2>
                <div className="flex flex-wrap gap-1.5">
                  {ATMOSPHERE_TAGS.map(t => (
                    <button key={t.id} type="button" onClick={() => toggleTag(t.id)}
                      className={`px-3 py-1.5 text-xs rounded-full transition-all ${
                        tags.includes(t.id) ? 'bg-gray-800 text-white shadow-sm' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                      }`}>
                      {t.emoji} {t.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Right: Preview panel */}
            <div className="flex-1 min-w-0">
              <div className="sticky top-20 space-y-4">
                <div className="bg-white rounded-2xl border border-gray-200 p-4">
                  <h2 className="text-xs font-medium text-gray-500 mb-2 flex items-center gap-1.5">
                    <Palette size={12} /> テンプレート
                  </h2>
                  <div className="flex gap-2">
                    {TEMPLATES.map(t => (
                      <button key={t.id} type="button" onClick={() => setTemplate(t.id)}
                        className={`flex-1 px-3 py-2 rounded-xl text-xs transition-all text-center ${
                          template === t.id ? 'bg-gray-800 text-white shadow-sm' : 'bg-gray-50 text-gray-500 hover:bg-gray-100'
                        }`}>
                        <div className="font-medium">{t.label}</div>
                        <div className="text-[10px] opacity-70 mt-0.5">{t.description}</div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Preview - always visible */}
                <div className={`bg-white rounded-2xl border border-gray-200 p-6 flex justify-center ${!hasContent ? 'opacity-60' : ''}`}>
                  <div ref={previewRef}>
                    {renderPreview()}
                  </div>
                </div>

                {/* Action buttons: 3 buttons */}
                <div className="flex gap-2">
                  <button type="button" onClick={handleDownload} disabled={!hasContent}
                    className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl bg-gray-800 text-white text-xs font-medium hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                    <Download size={14} /> ダウンロード
                  </button>
                  <button type="button" onClick={handleSave} disabled={!user}
                    className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl border border-gray-300 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    title={!user ? 'ログインが必要です' : '保存'}>
                    <Save size={14} /> {activeRepoId ? '上書き保存' : '保存'}
                  </button>
                  <button type="button" disabled={!hasContent || !user}
                    className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl text-xs font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed text-white"
                    style={{ backgroundColor: groupColor }}
                    title={!user ? 'ログインが必要です' : '社区に公開'}>
                    <Send size={14} /> 公開
                  </button>
                </div>

                {!user && (
                  <p className="text-[10px] text-gray-400 text-center">
                    💡 ログインすると保存・公開ができます
                  </p>
                )}
              </div>
            </div>
          </div>
        ) : (
          <RepoCommunity />
        )}
      </div>
    </div>
  );
}
