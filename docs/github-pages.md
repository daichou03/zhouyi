# GitHub Pages 试玩版

GitHub Pages 版本采用纯前端部署，只使用内置AI。访问地址的主机名以 `.github.io` 结尾时，前端会跳过所有 KataGo API 请求，并显示“在线试玩版 · 内置AI”。本地开发和未来的自建后端仍可使用 KataGo。

## 第一次发布

1. 在 GitHub 新建仓库，不要自动创建 README 或 `.gitignore`。
2. 在本项目目录提交并推送：

```powershell
git add .
git commit -m "Initial playable prototype"
git branch -M main
git remote add origin https://github.com/你的用户名/zhouyi.git
git push -u origin main
```

3. 打开仓库的 `Settings → Pages`。
4. 在 `Build and deployment` 中选择 `Deploy from a branch`。
5. 选择 `main` 与 `/(root)`，然后保存。

页面地址通常为 `https://你的用户名.github.io/zhouyi/`。项目使用相对资源路径，可以在仓库子路径下运行；根目录的 `.nojekyll` 会让 GitHub Pages 原样发布静态文件。

## 更新

本地运行以下命令后提交并推送到 `main`：

```powershell
npm test
npm run check:pages
```

Pages 会从分支根目录重新发布，无需提交 `.local/katago`；该目录已经被 Git 忽略。

## 功能差异

| 功能 | GitHub Pages | 本地服务 |
|---|---|---|
| 完整对局规则、地图、复盘 | 支持 | 支持 |
| 双人同屏与AI自战 | 支持 | 支持 |
| 内置区域AI | 支持 | 支持 |
| KataGo增强 | 不使用 | 配置后支持 |

如果以后部署独立 KataGo 服务，应另行配置 API 地址、HTTPS、跨域、访问限流和服务监控，而不是把引擎或模型放入 Pages 仓库。
