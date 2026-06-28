"""
Pixiv 下载器 Electron 桥接脚本。
接收 JSON 命令，执行操作，输出 JSON 行到 stdout 供 Electron 读取。
用法: python bridge.py <command> [args...]
或:    python bridge.py --pipe  (从 stdin 逐行读取 JSON 命令)
"""

import sys
import os
import json
import traceback
import signal
import shutil

# 确保可以导入同目录模块
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

# ---------- 全局停止标志 ----------
_stop_requested = False

def signal_handler(sig, frame):
    global _stop_requested
    _stop_requested = True
    emit({"type": "cancelled", "message": "收到停止信号"})

signal.signal(signal.SIGINT, signal_handler)
signal.signal(signal.SIGTERM, signal_handler)


def emit(obj: dict):
    """向 Electron 主进程发送一条 JSON 消息。"""
    sys.stdout.write(json.dumps(obj, ensure_ascii=False, default=str) + "\n")
    sys.stdout.flush()


def load_config():
    """加载配置。优先读 settings.json，fallback 到 config.py 默认值。"""
    from config import Config
    Config.load_settings()
    return Config


def get_storage_display_path(Config):
    mode = str(getattr(Config, 'STORAGE_MODE', 'local')).lower()
    if mode == "local":
        return Config.LOCAL_SAVE_PATH
    if mode == "smb":
        return f"//{Config.NAS_IP}/{Config.NAS_SHARE}/{Config.NAS_BASE_PATH}"
    if mode == "sftp":
        return f"sftp://{Config.SFTP_HOST}/{Config.SFTP_BASE_PATH}"
    if mode in ("ftp", "ftps"):
        scheme = "ftps" if getattr(Config, 'FTP_TLS', False) or mode == "ftps" else "ftp"
        return f"{scheme}://{Config.FTP_HOST}/{Config.FTP_BASE_PATH}"
    if mode == "webdav":
        base = str(getattr(Config, 'WEBDAV_URL', '')).rstrip("/")
        path = str(getattr(Config, 'WEBDAV_BASE_PATH', '')).strip("/")
        return f"{base}/{path}" if path else base
    if mode == "s3":
        prefix = str(getattr(Config, 'S3_PREFIX', '')).strip("/")
        return f"s3://{Config.S3_BUCKET}/{prefix}" if prefix else f"s3://{Config.S3_BUCKET}"
    return mode


def cmd_status():
    """返回当前状态摘要。"""
    try:
        from config import Config
        Config.load_settings()
        from db_manager_v2 import Database
        db = Database(Config.DB_PATH)
        cur = db.conn.cursor()
        artists = cur.execute("SELECT count(*) FROM artists").fetchone()[0]
        illusts = cur.execute("SELECT count(*) FROM illusts").fetchone()[0]
        done = cur.execute("SELECT count(*) FROM illusts WHERE status=1").fetchone()[0]
        pending = cur.execute("SELECT count(*) FROM illusts WHERE status=0").fetchone()[0]
        failed = cur.execute("SELECT count(*) FROM illusts WHERE status=-1").fetchone()[0]
        db.close()

        accounts = []
        if Config.TOKENS:
            for name, info in Config.TOKENS.items():
                accounts.append({
                    "name": name,
                    "username": info.get("username", ""),
                    "isMain": name == Config.MAIN_ACCOUNT,
                    "isValid": info.get("is_valid", True),
                    "remark": info.get("remark", ""),
                })

        emit({
            "type": "status",
            "ok": True,
            "data": {
                "artists": artists,
                "illusts": illusts,
                "done": done,
                "pending": pending,
                "failed": failed,
                "accounts": accounts,
                "storageMode": Config.STORAGE_MODE,
                "savePath": get_storage_display_path(Config),
                "mainAccount": Config.MAIN_ACCOUNT,
            }
        })
    except Exception as e:
        emit({"type": "status", "ok": False, "error": str(e)})


