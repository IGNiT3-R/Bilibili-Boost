/**
 * Bilibili-Boost
 *
 * @author IgniteRan
 * @license MIT
 * @description Bilibili-Boost：增强 Bilibili 视频页面，支持展开标题和列表
 *
 * Copyright (c) 2024 IgniteRan
 */

// ========== 配置区域 - 可根据 B站 页面结构变化修改 ==========

// 播放列表容器选择器（右侧合集列表）
const PLAYLIST_CONTAINER_SELECTOR = '.video-sections-head, .video-pod__header';

// 视频标题元素选择器（单个视频标题）
const VIDEO_TITLE_SELECTOR = '.video-episode-card__info-title, .video-pod__body .video-pod__item .video-pod__item-title';

// 合集标题选择器（合集分组标题）
const EPISODE_TITLE_SELECTOR = '.video-sections-head__title';

// ========== 核心逻辑 ==========

let isExpanded = false; // 当前展开状态
let toggleButton = null; // 按钮元素引用
let isListExpanded = false; // 列表展开状态
let listToggleButton = null; // 列表按钮元素引用

// 初始化函数
function init() {
  let attempts = 0;
  const maxAttempts = 30;
  
  const checkPlaylist = setInterval(() => {
    attempts++;
    const playlistContainer = document.querySelector(PLAYLIST_CONTAINER_SELECTOR);
    
    // 如果找到播放列表且按钮未创建
    if (playlistContainer && !document.querySelector('.title-expander-btn')) {
      clearInterval(checkPlaylist);
      console.log('[Bilibili-Boost] 找到播放列表，创建按钮');
      createToggleButton(playlistContainer);
    } else if (attempts >= maxAttempts) {
      clearInterval(checkPlaylist);
      console.warn('[Bilibili-Boost] 未找到播放列表');
    }
  }, 500);
}

// 创建切换按钮
function createToggleButton(containerElement) {
  // 避免重复创建
  if (document.querySelector('.title-expander-btn')) {
    console.log('[Bilibili-Boost] 按钮已存在，跳过创建');
    return;
  }

  // 创建一个独立的容器来包裹按钮，居中显示
  const buttonWrapper = document.createElement('div');
  buttonWrapper.style.cssText = 'display: flex; flex-direction: row; justify-content: center; width: 100%; margin-top: 12px; padding: 0; gap: 12px;';
  
  toggleButton = document.createElement('div');
  toggleButton.className = 'title-expander-btn';
  toggleButton.textContent = '展开标题';
  toggleButton.addEventListener('click', toggleTitles);
  
  listToggleButton = document.createElement('div');
  listToggleButton.className = 'title-expander-btn';
  listToggleButton.textContent = '展开列表';
  listToggleButton.addEventListener('click', toggleList);
  
  buttonWrapper.appendChild(toggleButton);
  buttonWrapper.appendChild(listToggleButton);

  // 使用 setTimeout 延迟插入，确保 B站 的初始化完成
  setTimeout(() => {
    containerElement.appendChild(buttonWrapper);
    console.log('[Bilibili-Boost] 按钮已创建并插入');
  }, 1000);
}

// 切换标题展开/折叠状态
function toggleTitles() {
  // 查找视频列表项中的标题
  const videoItems = document.querySelectorAll('.video-pod__item');
  
  console.log(`[Bilibili-Boost] 找到 ${videoItems.length} 个视频项`);
  
  if (videoItems.length === 0) {
    alert('未找到视频列表，请刷新页面重试');
    return;
  }

  isExpanded = !isExpanded;

  videoItems.forEach(item => {
    // 查找每个视频项内的所有可能包含标题的元素
    const titleElements = item.querySelectorAll('[class*="title"], a');
    
    titleElements.forEach(titleElement => {
      if (isExpanded) {
        // 展开：移除所有截断样式
        titleElement.style.whiteSpace = 'normal';
        titleElement.style.overflow = 'visible';
        titleElement.style.textOverflow = 'clip';
        titleElement.style.webkitLineClamp = 'unset';
        titleElement.style.display = 'block';
        titleElement.style.height = 'auto';
        titleElement.style.maxHeight = 'none';
        titleElement.style.lineClamp = 'unset';
      } else {
        // 折叠：恢复截断样式
        titleElement.style.whiteSpace = '';
        titleElement.style.overflow = '';
        titleElement.style.textOverflow = '';
        titleElement.style.webkitLineClamp = '';
        titleElement.style.display = '';
        titleElement.style.height = '';
        titleElement.style.maxHeight = '';
        titleElement.style.lineClamp = '';
      }
    });
    
    // 添加/移除边界样式类，增强视觉区分
    if (isExpanded) {
      item.classList.add('title-expanded');
      item.style.height = 'auto';
      item.style.minHeight = 'auto';
    } else {
      item.classList.remove('title-expanded');
      item.style.height = '';
      item.style.minHeight = '';
    }
  });

  // 更新按钮文本
  toggleButton.textContent = isExpanded ? '折叠标题' : '展开标题';
  console.log(`[Bilibili-Boost] 已${isExpanded ? '展开' : '折叠'}标题`);
}

// 切换列表展开/折叠状态
function toggleList() {
  const listBody = document.querySelector('.video-pod__body');
  
  if (!listBody) {
    alert('未找到视频列表容器');
    return;
  }

  isListExpanded = !isListExpanded;

  if (isListExpanded) {
    listBody.style.maxHeight = '600px';
    listBody.style.overflowY = 'auto';
    listBody.style.overflowX = 'hidden';
  } else {
    listBody.style.maxHeight = '';
    listBody.style.overflowY = '';
    listBody.style.overflowX = '';
  }

  listToggleButton.textContent = isListExpanded ? '折叠列表' : '展开列表';
  console.log(`[Bilibili-Boost] 已${isListExpanded ? '展开' : '折叠'}列表`);
}

// 页面加载完成后初始化
init();
