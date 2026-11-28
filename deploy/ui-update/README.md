# 前端在线更新服务

更新目标固定为 https://github.com/feiwell/sub2api-astryx.git 的 main 分支。Python 服务监听 127.0.0.1:18084，通过现有后端的 /api/v1/auth/me 校验管理员 Bearer token。

## 安装

生产服务器需要 Python 3.11+、Git、Node.js 22.13+ 和 Corepack。当前安装器适用于 /data/sub2api-astryx-frontend 下的 nginx / Docker Compose 部署，执行前检查服务器上的 compose.yaml 和 web-nginx.conf。

    sudo python3 deploy/ui-update/install.py

安装器会保存配置备份、创建 astryx-updater 系统用户、安装 systemd 服务、接入宿主 nginx 路由，并将前端容器改为挂载整个 releases 目录。初次接入沿用当前发布目录。

## 使用

管理员打开 /admin/settings?tab=update，点击检查更新，然后点击更新界面。GET /api/ui-update/status 返回当前提交、main 最新提交和任务状态。POST /api/ui-update/apply 启动任务，重复请求会复用正在运行的任务。

服务拉取 main，执行 pnpm install --frozen-lockfile、pnpm build 和 Astryx doctor。构建完成后切换 current 符号链接，并检查实际 HTTP 页面及应用脚本。检查失败会恢复原链接，失败日志可在管理页查看。旧发布目录和哈希资源保留，已有浏览器标签页可继续加载资源。源码和运行状态写入 /var/lib/astryx-ui-update，发布文件写入 releases。

## 运维

使用 systemctl status astryx-ui-update 和 journalctl -u astryx-ui-update 检查服务。可在 /etc/astryx-ui-update.conf 设置 UI_UPDATE_ORIGIN、UI_UPDATE_AUTH_URL 和 UI_UPDATE_PROBE，修改后重启服务。更新源固定在 server.py 中，升级服务程序时重新运行安装器。

服务重启会将中断的构建标记为失败，管理员可以重新发起。完整发布记录保存在 releases/*/ui-update.json。手工恢复时将 releases/current 原子切换到目标发布目录，随后检查页面与静态资源。
