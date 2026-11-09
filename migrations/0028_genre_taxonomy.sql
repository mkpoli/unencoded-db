-- Expand the genre taxonomy (類屬) to twenty categories and merge 醫學 into 醫藥.
UPDATE genres SET label = '醫藥' WHERE slug = 'medicine';

INSERT OR IGNORE INTO genres (slug, label) VALUES
  ('wu', '吳語'),
  ('mindong', '閩東語'),
  ('yue', '粵語'),
  ('minnan', '閩南語'),
  ('hakka', '客家語'),
  ('mandarin', '官話'),
  ('nom', '喃字'),
  ('baiwen', '白文'),
  ('kokuji', '國字'),
  ('taoism', '道教'),
  ('buddhism', '佛教'),
  ('qieshen', '切身'),
  ('transliteration', '音譯'),
  ('names', '人名'),
  ('places', '地名'),
  ('flora-fauna', '動植物');
