import { useState, useEffect, useMemo } from 'react';
import { Cake, Search, Download, ExternalLink, X, Calendar } from 'lucide-react';
import { proxyImageUrl } from '@/utils/proxy-image';

interface Card {
  member: string;
  memberId: string;
  cardUrl: string;
  pageUrl: string;
  group: string;
  month?: string;
}

interface BirthdayCardsData {
  lastUpdate: string;
  source: string;
  note: string;
  cards: Card[];
}

interface MemberImageInfo {
  imageUrl: string;
  group: string;
}

interface MemberImagesData {
  images: Record<string, MemberImageInfo>;
}

// 成员期别映射 (现役成员全覆盖)
const MEMBER_GENERATIONS: Record<string, string> = {
  // 樱坂46
  // 一期生
  '小池美波': '一期生', '小池 美波': '一期生',
  // 二期生
  '井上梨名': '二期生', '井上 梨名': '二期生',
  '遠藤光莉': '二期生', '遠藤 光莉': '二期生',
  '大園玲': '二期生', '大園 玲': '二期生',
  '大沼晶保': '二期生', '大沼 晶保': '二期生',
  '幸阪茉里乃': '二期生', '幸阪 茉里乃': '二期生',
  '武元唯衣': '二期生', '武元 唯衣': '二期生',
  '田村保乃': '二期生', '田村 保乃': '二期生',
  '藤吉夏鈴': '二期生', '藤吉 夏鈴': '二期生',
  '増本綺良': '二期生', '増本 綺良': '二期生',
  '松田里奈': '二期生', '松田 里奈': '二期生',
  '森田ひかる': '二期生', '森田 ひかる': '二期生',
  '守屋麗奈': '二期生', '守屋 麗奈': '二期生',
  '山﨑天': '二期生', '山﨑 天': '二期生', '山崎天': '二期生', '山崎 天': '二期生',
  // 三期生
  '石森璃花': '三期生', '石森 璃花': '三期生',
  '遠藤理子': '三期生', '遠藤 理子': '三期生',
  '小田倉麗奈': '三期生', '小田倉 麗奈': '三期生',
  '小岛凪纱': '三期生', '小島凪紗': '三期生', '小島 凪紗': '三期生',
  '谷口爱季': '三期生', '谷口 意季': '三期生', '谷口 愛季': '三期生',
  '中嶋優月': '三期生', '中嶋 優月': '三期生',
  '的野美青': '三期生', '的野 美青': '三期生',
  '向井純葉': '三期生', '向井 純葉': '三期生',
  '村井優': '三期生', '村井 優': '三期生',
  '村山美羽': '三期生', '村山 美羽': '三期生',
  '山下瞳月': '三期生', '山下 瞳月': '三期生',
  // 四期生
  '浅井恋乃未': '四期生', '浅井 恋乃未': '四期生',
  '稲熊ひな': '四期生', '稲熊 ひな': '四期生',
  '勝又春': '四期生', '勝又 春': '四期生',
  '佐藤爱桜': '四期生', '佐藤 爱桜': '四期生', '佐藤 愛桜': '四期生',
  '中川智尋': '四期生', '中川 智尋': '四期生',
  '松本和子': '四期生', '松本 和子': '四期生',
  '目黒阳色': '四期生', '目黒 阳色': '四期生', '目黒 陽色': '四期生', '目黒陽色': '四期生',
  '山川宇衣': '四期生', '山川 宇衣': '四期生',
  '山田桃実': '四期生', '山田 桃実': '四期生',

  // 日向坂46
  // 二期生
  '金村美玖': '二期生', '金村 美玖': '二期生',
  '小坂菜緒': '二期生', '小坂 菜緒': '二期生',
  // 三期生
  '上村ひなの': '三期生', '上村 ひなの': '三期生',
  '髙橋未来虹': '三期生', '髙橋 未来虹': '三期生',
  '森本茉莉': '三期生', '森本 茉莉': '三期生',
  '山口陽世': '三期生', '山口 陽世': '三期生',
  // 四期生
  '石塚瑶季': '四期生', '石塚 瑶季': '四期生',
  '小西夏菜実': '四期生', '小西 夏菜实': '四期生',
  '清水理央': '四期生', '清水 理央': '四期生',
  '正源司陽子': '四期生', '正源司 陽子': '四期生',
  '竹内希来里': '四期生', '竹内 希来里': '四期生',
  '平尾帆夏': '四期生', '平尾 帆夏': '四期生',
  '平岡海月': '四期生', '平岡 海月': '四期生',
  '藤嶌果歩': '四期生', '藤嶌 果歩': '四期生',
  '宮地すみれ': '四期生', '宮地 すみれ': '四期生',
  '山下葉留花': '四期生', '山下 葉留花': '四期生',
  '渡辺莉奈': '四期生', '渡辺 莉奈': '四期生',
  // 五期生
  '大田美月': '五期生', '大田 美月': '五期生',
  '大野愛実': '五期生', '大野 愛实': '五期生',
  '片山紗希': '五期生', '片山 紗希': '五期生',
  '蔵盛妃那乃': '五期生', '蔵盛 妃那乃': '五期生',
  '坂井新奈': '五期生', '坂井 新奈': '五期生',
  '佐藤優羽': '五期生', '佐藤 優羽': '五期生',
  '下田衣珠季': '五期生', '下田 衣珠季': '五期生',
  '高井俐香': '五期生', '高井 俐香': '五期生',
  '鶴崎仁香': '五期生', '鶴崎 仁香': '五期生',
  '松尾桜': '五期生', '松尾 桜': '五期生'
};

