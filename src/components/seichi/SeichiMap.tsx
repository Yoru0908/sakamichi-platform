import { useEffect, useRef, useState, useMemo } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import {
  Search,
  X,
  MapPin,
  Navigation,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
  Film,
  Video,
  User,
  BookOpen,
  MessageSquare,
  Sparkles,
  Tag,
  Lock,
  LockOpen,
  Layers,
  List,
  Map as MapIcon,
} from 'lucide-react';

interface Feature {
  type: 'Feature';
  geometry: { type: 'Point'; coordinates: [number, number] };
  properties: {
    id: string;
    name: string;
    category: string;
    subcategory: string;
    categoryColor: string;
    address: string;
    sceneTitle: string;
    sceneNote: string;
    sourceLabel: string;
    sourceUrl: string;
    referenceUrl: string;
    tags: string[];
    images: string[];
    members?: string[];
    source?: {
      provider?: string;
      url?: string;
      mapId?: string;
      layer?: string;
      tags?: string[];
      name?: string;
    };
    classification?: {
      category?: string;
      subcategory?: string;
      method?: string;
      status?: string;
    };
    classificationCandidates?: {
      members?: string[];
      projects?: string[];
      contentTypes?: string[];
    };
  };
}

interface GeoJSON {
  type: 'FeatureCollection';
  features: Feature[];
}

interface Props {
  geojsonUrl: string;
  fallbackGeojsonUrl?: string;
  memberName: string;
  groupLabel?: string;
  groupColor?: string;
}

const getFeatureTags = (feature: Feature): string[] =>
  Array.from(
    new Set([
      ...(feature.properties.tags || []),
      ...(feature.properties.source?.tags || []),
      ...(feature.properties.members || []),
    ].filter(Boolean))
  );

type FacetTagKind = 'member' | 'project';
interface FacetTag {
  name: string;
  kind: FacetTagKind;
}

const GENERATION_RE = /^[一二三四五六七八九十]+期生$/;
const KNOWN_MEMBER_NAMES = new Set([
  '森田ひかる', '田村保乃', '藤吉夏鈴', '守屋麗奈', '山﨑天', '大園玲',
  '武元唯衣', '松田里奈', '井上梨名', '増本綺良', '大沼晶保', '幸阪茉里乃',
  '小池美波', '遠藤光莉', '的野美青', '山下瞳月', '谷口愛季', '村井優',
  '中嶋優月', '小島凪紗', '村山美羽', '遠藤理子', '小田倉麗奈', '石森璃花',
  '向井純葉', '山川宇衣', '佐藤愛桜', '浅井恋乃未', '稲熊ひな', '勝又春',
  '中川智尋', '松本和子', '目黒陽色', '山田桃実',
]);
const GENERIC_PROJECTS = new Set([
  '',
  'MISC',
  'Vlog',
  'MV・楽曲',
  '個人PV',
  '番組・イベント',
  '雑誌・グラビア',
  '公式Blog・写真',
  'fumi Diary 新着',
  'PV&ジャケット写真',
  '櫻坂46 blog',
  '欅坂46 blog',
  'テレビ',
  'サイン',
]);

const getFeatureFacetTags = (feature: Feature): FacetTag[] => {
  const { properties } = feature;
  const facets = new Map<string, FacetTagKind>();

  (properties.members || []).forEach((member) => {
    if (KNOWN_MEMBER_NAMES.has(member)) facets.set(member, 'member');
  });
  [...(properties.tags || []), ...(properties.source?.tags || [])].forEach((tag) => {
    if (GENERATION_RE.test(tag)) facets.set(tag, 'member');
  });

  const projectCandidates = [properties.subcategory];
  [properties.sceneTitle, properties.sceneNote, properties.source?.layer].forEach((text) => {
    if (!text) return;
    for (const match of text.matchAll(/[「『](.+?)[」』]/g)) {
      projectCandidates.push(match[1].trim());
    }
  });
  projectCandidates.forEach((project) => {
    const value = project?.trim();
    if (
      value &&
      value !== properties.category &&
      !GENERIC_PROJECTS.has(value) &&
      value.length <= 60
    ) {
      if (!facets.has(value)) facets.set(value, 'project');
    }
  });

  return Array.from(facets, ([name, kind]) => ({ name, kind }));
};

const hasFacetTag = (feature: Feature, tag: string): boolean =>
  getFeatureFacetTags(feature).some((facet) => facet.name === tag);

