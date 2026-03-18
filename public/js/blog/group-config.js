/**
 * 团体配置模块
 * 统一管理团体名称映射和配置
 */

window.GroupConfig = {
  // 团体信息配置
  groups: {
    'nogizaka': {
      key: 'nogizaka',
      name: '乃木坂46',
      apiName: '乃木坂46',  // API使用的名称
      color: '#742581',  // 官方紫色（乃木坂标准色）
      baseUrl: 'https://www.nogizaka46.com'
    },
    'sakurazaka': {
      key: 'sakurazaka',
      name: '樱坂46',
      apiName: '樱坂46',  // API使用的名称（简体）
      color: '#F19DB5',  // 官方粉色（樱坂标准色）
      baseUrl: 'https://sakurazaka46.com'
    },
    'hinatazaka': {
      key: 'hinatazaka',
      name: '日向坂46',
      apiName: '日向坂46',  // API使用的名称
      color: '#7BC7E8',  // 官方蓝色（日向坂标准色）
      baseUrl: 'https://www.hinatazaka46.com'
    }
  },
  
  /**
   * 根据key获取团体配置
   */
  getByKey(key) {
    return this.groups[key] || null;
  },
  
  /**
   * 根据名称获取团体配置
   */
  getByName(name) {
    if (!name) return null;
    
    // 标准化名称
    const normalized = this.normalizeName(name);
    
    for (const key in this.groups) {
      const group = this.groups[key];
      if (this.normalizeName(group.name) === normalized ||
          this.normalizeName(group.apiName) === normalized) {
        return group;
      }
    }
    
    return null;
  },
  
  /**
   * 标准化团体名称（处理繁简体）
   */
  normalizeName(name) {
    if (!name) return '';
    
    // 统一转为简体
    const map = {
      '櫻': '樱',
      '坂': '坂'
    };
    
    let result = name;
    for (const [traditional, simplified] of Object.entries(map)) {
      result = result.replace(new RegExp(traditional, 'g'), simplified);
    }
    
    return result.trim();
  },
  
  /**
   * 获取API使用的团体名称
   */
  getApiName(keyOrName) {
    const group = this.getByKey(keyOrName) || this.getByName(keyOrName);
    return group ? group.apiName : keyOrName;
  },
  
  /**
   * 获取显示用的团体名称
   */
  getDisplayName(keyOrName) {
    const group = this.getByKey(keyOrName) || this.getByName(keyOrName);
    return group ? group.name : keyOrName;
  },
  
  /**
   * 获取团体颜色
   */
  getColor(keyOrName) {
    const group = this.getByKey(keyOrName) || this.getByName(keyOrName);
    return group ? group.color : '#6b7280';
  },
  
  /**
   * 获取团体emoji
   */
  getEmoji(keyOrName) {
    const group = this.getByKey(keyOrName) || this.getByName(keyOrName);
    return group ? group.emoji : '📝';
  },
  
  /**
   * 获取所有团体列表
   */
  getAll() {
    return Object.values(this.groups);
  }
};
