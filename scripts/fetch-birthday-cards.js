/**
 * 生日贺卡抓取脚本
 * 从樱坂46官网抓取成员生日贺卡
 *
 * 用法:
 *   SAKURAZAKA_EMAIL=... SAKURAZAKA_PASSWORD=... node fetch-birthday-cards.js
 *
 * 输出:
 *   ../public/data/birthday-cards.json
 */

import * as cheerio from 'cheerio';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const LOGIN_EMAIL = process.env.SAKURAZAKA_EMAIL || '';
const LOGIN_PASSWORD = process.env.SAKURAZAKA_PASSWORD || '';

const outputDir = path.join(__dirname, '../public/data');
const outputPath = path.join(outputDir, 'birthday-cards.json');

if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

const USER_AGENT = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/145.0.7632.108 Mobile/15E148 Safari/604.1';
const BASE_URL = 'https://sakurazaka46.com';
const LOGIN_POST_URL = `${BASE_URL}/s/s46/login`;
const LOGIN_TEST_URL = `${BASE_URL}/s/s46/diary/radio?ima=0000`;
const LOGIN_BOOTSTRAP_URLS = [
  `${BASE_URL}/s/s46/artist/77?ima=0000`,
  `${BASE_URL}/s/s46/diary/radio?ima=0000`,
  `${BASE_URL}/s/s46/login?ima=0000`,
  `${BASE_URL}/s/s46/`,
];
const BIRTHDAY_INDEX_URLS = [
  `${BASE_URL}/s/s46/page/birthdaymail_ry9pesrg`,
  `${BASE_URL}/s/s46/page/birthdaymail_ivrhvjac?ima=0000`,
];

const allCookies = new Map();

function collectCookies(res) {
  const getSetCookie = res.headers.getSetCookie?.bind(res.headers);
  const setCookies = getSetCookie ? getSetCookie() : [];
  for (const sc of setCookies) {
    const nameValue = sc.split(';')[0];
    const eqIdx = nameValue.indexOf('=');
    if (eqIdx > 0) {
      const name = nameValue.slice(0, eqIdx);
      allCookies.set(name, nameValue);
    }
  }
}

function getCookieString() {
  return [...allCookies.values()].join('; ');
}

function isLoginWall(html) {
  return html.includes('ログイン') || html.includes('新規会員登録') || html.includes('会員登録');
}

function extractLoginBootstrap(html) {
  const $ = cheerio.load(html);
  const form = $('form[action="/s/s46/login"]').first();
  if (!form.length) return null;

  const read = (name) => form.find(`input[name="${name}"]`).attr('value')?.trim() || '';
  const webckid = read('my_webckid');
  if (!webckid) return null;

  return {
    my_prevtyp: read('my_prevtyp') || 'S',
    my_prevdom: read('my_prevdom') || 'sakurazaka46.com',
    my_prevurl: read('my_prevurl') || '/s/s46/',
    my_prevmet: read('my_prevmet') || 'GET',
    my_webckid: webckid,
    my_prevprm: read('my_prevprm'),
    ima: read('ima') || '0000',
  };
}

async function fetchWithCookies(url, options = {}) {
  const headers = new Headers(options.headers || {});
  headers.set('User-Agent', USER_AGENT);
  const cookieString = getCookieString();
  if (cookieString) headers.set('Cookie', cookieString);

  const res = await fetch(url, {
    ...options,
    headers,
  });
  collectCookies(res);
  return res;
}

