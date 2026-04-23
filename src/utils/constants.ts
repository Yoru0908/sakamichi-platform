export const SITE_CONFIG = {
  name: 'Sakamichi Tools',
  description: '坂道系列综合工具平台',
  url: 'https://46log.com',
  author: 'Sakamichi Tools',
  
  colors: {
    nogizaka: '#742581',
    sakurazaka: '#F19DB5',
    hinatazaka: '#7BC7E8',
  },
  
  groups: {
    nogizaka: {
      name: '乃木坂46',
      nameJa: '乃木坂46',
      color: '#742581',
      siteKey: 'nogizaka',
    },
    sakurazaka: {
      name: '樱坂46',
      nameJa: '櫻坂46',
      color: '#F19DB5',
      siteKey: 'sakurazaka',
    },
    hinatazaka: {
      name: '日向坂46',
      nameJa: '日向坂46',
      color: '#7BC7E8',
      siteKey: 'hinatazaka',
    },
  },
} as const;

export const API_CONFIG = {
  baseUrl: 'https://api.46log.com',
  endpoints: {
    blog: '/api/blog',
    messages: '/api/messages',
    instagram: '/api/instagram',
    radio: '/api/radio',
    shop: '/api/shop',
    auth: '/api/auth',
    media: '/api/media',
  },
} as const;

export const USER_ROLES = {
  GUEST: 'guest',
  MEMBER: 'member',
  VERIFIED: 'verified',
  TRANSLATOR: 'translator',
  ADMIN: 'admin',
} as const;

export const CONTENT_LEVELS = {
  PUBLIC: 'public',
  SEMI_PUBLIC: 'semi_public',
  RESTRICTED: 'restricted',
  PRIVATE: 'private',
} as const;
