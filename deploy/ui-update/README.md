# 前端在线更新服务

更新目标固定为 https://github.com/feiwell/sub2api-astryx.git 的 main 分支。Python 服务监听 127.0.0.1:18084，通过现有后端的 /api/v1/auth/me 校验管理员 Bearer token。

## 安装

生产服务器需要 Python 3.11+、Git、Node.js 22.13+ 和 Corepack。当前安装器适用于 /data/sub2api-astryx-frontend 下的 nginx / Docker Compose 部署，执行前检查服务器上的 compose.yaml 和 web-nginx.conf。

    sudo python3 deploy/ui-update/install.py

安装器会保存配置备份、创建 astryx-updater 系统用户、安装 systemd 服务、接入宿主 nginx 路由，并将前端容器改为挂载整个 releases 目录。初次接入沿用当前发布目录。

## 使用

管理员打开 /admin/settings?tab=update，点击检查更新，然后点击更新界面。GET /api/ui-update/status 返回当前提交、main 最新提交和任务状态。POST /api/ui-update/apply 启动任务，重复请求会复用正在运行的任务。

服务拉取 main，执行 pnpm install --frozen-lockfile、pnpm build 和 Astryx doctor。构建完成后切换 current 符号链接，并检查实际 HTTP 页面及应用脚本。检查失败会恢复原链接，失败日志可在管理页查看。旧发布目录和哈希资源保留，已有浏览器标签页可继续加载资源。源码和运行状态写入 /var/lib/astryx-ui-update，发布文件写入 releases。

## 发行说明

发行记录随前端源码维护在 public/release-notes.json，按日期倒序保留最近 20 条。schema_version 为 1，每条包含 date（YYYY-MM-DD）、title（zh/en 文案）和 changes（zh/en 文案数组）。每次前端发布时将新增功能和修复追加到相应记录，与代码一起提交。文件会进入构建产物，可在已安装版本中读取。

检查更新时，服务按检查到的 main 提交 SHA 读取同一提交下的发行说明，通过 status 的 release_notes 字段返回对应 sha、state 和 releases。当前已安装版本优先读取本地记录，最新提交的成功结果按 SHA 缓存。文件缺失或暂时不可达时，页面展示相应提示，更新操作仍可使用。手动检查更新会重试未成功的说明请求。

## 运维

使用 systemctl status astryx-ui-update 和 journalctl -u astryx-ui-update 检查服务。可在 /etc/astryx-ui-update.conf 设置 UI_UPDATE_ORIGIN、UI_UPDATE_AUTH_URL 和 UI_UPDATE_PROBE，修改后重启服务。更新源固定在 server.py 中，升级服务程序时重新运行安装器。

服务重启会将中断的构建标记为失败，管理员可以重新发起。完整发布记录保存在 releases/*/ui-update.json。手工恢复时将 releases/current 原子切换到目标发布目录，随后检查页面与静态资源。