async function login() {
  console.log('🔐 正在登录樱坂46官网...');

  if (!LOGIN_EMAIL || !LOGIN_PASSWORD) {
    throw new Error('缺少环境变量: SAKURAZAKA_EMAIL / SAKURAZAKA_PASSWORD');
  }

  let bootstrap = null;
  for (const bootstrapUrl of LOGIN_BOOTSTRAP_URLS) {
    const response = await fetchWithCookies(bootstrapUrl);
    if (!response.ok) {
      console.log(`⚠️ 登录引导页访问失败: ${bootstrapUrl} -> ${response.status}`);
      continue;
    }

    const html = await response.text();
    const debugName = bootstrapUrl.includes('/artist/')
      ? 'member-page-debug.html'
      : bootstrapUrl.includes('/diary/radio')
        ? 'login-test-debug.html'
        : 'home-page-debug.html';
    fs.writeFileSync(path.join(__dirname, debugName), html, 'utf-8');

    const found = extractLoginBootstrap(html);
    if (found) {
      bootstrap = found;
      console.log(`🔑 从登录表单页面提取到 my_webckid: ${bootstrapUrl}`);
      break;
    }
  }

  if (!bootstrap) {
    throw new Error('未能从登录表单页面提取到 my_webckid');
  }

  const body = new URLSearchParams({
    my_prevtyp: bootstrap.my_prevtyp,
    my_prevdom: bootstrap.my_prevdom,
    my_prevurl: bootstrap.my_prevurl,
    my_prevmet: bootstrap.my_prevmet,
    my_webckid: bootstrap.my_webckid,
    my_prevprm: bootstrap.my_prevprm,
    mode: 'LOGIN',
    ima: bootstrap.ima,
    idpwLgid: LOGIN_EMAIL,
    idpwLgpw: LOGIN_PASSWORD,
  });

  let res = await fetchWithCookies(LOGIN_POST_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Origin: BASE_URL,
      Referer: `${BASE_URL}/s/s46/login`,
    },
    body: body.toString(),
    redirect: 'manual',
  });

  let location = res.headers.get('location');
  while (location) {
    const nextUrl = location.startsWith('http') ? location : `${BASE_URL}${location}`;
    res = await fetchWithCookies(nextUrl, {
      redirect: 'manual',
    });
    location = res.headers.get('location');
  }

  const b81Cookie = allCookies.get('B81AC560F83BFC8C');
  if (!b81Cookie) {
    throw new Error('未获取到 B81 session cookie');
  }

  console.log(`✅ 已获取 B81: ${b81Cookie.slice(0, 32)}...`);
}

async function testLoginStatus() {
  console.log('🧪 验证登录状态...');

  const response = await fetchWithCookies(LOGIN_TEST_URL, { redirect: 'follow' });
  const html = await response.text();

  const debugPath = path.join(__dirname, 'login-test-debug.html');
  fs.writeFileSync(debugPath, html, 'utf-8');
  console.log(`💾 测试页面HTML已保存到: ${debugPath}`);

  if (isLoginWall(html)) {
    console.log('❌ 登录状态无效：仍然返回登录页');
    return false;
  }

  if (html.length < 10000) {
    console.log(`❌ 登录状态可疑：页面过短 (${html.length} bytes)`);
    return false;
  }

  console.log(`✅ 登录状态有效，页面长度: ${html.length} bytes`);
  return true;
}

function normalizeImageUrl(imageUrl) {
  return imageUrl.startsWith('http') ? imageUrl : `${BASE_URL}${imageUrl}`;
}

function dedupeCards(cards) {
  const seen = new Set();
  return cards.filter((card) => {
    const key = `${card.memberId || ''}|${card.month || ''}|${card.group || ''}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function fetchBirthdayCards(targetMonth) {
  console.log(`🎂 正在从樱坂46官方 API 抓取生日贺卡 (归档月份: ${targetMonth})...`);

  const apiUrl = `${BASE_URL}/s/s46/api/list/birthday_card`;
  const response = await fetchWithCookies(apiUrl);

  if (!response.ok) {
    throw new Error(`樱坂 API 响应失败: ${response.status}`);
  }

  const json = await response.json();
  const birthdayCards = json.birthday_card || [];
  
  // 用于构建页面详情页 URL 的年月字符串 (例如 "202606")
  const urlMonth = targetMonth.replace('-', '');

  const cards = birthdayCards.map(item => {
    // 确保去掉可能存在的尺寸后缀，获取原图
    const originalUrl = item.birthday_card_src.replace(/\/\d+_\d+_\d+\.jpg$/, '.jpg');
    return {
      member: item.name,
      memberId: item.id,
      cardUrl: normalizeImageUrl(originalUrl),
      pageUrl: `${BASE_URL}/s/s46/contents/B${urlMonth}_${item.id}?ima=0000&m=${item.id}`,
      group: '樱坂46',
      month: targetMonth,
    };
  });

  return dedupeCards(cards);
}

async function fetchHinatazakaBirthdayCards(targetMonth) {
  console.log(`🎂 正在从日向坂46官方 API 抓取生日贺卡 (归档月份: ${targetMonth})...`);

  const apiUrl = 'https://www.hinatazaka46.com/s/official/api/list/birthday_card';
  const response = await fetch(apiUrl, {
    headers: { 'User-Agent': USER_AGENT }
  });

  if (!response.ok) {
    throw new Error(`日向坂 API 响应失败: ${response.status}`);
  }

  const json = await response.json();
  const birthdayCards = json.birthday_card || [];
  
  const urlMonth = targetMonth.replace('-', '');

  const cards = birthdayCards.map(item => {
    return {
      member: item.name,
      memberId: item.id,
      cardUrl: item.birthday_card_src,
      pageUrl: `https://www.hinatazaka46.com/s/official/contents/B${urlMonth}_${item.id}?ima=0000`,
      group: '日向坂46',
      month: targetMonth,
    };
  });

  return dedupeCards(cards);
}

