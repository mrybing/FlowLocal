# AGENTS.md

本文件面向后续维护本项目的 AI Agent，说明项目架构、数据流、关键设计与开发约定。

---

## 1. 项目概述

- **项目名称**: FlowLocal（商业视觉企划工作流引擎）
- **定位**: 本地运行的商业摄影 / 广告视觉企划 AI 工作台，纯前端，浏览器直连 Gemini API。
- **核心功能**:
  - 用户填写商品信息、品牌调性、输出画幅，上传全局风格图、产品图、环境图及多位模特的人像 / 服装参考图。
  - 支持多个卖点（Selling Points）并行策划：每个卖点上传一张参考图，系统提取视觉策略、构思叙事、编译生图 Prompt。
  - 每个卖点可单独控制「是否使用模特」「使用哪张环境图」。
  - 用户审核 / 修改 Prompt 后调用 Nano Banana 生图，并下载结果。
- **使用者画像**: 非程序员，主要靠自然语言驱动 AI 修改流程，因此代码应保持简单、少依赖、少魔法。

---

## 2. 技术栈与运行

| 项 | 内容 |
| :--- | :--- |
| 框架 | React 18 + TypeScript，Vite 5 构建 |
| 样式 | Tailwind（`index.html` 中 CDN 引入，无构建配置）+ Google Sans Text + Material Symbols |
| AI SDK | `@google/genai`，浏览器直连，无后端 |
| 推理模型 | `gemini-3.1-pro-preview`（固定） |
| 生图模型 | 界面下拉切换：Nano Banana 2 = `gemini-3.1-flash-image-preview`（默认）/ Nano Banana Pro = `gemini-3-pro-image-preview` |
| 持久化 | 仅 localStorage 保存 API Key 与生图模型；项目数据不自动保存，刷新即重置 |

运行：`npm install` → `npm run dev`（默认 http://localhost:5173）。类型检查：`npx tsc --noEmit`。

> [!NOTE]
> 运行环境需能直接访问 `generativelanguage.googleapis.com`（用户已有系统级代理）。API Key 在侧边栏 Settings 填写，只存在本机浏览器。

---

## 3. 目录结构

```text
FlowLocal/
├── index.html            # 入口页（Tailwind CDN、字体、图标）
├── main.tsx              # React 挂载
├── App.tsx               # 全部界面、状态管理、流水线调度、生图触发、导入导出
├── types.ts              # 数据契约
├── services/
│   ├── flow.ts           # Gemini API 封装（文本 / 生图 / 选图 / 下载 / 设置存取）
│   └── workflow.ts       # 4 节点流水线、参考图编号、Prompt 编译
├── vite.config.ts / tsconfig.json / package.json
└── AGENTS.md
```

