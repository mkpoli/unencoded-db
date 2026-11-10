-- Group shortened and reformed characters under 略字・簡化字.
INSERT INTO genres (slug, label, parent) VALUES ('abbreviation', '略字・簡化字', NULL);

-- Types of 略字: https://zh.wikipedia.org/wiki/略字
-- 日本擴張新字體: https://ja.wikipedia.org/wiki/拡張新字体
INSERT INTO genres (slug, label, parent) VALUES
  ('shinjitai', '日本新字體', 'abbreviation'),
  ('shinjitai-extended', '日本擴張新字體', 'abbreviation'),
  ('simplified-cn', '大陸簡體字', 'abbreviation'),
  ('simplified-cn-2', '大陸二簡字', 'abbreviation'),
  ('yakja', '韓國略字', 'abbreviation'),
  ('ryakuji', '日本俗略字', 'abbreviation');
