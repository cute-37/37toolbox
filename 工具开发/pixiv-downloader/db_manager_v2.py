import os
import sqlite3
import logging
from datetime import datetime

logger = logging.getLogger("PixivDownloader")

class Database:
    """优化的数据库管理类"""

    def __init__(self, db_path):
        db_dir = os.path.dirname(db_path)
        if db_dir and not os.path.exists(db_dir):
            os.makedirs(db_dir, exist_ok=True)
        self.conn = sqlite3.connect(db_path, check_same_thread=False)
        self._init_db()

    def _init_db(self):
        with self.conn:
            self.conn.execute('''CREATE TABLE IF NOT EXISTS artists (
                author_id INTEGER PRIMARY KEY,
                author_name TEXT,
                last_synced_id INTEGER DEFAULT 0,
                last_sync_time TIMESTAMP,
                profile_image_url TEXT,
                author_account TEXT,
                author_comment TEXT,
                total_illusts INTEGER,
                total_bookmarks INTEGER,
                is_followed INTEGER DEFAULT 0,
                twitter_account TEXT,
                webpage TEXT
            )''')
            self.conn.execute('''CREATE TABLE IF NOT EXISTS illust_metadata (
                illust_id INTEGER PRIMARY KEY,
                author_id INTEGER,
                title TEXT,
                create_date TEXT,
                tags TEXT,
                x_restrict INTEGER DEFAULT 0,
                is_r18 INTEGER DEFAULT 0,
                page_count INTEGER DEFAULT 1,
                width INTEGER,
                height INTEGER,
                sanity_level INTEGER,
                illust_type INTEGER,
                series_id INTEGER,
                series_title TEXT,
                tools TEXT,
                caption TEXT,
                total_view INTEGER DEFAULT 0,
                total_bookmarks INTEGER DEFAULT 0,
                is_bookmarked INTEGER DEFAULT 0,
                ai_type INTEGER DEFAULT 1,
                ugoira_data TEXT,
                tags_translated TEXT,
                FOREIGN KEY (author_id) REFERENCES artists(author_id)
            )''')
            self.conn.execute('''CREATE TABLE IF NOT EXISTS illusts (
                task_key TEXT PRIMARY KEY,
                illust_id INTEGER,
                page_index INTEGER,
                url TEXT,
                media_type TEXT DEFAULT 'image',
                status INTEGER DEFAULT 0,
                updated_at TEXT,
                attempts INTEGER DEFAULT 0,
                file_hash TEXT,
                file_size INTEGER DEFAULT 0,
                download_date TEXT,
                original_filename TEXT,
                content_type TEXT,
                FOREIGN KEY (illust_id) REFERENCES illust_metadata(illust_id)
            )''')
            self.conn.execute('''CREATE TABLE IF NOT EXISTS alerts (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                task_key TEXT,
                level TEXT,
                message TEXT,
                created_at TEXT
            )''')
            self._migrate_from_legacy_db()
            try:
                self.conn.execute("CREATE UNIQUE INDEX IF NOT EXISTS idx_illust_unique ON illusts (illust_id, page_index)")
                self.conn.execute("CREATE INDEX IF NOT EXISTS idx_illust_id ON illusts (illust_id)")
                self.conn.execute("CREATE INDEX IF NOT EXISTS idx_illust_status ON illusts (status)")
                self.conn.execute("CREATE INDEX IF NOT EXISTS idx_metadata_author ON illust_metadata (author_id)")
            except: pass

    def _migrate_from_legacy_db(self):
        try:
            cur = self.conn.execute("PRAGMA table_info(illusts)").fetchall()
            columns = [r[1] for r in cur]
            if 'author_id' in columns:
                logger.info("检测到旧版本数据库，开始迁移...")
                self.conn.execute('''INSERT OR IGNORE INTO illust_metadata (illust_id, author_id, title, create_date, tags, x_restrict, is_r18, page_count, width, height, sanity_level, illust_type, series_id, series_title, tools, caption)
                    SELECT DISTINCT illust_id, author_id, title, create_date, tags, COALESCE(x_restrict, 0), COALESCE(is_r18, 0), COALESCE(page_count, 1), width, height, sanity_level, illust_type, series_id, series_title, tools, caption
                    FROM illusts WHERE illust_id IS NOT NULL''')
                self.conn.execute("ALTER TABLE illusts RENAME TO illusts_old")
                self.conn.execute('''CREATE TABLE illusts (
                    task_key TEXT PRIMARY KEY, illust_id INTEGER, page_index INTEGER, url TEXT,
                    media_type TEXT DEFAULT 'image', status INTEGER DEFAULT 0, updated_at TEXT,
                    attempts INTEGER DEFAULT 0, file_hash TEXT, file_size INTEGER DEFAULT 0,
                    download_date TEXT, original_filename TEXT, content_type TEXT,
                    FOREIGN KEY (illust_id) REFERENCES illust_metadata(illust_id))''')
                self.conn.execute('''INSERT INTO illusts (task_key, illust_id, page_index, url, media_type, status, updated_at, attempts, file_hash, file_size, download_date, original_filename, content_type)
                    SELECT task_key, illust_id, page_index, url, COALESCE(media_type, 'image'), COALESCE(status, 0), updated_at, COALESCE(attempts, 0), file_hash, COALESCE(file_size, 0), download_date, original_filename, content_type
                    FROM illusts_old''')
                self.conn.execute("DROP TABLE illusts_old")
                logger.info("数据库迁移完成")
            cur_artists = self.conn.execute("PRAGMA table_info(artists)").fetchall()
            artist_columns = [r[1] for r in cur_artists]
            for col_name, col_type in [('profile_image_url','TEXT'),('author_account','TEXT'),('author_comment','TEXT'),('total_illusts','INTEGER'),('total_bookmarks','INTEGER'),('is_followed','INTEGER DEFAULT 0'),('twitter_account','TEXT'),('webpage','TEXT')]:
                if col_name not in artist_columns:
                    try: self.conn.execute(f"ALTER TABLE artists ADD COLUMN {col_name} {col_type}")
                    except: pass
            cur_meta = self.conn.execute("PRAGMA table_info(illust_metadata)").fetchall()
            meta_columns = [r[1] for r in cur_meta]
            for col_name, col_type in [('total_view','INTEGER DEFAULT 0'),('total_bookmarks','INTEGER DEFAULT 0'),('is_bookmarked','INTEGER DEFAULT 0'),('ai_type','INTEGER DEFAULT 1'),('ugoira_data','TEXT'),('tags_translated','TEXT')]:
                if col_name not in meta_columns:
                    try: self.conn.execute(f"ALTER TABLE illust_metadata ADD COLUMN {col_name} {col_type}")
                    except: pass
        except Exception as e:
            logger.error(f"数据库迁移失败: {e}")

    def upsert_artist(self, aid, name, profile_image_url=None, author_account=None, author_comment=None, total_illusts=None, total_bookmarks=None, is_followed=0, twitter_account=None, webpage=None, is_deleted=None, is_private_follow=None, is_temp_name=None):
        with self.conn:
            self.conn.execute("INSERT OR IGNORE INTO artists (author_id, author_name) VALUES (?, ?)", (aid, name))
            updates = ["author_name = ?"]
            params = [name]
            if profile_image_url is not None: updates.append("profile_image_url = ?"); params.append(profile_image_url)
            if author_account is not None: updates.append("author_account = ?"); params.append(author_account)
            if author_comment is not None: updates.append("author_comment = ?"); params.append(author_comment)
            if total_illusts is not None: updates.append("total_illusts = ?"); params.append(total_illusts)
            if total_bookmarks is not None: updates.append("total_bookmarks = ?"); params.append(total_bookmarks)
            if is_followed is not None: updates.append("is_followed = ?"); params.append(is_followed)
            if twitter_account is not None: updates.append("twitter_account = ?"); params.append(twitter_account)
            if webpage is not None: updates.append("webpage = ?"); params.append(webpage)
            if is_deleted is not None: updates.append("is_deleted = ?"); params.append(is_deleted)
            if is_private_follow is not None: updates.append("is_private_follow = ?"); params.append(is_private_follow)
            if is_temp_name is not None: updates.append("is_temp_name = ?"); params.append(is_temp_name)
            params.append(aid)
            self.conn.execute(f"UPDATE artists SET {', '.join(updates)} WHERE author_id = ?", params)

    def get_artist(self, aid):
        try:
            aid = int(aid) if aid is not None else 0
            res = self.conn.execute("SELECT author_id, author_name, last_synced_id FROM artists WHERE author_id = ?", (aid,)).fetchone()
            return res if res else (aid, "Unknown", 0)
        except Exception as e:
            return (aid if isinstance(aid, int) else 0, "Unknown", 0)

    def get_all_artists(self):
        return self.conn.execute("SELECT author_id, author_name, last_synced_id, last_sync_time FROM artists WHERE is_deleted IS NULL OR is_deleted = 0").fetchall()

    def get_ugoira_data(self, illust_id):
        res = self.conn.execute("SELECT ugoira_data FROM illust_metadata WHERE illust_id = ?", (illust_id,)).fetchone()
        return res[0] if res and res[0] else None

    def save_illust(self, data):
        with self.conn:
            if isinstance(data, dict):
                metadata_fields = ['illust_id','author_id','title','create_date','tags','x_restrict','is_r18','page_count','width','height','sanity_level','illust_type','series_id','series_title','tools','caption','total_view','total_bookmarks','is_bookmarked','ai_type','ugoira_data','tags_translated']
                metadata_values = {k: data.get(k) for k in metadata_fields if k in data}
                if 'illust_id' in metadata_values and metadata_values['illust_id'] is not None:
                    cols = list(metadata_values.keys())
                    vals = [metadata_values[k] for k in cols]
                    placeholders = ','.join(['?' for _ in cols])
                    update_clause = ', '.join([f"{k}=excluded.{k}" for k in cols if k != 'illust_id'])
                    try:
                        self.conn.execute(f"INSERT INTO illust_metadata ({','.join(cols)}) VALUES ({placeholders}) ON CONFLICT(illust_id) DO UPDATE SET {update_clause}", vals)
                    except sqlite3.OperationalError:
                        self.conn.execute(f"INSERT OR REPLACE INTO illust_metadata ({','.join(cols)}) VALUES ({placeholders})", vals)
                page_fields = ['task_key','illust_id','page_index','url','media_type']
                page_values = [data.get(k) for k in page_fields]
                self.conn.execute("INSERT OR IGNORE INTO illusts (task_key, illust_id, page_index, url, media_type, status) VALUES (?,?,?,?,?,0)", page_values)
            else:
                task_key, illust_id, page_index, author_id, title, url, media_type, meta = data
                self.conn.execute("INSERT OR IGNORE INTO illust_metadata (illust_id, author_id, title) VALUES (?,?,?)", (illust_id, author_id, title))
                self.conn.execute("INSERT OR IGNORE INTO illusts (task_key, illust_id, page_index, url, media_type, status) VALUES (?,?,?,?,?,0)", (task_key, illust_id, page_index, url, media_type))

    def get_pending_tasks(self, author_id=None, limit=None, max_attempts=None):
        query = """SELECT i.task_key, i.illust_id, i.page_index, m.author_id, m.title, i.url, i.media_type, m.create_date, m.tags, m.page_count
            FROM illusts i LEFT JOIN illust_metadata m ON i.illust_id = m.illust_id WHERE i.status IN (0, -1)"""
        params = []
        if max_attempts is not None: query += " AND (i.attempts IS NULL OR i.attempts < ?)"; params.append(max_attempts)
        if author_id: query += " AND m.author_id = ?"; params.append(author_id)
        if limit: query += f" LIMIT {limit}"
        return self.conn.execute(query, params).fetchall()

    def get_failed_tasks(self, author_id=None, attempts_lt=None, limit=None):
        query = """SELECT i.task_key, i.illust_id, i.page_index, m.author_id, m.title, i.url, i.media_type, m.create_date, m.tags, m.page_count, i.attempts, i.updated_at
            FROM illusts i LEFT JOIN illust_metadata m ON i.illust_id = m.illust_id WHERE i.status = -1"""
        params = []
        if author_id: query += " AND m.author_id = ?"; params.append(author_id)
        if attempts_lt is not None: query += " AND i.attempts < ?"; params.append(attempts_lt)
        query += " ORDER BY i.updated_at ASC"
        if limit: query += f" LIMIT {limit}"
        return self.conn.execute(query, params).fetchall()

    def export_failed_tasks_csv(self, out_path):
        import csv
        rows = self.get_failed_tasks()
        with open(out_path, 'w', newline='', encoding='utf-8') as f:
            w = csv.writer(f)
            w.writerow(['task_key','illust_id','page_index','author_id','title','url','media_type','create_date','tags','page_count','attempts','updated_at'])
            for r in rows: w.writerow(r)
        return out_path

    def reset_failed_tasks_by_filter(self):
        query = "SELECT i.task_key FROM illusts i LEFT JOIN illust_metadata m ON i.illust_id = m.illust_id WHERE i.status = -1"
        rows = self.conn.execute(query).fetchall()
        count = 0
        with self.conn:
            for (k,) in rows:
                self.conn.execute("UPDATE illusts SET status = 0, attempts = 0 WHERE task_key = ?", (k,))
                count += 1
        return count

    def mark_status(self, task_key, status):
        from datetime import datetime
        now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        with self.conn:
            if status == 1:
                self.conn.execute("UPDATE illusts SET status = ?, updated_at = ?, attempts = 0, download_date = ? WHERE task_key = ?", (status, now, now, task_key))
            else:
                self.conn.execute("UPDATE illusts SET status = ?, updated_at = ? WHERE task_key = ?", (status, now, task_key))

    def update_file_info(self, task_key, file_hash, file_size, original_filename=None, content_type=None):
        with self.conn:
            updates = ["file_hash = ?", "file_size = ?"]
            params = [file_hash, file_size]
            if original_filename is not None: updates.append("original_filename = ?"); params.append(original_filename)
            if content_type is not None: updates.append("content_type = ?"); params.append(content_type)
            params.append(task_key)
            self.conn.execute(f"UPDATE illusts SET {', '.join(updates)} WHERE task_key = ?", params)

    def find_by_hash(self, file_hash):
        return self.conn.execute("SELECT task_key, status, file_size FROM illusts WHERE file_hash = ? LIMIT 1", (file_hash,)).fetchone()

    def increment_attempts(self, task_key):
        with self.conn:
            self.conn.execute("UPDATE illusts SET attempts = COALESCE(attempts,0) + 1 WHERE task_key = ?", (task_key,))
            res = self.conn.execute("SELECT attempts FROM illusts WHERE task_key = ?", (task_key,)).fetchone()
            return res[0] if res else None

    def insert_alert(self, task_key, level, message):
        from datetime import datetime
        now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        with self.conn:
            self.conn.execute("INSERT INTO alerts (task_key, level, message, created_at) VALUES (?,?,?,?)", (task_key, level, message, now))

    def reset_stuck_tasks(self, hours):
        from datetime import datetime, timedelta
        cutoff = (datetime.now() - timedelta(hours=hours)).strftime("%Y-%m-%d %H:%M:%S")
        reclaimed = 0
        permanent = 0
        rows = self.conn.execute("SELECT task_key, attempts FROM illusts WHERE status = 2 AND updated_at IS NOT NULL AND updated_at <= ?", (cutoff,)).fetchall()
        max_attempts = 3
        try:
            from config import Config
            max_attempts = getattr(Config, 'MAX_ATTEMPTS', 3)
        except: pass
        with self.conn:
            for task_key, attempts in rows:
                attempts = attempts or 0
                if attempts >= max_attempts:
                    self.conn.execute("UPDATE illusts SET status = -1 WHERE task_key = ?", (task_key,))
                    self.insert_alert(task_key, 'ERROR', f'任务达到最大重试次数({attempts})并被标记为永久失败')
                    permanent += 1
                else:
                    self.conn.execute("UPDATE illusts SET status = 0 WHERE task_key = ?", (task_key,))
                    reclaimed += 1
        return {'reclaimed': reclaimed, 'permanent_failed': permanent}

    def close(self):
        if self.conn:
            self.conn.close()
