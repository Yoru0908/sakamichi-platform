// Instagram archive data — ported from instagram-archive-frontend/account-names.json + config.js

export type GroupKey = 'nogizaka' | 'sakurazaka' | 'hinatazaka';
export type GroupFilter = GroupKey | 'all' | 'favorites';

export interface InsAccount {
  username: string;
  displayName: string;
  group: GroupKey;
}

export const GROUP_LABELS: Record<GroupFilter, string> = {
  all: '全部',
  nogizaka: '乃木坂',
  sakurazaka: '櫻坂',
  hinatazaka: '日向坂',
  favorites: '收藏',
};

export const GROUP_COLORS: Record<GroupKey, string> = {
  nogizaka: 'var(--color-brand-nogi)',
  sakurazaka: 'var(--color-brand-sakura)',
  hinatazaka: 'var(--color-brand-hinata)',
};

export const GROUP_HEX: Record<GroupKey, string> = {
  nogizaka: '#742581',
  sakurazaka: '#F19DB5',
  hinatazaka: '#7BC7E8',
};

// API config (matches existing frontend config.js)
export const INS_CONFIG = {
  apiDomain: 'ins-download.sakamichi-tools.cn',
  alistDomain: 'alist.sakamichi-tools.cn',

  getFileListUrl() {
    return `https://${this.apiDomain}/api/file-list`;
  },
  getIndexUrl() {
    return `https://${this.apiDomain}/api/index`;
  },
  getMediaApiUrl(params: {
    page?: number; limit?: number; account?: string;
    type?: string; sort?: string; order?: string;
  } = {}) {
    const p = new URLSearchParams({
      page: String(params.page ?? 1),
      limit: String(params.limit ?? 48),
      sort: params.sort ?? 'publish_time',
      order: params.order ?? 'desc',
    });
    if (params.account) p.append('account', params.account);
    if (params.type && params.type !== 'all') p.append('type', params.type);
    return `https://${this.apiDomain}/api/media?${p}`;
  },
  getThumbUrl(key: string, width = 400) {
    const clean = key.startsWith('media/') ? key.slice(6) : key;
    return `https://${this.apiDomain}/api/thumb/${clean}?w=${width}`;
  },
  getMediaUrl(key: string) {
    const parts = key.split('/');
    if (parts.length >= 4 && parts[0] === 'media') {
      const path = parts.slice(1).join('/');
      return `https://${this.alistDomain}/d/instagram/${path}`;
    }
    return `https://${this.alistDomain}/d/instagram/${key}`;
  },
};

