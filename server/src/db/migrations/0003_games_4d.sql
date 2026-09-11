-- Boards gain depth (3D) and ticks (time). SQLite cannot alter a CHECK, so the
-- table is rebuilt: the difficulty list is validated by zod from here on.
CREATE TABLE games_new (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  difficulty  TEXT    NOT NULL CHECK (length(difficulty) > 0),
  width       INTEGER NOT NULL CHECK (width > 0),
  height      INTEGER NOT NULL CHECK (height > 0),
  depth       INTEGER NOT NULL DEFAULT 1 CHECK (depth > 0),
  ticks       INTEGER NOT NULL DEFAULT 1 CHECK (ticks > 0),
  mines       INTEGER NOT NULL CHECK (mines > 0),
  status      TEXT    NOT NULL DEFAULT 'playing' CHECK (status IN ('playing', 'won', 'lost')),
  board       TEXT    NOT NULL,
  score       INTEGER NOT NULL DEFAULT 0 CHECK (score >= 0),
  started_at  TEXT,
  finished_at TEXT,
  elapsed_ms  INTEGER CHECK (elapsed_ms IS NULL OR elapsed_ms >= 0),
  created_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

INSERT INTO games_new (id, difficulty, width, height, mines, status, board, score,
                       started_at, finished_at, elapsed_ms, created_at, updated_at)
SELECT id, difficulty, width, height, mines, status, board, score,
       started_at, finished_at, elapsed_ms, created_at, updated_at
FROM games;

DROP TABLE games;
ALTER TABLE games_new RENAME TO games;

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