async function testDirectImageAccess() {
  console.log('🧪 测试直接访问图片URL...');

  const testImageUrl = 'https://sakurazaka46.com/images/14/69e/63de8038a3f9aa9d350af2e7cee77.jpg';
  const response = await fetch(testImageUrl, {
    headers: { 'User-Agent': USER_AGENT },
  });

  console.log(`📊 图片响应状态: ${response.status}`);
  console.log(`📊 Content-Type: ${response.headers.get('content-type')}`);
  console.log(`📊 Content-Length: ${response.headers.get('content-length')}`);

  return response.ok;
}

async function main() {
  console.log('🚀 开始抓取生日贺卡...\n');

  const canAccessImages = await testDirectImageAccess();
  if (canAccessImages) {
    console.log('💡 图片资源可以直接访问');
  }

  await login();

  const loginOk = await testLoginStatus();
  if (!loginOk) {
    throw new Error('登录后验证失败，请检查账号权限或登录参数');
  }

  // 1. 获取目标年月
  const now = new Date();
  const defaultMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const targetMonth = process.env.TARGET_MONTH || defaultMonth;

  // 2. 读取现有数据
  let existingCards = [];
  if (fs.existsSync(outputPath)) {
    try {
      const oldData = JSON.parse(fs.readFileSync(outputPath, 'utf-8'));
      existingCards = oldData.cards || [];
      
      // 为没有 month 字段的旧数据补充归档标签 (例如 202511 -> 2025-11)
      existingCards = existingCards.map(c => {
        if (!c.month) {
          const match = c.pageUrl?.match(/\/B(\d{4})(\d{2})_/);
          c.month = match ? `${match[1]}-${match[2]}` : '2025-11';
        }
        if (!c.group) {
          c.group = '樱坂46';
        }
        return c;
      });
    } catch (e) {
      console.log('⚠️ 读取现有 JSON 失败，将重新生成数据:', e.message);
    }
  }

  // 3. 抓取新贺卡并合并
  const newSakuraCards = await fetchBirthdayCards(targetMonth);
  let newHinataCards = [];
  try {
    newHinataCards = await fetchHinatazakaBirthdayCards(targetMonth);
  } catch (err) {
    console.error('⚠️ 抓取日向坂46生日贺卡失败:', err.message);
  }

  const newCards = [...newSakuraCards, ...newHinataCards];
  
  const mergedCards = [...existingCards];
  for (const newCard of newCards) {
    const idx = mergedCards.findIndex(
      c => c.memberId === newCard.memberId && c.month === newCard.month && c.group === newCard.group
    );
    if (idx !== -1) {
      mergedCards[idx] = newCard; // 覆盖更新
    } else {
      mergedCards.push(newCard); // 追加插入
    }
  }

  const finalCards = dedupeCards(mergedCards);

  const data = {
    lastUpdate: new Date().toISOString(),
    source: '坂道官网生日贺卡',
    note: '合并抓取樱坂46与日向坂46生日贺卡',
    cards: finalCards,
  };

  fs.writeFileSync(outputPath, JSON.stringify(data, null, 2), 'utf-8');
  console.log(`\n✅ 数据已保存到: ${outputPath}`);

  if (newCards.length > 0) {
    console.log('\n📋 本次抓取数据预览:');
    newCards.slice(0, 5).forEach((card, i) => {
      console.log(`  ${i + 1}. [${card.group}] ${card.member} (${card.month}): ${card.cardUrl}`);
    });
  } else {
    console.log('⚠️ 未找到生日贺卡数据');
  }

  console.log(`\n📊 历史库内总计: ${finalCards.length} 张生日贺卡 (本次新增/更新 ${newCards.length} 张)`);
}

main().catch((error) => {
  console.error(`❌ ${error.message}`);
  process.exitCode = 1;
});
