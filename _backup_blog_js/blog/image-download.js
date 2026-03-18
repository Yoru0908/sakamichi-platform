/**
 * 图片下载模块
 * 处理图片批量下载功能
 */

// 下载图片为Blob（通过后端代理）
async function downloadImageAsBlob(url) {
  console.log(`📥 尝试下载图片: ${url}`);

  // 方案1: 通过后端代理下载（推荐）
  try {
    const apiBase = App.config.apiBaseUrl || window.API_BASE_URL || window.API_BASE;
    const proxyUrl = `${apiBase}/api/proxy/image?url=${encodeURIComponent(url)}`;
    console.log(`🔄 使用代理URL: ${proxyUrl}`);

    const response = await fetch(proxyUrl);
    if (!response.ok) {
      console.error(`❌ 代理下载失败: ${response.status}`);
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const blob = await response.blob();
    console.log(`✅ 通过代理成功下载: ${blob.size} bytes, type: ${blob.type}`);
    return blob;
  } catch (proxyError) {
    console.error('❌ 代理下载失败:', proxyError);

    // 方案2: 尝试直接下载（可能遇到CORS）
    try {
      console.log('🔄 尝试直接下载...');
      const response = await fetch(url, {
        mode: 'cors',
        credentials: 'omit'
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const blob = await response.blob();
      console.log(`✅ 直接下载成功: ${blob.size} bytes`);
      return blob;
    } catch (directError) {
      console.error('❌ 直接下载也失败:', directError);

      // 方案3: 使用canvas（仅适用于同源图片）
      try {
        console.log('🔄 尝试使用canvas...');
        return await downloadImageViaCanvas(url);
      } catch (canvasError) {
        console.error('❌ Canvas下载失败:', canvasError);
        throw new Error('无法下载图片: ' + url);
      }
    }
  }
}

// 通过Canvas下载图片（备用方案）
async function downloadImageViaCanvas(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';

    img.onload = function () {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;

        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0);

        canvas.toBlob((blob) => {
          if (blob) {
            console.log(`✅ Canvas转换成功: ${blob.size} bytes`);
            resolve(blob);
          } else {
            reject(new Error('Canvas toBlob failed'));
          }
        }, 'image/jpeg', 0.95);
      } catch (error) {
        reject(error);
      }
    };

    img.onerror = () => reject(new Error('Image load failed'));
    img.src = url;
  });
}

// 下载全部图片为ZIP
async function downloadAllImages() {
  console.log('\n' + '='.repeat(60));
  console.log('🔽 下载按钮被点击');
  console.log('='.repeat(60));

  if (!App.view.currentBlog) {
    alert('博客数据未加载');
    return;
  }

  console.log('📋 当前博客信息:', {
    title: App.view.currentBlog.title,
    member: App.view.currentBlog.member,
    content_length: App.view.currentBlog.content?.length
  });

  // 检查是否移动设备
  if (typeof isMobileDevice === 'function' && isMobileDevice()) {
    console.log('📱 检测到移动设备，尝试使用移动端下载方案');
    const images = extractImagesFromContent();
    const result = await mobileDownloadImages(images, App.view.currentBlog);
    console.log('📱 移动端下载结果:', result);

    if (result) {
      return; // 移动端已处理
    }
    // 如果移动端处理失败，继续使用PC端方案
  }

  // PC端ZIP下载
  showProgressDialog('准备下载图片...');

  try {
    // 提取图片URL
    const images = extractImagesFromContent();
    console.log(`🖼️ 找到 ${images.length} 张图片`);

    if (images.length === 0) {
      alert('没有找到可下载的图片');
      hideProgressDialog();
      return;
    }

    // 创建ZIP
    const zip = new JSZip();
    let successCount = 0;
    let failCount = 0;

    // 下载所有图片
    for (let i = 0; i < images.length; i++) {
      const image = images[i];
      const fileName = `${String(i + 1).padStart(2, '0')}.jpg`;

      updateProgressDialog(
        `下载第 ${i + 1}/${images.length} 张图片...`,
        ((i + 1) / images.length) * 100
      );

      try {
        const blob = await downloadImageAsBlob(image.url);
        zip.file(fileName, blob);
        successCount++;
        console.log(`✅ ${fileName} 下载成功`);
      } catch (error) {
        failCount++;
        console.error(`❌ ${fileName} 下载失败:`, error);
      }
    }

    console.log(`\n📊 下载统计: 成功 ${successCount}/${images.length}, 失败 ${failCount}`);

    if (successCount === 0) {
      alert('所有图片下载失败，请检查网络或稍后重试');
      hideProgressDialog();
      return;
    }

    // 生成ZIP文件
    updateProgressDialog('正在打包...', 100);
    const blob = await zip.generateAsync({
      type: 'blob',
      compression: 'DEFLATE',
      compressionOptions: { level: 6 }
    });

    // 下载ZIP
    const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const fileName = `${App.view.currentBlog.member}_${date}_${App.view.currentBlog.title.slice(0, 20)}.zip`;
    saveAs(blob, fileName);

    hideProgressDialog();
    showToast(`成功下载 ${successCount} 张图片！`);

  } catch (error) {
    console.error('下载过程出错:', error);
    alert('下载失败: ' + error.message);
    hideProgressDialog();
  }
}

