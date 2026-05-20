/**
 * Bilibili-Boost - 合集增强
 *
 * @author IgniteRan
 * @license MIT
 * Copyright (c) 2024 IgniteRan
 */

function getCollectionControls() {
  return document.querySelector(`.${COLLECTION_CONTROLS_CLASS}`);
}

function clearCollectionStyles() {
  const videoItems = document.querySelectorAll(VIDEO_ITEM_SELECTOR);

  videoItems.forEach((item) => {
    const titleElements = item.querySelectorAll('[class*="title"], a');

    titleElements.forEach((titleElement) => {
      titleElement.style.whiteSpace = '';
      titleElement.style.overflow = '';
      titleElement.style.textOverflow = '';
      titleElement.style.webkitLineClamp = '';
      titleElement.style.display = '';
      titleElement.style.height = '';
      titleElement.style.maxHeight = '';
      titleElement.style.lineClamp = '';
    });

    item.classList.remove(COLLECTION_TITLE_EXPANDED_CLASS);
    item.style.height = '';
    item.style.minHeight = '';
  });

  const listBody = document.querySelector(VIDEO_LIST_BODY_SELECTOR);

  if (listBody) {
    listBody.classList.remove(COLLECTION_LIST_EXPANDED_CLASS);
    listBody.style.maxHeight = '';
    listBody.style.overflowY = '';
    listBody.style.overflowX = '';
  }
}

function removeCollectionControls() {
  const controls = getCollectionControls();

  if (controls) {
    controls.remove();
  }
}

function resetCollectionBoost() {
  clearCollectionStyles();
  removeCollectionControls();
  state.collection.isExpanded = false;
  state.collection.isListExpanded = false;
}

function applyCollectionState() {
  if (!state.settings.collectionBoostEnabled || !isVideoPage()) {
    return;
  }

  const controls = getCollectionControls();
  const titleButton = controls && controls.querySelector('[data-role="toggle-title"]');
  const listButton = controls && controls.querySelector('[data-role="toggle-list"]');
  const videoItems = document.querySelectorAll(VIDEO_ITEM_SELECTOR);

  videoItems.forEach((item) => {
    item.classList.toggle(COLLECTION_TITLE_EXPANDED_CLASS, state.collection.isExpanded);
  });

  const listBody = document.querySelector(VIDEO_LIST_BODY_SELECTOR);

  if (listBody) {
    listBody.classList.toggle(COLLECTION_LIST_EXPANDED_CLASS, state.collection.isListExpanded);
  }

  if (titleButton) {
    titleButton.textContent = state.collection.isExpanded ? '折叠标题' : '展开标题';
  }

  if (listButton) {
    listButton.textContent = state.collection.isListExpanded ? '折叠列表' : '展开列表';
  }
}

function ensureCollectionControls() {
  if (!state.settings.collectionBoostEnabled || !isVideoPage()) {
    resetCollectionBoost();
    return;
  }

  const header = document.querySelector(PLAYLIST_HEADER_SELECTOR);

  if (!header) {
    removeCollectionControls();
    return;
  }

  let controls = header.querySelector(`.${COLLECTION_CONTROLS_CLASS}`);

  if (!controls) {
    controls = document.createElement('div');
    controls.className = COLLECTION_CONTROLS_CLASS;

    const titleButton = document.createElement('div');
    titleButton.className = 'title-expander-btn';
    titleButton.dataset.role = 'toggle-title';
    titleButton.setAttribute('role', 'button');
    titleButton.tabIndex = 0;
    titleButton.addEventListener('click', () => {
      state.collection.isExpanded = !state.collection.isExpanded;
      applyCollectionState();
    });
    titleButton.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        titleButton.click();
      }
    });

    const listButton = document.createElement('div');
    listButton.className = 'title-expander-btn';
    listButton.dataset.role = 'toggle-list';
    listButton.setAttribute('role', 'button');
    listButton.tabIndex = 0;
    listButton.addEventListener('click', () => {
      state.collection.isListExpanded = !state.collection.isListExpanded;
      applyCollectionState();
    });
    listButton.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        listButton.click();
      }
    });

    controls.appendChild(titleButton);
    controls.appendChild(listButton);
    header.appendChild(controls);
  }

  applyCollectionState();
}
