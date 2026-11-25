# CI 发布包

`.github/workflows/ci.yml` 保留原有安装、类型检查、测试、构建及部署示例 smoke 流程。只有这些 CI 检查成功后，才会将本次构建得到的同一份 `dist/` 打成可重现压缩包并上传为 GitHub Actions artifact；不会另行构建，也不会发布 GitHub Release。

## 产物

正式 `main` 分支 push 成功（以及在 `main` 上手动 `workflow_dispatch` 成功）时，artifact 名为 `astryx-main-<完整40位 git SHA>`，内含：

- `dist.tar.gz`：网站静态文件归档，使用 `tar -C dist .`，解开后 `index.html` 位于归档根目录。
- `dist.tar.gz.sha256`：标准 `sha256sum` 校验行。
- `manifest.json`：`source_sha` 等于本次 `github.sha`，`channel` 为 `main`。

本仓库 PR 的成功检查也会提供预览 artifact，名称为 `astryx-pr-<PR号>-<完整 SHA>`，manifest 的 channel 为 `pr-merge`。它是 GitHub PR merge ref 的预览构建，不是正式 main 包；不为其他仓库的 fork PR 上传包。其他分支的手动 dispatch 仍可运行既有 CI，但不会上传产物。

压缩包以固定排序、时间戳及归属信息打 tar，并用 `gzip -n` 去除 gzip 时间戳和文件名，因此相同 `dist/` 内容可重现相同归档。下载后可在文件所在目录运行 `sha256sum -c dist.tar.gz.sha256` 验证；解包可用 `mkdir output && tar -xzf dist.tar.gz -C output`。

## 重要说明

Actions artifact 是经 CI 验证的构建文件，不代表已部署到线上，也不执行任何服务器操作或线上发布。生产拉取方应仅按 `astryx-main-<40位 SHA>` 识别正式包，并校验 manifest 中的 SHA/channel 和 checksum；PR artifact 仅供预览，不能当作正式版本。
