import { useState, useRef, useCallback, useEffect } from 'react';
import { useStore } from '@nanostores/react';
import { $auth } from '@/stores/auth';
import { publishWork } from '@/utils/community-api';
import {
  Download, Upload, RotateCcw, ChevronDown, ChevronUp,
  Type, Palette, SlidersHorizontal, Loader2,
  Share2, Bookmark, LogIn, Crop, X, ZoomIn, ZoomOut, Move, Check,
} from 'lucide-react';
import Cropper from 'cropperjs';
import 'cropperjs/dist/cropper.css';

// ---------- Types ----------
type GroupStyle = '櫻坂46' | '日向坂46' | '乃木坂46' | '乃木坂46②';

interface ColorPreset {
  bg: string;
  text: string;
  border: string;
}

interface LayoutPreset {
  marginBottom: number;
  marginX: number;
  paddingY: number;
  logoX: number;
  logoY: number;
  logoSize: number;
  groupNameX: number;
  groupNameY: number;
  groupNameSize: number;
  themeSize: number;
  themeX: number;
  themeY: number;
  themeLine2Size: number;
  themeLine2X: number;
  themeLine2Y: number;
  nameSize: number;
  nameX: number;
  nameY: number;
  romajiSize: number;
  romajiX: number;
  romajiY: number;
  themeLetterSpacing: number;
  nameLetterSpacing: number;
  romajiLetterSpacing: number;
}

interface ImageState {
  scale: number;
  translateX: number;
  translateY: number;
}

// ---------- Presets ----------
const COLOR_PRESETS: Record<GroupStyle, ColorPreset> = {
  '櫻坂46': { bg: '#FFFFFF', text: '#F19DB5', border: '#F19DB5' },
  '乃木坂46': { bg: '#742581', text: '#FFFFFF', border: '#742581' },
  '乃木坂46②': { bg: '#742581', text: '#FFFFFF', border: '#742581' },
  '日向坂46': { bg: '#7cc7e8', text: '#FFFFFF', border: '#7cc7e8' },
};

const LAYOUT_PRESETS: Record<GroupStyle, LayoutPreset> = {
  '櫻坂46': {
    marginBottom: 29, marginX: 26, paddingY: 20,
    logoX: 5, logoY: 0, logoSize: 32,
    groupNameX: 44, groupNameY: 0, groupNameSize: 14,
    themeSize: 8, themeX: 0, themeY: 0,
    themeLine2Size: 8, themeLine2X: 0, themeLine2Y: 6,
    nameSize: 20, nameX: 7, nameY: 0,
    romajiSize: 13, romajiX: 12, romajiY: 14,
    themeLetterSpacing: 0, nameLetterSpacing: 0, romajiLetterSpacing: 0,
  },
  '乃木坂46': {
    marginBottom: 18, marginX: 14, paddingY: 17,
    logoX: 8, logoY: 0, logoSize: 23,
    groupNameX: 39, groupNameY: 4, groupNameSize: 17,
    themeSize: 8, themeX: 0, themeY: 0,
    themeLine2Size: 8, themeLine2X: 0, themeLine2Y: 6,
    nameSize: 19, nameX: -7, nameY: -4,
    romajiSize: 9, romajiX: -12, romajiY: 12,
    themeLetterSpacing: 0, nameLetterSpacing: 3.7, romajiLetterSpacing: 1.4,
  },
  '乃木坂46②': {
    marginBottom: 0, marginX: 0, paddingY: 23,
    logoX: 11, logoY: 0, logoSize: 19,
    groupNameX: 40, groupNameY: 0, groupNameSize: 14,
    themeSize: 11, themeX: -6, themeY: 8,
    themeLine2Size: 8, themeLine2X: -6, themeLine2Y: 12,
    nameSize: 18, nameX: -7, nameY: 2,
    romajiSize: 8, romajiX: -8, romajiY: 18,
    themeLetterSpacing: 0, nameLetterSpacing: 0, romajiLetterSpacing: 0,
  },
  '日向坂46': {
    marginBottom: 29, marginX: 26, paddingY: 20,
    logoX: 5, logoY: 0, logoSize: 32,
    groupNameX: 44, groupNameY: 0, groupNameSize: 12,
    themeSize: 8, themeX: 0, themeY: 0,
    themeLine2Size: 8, themeLine2X: 0, themeLine2Y: 6,
    nameSize: 20, nameX: 7, nameY: 0,
    romajiSize: 13, romajiX: 12, romajiY: 14,
    themeLetterSpacing: 0, nameLetterSpacing: 0, romajiLetterSpacing: 0,
  },
};

const GROUP_LOGOS: Record<GroupStyle, string> = {
  '櫻坂46': '/photocard/樱坂46logo.png',
  '日向坂46': '/photocard/日向坂46logo.png',
  '乃木坂46': '/photocard/乃木坂46logo.png',
  '乃木坂46②': '/photocard/乃木坂46logo.png',
};

const GROUP_NAME_IMAGES: Record<GroupStyle, string> = {
  '櫻坂46': '/photocard/樱坂46文字.png',
  '日向坂46': '/photocard/日向坂46文字.png',
  '乃木坂46': '/photocard/乃木坂46文字.png',
  '乃木坂46②': '/photocard/乃木坂46文字.png',
};

const FONT_OPTIONS = [
  { value: "'UDXinWan', sans-serif", label: 'Default' },
  { value: "'UDXinWan', sans-serif", label: 'UDXinWan (新丸ゴ)' },
  { value: "'mplus1p', sans-serif", label: 'M PLUS 1p' },
  { value: "'Kosugi Maru', sans-serif", label: 'Kosugi Maru' },
  { value: "sans-serif", label: 'System Sans-Serif' },
];

const BRAND_SWATCHES = ['#7cc7e8', '#742581', '#F19DB5', '#FFFFFF', '#000000'];

