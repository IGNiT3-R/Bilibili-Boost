# Bilibili-Boost

Bilibili-Boost 是一个用于提升 Bilibili 浏览与观看体验的轻量 Chrome 插件。

当前版本提供视频页面右侧播放列表增强功能，让分 P 或合集内容浏览起来更直接、更清晰。


## 功能特性

- ✅ 纯原生 JavaScript，无需构建和依赖安装
- ✅ 以内容脚本为主，便于快速迭代和调试
- ✅ 优先保证可用性与维护成本可控
- ✅ 在播放列表区域添加“展开标题”/“折叠标题”按钮
- ✅ 添加“展开列表”/“折叠列表”按钮，一键拉长右侧视频列表并启用滚动
- ✅ 一键查看被省略号截断的标题
- ✅ 按钮样式尽量贴近 B 站原生界面

## 开发计划

- [x] 视频页右侧播放列表增强
- [ ] 下一个增强功能开发中
- [ ] 更多功能将在后续版本逐步加入

## 安装方法

1. 下载本插件的所有文件到本地文件夹
2. 打开 Chrome 浏览器，进入扩展程序管理页面（`chrome://extensions/`）
3. 开启右上角的“开发者模式”
4. 点击“加载已解压的扩展程序”
5. 选择插件文件夹
6. 安装完成后，访问 Bilibili 视频页面即可使用

## 使用说明

1. 打开任意 Bilibili 视频页面
2. 当右侧播放列表加载完成后，会在列表头部下方显示两个按钮：
   - **展开标题**：展开右侧视频项标题，便于查看完整名称
   - **展开列表**：将右侧列表区域拉高到更适合浏览的高度，并显示纵向滚动条
3. 点击对应按钮即可切换展开/折叠状态

## 效果截图

| 原版 | 展开标题 | 展开列表 | 同时展开 |
|-------|-------|-------|-------|
|<img width="555" height="523" alt="image" src="https://github.com/user-attachments/assets/e8e1648a-8bd5-44c0-aff4-01ce9e8a4f59" />|<img width="547" height="532" alt="image" src="https://github.com/user-attachments/assets/4d8d492c-1dbf-4e08-bd3f-b0249bbf5e9f" />|<img width="536" height="908" alt="image" src="https://github.com/user-attachments/assets/293a9241-eb94-4624-826d-32be4f99b879" />|<img width="547" height="967" alt="image" src="https://github.com/user-attachments/assets/3e68b042-c725-4982-b367-43082dc3ab8d" />|

## 当前实现说明

当前版本主要依赖页面加载后的轮询检测，在找到右侧播放列表头部后插入按钮。

- 标题按钮插入位置使用：`.video-sections-head, .video-pod__header`
- 标题样式目标选择器定义为：`.video-episode-card__info-title, .video-pod__body .video-pod__item .video-pod__item-title`
- 列表展开目标容器为：`.video-pod__body`

如果 B 站页面结构发生变化导致插件失效，可以优先检查并修改 [content.js](./content.js) 开头的选择器常量。

```javascript
// 播放列表容器选择器（右侧合集列表）
const PLAYLIST_CONTAINER_SELECTOR = '.video-sections-head, .video-pod__header';

// 视频标题元素选择器（单个视频标题）
const VIDEO_TITLE_SELECTOR =
  '.video-episode-card__info-title, .video-pod__body .video-pod__item .video-pod__item-title';

// 合集标题选择器（合集分组标题）
const EPISODE_TITLE_SELECTOR = '.video-sections-head__title';
```

使用浏览器开发者工具（F12）检查页面元素，找到对应的 CSS 选择器并替换即可。

## 技术说明

- Manifest V3 标准
- 纯原生 JavaScript，无依赖
- 当前通过定时轮询等待页面节点出现后再注入按钮
- 使用内容脚本直接操作页面 DOM 和行内样式
- CSS 样式模仿 B 站按钮风格
- 当前功能集中在单个 content script 中，后续可按功能拆分

## 文件结构

```text
Bilibili-Boost/
├── manifest.json    # 插件配置文件
├── content.js       # 核心逻辑脚本
├── styles.css       # 按钮样式
├── LICENSE          # MIT 许可证
└── README.md        # 使用说明
```

## 作者

**IgniteRan**

## 许可证

本项目采用 MIT License，详见 [LICENSE](./LICENSE)。

## Star History

[![Star History Chart](https://api.star-history.com/svg?repos=IGNiT3-R/Bilibili-Boost&type=date&legend=top-left)](https://www.star-history.com/#IGNiT3-R/Bilibili-Boost&type=date&legend=top-left)
