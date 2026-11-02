//! Test-only helpers: a self-cleaning temporary database.
use rusqlite::Connection;
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};

pub struct TempDb {
    pub conn: Connection,
    files: Vec<PathBuf>,
}

impl TempDb {
    /// Fresh database, seeded exactly like a first run (admin + sample menu).
    pub fn new() -> Self {
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let path = std::env::temp_dir().join(format!("billing_test_{nanos}.db"));
        let conn = crate::db::open_and_migrate(&path).expect("open temp db");
        let files = [
            path.clone(),
            PathBuf::from(format!("{}-wal", path.display())),
            PathBuf::from(format!("{}-shm", path.display())),
        ]
        .to_vec();
        Self { conn, files }
    }
}

impl Drop for TempDb {
    fn drop(&mut self) {
        for f in &self.files {
            let _ = std::fs::remove_file(f);
        }
    }
}
