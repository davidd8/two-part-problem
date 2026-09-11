CREATE TABLE games (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  difficulty  TEXT    NOT NULL CHECK (difficulty IN ('beginner', 'intermediate', 'expert')),
  width       INTEGER NOT NULL CHECK (width > 0),
  height      INTEGER NOT NULL CHECK (height > 0),
  mines       INTEGER NOT NULL CHECK (mines > 0),
  status      TEXT    NOT NULL DEFAULT 'playing' CHECK (status IN ('playing', 'won', 'lost')),
  -- Engine state as JSON: mine, revealed and flagged grids. Read and written whole.
  board       TEXT    NOT NULL,
  score       INTEGER NOT NULL DEFAULT 0 CHECK (score >= 0),
  started_at  TEXT,
  finished_at TEXT,
  elapsed_ms  INTEGER CHECK (elapsed_ms IS NULL OR elapsed_ms >= 0),
  created_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX idx_games_status_score ON games (status, score DESC);
CREATE INDEX idx_games_difficulty_elapsed ON games (difficulty, status, elapsed_ms);

CREATE TRIGGER games_set_updated_at
AFTER UPDATE ON games
FOR EACH ROW
BEGIN
  UPDATE games
  SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  WHERE id = OLD.id;
END;
