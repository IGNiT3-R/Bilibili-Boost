# Bilibili-Boost

Bilibili-Boost 是一个用于提升 Bilibili 浏览与观看体验的轻量 Chrome 插件。

当前版本：`v1.2.0`

## 版本说明

- `v1.1.0`：上线 `合集增强`
- `v1.2.0`：在保留 `合集增强` 的基础上，新增 `标记看过`

详细变更请查看 [CHANGELOG.md](./CHANGELOG.md)。

## 当前版本能力

`v1.2.0` 已经实现两项核心能力：

- 标记看过
- 合集增强

## 功能概览

- 自动记录视频观看进度，并以 `已看 XX%` 或 `已看完` 的形式展示状态
- 在视频详情页的元信息区域显示当前视频状态，并提供 `标记已看完`、`清除记录` 操作
- 在视频缩略图右上角显示已看状态徽标，不遮挡主要画面
- 在 UP 主空间主页的视频卡片底部信息行右侧提供快捷标记按钮
- 提供独立的插件控制面板，可统一管理功能开关
- 在视频详情页右侧播放列表中提供 `展开标题` 和 `展开列表` 两个增强按钮
- 使用插件自己的本地持久化存储保存记录，不依赖 B 站原生观看历史

## 当前已实现

### 标记看过

- 自动记录观看进度
- 状态显示为 `已看 XX%` / `已看完`
- 视频页手动标记 `已看完`
- 视频页手动 `清除记录`
- 缩略图卡片状态徽标
- UP 主空间主页视频卡片快捷标记
- 控制面板中的当前视频快捷操作

### 合集增强

- 展开视频页右侧播放列表中的标题
- 拉高右侧列表区域，便于连续浏览
- 通过控制面板独立开关

## 适用场景

- Bilibili 视频详情页
- 常见视频缩略图卡片区域
- UP 主空间主页的视频网格列表

## 安装方法

1. 下载本插件的全部文件到本地文件夹
2. 打开 Chrome 浏览器，进入扩展程序管理页面 `chrome://extensions/`
3. 开启右上角的“开发者模式”
4. 点击“加载已解压的扩展程序”
5. 选择插件所在文件夹
6. 安装完成后，点击扩展图标即可打开 Bilibili-Boost 控制面板

## 使用说明

### 控制面板

点击浏览器工具栏中的扩展图标，可以打开 Bilibili-Boost 控制面板。

- `标记看过`：控制自动记录观看状态、视频页状态展示、缩略图徽标和空间页快捷标记
- `合集增强`：控制视频页右侧播放列表增强功能
- `当前视频`：可直接查看当前视频状态，并手动标记 `已看完` 或 `清除记录`

### 标记看过

1. 打开任意 Bilibili 视频页面并开始播放
2. 插件会自动记录观看进度
3. 当记录形成后，状态会以 `已看 XX%` 或 `已看完` 展示
4. 在视频详情页中，可以直接查看当前视频状态，并手动修正记录
5. 在缩略图卡片上，会显示较小的已看状态徽标
6. 在 UP 主空间主页的视频卡片底部信息行右侧，可以点击小方块快捷标记 `已看完`
7. 已勾选的小方块再次点击后，会清除该视频的已看记录

### 合集增强

1. 打开任意带有右侧播放列表的 Bilibili 视频页面
2. 当列表加载完成后，会在列表头部下方显示两个按钮
3. `展开标题`：展开右侧视频项标题，便于查看完整名称
4. `展开列表`：将右侧列表区域拉高，并显示纵向滚动条
5. 再次点击对应按钮，可以恢复原始状态

## 效果截图

### 标记看过

以下截图展示的是 `标记看过` 功能：

| UP 主个人空间页 | 历史记录页 | 视频播放页 |
|-------|-------|-------|
| 待补充截图 | 待补充截图 | 待补充截图 |

### 合集增强

以下截图展示的是 `合集增强` 功能：