def cmd_config_get():
    """返回当前所有可视配置项。"""
    try:
        from config import Config
        Config.load_settings()
        emit({
            "type": "config",
            "ok": True,
            "data": {
                "storageMode": Config.STORAGE_MODE,
                "localSavePath": Config.LOCAL_SAVE_PATH,
                "dbPath": Config.DB_PATH,
                "logDir": Config.LOG_DIR,
                "tempPath": Config.LOCAL_TEMP_PATH,
                "avatarsPath": Config.AVATARS_PATH,
                "nasIp": Config.NAS_IP,
                "nasUser": Config.NAS_USER,
                "nasPass": getattr(Config, 'NAS_PASS', ''),
                "nasShare": Config.NAS_SHARE,
                "nasBasePath": Config.NAS_BASE_PATH,
                "nasRemoteName": Config.NAS_REMOTE_NAME,
                "sftpHost": getattr(Config, 'SFTP_HOST', ''),
                "sftpPort": getattr(Config, 'SFTP_PORT', 22),
                "sftpUser": getattr(Config, 'SFTP_USER', ''),
                "sftpPass": getattr(Config, 'SFTP_PASS', ''),
                "sftpPrivateKey": getattr(Config, 'SFTP_PRIVATE_KEY', ''),
                "sftpBasePath": getattr(Config, 'SFTP_BASE_PATH', 'PIXIV'),
                "ftpHost": getattr(Config, 'FTP_HOST', ''),
                "ftpPort": getattr(Config, 'FTP_PORT', 21),
                "ftpUser": getattr(Config, 'FTP_USER', ''),
                "ftpPass": getattr(Config, 'FTP_PASS', ''),
                "ftpBasePath": getattr(Config, 'FTP_BASE_PATH', 'PIXIV'),
                "ftpTls": getattr(Config, 'FTP_TLS', False),
                "webdavUrl": getattr(Config, 'WEBDAV_URL', ''),
                "webdavUser": getattr(Config, 'WEBDAV_USER', ''),
                "webdavPass": getattr(Config, 'WEBDAV_PASS', ''),
                "webdavBasePath": getattr(Config, 'WEBDAV_BASE_PATH', 'PIXIV'),
                "s3Endpoint": getattr(Config, 'S3_ENDPOINT', ''),
                "s3Region": getattr(Config, 'S3_REGION', ''),
                "s3Bucket": getattr(Config, 'S3_BUCKET', ''),
                "s3AccessKey": getattr(Config, 'S3_ACCESS_KEY', ''),
                "s3SecretKey": getattr(Config, 'S3_SECRET_KEY', ''),
                "s3Prefix": getattr(Config, 'S3_PREFIX', 'PIXIV'),
                "s3ForcePathStyle": getattr(Config, 'S3_FORCE_PATH_STYLE', True),
                "downloadThreads": Config.DOWNLOAD_THREADS,
                "mainAccountSyncThreads": getattr(Config, 'MAIN_ACCOUNT_SYNC_THREADS', 1),
                "backupAccountSyncThreads": getattr(Config, 'BACKUP_ACCOUNT_SYNC_THREADS', 2),
                "mainAccountDownloadThreads": getattr(Config, 'MAIN_ACCOUNT_DOWNLOAD_THREADS', 1),
                "backupAccountDownloadThreads": getattr(Config, 'BACKUP_ACCOUNT_DOWNLOAD_THREADS', 2),
                "metadataRefreshLimit": getattr(Config, 'METADATA_REFRESH_LIMIT', 20),
                "ugoiraOutput": Config.UGOIRA_OUTPUT,
                "rateLimitEnabled": getattr(Config, 'RATE_LIMIT_ENABLED', True),
                "failureRateThreshold": getattr(Config, 'FAILURE_RATE_THRESHOLD', 0.5),
                "autoThrottleEnabled": Config.AUTO_THROTTLE_ENABLED,
            }
        })
    except Exception as e:
        emit({"type": "config", "ok": False, "error": str(e)})


