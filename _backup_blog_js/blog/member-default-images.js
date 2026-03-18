/**
 * 成员头像管理模块
 *
 * 功能：
 * 1. 从 member-images.json 加载真实成员头像
 * 2. 提供统一的头像URL获取接口
 * 3. 支持降级到默认头像
 * 4. 智能处理成员名称格式差异（有无空格）
 */

window.MemberImages = {
  images: null,
  initialized: false,

  /**
   * 初始化 - 加载 member-images.json
   */
  async init() {
    if (this.initialized) return;

    try {
      const response = await fetch('data/member-images.json');
      if (response.ok) {
        const data = await response.json();
        this.images = data.images;
        this.initialized = true;
        console.log('✅ MemberImages: 成员头像数据加载成功');
      }
    } catch (error) {
      console.warn('⚠️ MemberImages: 成员头像数据加载失败，将使用默认头像', error);
    }
  },

  /**
   * 规范化成员名称 - 移除所有空格和特殊字符
   * @param {string} name - 原始名称
   * @returns {string} 规范化后的名称
   */
  normalizeName(name) {
    if (!name) return '';
    return name.replace(/\s+/g, '').trim();
  },

  /**
   * 获取成员头像 URL（智能匹配，支持有无空格）
   * @param {string} memberName - 成员姓名
   * @param {string} groupName - 团体名称（中文）
   * @returns {string|null} 头像URL，如果找不到返回null
   */
  getImageUrl(memberName, groupName) {
    if (!this.images || !memberName) {
      return null;
    }

    // 1. 先尝试精确匹配
    if (this.images[memberName]) {
      console.log(`✅ 精确匹配成员头像: ${memberName}`);
      return this.images[memberName].imageUrl;
    }

    // 2. 规范化查找（移除空格后匹配）
    const normalizedInput = this.normalizeName(memberName);

    for (const key in this.images) {
      const normalizedKey = this.normalizeName(key);
      if (normalizedKey === normalizedInput) {
        console.log(`✅ 规范化匹配成员头像: ${memberName} -> ${key}`);
        return this.images[key].imageUrl;
      }
    }

    console.warn(`⚠️ MemberImages: 未找到成员头像: ${memberName} (${groupName})`);
    return null;
  },

  /**
   * 获取默认头像（降级方案）
   * @param {string} name - 成员姓名
   * @param {string} group - 团体名称
   * @returns {object} 头像配置对象
   */
  getDefaultAvatar(name, group) {
    const colors = {
      '乃木坂46': ['#7C4DFF', '#B388FF'], // 紫色系
      '樱坂46': ['#FF6B6B', '#FFB6C1'],   // 粉色系
      '日向坂46': ['#4FC3F7', '#81D4FA']  // 蓝色系
    };

    const groupColors = colors[group] || ['#9E9E9E', '#BDBDBD'];

    return {
      type: 'gradient',
      colors: groupColors,
      initial: name.charAt(0)
    };
  }
};

// 自动初始化
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    window.MemberImages.init();
  });
} else {
  window.MemberImages.init();
}
