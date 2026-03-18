/**
 * 社交分享模块
 * 处理所有分享相关功能
 */

// 检测是否为移动设备
function isMobileDevice() {
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
}

// 分享到各平台
function shareToQQ() {
  const url = window.location.href;
  const text = `${App.view.currentBlog.member}的博客：${App.view.currentBlog.title}`;
  
  if (isMobileDevice()) {
    // 移动端尝试唤起QQ APP
    const appUrl = `mqqapi://share/to_fri?file_type=news&src_type=web&version=1&title=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`;
    window.location.href = appUrl;
    
    // 如果APP未安装，3秒后跳转网页版
    setTimeout(() => {
      const webUrl = `https://connect.qq.com/widget/shareqq/index.html?url=${encodeURIComponent(url)}&title=${encodeURIComponent(text)}`;
      window.open(webUrl, '_blank');
    }, 3000);
    
    showToast('正在打开QQ...');
  } else {
    // PC端打开网页版
    const shareUrl = `https://connect.qq.com/widget/shareqq/index.html?url=${encodeURIComponent(url)}&title=${encodeURIComponent(text)}`;
    window.open(shareUrl, '_blank', 'width=600,height=400');
    showToast('已打开QQ分享');
  }
}

function shareToWeibo() {
  const url = window.location.href;
  const text = `${App.view.currentBlog.member}的博客：${App.view.currentBlog.title}`;
  
  if (isMobileDevice()) {
    // 移动端尝试唤起微博APP
    const appUrl = `sinaweibo://qrcode?url=${encodeURIComponent(url)}&title=${encodeURIComponent(text)}`;
    window.location.href = appUrl;
    
    // 如果APP未安装，3秒后跳转网页版
    setTimeout(() => {
      const webUrl = `https://service.weibo.com/share/share.php?url=${encodeURIComponent(url)}&title=${encodeURIComponent(text)}`;
      window.open(webUrl, '_blank');
    }, 3000);
    
    showToast('正在打开微博...');
  } else {
    // PC端打开网页版
    const shareUrl = `https://service.weibo.com/share/share.php?url=${encodeURIComponent(url)}&title=${encodeURIComponent(text)}`;
    window.open(shareUrl, '_blank', 'width=600,height=400');
    showToast('已打开微博分享');
  }
}

function shareToBilibili() {
  // B站动态分享
  const url = window.location.href;
  const text = `${App.view.currentBlog.member}的博客：${App.view.currentBlog.title} ${url}`;
  // 复制到剪贴板
  copyToClipboard(text);
  window.open('https://t.bilibili.com/', '_blank');
  showToast('链接已复制，请在B站动态中粘贴分享');
}

function shareToTwitter() {
  const url = window.location.href;
  const text = `${App.view.currentBlog.member} - ${App.view.currentBlog.title}`;
  const shareUrl = `https://twitter.com/intent/tweet?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`;
  window.open(shareUrl, '_blank', 'width=600,height=400');
  showToast('已打开Twitter分享');
}

function shareToWhatsApp() {
  const url = window.location.href;
  const text = `${App.view.currentBlog.member}的博客：${App.view.currentBlog.title}`;
  
  if (isMobileDevice()) {
    // 移动端直接使用whatsapp://协议唤起APP
    const appUrl = `whatsapp://send?text=${encodeURIComponent(text + ' ' + url)}`;
    window.location.href = appUrl;
    showToast('正在打开WhatsApp...');
  } else {
    // PC端使用Web版
    const shareUrl = `https://wa.me/?text=${encodeURIComponent(text + ' ' + url)}`;
    window.open(shareUrl, '_blank', 'width=600,height=400');
    showToast('已打开WhatsApp分享');
  }
}

function shareToFacebook() {
  const url = window.location.href;
  
  if (isMobileDevice()) {
    // 移动端尝试唤起Facebook APP
    const appUrl = `fb://facewebmodal/f?href=${encodeURIComponent('https://www.facebook.com/sharer/sharer.php?u=' + url)}`;
    window.location.href = appUrl;
    
    // 如果APP未安装，3秒后跳转网页版
    setTimeout(() => {
      const webUrl = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`;
      window.open(webUrl, '_blank');
    }, 3000);
    
    showToast('正在打开Facebook...');
  } else {
    // PC端打开网页版
    const shareUrl = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`;
    window.open(shareUrl, '_blank', 'width=600,height=400');
    showToast('已打开Facebook分享');
  }
}

function shareToTelegram() {
  const url = window.location.href;
  const text = `${App.view.currentBlog.member} - ${App.view.currentBlog.title}`;
  const shareUrl = `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`;
  window.open(shareUrl, '_blank', 'width=600,height=400');
  showToast('已打开Telegram分享');
}

function copyLink() {
  const url = window.location.href;
  copyToClipboard(url);
  showToast('链接已复制到剪贴板');
}

// 辅助函数：复制到剪贴板
function copyToClipboard(text) {
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand('copy');
  document.body.removeChild(textarea);
}

// 导出给全局使用
window.shareToQQ = shareToQQ;
window.shareToWeibo = shareToWeibo;
window.shareToBilibili = shareToBilibili;
window.shareToTwitter = shareToTwitter;
window.shareToWhatsApp = shareToWhatsApp;
window.shareToFacebook = shareToFacebook;
window.shareToTelegram = shareToTelegram;
window.copyLink = copyLink;