def cmd_config_set(data: dict):
    """更新指定配置项并保存。"""
    try:
        from config import Config
        Config.load_settings()

        whitelist = [
            'storageMode', 'localSavePath', 'dbPath', 'logDir', 'tempPath', 'avatarsPath',
            'nasIp', 'nasUser', 'nasPass', 'nasShare', 'nasBasePath',
            'nasRemoteName', 'downloadThreads', 'mainAccountSyncThreads', 'backupAccountSyncThreads',
            'sftpHost', 'sftpPort', 'sftpUser', 'sftpPass', 'sftpPrivateKey', 'sftpBasePath',
            'ftpHost', 'ftpPort', 'ftpUser', 'ftpPass', 'ftpBasePath', 'ftpTls',
            'webdavUrl', 'webdavUser', 'webdavPass', 'webdavBasePath',
            's3Endpoint', 's3Region', 's3Bucket', 's3AccessKey', 's3SecretKey', 's3Prefix', 's3ForcePathStyle',
            'mainAccountDownloadThreads', 'backupAccountDownloadThreads', 'metadataRefreshLimit',
            'ugoiraOutput', 'rateLimitEnabled', 'failureRateThreshold', 'autoThrottleEnabled',
        ]

        attr_map = {
            'storageMode': 'STORAGE_MODE',
            'localSavePath': 'LOCAL_SAVE_PATH',
            'dbPath': 'DB_PATH',
            'logDir': 'LOG_DIR',
            'tempPath': 'LOCAL_TEMP_PATH',
            'avatarsPath': 'AVATARS_PATH',
            'nasIp': 'NAS_IP',
            'nasUser': 'NAS_USER',
            'nasPass': 'NAS_PASS',
            'nasShare': 'NAS_SHARE',
            'nasBasePath': 'NAS_BASE_PATH',
            'nasRemoteName': 'NAS_REMOTE_NAME',
            'sftpHost': 'SFTP_HOST',
            'sftpPort': 'SFTP_PORT',
            'sftpUser': 'SFTP_USER',
            'sftpPass': 'SFTP_PASS',
            'sftpPrivateKey': 'SFTP_PRIVATE_KEY',
            'sftpBasePath': 'SFTP_BASE_PATH',
            'ftpHost': 'FTP_HOST',
            'ftpPort': 'FTP_PORT',
            'ftpUser': 'FTP_USER',
            'ftpPass': 'FTP_PASS',
            'ftpBasePath': 'FTP_BASE_PATH',
            'ftpTls': 'FTP_TLS',
            'webdavUrl': 'WEBDAV_URL',
            'webdavUser': 'WEBDAV_USER',
            'webdavPass': 'WEBDAV_PASS',
            'webdavBasePath': 'WEBDAV_BASE_PATH',
            's3Endpoint': 'S3_ENDPOINT',
            's3Region': 'S3_REGION',
            's3Bucket': 'S3_BUCKET',
            's3AccessKey': 'S3_ACCESS_KEY',
            's3SecretKey': 'S3_SECRET_KEY',
            's3Prefix': 'S3_PREFIX',
            's3ForcePathStyle': 'S3_FORCE_PATH_STYLE',
            'downloadThreads': 'DOWNLOAD_THREADS',
            'mainAccountSyncThreads': 'MAIN_ACCOUNT_SYNC_THREADS',
            'backupAccountSyncThreads': 'BACKUP_ACCOUNT_SYNC_THREADS',
            'mainAccountDownloadThreads': 'MAIN_ACCOUNT_DOWNLOAD_THREADS',
            'backupAccountDownloadThreads': 'BACKUP_ACCOUNT_DOWNLOAD_THREADS',
            'metadataRefreshLimit': 'METADATA_REFRESH_LIMIT',
            'ugoiraOutput': 'UGOIRA_OUTPUT',
            'rateLimitEnabled': 'RATE_LIMIT_ENABLED',
            'failureRateThreshold': 'FAILURE_RATE_THRESHOLD',
            'autoThrottleEnabled': 'AUTO_THROTTLE_ENABLED',
        }

        for key, value in data.items():
            if key in whitelist and key in attr_map:
                setattr(Config, attr_map[key], value)

        Config.save_settings()
        emit({"type": "config_saved", "ok": True})
    except Exception as e:
        emit({"type": "config_saved", "ok": False, "error": str(e)})


