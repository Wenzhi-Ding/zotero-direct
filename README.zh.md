# Zotero Direct

> 这是一个基于 [stefanopagliari/bibnotes](https://github.com/stefanopagliari/bibnotes) 的**个性化再开发**版本。

## 设计理念

本版本的目标是对原插件进行精简，降低配置难度，让用户可以更专注于内容本身：

- **精简逻辑**：移除复杂的高亮/注释导入功能，仅保留元数据导入
- **降低配置**：无需安装和配置 Zotero 插件，直接读取 Zotero 数据库
- **Human in the loop**：鼓励用户主动阅读和思考，手动整理笔记，而非自动导入所有注释

---

本插件从您的 Zotero 库中生成文献笔记，仅导入文献的**元数据**（标题、作者、摘要等），不包含 PDF 高亮、注释或图片。

![](/images/ExampleNote.png)

## 安装

本插件已发布到 Obsidian Community Plugins，您可以直接在 Obsidian 中安装：

1. 打开 Obsidian 设置 → 社区插件
2. 浏览社区插件，搜索 "Zotero Direct"
3. 点击安装并启用

或者手动安装：下载最新 release，解压到您的 vault 的 `.obsidian/plugins/` 目录下，然后在 Obsidian 设置中启用。

## 导入 Zotero 库

本插件**直接读取 Zotero 数据库**，无需导出 JSON 文件或安装 Zotero 插件。

### 配置步骤

1. 在插件设置中，配置您的 **Zotero 数据库路径**：
   - Windows: `C:\Users\<用户名>\Zotero\zotero.sqlite`
   - macOS: `~/Library/Application Support/Zotero/Profiles/<随机字符串>/zotero.sqlite`
   - Linux: `~/.zotero/zotero/<随机字符串>/zotero.sqlite`

2. 设置文献笔记的**导出路径**：指定 Obsidian vault 中的文件夹（如 `Literature Notes`）

3. （可选）配置其他模板和格式选项

> **提示**：插件会自动读取您的 Zotero 数据库，实时获取最新的文献信息。

## 命令

插件提供两个命令：

- **Create/Update Literature Note**: 选择此命令后，您可以从 Zotero 库中选择一篇文献。如果该文献尚未导入，将生成新笔记；如果已存在，将更新笔记内容（不会覆盖您在 Obsidian 中手动添加的注释）。第一个选项（"Entire Library"）可用于创建/更新库中所有文献的笔记。

![](/images/SelectCommandExample.png)

- **Update Library**: 选择此命令后，插件将生成/更新自上次运行该命令以来在 Zotero 中修改过的所有笔记。如果是第一次运行，将为导入的文献库中的所有条目创建/更新文献笔记。

## 创建文献笔记

本版本**仅导出文献的元数据**，不包含以下内容：
- PDF 高亮和注释（{{PDFNotes}}、{{Yellow}}、{{Red}} 等）
- Zotero 中手动创建的笔记（{{UserNotes}}）
- 从 PDF 提取的图片（{{Images}}）

### 为什么移除这些功能？

这符合 **"Human in the loop"** 的理念：
- **避免信息过载**：自动导入所有高亮往往产生大量低价值信息
- **主动阅读**：我们鼓励您主动阅读和思考，手动整理真正重要的内容
- **保持简洁**：插件逻辑更简单，配置更容易，使用更专注

如果您需要完整的注释导入功能，建议使用原版 [stefanopagliari/bibnotes](https://github.com/stefanopagliari/bibnotes)。

---

### 可用的配置选项：

- **Export Path**: 在插件设置中，添加 Obsidian vault 中的相对文件夹路径，用于存储文献笔记。如果留空，笔记将导出到主文件夹。
- **Note Title**: 在插件设置中，您可以指定笔记标题的格式。可能的值包括：
  - {{citeKey}}
  - {{title}}
  - {{author}}
  - {{year}}
- **Template**: 可以选择两种现有模板之一（一种将元数据显示为简单列表，另一种使用 Admonition 插件将信息包装在方框中），或提供自定义模板（见下文）。
- **Fields**: 可以在自定义模板中包含所有在 Zotero 数据库中找到的字段，以及插件创建的其他字段。这些包括：
  - {{title}}
  - {{shortTitle}}
  - {{citeKey}} 或 {{citationKey}}
  - {{itemType}}
  - {{author}}
  - {{editor}}
  - {{creator}}: 所有被列为创作者的个人，包括作者、编辑等
  - {{translator}}
  - {{publisher}}
  - {{place}}
  - {{series}}
  - {{seriesNumber}}
  - {{publicationTitle}}
  - {{volume}}
  - {{issue}}
  - {{pages}}
  - {{year}}
  - {{dateAdded}}
  - {{dateModified}}
  - {{DOI}}
  - {{ISBN}}
  - {{ISSN}}
  - {{abstractNote}}
  - {{url}}
  - {{uri}}: Zotero 网站上该条目的链接
  - {{eprint}}
  - {{file}}: 附加到该条目的文件的本地路径
  - {{filePath}}: 链接到 Zotero 中与此条目关联的附件（不打开阅读器）
  - {{zoteroReaderLink}}: 链接以在 Zotero 阅读器中打开特定附件。这与 {{file}} 不同，后者在外部阅读器中打开附件
  - {{localLibrary}}: Zotero 应用中该条目的链接
  - {{select}}: Zotero 应用中附件的链接
  - {{keywordsZotero}}: 条目元数据中的标签
  - {{keywordsPDF}}: 从 PDF 中提取的标签
  - {{keywords}}, {{keywordsAll}}: 条目元数据中的标签和从 PDF 中提取的标签
  - {{collections}}: 条目所在的集合/文件夹
  - {{collectionsParent}}: 条目所在的集合/文件夹，以及这些的父文件夹

- 还可以将占位符包装在 [[ ]] 中以创建笔记，或在其前面加上标签(#)。还可以在字段前加上 :: 以创建 Dataview 字段。
- **Missing Fields**: 模板中存在但条目中缺失的字段默认会被删除。这可以在设置中更改。

## 更新现有笔记

如果要更新现有笔记，您可以在插件设置中决定：

- 完全覆盖现有笔记（"Overwrite Entire Note"）
- 保留现有笔记，仅添加现有笔记中未包含的新句子（"Save Entire Note"）
- 保留现有笔记，仅在特定部分添加不重叠的句子，同时覆盖其余部分（"Select Section"）。选择 "Select Section" 时，插件会要求输入标识要更新（而非覆盖）部分的开头或结尾的字符串。如果 "start" 字段留空，则从笔记开头保留现有文本。如果 "end" 字段留空，则保留现有文本直到笔记结尾。例如，为了覆盖元数据但保留对笔记的手动更改，应将要保留的部分的开头设置为模板中元数据前的唯一标题。
