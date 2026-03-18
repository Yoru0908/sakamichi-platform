import type { TranslationKey } from '@/i18n/zh';

export interface NavItem {
  labelKey: TranslationKey;
  href: string;
  icon?: string;
  children?: NavItem[];
  badge?: 'new' | 'soon';
}

export interface NavGroup {
  groupKey: TranslationKey;
  items: NavItem[];
}

/** Desktop top-level navigation items (Phase 1: flat + 1 dropdown) */
export const NAV_ITEMS: NavItem[] = [
  { labelKey: 'nav.blog', href: '/blog', icon: 'Pen' },
  { labelKey: 'nav.messages', href: '/messages', icon: 'MessageCircle' },
  { labelKey: 'nav.radio', href: '/radio', icon: 'Radio' },
  { labelKey: 'nav.instagram', href: '/instagram', icon: 'Camera' },
  { labelKey: 'nav.photocard', href: '/photocard', icon: 'Image' },
  {
    labelKey: 'nav.tools',
    href: '/tools',
    icon: 'Wrench',
    children: [
      { labelKey: 'nav.tools.msg_generator', href: '/tools/msg-generator', icon: 'MessageSquare' },
      { labelKey: 'nav.tools.subtitle_bg', href: '/tools/subtitle-bg', icon: 'Film' },
      { labelKey: 'nav.tools.subtitle_merge', href: '/tools/subtitle-merge', icon: 'FileText' },
      { labelKey: 'nav.tools.srt_fixer', href: '/tools/srt-fixer', icon: 'Clock' },
      { labelKey: 'nav.tools.fad_effect', href: '/tools/fad-effect', icon: 'Sparkles' },
    ],
  },
];

/** Mobile drawer — grouped sections */
export const MOBILE_NAV_GROUPS: NavGroup[] = [
  {
    groupKey: 'nav.group.content',
    items: [
      { labelKey: 'nav.blog', href: '/blog', icon: 'Pen' },
      { labelKey: 'nav.messages', href: '/messages', icon: 'MessageCircle' },
      { labelKey: 'nav.radio', href: '/radio', icon: 'Radio' },
      { labelKey: 'nav.instagram', href: '/instagram', icon: 'Camera' },
    ],
  },
  {
    groupKey: 'nav.group.community',
    items: [
      { labelKey: 'nav.photocard', href: '/photocard', icon: 'Image' },
      { labelKey: 'nav.gallery', href: '/gallery', icon: 'ImagePlus' },
    ],
  },
  {
    groupKey: 'nav.group.tools',
    items: [
      { labelKey: 'nav.tools.msg_generator', href: '/tools/msg-generator', icon: 'MessageSquare' },
      { labelKey: 'nav.tools.subtitle_bg', href: '/tools/subtitle-bg', icon: 'Film' },
      { labelKey: 'nav.tools.subtitle_merge', href: '/tools/subtitle-merge', icon: 'FileText' },
      { labelKey: 'nav.tools.srt_fixer', href: '/tools/srt-fixer', icon: 'Clock' },
      { labelKey: 'nav.tools.fad_effect', href: '/tools/fad-effect', icon: 'Sparkles' },
    ],
  },
];

/** Footer link columns */
export const FOOTER_CONTENT_LINKS: NavItem[] = [
  { labelKey: 'nav.blog', href: '/blog' },
  { labelKey: 'nav.messages', href: '/messages' },
  { labelKey: 'nav.radio', href: '/radio' },
  { labelKey: 'nav.instagram', href: '/instagram' },
];

export const FOOTER_COMMUNITY_LINKS: NavItem[] = [
  { labelKey: 'nav.photocard', href: '/photocard' },
  { labelKey: 'nav.gallery', href: '/gallery' },
];

export const FOOTER_TOOL_LINKS: NavItem[] = [
  { labelKey: 'nav.tools.msg_generator', href: '/tools/msg-generator' },
  { labelKey: 'nav.tools.subtitle_bg', href: '/tools/subtitle-bg' },
];

export const FOOTER_HELP_LINKS: NavItem[] = [
  { labelKey: 'footer.about', href: '/about' },
  { labelKey: 'footer.privacy', href: '/privacy' },
  { labelKey: 'footer.terms', href: '/terms' },
  { labelKey: 'footer.contact', href: '/contact' },
  { labelKey: 'footer.links', href: '/links' },
];
