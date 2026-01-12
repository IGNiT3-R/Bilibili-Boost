# Bilibili合集增强

一个用于 Bilibili 视频合集页面的 Chrome 插件，可以一键展开/折叠播放列表中所有视频的完整标题，并支持展开整个视频列表。

感谢claude-sonnet-4-5-20250929-thinking助我AI Coding

## 功能特性

- ✅ 在合集播放列表添加"展开标题"/"折叠标题"切换按钮
- ✅ 添加"展开列表"/"折叠列表"按钮，一键展开所有视频（带滚动条）
- ✅ 一键查看所有视频的完整标题，解决标题被省略的问题
- ✅ 按钮样式融入 B站 原生界面
- ✅ 支持 SPA 页面动态加载
- ✅ 代码简洁，易于维护和修改

## 安装方法

1. 下载本插件的所有文件到本地文件夹
2. 打开 Chrome 浏览器，进入扩展程序管理页面（`chrome://extensions/`）
3. 开启右上角的"开发者模式"
4. 点击"加载已解压的扩展程序"
5. 选择插件文件夹
6. 安装完成！访问 Bilibili 视频合集页面即可使用

## 使用说明

1. 打开任意 Bilibili 视频合集页面
2. 在播放列表标题区域会出现两个按钮：
   - **展开标题**：展开所有视频的完整标题，解决标题被截断的问题
   - **展开列表**：展开视频列表（带滚动条），加长原来短小的合集列表
3. 点击对应按钮即可切换展开/折叠状态

## 效果截图
| 原版 | 展开标题 | 展开列表 | 同时展开 |
|-------|-------|-------|-------|
|<img width="555" height="523" alt="image" src="https://github.com/user-attachments/assets/e8e1648a-8bd5-44c0-aff4-01ce9e8a4f59" />|<img width="547" height="532" alt="image" src="https://github.com/user-attachments/assets/4d8d492c-1dbf-4e08-bd3f-b0249bbf5e9f" />|<img width="536" height="908" alt="image" src="https://github.com/user-attachments/assets/293a9241-eb94-4624-826d-32be4f99b879" />|<img width="547" height="967" alt="image" src="https://github.com/user-attachments/assets/3e68b042-c725-4982-b367-43082dc3ab8d" />|

## 自定义配置

如果 B站 页面结构发生变化导致插件失效，可以修改 `content.js` 文件开头的配置区域：

```javascript
// 播放列表容器选择器
const PLAYLIST_CONTAINER_SELECTOR = '.video-sections-content-list, .multi-page-v1, .list-box';

// 播放列表标题区域选择器
const PLAYLIST_HEADER_SELECTOR = '.video-sections-head, .multi-page-v1 .head-con, .list-box .head';

// 视频标题元素选择器
const VIDEO_TITLE_SELECTOR = '.video-episode-card__info-title, .page-link .part, .list-box li a';
```

使用浏览器开发者工具（F12）检查页面元素，找到对应的 CSS 选择器并替换即可。

## 技术说明

- Manifest V3 标准
- 纯原生 JavaScript，无依赖
- 使用 MutationObserver 监听页面动态变化
- CSS 样式模仿 B站 原生按钮风格

## 文件结构

```
bilibili-title-expander/
├── manifest.json    # 插件配置文件
├── content.js       # 核心逻辑脚本
├── styles.css       # 按钮样式
└── README.md        # 使用说明
```

## 作者

**IgniteRan**

## 许可证

MIT License

## Star History

[![Star History Chart](https://api.star-history.com/svg?repos=IGNiT3-R/Bilibili-Collection-Boost&type=date&legend=top-left)](https://www.star-history.com/#IGNiT3-R/Bilibili-Collection-Boost&type=date&legend=top-left)
