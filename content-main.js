/**
 * Bilibili-Boost - 内容脚本启动入口
 *
 * @author IgniteRan
 * @license MIT
 * Copyright (c) 2024 IgniteRan
 */

// 启动入口保持极薄：实际功能拆在 content.js / content-collection.js，便于后续继续模块化。
init().catch((error) => {
  console.error('[Bilibili-Boost] 内容脚本初始化失败', error);
});