| 文件 | 职责 |
| :--- | :--- |
| [services/flow.ts](file:///c:/Users/CUTE/Desktop/dev/FlowLocal/services/flow.ts) | 导出 `Flow.generate.text` / `Flow.generate.image` / `Flow.media.select` / `Flow.download`，以及 API Key、生图模型的 localStorage 读写。 |
| [services/workflow.ts](file:///c:/Users/CUTE/Desktop/dev/FlowLocal/services/workflow.ts) | 全局风格分析、卖点视觉提取、叙事构思、Prompt 编译，以及 `spUsesModels` / `withSpEnv` / `buildGenerationRefs`。 |
| [App.tsx](file:///c:/Users/CUTE/Desktop/dev/FlowLocal/App.tsx) | 侧边栏（Settings、Campaign Context、Universal Assets、Character Inventory）与主区（卖点卡片、Prompt 审核、结果预览）。 |
| [types.ts](file:///c:/Users/CUTE/Desktop/dev/FlowLocal/types.ts) | `GlobalContext`、`SellingPoint`、`VisualParams`、`NarrativeConcept`、`MediaAsset` 等类型。 |

### `services/flow.ts` 接口

- `Flow.generate.text(prompt, { systemInstruction?, images? }) → { text }`：多模态文本 / JSON 生成。
- `Flow.generate.image({ prompt, aspectRatio, referenceImages? }) → MediaAsset`：参考图作为 inlineData **按数组顺序放在 prompt 文本之前**传入，第 N 张即 `image N`。
- `Flow.media.select() → MediaAsset | null`：浏览器文件选择器，读成 base64，`mediaId` 为随机 UUID（仅作标识，不参与 API 调用）。
- `Flow.download({ base64, mimeType, filename })`：触发浏览器下载。
- 未填 API Key 时抛出明确的中文错误提示。

---

## 4. 核心数据类型（[types.ts](file:///c:/Users/CUTE/Desktop/dev/FlowLocal/types.ts)）

- `MediaAsset { mediaId, base64, mimeType, name? }`
- `GlobalContext`：`product_info`、`brand_tone`、`output_spec`（画幅字符串）、`globalStyleImage?`、`productImage?`、`environmentImage?`、`modelReferences: ModelSuitPair[]`、`global_analysis?`
- `ModelSuitPair { id, model?, suit? }`：第 i 个对应字母 `A, B, C…`
- `SellingPoint`：`name`、`description`、`referenceImage?`、`modelMode?`（`auto | with_model | no_model`）、`envMode?`（`global | custom | none`）、`environmentImage?`（`custom` 时使用）、`enrichment { visual_params, narrative_concept, final_prompt, generatedImage? }`、`status`、`error?`
- `VisualParams`：含 `image_type`（`CGI_Abstract | Studio_Minimal | Lifestyle_Commercial | Unknown`）与 `requires_model`（boolean）等字段。
- `SellingPoint.status`：`idle → analyzing → narrating → compiling → awaiting_review → generating → completed`，任意阶段出错为 `error`。

---

## 5. 流水线（4 节点）

```
全局风格图 ──Node1 extractGlobalParams──▶ GlobalAnalysis（5 维风格 DNA）
卖点参考图 + 商品信息 ──Node2 extractVisualParams──▶ VisualParams（含 image_type / requires_model）
VisualParams + 资产图 ──Node3 generateNarrative──▶ NarrativeConcept
GlobalAnalysis + VisualParams + NarrativeConcept ──Node4 compilePrompt──▶ 最终 Prompt（≤3600 字符）
Prompt + buildGenerationRefs 的参考图 ──Flow.generate.image──▶ 成品图
```

### Node 1：`extractGlobalParams`
从全局风格图提取 5 维风格 DNA（每维 ≤10 词）：`image_type`、`style_feel`、`color_tone`、`lighting`、`negative_space`。只在有风格图且尚未分析时执行。

### Node 2：`extractVisualParams`
- 只看该卖点参考图 + 卖点文案 + 商品信息，**不受全局风格影响**。
- 输出商品陈列策略、视觉焦点、情绪、空间关系、灯光、环境、构图、机位、景别等，字数有严格上限。
- **图片类型分类**：判定 `image_type` 与 `requires_model`。CGI / 白底 / 纯产品图类为 false，真实场景且有人穿戴 / 使用产品的为 true。

### Node 3：`generateNarrative`
- 输入：产品图、环境图、卖点参考图、（需要模特时）各模特 / 服装图，并附带图例说明。
- 输出：`scene_setting`（纯环境）、`subject_setup`（产品摆放 + 模特姿态 + 空间关系，最重要）、`props`、`emotion_keywords`、`model_choreography`（多模特时）。
- 资产 Token（仅允许使用「实际可用」的 Token，由 `buildGenerationRefs` 决定）：
  - `{{PRODUCT}}` 唯一主角商品，必须出现；与服装严格区分。
  - `{{ENV}}` 环境图，存在时**覆盖**卖点参考图中的背景描述。
  - `{{MODEL_A}}`、`{{MODEL_B}}`… 模特面容身形；`{{OUTFIT_A}}`… 模特服装（不是主推商品）。
- 不使用模特时，叙事提示中明确禁止出现人物 / 手 / 肢体，且不喂模特图。
- 自愈：最多重试 2 次；仍使用了未声明 Token 则剥离并标记 `_autoCorrected`。JSON 解析失败会让模型自行修复一次。

### Node 4：`compilePrompt`
4 个信息块互不重复：
1. `[PRODUCT]`：商品、卖点、陈列方式。
2. `[MODEL & COMPOSITION]`（无模特时标题为 `[SUBJECT & COMPOSITION]`）：`subject_setup`、模特编排、构图 / 机位 / 景别、视觉焦点、情绪。
3. `[SCENE]`：环境、道具、情绪关键词、材质。
4. `[STYLE]`：一行化风格标签（无全局风格图时由 Node 2 结果回退）+ 品牌调性。
5. 末尾 `Aspect ratio X:Y.`

最后一步 `resolveTokensToImageRefs`：把 Token 替换成 `the product from image 1` / `the person from image 2` 等，并在开头加 `Reference images: image 1 = …; image 2 = …`。

> [!IMPORTANT]
> **3600 字符硬限制**（`MAX_PROMPT_LENGTH`）。超限时依次：压缩 `[STYLE]` → 删除 Props 行 → 末尾截断。任何改动 Prompt 格式的修改都必须考虑长度；界面在超限时红色告警并禁用生成按钮。

---

## 6. 参考图编号（最关键的一致性约定）

Nano Banana 按输入顺序把图片对应为 image 1、image 2…，因此 Prompt 中的编号必须与实际传入顺序严格一致。

- `buildGenerationRefs(sp, globalContext)` 是**生图参考图列表的唯一来源**；`compilePrompt` 与 `App.tsx` 的 `confirmAndGenerate` 都调用它，**禁止另行拼装顺序**。
- 顺序：产品图 → 各模特的人像 / 服装（仅 `spUsesModels` 为 true 时）→ 环境图（经 `withSpEnv` 解析）。
- 只给**实际上传**的图编号，空槽位跳过，编号连续；最多 14 张。
- **卖点参考图只用于分析，不传入生图，也不编号。**
- Prompt 的编号在点击 Process 时固化；之后增删参考图，需重新 Process 才能更新编号。

---

## 7. 卖点级覆盖

- **模特使用**（`spUsesModels`）：优先级为用户选择 `modelMode`（`with_model` / `no_model`）> Node 2 的 `requires_model` > 默认 true。全局没有任何模特 / 服装图时恒为 false。影响：叙事输入、Token 清单、生图参考图、Prompt 块标题。
- **环境图**（`withSpEnv`）：`global`（默认，用全局环境图）/ `custom`（用该卖点自己的环境图，在卖点卡片上传）/ `none`（不使用环境图）。影响叙事的环境覆盖规则、`{{ENV}}` Token 与参考图编号。
- 修改这两项后需重新点击 Process 才会生效。

---

## 8. 界面与交互（[App.tsx](file:///c:/Users/CUTE/Desktop/dev/FlowLocal/App.tsx)）

- 侧边栏：Settings（API Key、生图模型、Export / Import Inputs）→ Campaign Context → Universal Assets（Style / Product / Env）→ Character Inventory（可添加多个 Model，每个含 Model 与 Suit）→ Process Campaign 按钮。
- 主区：卖点卡片（参考图、标题、描述、Model usage 与 Environment 下拉、Prompt 审核框 + 字符计数、Generate、结果预览、Tweak Prompt、Export 下载）。
- **导出 / 导入输入**：导出 `globalContext + sellingPoints` 为 JSON（含图片 base64），导入后把进行中的状态重置为 `idle`，用于刷新后快速恢复测试。
- **错误处理**：流水线出错时对应卖点进入 `error` 并弹窗；生图失败同样进入 `error`，可点 Retry。
- 风格：极暗 `#0e0e0e`，边框使用 `border-white/10` 一类的低透明度；处理中有 Spinner 与阶段文字。

---

## 9. 开发注意事项

1. **Token 纯度**：叙事 Token 不含 `{{STYLE}}`，风格只由 `[STYLE]` 块承担；`{{PRODUCT}}` 绝不与服装 / 配饰混淆。
2. **环境覆盖**：存在生效的环境图时，叙事必须以它为准，忽略卖点参考图背景。
3. **新增 / 修改参考图相关逻辑**：只改 `buildGenerationRefs`，并同步检查 `collectNarrativeImages` / `buildImageLegend`（叙事阶段的图片顺序与图例必须一致）。
4. **保持简单**：不引入后端、状态库或复杂构建配置，除非用户明确要求。
5. **不要提交 / 打印 API Key**；Key 只存 localStorage。
6. 修改后至少运行 `npx tsc --noEmit`。
