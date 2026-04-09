# qBittorrent TJUPT 详情直达

当 qBittorrent WebUI 中选中的种子 Tracker 包含 `tjupt.org` 时，自动在属性面板的 Tab 栏末尾追加两个快捷入口：

| Tab | 目标 |
|---|---|
| 🔎种子详情 | `https://tjupt.org/details.php?id={ID}` |
| ⌛️H&R考核 | `https://tjupt.org/hnr_details.php?sid={ID}` |

点击后在新标签页打开，不影响 qBittorrent 本身的操作。

## 截图

> 选中一个 tjupt.org 种子后，Tab 栏效果：
>
> `普通 | Tracker | 用户 | HTTP 源 | 内容 | 🔎种子详情 | ⌛️H&R考核`

## 安装

1. 安装 [Tampermonkey](https://www.tampermonkey.net/) 浏览器扩展（Chrome / Firefox / Edge 均支持）
2. 点击下方链接一键安装，或手动复制脚本内容新建：

   **[点击安装 qbittorrent-tjupt.user.js](https://github.com/tjupt/UserScript/raw/refs/heads/master/qbittorrent-tjupt/qbittorrent-tjupt.user.js)**

## 配置

脚本默认匹配以下地址：

```
http://localhost:8080/*
http://127.0.0.1:8080/*
```

如果你的 qBittorrent WebUI 使用其他地址或端口，在 Tampermonkey 的脚本编辑器里修改顶部的 `@match` 行，例如：

```js
// @match  http://192.168.1.100:8080/*
```

## 工作原理

1. **检测选中** — 调用 `window.torrentsTable.getCurrentTorrentID()` 获取当前选中种子的 Hash，DOM 属性 `data-row-id` 作为备选
2. **确认 Tracker** — 调用 `/api/v2/torrents/trackers` 检查是否含 `tjupt.org`
3. **解析 ID** — 调用 `/api/v2/torrents/properties` 从种子的 `comment` 字段提取 `?id=XXXXX`
4. **插入 Tab** — 在 `#propertiesTabs` 末尾追加两个 `<li>` 元素，结构与原有 Tab 一致

## 前提条件

种子的 `comment` 字段需包含详情页路径，脚本按以下优先级依次匹配：

| 优先级 | 格式示例 |
|---|---|
| 1（推荐） | `/details.php?id=550251` |
| 2 | `https://tjupt.org/details.php?id=550251` |
| 3 | `?id=550251` |
| 4 | `550251`（纯数字） |

通过 TJUPT 下载的 `.torrent` 文件通常已自动填写此字段。如果 Tab 没有出现，可在 qBittorrent 中选中种子 → 普通 面板 → 查看「注释」一栏确认。

## 兼容性

| 环境 | 状态 |
|---|---|
| qBittorrent 官方默认 WebUI | ✅ 支持 |
| VueTorrent | 未测试 |
| qBittorrent ≥ 4.x | ✅ 支持（需要 Web API v2） |

## License

MIT
