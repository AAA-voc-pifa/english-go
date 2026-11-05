# English Go

用词表里 points 最低的 3 个单词做一组翻译练习。每个单词 3 道英译中，题目存在 MongoDB。译文默认藏着，英文可以朗读，做完给这个单词加 5、10 或 15 points。

## 运行

```bash
pnpm dev
```

打开 [http://localhost:3000](http://localhost:3000)。

环境变量见 `.env.example`。口令写在 `.env.local`，不要提交。

练习写在 `english-go` 这个库，和词表的库分开。