def cmd_validate_path(path: str):
    """验证本地路径是否可写。"""
    try:
        from config import Config
        ok, msg = Config.validate_connection('local', local_path=path)
        emit({"type": "validate", "ok": ok, "message": msg})
    except Exception as e:
        emit({"type": "validate", "ok": False, "message": str(e)})


def cmd_sync(deep: bool = False, artist_id: int = None):
    """执行同步。"""
    global _stop_requested
    _stop_requested = False
    try:
        from processor import Processor
        pro = Processor()

        # Monkey-patch print 来捕获进度
        import builtins
        original_print = builtins.print

        def progress_print(*args, **kwargs):
            msg = " ".join(str(a) for a in args)
            # 过滤掉空行
            if msg.strip():
                emit({"type": "progress", "message": msg})
            if _stop_requested:
                pro.stop_event.set()
            original_print(*args, **kwargs)

        builtins.print = progress_print

        try:
            if artist_id:
                pro.sync(aid=artist_id, deep=True)
            else:
                pro.sync(deep=deep)
            if _stop_requested:
                emit({"type": "sync_complete", "ok": False, "message": "同步已停止"})
                return False
            emit({"type": "sync_complete", "ok": True, "message": "同步完成"})
            return True
        finally:
            builtins.print = original_print

    except Exception as e:
        emit({"type": "sync_complete", "ok": False, "error": str(e), "trace": traceback.format_exc()})
        return False


def cmd_download(artist_id: int = None, limit: int = None):
    """执行下载。"""
    global _stop_requested
    _stop_requested = False
    try:
        from processor import Processor
        pro = Processor()

        import builtins
        original_print = builtins.print

        def progress_print(*args, **kwargs):
            msg = " ".join(str(a) for a in args)
            if msg.strip():
                emit({"type": "progress", "message": msg})
            if _stop_requested:
                pro.stop_event.set()
            original_print(*args, **kwargs)

        builtins.print = progress_print

        try:
            pro.download(aid=artist_id, limit=limit)
            if _stop_requested:
                emit({"type": "download_complete", "ok": False, "message": "下载已停止"})
                return False
            emit({"type": "download_complete", "ok": True, "message": "下载完成"})
            return True
        finally:
            builtins.print = original_print

    except Exception as e:
        emit({"type": "download_complete", "ok": False, "error": str(e), "trace": traceback.format_exc()})
        return False


def cmd_sync_and_download(deep: bool = False, limit: int = None):
    """先同步再下载。"""
    sync_ok = cmd_sync(deep=deep)
    if sync_ok and not _stop_requested:
        return cmd_download(limit=limit)
    emit({"type": "download_complete", "ok": False, "message": "同步未完成，已跳过下载"})
    return False


def cmd_get_token():
    """生成 PKCE 授权 URL，返回给前端让用户在浏览器中完成认证。"""
    try:
        from token_manager import PixivTokenManager
        tm = PixivTokenManager()
        verifier, challenge = tm.generate_pkce_challenge()
        auth_url = tm.get_auth_url(challenge)
        emit({
            "type": "token_url",
            "ok": True,
            "data": {
                "url": auth_url,
                "verifier": verifier,
            }
        })
    except Exception as e:
        emit({"type": "token_url", "ok": False, "error": str(e)})


def cmd_exchange_token(code: str, verifier: str, account_name: str = "", remark: str = ""):
    """用授权码换取 refresh_token 并保存。"""
    try:
        from token_manager import PixivTokenManager
        tm = PixivTokenManager()
        result = tm.exchange_code_for_token(code, verifier)
        if "error" in result:
            emit({"type": "token_result", "ok": False, "error": result.get("message", str(result))})
            return

        refresh_token = result.get("refresh_token", "")
        if not refresh_token:
            emit({"type": "token_result", "ok": False, "error": "未获取到 refresh_token"})
            return

        from config import Config
        Config.load_settings()

        # 用 token 获取用户信息
        from pixivpy3 import AppPixivAPI
        api = AppPixivAPI()
        api.auth(refresh_token=refresh_token)
        username = ""
        user_id = ""
        try:
            detail = api.user_detail(api.user_id)
            if detail and 'user' in detail:
                username = detail['user'].get('name', '')
                user_id = str(detail['user'].get('id', ''))
        except:
            pass

        name = account_name or f"account_{len(Config.TOKENS) + 1}"
        Config.add_token(name, refresh_token, username=username, user_id=user_id, remark=remark)

        # 如果没有主账号，设为首个
        if not Config.MAIN_ACCOUNT:
            Config.set_main_account(name)

        emit({
            "type": "token_result",
            "ok": True,
            "data": {
                "name": name,
                "username": username,
                "userId": user_id,
            }
        })
    except Exception as e:
        emit({"type": "token_result", "ok": False, "error": str(e)})