// Account names data — synced from account-names.json
const RAW_ACCOUNTS: Record<string, Record<string, string>> = {
  '乃木坂46': {
    'y.ayanochristie.official': '吉田綾乃クリスティー',
    'kaede_sato.official': '佐藤楓',
    'ayame.tsutsui.official': '筒井あやめ',
    'miku.ichinose_official': '一ノ瀬美空',
    'nao.yumiki_official': '弓木奈於',
    'iroha_okuda_official': '奥田いろは',
    'ume_minami.official': '梅澤美波',
    'yodayuuki_oimo': '与田祐希',
    'kubo.shiori.official': '久保史緒里',
    'n.reno_official': '中西アルノ',
    'riria.ito_official': '伊藤理々杏',
    'hayashi.runa_honmonogram': '林瑠奈',
    'mao.ioki.official': '五百城茉央',
    'satsukisugawara_official': '菅原咲月',
    'okamotohina_official': '岡本姫奈',
    'nagi.i_official': '井上和',
    'teresaikedaofficial': '池田瑛紗',
    'sakurakawasaki.official': '川﨑桜',
    'renka.i_official': '岩本蓮加',
    'saya.kanagawa_official': '金川紗耶',
    'lica_sato_official': '佐藤璃果',
    'mio.yakubo_official': '矢久保美緒',
    'kuromi_haruka': '黒見明香',
    'tamuramayuofficial': '田村真佑',
    'mizuki.yamashita.official': '山下美月',
    'hayakawa.seira.official': '早川聖来',
    'yuri_kitagawa.official': '北川悠理',
    'manatsu.akimoto_official': '秋元真夏',
    'asuka.3110.official': '齋藤飛鳥',
    'horimiona_2nd': '堀未央奈',
    'm.shiraishi.official': '白石麻衣',
    'nishino.nanase.official': '西野七瀬',
    'ikutaerika.official': '生田絵梨花',
    'matsumura_sayuri_official': '松村沙友理',
  },
  '櫻坂46': {
    'miichan_official': '小池美波',
    '_yui_kobayashi': '小林由依',
    'fuustagram215': '齋藤冬優花',
    'takemotoyui_official': '武元唯衣',
    'rena_moriya_official': '守屋麗奈',
    'akiho_onuma_official': '大沼晶保',
    'fujiyoshi.karin': '藤吉夏鈴',
    'yamasaki.ten': '山﨑天',
    'yuzuki_nakashima_official': '中嶋優月',
    'reinaodakura_official': '小田倉麗奈',
    'airi.taniguchi.official': '谷口愛季',
    'yu.murai_official': '村井優',
    'ozonoreis2': '大園玲',
    'rika.ishimori.official': '石森璃花',
    'matsudarina_official': '松田里奈',
    'miumurayama_official': '村山美羽',
    'endohikari_official': '遠藤光莉',
    'sakurazaka46_info_official': '櫻坂46官方',
    'sakurazaka46jp': '櫻坂46',
    'habuchaan': '土生瑞穂',
    'seki_yumiko_official': '関有美子',
    'yuuka_sugai_official': '菅井友香',
    'harada_aoi_': '原田葵',
    'watanabe.rika.official': '渡辺梨加',
    'akane.moriya_official': '守屋茜',
    'nerunagahama_': '長濱ねる',
  },
  '日向坂46': {
    'katoshi.official': '加藤史帆',
    'kumisasaki_': '佐々木久美',
    'mireisasaki_official': '佐々木美玲',
    'ayacheri._.official': '高本彩花',
    'mei.higashimura': '東村芽依',
    'miku_osushi': '金村美玖',
    'suzy.tomita': '富田鈴花',
    'nibuchan_akari': '丹生明里',
    'hiyotan928_official': '濱岸ひより',
    'matsudakonoka.yahos': '松田好花',
    'hina17_kawata': '河田陽菜',
    'hinanokamimura.official': '上村ひなの',
    'konishi773_official': '小西夏菜実',
    'saitokyoko_official': '齊藤京子',
    'iguchi.mao': '井口眞緒',
    'mihowatanabe_': '渡邉美穂',
    'manamomiyata_official': '宮田愛萌',
    'kageyamayuka_official': '影山優佳',
    'ushiosarina8_8': '潮紗理菜',
    'sumire_miyachi_': '宮地すみれ',
    'haruka.yamashita.official': '山下葉留花',
    'hiraho.official': '平尾帆夏',
    'mikuni.takahashi__': '髙橋未来虹',
    'rio_shimizu.official': '清水理央',
    'mariemorimoto_official': '森本茉莉',
    'mitsuki.hiraoka': '平岡海月',
    'haruyoyamaguchi.official': '山口陽世',
    'ishizukatamaki_official': '石塚瑶季',
  },
};

const GROUP_KEY_MAP: Record<string, GroupKey> = {
  '乃木坂46': 'nogizaka',
  '櫻坂46': 'sakurazaka',
  '日向坂46': 'hinatazaka',
};

// Flatten into InsAccount[]
export const ALL_ACCOUNTS: InsAccount[] = Object.entries(RAW_ACCOUNTS).flatMap(
  ([groupName, accounts]) =>
    Object.entries(accounts).map(([username, displayName]) => ({
      username,
      displayName,
      group: GROUP_KEY_MAP[groupName],
    }))
);

// Quick lookup: username → displayName
const USERNAME_MAP = new Map(ALL_ACCOUNTS.map(a => [a.username, a.displayName]));
export function getDisplayName(username: string): string {
  return USERNAME_MAP.get(username) || username;
}

export function getAccountsByGroup(filter: GroupFilter): InsAccount[] {
  if (filter === 'all') return ALL_ACCOUNTS;
  if (filter === 'favorites') return []; // TODO: backed by localStorage
  return ALL_ACCOUNTS.filter((a) => a.group === filter);
}
