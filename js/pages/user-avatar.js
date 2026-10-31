/**
 * TATABOX — 头像上传与压缩（M-01 自 user.js 拆分）
 * ============================================================
 * 由 loadModule('user') 依赖链先于 user.js 加载；运行期依赖 showToast、supabase 等全局。
 */
'use strict';

function getAvatarUrl() {
  try {
    var local = localStorage.getItem('bioquest_avatar');
    if (local) return local;
  } catch (e) {}
  if (typeof getCurrentUser === 'function') {
    try {
      var user = getCurrentUser();
      if (user && user.avatar_url) return user.avatar_url;
    } catch (e) {}
  }
  return null;
}

/**
 * 用 Canvas 将图片压缩为 maxSize×maxSize 的 JPEG dataURL
 */
function _compressAvatarImage(dataUrl, maxSize, quality, callback) {
  var img = new Image();
  img.onload = function() {
    try {
      var canvas = document.createElement('canvas');
      canvas.width = maxSize;
      canvas.height = maxSize;
      var ctx = canvas.getContext('2d');
      // 居中裁剪为正方形（cover）
      var min = Math.min(img.width, img.height);
      var sx = (img.width - min) / 2;
      var sy = (img.height - min) / 2;
      ctx.drawImage(img, sx, sy, min, min, 0, 0, maxSize, maxSize);
      callback(canvas.toDataURL('image/jpeg', quality));
    } catch (e) {
      callback(null);
    }
  };
  img.onerror = function() { callback(null); };
  img.src = dataUrl;
}

function _dataUrlToBlob(dataUrl) {
  var parts = dataUrl.split(',');
  var mime = (parts[0].match(/:(.*?);/) || [])[1] || 'image/jpeg';
  var bin = atob(parts[1]);
  var arr = new Uint8Array(bin.length);
  for (var i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type: mime });
}

function _renderAvatarInto(avatarEl, url) {
  if (!avatarEl) return;
  var input = avatarEl.querySelector('input[type=file]');
  avatarEl.textContent = '';
  var imgEl = document.createElement('img');
  imgEl.src = url;
  imgEl.alt = '头像';
  avatarEl.appendChild(imgEl);
  if (input) avatarEl.appendChild(input);
}

/**
 * 绑定头像点击上传逻辑
 * 头像容器是 <label for="userAvatarInput">，原生点击即可打开文件选择框；
 * 这里只需阻止冒泡（避免触发父级 navigateTo）并处理 change 事件。
 */
function setupAvatarUpload() {
  var avatarBtn = document.getElementById('userAvatarBtn');
  var avatarInput = document.getElementById('userAvatarInput');
  if (!avatarBtn || !avatarInput) return;

  // 阻止冒泡到父级 .user-profile-compact 的 navigateTo('/dashboard')
  // <label for="userAvatarInput"> 原生会触发关联 input 的文件选择，无需手动 click()
  avatarBtn.addEventListener('click', function(e) {
    e.stopPropagation();
  });

  avatarInput.addEventListener('change', function(e) {
    var file = e.target.files && e.target.files[0];
    if (!file) return;

    var allowed = ['image/jpeg', 'image/png', 'image/webp'];
    if (allowed.indexOf(file.type) === -1) {
      showToast('仅支持 JPEG / PNG / WebP 格式');
      e.target.value = '';
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      showToast('图片大小不能超过 5MB');
      e.target.value = '';
      return;
    }

    avatarBtn.classList.add('user-profile-avatar--loading');

    var reader = new FileReader();
    reader.onload = function(ev) {
      _compressAvatarImage(ev.target.result, 200, 0.8, function(compressed) {
        avatarBtn.classList.remove('user-profile-avatar--loading');
        if (!compressed) {
          showToast('图片处理失败，请更换图片');
          e.target.value = '';
          return;
        }
        // 存到 localStorage
        try { localStorage.setItem('bioquest_avatar', compressed); } catch (storageErr) {
          showToast('本地存储失败：' + (storageErr.message || '空间不足'));
          e.target.value = '';
          return;
        }
        // 立即更新显示
        _renderAvatarInto(avatarBtn, compressed);

        // 已登录 Supabase 则尝试上传，失败静默降级
        if (typeof window.uploadAvatar === 'function'
            && typeof window.isLoggedIn === 'function' && window.isLoggedIn()) {
          var user = window.getCurrentUser ? window.getCurrentUser() : null;
          if (user && !user.isGuest) {
            try {
              var blob = _dataUrlToBlob(compressed);
              var blobFile = new File([blob], user.id + '.jpg', { type: 'image/jpeg' });
              window.uploadAvatar(blobFile).catch(function() {});
            } catch (uploadErr) { /* 静默 */ }
          }
        }
        showToast('头像已更新');
        e.target.value = '';
      });
    };
    reader.onerror = function() {
      avatarBtn.classList.remove('user-profile-avatar--loading');
      showToast('读取文件失败');
      e.target.value = '';
    };
    reader.readAsDataURL(file);
  });
}

window.getAvatarUrl = getAvatarUrl;

window.getAvatarUrl = getAvatarUrl;
window.setupAvatarUpload = setupAvatarUpload;

// 注册到全站唯一命名空间（window.BioQuest；旧全局别名保留）
(function () {
  var BQ = (typeof window !== 'undefined') ? (window.BioQuest = window.BioQuest || {}) : {};
  BQ.user = BQ.user || {};
  BQ.user.avatar = { getAvatarUrl: getAvatarUrl, setupAvatarUpload: setupAvatarUpload };
})();
