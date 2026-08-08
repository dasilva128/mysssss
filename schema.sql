PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS scans (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at TEXT NOT NULL,
    source_ip TEXT,
    total_targets INTEGER NOT NULL DEFAULT 0,
    reachable INTEGER NOT NULL DEFAULT 0,
    high_score INTEGER NOT NULL DEFAULT 0,
    best_score INTEGER NOT NULL DEFAULT 0,
    avg_score INTEGER NOT NULL DEFAULT 0,
    duration INTEGER NOT NULL DEFAULT 0,
    configs_generated INTEGER NOT NULL DEFAULT 0,
    user_agent TEXT,
    cf_colo TEXT
);

CREATE INDEX IF NOT EXISTS idx_scans_created_at ON scans(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_scans_source_ip ON scans(source_ip);

CREATE TABLE IF NOT EXISTS scan_details (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    scan_id INTEGER NOT NULL,
    target_ip TEXT NOT NULL,
    target_port INTEGER NOT NULL,
    score INTEGER NOT NULL DEFAULT 0,
    reachable INTEGER NOT NULL DEFAULT 0,
    http_status INTEGER,
    http_latency INTEGER,
    https_status INTEGER,
    https_latency INTEGER,
    ws_accepted INTEGER DEFAULT 0,
    ws_latency INTEGER,
    config_type TEXT,
    config_link TEXT,
    FOREIGN KEY (scan_id) REFERENCES scans(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_details_scan_id ON scan_details(scan_id);
CREATE INDEX IF NOT EXISTS idx_details_score ON scan_details(score DESC);
CREATE INDEX IF NOT EXISTS idx_details_ip ON scan_details(target_ip);
