-- 默认导航包含 /about；仅在独立页面缺失时补齐，保留已有内容及发布状态。
INSERT INTO `posts` (`type`, `title`, `slug`, `content`, `status`, `published_at`)
SELECT
  'page',
  '关于',
  'about',
  '你好，欢迎来到我的博客。

这里记录我的学习、生活与思考。愿这些文字能带给你一点启发，也欢迎你在文章下留言交流。',
  'published',
  CAST(unixepoch('subsec') * 1000 AS INTEGER)
WHERE NOT EXISTS (
  SELECT 1 FROM `posts` WHERE `type` = 'page' AND `slug` = 'about'
);