| 原版 | 展开标题 | 展开列表 | 同时展开 |
|-------|-------|-------|-------|
|<img width="555" height="523" alt="image" src="https://github.com/user-attachments/assets/e8e1648a-8bd5-44c0-aff4-01ce9e8a4f59" />|<img width="547" height="532" alt="image" src="https://github.com/user-attachments/assets/4d8d492c-1dbf-4e08-bd3f-b0249bbf5e9f" />|<img width="536" height="908" alt="image" src="https://github.com/user-attachments/assets/293a9241-eb94-4624-826d-32be4f99b879" />|<img width="547" height="967" alt="image" src="https://github.com/user-attachments/assets/3e68b042-c725-4982-b367-43082dc3ab8d" />|

## 当前实现说明

`v1.2.0` 当前采用以下结构：

- `background.js`：负责设置项管理、已看记录存储和跨标签页消息广播
- `content.js`：负责页面功能注入、自动记录观看进度、视频页状态展示、缩略图徽标、空间页快捷标记和合集增强
- `popup.html / popup.js / popup.css`：负责插件控制面板
- `styles.css`：负责页面侧样式，包括按钮、状态标签、徽标和快捷标记样式

已看记录使用插件自己的本地持久化存储：

- 设置项使用 `chrome.storage.local`
- 已看记录使用 `IndexedDB`

数据存储位置如下：

- Windows
  `chrome.storage.local`：`%LOCALAPPDATA%/Google/Chrome/User Data/Default/Local Extension Settings/<扩展 ID>/`
  `IndexedDB`：`%LOCALAPPDATA%/Google/Chrome/User Data/Default/IndexedDB/chrome-extension_<扩展 ID>_0.indexeddb.leveldb/`
- macOS
  `chrome.storage.local`：`~/Library/Application Support/Google/Chrome/Default/Local Extension Settings/<扩展 ID>/`
  `IndexedDB`：`~/Library/Application Support/Google/Chrome/Default/IndexedDB/chrome-extension_<扩展 ID>_0.indexeddb.leveldb/`
- Linux
  `chrome.storage.local`：`~/.config/google-chrome/Default/Local Extension Settings/<扩展 ID>/`
  `IndexedDB`：`~/.config/google-chrome/Default/IndexedDB/chrome-extension_<扩展 ID>_0.indexeddb.leveldb/`

说明：
`<扩展 ID>` 可在 `chrome://extensions/` 打开开发者模式后查看。
如果你使用的不是默认浏览器资料目录，以上路径中的 `Default` 可能会变成 `Profile 1`、`Profile 2` 等名称。

这意味着观看记录不会依赖 B 站原生历史，也不会因为平台侧历史策略而自动清理较早记录。

## 技术说明

- Manifest V3
- 纯原生 JavaScript，无需构建
- 通过 Content Script 注入页面功能
- 通过 Service Worker 处理设置、记录存储和消息中转
- 使用本地持久化存储保存观看记录和功能开关
- 采用更保守的页面刷新与路由监听策略，尽量减少对 B 站原生页面的干扰

## 文件结构

```text
Bilibili-Boost/
├── background.js    # 后台服务脚本
├── CHANGELOG.md     # 更新日志
├── manifest.json    # 插件配置文件
├── content.js       # 页面核心逻辑
├── styles.css       # 页面样式
├── popup.html       # 控制面板结构
├── popup.js         # 控制面板逻辑
├── popup.css        # 控制面板样式
├── LICENSE          # MIT 许可证
└── README.md        # 项目说明
```

## 作者

**IgniteRan**

## 许可证

本项目采用 MIT License，详见 [LICENSE](./LICENSE)。

## Star History

[![Star History Chart](https://api.star-history.com/svg?repos=IGNiT3-R/Bilibili-Boost&type=date&legend=top-left)](https://www.star-history.com/#IGNiT3-R/Bilibili-Boost&type=date&legend=top-left)