// ---------- Helpers ----------
function ColorSwatch({ colors, value, onChange }: { colors: string[]; value: string; onChange: (c: string) => void }) {
  return (
    <div className="flex gap-1.5 mt-1.5">
      {colors.map((c) => (
        <button
          key={c}
          type="button"
          onClick={() => onChange(c)}
          className={`w-5 h-5 rounded-full border-2 transition-transform hover:scale-110 ${
            value === c ? 'border-[var(--text-primary)] scale-110' : 'border-[var(--border-primary)]'
          }`}
          style={{ backgroundColor: c }}
        />
      ))}
    </div>
  );
}

function Section({ title, icon, children, defaultOpen = false }: {
  title: string; icon: React.ReactNode; children: React.ReactNode; defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border border-[var(--border-primary)] rounded-lg overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-3 py-2.5 bg-[var(--bg-secondary)] hover:bg-[var(--bg-tertiary)] transition-colors"
      >
        <span className="flex items-center gap-2 text-xs font-semibold text-[var(--text-primary)]">
          {icon}
          {title}
        </span>
        {open ? <ChevronUp size={12} className="text-[var(--text-tertiary)]" /> : <ChevronDown size={12} className="text-[var(--text-tertiary)]" />}
      </button>
      {open && <div className="px-3 py-3 space-y-3 bg-[var(--bg-primary)]">{children}</div>}
    </div>
  );
}

function SliderField({ label, value, min, max, step = 1, onChange, unit = 'px' }: {
  label: string; value: number; min: number; max: number; step?: number; onChange: (v: number) => void; unit?: string;
}) {
  return (
    <div>
      <div className="flex justify-between items-center mb-0.5">
        <span className="text-[10px] text-[var(--text-tertiary)]">{label}</span>
        <span className="text-[10px] text-[var(--text-tertiary)] tabular-nums">{value}{unit}</span>
      </div>
      <input
        type="range"
        min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full h-1 accent-[var(--color-brand-sakura)]"
      />
    </div>
  );
}

// ---------- Canvas-based generation (matches original) ----------
async function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

