# KataGo 本地桥接

州弈可以选择性连接本机 KataGo Analysis Engine。未配置或分析失败时，游戏会自动回退到内置区域 AI，不影响对局。

## 工作分工

- KataGo提供普通围棋候选着和策略概率，补强死活、征子与棋形。
- 内置AI保留安全州限制、区域分值、赢家通吃评价和最终决策。
- KataGo不直接决定区域制胜负，也不需要理解州边界。

## 配置

需要准备兼容版本的 KataGo 可执行文件、神经网络模型和 analysis 配置文件。启动服务前设置：

```powershell
$env:KATAGO_PATH = "C:\path\to\katago.exe"
$env:KATAGO_MODEL = "C:\path\to\model.bin.gz"
$env:KATAGO_CONFIG = "C:\path\to\analysis.cfg"
npm start
```

当前开发机已经在 `.local/katago` 安装轻量组合：KataGo v1.18.1 OpenCL 与 `b10c128` 网络。服务会自动发现这一约定目录；该目录已被 Git 忽略，不会把二进制文件或模型提交进源码仓库。环境变量仍可覆盖本地默认值。

页面的AI强度下方会显示“未配置”“已配置”或“已连接”。

## 接口

- `GET /api/katago/status`：返回配置、运行状态、模型文件名和最近错误。
- `POST /api/katago/analyze`：接受KataGo JSON分析请求。

服务端按需启动单个持久KataGo进程，以逐行JSON匹配请求。前端对快速、均衡、深入模式分别请求64、160、400次访问；首次OpenCL模型加载允许10–12秒，失败后进入30秒退避。

## 限制

- 当前通过完整棋盘作为 `initialStones` 请求分析，KataGo不掌握本项目棋谱中的劫历史；返回着仍会由本地规则引擎重新检查合法性。
- 第一版只使用KataGo策略概率作为根节点先验，暂不直接混合其普通围棋胜率。
- KataGo所有权数据已经保留在桥接结果中，待完成区域校准后再用于叶节点评价。
- 浏览器不会下载、安装或上传模型；所有分析留在本机。