export default function SeichiMap({
  geojsonUrl,
  fallbackGeojsonUrl,
  memberName,
  groupLabel = '櫻坂46',
  groupColor = 'var(--color-brand-sakura)',
}: Props) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markersLayerRef = useRef<L.LayerGroup | null>(null);

  const [data, setData] = useState<GeoJSON | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  // 大层级 (Category) & 小层级 (Subcategory)
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [selectedSubcategory, setSelectedSubcategory] = useState<string>('ALL');
  const [selectedTag, setSelectedTag] = useState<string>('ALL');
  const [facetSearch, setFacetSearch] = useState('');
  const [facetLocked, setFacetLocked] = useState(false);

  const [selectedFeature, setSelectedFeature] = useState<Feature | null>(null);
  const [activeImageIndex, setActiveImageIndex] = useState(0);
  
  // 桌面端侧边栏展开
  const [sidebarOpen, setSidebarOpen] = useState(true);
  // 移动端视图模式：'map' | 'list'
  const [mobileView, setMobileView] = useState<'map' | 'list'>('map');

  // 1. 获取 GeoJSON 数据；动态数据异常时回退到随 Pages 发布的静态快照。
  useEffect(() => {
    let cancelled = false;
    const urls = Array.from(new Set([geojsonUrl, fallbackGeojsonUrl].filter(Boolean))) as string[];

    const load = async () => {
      let lastError: unknown = new Error('No GeoJSON URL configured');
      for (const url of urls) {
        try {
          const response = await fetch(url);
          if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
          const next = await response.json() as GeoJSON;
          if (next.type !== 'FeatureCollection' || !Array.isArray(next.features)) {
            throw new Error(`${url}: invalid FeatureCollection`);
          }
          if (!cancelled) setData(next);
          return;
        } catch (error) {
          lastError = error;
          console.warn('Failed to load GeoJSON source:', error);
        }
      }
      console.error('Failed to load GeoJSON:', lastError);
    };

    setLoading(true);
    load().finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [geojsonUrl, fallbackGeojsonUrl]);

  // 重置图片索引
  useEffect(() => {
    setActiveImageIndex(0);
  }, [selectedFeature]);

  // 键盘 Esc 取消选择
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setSelectedFeature(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // 2. 初始化 Leaflet 地图
  useEffect(() => {
    if (!mapContainer.current || mapInstanceRef.current) return;

    const map = L.map(mapContainer.current, {
      center: [36.2, 139.2],
      zoom: 7,
      zoomControl: false,
    });

    L.control.zoom({ position: 'topright' }).addTo(map);

    L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
      subdomains: 'abcd',
      maxZoom: 20,
    }).addTo(map);

    // 点击地图空白处自动取消选择
    map.on('click', (e: L.LeafletMouseEvent) => {
      const orig = e.originalEvent?.target as HTMLElement;
      if (!orig || !orig.closest('.custom-seichi-marker')) {
        setSelectedFeature(null);
      }
    });

    const markersGroup = L.layerGroup().addTo(map);
    markersLayerRef.current = markersGroup;
    mapInstanceRef.current = map;

    const resizeObserver = new ResizeObserver(() => {
      map.invalidateSize();
    });
    resizeObserver.observe(mapContainer.current);

    return () => {
      resizeObserver.disconnect();
      map.remove();
      mapInstanceRef.current = null;
    };
  }, []);

  // 3. 大层级与小层级聚合
  const categories = useMemo(() => {
    if (!data) return [];
    const pool =
      selectedTag === 'ALL'
        ? data.features
        : data.features.filter((feature) => hasFacetTag(feature, selectedTag));
    const map = new Map<string, number>();
    pool.forEach((f) => {
      const cat = f.properties.category;
      map.set(cat, (map.get(cat) || 0) + 1);
    });

    return Array.from(map.entries()).map(([name, count]) => ({
      name,
      count,
      color:
        data.features.find((f) => f.properties.category === name)?.properties.categoryColor ||
        '#666',
    }));
  }, [data, selectedTag]);

  const categoryScopeCount = useMemo(() => {
    if (!data) return 0;
    return selectedTag === 'ALL'
      ? data.features.length
      : data.features.filter((feature) => hasFacetTag(feature, selectedTag)).length;
  }, [data, selectedTag]);

  const subcategories = useMemo(() => {
    if (!data || selectedCategory === 'ALL') return [];
    const pool = data.features.filter(
      (feature) =>
        feature.properties.category === selectedCategory &&
        (selectedTag === 'ALL' || hasFacetTag(feature, selectedTag))
    );

    const map = new Map<string, number>();
    pool.forEach((f) => {
      const sub = f.properties.subcategory;
      if (sub && !GENERIC_PROJECTS.has(sub) && sub !== f.properties.category) {
        map.set(sub, (map.get(sub) || 0) + 1);
      }
    });

    return Array.from(map.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'ja'));
  }, [data, selectedCategory, selectedTag]);

  const subcategoryScopeCount = useMemo(() => {
    if (!data) return 0;
    return data.features.filter(
      (feature) =>
        (selectedCategory === 'ALL' || feature.properties.category === selectedCategory) &&
        (selectedTag === 'ALL' || hasFacetTag(feature, selectedTag))
    ).length;
  }, [data, selectedCategory, selectedTag]);

  const tagOptions = useMemo(() => {
    if (!data) return [];
    const map = new Map<string, { count: number; kind: FacetTagKind }>();
    data.features.forEach((feature) => {
      getFeatureFacetTags(feature).forEach((tag) => {
        const current = map.get(tag.name);
        map.set(tag.name, {
          count: (current?.count || 0) + 1,
          kind: current?.kind === 'member' ? 'member' : tag.kind,
        });
      });
    });
    return Array.from(map.entries())
      .map(([name, option]) => ({ name, ...option }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'ja'));
  }, [data]);

  const normalizedFacetSearch = facetSearch.toLocaleLowerCase('ja').trim();
  const memberTagOptions = tagOptions.filter(
    (tag) =>
      tag.kind === 'member' &&
      (!normalizedFacetSearch || tag.name.toLocaleLowerCase('ja').includes(normalizedFacetSearch))
  );
  const projectTagOptions = tagOptions.filter(
    (tag) =>
      tag.kind === 'project' &&
      (!normalizedFacetSearch || tag.name.toLocaleLowerCase('ja').includes(normalizedFacetSearch))
  );

  // 4. 多层级与搜索过滤
  const filteredFeatures = useMemo(() => {
    if (!data) return [];
    const q = search.toLowerCase().trim();

    return data.features.filter((f) => {
      const p = f.properties;

      if (selectedCategory !== 'ALL' && p.category !== selectedCategory) {
        return false;
      }

      if (selectedSubcategory !== 'ALL' && p.subcategory !== selectedSubcategory) {
        return false;
      }

      if (selectedTag !== 'ALL' && !hasFacetTag(f, selectedTag)) {
        return false;
      }

      if (q) {
        const text = [
          p.name,
          p.address,
          p.sceneTitle,
          p.sceneNote,
          p.sourceLabel,
          p.source?.layer,
          ...(p.source?.tags || []),
          p.classification?.category,
          p.classification?.subcategory,
          p.category,
          p.subcategory,
          ...getFeatureTags(f),
        ]
          .join(' ')
          .toLowerCase();
        if (!text.includes(q)) return false;
      }

      return true;
    });
  }, [data, selectedCategory, selectedSubcategory, selectedTag, search]);

  // 5. 渲染地图标记 (自定义 SVG 圆形 Marker)
  useEffect(() => {
    if (!mapInstanceRef.current || !markersLayerRef.current) return;
    const markersGroup = markersLayerRef.current;
    markersGroup.clearLayers();

    filteredFeatures.forEach((f) => {
      const p = f.properties;
      const [lng, lat] = f.geometry.coordinates;

      const isSelected = selectedFeature?.properties.id === p.id;
      const size = isSelected ? 20 : 14;
      const borderWidth = isSelected ? 3 : 2;

      const icon = L.divIcon({
        className: 'custom-seichi-marker',
        html: `
          <div style="
            width: ${size}px;
            height: ${size}px;
            border-radius: 50%;
            background-color: ${p.categoryColor};
            border: ${borderWidth}px solid #ffffff;
            box-shadow: 0 2px 6px rgba(0,0,0,0.35);
            transition: transform 0.15s ease;
            cursor: pointer;
          "></div>
        `,
        iconSize: [size, size],
        iconAnchor: [size / 2, size / 2],
      });

      const marker = L.marker([lat, lng], { icon });
      marker.on('click', (e) => {
        L.DomEvent.stopPropagation(e);
        setSelectedFeature((prev) => (prev?.properties.id === p.id ? null : f));
        if (mapInstanceRef.current) {
          mapInstanceRef.current.flyTo(
            [lat, lng],
            Math.max(mapInstanceRef.current.getZoom(), 15),
            { duration: 0.6 }
          );
        }
      });

      markersGroup.addLayer(marker);
    });
  }, [filteredFeatures, selectedFeature]);

  // 列表项点击逻辑（支持重复点击取消选择）
  const handleSelectFeature = (f: Feature) => {
    setSelectedFeature((prev) => (prev?.properties.id === f.properties.id ? null : f));
    if (window.innerWidth < 768) {
      setMobileView('map');
    }
    if (mapInstanceRef.current) {
      const [lng, lat] = f.geometry.coordinates;
      mapInstanceRef.current.flyTo([lat, lng], Math.max(mapInstanceRef.current.getZoom(), 15), {
        duration: 0.6,
      });
    }
  };

  const renderCategoryIcon = (catName: string, size = 14) => {
    switch (catName) {
      case 'MV・楽曲':
      case 'PV&ジャケット写真':
        return <Film size={size} />;
      case 'Vlog・企画':
      case 'テレビ':
        return <Video size={size} />;
      case '個人PV':
      case 'サイン':
        return <User size={size} />;
      case '雑誌・グラビア':
      case '雑誌':
        return <BookOpen size={size} />;
      case 'Blog・MSG':
      case '欅坂46 blog':
      case '櫻坂46 blog':
        return <MessageSquare size={size} />;
      default:
        return <MapPin size={size} />;
    }
  };

  const selProps = selectedFeature?.properties;
  const [selLng, selLat] = selectedFeature?.geometry.coordinates || [0, 0];
  const coordinateQuery = `${selLat},${selLng}`;
  // Address-backed venues should resolve to Google's official Place rather than
  // a raw coordinate, which may be a block centroid or a point beside the entrance.
  // Roads and scene-only points without an address keep their exact source coordinate.
  const namedPlaceQuery = [selProps?.name, selProps?.address]
    .map((value) => value?.trim())
    .filter(Boolean)
    .join(' ');
  const googleMapsQuery = namedPlaceQuery || coordinateQuery;
  const encodedGoogleMapsQuery = encodeURIComponent(googleMapsQuery);
  const gmapsSearchUrl = `https://www.google.com/maps/search/?api=1&query=${encodedGoogleMapsQuery}`;
  const gmapsDirUrl = `https://www.google.com/maps/dir/?api=1&destination=${encodedGoogleMapsQuery}`;
  const currentImages = selProps?.images || [];

  return (
    <div className="relative flex flex-col md:flex-row w-full" style={{ height: 'calc(100vh - 56px)', overflow: 'hidden' }}>
      {/* 侧边栏（桌面端侧滑，移动端全屏切换） */}
      <aside
        style={{
          width: sidebarOpen ? undefined : '0px',
          minWidth: sidebarOpen ? undefined : '0px',
        }}
        className={`
          ${mobileView === 'list' ? 'flex' : 'hidden'} md:flex
          md:w-[380px] md:min-w-[380px]
          relative z-20 flex-col h-full overflow-hidden bg-[var(--bg-primary)] border-r border-[var(--border-primary)] shadow-sm
          transition-all duration-250
        `}
      >
        {/* 顶部标题与搜索栏 */}
        <div className="p-3.5 sm:p-4 border-b border-[var(--border-primary)]">
          <div className="flex items-center justify-between mb-2">
            <div>
              <h1 className="text-sm sm:text-base font-bold text-[var(--text-primary)] tracking-tight">
                {memberName} 聖地巡礼マップ
              </h1>
              <p className="text-[11px] text-[var(--text-tertiary)] mt-0.5">
                全 {data?.features.length || 0} スポット収録
              </p>
            </div>
            <span
              className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-semibold tracking-wider rounded-full text-white"
              style={{ backgroundColor: groupColor }}
            >
              {groupLabel}
            </span>
          </div>

          {/* 全局搜索框 */}
          <div className="relative mt-2.5">
            <Search size={14} className="absolute left-2.5 top-2.5 text-[var(--text-tertiary)]" />
            <input
              type="text"
              placeholder="地点名・住所・番組名で検索..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setSelectedFeature(null);
              }}
              className="w-full pl-8 pr-7 py-1.5 text-xs rounded-lg border border-[var(--border-primary)] bg-[var(--bg-secondary)] text-[var(--text-primary)] placeholder-[var(--text-tertiary)] focus:outline-none focus:border-[var(--color-brand-sakura)] transition-colors"
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                className="absolute right-2 top-2 p-0.5 text-[var(--text-tertiary)] hover:text-[var(--text-primary)] rounded"
              >
                <X size={12} />
              </button>
            )}
          </div>
        </div>

        {/* 大层级 Tab 栏（支持横向滑动） */}
        <div className="border-b border-[var(--border-primary)] bg-[var(--bg-secondary)] px-3 py-2 overflow-x-auto no-scrollbar">
          <div className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-tertiary)] mb-1.5 px-0.5">
            <Layers size={11} />
            <span>大分類</span>
          </div>
          <div className="flex gap-1.5 min-w-max pb-0.5">
            <button
              onClick={() => {
                setSelectedCategory('ALL');
                setSelectedSubcategory('ALL');
                if (!facetLocked) setSelectedTag('ALL');
                setSelectedFeature(null);
              }}
              className={`px-2.5 py-1 text-xs font-medium rounded-md transition-all shrink-0 ${
                selectedCategory === 'ALL'
                  ? 'bg-[var(--text-primary)] text-[var(--bg-primary)] shadow-sm'
                  : 'bg-[var(--bg-primary)] text-[var(--text-secondary)] border border-[var(--border-primary)] hover:border-[var(--border-secondary)]'
              }`}
            >
              すべて ({categoryScopeCount})
            </button>
            {categories.map((cat) => (
              <button
                key={cat.name}
                onClick={() => {
                  setSelectedCategory(cat.name);
                  setSelectedSubcategory('ALL');
                  if (!facetLocked) setSelectedTag('ALL');
                  setSelectedFeature(null);
                }}
                className={`px-2.5 py-1 text-xs font-medium rounded-md flex items-center gap-1.5 transition-all shrink-0 ${
                  selectedCategory === cat.name
                    ? 'text-white shadow-sm'
                    : 'bg-[var(--bg-primary)] text-[var(--text-secondary)] border border-[var(--border-primary)] hover:border-[var(--border-secondary)]'
                }`}
                style={{
                  backgroundColor: selectedCategory === cat.name ? cat.color : undefined,
                }}
              >
                <span>{renderCategoryIcon(cat.name, 12)}</span>
                <span>{cat.name}</span>
                <span className="opacity-75 text-[10px]">({cat.count})</span>
              </button>
            ))}
          </div>
        </div>

        {/* 小层级 (Subcategory) Chips */}
        {subcategories.length > 0 && (
          <div className="border-b border-[var(--border-primary)] bg-[var(--bg-primary)] px-3 py-2 overflow-x-auto no-scrollbar">
            <div className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-tertiary)] mb-1.5 px-0.5">
              <Sparkles size={11} />
              <span>企画・作品</span>
            </div>
            <div className="flex flex-wrap gap-1 max-h-24 overflow-y-auto">
              <button
                onClick={() => {
                  setSelectedSubcategory('ALL');
                  if (!facetLocked) setSelectedTag('ALL');
                  setSelectedFeature(null);
                }}
                className={`px-2 py-0.5 text-[11px] rounded-full transition-colors ${
                  selectedSubcategory === 'ALL'
                    ? 'bg-[var(--border-secondary)] text-[var(--text-primary)] font-semibold'
                    : 'bg-[var(--bg-secondary)] text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]'
                }`}
              >
                全企画 ({subcategoryScopeCount})
              </button>
              {subcategories.map((sub) => (
                <button
                  key={sub.name}
                  onClick={() => {
                    setSelectedSubcategory(sub.name);
                    if (!facetLocked) setSelectedTag('ALL');
                    setSelectedFeature(null);
                  }}
                  className={`px-2 py-0.5 text-[11px] rounded-full transition-colors ${
                    selectedSubcategory === sub.name
                      ? 'bg-[var(--border-secondary)] text-[var(--text-primary)] font-semibold'
                      : 'bg-[var(--bg-secondary)] text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]'
                  }`}
                >
                  {sub.name} ({sub.count})
                </button>
              ))}
            </div>
          </div>
        )}

        {tagOptions.length > 0 && (
          <div className="border-b border-[var(--border-primary)] bg-[var(--bg-secondary)] px-3 py-2">
            <div className="flex items-center justify-between gap-2 mb-1.5 px-0.5">
              <div className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-tertiary)]">
                <Tag size={11} />
                <span>メンバー・作品</span>
              </div>
              {selectedTag !== 'ALL' && (
                <div className="flex min-w-0 items-center gap-1.5">
                  <span className="max-w-28 truncate text-[10px] text-[var(--text-secondary)]">
                    選択中: {selectedTag}
                  </span>
                  <button
                    type="button"
                    aria-pressed={facetLocked}
                    aria-label={facetLocked ? 'メンバー・作品条件の固定を解除' : 'メンバー・作品条件を固定'}
                    title={facetLocked ? '固定中：分類を変えても条件を維持します' : '固定すると分類を変えても条件を維持します'}
                    onClick={() => setFacetLocked((locked) => !locked)}
                    className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-medium transition-colors ${
                      facetLocked
                        ? 'border-[var(--color-brand-sakura)] bg-[var(--color-brand-sakura)] text-white'
                        : 'border-[var(--border-primary)] bg-[var(--bg-primary)] text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]'
                    }`}
                  >
                    <span className="t-icon-swap" data-state={facetLocked ? 'a' : 'b'} aria-hidden="true">
                      <span className="t-icon" data-icon="a"><Lock size={10} /></span>
                      <span className="t-icon" data-icon="b"><LockOpen size={10} /></span>
                    </span>
                    <span>{facetLocked ? '固定中' : '固定'}</span>
                  </button>
                </div>
              )}
            </div>
            <div className="relative mb-1.5">
              <Search size={11} className="absolute left-2 top-1.5 text-[var(--text-tertiary)]" />
              <input
                type="search"
                value={facetSearch}
                onChange={(event) => setFacetSearch(event.target.value)}
                placeholder="メンバー・楽曲・作品を検索"
                className="w-full rounded-md border border-[var(--border-primary)] bg-[var(--bg-primary)] py-1 pl-6 pr-2 text-[10px] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:border-[var(--color-brand-sakura)]"
              />
            </div>
            <div className="max-h-36 overflow-y-auto pr-0.5">
              <div className="flex flex-wrap gap-1">
                <button
                  onClick={() => {
                    setSelectedTag('ALL');
                    setFacetLocked(false);
                    setSelectedFeature(null);
                  }}
                  className={`px-2 py-0.5 text-[11px] rounded-full transition-colors ${
                    selectedTag === 'ALL'
                      ? 'bg-[var(--border-secondary)] text-[var(--text-primary)] font-semibold'
                      : 'bg-[var(--bg-primary)] text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]'
                  }`}
                >
                  すべて ({data?.features.length || 0})
                </button>
                {memberTagOptions.map((tag) => (
                  <button
                    key={`member-${tag.name}`}
                    onClick={() => {
                      setSelectedTag(tag.name);
                      setSelectedCategory('ALL');
                      setSelectedSubcategory('ALL');
                      setSelectedFeature(null);
                    }}
                    className={`px-2 py-0.5 text-[11px] rounded-full transition-colors ${
                      selectedTag === tag.name
                        ? 'bg-[var(--color-brand-sakura)] text-white font-semibold'
                        : 'bg-[var(--bg-primary)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                    }`}
                  >
                    {tag.name} ({tag.count})
                  </button>
                ))}
              </div>
              {projectTagOptions.length > 0 && (
                <>
                  <div className="my-1.5 border-t border-[var(--border-primary)]" />
                  <div className="flex flex-wrap gap-1">
                    {projectTagOptions.map((tag) => (
                      <button
                        key={`project-${tag.name}`}
                        onClick={() => {
                          setSelectedTag(tag.name);
                          setSelectedCategory('ALL');
                          setSelectedSubcategory('ALL');
                          setSelectedFeature(null);
                        }}
                        className={`px-2 py-0.5 text-[11px] rounded-full transition-colors ${
                          selectedTag === tag.name
                            ? 'bg-[var(--color-brand-sakura)] text-white font-semibold'
                            : 'bg-[var(--bg-primary)] text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]'
                        }`}
                      >
                        {tag.name} ({tag.count})
                      </button>
                    ))}
                  </div>
                </>
              )}
              {memberTagOptions.length === 0 && projectTagOptions.length === 0 && (
                <p className="py-2 text-center text-[10px] text-[var(--text-tertiary)]">
                  該当するメンバー・作品がありません
                </p>
              )}
            </div>
          </div>
        )}

        {/* 地点列表（含缩略图预览） */}
        <div className="flex-1 overflow-y-auto divide-y divide-[var(--border-primary)]">
          {filteredFeatures.map((f) => {
            const fp = f.properties;
            const isSelected = selectedFeature?.properties.id === fp.id;
            const hasImg = fp.images && fp.images.length > 0;

            return (
              <div
                key={fp.id}
                onClick={() => handleSelectFeature(f)}
                className={`p-3 cursor-pointer transition-colors ${
                  isSelected
                    ? 'bg-[var(--bg-tertiary)] border-l-4'
                    : 'hover:bg-[var(--bg-secondary)]'
                }`}
                style={{
                  borderLeftColor: isSelected ? fp.categoryColor : 'transparent',
                }}
              >
                <div className="flex items-start gap-3">
                  {/* 缩略图小窗 */}
                  <div className="relative w-12 h-12 rounded-lg overflow-hidden bg-[var(--bg-secondary)] border border-[var(--border-primary)] shrink-0 flex items-center justify-center">
                    {hasImg ? (
                      <img
                        src={fp.images[0]}
                        alt={fp.name}
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          (e.target as HTMLElement).style.display = 'none';
                        }}
                      />
                    ) : (
                      <div className="text-[var(--text-tertiary)] flex flex-col items-center justify-center">
                        {renderCategoryIcon(fp.category, 16)}
                      </div>
                    )}
                    {hasImg && fp.images.length > 1 && (
                      <span className="absolute bottom-0.5 right-0.5 px-1 text-[8px] font-bold bg-black/60 text-white rounded">
                        {fp.images.length}
                      </span>
                    )}
                  </div>

                  {/* 标题 & 详情 */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-1">
                      <h4 className="text-xs font-bold text-[var(--text-primary)] truncate">
                        {fp.name}
                      </h4>
                      <span
                        className="text-[9px] px-1.5 py-0.2 rounded font-medium shrink-0"
                        style={{
                          backgroundColor: `color-mix(in srgb, ${fp.categoryColor} 12%, transparent)`,
                          color: fp.categoryColor,
                        }}
                      >
                        {fp.subcategory}
                      </span>
                    </div>
                    {fp.sceneTitle && (
                      <p className="text-[11px] text-[var(--text-secondary)] truncate mt-0.5">
                        {fp.sceneTitle}
                      </p>
                    )}
                    {fp.address && (
                      <p className="text-[10px] text-[var(--text-tertiary)] truncate mt-0.5">
                        {fp.address}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            );
          })}

          {filteredFeatures.length === 0 && (
            <div className="p-8 text-center text-xs text-[var(--text-tertiary)]">
              該当するスポットが見つかりません
            </div>
          )}
        </div>

        {/* 来源与致谢说明 */}
        <div className="p-3 border-t border-[var(--border-primary)] bg-[var(--bg-secondary)] text-[10px] text-[var(--text-tertiary)] leading-relaxed">
          <p className="font-semibold text-[var(--text-secondary)] mb-0.5">データ出典・参考：</p>
          <p>• 櫻坂チャンネル YouTube / 公式ブログ / 雑誌</p>
          <p>• ロケ地考証：fumi Diary 2号店 様</p>
        </div>
      </aside>

      {/* 地图主体区域 */}
      <main className={`relative flex-1 h-full ${mobileView === 'map' ? 'block' : 'hidden md:block'}`}>
        {/* 桌面端侧边栏折叠按钮 */}
        <button
          onClick={() => setSidebarOpen(!sidebarOpen)}
          className="hidden md:flex absolute top-3 left-3 z-[1000] items-center justify-center w-8 h-8 rounded-lg bg-[var(--bg-primary)] text-[var(--text-primary)] border border-[var(--border-primary)] shadow-md hover:bg-[var(--bg-secondary)] transition-all"
          title={sidebarOpen ? 'サイドバーを閉じる' : 'サイドバーを開く'}
        >
          {sidebarOpen ? <ChevronLeft size={16} /> : <ChevronRight size={16} />}
        </button>

        {/* 移动端地图/列表切换 FAB */}
        <div className="md:hidden absolute top-3 right-3 z-[1000] flex items-center gap-2">
          <button
            onClick={() => setMobileView(mobileView === 'map' ? 'list' : 'map')}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[var(--bg-primary)] text-[var(--text-primary)] border border-[var(--border-primary)] shadow-md text-xs font-semibold backdrop-blur-md"
          >
            {mobileView === 'map' ? (
              <>
                <List size={14} />
                <span>リスト ({filteredFeatures.length})</span>
              </>
            ) : (
              <>
                <MapIcon size={14} />
                <span>マップ</span>
              </>
            )}
          </button>
        </div>

        {/* Loading 提示 */}
        {loading && (
          <div className="absolute inset-0 z-[1001] flex items-center justify-center bg-[var(--bg-primary)]/80 backdrop-blur-sm">
            <p className="text-xs font-medium text-[var(--text-secondary)]">マップデータを読み込み中...</p>
          </div>
        )}

        {/* Leaflet 挂载容器 */}
        <div ref={mapContainer} className="w-full h-full" style={{ background: '#f3f4f6' }} />

        {/* 选中的地点详情卡片（底部浮动弹窗 / 移动端 Bottom Sheet） */}
        {selectedFeature && selProps && (
          <div
            className="
              absolute z-[1000] overflow-hidden transition-all duration-200
              bottom-2 left-2 right-2 md:bottom-5 md:left-1/2 md:-translate-x-1/2 md:right-auto
              w-auto md:w-[440px] max-h-[85vh] md:max-h-[80vh]
              rounded-2xl bg-[var(--bg-primary)] border border-[var(--border-primary)] shadow-2xl flex flex-col
            "
          >
            {/* 多图轮播与大图展示 */}
            {currentImages.length > 0 && (
              <div className="relative w-full h-40 sm:h-48 bg-[var(--bg-tertiary)] overflow-hidden shrink-0">
                <img
                  src={currentImages[activeImageIndex] || currentImages[0]}
                  alt={selProps.name}
                  className="w-full h-full object-cover transition-opacity duration-200"
                  onError={(e) => {
                    (e.target as HTMLElement).style.display = 'none';
                  }}
                />

                {/* 分类小标 */}
                <span
                  className="absolute top-2.5 left-2.5 px-2 py-0.5 text-[10px] font-bold text-white rounded-md shadow-sm"
                  style={{ backgroundColor: selProps.categoryColor }}
                >
                  {selProps.category} · {selProps.subcategory}
                </span>

                {/* 多图切换控制器 */}
                {currentImages.length > 1 && (
                  <>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setActiveImageIndex((prev) =>
                          prev === 0 ? currentImages.length - 1 : prev - 1
                        );
                      }}
                      className="absolute left-2 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full bg-black/50 hover:bg-black/75 text-white flex items-center justify-center transition-colors"
                    >
                      <ChevronLeft size={16} />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setActiveImageIndex((prev) =>
                          prev === currentImages.length - 1 ? 0 : prev + 1
                        );
                      }}
                      className="absolute right-2 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full bg-black/50 hover:bg-black/75 text-white flex items-center justify-center transition-colors"
                    >
                      <ChevronRight size={16} />
                    </button>
                    <div className="absolute bottom-2 right-2 px-2 py-0.5 text-[10px] font-semibold bg-black/60 text-white rounded-full">
                      {activeImageIndex + 1} / {currentImages.length}
                    </div>
                  </>
                )}
              </div>
            )}

            <div className="p-3.5 sm:p-4 overflow-y-auto flex-1">
              {/* 标题 & 关闭/取消选择按钮 */}
              <div className="flex items-start justify-between gap-2 mb-1.5">
                <div>
                  <h3 className="text-sm sm:text-base font-bold text-[var(--text-primary)] leading-snug">
                    {selProps.name}
                  </h3>
                  {selProps.sceneTitle && (
                    <p className="text-xs font-medium text-[var(--text-secondary)] mt-0.5">
                      {selProps.sceneTitle}
                    </p>
                  )}
                </div>
                <button
                  onClick={() => setSelectedFeature(null)}
                  className="p-1.5 text-[var(--text-tertiary)] hover:text-[var(--text-primary)] rounded-lg hover:bg-[var(--bg-secondary)] transition-colors shrink-0"
                  title="閉じる (Esc)"
                >
                  <X size={18} />
                </button>
              </div>

              {/* 地址 */}
              {selProps.address && (
                <p className="text-xs text-[var(--text-tertiary)] mb-2 flex items-center gap-1.5">
                  <MapPin size={12} className="shrink-0 text-[var(--text-tertiary)]" />
                  <span className="truncate">{selProps.address}</span>
                </p>
              )}

              {/* 场景详情描述 */}
              {selProps.sceneNote && (
                <p className="text-xs text-[var(--text-secondary)] leading-relaxed mb-3 bg-[var(--bg-secondary)] p-2.5 rounded-lg">
                  {selProps.sceneNote}
                </p>
              )}

              {/* 标签 */}
              {selProps.tags && selProps.tags.length > 0 && (
                <div className="flex flex-wrap gap-1 mb-3">
                  {selProps.tags.map((tag) => (
                    <span
                      key={tag}
                      className="px-2 py-0.5 text-[10px] rounded-md bg-[var(--bg-secondary)] text-[var(--text-tertiary)] border border-[var(--border-primary)]"
                    >
                      #{tag}
                    </span>
                  ))}
                </div>
              )}

              {selProps.source?.layer && (
                <div className="mt-2 text-[11px] text-[var(--text-secondary)]">
                  <span className="font-semibold text-[var(--text-tertiary)]">原作者分类：</span>
                  {selProps.source.layer}
                </div>
              )}
              {selProps.source?.tags && selProps.source.tags.length > 0 && (
                <div className="mt-1 text-[11px] text-[var(--text-secondary)]">
                  <span className="font-semibold text-[var(--text-tertiary)]">原作者标签：</span>
                  {selProps.source.tags.join(' · ')}
                </div>
              )}

              {/* 双操作按钮：Google Maps 搜索 + 直达导航 */}
              <div className="grid grid-cols-2 gap-2 mt-2">
                <a
                  href={gmapsSearchUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-1.5 py-2 px-3 text-xs font-semibold rounded-lg border border-[var(--border-primary)] bg-[var(--bg-primary)] text-[var(--text-primary)] hover:bg-[var(--bg-secondary)] transition-colors text-center"
                >
                  <MapPin size={13} />
                  <span>Google Maps で開く</span>
                </a>
                <a
                  href={gmapsDirUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-1.5 py-2 px-3 text-xs font-semibold rounded-lg bg-[var(--color-brand-sakura)] text-white hover:opacity-90 shadow-sm transition-opacity text-center"
                >
                  <Navigation size={13} />
                  <span>ナビ開始</span>
                </a>
              </div>

              {/* 出处链接 */}
              {selProps.sourceUrl && (
                <div className="mt-2.5 pt-2 border-t border-[var(--border-primary)] flex items-center justify-between text-[10px] text-[var(--text-tertiary)]">
                  <span>出典：{selProps.sourceLabel || '公式情報'}</span>
                  <a
                    href={selProps.sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[var(--color-brand-sakura)] hover:underline flex items-center gap-0.5"
                  >
                    <span>元リンクを開く</span>
                    <ExternalLink size={10} />
                  </a>
                </div>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
