-- Shared readings belong to the title, including citations of printed copies.
-- Joining public sources at search time covers existing and future citations.
CREATE TABLE source_title_readings (
  lookup TEXT NOT NULL,
  title TEXT NOT NULL,
  spelling TEXT NOT NULL,
  PRIMARY KEY (lookup, title)
) WITHOUT ROWID;
CREATE INDEX source_public_title ON sources(title) WHERE records > 0;

-- Lookup keys use titleReadingKey. Spelling is what the picker shows.
INSERT INTO source_title_readings (lookup, title, spelling) VALUES
  ('彙音字典', '彙音字典', '彙音字典'),
  ('汇音字典', '彙音字典', '汇音字典'),
  ('huiyinzidian', '彙音字典', 'Huìyīn Zìdiǎn'),
  ('hui4yin1zi4dian3', '彙音字典', 'Hui4 yin1 zi4 dian3'),
  ('huiyindictionary', '彙音字典', 'Huiyin Dictionary'),
  ('ionjiten', '彙音字典', 'Ion Jiten'),
  ('いおんじてん', '彙音字典', 'いおんじてん'),
  ('휘음자전', '彙音字典', '휘음자전'),
  ('hwieumjajeon', '彙音字典', 'Hwieum Jajeon'),
  ('hwieumjajoen', '彙音字典', 'hwieumjajoen');
