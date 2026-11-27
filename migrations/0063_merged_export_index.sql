-- Covers walking retired record codes in id order for public exports without scanning `entries`.
CREATE INDEX entries_merged_export ON entries(id, merged_into) WHERE merged_into IS NOT NULL AND hidden_at IS NULL;