def cmd_test_tokens():
    """测试所有 token 可用性。"""
    try:
        from token_manager import test_all_tokens
        test_all_tokens()
        emit({"type": "token_test_done", "ok": True})
    except Exception as e:
        emit({"type": "token_test_done", "ok": False, "error": str(e)})


def cmd_remove_token(name: str):
    """删除指定账号。"""
    try:
        from config import Config
        Config.load_settings()
        Config.remove_token(name)
        emit({"type": "token_removed", "ok": True, "name": name})
    except Exception as e:
        emit({"type": "token_removed", "ok": False, "error": str(e)})


def cmd_set_main_account(name: str):
    """设置主账号。"""
    try:
        from config import Config
        Config.load_settings()
        Config.set_main_account(name)
        emit({"type": "account_set", "ok": True})
    except Exception as e:
        emit({"type": "account_set", "ok": False, "error": str(e)})


def cmd_db_stats():
    """返回数据库统计。"""
    try:
        from config import Config
        from db_manager_v2 import Database
        Config.load_settings()
        db = Database(Config.DB_PATH)
        cur = db.conn.cursor()
        a = cur.execute("SELECT count(*) FROM artists").fetchone()[0]
        i = cur.execute("SELECT count(*) FROM illusts").fetchone()[0]
        d = cur.execute("SELECT count(*) FROM illusts WHERE status=1").fetchone()[0]
        p = cur.execute("SELECT count(*) FROM illusts WHERE status=0").fetchone()[0]
        f = cur.execute("SELECT count(*) FROM illusts WHERE status=-1").fetchone()[0]
        db.close()
        emit({"type": "db_stats", "ok": True, "data": {"artists": a, "illusts": i, "done": d, "pending": p, "failed": f}})
    except Exception as e:
        emit({"type": "db_stats", "ok": False, "error": str(e)})


def ensure_parent_dir(path: str):
    parent = os.path.dirname(os.path.abspath(path))
    if parent:
        os.makedirs(parent, exist_ok=True)


def copy_file_result(source: str, target: str, action: str):
    if not source or not target:
        emit({"type": "data_result", "ok": False, "action": action, "error": "源路径或目标路径不能为空"})
        return
    if not os.path.exists(source):
        emit({"type": "data_result", "ok": False, "action": action, "error": f"源文件不存在: {source}"})
        return
    ensure_parent_dir(target)
    shutil.copy2(source, target)
    emit({"type": "data_result", "ok": True, "action": action, "path": target})


def cmd_db_export(path: str):
    """导出当前 SQLite 数据库文件。"""
    try:
        from config import Config
        Config.load_settings()
        copy_file_result(Config.DB_PATH, path, "db:export")
    except Exception as e:
        emit({"type": "data_result", "ok": False, "action": "db:export", "error": str(e)})


def cmd_db_import(path: str):
    """用外部 SQLite 文件替换当前数据库。"""
    try:
        from config import Config
        Config.load_settings()
        copy_file_result(path, Config.DB_PATH, "db:import")
    except Exception as e:
        emit({"type": "data_result", "ok": False, "action": "db:import", "error": str(e)})


def cmd_db_backup(path: str):
    """备份当前 SQLite 数据库文件。"""
    try:
        from config import Config
        Config.load_settings()
        copy_file_result(Config.DB_PATH, path, "db:backup")
    except Exception as e:
        emit({"type": "data_result", "ok": False, "action": "db:backup", "error": str(e)})


