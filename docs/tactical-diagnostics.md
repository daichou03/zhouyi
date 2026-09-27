# AI 死活与战术诊断

运行：

```powershell
npm run diagnose:tactics
```

脚本会让内置AI、KataGo全局策略首选和当前混合AI分别处理 `fixtures/tactical-cases.js` 中的局面，并写出：

- `reports/EXP-003-tactical-baseline.md`：战术保护前的8/10基线。
- `reports/EXP-004-tactical-protection.md`：当前实现的结果与错误分类。
- `reports/EXP-004-tactical-protection.json`：候选着、内置分数、KataGo策略概率和耗时。

## 结果解释

题库中的 `mustPlay` 表示局部题解，`mustAvoid` 表示不可接受的着法。KataGo仍按整盘胜率分析，并未被限制成局部解题器，因此它的全局首选不命中 `mustPlay` 不一定是死活错误。真正需要优先修复的是：内置读取已经找到高置信强制着，但加入KataGo先验后最终决策反而偏离。

## 添加真实失败局面

在 `fixtures/tactical-cases.js` 增加一项：

- `diagram` 使用 `X` 表示黑棋、`O` 表示白棋、`.` 表示空点。
- `turn` 为 `B` 或 `W`。
- `mustPlay`、`mustAvoid` 使用图中的零基 `[x,y]` 坐标。
- 边角题设置 `origin:[0,0]`；未设置时，小图会自动居中放入9路棋盘。
- 一个失败局面应附上来源与判断理由，避免把主观战略偏好写成强制死活答案。

首批基础题主要验证诊断链路。复杂眼形、劫争、征子与区域边界附近的实战题应从真实对局逐步补入。
