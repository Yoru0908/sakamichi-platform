export const zh = {
  // Nav
  'nav.blog': '博客',
  'nav.messages': 'MSG',
  'nav.radio': '广播',
  'nav.instagram': 'INS',
  'nav.gallery': '画廊',
  'nav.photocard': '生写生成',
  'nav.repo': '握手Repo',
  'nav.tools': '更多工具',
  'nav.tools.photocard': '生写生成器',
  'nav.tools.msg_generator': 'MSG样式生成器',
  'nav.tools.subtitle_bg': '字幕底图制作',
  'nav.tools.subtitle_merge': '字幕合并',
  'nav.tools.srt_fixer': 'SRT时间轴修复',
  'nav.tools.fad_effect': 'FAD特效',
  'nav.login': '登录',
  'nav.register': '注册',

  // User menu
  'nav.user.profile': '个人主页',
  'nav.user.works': '我的作品',
  'nav.user.favorites': '收藏',
  'nav.user.comments': '我的评论',
  'nav.user.settings': '设置',
  'nav.user.logout': '退出登录',

  // Mobile drawer groups
  'nav.group.content': '内容',
  'nav.group.community': '社区',
  'nav.group.tools': '工具',
  'nav.group.account': '账户',

  // Theme
  'theme.light': '浅色模式',
  'theme.dark': '深色模式',

  // Footer
  'footer.description': '为坂道系粉丝提供博客翻译、MSG消息归档、广播收听、创作工具等综合服务。',
  'footer.disclaimer': '本站为非官方粉丝项目，与乃木坂46、樱坂46、日向坂46及其运营方无任何关联。所有内容仅供个人学习与交流使用。',
  'footer.col.content': '内容',
  'footer.col.tools': '工具',
  'footer.col.help': '帮助',
  'footer.about': '关于本站',
  'footer.privacy': '隐私政策',
  'footer.terms': '使用条款',
  'footer.contact': '联系方式',
  'footer.links': '友情链接',
  'footer.copyright': '© {year} Sakamichi Tools',

  // Home
  'home.hero.title': 'Sakamichi Tools',
  'home.hero.subtitle': '坂道系列综合工具平台',
  'home.section.content': '内容板块',
  'home.section.tools': '实用工具',
  'home.coming_soon': '即将上线',
  'home.in_dev': '开发中',

  // Common
  'common.loading': '加载中...',
  'common.error': '加载失败',
  'common.retry': '重试',
  'common.back': '返回',
  'common.search': '搜索',
  'common.all': '全部',
} as const;

export type TranslationKey = keyof typeof zh;