def cmd_settings_export(path: str):
    """导出 Pixiv 下载器 settings.json。"""
    try:
        from config import Config
        Config.load_settings()
        if not os.path.exists(Config.SETTINGS_FILE):
            Config.save_settings()
        copy_file_result(Config.SETTINGS_FILE, path, "settings:export")
    except Exception as e:
        emit({"type": "data_result", "ok": False, "action": "settings:export", "error": str(e)})


def cmd_settings_import(path: str):
    """导入 Pixiv 下载器 settings.json。"""
    try:
        from config import Config
        copy_file_result(path, Config.SETTINGS_FILE, "settings:import")
        Config.load_settings()
    except Exception as e:
        emit({"type": "data_result", "ok": False, "action": "settings:import", "error": str(e)})


def cmd_preview(limit: int = 20):
    """预览待处理任务。"""
    try:
        from processor import Processor
        pro = Processor()
        res = pro.preview_pending(limit=limit)
        emit({"type": "preview", "ok": True, "data": res if res else []})
    except Exception as e:
        emit({"type": "preview", "ok": False, "error": str(e)})


def cmd_retry_failed():
    """重置失败任务。"""
    try:
        from processor import Processor
        pro = Processor()
        n = pro.retry_failed_tasks()
        emit({"type": "retry_done", "ok": True, "count": n})
    except Exception as e:
        emit({"type": "retry_done", "ok": False, "error": str(e)})


def cmd_stop():
    """请求停止当前操作。"""
    global _stop_requested
    _stop_requested = True
    emit({"type": "stop_ack"})


# ---------- 命令路由 ----------
COMMANDS = {
    "status": cmd_status,
    "config:get": cmd_config_get,
    "config:set": lambda **data: cmd_config_set(data),
    "validate:path": lambda path: cmd_validate_path(path),
    "sync": lambda deep=False, aid=None: cmd_sync(deep=deep, artist_id=aid),
    "download": lambda limit=None, aid=None: cmd_download(artist_id=aid, limit=limit),
    "sync-and-download": lambda deep=False, limit=None: cmd_sync_and_download(deep=deep, limit=limit),
    "token:url": cmd_get_token,
    "token:exchange": lambda code, verifier, name="", remark="": cmd_exchange_token(code, verifier, name, remark),
    "token:test": cmd_test_tokens,
    "token:remove": lambda name: cmd_remove_token(name),
    "account:set-main": lambda name: cmd_set_main_account(name),
    "db:stats": cmd_db_stats,
    "db:export": lambda path: cmd_db_export(path),
    "db:import": lambda path: cmd_db_import(path),
    "db:backup": lambda path: cmd_db_backup(path),
    "settings:export": lambda path: cmd_settings_export(path),
    "settings:import": lambda path: cmd_settings_import(path),
    "preview": lambda limit=20: cmd_preview(limit),
    "retry": cmd_retry_failed,
    "stop": cmd_stop,
}


def handle_cmd(cmd: dict):
    """处理单条命令。"""
    action = cmd.get("action", "")
    handler = COMMANDS.get(action)
    if not handler:
        emit({"type": "error", "error": f"未知命令: {action}"})
        return

    args = cmd.get("args", {})
    try:
        if isinstance(args, dict):
            handler(**args)
        else:
            handler(args)
    except TypeError:
        emit({"type": "error", "error": f"命令参数错误: {action}"})
    except Exception as e:
        emit({"type": "error", "error": str(e), "trace": traceback.format_exc()})


if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "--pipe":
        # 管道模式：从 stdin 逐行读取 JSON 命令
        emit({"type": "ready"})
        for line in sys.stdin:
            line = line.strip()
            if not line:
                continue
            try:
                cmd = json.loads(line)
                handle_cmd(cmd)
            except json.JSONDecodeError:
                emit({"type": "error", "error": "命令 JSON 解析失败"})
    elif len(sys.argv) > 1:
        # 单命令模式
        try:
            cmd = json.loads(sys.argv[1])
            handle_cmd(cmd)
        except json.JSONDecodeError:
            emit({"type": "error", "error": "命令 JSON 解析失败"})
    else:
        emit({"type": "ready"})
        emit({"type": "error", "error": "用法: python bridge.py '{\"action\":\"status\"}'  或  python bridge.py --pipe"})