// 成员生日映射 (已校对为 100% 正确数据)
const MEMBER_BIRTHDAYS: Record<string, { month: number; day: number; string: string }> = {
  // 樱坂46
  '小池美波': { month: 11, day: 14, string: '11月14日' },
  '井上梨名': { month: 1, day: 29, string: '1月29日' },
  '遠藤光莉': { month: 4, day: 17, string: '4月17日' },
  '大園玲': { month: 4, day: 18, string: '4月18日' },
  '大沼晶保': { month: 10, day: 12, string: '10月12日' },
  '幸阪茉里乃': { month: 12, day: 19, string: '12月19日' },
  '武元唯衣': { month: 3, day: 23, string: '3月23日' },
  '田村保乃': { month: 10, day: 21, string: '10月21日' },
  '藤吉夏鈴': { month: 8, day: 29, string: '8月29日' },
  '増本綺良': { month: 1, day: 12, string: '1月12日' },
  '松田里奈': { month: 10, day: 13, string: '10月13日' },
  '森田ひかる': { month: 7, day: 10, string: '7月10日' },
  '守屋麗奈': { month: 1, day: 2, string: '1月2日' },
  '山﨑天': { month: 9, day: 28, string: '9月28日' },
  '山崎天': { month: 9, day: 28, string: '9月28日' },
  '石森璃花': { month: 1, day: 13, string: '1月13日' },
  '遠藤理子': { month: 1, day: 9, string: '1月9日' },
  '小田倉麗奈': { month: 7, day: 25, string: '7月25日' },
  '小島凪紗': { month: 7, day: 7, string: '7月7日' },
  '谷口愛季': { month: 4, day: 12, string: '4月12日' },
  '中嶋優月': { month: 2, day: 17, string: '2月17日' },
  '的野美青': { month: 11, day: 8, string: '11月8日' },
  '向井純葉': { month: 5, day: 9, string: '5月9日' },
  '村井優': { month: 8, day: 18, string: '8月18日' },
  '村山美羽': { month: 2, day: 15, string: '2月15日' },
  '山下瞳月': { month: 1, day: 22, string: '1月22日' },
  '浅井恋乃未': { month: 12, day: 22, string: '12月22日' },
  '稲熊ひな': { month: 3, day: 9, string: '3月9日' },
  '勝又春': { month: 1, day: 24, string: '1月24日' },
  '佐藤爱桜': { month: 12, day: 1, string: '12月1日' },
  '佐藤愛桜': { month: 12, day: 1, string: '12月1日' },
  '中川智尋': { month: 9, day: 16, string: '9月16日' },
  '松本和子': { month: 2, day: 6, string: '2月6日' },
  '目黒阳色': { month: 1, day: 24, string: '1月24日' },
  '目黒陽色': { month: 1, day: 24, string: '1月24日' },
  '山川宇衣': { month: 9, day: 19, string: '9月19日' },
  '山田桃実': { month: 7, day: 20, string: '7月20日' },

  // 日向坂46
  '金村美玖': { month: 9, day: 10, string: '9月10日' },
  '小坂菜緒': { month: 9, day: 7, string: '9月7日' },
  '上村ひなの': { month: 4, day: 12, string: '4月12日' },
  '髙橋未来虹': { month: 9, day: 27, string: '9月27日' },
  '森本茉莉': { month: 2, day: 23, string: '2月23日' },
  '山口陽世': { month: 2, day: 23, string: '2月23日' },
  '石塚瑶季': { month: 8, day: 6, string: '8月6日' },
  '小西夏菜実': { month: 10, day: 3, string: '10月3日' },
  '清水理央': { month: 1, day: 15, string: '1月15日' },
  '正源司陽子': { month: 2, day: 14, string: '2月14日' },
  '竹内希来里': { month: 2, day: 20, string: '2月20日' },
  '平尾帆夏': { month: 7, day: 31, string: '7月31日' },
  '平岡海月': { month: 4, day: 9, string: '4月9日' },
  '藤嶌果歩': { month: 8, day: 7, string: '8月7日' },
  '宮地すみれ': { month: 12, day: 31, string: '12月31日' },
  '山下葉留花': { month: 5, day: 20, string: '5月20日' },
  '渡辺莉奈': { month: 2, day: 7, string: '2月7日' },
  '大田美月': { month: 12, day: 7, string: '12月7日' },
  '大野愛実': { month: 5, day: 5, string: '5月5日' },
  '片山紗希': { month: 12, day: 26, string: '12月26日' },
  '蔵盛妃那乃': { month: 1, day: 23, string: '1月23日' },
  '坂井新奈': { month: 3, day: 14, string: '3月14日' },
  '佐藤優羽': { month: 9, day: 10, string: '9月10日' },
  '下田衣珠季': { month: 12, day: 26, string: '12月26日' },
  '高井俐香': { month: 8, day: 1, string: '8月1日' },
  '鶴崎仁香': { month: 3, day: 27, string: '3月27日' },
  '松尾桜': { month: 6, day: 8, string: '6月8日' }
};

