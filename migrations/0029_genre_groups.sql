-- Group dialect characters under 方言字 and split 國字 by origin.
ALTER TABLE genres ADD COLUMN parent TEXT REFERENCES genres(slug);

INSERT INTO genres (slug, label, parent) VALUES ('dialect', '方言字', NULL);

UPDATE genres SET label = '日本國字', parent = 'dialect' WHERE slug = 'kokuji';
INSERT INTO genres (slug, label, parent) VALUES ('kokuji-kr', '朝鮮國字', 'dialect');

UPDATE genres SET parent = 'dialect'
WHERE slug IN ('wu', 'mindong', 'yue', 'minnan', 'hakka', 'mandarin', 'nom', 'baiwen');
