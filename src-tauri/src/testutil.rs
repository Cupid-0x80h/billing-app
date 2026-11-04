//! Test-only helpers: a self-cleaning temporary database.
use rusqlite::Connection;
use std::mem::ManuallyDrop;
use std::path::PathBuf;
use std::sync::atomic::{AtomicU64, Ordering};

static SEQ: AtomicU64 = AtomicU64::new(0);

/// A temp database path unique to this process.
///
/// The clock alone is not enough: tests run in parallel threads and can read the
/// same nanosecond tick (Windows timers are coarser than Linux), which would make
/// two tests share one file and the second seeding would hit the UNIQUE admin row.
pub fn unique_db_path() -> PathBuf {
    let n = SEQ.fetch_add(1, Ordering::Relaxed);
    std::env::temp_dir().join(format!("billing_test_{}_{}.db", std::process::id(), n))
}

pub struct TempDb {
    /// Held in `ManuallyDrop` so `Drop` can close it *before* deleting the files —
    /// Windows refuses to remove a SQLite file while a connection still has it open.
    pub conn: ManuallyDrop<Connection>,
    files: Vec<PathBuf>,
}

impl TempDb {
    /// Fresh database, seeded exactly like a first run (admin + sample menu).
    pub fn new() -> Self {
        let path = unique_db_path();
        let conn = crate::db::open_and_migrate(&path).expect("open temp db");
        let files = [
            path.clone(),
            PathBuf::from(format!("{}-wal", path.display())),
            PathBuf::from(format!("{}-shm", path.display())),
        ]
        .to_vec();
        Self {
            conn: ManuallyDrop::new(conn),
            files,
        }
    }
}

impl Drop for TempDb {
    fn drop(&mut self) {
        // Close the handle first; dropping `ManuallyDrop` is a no-op, so no double-drop.
        unsafe { ManuallyDrop::drop(&mut self.conn) };
        for f in &self.files {
            let _ = std::fs::remove_file(f);
        }
    }
}
