import { useEffect, useRef, useState, useMemo, type ReactNode } from 'react';
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
  ChevronDown,
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
  Route,
  Plus,
  Check,
  GripVertical,
  ArrowUp,
  ArrowDown,
  Trash2,
  LocateFixed,
  TrainFront,
  Footprints,
  Car,
  SkipForward,
  CircleCheck,
  RotateCcw,
} from 'lucide-react';

interface Feature {
  type: 'Feature';
  geometry: { type: 'Point'; coordinates: [number, number] };
  properties: {
    id: string;
    sourceKey?: string;
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
  sourceReferences?: string[];
  locationCredits?: string;
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

type RouteTravelMode = 'transit' | 'walking' | 'driving';

const MAX_ROUTE_STOPS = 12;

const SEICHI_MAP_OPTIONS = [
  { path: '/seichi/sakurazaka', label: '櫻坂46 総合' },
  { path: '/seichi/hinatazaka', label: '日向坂46 総合' },
  { path: '/seichi/keyakizaka', label: '欅坂46' },
  { path: '/seichi/keyaki-hiragana', label: 'けやき坂46' },
  { path: '/seichi/yamakawa-ui', label: '山川宇衣' },
  { path: '/seichi/fumi-sakurazaka', label: 'fumi 櫻坂46' },
  { path: '/seichi/tokyo10sha', label: '東京十社' },
  { path: '/seichi/oversea', label: '海外聖地' },
  { path: '/seichi', label: '聖地巡礼トップ' },
] as const;

const getRouteKey = (feature: Feature): string => {
  if (feature.properties.sourceKey) return feature.properties.sourceKey;
  const [lng, lat] = feature.geometry.coordinates;
  return `${feature.properties.id}:${lng.toFixed(6)},${lat.toFixed(6)}`;
};

const getGoogleMapsQuery = (feature: Feature): string => {
  const { name, address } = feature.properties;
  if (name?.trim() && address?.trim()) return `${name.trim()} ${address.trim()}`;
  const [lng, lat] = feature.geometry.coordinates;
  return `${lat},${lng}`;
};

const getRouteLabel = (index: number): string =>
  index < 26 ? String.fromCharCode(65 + index) : String(index + 1);

const distanceBetween = (from: [number, number], to: [number, number]): number => {
  const toRadians = (value: number) => value * Math.PI / 180;
  const [fromLng, fromLat] = from;
  const [toLng, toLat] = to;
  const dLat = toRadians(toLat - fromLat);
  const dLng = toRadians(toLng - fromLng);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(toRadians(fromLat)) * Math.cos(toRadians(toLat)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

const buildDirectionsUrl = ({
  destination,
  mode,
  origin,
  waypoints = [],
}: {
  destination: string;
  mode: RouteTravelMode;
  origin?: string;
  waypoints?: string[];
}): string => {
  const params = new URLSearchParams({ api: '1', destination, travelmode: mode });
  if (origin) params.set('origin', origin);
  if (waypoints.length > 0) params.set('waypoints', waypoints.join('|'));
  return `https://www.google.com/maps/dir/?${params.toString()}`;
};

export default function SeichiMap({
  geojsonUrl,
  fallbackGeojsonUrl,
  memberName,
  groupLabel = '櫻坂46',
  groupColor = 'var(--color-brand-sakura)',
  sourceReferences = ['櫻坂チャンネル YouTube / 公式ブログ / 雑誌'],
  locationCredits = 'fumi Diary 2号店 様',
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
  const [currentMapPath, setCurrentMapPath] = useState('');

  // 巡礼路线：仅在浏览器本地保存，不上传当前位置或行程。
  const routeStorageKey = `seichi-route:${geojsonUrl}`;
  const [routeOpen, setRouteOpen] = useState(false);
  const [routeStopKeys, setRouteStopKeys] = useState<string[]>([]);
  const [routeTravelMode, setRouteTravelMode] = useState<RouteTravelMode>('transit');
  const [routeActiveIndex, setRouteActiveIndex] = useState(0);
  const [routeStarted, setRouteStarted] = useState(false);
  const [routeRestored, setRouteRestored] = useState(false);
  const [routeNotice, setRouteNotice] = useState('');
  const [currentLocation, setCurrentLocation] = useState<[number, number] | null>(null);
  const [locationStatus, setLocationStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [draggedStopIndex, setDraggedStopIndex] = useState<number | null>(null);

  const routeFeatureIndex = useMemo(() => {
    const index = new Map<string, Feature>();
    data?.features.forEach((feature) => index.set(getRouteKey(feature), feature));
    return index;
  }, [data]);

  const routeStops = useMemo(
    () => routeStopKeys.map((key) => routeFeatureIndex.get(key)).filter(Boolean) as Feature[],
    [routeStopKeys, routeFeatureIndex]
  );

  useEffect(() => {
    const path = window.location.pathname.replace(/\/$/, '') || '/';
    setCurrentMapPath(path);
  }, []);

  const switchSeichiMap = (path: string) => {
    if (!path || path === currentMapPath) return;
    window.location.assign(path);
  };

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

  // 地图数据就绪后恢复本地路线。只保存稳定地点键，不保存完整地点或当前位置。
  useEffect(() => {
    if (!data || routeRestored) return;
    try {
      const saved = JSON.parse(localStorage.getItem(routeStorageKey) || '{}') as {
        stopKeys?: string[];
        travelMode?: RouteTravelMode;
        activeIndex?: number;
        started?: boolean;
      };
      const available = new Set(data.features.map(getRouteKey));
      setRouteStopKeys((saved.stopKeys || []).filter((key) => available.has(key)).slice(0, MAX_ROUTE_STOPS));
      if (saved.travelMode && ['transit', 'walking', 'driving'].includes(saved.travelMode)) {
        setRouteTravelMode(saved.travelMode);
      }
      setRouteActiveIndex(Math.max(0, saved.activeIndex || 0));
      setRouteStarted(Boolean(saved.started));
    } catch (error) {
      console.warn('Failed to restore local seichi route:', error);
    } finally {
      setRouteRestored(true);
    }
  }, [data, routeRestored, routeStorageKey]);

  useEffect(() => {
    if (!routeRestored) return;
    localStorage.setItem(routeStorageKey, JSON.stringify({
      stopKeys: routeStopKeys,
      travelMode: routeTravelMode,
      activeIndex: routeActiveIndex,
      started: routeStarted,
    }));
  }, [routeActiveIndex, routeRestored, routeStarted, routeStopKeys, routeStorageKey, routeTravelMode]);

  useEffect(() => {
    if (routeActiveIndex <= routeStops.length) return;
    setRouteActiveIndex(routeStops.length);
  }, [routeActiveIndex, routeStops.length]);

  useEffect(() => {
    if (!routeNotice) return;
    const timer = window.setTimeout(() => setRouteNotice(''), 2600);
    return () => window.clearTimeout(timer);
  }, [routeNotice]);

  // 重置图片索引
  useEffect(() => {
    setActiveImageIndex(0);
  }, [selectedFeature]);

  // 键盘 Esc 优先关闭路线面板，再取消地点选择。
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (routeOpen) setRouteOpen(false);
      else setSelectedFeature(null);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [routeOpen]);

  // 2. 初始化 Leaflet 地图
  useEffect(() => {
    if (!mapContainer.current || mapInstanceRef.current) return;

    const useMobileMapBehavior = window.matchMedia('(max-width: 767px)').matches;
    const map = L.map(mapContainer.current, {
      center: [36.2, 139.2],
      zoom: 7,
      zoomControl: false,
      // Mobile pinch zoom already updates continuously. Disabling Leaflet's
      // final 250ms zoom animation prevents marker/vector panes drifting apart.
      zoomAnimation: !useMobileMapBehavior,
      fadeAnimation: !useMobileMapBehavior,
    });

    if (!useMobileMapBehavior) {
      L.control.zoom({ position: 'topright' }).addTo(map);
    }

    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxNativeZoom: 19,
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

    // On mobile, briefly hide only the straight route guide while pinching.
    // It returns at the exact recalculated position on zoomend.
    const mapRoot = mapContainer.current.closest('.seichi-map-root');
    const handleZoomStart = () => mapRoot?.classList.add('seichi-map-zooming');
    const handleZoomEnd = () => mapRoot?.classList.remove('seichi-map-zooming');
    map.on('zoomstart', handleZoomStart);
    map.on('zoomend', handleZoomEnd);

    const resizeObserver = new ResizeObserver(() => {
      map.invalidateSize();
    });
    resizeObserver.observe(mapContainer.current);

    return () => {
      resizeObserver.disconnect();
      mapRoot?.classList.remove('seichi-map-zooming');
      map.off('zoomstart', handleZoomStart);
      map.off('zoomend', handleZoomEnd);
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

  const resetRouteProgress = () => {
    setRouteActiveIndex(0);
    setRouteStarted(false);
  };

  const toggleRouteStop = (feature: Feature) => {
    const key = getRouteKey(feature);
    if (routeStopKeys.includes(key)) {
      setRouteStopKeys(routeStopKeys.filter((item) => item !== key));
      resetRouteProgress();
      return;
    }
    if (routeStopKeys.length >= MAX_ROUTE_STOPS) {
      setRouteNotice(`プレビュー版は最大${MAX_ROUTE_STOPS}地点までです`);
      return;
    }
    setRouteStopKeys([...routeStopKeys, key]);
    resetRouteProgress();
    setRouteNotice(`${feature.properties.name}をルートに追加しました`);
  };

  const removeRouteStop = (index: number) => {
    setRouteStopKeys((current) => current.filter((_, itemIndex) => itemIndex !== index));
    resetRouteProgress();
  };

  const moveRouteStop = (from: number, to: number) => {
    if (from === to || to < 0 || to >= routeStopKeys.length) return;
    setRouteStopKeys((current) => {
      const next = [...current];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
    resetRouteProgress();
  };

  const sortRouteByDistance = () => {
    if (routeStops.length < 3) return;
    const remaining = [...routeStops];
    const sorted: Feature[] = [];
    let cursor: [number, number];
    if (currentLocation) {
      cursor = currentLocation;
    } else {
      const first = remaining.shift();
      if (!first) return;
      sorted.push(first);
      cursor = first.geometry.coordinates;
    }
    while (remaining.length > 0) {
      let nearestIndex = 0;
      let nearestDistance = Number.POSITIVE_INFINITY;
      remaining.forEach((feature, index) => {
        const distance = distanceBetween(cursor, feature.geometry.coordinates);
        if (distance < nearestDistance) {
          nearestDistance = distance;
          nearestIndex = index;
        }
      });
      const [nearest] = remaining.splice(nearestIndex, 1);
      sorted.push(nearest);
      cursor = nearest.geometry.coordinates;
    }
    setRouteStopKeys(sorted.map(getRouteKey));
    resetRouteProgress();
    setRouteNotice(currentLocation ? '現在地から近い順に並べました' : 'A地点から近い順に並べました');
  };

  const requestCurrentLocation = () => {
    if (!navigator.geolocation) {
      setLocationStatus('error');
      setRouteNotice('このブラウザは現在地取得に対応していません');
      return;
    }
    setLocationStatus('loading');
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const location: [number, number] = [position.coords.longitude, position.coords.latitude];
        setCurrentLocation(location);
        setLocationStatus('ready');
        setRouteNotice('現在地を取得しました');
        mapInstanceRef.current?.flyTo([location[1], location[0]], Math.max(mapInstanceRef.current.getZoom(), 13));
      },
      () => {
        setLocationStatus('error');
        setRouteNotice('現在地を取得できませんでした。Google Maps側の現在地を使用します');
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
    );
  };

  const fitRouteOnMap = () => {
    if (!mapInstanceRef.current || routeStops.length === 0) return;
    const points = routeStops.map((feature) => {
      const [lng, lat] = feature.geometry.coordinates;
      return L.latLng(lat, lng);
    });
    if (currentLocation) points.unshift(L.latLng(currentLocation[1], currentLocation[0]));
    mapInstanceRef.current.fitBounds(L.latLngBounds(points), { padding: [42, 42], maxZoom: 16 });
    setMobileView('map');
    setRouteOpen(false);
  };

  const visibleMapFeatures = useMemo(() => {
    const features = new Map(filteredFeatures.map((feature) => [getRouteKey(feature), feature]));
    routeStops.forEach((feature) => features.set(getRouteKey(feature), feature));
    return Array.from(features.values());
  }, [filteredFeatures, routeStops]);

  // 5. 渲染地图标记与路线预览。路线折线仅表示访问顺序，真实道路交给 Google Maps。
  useEffect(() => {
    if (!mapInstanceRef.current || !markersLayerRef.current) return;
    const markersGroup = markersLayerRef.current;
    markersGroup.clearLayers();

    if (routeStops.length > 1) {
      const routePoints = routeStops.map((feature) => {
        const [lng, lat] = feature.geometry.coordinates;
        return L.latLng(lat, lng);
      });
      if (currentLocation) routePoints.unshift(L.latLng(currentLocation[1], currentLocation[0]));
      L.polyline(routePoints, {
        color: routeStops[0]?.properties.categoryColor || '#F19DB5',
        weight: 4,
        opacity: 0.72,
        dashArray: '8 8',
        lineCap: 'round',
        className: 'seichi-route-line',
      }).addTo(markersGroup);
    }

    if (currentLocation) {
      L.circleMarker([currentLocation[1], currentLocation[0]], {
        radius: 8,
        color: '#ffffff',
        weight: 3,
        fillColor: '#2563eb',
        fillOpacity: 1,
      }).bindTooltip('現在地').addTo(markersGroup);
    }

    visibleMapFeatures.forEach((f) => {
      const p = f.properties;
      const [lng, lat] = f.geometry.coordinates;
      const routeIndex = routeStopKeys.indexOf(getRouteKey(f));
      const isRouteStop = routeIndex >= 0;
      const isVisited = isRouteStop && routeIndex < routeActiveIndex;
      const isActiveRouteStop = isRouteStop && routeStarted && routeIndex === routeActiveIndex;
      const isSelected = selectedFeature?.properties.id === p.id;
      const size = isRouteStop ? 28 : isSelected ? 20 : 14;
      const borderWidth = isRouteStop || isSelected ? 3 : 2;
      const background = isVisited ? '#16a34a' : isActiveRouteStop ? '#f59e0b' : p.categoryColor;

      const icon = L.divIcon({
        className: 'custom-seichi-marker',
        html: `
          <div style="
            width: ${size}px;
            height: ${size}px;
            border-radius: 50%;
            background-color: ${background};
            border: ${borderWidth}px solid #ffffff;
            box-shadow: 0 2px 8px rgba(0,0,0,0.35);
            transition: transform 0.15s ease;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            color: #ffffff;
            font-size: 11px;
            font-weight: 800;
          ">${isRouteStop ? (isVisited ? '✓' : getRouteLabel(routeIndex)) : ''}</div>
        `,
        iconSize: [size, size],
        iconAnchor: [size / 2, size / 2],
      });

      const marker = L.marker([lat, lng], { icon, zIndexOffset: isRouteStop ? 500 : 0 });
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
  }, [currentLocation, routeActiveIndex, routeStarted, routeStopKeys, routeStops, selectedFeature, visibleMapFeatures]);

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
  const googleMapsQuery = selectedFeature ? getGoogleMapsQuery(selectedFeature) : '0,0';
  const encodedGoogleMapsQuery = encodeURIComponent(googleMapsQuery);
  const gmapsSearchUrl = `https://www.google.com/maps/search/?api=1&query=${encodedGoogleMapsQuery}`;
  const gmapsDirUrl = `https://www.google.com/maps/dir/?api=1&destination=${encodedGoogleMapsQuery}`;
  const currentImages = selProps?.images || [];
  const selectedFeatureInRoute = selectedFeature
    ? routeStopKeys.includes(getRouteKey(selectedFeature))
    : false;

  const routeOrigin = currentLocation ? `${currentLocation[1]},${currentLocation[0]}` : undefined;
  const nextRouteStop = routeStops[routeActiveIndex];
  const nextRouteUrl = nextRouteStop
    ? buildDirectionsUrl({
        destination: getGoogleMapsQuery(nextRouteStop),
        mode: routeTravelMode,
        origin: routeOrigin,
      })
    : '';
  const combinedRouteStops = routeStops.slice(0, 9);
  const combinedRouteUrl = combinedRouteStops.length > 0
    ? buildDirectionsUrl({
        destination: getGoogleMapsQuery(combinedRouteStops[combinedRouteStops.length - 1]),
        mode: routeTravelMode,
        origin: routeOrigin,
        waypoints: combinedRouteStops.slice(0, -1).map(getGoogleMapsQuery),
      })
    : '';
  const routeCompleted = routeStops.length > 0 && routeActiveIndex >= routeStops.length;

  return (
    <div className="seichi-map-root relative flex w-full flex-col md:flex-row" style={{ height: 'calc(100vh - 56px)', overflow: 'hidden' }}>
      {/* 移动端地图/列表切换：放在两种视图之外，确保打开列表后仍能返回地图。 */}
      <button
        type="button"
        onClick={() => setMobileView(mobileView === 'map' ? 'list' : 'map')}
        className="absolute right-3 top-3 z-[1100] flex min-h-11 items-center gap-1.5 rounded-full border border-[var(--border-primary)] bg-[var(--bg-primary)] px-3.5 py-2 text-xs font-semibold text-[var(--text-primary)] shadow-lg backdrop-blur-md md:hidden"
        aria-label={mobileView === 'map' ? `リストを表示。${filteredFeatures.length}地点` : 'マップに戻る'}
      >
        {mobileView === 'map' ? (
          <>
            <List size={15} />
            <span>リスト ({filteredFeatures.length})</span>
          </>
        ) : (
          <>
            <MapIcon size={15} />
            <span>マップに戻る</span>
          </>
        )}
      </button>

      {mobileView === 'map' && (
        <div className="absolute left-3 top-3 z-[1100] md:hidden">
          <label className="sr-only" htmlFor="mobile-seichi-map-switcher">聖地マップを切り替える</label>
          <select
            id="mobile-seichi-map-switcher"
            value={currentMapPath}
            onChange={(event) => switchSeichiMap(event.target.value)}
            className="min-h-11 max-w-[150px] appearance-none rounded-full border border-[var(--border-primary)] bg-[var(--bg-primary)] py-2 pl-3.5 pr-8 text-xs font-semibold text-[var(--text-primary)] shadow-lg"
            aria-label="聖地マップを切り替える"
          >
            {!currentMapPath && <option value="">マップ切替</option>}
            {SEICHI_MAP_OPTIONS.map((option) => (
              <option key={option.path} value={option.path}>{option.label}</option>
            ))}
          </select>
          <ChevronDown size={13} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)]" />
        </div>
      )}

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
          <div className="mb-2 flex items-center justify-between pr-28 md:pr-0">
            <div>
              <h1 className="text-sm sm:text-base font-bold text-[var(--text-primary)] tracking-tight">
                {memberName} 聖地巡礼マップ
              </h1>
              <p className="text-[11px] text-[var(--text-tertiary)] mt-0.5">
                全 {data?.features.length || 0} スポット収録
              </p>
            </div>
            <span
              className="hidden items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold tracking-wider text-white md:inline-flex"
              style={{ backgroundColor: groupColor }}
            >
              {groupLabel}
            </span>
          </div>

          <div className="relative mt-2.5">
            <MapIcon size={13} className="pointer-events-none absolute left-2.5 top-1/2 z-10 -translate-y-1/2 text-[var(--text-tertiary)]" />
            <select
              value={currentMapPath}
              onChange={(event) => switchSeichiMap(event.target.value)}
              className="min-h-9 w-full appearance-none rounded-lg border border-[var(--border-primary)] bg-[var(--bg-secondary)] py-1.5 pl-8 pr-8 text-xs font-semibold text-[var(--text-primary)] focus:border-[var(--color-brand-sakura)] focus:outline-none"
              aria-label="聖地マップを切り替える"
            >
              {!currentMapPath && <option value="">マップを切り替える</option>}
              {SEICHI_MAP_OPTIONS.map((option) => (
                <option key={option.path} value={option.path}>{option.label}</option>
              ))}
            </select>
            <ChevronDown size={13} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)]" />
          </div>

          {/* 全局搜索框 */}
          <div className="relative mt-2">
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
            const isInRoute = routeStopKeys.includes(getRouteKey(f));

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
                      <div className="flex shrink-0 items-center gap-1">
                        <span
                          className="max-w-28 truncate text-[9px] px-1.5 py-0.2 rounded font-medium"
                          style={{
                            backgroundColor: `color-mix(in srgb, ${fp.categoryColor} 12%, transparent)`,
                            color: fp.categoryColor,
                          }}
                        >
                          {fp.subcategory}
                        </span>
                        <button
                          type="button"
                          aria-label={isInRoute ? `${fp.name}をルートから削除` : `${fp.name}をルートに追加`}
                          title={isInRoute ? 'ルートから削除' : 'ルートに追加'}
                          onClick={(event) => {
                            event.stopPropagation();
                            toggleRouteStop(f);
                          }}
                          className={`flex h-10 w-10 items-center justify-center rounded-full border transition-colors md:h-7 md:w-7 ${
                            isInRoute
                              ? 'border-[var(--color-brand-sakura)] bg-[var(--color-brand-sakura)] text-white'
                              : 'border-[var(--border-primary)] bg-[var(--bg-primary)] text-[var(--text-secondary)] hover:border-[var(--color-brand-sakura)]'
                          }`}
                        >
                          {isInRoute ? <Check size={13} /> : <Plus size={13} />}
                        </button>
                      </div>
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
          {sourceReferences.map((reference) => (
            <p key={reference}>• {reference}</p>
          ))}
          <p>• ロケ地考証：{locationCredits}</p>
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

              {selectedFeature && (
                <button
                  type="button"
                  onClick={() => toggleRouteStop(selectedFeature)}
                  className={`mt-3 flex w-full items-center justify-center gap-1.5 rounded-lg border py-2.5 px-3 text-xs font-semibold transition-colors ${
                    selectedFeatureInRoute
                      ? 'border-[var(--color-brand-sakura)] bg-[color-mix(in_srgb,var(--color-brand-sakura)_12%,transparent)] text-[var(--text-primary)]'
                      : 'border-[var(--border-primary)] bg-[var(--bg-secondary)] text-[var(--text-primary)] hover:border-[var(--color-brand-sakura)]'
                  }`}
                >
                  {selectedFeatureInRoute ? <Check size={14} /> : <Plus size={14} />}
                  <span>{selectedFeatureInRoute ? '巡礼ルートに追加済み' : '巡礼ルートに追加'}</span>
                </button>
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

      {/* 地图与列表共通的路线入口。地点详情打开时は详情内按钮优先。 */}
      {!routeOpen && !selectedFeature && (
        <button
          type="button"
          onClick={() => {
            setRouteOpen(true);
            setSelectedFeature(null);
          }}
          className="absolute bottom-3 right-3 z-[1100] flex min-h-11 items-center gap-2 rounded-full border border-[var(--border-primary)] bg-[var(--bg-primary)] px-4 py-2.5 text-xs font-bold text-[var(--text-primary)] shadow-xl transition-transform hover:-translate-y-0.5 md:bottom-5 md:right-5"
          aria-label={`巡礼ルートを開く。${routeStops.length}地点選択中`}
        >
          <Route size={17} className="text-[var(--color-brand-sakura)]" />
          <span>巡礼ルート</span>
          <span className="flex min-w-5 items-center justify-center rounded-full bg-[var(--color-brand-sakura)] px-1.5 py-0.5 text-[10px] text-white">
            {routeStops.length}
          </span>
        </button>
      )}

      {routeOpen && (
        <button
          type="button"
          className="absolute inset-0 z-[1140] bg-black/25 md:hidden"
          aria-label="巡礼ルートを閉じる"
          onClick={() => setRouteOpen(false)}
        />
      )}

      {/* 巡礼路线编辑器：移动端 Bottom Sheet、桌面端右侧浮动面板。 */}
      <section
        className="t-panel-slide absolute bottom-2 left-2 right-2 z-[1150] flex max-h-[calc(100%-1rem)] flex-col overflow-hidden rounded-2xl border border-[var(--border-primary)] bg-[var(--bg-primary)] shadow-2xl md:bottom-4 md:left-auto md:right-4 md:top-4 md:w-[400px] md:max-h-none"
        data-open={routeOpen ? 'true' : 'false'}
        role="dialog"
        aria-modal={routeOpen ? 'true' : undefined}
        aria-hidden={!routeOpen}
        inert={!routeOpen}
        aria-label="巡礼ルート編集"
      >
        <header className="flex shrink-0 items-center justify-between border-b border-[var(--border-primary)] px-4 py-3.5">
          <div className="flex min-w-0 items-center gap-2.5">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[color-mix(in_srgb,var(--color-brand-sakura)_16%,transparent)] text-[var(--color-brand-sakura)]">
              <Route size={18} />
            </div>
            <div className="min-w-0">
              <h2 className="text-sm font-bold text-[var(--text-primary)]">巡礼ルート</h2>
              <p className="text-[10px] text-[var(--text-tertiary)]">
                {routeStops.length}地点 · 端末内だけに保存
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            {routeStops.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  setRouteStopKeys([]);
                  resetRouteProgress();
                  setRouteNotice('ルートをクリアしました');
                }}
                className="flex h-9 w-9 items-center justify-center rounded-lg text-[var(--text-tertiary)] hover:bg-[var(--bg-secondary)] hover:text-red-500"
                title="ルートをクリア"
              >
                <Trash2 size={15} />
              </button>
            )}
            <button
              type="button"
              onClick={() => setRouteOpen(false)}
              className="flex h-9 w-9 items-center justify-center rounded-lg text-[var(--text-tertiary)] hover:bg-[var(--bg-secondary)] hover:text-[var(--text-primary)]"
              aria-label="閉じる"
            >
              <X size={18} />
            </button>
          </div>
        </header>

        <div className="shrink-0 border-b border-[var(--border-primary)] px-4 py-3">
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-tertiary)]">移動方法</p>
          <div className="grid grid-cols-3 rounded-xl bg-[var(--bg-secondary)] p-1">
            {([
              { id: 'transit', label: '電車', icon: <TrainFront size={14} /> },
              { id: 'walking', label: '徒歩', icon: <Footprints size={14} /> },
              { id: 'driving', label: '車', icon: <Car size={14} /> },
            ] as { id: RouteTravelMode; label: string; icon: ReactNode }[]).map((mode) => (
              <button
                type="button"
                key={mode.id}
                onClick={() => setRouteTravelMode(mode.id)}
                className={`flex min-h-9 items-center justify-center gap-1.5 rounded-lg text-xs font-semibold transition-colors ${
                  routeTravelMode === mode.id
                    ? 'bg-[var(--bg-primary)] text-[var(--text-primary)] shadow-sm'
                    : 'text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]'
                }`}
              >
                {mode.icon}
                {mode.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-3 py-3 sm:px-4">
          <div className="mb-2.5 flex items-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2.5 dark:border-blue-900/60 dark:bg-blue-950/30">
            <div className="relative flex h-7 w-7 shrink-0 items-center justify-center">
              <span className="absolute h-5 w-5 rounded-full bg-blue-500/20" />
              <span className="relative h-2.5 w-2.5 rounded-full border-2 border-white bg-blue-500 shadow" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-bold text-[var(--text-primary)]">現在地から開始</p>
              <p className="truncate text-[10px] text-[var(--text-tertiary)]">
                {locationStatus === 'ready'
                  ? '取得済み · 距離順の計算にも使用します'
                  : locationStatus === 'error'
                    ? '未取得 · Google Maps側の現在地を使用します'
                    : 'Google Maps側で現在地を使用します'}
              </p>
            </div>
            <button
              type="button"
              onClick={requestCurrentLocation}
              disabled={locationStatus === 'loading'}
              className="flex min-h-8 shrink-0 items-center gap-1 rounded-lg border border-blue-200 bg-white px-2.5 text-[10px] font-semibold text-blue-600 disabled:opacity-50 dark:border-blue-900 dark:bg-blue-950"
            >
              <LocateFixed size={12} className={locationStatus === 'loading' ? 'animate-pulse' : ''} />
              {locationStatus === 'loading' ? '取得中' : '取得'}
            </button>
          </div>

          {routeStops.length === 0 ? (
            <div className="flex min-h-48 flex-col items-center justify-center rounded-2xl border border-dashed border-[var(--border-secondary)] bg-[var(--bg-secondary)] px-6 text-center">
              <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-[var(--bg-primary)] text-[var(--color-brand-sakura)] shadow-sm">
                <Plus size={22} />
              </div>
              <h3 className="text-sm font-bold text-[var(--text-primary)]">地点を追加してください</h3>
              <p className="mt-1 max-w-56 text-[11px] leading-relaxed text-[var(--text-tertiary)]">
                リストまたは地点詳細の「＋」から、巡りたい場所を選択できます。
              </p>
              <button
                type="button"
                onClick={() => {
                  setRouteOpen(false);
                  setMobileView('list');
                  setSidebarOpen(true);
                }}
                className="mt-4 rounded-lg bg-[var(--text-primary)] px-4 py-2 text-xs font-semibold text-[var(--bg-primary)]"
              >
                地点を選ぶ
              </button>
            </div>
          ) : (
            <>
              <div className="mb-2 flex items-center justify-between gap-2">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-tertiary)]">経由地</p>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={sortRouteByDistance}
                    disabled={routeStops.length < 3}
                    className="min-h-9 rounded-md border border-[var(--border-primary)] px-2.5 py-1 text-[10px] font-semibold text-[var(--text-secondary)] disabled:opacity-40"
                  >
                    距離順
                  </button>
                  <button
                    type="button"
                    onClick={fitRouteOnMap}
                    className="min-h-9 rounded-md border border-[var(--border-primary)] px-2.5 py-1 text-[10px] font-semibold text-[var(--text-secondary)]"
                  >
                    全体表示
                  </button>
                </div>
              </div>

              <ol className="space-y-2">
                {routeStops.map((stop, index) => {
                  const visited = index < routeActiveIndex;
                  const active = routeStarted && index === routeActiveIndex;
                  return (
                    <li
                      key={getRouteKey(stop)}
                      draggable
                      onDragStart={() => setDraggedStopIndex(index)}
                      onDragOver={(event) => event.preventDefault()}
                      onDrop={() => {
                        if (draggedStopIndex !== null) moveRouteStop(draggedStopIndex, index);
                        setDraggedStopIndex(null);
                      }}
                      className={`flex items-center gap-2 rounded-xl border px-2 py-2 transition-colors ${
                        active
                          ? 'border-amber-400 bg-amber-50 dark:bg-amber-950/20'
                          : visited
                            ? 'border-green-200 bg-green-50 dark:border-green-900 dark:bg-green-950/20'
                            : 'border-[var(--border-primary)] bg-[var(--bg-primary)]'
                      }`}
                    >
                      <div
                        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-extrabold text-white ${
                          visited ? 'bg-green-600' : active ? 'bg-amber-500' : ''
                        }`}
                        style={{ backgroundColor: !visited && !active ? stop.properties.categoryColor : undefined }}
                      >
                        {visited ? <Check size={13} /> : getRouteLabel(index)}
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setRouteOpen(false);
                          handleSelectFeature(stop);
                        }}
                        className="min-w-0 flex-1 text-left"
                      >
                        <span className="block truncate text-xs font-bold text-[var(--text-primary)]">{stop.properties.name}</span>
                        <span className="block truncate text-[10px] text-[var(--text-tertiary)]">
                          {stop.properties.address || stop.properties.subcategory}
                        </span>
                      </button>
                      <div className="flex shrink-0 items-center">
                        <div className="hidden cursor-grab p-1 text-[var(--text-tertiary)] md:block" title="ドラッグして並べ替え">
                          <GripVertical size={14} />
                        </div>
                        <button
                          type="button"
                          onClick={() => moveRouteStop(index, index - 1)}
                          disabled={index === 0}
                          className="flex h-9 w-9 items-center justify-center rounded text-[var(--text-tertiary)] disabled:opacity-25 md:h-7 md:w-7"
                          aria-label="一つ前へ"
                        >
                          <ArrowUp size={13} />
                        </button>
                        <button
                          type="button"
                          onClick={() => moveRouteStop(index, index + 1)}
                          disabled={index === routeStops.length - 1}
                          className="flex h-9 w-9 items-center justify-center rounded text-[var(--text-tertiary)] disabled:opacity-25 md:h-7 md:w-7"
                          aria-label="一つ後へ"
                        >
                          <ArrowDown size={13} />
                        </button>
                        <button
                          type="button"
                          onClick={() => removeRouteStop(index)}
                          className="flex h-9 w-9 items-center justify-center rounded text-[var(--text-tertiary)] hover:text-red-500 md:h-7 md:w-7"
                          aria-label={`${stop.properties.name}を削除`}
                        >
                          <X size={13} />
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ol>
            </>
          )}
        </div>

        {routeStops.length > 0 && (
          <footer className="shrink-0 border-t border-[var(--border-primary)] bg-[var(--bg-secondary)] p-3 sm:p-4">
            {routeCompleted ? (
              <div className="rounded-xl border border-green-200 bg-green-50 p-3 text-center dark:border-green-900 dark:bg-green-950/30">
                <CircleCheck size={26} className="mx-auto text-green-600" />
                <p className="mt-1 text-sm font-bold text-[var(--text-primary)]">ルート完了</p>
                <p className="text-[10px] text-[var(--text-tertiary)]">おつかれさまでした</p>
                <button
                  type="button"
                  onClick={resetRouteProgress}
                  className="mt-2 inline-flex items-center gap-1 rounded-lg border border-green-200 bg-white px-3 py-1.5 text-[10px] font-semibold text-green-700 dark:border-green-900 dark:bg-green-950"
                >
                  <RotateCcw size={11} /> 最初から
                </button>
              </div>
            ) : nextRouteStop ? (
              <>
                <div className="mb-2.5 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[10px] font-semibold text-[var(--text-tertiary)]">
                      {routeStarted ? `巡礼進捗 ${routeActiveIndex + 1} / ${routeStops.length}` : '次の目的地'}
                    </p>
                    <p className="truncate text-sm font-bold text-[var(--text-primary)]">{nextRouteStop.properties.name}</p>
                  </div>
                  <span className="flex h-8 min-w-8 shrink-0 items-center justify-center rounded-full bg-[var(--color-brand-sakura)] px-2 text-xs font-bold text-white">
                    {getRouteLabel(routeActiveIndex)}
                  </span>
                </div>

                <a
                  href={nextRouteUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => setRouteStarted(true)}
                  className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-[var(--text-primary)] px-4 text-sm font-bold text-[var(--bg-primary)] shadow-sm"
                >
                  <Navigation size={16} />
                  {routeStarted ? '次の地点をGoogle Mapsで開く' : '巡礼を開始・次の地点へ'}
                </a>

                {routeStarted && (
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setRouteActiveIndex((index) => Math.min(index + 1, routeStops.length))}
                      className="flex min-h-10 items-center justify-center gap-1.5 rounded-lg bg-green-600 px-3 text-xs font-bold text-white"
                    >
                      <CircleCheck size={14} /> 到着・次へ
                    </button>
                    <button
                      type="button"
                      onClick={() => setRouteActiveIndex((index) => Math.min(index + 1, routeStops.length))}
                      className="flex min-h-10 items-center justify-center gap-1.5 rounded-lg border border-[var(--border-primary)] bg-[var(--bg-primary)] px-3 text-xs font-semibold text-[var(--text-secondary)]"
                    >
                      <SkipForward size={14} /> スキップ
                    </button>
                  </div>
                )}

                {routeTravelMode !== 'transit' && routeStops.length > 1 && (
                  <a
                    href={combinedRouteUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-2 flex min-h-9 w-full items-center justify-center gap-1.5 rounded-lg border border-[var(--border-primary)] bg-[var(--bg-primary)] px-3 text-[11px] font-semibold text-[var(--text-secondary)]"
                  >
                    <Route size={13} />
                    {routeStops.length > 9 ? '前半9地点を一括で開く' : '全経由地を一括で開く'}
                  </a>
                )}

                {routeTravelMode === 'transit' && (
                  <p className="mt-2 text-center text-[10px] leading-relaxed text-[var(--text-tertiary)]">
                    電車モードはGoogle Mapsの制限に合わせ、1区間ずつ案内します。
                  </p>
                )}
              </>
            ) : null}
          </footer>
        )}
      </section>

      {routeNotice && (
        <div className="pointer-events-none absolute left-1/2 top-3 z-[1300] -translate-x-1/2 rounded-full bg-gray-950 px-4 py-2 text-center text-[11px] font-semibold text-white shadow-xl">
          {routeNotice}
        </div>
      )}
    </div>
  );
}