// ---------- Main Component ----------
export default function PhotocardGenerator() {
  const cardRef = useRef<HTMLDivElement>(null);
  const imageContainerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cropImgRef = useRef<HTMLImageElement>(null);
  const cropperRef = useRef<Cropper | null>(null);

  // Image
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [imageState, setImageState] = useState<ImageState>({ scale: 1, translateX: 0, translateY: 0 });
  const dragRef = useRef({ dragging: false, startX: 0, startY: 0, origTX: 0, origTY: 0 });

  // Crop modal
  const [showCropModal, setShowCropModal] = useState(false);
  const [rawImageSrc, setRawImageSrc] = useState<string | null>(null);

  // Group & text
  const [group, setGroup] = useState<GroupStyle>('櫻坂46');
  const [memberName, setMemberName] = useState('');
  const [romajiName, setRomajiName] = useState('');
  const [showRomaji, setShowRomaji] = useState(false);
  const [theme, setTheme] = useState('');
  const [themeLine2, setThemeLine2] = useState('');
  const [showThemeLine2, setShowThemeLine2] = useState(false);

  // Colors
  const [bgColor, setBgColor] = useState(COLOR_PRESETS['櫻坂46'].bg);
  const [textColor, setTextColor] = useState(COLOR_PRESETS['櫻坂46'].text);
  const [borderColor, setBorderColor] = useState(COLOR_PRESETS['櫻坂46'].border);
  const [showBorder, setShowBorder] = useState(true);
  const [borderThickness, setBorderThickness] = useState(1);

  // Fonts
  const [themeFont, setThemeFont] = useState(FONT_OPTIONS[0].value);
  const [nameFont, setNameFont] = useState(FONT_OPTIONS[0].value);
  const [themeWeight, setThemeWeight] = useState(400);
  const [nameWeight, setNameWeight] = useState(400);
  const [romajiWeight, setRomajiWeight] = useState(400);

  // Custom font upload
  const [customFonts, setCustomFonts] = useState<{ value: string; label: string }[]>([]);
  const fontUploadRef = useRef<HTMLInputElement>(null);

  // Custom logo upload
  const [customLogoSrc, setCustomLogoSrc] = useState<string | null>(null);
  const logoUploadRef = useRef<HTMLInputElement>(null);

  // Layout
  const [layout, setLayout] = useState<LayoutPreset>({ ...LAYOUT_PRESETS['櫻坂46'] });

  // State
  const [generating, setGenerating] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [mobileImageUrl, setMobileImageUrl] = useState<string | null>(null);
  const [showPublishConfirm, setShowPublishConfirm] = useState(false);
  const [allowDownload, setAllowDownload] = useState(true);
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [publishToast, setPublishToast] = useState<string | null>(null);
  const auth = useStore($auth);

  // Keyboard shortcuts for crop modal
  useEffect(() => {
    if (!showCropModal) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter') { e.preventDefault(); handleCropConfirm(); }
      else if (e.key === 'Escape') { e.preventDefault(); handleCropCancel(); }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [showCropModal]);

  // Initialize Cropper when modal opens
  useEffect(() => {
    if (showCropModal && cropImgRef.current && rawImageSrc) {
      cropImgRef.current.src = rawImageSrc;
      const timer = setTimeout(() => {
        if (cropperRef.current) cropperRef.current.destroy();
        cropperRef.current = new Cropper(cropImgRef.current!, {
          aspectRatio: 89 / 127,
          viewMode: 1,
          dragMode: 'move',
          background: false,
          autoCropArea: 1,
        });
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [showCropModal, rawImageSrc]);

  // Apply group preset
  const applyGroupPreset = useCallback((g: GroupStyle) => {
    setGroup(g);
    const cp = COLOR_PRESETS[g];
    setBgColor(cp.bg);
    setTextColor(cp.text);
    setBorderColor(cp.border);
    setLayout({ ...LAYOUT_PRESETS[g] });

    if (g === '乃木坂46') {
      setShowRomaji(true);
      setNameFont("'mplus1p', sans-serif");
      setNameWeight(300);
      setRomajiWeight(300);
    } else if (g === '乃木坂46②') {
      setShowRomaji(true);
      setNameFont("'UDXinWan', sans-serif");
      setNameWeight(400);
      setRomajiWeight(400);
    } else {
      setShowRomaji(false);
      setNameFont("'UDXinWan', sans-serif");
      setNameWeight(400);
      setRomajiWeight(400);
    }
  }, []);

  // Romaji toggle — adjusts nameY/romajiY for non-nogizaka groups (matches original)
  const handleRomajiToggle = (checked: boolean) => {
    setShowRomaji(checked);
    const isNogizaka = group === '乃木坂46' || group === '乃木坂46②';
    if (!isNogizaka) {
      if (checked) {
        setLayout(prev => ({ ...prev, nameY: -7, romajiY: 14 }));
      } else {
        setLayout(prev => ({ ...prev, nameY: 0 }));
      }
    }
  };

  // Theme line 2 toggle — adjusts themeY (matches original)
  const handleThemeLine2Toggle = (checked: boolean) => {
    setShowThemeLine2(checked);
    if (checked) {
      setLayout(prev => ({ ...prev, themeY: -4 }));
    } else {
      setLayout(prev => ({ ...prev, themeY: 0 }));
    }
  };

  // Handle image upload → open crop modal
  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      setRawImageSrc(ev.target?.result as string);
      setShowCropModal(true);
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  // Crop confirm
  const handleCropConfirm = () => {
    if (cropperRef.current) {
      const croppedDataUrl = cropperRef.current.getCroppedCanvas().toDataURL('image/png');
      setImageSrc(croppedDataUrl);
      setImageState({ scale: 1, translateX: 0, translateY: 0 });
      cropperRef.current.destroy();
      cropperRef.current = null;
    }
    setShowCropModal(false);
  };

  // Crop cancel
  const handleCropCancel = () => {
    if (cropperRef.current) {
      cropperRef.current.destroy();
      cropperRef.current = null;
    }
    setShowCropModal(false);
  };

  // Image drag handlers
  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    dragRef.current = { dragging: true, startX: e.clientX, startY: e.clientY, origTX: imageState.translateX, origTY: imageState.translateY };
  };

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!dragRef.current.dragging) return;
    e.preventDefault();
    const dx = e.clientX - dragRef.current.startX;
    const dy = e.clientY - dragRef.current.startY;
    setImageState(prev => ({ ...prev, translateX: dragRef.current.origTX + dx, translateY: dragRef.current.origTY + dy }));
  }, []);

  const handleMouseUp = useCallback(() => { dragRef.current.dragging = false; }, []);

  useEffect(() => {
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [handleMouseMove, handleMouseUp]);

  // Scroll zoom — only on Ctrl+wheel (trackpad pinch) to avoid hijacking page scroll
  const handleWheel = (e: React.WheelEvent) => {
    if (!e.ctrlKey) return; // let normal scroll pass through
    e.preventDefault();
    setImageState(prev => ({
      ...prev,
      scale: Math.max(0.5, Math.min(3, prev.scale + (e.deltaY > 0 ? -0.05 : 0.05))),
    }));
  };

  // Custom font upload
  const handleFontUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const fontName = file.name.replace(/\.(ttf|otf|woff|woff2)$/, '');
    const reader = new FileReader();
    reader.onload = async (ev) => {
      try {
        const fontFace = new FontFace(fontName, ev.target!.result as ArrayBuffer);
        await fontFace.load();
        document.fonts.add(fontFace);
        const newFont = { value: `"${fontName}"`, label: `${fontName} (自定义)` };
        setCustomFonts(prev => {
          if (prev.some(f => f.value === newFont.value)) return prev;
          return [...prev, newFont];
        });
        setThemeFont(`"${fontName}"`);
        setNameFont(`"${fontName}"`);
      } catch (err) {
        console.error('Font load failed:', err);
      }
    };
    reader.readAsArrayBuffer(file);
    e.target.value = '';
  };

  // Reset all
  const resetAll = () => {
    applyGroupPreset(group);
    setThemeWeight(400);
    setNameWeight(400);
    setRomajiWeight(400);
    setThemeFont(FONT_OPTIONS[0].value);
    setNameFont(FONT_OPTIONS[0].value);
    setShowBorder(true);
    setBorderThickness(1);
    setImageState({ scale: 1, translateX: 0, translateY: 0 });
    setCustomLogoSrc(null);
  };

  // Generate canvas from card (reusable for download & publish)
  const generateCanvas = async (scaleFactor = 3): Promise<HTMLCanvasElement | null> => {
    if (!cardRef.current) return null;
    await document.fonts.ready;
    const rect = cardRef.current.getBoundingClientRect();
    const canvas = document.createElement('canvas');
    canvas.width = rect.width * scaleFactor;
    canvas.height = rect.height * scaleFactor;
    const ctx = canvas.getContext('2d')!;
    ctx.scale(scaleFactor, scaleFactor);

    // 1. Draw main image
    if (imageSrc) {
      const img = await loadImage(imageSrc);
      const containerEl = imageContainerRef.current;
      if (containerEl) {
        const containerRect = containerEl.getBoundingClientRect();
        const containerX = containerRect.left - rect.left;
        const containerY = containerRect.top - rect.top;
        ctx.save();
        ctx.beginPath();
        ctx.rect(containerX, containerY, containerRect.width, containerRect.height);
        ctx.clip();
        const transformedW = containerRect.width * imageState.scale;
        const transformedH = containerRect.height * imageState.scale;
        const drawX = containerX + imageState.translateX + (containerRect.width - transformedW) / 2;
        const drawY = containerY + imageState.translateY + (containerRect.height - transformedH) / 2;
        ctx.drawImage(img, drawX, drawY, transformedW, transformedH);
        ctx.restore();
      }
    }

    // 2. Draw info bar
    const infoBarEl = cardRef.current.querySelector('[data-info-bar]') as HTMLElement;
    if (infoBarEl) {
      const infoRect = infoBarEl.getBoundingClientRect();
      const ibX = infoRect.left - rect.left;
      const ibY = infoRect.top - rect.top;
      const ibW = infoRect.width;
      const ibH = infoRect.height;

      ctx.fillStyle = bgColor;
      ctx.fillRect(ibX, ibY, ibW, ibH);

      if (showBorder) {
        ctx.strokeStyle = borderColor;
        ctx.lineWidth = borderThickness;
        ctx.strokeRect(ibX, ibY, ibW, ibH);
      }

      // 3. Draw logos (as images)
      const drawables = infoBarEl.querySelectorAll('[data-draw]');
      for (const el of Array.from(drawables)) {
        const elRect = el.getBoundingClientRect();
        const dX = elRect.left - rect.left;
        const dY = elRect.top - rect.top;
        const drawType = el.getAttribute('data-draw');

        if (drawType === 'image') {
          const imgEl = el.querySelector('img') || el as HTMLImageElement;
          if (imgEl instanceof HTMLImageElement && imgEl.complete && imgEl.naturalWidth > 0) {
            ctx.drawImage(imgEl, dX, dY, elRect.width, elRect.height);
          }
        } else if (drawType === 'text') {
          const cs = getComputedStyle(el as HTMLElement);
          ctx.fillStyle = cs.color;
          ctx.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
          ctx.letterSpacing = cs.letterSpacing;
          ctx.textBaseline = 'middle';

          const textAlign = cs.textAlign;
          let tX = dX;
          if (textAlign === 'right') tX = dX + elRect.width;
          else if (textAlign === 'center') tX = dX + elRect.width / 2;
          ctx.textAlign = textAlign as CanvasTextAlign;
          ctx.fillText((el as HTMLElement).textContent || '', tX, dY + elRect.height / 2);
        }
      }
    }
    return canvas;
  };

  // Canvas-based download
  const handleDownload = async () => {
    setGenerating(true);
    try {
      const canvas = await generateCanvas(3);
      if (!canvas) return;
      const dataUrl = canvas.toDataURL('image/png');
      const isMobile = /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
      if (isMobile) {
        setMobileImageUrl(dataUrl);
      } else {
        const link = document.createElement('a');
        link.download = `photocard_${memberName || 'card'}_${Date.now()}.png`;
        link.href = dataUrl;
        link.click();
      }
    } catch (err) {
      console.error('Generation failed:', err);
    } finally {
      setGenerating(false);
    }
  };

  // Publish to community
  const handlePublish = async () => {
    setPublishing(true);
    try {
      // Generate full image (3x)
      const fullCanvas = await generateCanvas(3);
      if (!fullCanvas) throw new Error('Canvas generation failed');

      // Generate thumbnail (1x, WebP)
      const thumbCanvas = await generateCanvas(1);

      // Convert to blobs
      const fullBlob = await new Promise<Blob>((resolve, reject) => {
        fullCanvas.toBlob(b => b ? resolve(b) : reject(new Error('toBlob failed')), 'image/png');
      });
      let thumbBlob: Blob | undefined;
      if (thumbCanvas) {
        thumbBlob = await new Promise<Blob>((resolve, reject) => {
          thumbCanvas.toBlob(b => b ? resolve(b) : reject(new Error('toBlob failed')), 'image/webp', 0.8);
        });
      }

      const result = await publishWork({
        image: fullBlob,
        thumbnail: thumbBlob,
        memberName: memberName,
        romajiName: romajiName || undefined,
        groupStyle: group,
        theme: theme || undefined,
        allowDownload,
        anonymous: isAnonymous,
      });

      setShowPublishConfirm(false);
      setPublishToast('发布成功！');
      setTimeout(() => setPublishToast(null), 3000);
      console.log('Published work:', result.id);
    } catch (err: any) {
      console.error('Publish failed:', err);
      setPublishToast(err.message || '发布失败，请稍后重试');
      setTimeout(() => setPublishToast(null), 3000);
    } finally {
      setPublishing(false);
    }
  };

  // Update layout helper
  const setL = (key: keyof LayoutPreset, value: number) =>
    setLayout((prev) => ({ ...prev, [key]: value }));

  const allFonts = [...FONT_OPTIONS, ...customFonts];

  return (
    <div className="max-w-6xl mx-auto">
      {/* Crop Modal */}
      {showCropModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="bg-[var(--bg-primary)] rounded-xl max-w-lg w-full max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border-primary)]">
              <span className="text-sm font-semibold text-[var(--text-primary)] flex items-center gap-2">
                <Crop size={14} /> 裁剪图片 (89:127)
              </span>
              <button type="button" onClick={handleCropCancel} className="text-[var(--text-tertiary)] hover:text-[var(--text-primary)]">
                <X size={16} />
              </button>
            </div>
            <div className="flex-1 overflow-hidden p-4" style={{ maxHeight: '60vh' }}>
              <img ref={cropImgRef} alt="Crop" className="max-w-full" style={{ display: 'block' }} />
            </div>
            <div className="flex gap-2 px-4 py-3 border-t border-[var(--border-primary)]">
              <button type="button" onClick={handleCropCancel}
                className="flex-1 px-4 py-2 text-xs border border-[var(--border-primary)] rounded-lg text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)]"
              >取消</button>
              <button type="button" onClick={handleCropConfirm}
                className="flex-1 px-4 py-2 text-xs font-semibold text-white rounded-lg hover:opacity-90"
                style={{ backgroundColor: 'var(--color-brand-sakura)' }}
              >确认裁剪</button>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-[5fr_4fr] gap-6">
        {/* === Left: Control Panel === */}
        <div className="space-y-3 order-2 md:order-1">
          {/* 1. Image upload */}
          <div className="rounded-lg border border-[var(--border-primary)] bg-[var(--bg-primary)] p-3">
            <label className="block text-xs font-semibold text-[var(--text-primary)] mb-2">1. 上传主图片</label>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleImageUpload}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 border-2 border-dashed border-[var(--border-secondary)] rounded-lg text-xs text-[var(--text-secondary)] hover:border-[var(--color-brand-sakura)] hover:text-[var(--color-brand-sakura)] transition-colors"
            >
              <Upload size={14} />
              {imageSrc ? '更换图片' : '点击上传图片'}
            </button>
            {imageSrc && (
              <div className="flex items-center gap-2 mt-2">
                <span className="text-[10px] text-[var(--text-tertiary)] flex items-center gap-1"><Move size={10} /> 拖拽移动图片</span>
                <span className="text-[10px] text-[var(--text-tertiary)]">·</span>
                <span className="text-[10px] text-[var(--text-tertiary)] flex items-center gap-1"><ZoomIn size={10} /> 滚轮缩放</span>
                <button type="button" onClick={() => setImageState({ scale: 1, translateX: 0, translateY: 0 })}
                  className="ml-auto text-[10px] text-[var(--color-brand-sakura)] hover:underline">重置位置</button>
              </div>
            )}
          </div>

          {/* 2. Group selection */}
          <div className="rounded-lg border border-[var(--border-primary)] bg-[var(--bg-primary)] p-3">
            <label className="block text-xs font-semibold text-[var(--text-primary)] mb-2">2. 样式选择</label>
            <div className="grid grid-cols-4 gap-1.5">
              {(['櫻坂46', '日向坂46', '乃木坂46', '乃木坂46②'] as GroupStyle[]).map((g) => (
                <button
                  key={g}
                  type="button"
                  onClick={() => applyGroupPreset(g)}
                  className={`px-2 py-1.5 text-[10px] rounded-md border transition-colors ${
                    group === g
                      ? 'border-[var(--color-brand-sakura)] bg-[var(--bg-tertiary)] font-medium text-[var(--text-primary)]'
                      : 'border-[var(--border-primary)] text-[var(--text-secondary)] hover:border-[var(--border-secondary)]'
                  }`}
                >
                  {g}
                </button>
              ))}
            </div>
          </div>

          {/* 3-5. Text inputs */}
          <div className="rounded-lg border border-[var(--border-primary)] bg-[var(--bg-primary)] p-3 space-y-2.5">
            <div>
              <label className="block text-xs font-semibold text-[var(--text-primary)] mb-1">3. 成员姓名</label>
              <input
                type="text"
                value={memberName}
                onChange={(e) => setMemberName(e.target.value)}
                placeholder="请输入成员姓名"
                className="w-full px-2.5 py-1.5 text-xs border border-[var(--border-primary)] rounded-md bg-[var(--bg-primary)] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-brand-sakura)]"
              />
            </div>
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-semibold text-[var(--text-primary)]">4. 罗马字</label>
                <label className="flex items-center gap-1.5 text-[10px] text-[var(--text-secondary)]">
                  <input type="checkbox" checked={showRomaji} onChange={(e) => handleRomajiToggle(e.target.checked)} className="w-3 h-3 accent-[var(--color-brand-sakura)]" />
                  显示
                </label>
              </div>
              <input
                type="text"
                value={romajiName}
                onChange={(e) => setRomajiName(e.target.value)}
                placeholder="请输入罗马字"
                disabled={!showRomaji}
                className="w-full px-2.5 py-1.5 text-xs border border-[var(--border-primary)] rounded-md bg-[var(--bg-primary)] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-brand-sakura)] disabled:opacity-40"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-[var(--text-primary)] mb-1">5. 主题</label>
              <input
                type="text"
                value={theme}
                onChange={(e) => setTheme(e.target.value)}
                placeholder="请输入主题"
                className="w-full px-2.5 py-1.5 text-xs border border-[var(--border-primary)] rounded-md bg-[var(--bg-primary)] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-brand-sakura)]"
              />
            </div>
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-semibold text-[var(--text-primary)]">5b. 主题 (第二行)</label>
                <label className="flex items-center gap-1.5 text-[10px] text-[var(--text-secondary)]">
                  <input type="checkbox" checked={showThemeLine2} onChange={(e) => handleThemeLine2Toggle(e.target.checked)} className="w-3 h-3 accent-[var(--color-brand-sakura)]" />
                  显示
                </label>
              </div>
              <input
                type="text"
                value={themeLine2}
                onChange={(e) => setThemeLine2(e.target.value)}
                placeholder="请输入主题第二行"
                disabled={!showThemeLine2}
                className="w-full px-2.5 py-1.5 text-xs border border-[var(--border-primary)] rounded-md bg-[var(--bg-primary)] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-brand-sakura)] disabled:opacity-40"
              />
            </div>
          </div>

          {/* 6. Font style */}
          <Section title="6. 字体样式" icon={<Type size={12} />}>
            {/* カスタムロゴ */}
            <div>
              <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mb-1.5">
                <span className="text-[10px] font-semibold text-[var(--text-primary)]">自定义Logo</span>
                <a href="https://onedrive.live.com/?cid=93705e697511183e&id=93705E697511183E%21s4142bd8518f142feb0d37b8b92f42825&resid=93705E697511183E%21s4142bd8518f142feb0d37b8b92f42825&ithint=folder&e=X9pOds&migratedtospo=true&redeem=aHR0cHM6Ly8xZHJ2Lm1zL2YvYy85MzcwNWU2OTc1MTExODNlL0VvVzlRa0h4R1A1Q3NOTjdpNUwwS0NVQjBqOUpDNmcxaGpwc1pQLWtPN3hXWnc%5FZT1YOXBPZHM&v=validatepermission" target="_blank" rel="noopener noreferrer" className="text-[10px] text-green-600 hover:underline">(SVG文件下载)</a>
                <a href="https://www.jyshare.com/more/svgeditor/" target="_blank" rel="noopener noreferrer" className="text-[10px] text-indigo-600 hover:underline">(SVG在线改色工具)</a>
                <a href="https://www.iloveimg.com/ja/crop-image" target="_blank" rel="noopener noreferrer" className="text-[10px] text-green-600 hover:underline">(PNG裁剪工具)</a>
              </div>
              <input ref={logoUploadRef} type="file" accept=".svg,.png,.jpg,.jpeg,.webp" onChange={(e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                const reader = new FileReader();
                reader.onload = (ev) => setCustomLogoSrc(ev.target!.result as string);
                reader.readAsDataURL(file);
              }} className="hidden" />
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => logoUploadRef.current?.click()}
                  className="px-3 py-1.5 text-[10px] border border-dashed border-[var(--border-secondary)] rounded-md text-[var(--text-tertiary)] hover:border-[var(--color-brand-sakura)] hover:text-[var(--color-brand-sakura)] transition-colors"
                >选择文件</button>
                <span className="text-[10px] text-[var(--text-tertiary)]">{customLogoSrc ? 'Logo已选择' : '未选择'}</span>
                {customLogoSrc && (
                  <button type="button" onClick={() => setCustomLogoSrc(null)} className="text-[10px] text-red-400 hover:text-red-600">✕</button>
                )}
              </div>
            </div>

            {/* テーマ / 名前 font selectors */}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <span className="text-[10px] text-[var(--text-tertiary)] mb-0.5 block">主题</span>
                <select value={themeFont} onChange={(e) => setThemeFont(e.target.value)} className="w-full px-2 py-1 text-[10px] border border-[var(--border-primary)] rounded-md bg-[var(--bg-primary)] text-[var(--text-primary)]">
                  {allFonts.map((f, i) => <option key={`${f.value}-${i}`} value={f.value}>{f.label}</option>)}
                </select>
              </div>
              <div>
                <span className="text-[10px] text-[var(--text-tertiary)] mb-0.5 block">姓名/罗马字</span>
                <select value={nameFont} onChange={(e) => setNameFont(e.target.value)} className="w-full px-2 py-1 text-[10px] border border-[var(--border-primary)] rounded-md bg-[var(--bg-primary)] text-[var(--text-primary)]">
                  {allFonts.map((f, i) => <option key={`${f.value}-${i}`} value={f.value}>{f.label}</option>)}
                </select>
              </div>
            </div>
            <div>
              <input ref={fontUploadRef} type="file" accept=".ttf,.otf,.woff,.woff2" onChange={handleFontUpload} className="hidden" />
              <button type="button" onClick={() => fontUploadRef.current?.click()}
                className="w-full px-2 py-1.5 text-[10px] border border-dashed border-[var(--border-secondary)] rounded-md text-[var(--text-tertiary)] hover:border-[var(--color-brand-sakura)] hover:text-[var(--color-brand-sakura)] transition-colors"
              >上传自定义字体 (.ttf/.otf)</button>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {([
                { label: '主题粗细', value: themeWeight, setter: setThemeWeight },
                { label: '姓名粗细', value: nameWeight, setter: setNameWeight },
                { label: '罗马字粗细', value: romajiWeight, setter: setRomajiWeight },
              ] as const).map(({ label, value, setter }) => (
                <div key={label}>
                  <span className="text-[10px] text-[var(--text-tertiary)] block mb-1">{label}</span>
                  <div className="flex gap-0.5">
                    {[{ w: 300, l: '细' }, { w: 400, l: '中' }, { w: 500, l: '粗' }].map((opt) => (
                      <button
                        key={opt.w}
                        type="button"
                        onClick={() => setter(opt.w)}
                        className={`flex-1 px-1 py-0.5 text-[9px] rounded border transition-colors ${
                          value === opt.w
                            ? 'border-[var(--color-brand-sakura)] bg-[var(--bg-tertiary)] text-[var(--text-primary)]'
                            : 'border-[var(--border-primary)] text-[var(--text-tertiary)]'
                        }`}
                      >
                        {opt.l}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <SliderField label="主题字间距" value={layout.themeLetterSpacing} min={-5} max={10} step={0.1} onChange={(v) => setL('themeLetterSpacing', v)} />
            <SliderField label="姓名字间距" value={layout.nameLetterSpacing} min={-5} max={10} step={0.1} onChange={(v) => setL('nameLetterSpacing', v)} />
            <SliderField label="罗马字字间距" value={layout.romajiLetterSpacing} min={-5} max={10} step={0.1} onChange={(v) => setL('romajiLetterSpacing', v)} />
          </Section>

          {/* 7. Colors & borders */}
          <Section title="7. 颜色与边框" icon={<Palette size={12} />}>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] text-[var(--text-tertiary)] block mb-1">信息栏底色</label>
                <input type="color" value={bgColor} onChange={(e) => setBgColor(e.target.value)} className="w-full h-6 p-0 border border-[var(--border-primary)] rounded cursor-pointer" />
                <ColorSwatch colors={BRAND_SWATCHES} value={bgColor} onChange={setBgColor} />
              </div>
              <div>
                <label className="text-[10px] text-[var(--text-tertiary)] block mb-1">文字颜色</label>
                <input type="color" value={textColor} onChange={(e) => setTextColor(e.target.value)} className="w-full h-6 p-0 border border-[var(--border-primary)] rounded cursor-pointer" />
                <ColorSwatch colors={BRAND_SWATCHES} value={textColor} onChange={setTextColor} />
              </div>
            </div>
            <div>
              <div className="flex items-center gap-2 mb-1.5">
                <label className="flex items-center gap-1.5 text-[10px] text-[var(--text-tertiary)]">
                  <input type="checkbox" checked={showBorder} onChange={(e) => setShowBorder(e.target.checked)} className="w-3 h-3 accent-[var(--color-brand-sakura)]" />
                  信息栏边框
                </label>
                <input type="color" value={borderColor} onChange={(e) => setBorderColor(e.target.value)} disabled={!showBorder} className="w-6 h-5 p-0 border border-[var(--border-primary)] rounded cursor-pointer disabled:opacity-40" />
              </div>
              {showBorder && (
                <>
                  <SliderField label="边框粗细" value={borderThickness} min={0} max={5} step={0.5} onChange={setBorderThickness} />
                  <ColorSwatch colors={BRAND_SWATCHES} value={borderColor} onChange={setBorderColor} />
                </>
              )}
            </div>
          </Section>

          {/* 8. Size & position */}
          <Section title="8. 尺寸位置微调" icon={<SlidersHorizontal size={12} />}>
            <div className="space-y-2">
              <p className="text-[10px] font-semibold text-[var(--text-secondary)]">信息栏</p>
              <SliderField label="下边距" value={layout.marginBottom} min={0} max={50} onChange={(v) => setL('marginBottom', v)} />
              <SliderField label="左右边距" value={layout.marginX} min={0} max={50} onChange={(v) => setL('marginX', v)} />
              <SliderField label="内边距" value={layout.paddingY} min={0} max={40} onChange={(v) => setL('paddingY', v)} />
            </div>
            <div className="space-y-2">
              <p className="text-[10px] font-semibold text-[var(--text-secondary)]">元素尺寸</p>
              <SliderField label="Logo大小" value={layout.logoSize} min={10} max={60} onChange={(v) => setL('logoSize', v)} />
              <SliderField label="团名大小" value={layout.groupNameSize} min={6} max={30} onChange={(v) => setL('groupNameSize', v)} />
              <SliderField label="主题大小" value={layout.themeSize} min={4} max={20} onChange={(v) => setL('themeSize', v)} />
              <SliderField label="姓名大小" value={layout.nameSize} min={8} max={40} onChange={(v) => setL('nameSize', v)} />
              <SliderField label="罗马字大小" value={layout.romajiSize} min={4} max={24} onChange={(v) => setL('romajiSize', v)} />
            </div>
            <div className="space-y-2">
              <p className="text-[10px] font-semibold text-[var(--text-secondary)]">Logo位置</p>
              <div className="grid grid-cols-2 gap-2">
                <SliderField label="X" value={layout.logoX} min={0} max={50} onChange={(v) => setL('logoX', v)} />
                <SliderField label="Y" value={layout.logoY} min={-30} max={30} onChange={(v) => setL('logoY', v)} />
              </div>
            </div>
            <div className="space-y-2">
              <p className="text-[10px] font-semibold text-[var(--text-secondary)]">团名位置</p>
              <div className="grid grid-cols-2 gap-2">
                <SliderField label="X" value={layout.groupNameX} min={0} max={100} onChange={(v) => setL('groupNameX', v)} />
                <SliderField label="Y" value={layout.groupNameY} min={-20} max={20} onChange={(v) => setL('groupNameY', v)} />
              </div>
            </div>
            <div className="space-y-2">
              <p className="text-[10px] font-semibold text-[var(--text-secondary)]">主题位置</p>
              <div className="grid grid-cols-2 gap-2">
                <SliderField label="X" value={layout.themeX} min={-30} max={30} onChange={(v) => setL('themeX', v)} />
                <SliderField label="Y" value={layout.themeY} min={-20} max={20} onChange={(v) => setL('themeY', v)} />
              </div>
            </div>
            <div className="space-y-2">
              <p className="text-[10px] font-semibold text-[var(--text-secondary)]">姓名位置</p>
              <div className="grid grid-cols-2 gap-2">
                <SliderField label="X" value={layout.nameX} min={-30} max={30} onChange={(v) => setL('nameX', v)} />
                <SliderField label="Y" value={layout.nameY} min={-20} max={20} onChange={(v) => setL('nameY', v)} />
              </div>
            </div>
            {showRomaji && (
              <div className="space-y-2">
                <p className="text-[10px] font-semibold text-[var(--text-secondary)]">罗马字位置</p>
                <div className="grid grid-cols-2 gap-2">
                  <SliderField label="X" value={layout.romajiX} min={-30} max={30} onChange={(v) => setL('romajiX', v)} />
                  <SliderField label="Y" value={layout.romajiY} min={-20} max={30} onChange={(v) => setL('romajiY', v)} />
                </div>
              </div>
            )}
          </Section>

          {/* Actions */}
          <div className="space-y-2">
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleDownload}
                disabled={generating}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-semibold text-white rounded-lg transition-opacity hover:opacity-90 disabled:opacity-50"
                style={{ backgroundColor: 'var(--color-brand-sakura)' }}
              >
                {generating ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
                {generating ? '生成中...' : '生成并下载图片'}
              </button>
              <button
                type="button"
                onClick={resetAll}
                className="flex items-center gap-1 px-3 py-2.5 text-xs text-[var(--text-secondary)] border border-[var(--border-primary)] rounded-lg hover:bg-[var(--bg-secondary)] transition-colors"
              >
                <RotateCcw size={12} />
                重置
              </button>
            </div>

            {/* Community actions */}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setShowPublishConfirm(true)}
                disabled={publishing || !imageSrc}
                className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-[10px] font-medium border border-[var(--border-primary)] rounded-lg text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)] transition-colors disabled:opacity-40"
              >
                {publishing ? <Loader2 size={12} className="animate-spin" /> : <Share2 size={12} />}
                {publishing ? '发布中...' : '发布到社区'}
              </button>
            </div>

            {/* Publish confirm dialog */}
            {showPublishConfirm && (
              <div className="border border-[var(--border-primary)] rounded-lg p-3 bg-[var(--bg-secondary)] space-y-2">
                <p className="text-[11px] font-medium text-[var(--text-primary)]">确认发布到社区</p>
                <label className="flex items-center gap-2 text-[10px] text-[var(--text-secondary)] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={allowDownload}
                    onChange={(e) => setAllowDownload(e.target.checked)}
                    className="rounded"
                  />
                  允许他人下载原图
                </label>
                <label className="flex items-center gap-2 text-[10px] text-[var(--text-secondary)] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isAnonymous}
                    onChange={(e) => setIsAnonymous(e.target.checked)}
                    className="rounded"
                  />
                  匿名发布（不显示用户名）
                </label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={handlePublish}
                    disabled={publishing}
                    className="flex-1 flex items-center justify-center gap-1 px-3 py-1.5 text-[10px] font-medium text-white rounded-lg disabled:opacity-50"
                    style={{ backgroundColor: 'var(--color-brand-sakura)' }}
                  >
                    {publishing ? <Loader2 size={10} className="animate-spin" /> : <Check size={10} />}
                    确认发布
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowPublishConfirm(false)}
                    className="px-3 py-1.5 text-[10px] text-[var(--text-tertiary)] border border-[var(--border-primary)] rounded-lg"
                  >
                    取消
                  </button>
                </div>
              </div>
            )}

            {/* Toast */}
            {publishToast && (
              <div className="text-center text-[10px] text-[var(--text-tertiary)] bg-[var(--bg-secondary)] rounded-lg px-3 py-2 animate-pulse">
                {publishToast}
              </div>
            )}
          </div>
        </div>

        {/* === Right: Preview === */}
        <div className="order-1 md:order-2">
          <div className="sticky top-20">
            <div
              ref={cardRef}
              className="w-full mx-auto rounded-lg overflow-hidden"
              style={{ backgroundColor: '#e2e8f0', aspectRatio: '594 / 847' }}
            >
              <div className="relative w-full h-full overflow-hidden">
                {/* Image container with drag/zoom */}
                <div
                  ref={imageContainerRef}
                  className="absolute inset-0 cursor-grab active:cursor-grabbing"
                  onMouseDown={handleMouseDown}
                  onWheel={handleWheel}
                >
                  {imageSrc ? (
                    <img
                      src={imageSrc}
                      alt="Preview"
                      className="w-full h-full object-cover pointer-events-none select-none"
                      draggable={false}
                      style={{
                        transform: `translate(${imageState.translateX}px, ${imageState.translateY}px) scale(${imageState.scale})`,
                      }}
                    />
                  ) : (
                    <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-400">
                      <Upload size={32} className="mb-2 opacity-40" />
                      <p className="text-xs">请上传图片</p>
                    </div>
                  )}
                </div>

                {/* Info bar overlay */}
                <div
                  className="absolute pointer-events-none"
                  style={{
                    bottom: `${layout.marginBottom}px`,
                    left: `${layout.marginX}px`,
                    right: `${layout.marginX}px`,
                  }}
                >
                  <div
                    data-info-bar
                    className="relative"
                    style={{
                      backgroundColor: bgColor,
                      color: textColor,
                      border: showBorder ? `${borderThickness}px solid ${borderColor}` : 'none',
                      paddingTop: `${layout.paddingY}px`,
                      paddingBottom: `${layout.paddingY}px`,
                    }}
                  >
                    {/* Logo */}
                    <div
                      data-draw="image"
                      className="absolute"
                      style={{
                        left: `${layout.logoX}px`,
                        top: '50%',
                        transform: `translateY(calc(-50% + ${layout.logoY}px))`,
                      }}
                    >
                      <img
                        src={customLogoSrc || GROUP_LOGOS[group]}
                        alt="Logo"
                        style={{ height: `${layout.logoSize}px` }}
                        className="h-auto w-auto"
                        crossOrigin="anonymous"
                      />
                    </div>

                    {/* Group name */}
                    <div
                      data-draw="image"
                      className="absolute"
                      style={{
                        left: `${layout.groupNameX}px`,
                        top: '50%',
                        transform: `translateY(calc(-50% + ${layout.groupNameY}px))`,
                      }}
                    >
                      <img
                        src={GROUP_NAME_IMAGES[group]}
                        alt="Group"
                        style={{ height: `${layout.groupNameSize}px` }}
                        className="h-auto w-auto"
                        crossOrigin="anonymous"
                      />
                    </div>

                    {/* Theme */}
                    <div
                      data-draw="text"
                      className="absolute"
                      style={{
                        left: '50%',
                        top: '50%',
                        transform: `translate(calc(-50% + ${layout.themeX}px), calc(-50% + ${layout.themeY}px))`,
                        fontFamily: themeFont,
                        fontSize: `${layout.themeSize}px`,
                        fontWeight: themeWeight,
                        letterSpacing: `${layout.themeLetterSpacing}px`,
                        whiteSpace: 'nowrap',
                        textAlign: 'center' as const,
                      }}
                    >
                      {theme}
                    </div>

                    {/* Theme line 2 */}
                    {showThemeLine2 && (
                      <div
                        data-draw="text"
                        className="absolute"
                        style={{
                          left: '50%',
                          top: '50%',
                          transform: `translate(calc(-50% + ${layout.themeLine2X}px), calc(-50% + ${layout.themeLine2Y}px))`,
                          fontFamily: themeFont,
                          fontSize: `${layout.themeLine2Size}px`,
                          fontWeight: themeWeight,
                          letterSpacing: `${layout.themeLetterSpacing}px`,
                          whiteSpace: 'nowrap',
                          textAlign: 'center' as const,
                        }}
                      >
                        {themeLine2}
                      </div>
                    )}

                    {/* Member name */}
                    <div
                      data-draw="text"
                      className="absolute"
                      style={{
                        right: `${layout.nameX}px`,
                        top: '50%',
                        transform: `translateY(calc(-50% + ${layout.nameY}px))`,
                        fontFamily: nameFont,
                        fontSize: `${layout.nameSize}px`,
                        fontWeight: nameWeight,
                        letterSpacing: `${layout.nameLetterSpacing}px`,
                        whiteSpace: 'nowrap',
                        textAlign: 'right' as const,
                      }}
                    >
                      {memberName}
                    </div>

                    {/* Romaji */}
                    {showRomaji && (
                      <div
                        data-draw="text"
                        className="absolute"
                        style={{
                          right: `${layout.romajiX}px`,
                          top: '50%',
                          transform: `translateY(calc(-50% + ${layout.romajiY}px))`,
                          fontFamily: nameFont,
                          fontSize: `${layout.romajiSize}px`,
                          fontWeight: romajiWeight,
                          letterSpacing: `${layout.romajiLetterSpacing}px`,
                          whiteSpace: 'nowrap',
                          textAlign: 'right' as const,
                        }}
                      >
                        {romajiName}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Preview hint */}
            <p className="text-center text-[9px] text-[var(--text-tertiary)] mt-2">
              实时预览 · 拖拽移动图片 · 双指缩放
            </p>
          </div>
        </div>
      </div>

      {/* Mobile save modal */}
      {mobileImageUrl && (
        <div
          className="fixed inset-0 z-50 flex flex-col items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
          onClick={() => setMobileImageUrl(null)}
        >
          <div
            className="relative bg-white rounded-xl shadow-2xl max-w-sm w-full overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setMobileImageUrl(null)}
              className="absolute top-2 right-2 z-10 w-8 h-8 flex items-center justify-center rounded-full bg-black/50 text-white hover:bg-black/70 transition-colors"
            >
              <X size={16} />
            </button>
            <img
              src={mobileImageUrl}
              alt="生成的卡片"
              className="w-full h-auto block"
              style={{ WebkitTouchCallout: 'default' }}
            />
            <div className="px-4 py-3 text-center">
              <p className="text-sm font-semibold text-gray-800">長押しして画像を保存</p>
              <p className="text-xs text-gray-500 mt-0.5">长按上方图片 → 保存到相册</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