// 从内容中提取图片URL（优先使用原始images数组）
function extractImagesFromContent() {
  const images = [];

  // 🔧 修复：优先使用博客数据中的原始 images 数组（未经 Cloudinary 压缩）
  if (App.view.currentBlog.images && Array.isArray(App.view.currentBlog.images) && App.view.currentBlog.images.length > 0) {
    console.log('📋 使用博客原始 images 数组（高清原图）');
    App.view.currentBlog.images.forEach(url => {
      images.push({
        url: url,
        type: 'original'
      });
    });
    console.log('📋 提取到的原始图片列表:', images);
    return images;
  }

  // 备用方案：从内容中正则提取（可能包含 Cloudinary URL）
  console.log('⚠️ 未找到原始 images 数组，从内容中提取（可能是压缩后的URL）');
  const content = App.view.currentBlog.translated_content || App.view.currentBlog.content || '';

  // 使用正则表达式提取所有图片URL
  const imgRegex = /!\[.*?\]\((.*?)\)/g;
  const imgTags = /<img[^>]+src="([^"]+)"/g;

  let match;

  // Markdown格式图片
  while ((match = imgRegex.exec(content)) !== null) {
    // 跳过 Cloudinary URL，尝试解码原始 URL
    let url = match[1];
    if (url.includes('res.cloudinary.com') && url.includes('%')) {
      // 解码 Cloudinary URL 中的原始 URL
      const encodedPart = url.split('/').pop();
      try {
        url = decodeURIComponent(encodedPart);
        console.log('🔓 解码 Cloudinary URL:', url);
      } catch (e) {
        console.log('❌ 无法解码 URL:', url);
      }
    }
    images.push({
      url: url,
      type: 'markdown'
    });
  }

  // HTML img标签
  while ((match = imgTags.exec(content)) !== null) {
    let url = match[1];
    // 跳过 Cloudinary URL，尝试解码原始 URL
    if (url.includes('res.cloudinary.com') && url.includes('%')) {
      const encodedPart = url.split('/').pop();
      try {
        url = decodeURIComponent(encodedPart);
      } catch (e) { }
    }
    if (!images.some(img => img.url === url)) {
      images.push({
        url: url,
        type: 'html'
      });
    }
  }

  console.log('📋 提取到的图片列表:', images);
  return images;
}

// 显示下载进度对话框
function showProgressDialog(message) {
  hideProgressDialog(); // 先移除旧的

  const dialog = document.createElement('div');
  dialog.className = 'download-progress';
  dialog.innerHTML = `
    <div class="progress-content">
      <div class="progress-message">${message}</div>
      <div class="progress-bar">
        <div class="progress-fill" style="width: 0%"></div>
      </div>
      <div class="progress-percent">0%</div>
    </div>
  `;
  document.body.appendChild(dialog);
}

// 更新进度
function updateProgressDialog(message, percent) {
  const dialog = document.querySelector('.download-progress');
  if (!dialog) return;

  dialog.querySelector('.progress-message').textContent = message;
  dialog.querySelector('.progress-fill').style.width = `${percent}%`;
  dialog.querySelector('.progress-percent').textContent = `${Math.round(percent)}%`;
}

// 隐藏进度对话框
function hideProgressDialog() {
  const dialog = document.querySelector('.download-progress');
  if (dialog) {
    dialog.remove();
  }
}

// 导出给全局使用
window.downloadImageAsBlob = downloadImageAsBlob;
window.downloadAllImages = downloadAllImages;
window.extractImagesFromContent = extractImagesFromContent;
window.showProgressDialog = showProgressDialog;
window.updateProgressDialog = updateProgressDialog;
window.hideProgressDialog = hideProgressDialog;
