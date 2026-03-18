// 菜单模块 (unified pill-based navigation)

// 同步所有group pill的激活状态（桌面端+移动端共用.group-pill）
function syncMenuActiveState(group) {
  document.querySelectorAll('.group-pill').forEach(item => {
    item.classList.remove('active');
    if (item.dataset.group === group) {
      item.classList.add('active');
    }
  });
}
