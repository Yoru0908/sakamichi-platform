import type { TranslationKey } from '@/i18n/zh';

export interface NavItem {
  labelKey: TranslationKey;
  href: string;
  icon?: string;
  children?: NavItem[];
  badge?: 'new' | 'soon';
  external?: boolean;
}

export interface NavGroup {
  groupKey: TranslationKey;
  items: NavItem[];
}

const TICKET_FORM_TOOL_HREF = 'https://chromewebstore.google.com/detail/%E5%9D%82%E9%81%93%E3%83%81%E3%82%B1%E3%83%83%E3%83%88%E4%B8%80%E9%94%AE%E5%A1%AB%E5%86%99/ghhhepiljinhplblcgalalafpagddhmp?authuser=0&hl=ja';

/** Desktop top-level navigation items (Phase 1: flat + 1 dropdown) */
export const NAV_ITEMS: NavItem[] = [
  { labelKey: 'nav.home', href: '/', icon: 'Home' },
  { labelKey: 'nav.blog', href: '/blog', icon: 'Pen' },
  { labelKey: 'nav.messages', href: '/messages', icon: 'MessageCircle' },
  { labelKey: 'nav.radio', href: '/radio', icon: 'Radio' },
  { labelKey: 'nav.instagram', href: '/instagram', icon: 'Camera' },
  { labelKey: 'nav.photocard', href: '/photocard', icon: 'Image' },
  { labelKey: 'nav.miguri', href: '/miguri', icon: 'Calendar' },
  { labelKey: 'nav.repo', href: '/repo', icon: 'Mic' },
  {
    labelKey: 'nav.tools',
    href: '/tools',
    icon: 'Wrench',
    children: [
      { labelKey: 'nav.tools.msg_generator', href: '/tools/msg-generator', icon: 'MessageSquare' },
      { labelKey: 'nav.tools.subtitle_merge', href: '/tools/subtitle-merge', icon: 'FileText' },
      { labelKey: 'nav.tools.srt_fixer', href: '/tools/srt-fixer', icon: 'Clock' },
      { labelKey: 'nav.tools.fad_effect', href: '/tools/fad-effect', icon: 'Sparkles' },
      { labelKey: 'nav.tools.ticket_form', href: TICKET_FORM_TOOL_HREF, icon: 'Ticket', external: true },
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
      { labelKey: 'nav.miguri', href: '/miguri', icon: 'Calendar' },
      { labelKey: 'nav.repo', href: '/repo', icon: 'Mic' },
      { labelKey: 'nav.gallery', href: '/gallery', icon: 'ImagePlus' },
    ],
  },
  {
    groupKey: 'nav.group.tools',
    items: [
      { labelKey: 'nav.tools.msg_generator', href: '/tools/msg-generator', icon: 'MessageSquare' },
      { labelKey: 'nav.tools.subtitle_merge', href: '/tools/subtitle-merge', icon: 'FileText' },
      { labelKey: 'nav.tools.srt_fixer', href: '/tools/srt-fixer', icon: 'Clock' },
      { labelKey: 'nav.tools.fad_effect', href: '/tools/fad-effect', icon: 'Sparkles' },
      { labelKey: 'nav.tools.ticket_form', href: TICKET_FORM_TOOL_HREF, icon: 'Ticket', external: true },
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
  { labelKey: 'nav.tools.ticket_form', href: TICKET_FORM_TOOL_HREF, external: true },
];

export const FOOTER_HELP_LINKS: NavItem[] = [
  { labelKey: 'footer.about', href: '/about' },
  { labelKey: 'footer.privacy', href: '/privacy' },
  { labelKey: 'footer.terms', href: '/terms' },
  { labelKey: 'footer.contact', href: '/contact' },
  { labelKey: 'footer.links', href: '/links' },
];
