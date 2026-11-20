-- A digital copy can have many page-specific citations. A registered prefix ends
-- immediately before the viewer's decimal scan number and includes the object ID.
CREATE TABLE digitized_copies (
  slug TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  collection TEXT NOT NULL
) WITHOUT ROWID;
CREATE TABLE copy_page_prefixes (
  prefix TEXT PRIMARY KEY CHECK (substr(prefix, -1) = '='),
  copy_slug TEXT NOT NULL REFERENCES digitized_copies(slug)
) WITHOUT ROWID;
INSERT INTO digitized_copies VALUES ('ntcu-848', '彙音字典', 'NTCU');
INSERT INTO copy_page_prefixes VALUES
  ('http://ip194097.ntcu.edu.tw/memory/TGB/thak.asp?id=848&page=', 'ntcu-848'),
  ('https://ip194097.ntcu.edu.tw/memory/TGB/thak.asp?id=848&page=', 'ntcu-848');

CREATE INDEX sources_by_url ON sources(url);
CREATE VIEW digitized_copy_pages AS
  SELECT p.copy_slug, c.id AS source_id, c.url, substr(c.url, length(p.prefix) + 1) AS scan
  FROM copy_page_prefixes p CROSS JOIN sources c
    ON c.url >= p.prefix || '0' AND c.url < p.prefix || ':'
    AND instr(c.url, char(0)) = 0
    AND substr(c.url, length(p.prefix) + 1) NOT GLOB '*[^0-9]*';
