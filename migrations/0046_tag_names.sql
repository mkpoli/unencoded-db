-- A tag's and a group's name in each interface language, by locale. A language without one shows the label.
ALTER TABLE tags ADD COLUMN names TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(names));
ALTER TABLE tag_groups ADD COLUMN names TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(names));