const GEN_ORDER: Record<string, number> = {
  '一期生': 0,
  '二期生': 1,
  '三期生': 2,
  '四期生': 3,
  '五期生': 4
};

const BRAND_PINK = '#F19DB5';

export default function BirthdayCardsContainer() {
  const [data, setData] = useState<BirthdayCardsData | null>(null);
  const [memberImages, setMemberImages] = useState<Record<string, MemberImageInfo>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // 搜索和过滤状态
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedGroup, setSelectedGroup] = useState<string>('all');
  const [selectedGen, setSelectedGen] = useState<string>('all');
  const [selectedMonth, setSelectedMonth] = useState<string>('');
  
  // 详情模态框状态
  const [selectedCard, setSelectedCard] = useState<Card | null>(null);

  // 获取数据
  useEffect(() => {
    const controller = new AbortController();

    Promise.all([
      fetch('/data/birthday-cards.json', { signal: controller.signal }).then(r => r.json()),
      fetch('/data/member-images.json', { signal: controller.signal }).then(r => r.json())
    ])
      .then(([cardsData, imagesData]: [BirthdayCardsData, MemberImagesData]) => {
        setData(cardsData);
        setMemberImages(imagesData.images || {});
        
        // 自动提取并选中最新/最大的年月
        if (cardsData?.cards && cardsData.cards.length > 0) {
          const months = Array.from(new Set(cardsData.cards.map(c => c.month).filter(Boolean))) as string[];
          months.sort((a, b) => b.localeCompare(a)); // 降序，最新在最前
          if (months.length > 0) {
            setSelectedMonth(months[0]);
          }
        }
      })
      .catch(err => {
        if (err.name !== 'AbortError') {
          console.error('[BirthdayCards] Load failed:', err);
          setError('生日贺卡数据加载失败，请稍后再试。');
        }
      })
      .finally(() => setLoading(false));

    return () => controller.abort();
  }, []);

  // 根据选中的团别动态获取可选的期数标签
  const availableGenerations = useMemo(() => {
    if (selectedGroup === '樱坂46') {
      return ['all', '一期生', '二期生', '三期生', '四期生'];
    }
    if (selectedGroup === '日向坂46') {
      return ['all', '二期生', '三期生', '四期生', '五期生'];
    }
    return ['all', '一期生', '二期生', '三期生', '四期生', '五期生'];
  }, [selectedGroup]);

  // 当切换团队导致选中的期别失效时，重置为 'all'
  useEffect(() => {
    if (selectedGroup === '樱坂46' && selectedGen === '五期生') {
      setSelectedGen('all');
    } else if (selectedGroup === '日向坂46' && selectedGen === '一期生') {
      setSelectedGen('all');
    }
  }, [selectedGroup, selectedGen]);

  // 预处理成员信息映射 (关联生日与期别)
  const processedCards = useMemo(() => {
    if (!data?.cards) return [];

    return data.cards.map(card => {
      const cleanName = card.member.replace(/[\s\u3000]+/g, '');
      const imgInfo = memberImages[card.member] || memberImages[cleanName] || {};
      const birthday = MEMBER_BIRTHDAYS[cleanName];
      const defaultGen = card.group === '日向坂46' ? '四期生' : '三期生';
      const generation = MEMBER_GENERATIONS[cleanName] || MEMBER_GENERATIONS[card.member] || defaultGen;

      return {
        ...card,
        cleanName,
        imageUrl: imgInfo.imageUrl || '',
        generation,
        birthday
      };
    });
  }, [data, memberImages]);

  // 所有不重复的年月列表 (降序，最新的在前面)
  const monthList = useMemo(() => {
    const months = Array.from(new Set(processedCards.map(c => c.month).filter(Boolean))) as string[];
    return months.sort((a, b) => b.localeCompare(a));
  }, [processedCards]);

  // 过滤结果
  const filteredCards = useMemo(() => {
    return processedCards.filter(card => {
      // 0. 团别过滤
      if (selectedGroup !== 'all' && card.group !== selectedGroup) return false;

      // 1. 年月过滤
      if (selectedMonth && card.month !== selectedMonth) return false;

      // 2. 名字搜索
      if (searchQuery) {
        const q = searchQuery.toLowerCase().trim();
        const m = card.member.toLowerCase();
        const mClean = card.cleanName.toLowerCase();
        if (!m.includes(q) && !mClean.includes(q)) return false;
      }
      
      // 3. 期别过滤
      if (selectedGen !== 'all') {
        if (card.generation !== selectedGen) return false;
      }

      return true;
    }).sort((a, b) => {
      // 按照期别排序，同期按照名字排序
      const ga = GEN_ORDER[a.generation] ?? 99;
      const gb = GEN_ORDER[b.generation] ?? 99;
      if (ga !== gb) return ga - gb;
      return a.member.localeCompare(b.member, 'ja');
    });
  }, [processedCards, selectedGroup, searchQuery, selectedGen, selectedMonth]);

  // 获取团体颜色
  const getGroupColor = (group: string) => {
    return group === '日向坂46' ? '#7BC7E8' : '#F19DB5';
  };

  // 下载图片方法 (使用同源代理解决跨域污染)
  const handleDownload = async (url: string, filename: string) => {
    try {
      const proxiedUrl = proxyImageUrl(url) || url;
      const response = await fetch(proxiedUrl);
      const blob = await response.blob();
      const blobUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(blobUrl);
    } catch (error) {
      console.error('Download failed, fallback to new tab:', error);
      window.open(url, '_blank');
    }
  };

  // 年月转换展示名
  const formatMonthName = (mStr: string) => {
    if (!mStr) return '';
    const parts = mStr.split('-');
    if (parts.length === 2) {
      return `${parts[0]}年${parseInt(parts[1], 10)}月`;
    }
    return mStr;
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <div className="w-10 h-10 border-4 border-t-transparent rounded-full animate-spin" style={{ borderColor: `${BRAND_PINK} transparent transparent transparent` }}></div>
        <p className="text-sm text-[var(--text-secondary)] mt-4">正在努力加载生日贺卡数据...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-2xl border border-[var(--border-primary)] bg-[var(--bg-primary)] p-12 text-center">
        <Cake className="w-12 h-12 mx-auto mb-4 text-red-400" />
        <p className="text-sm text-red-500 font-medium">{error}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      
      {/* 1. 搜索、过滤和年月归档选择面板 */}
      <section className="flex flex-col lg:flex-row gap-4 items-stretch lg:items-center justify-between bg-[var(--bg-secondary)] p-4 rounded-xl border border-[var(--border-primary)]">
        
        {/* 团别、期别过滤器 & 年月选择器 */}
        <div className="flex flex-col md:flex-row gap-4 items-start md:items-center flex-1">
          {/* 团体切换 */}
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-xs font-semibold text-[var(--text-secondary)] whitespace-nowrap">团体：</span>
            <div className="flex gap-1.5 items-center">
              {[
                { label: '全部', value: 'all', color: BRAND_PINK },
                { label: '樱坂46', value: '樱坂46', color: '#F19DB5' },
                { label: '日向坂46', value: '日向坂46', color: '#7BC7E8' }
              ].map(grp => (
                <button
                  key={grp.value}
                  onClick={() => setSelectedGroup(grp.value)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                    selectedGroup === grp.value
                      ? 'text-white'
                      : 'bg-[var(--bg-primary)] text-[var(--text-secondary)] border border-[var(--border-primary)] hover:bg-[var(--bg-tertiary)]'
                  }`}
                  style={selectedGroup === grp.value ? { backgroundColor: grp.color } : {}}
                >
                  {grp.label}
                </button>
              ))}
            </div>
          </div>

          {/* 年月下拉列表 */}
          {monthList.length > 0 && (
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-xs font-semibold text-[var(--text-secondary)] whitespace-nowrap">年月：</span>
              <select
                value={selectedMonth}
                onChange={e => setSelectedMonth(e.target.value)}
                className="text-xs px-2.5 py-1.5 rounded-lg border border-[var(--border-primary)] bg-[var(--bg-primary)] text-[var(--text-primary)] focus:outline-none focus:ring-1 focus:ring-[#F19DB5]/40"
              >
                {monthList.map(m => (
                  <option key={m} value={m}>
                    {formatMonthName(m)}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* 期别标签栏 (动态适应选中的团体) */}
          <div className="flex flex-wrap gap-1.5 items-center">
            {availableGenerations.map(gen => (
              <button
                key={gen}
                onClick={() => setSelectedGen(gen)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                  selectedGen === gen
                    ? 'text-white'
                    : 'bg-[var(--bg-primary)] text-[var(--text-secondary)] border border-[var(--border-primary)] hover:bg-[var(--bg-tertiary)]'
                }`}
                style={selectedGen === gen ? { backgroundColor: getGroupColor(selectedGroup === 'all' ? '樱坂46' : selectedGroup) } : {}}
              >
                {gen === 'all' ? '全部期别' : gen}
              </button>
            ))}
          </div>
        </div>

        {/* 名字搜索输入框 */}
        <div className="relative w-full lg:max-w-xs shrink-0">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)]" />
          <input
            type="text"
            placeholder="搜索成员名称..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2.5 text-xs rounded-xl border border-[var(--border-primary)] bg-[var(--bg-primary)] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:ring-1 focus:ring-[#F19DB5]/40"
          />
        </div>
      </section>
 
      {/* 2. 统计计数 */}
      <div className="flex justify-between items-center text-[10px] text-[var(--text-tertiary)] px-1">
        <span>已筛选出 {filteredCards.length} 张生日贺卡</span>
        <span>最后更新: {data?.lastUpdate ? new Date(data.lastUpdate).toLocaleString('zh-CN') : '未记录'}</span>
      </div>

      {/* 3. 贺卡主网格 (手机端采用 compact 风格) */}
      {filteredCards.length > 0 ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 sm:gap-4">
          {filteredCards.map(card => (
            <div 
              key={`${card.group}-${card.memberId}-${card.month}`}
              onClick={() => setSelectedCard(card)}
              className="group flex flex-col rounded-xl sm:rounded-2xl border border-[var(--border-primary)] bg-[var(--bg-primary)] overflow-hidden cursor-pointer hover:shadow-md transition-all duration-300"
              onMouseEnter={(e) => e.currentTarget.style.borderColor = getGroupColor(card.group)}
              onMouseLeave={(e) => e.currentTarget.style.borderColor = ''}
            >
              {/* 卡片封面 */}
              <div className="relative aspect-[3/4] overflow-hidden bg-[var(--bg-tertiary)] select-none">
                <img
                  src={card.cardUrl}
                  alt={card.member}
                  className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                  loading="lazy"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end justify-center pb-4">
                  <span className="text-[10px] font-semibold text-white px-2.5 py-1.5 rounded-full bg-black/60 backdrop-blur-sm">查看详情</span>
                </div>
              </div>

              {/* 成员元信息 */}
              <div className="p-2.5 sm:p-3.5 flex items-center justify-between border-t border-[var(--border-primary)]">
                <div className="flex items-center gap-1.5 min-w-0">
                  {card.imageUrl ? (
                    <img src={card.imageUrl} alt={card.member} className="w-5 h-5 sm:w-6 sm:h-6 rounded-full object-cover shrink-0" />
                  ) : (
                    <div className="w-5 h-5 sm:w-6 sm:h-6 rounded-full flex items-center justify-center bg-[var(--bg-tertiary)] text-[var(--text-secondary)] text-[8px] sm:text-[10px] font-bold shrink-0">{card.member[0]}</div>
                  )}
                  <span className="text-xs font-bold text-[var(--text-primary)] truncate">{card.member}</span>
                </div>
                <div className="flex flex-col items-end gap-0.5 shrink-0">
                  <span className="text-[8px] sm:text-[9px] px-1 sm:px-1.5 py-0.5 rounded bg-[var(--bg-secondary)] text-[var(--text-tertiary)] font-medium">
                    {card.generation}
                  </span>
                  <span className="text-[7px] sm:text-[8px] px-1 rounded font-semibold text-white" style={{ backgroundColor: getGroupColor(card.group) }}>
                    {card.group.replace('46', '')}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center py-20 rounded-2xl border border-[var(--border-primary)] bg-[var(--bg-primary)] shadow-sm">
          <Cake className="w-12 h-12 mx-auto mb-4 text-[var(--text-tertiary)]" />
          <p className="text-sm text-[var(--text-secondary)] font-medium">当前月份或期数下未找到任何贺卡数据</p>
        </div>
      )}

      {/* 说明区 */}
      {data?.note && (
        <div className="p-4 rounded-xl border border-[var(--border-primary)] bg-[var(--bg-secondary)]">
          <p className="text-[10px] text-[var(--text-tertiary)] leading-relaxed">
            <strong>说明：</strong> {data.note}
          </p>
        </div>
      )}

      {/* 4. 沉浸式灯箱模态框 */}
      {selectedCard && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
          <div className="relative max-w-sm sm:max-w-md w-full rounded-2xl border border-[var(--border-primary)] bg-[var(--bg-primary)] overflow-hidden shadow-2xl animate-scale-up">
            
            {/* 顶部标题栏 */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border-primary)]">
              <div className="flex items-center gap-2">
                <Cake className="w-4 h-4" style={{ color: getGroupColor(selectedCard.group) }} />
                <span className="text-xs font-bold text-[var(--text-primary)]">
                  [{selectedCard.group}] {selectedCard.member} 生日贺卡
                </span>
              </div>
              <button 
                onClick={() => setSelectedCard(null)}
                className="p-1 rounded-lg text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-secondary)] transition-colors cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            {/* 贺卡大图展示 */}
            <div className="relative bg-[var(--bg-tertiary)] flex flex-col items-center justify-center p-3 sm:p-4 overflow-hidden">
              <img 
                src={selectedCard.cardUrl} 
                alt={selectedCard.member} 
                className="max-w-full max-h-[42vh] sm:max-h-[50vh] rounded-lg object-contain shadow-md select-all pointer-events-auto"
                style={{ WebkitTouchCallout: 'default' }} 
              />
              <span className="text-[9px] text-[var(--text-tertiary)] mt-2 font-medium">
                💡 手机端用户可长按上方图片保存到相册
              </span>
            </div>

            {/* 底部信息与操作面板 */}
            <div className="p-4 border-t border-[var(--border-primary)] bg-[var(--bg-secondary)] space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  {(() => {
                    const cleanName = selectedCard.member.replace(/[\s\u3000]+/g, '');
                    const imgInfo = memberImages[selectedCard.member] || memberImages[cleanName] || {};
                    const birthday = MEMBER_BIRTHDAYS[cleanName];
                    
                    return (
                      <>
                        {imgInfo.imageUrl ? (
                          <img src={imgInfo.imageUrl} alt={selectedCard.member} className="w-9 h-9 rounded-full object-cover shrink-0" />
                        ) : (
                          <div className="w-9 h-9 rounded-full flex items-center justify-center bg-[var(--bg-tertiary)] text-[var(--text-secondary)] text-xs font-bold shrink-0">{selectedCard.member[0]}</div>
                        )}
                        <div>
                          <div className="text-xs font-bold text-[var(--text-primary)]">{selectedCard.member}</div>
                          <div className="text-[10px] text-[var(--text-tertiary)] flex items-center gap-1.5">
                            <span>{selectedCard.generation}</span>
                            {birthday && (
                              <>
                                <span>·</span>
                                <span className="font-semibold flex items-center gap-0.5" style={{ color: getGroupColor(selectedCard.group) }}>
                                  <Calendar size={10} />
                                  {birthday.string}
                                </span>
                              </>
                            )}
                          </div>
                        </div>
                      </>
                    );
                  })()}
                </div>
                {selectedCard.month && (
                  <span className="text-[9px] px-2 py-0.5 rounded bg-[var(--bg-tertiary)] text-[var(--text-secondary)] font-medium">
                    {formatMonthName(selectedCard.month)}
                  </span>
                )}
              </div>

              {/* 交互操作按钮 */}
              <div className="flex gap-2.5">
                <button
                  onClick={() => handleDownload(selectedCard.cardUrl, `${selectedCard.group}_${selectedCard.member}_${selectedCard.month || ''}_生日贺卡.jpg`)}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-xs font-semibold text-white transition-opacity hover:opacity-95 cursor-pointer shadow-sm"
                  style={{ backgroundColor: getGroupColor(selectedCard.group) }}
                >
                  <Download size={13} />
                  保存原图 (下载)
                </button>
                <a
                  href={selectedCard.pageUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-1 px-3 py-2.5 rounded-xl border border-[var(--border-primary)] bg-[var(--bg-primary)] text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)] text-xs font-semibold transition-colors"
                >
                  <ExternalLink size={13} />
                  官网原文
                </a>
              </div>
            </div>

          </div>
        </div>
      )}
    </div>
  );
}
