# sub2api-astryx

Sub2API 的独立 Web 控制台，使用 React、TypeScript 和 Astryx 构建。用户可以管理 API Key、查看用量和订单，管理员可以管理用户、分组、渠道和站点设置。中英文界面共用一个构建产物。

A standalone React + Astryx web console for a compatible Sub2API backend. The browser UI runs at `/` and uses the backend for authentication, account data and gateway traffic.

## 本地启动

准备一个可以从开发机访问的 Sub2API 后端。默认地址为 `http://localhost:8080`。使用 Node.js 22.13 或更新的 22.x，也可以使用 Node.js 24 或更高版本。仓库锁定了 pnpm 12.4.2。后端安装步骤见 [Sub2API 上游仓库](https://github.com/Wei-Shaw/sub2api)。

```sh
git clone https://github.com/feiwell/sub2api-astryx.git
cd sub2api-astryx

# 首次使用 pnpm 时安装仓库指定的版本
npm install --global pnpm@12.4.2
pnpm install --frozen-lockfile
pnpm dev
```

打开 `http://localhost:3100`。后端在其他地址时，运行 `cp .env.example .env.local`（PowerShell 可用 `Copy-Item .env.example .env.local`），将 `VITE_DEV_PROXY_TARGET` 改为后端地址，然后重启 `pnpm dev`。访问 `http://localhost:3100/api/v1/settings/public` 应能看到后端的公开设置 JSON。

| 命令 | 用途 |
| --- | --- |
| `pnpm typecheck` | 检查 TypeScript 类型 |
| `pnpm test` | 运行一次前端测试。开发时用 `pnpm test:watch` |
| `pnpm build` | 检查类型并生成 `dist/` |
| `pnpm preview` | 本地预览构建结果 |

### 前端配置

`VITE_DEV_PORT` 和 `VITE_DEV_PROXY_TARGET` 控制开发服务器。浏览器配置在构建时写入产物，修改后需重新运行 `pnpm build`。后端密钥、OAuth 客户端密钥和支付凭据应保存在后端。完整变量见 [.env.example](./.env.example)。

| 浏览器配置 | 默认行为 |
| --- | --- |
| `VITE_API_BASE_URL` | 使用同源的 `/api/v1`。该地址用于控制台业务 API，网关请求使用独立的 `/v1` 等路径 |
| `VITE_WS_BASE_URL` | 运维 WebSocket 跟随 API 地址。单独指定时只填 `host[:port]`，页面使用 HTTPS 时自动使用 WSS |
| `VITE_DEFAULT_SITE_NAME` | 后端尚未返回自定义站名时显示 `Sub2API` |
| `VITE_PREVIEW_BUILTIN_HOME` | 默认为 `false`，使用后端配置的首页。已有站点配置了旧的自定义首页时，在 `.env.local` 中写入 `VITE_PREVIEW_BUILTIN_HOME=true` 并重新构建，即可展示 Astryx 内置首页 |

## 使用 Docker 部署

在仓库根目录构建。镜像只打包 `dist/` 和 Nginx 配置，可以在部署时选择后端。

```sh
pnpm install --frozen-lockfile
pnpm build
docker build -t sub2api-astryx:local .
```

后端在 Docker 网络中时，使用该网络的名称和后端的服务名。下面假设现有网络叫 `sub2api-net`，后端服务叫 `backend`，容器内监听 `8080`。

```sh
docker run --rm --network sub2api-net -p 127.0.0.1:3100:8080 -e SUB2API_UPSTREAM=backend:8080 sub2api-astryx:local
```

若后端运行在宿主机，使用 Docker 的宿主机网关。Linux 上后端需监听容器能访问的宿主机接口。启动后打开 `http://localhost:3100`。

```sh
docker run --rm -p 127.0.0.1:3100:8080 --add-host=host.docker.internal:host-gateway -e SUB2API_UPSTREAM=host.docker.internal:8080 sub2api-astryx:local
```

`SUB2API_UPSTREAM` 接受内网 HTTP 后端的 `host:port`。对外提供 HTTPS 时，由入口终止 TLS，保留公开站点的 `Host`，并以 `-e SUB2API_PUBLIC_SCHEME=https` 启动前端容器。在后端和服务商控制台中使用同一个公开 HTTPS 源配置回调地址。若后端按来源 IP 限流，在入口和 Nginx 中配置受信代理的地址段，默认转发直连地址。

### 路由与回调

| 浏览器或客户端请求 | 处理方式 |
| --- | --- |
| `/`、`/dashboard`、`/admin/*`、`/setup` | 由 React 路由渲染，刷新时返回 `index.html` |
| `/auth/callback`、`/auth/oidc/callback`、`/auth/wechat/payment/callback`、`/payment/result`、`/oauth/mcp/authorize` | 浏览器返回页或授权确认页，进入 SPA |
| `/api/v1/*`、`/setup/status` 等 `/setup/*` 接口、`/health` | 原路径转发给后端 |
| `/api/v1/auth/oauth/google/callback` 等 OAuth 提供方回调、`/api/v1/payment/webhook/stripe` 等支付通知 | 发给后端，保留请求方法、查询参数、正文及签名头 |
| `/v1/*`、`/v1beta/*`、`/backend-api/codex/*`、`/antigravity/*` 和根路径别名（如 `/models`、`/responses`、`/chat/completions`、`/images/generations`） | 发给网关并保留后端状态码，流式响应实时转发 |
| `/api/v1/admin/ops/ws/qps`、`/v1/responses` 等 WebSocket 路径 | 转发 HTTP Upgrade 并保留 `Sec-WebSocket-Protocol` |
| `/licenses/`、`/licenses/*` | 提供构建内的许可文件并返回缺失文件的 404 |
| `/assets/*`、`/logo.svg` | 返回文件和对应 MIME 类型。缺失文件返回 404，带哈希的构建资源可以长期缓存 |

例如，OIDC 身份提供方把浏览器送往后端的 `/api/v1/auth/oauth/oidc/callback`。后端处理后，再将浏览器送往前端的 `/auth/oidc/callback`。支付服务商同样把签名通知发给 webhook，用户则回到 `/payment/result`。

发布包使用通用登录控件。启用 Google 登录前，请按照官方品牌指南配置登录按钮并核对品牌要求。[Sign in with Google Branding Guidelines](https://developers.google.com/identity/branding-guidelines)

### HTML 缓存与 CSP

示例用 Nginx njs 为每次返回的 HTML 生成独立的 128 位随机 nonce，把同一值写入 CSP 响应头和主题初始化脚本的 `nonce` 属性。HTML 使用 `Cache-Control: no-store`。请让 CDN 保留该策略，缓存带哈希的 `/assets/` 文件。反向代理的完整路径与策略见 [deploy/site.conf.template](./deploy/site.conf.template)。

示例 CSP 默认允许同源资源。启用第三方验证码、嵌入的支付 SDK 或外部自定义首页时，把实际使用的服务商域名加入对应的 `script-src`、`connect-src`、`frame-src` 等指令，保留脚本 nonce。若单独设置了 WebSocket 主机，也要将其加入 `connect-src`。

启用 Airwallex 支付时，`/payment/airwallex` 会按需从官方 CDN 加载 SDK。在 Nginx 模板的 `script-src` 中加入 `https://static.airwallex.com`，按所用支付环境配置 SDK 所需的网络和 iframe 来源，再重新构建镜像。顾客完成付款后返回本站的 `/payment/result`。[Airwallex 托管收银台集成指南](https://www.airwallex.com/docs/payments/online-payments/hosted-payment-page/guest-user-checkout)

## 许可证

本仓库发布源代码和 CI 配置，部署镜像由运营方按上文步骤构建。构建后可以打开站点的 `/licenses/` 阅读随包分发的许可文本，或直接访问 `/licenses/THIRD_PARTY_NOTICES.md` 和 `/licenses/bundled-dependencies.md`。发布修改后的构建时，请随包保留这些文件，并向接收者提供与所分发构建对应的完整源码和构建脚本，例如在站点链接到该版的源码归档或 Git 提交。[前端源码与版本](https://github.com/feiwell/sub2api-astryx) · [项目许可](./LICENSE) · [第三方许可说明](./THIRD_PARTY_NOTICES.md)
