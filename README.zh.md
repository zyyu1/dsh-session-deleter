# dsh-session-deleter

[English](README.md) | 中文

DeepSeek Harness Web 的**会话删除**插件：在侧栏每个会话行的「…」菜单和悬停按钮里直接删除会话。删除时先安全停止正在运行的 agent，再把整个会话日志目录移入可恢复的**回收站**；侧栏新增「回收站」面板，可恢复、永久删除或清空。

DSH 原生只有「归档」（把会话从侧栏隐藏），并不删除磁盘记录；本插件补上真正的删除，并且默认是**可撤销**的删除。

## 功能

- **行内删除**：会话行「…」菜单新增「删除会话」，悬停行尾也有删除按钮；运行中、已归档、已置顶的会话都可以删
- **安全停止**：删除前先取消该会话正在跑的工作，等 AgentHandle 释放、日志文件句柄关闭后再动磁盘，避免 Windows 上的文件占用失败
- **可恢复回收站**：会话日志整目录移到 `~/.dsh/session-trash/<会话id>-<时间戳>/`，写入 `meta.json`（标题、原目录、工作区、归档/置顶状态、大小、删除时间）
- **回收站面板**：侧栏新增「回收站」入口，列出被删会话；可恢复回原工作区（含原来的归档/置顶状态）、永久删除单个、清空全部
- **二次确认**：确认框里直接显示会话标题，并可选「永久删除（不进入回收站）」；所有危险按钮为红色
- **中英双语**：跟随客户端语言
- **不碰附件**：只删除会话日志目录，工作区文件、会话附件（`~/.dsh/attachments`）都保留

## 兼容性

针对 `@deepseek-ai/dsh` **0.2.1-rc.5**（桌面版 0.2.1-rc.5）开发，使用官方公开的客户端 slot 与 Connection 认证栅栏：

- 客户端 slot：`sidebar.workspaces.session.menu.item`、`sidebar.workspaces.session.row.action`、`shell.overlay`、`sidebar.panellist`、`main`
- Host 服务：`agents`、`sessionPersistence`、`workspaceRegistry`、`sessions`、`connection`
- 依赖官方内部形态：`AgentHandle.dispose`、`persistence.root` / `findLog()`、`WorkspaceEntity.attachSession/detachSession`。DSH 升级后若行为异常，先确认这些接口是否还在

参考思路来自 [jasonrale/dsh-archive-manager](https://github.com/jasonrale/dsh-archive-manager)（归档面板 + 彻底删除），但接口按 0.2.x 重写：原插件针对 0.1.0-rc.6，直接安装会因客户端模块表与 slot 名变化而加载失败。

## 安装

仓库：<https://github.com/zyyu1/dsh-session-deleter>

```sh
git clone https://github.com/zyyu1/dsh-session-deleter
```

本机安装位置（已装好）：

```
~/.dsh/plugins/dsh-session-deleter          # 插件本体
~/.dsh/profiles/desktop/node_modules/
  dsh-session-deleter -> 上面的目录           # 目录联接（junction）
~/.dsh/profiles/desktop/package.json        # "dsh-session-deleter": "link:..."
~/.dsh/profiles/desktop/cordis.patch.yml    # insert 行，inject 含 webServer
~/.dsh/profiles/desktop/pnpm-lock.yaml      # pnpm install 写入的 link 记录
```

升级时把 `lib/index.js`、`lib/client.js`、`package.json` 覆盖到
`~/.dsh/plugins/dsh-session-deleter/`，然后在页面按 **Ctrl+R** 刷新以加载新的客户端 bundle（宿主侧改动会热重组；客户端新增插件需要刷新一次页面）。

全新安装（另一个 profile / 另一台机器）：

1. 把本目录复制到 `~/.dsh/plugins/dsh-session-deleter`
2. 在 profile 的 `package.json` 增加 `"dsh-session-deleter": "link:C:/.../dsh-session-deleter"`
3. 在 profile 目录执行 `pnpm install`（可用 DSH 自带的 pnpm），生成 lock 与 `node_modules` 链接
4. 在 `cordis.patch.yml` 追加：

```yaml
- insert:
    - id: session-deleter
      name: dsh-session-deleter
      inject:
        - connection
        - webServer
        - agents
        - sessionPersistence
        - workspaceRegistry
        - sessions
```

5. 刷新页面；若宿主没有热加载，重启 DSH 桌面端

> 注意：插件必须声明 `webServer` 依赖。0.2.1 的 `connection.rpc.handle` 会把 channel 绑到 Connection 服务自己的 fiber（未注入 `webServer`）而必然抛错，因此本插件改为用 `ctx.webServer.register` 直接挂 `/session-deleter` 前缀路由，并复用 `ctx.connection.admit()` 做浏览器认证与 Host/Origin 校验。

## 使用

1. 侧栏会话行悬停 → 点垃圾桶按钮，或打开「…」菜单 → **删除会话**
2. 确认框里默认「移入回收站」；勾选「永久删除」则跳过回收站
3. 侧栏「回收站」面板：
   - **恢复**：把日志移回原目录、重新挂回原工作区，并恢复原来的归档/置顶状态
   - **永久删除**：删除单个回收站条目
   - **清空回收站**：删除全部条目

## 数据位置

```
~/.dsh/
  sessions/                      # 官方会话日志（插件从这里移走）
  session-trash/
    <sessionId>-<timestamp>/
      meta.json                  # 标题/原目录/工作区/归档/置顶/大小/删除时间
      session/                   # 原会话目录的完整内容
```

`session-trash` 与会话目录同级；如果自定义了 `DSH_HOME`，回收站也随之移动。清空回收站或永久删除后不可恢复。

## 已知限制

- 会话如果**仍在当前窗口打开**，删除会被拒绝（提示切到其他会话）。这是为了避免删掉正在被读取的会话
- 插件热重载前就已创建的 agent 没有捕获到 disposer，删除这类会话时只能先请求停止并等待；若 1.5 秒内没退出会拒绝删除，重启 `dsh` 后恢复正常
- 附件与投影缓存不会随会话删除；它们按会话 id 引用，不会被其他会话误用，只是不会立即释放磁盘
- 删除操作直接作用于 `~/.dsh/sessions`，请勿在删除过程中手动移动同一目录

## License

MIT
