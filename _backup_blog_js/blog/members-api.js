/**
 * 成员数据 API 客户端
 * 从后端统一获取成员信息
 */

const API_BASE_URL = window.API_BASE;

// 缓存成员数据（1小时）
const membersCache = new Map();
const CACHE_TTL = window.CACHE_TTL; // 1小时

/**
 * 获取指定团体的成员数据（按期别分组）
 */
export async function getMembers(group) {
  const cacheKey = `members_${group}`;
  const cached = membersCache.get(cacheKey);
  
  // 检查缓存
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data;
  }

  try {
    const response = await fetch(`${API_BASE_URL}/api/members/${group}`);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();
    
    // 缓存数据
    membersCache.set(cacheKey, {
      data,
      timestamp: Date.now()
    });

    return data;

  } catch (error) {
    console.error(`获取${group}成员数据失败:`, error);
    
    // 回退到本地配置（如果有）
    if (window.MEMBERS_DATA && window.MEMBERS_DATA[group]) {
      console.warn('使用本地成员数据回退');
      return {
        group,
        name: window.MEMBERS_DATA[group].name,
        generations: window.MEMBERS_DATA[group].generations
      };
    }
    
    throw error;
  }
}

/**
 * 获取所有团体的成员列表（扁平化，用于搜索）
 */
export async function getAllMembers() {
  const cacheKey = 'all_members';
  const cached = membersCache.get(cacheKey);
  
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data;
  }

  try {
    const response = await fetch(`${API_BASE_URL}/api/members/all`);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();
    
    membersCache.set(cacheKey, {
      data,
      timestamp: Date.now()
    });

    return data;

  } catch (error) {
    console.error('获取所有成员数据失败:', error);
    throw error;
  }
}

/**
 * 清除缓存
 */
export function clearMembersCache() {
  membersCache.clear();
}

// 使用示例
/*
// 1. 获取樱坂46成员（按期别）
const sakuraMembers = await getMembers('sakurazaka');
console.log(sakuraMembers);
// {
//   group: 'sakurazaka',
//   name: '樱坂46',
//   generations: [
//     { name: '二期生', generation: 2, members: [...] },
//     { name: '三期生', generation: 3, members: [...] }
//   ]
// }

// 2. 获取所有成员（用于搜索）
const allMembers = await getAllMembers();
console.log(allMembers);
// {
//   nogizaka: ['伊藤 理々杏', ...],
//   sakurazaka: ['井上 梨名', ...],
//   hinatazaka: ['金村 美玖', ...]
// }

// 3. 前端组件中使用
async function loadMemberFilter() {
  const members = await getMembers('sakurazaka');
  
  members.generations.forEach(gen => {
    const optgroup = document.createElement('optgroup');
    optgroup.label = gen.name;
    
    gen.members.forEach(member => {
      const option = document.createElement('option');
      option.value = member;
      option.textContent = member;
      optgroup.appendChild(option);
    });
    
    memberSelect.appendChild(optgroup);
  });
}
*/
