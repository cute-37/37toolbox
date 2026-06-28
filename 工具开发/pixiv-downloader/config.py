import os
import json
import logging

class Config:
    # --- 基础认证 ---
    REFRESH_TOKEN = ""

    # --- 多Token管理 ---
    TOKENS = {}
    MAIN_ACCOUNT = ""

    # --- 存储模式选择 ---
    STORAGE_MODE = "local"

    # --- 本地存储配置 ---
    LOCAL_SAVE_PATH = os.path.abspath("./downloads")
    LOCAL_TEMP_PATH = os.path.abspath("./temp")
    AVATARS_PATH = os.path.abspath("./avatars")

    # --- SMB/CIFS 网络共享配置 ---
    NAS_IP = "192.168.1.50"
    NAS_USER = ""
    NAS_PASS = ""
    NAS_SHARE = ""
    NAS_BASE_PATH = "PIXIV"
    NAS_REMOTE_NAME = ""

    # --- SFTP 配置 ---
    SFTP_HOST = ""
    SFTP_PORT = 22
    SFTP_USER = ""
    SFTP_PASS = ""
    SFTP_PRIVATE_KEY = ""
    SFTP_BASE_PATH = "PIXIV"

    # --- FTP/FTPS 配置 ---
    FTP_HOST = ""
    FTP_PORT = 21
    FTP_USER = ""
    FTP_PASS = ""
    FTP_BASE_PATH = "PIXIV"
    FTP_TLS = False

    # --- WebDAV 配置 ---
    WEBDAV_URL = ""
    WEBDAV_USER = ""
    WEBDAV_PASS = ""
    WEBDAV_BASE_PATH = "PIXIV"

    # --- S3 兼容对象存储配置 ---
    S3_ENDPOINT = ""
    S3_REGION = ""
    S3_BUCKET = ""
    S3_ACCESS_KEY = ""
    S3_SECRET_KEY = ""
    S3_PREFIX = "PIXIV"
    S3_FORCE_PATH_STYLE = True

    # --- 数据库与日志 ---
    DB_PATH = "./db/pixiv_manager.db"
    LOG_DIR = "./logs"

    # --- 命名规范 ---
    FOLDER_FORMAT = "[{author_id}] {author_name}"
    FILENAME_FORMAT = "{illust_id}_p{index}.{ext}"

    # --- 性能与风控 ---
    PROXIES = {}
    USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36"

    DOWNLOAD_THREADS = 4
    MAIN_ACCOUNT_SYNC_THREADS = 1
    BACKUP_ACCOUNT_SYNC_THREADS = 2
    MAIN_ACCOUNT_DOWNLOAD_THREADS = 1
    BACKUP_ACCOUNT_DOWNLOAD_THREADS = 2

    MAX_RETRIES = 3
    DELAY_SYNC = (1.5, 3.0)
    DELAY_DOWNLOAD = (0.8, 2.0)

    RATE_LIMIT_ENABLED = True
    RATE_LIMIT_RULES = {1000: 10, 100: 10}

    METADATA_REFRESH_LIMIT = 20
    IN_PROGRESS_TIMEOUT_HOURS = 6
    AUTO_CLEAN_TEMP_AFTER_DOWNLOAD = False
    TEMP_CLEAN_DAYS = 7
    MAX_ATTEMPTS = 3

    UGOIRA_OUTPUT = 'gif'

    HTTP_MAX_RETRIES = 3
    HTTP_BACKOFF_FACTOR = 0.5
    HTTP_STATUS_FORCELIST = [429, 500, 502, 503, 504]

    AUTO_THROTTLE_ENABLED = True
    FAILURE_RATE_THRESHOLD = 0.5
    FAILURE_RATE_WINDOW = 20
    FAILURE_PAUSE_SECONDS = 10

    HOST_CONCURRENCY = {'i.pximg.net': 4}
    DEFAULT_MAX_PER_HOST = 3

    LOG_JSON = False
    TESTING = False
    PROMETHEUS_ENABLED = False
    PROMETHEUS_PORT = 8000

    SETTINGS_FILE = "settings.json"

    @classmethod
    def load_settings(cls):
        if not os.path.exists(cls.SETTINGS_FILE):
            return
        try:
            with open(cls.SETTINGS_FILE, 'r', encoding='utf-8') as f:
                data = json.load(f)
            whitelist = [
                'REFRESH_TOKEN', 'TOKENS', 'MAIN_ACCOUNT', 'STORAGE_MODE', 'LOCAL_SAVE_PATH',
                'LOCAL_TEMP_PATH', 'AVATARS_PATH', 'DB_PATH', 'LOG_DIR',
                'NAS_IP', 'NAS_USER', 'NAS_PASS', 'NAS_SHARE', 'NAS_BASE_PATH', 'NAS_REMOTE_NAME',
                'SFTP_HOST', 'SFTP_PORT', 'SFTP_USER', 'SFTP_PASS', 'SFTP_PRIVATE_KEY', 'SFTP_BASE_PATH',
                'FTP_HOST', 'FTP_PORT', 'FTP_USER', 'FTP_PASS', 'FTP_BASE_PATH', 'FTP_TLS',
                'WEBDAV_URL', 'WEBDAV_USER', 'WEBDAV_PASS', 'WEBDAV_BASE_PATH',
                'S3_ENDPOINT', 'S3_REGION', 'S3_BUCKET', 'S3_ACCESS_KEY', 'S3_SECRET_KEY', 'S3_PREFIX', 'S3_FORCE_PATH_STYLE',
                'DOWNLOAD_THREADS', 'MAIN_ACCOUNT_SYNC_THREADS', 'BACKUP_ACCOUNT_SYNC_THREADS',
                'MAIN_ACCOUNT_DOWNLOAD_THREADS', 'BACKUP_ACCOUNT_DOWNLOAD_THREADS',
                'METADATA_REFRESH_LIMIT',
                'FAILURE_RATE_THRESHOLD', 'RATE_LIMIT_ENABLED'
            ]
            for k, v in data.get('current', {}).items():
                if k in whitelist:
                    setattr(cls, k, v)
        except Exception as e:
            print(f"加载配置文件失败: {e}")

    @classmethod
    def save_settings(cls):
        data = {}
        if os.path.exists(cls.SETTINGS_FILE):
            try:
                with open(cls.SETTINGS_FILE, 'r', encoding='utf-8') as f:
                    data = json.load(f)
            except: pass
        whitelist = [
            'REFRESH_TOKEN', 'TOKENS', 'MAIN_ACCOUNT', 'STORAGE_MODE', 'LOCAL_SAVE_PATH',
            'LOCAL_TEMP_PATH', 'AVATARS_PATH', 'DB_PATH', 'LOG_DIR',
            'NAS_IP', 'NAS_USER', 'NAS_PASS', 'NAS_SHARE', 'NAS_BASE_PATH', 'NAS_REMOTE_NAME',
            'SFTP_HOST', 'SFTP_PORT', 'SFTP_USER', 'SFTP_PASS', 'SFTP_PRIVATE_KEY', 'SFTP_BASE_PATH',
            'FTP_HOST', 'FTP_PORT', 'FTP_USER', 'FTP_PASS', 'FTP_BASE_PATH', 'FTP_TLS',
            'WEBDAV_URL', 'WEBDAV_USER', 'WEBDAV_PASS', 'WEBDAV_BASE_PATH',
            'S3_ENDPOINT', 'S3_REGION', 'S3_BUCKET', 'S3_ACCESS_KEY', 'S3_SECRET_KEY', 'S3_PREFIX', 'S3_FORCE_PATH_STYLE',
            'DOWNLOAD_THREADS', 'MAIN_ACCOUNT_SYNC_THREADS', 'BACKUP_ACCOUNT_SYNC_THREADS',
            'MAIN_ACCOUNT_DOWNLOAD_THREADS', 'BACKUP_ACCOUNT_DOWNLOAD_THREADS',
            'METADATA_REFRESH_LIMIT',
            'FAILURE_RATE_THRESHOLD', 'RATE_LIMIT_ENABLED'
        ]
        current_cfg = {k: getattr(cls, k) for k in whitelist if hasattr(cls, k)}
        data['current'] = current_cfg
        try:
            with open(cls.SETTINGS_FILE, 'w', encoding='utf-8') as f:
                json.dump(data, f, indent=4, ensure_ascii=False)
            print("配置已保存")
        except Exception as e:
            print(f"保存配置文件失败: {e}")

    @classmethod
    def save_preset(cls, name):
        if not os.path.exists(cls.SETTINGS_FILE):
             cls.save_settings()
        try:
            with open(cls.SETTINGS_FILE, 'r', encoding='utf-8') as f:
                data = json.load(f)
            whitelist = [
                'STORAGE_MODE', 'LOCAL_SAVE_PATH',
                'NAS_IP', 'NAS_USER', 'NAS_PASS', 'NAS_SHARE', 'NAS_BASE_PATH', 'NAS_REMOTE_NAME',
                'SFTP_HOST', 'SFTP_PORT', 'SFTP_USER', 'SFTP_PASS', 'SFTP_PRIVATE_KEY', 'SFTP_BASE_PATH',
                'FTP_HOST', 'FTP_PORT', 'FTP_USER', 'FTP_PASS', 'FTP_BASE_PATH', 'FTP_TLS',
                'WEBDAV_URL', 'WEBDAV_USER', 'WEBDAV_PASS', 'WEBDAV_BASE_PATH',
                'S3_ENDPOINT', 'S3_REGION', 'S3_BUCKET', 'S3_ACCESS_KEY', 'S3_SECRET_KEY', 'S3_PREFIX', 'S3_FORCE_PATH_STYLE'
            ]
            current_cfg = {k: getattr(cls, k) for k in whitelist if hasattr(cls, k)}
            presets = data.get('presets', {})
            presets[name] = current_cfg
            data['presets'] = presets
            with open(cls.SETTINGS_FILE, 'w', encoding='utf-8') as f:
                json.dump(data, f, indent=4, ensure_ascii=False)
            print(f"预设 '{name}' 已保存")
        except Exception as e:
            print(f"保存预设失败: {e}")

    @classmethod
    def load_preset(cls, name):
        try:
            with open(cls.SETTINGS_FILE, 'r', encoding='utf-8') as f:
                data = json.load(f)
            preset = data.get('presets', {}).get(name)
            if not preset:
                print(f"找不到预设: {name}")
                return False
            for k, v in preset.items():
                if hasattr(cls, k):
                    setattr(cls, k, v)
            return True
        except Exception as e:
            print(f"加载预设失败: {e}")
            return False

    @classmethod
    def list_presets(cls):
        try:
            if not os.path.exists(cls.SETTINGS_FILE):
                return []
            with open(cls.SETTINGS_FILE, 'r', encoding='utf-8') as f:
                data = json.load(f)
            return list(data.get('presets', {}).keys())
        except:
            return []

    @classmethod
    def add_token(cls, name, token, username="", user_id="", is_valid=True, remark=""):
        if not cls.TOKENS:
            cls.TOKENS = {}
        cls.TOKENS[name] = {"token": token, "username": username, "user_id": user_id, "last_tested": "", "is_valid": is_valid, "remark": remark}
        cls.save_settings()

    @classmethod
    def remove_token(cls, name):
        if name in cls.TOKENS:
            del cls.TOKENS[name]
            if cls.MAIN_ACCOUNT == name:
                cls.MAIN_ACCOUNT = ""
            cls.save_settings()

    @classmethod
    def set_main_account(cls, name):
        if name in cls.TOKENS:
            cls.MAIN_ACCOUNT = name
            cls.save_settings()

    @classmethod
    def get_main_token(cls):
        if cls.MAIN_ACCOUNT and cls.MAIN_ACCOUNT in cls.TOKENS:
            return cls.TOKENS[cls.MAIN_ACCOUNT]["token"]
        for name, info in cls.TOKENS.items():
            if info.get("is_valid", True):
                return info["token"]
        return ""

    @classmethod
    def get_backup_tokens(cls):
        tokens = []
        for name, info in cls.TOKENS.items():
            if name != cls.MAIN_ACCOUNT and info.get("is_valid", True):
                tokens.append(info["token"])
        return tokens

    @classmethod
    def get_all_valid_tokens(cls):
        return [info["token"] for info in cls.TOKENS.values() if info.get("is_valid", True)]

    @staticmethod
    def validate_connection(mode, local_path=None, nas_info=None):
        if mode == 'local':
            if not local_path: return False, "路径不能为空"
            try:
                if not os.path.exists(local_path):
                    os.makedirs(local_path, exist_ok=True)
                test_file = os.path.join(local_path, '.test_write')
                with open(test_file, 'w') as f: f.write('ok')
                os.remove(test_file)
                return True, "本地路径有效"
            except Exception as e:
                return False, f"本地路径无效: {e}"
        elif mode == 'smb':
            try:
                from smb.SMBConnection import SMBConnection
                if not nas_info: return False, "SMB/CIFS 信息缺失"
                conn = SMBConnection(nas_info.get('user'), nas_info.get('pass'), "PixivClient", nas_info.get('remote_name', 'Server'), use_ntlm_v2=True)
                if not conn.connect(nas_info.get('ip'), 445):
                    return False, "无法连接到 SMB/CIFS 服务器"
                try:
                    conn.listPath(nas_info.get('share'), "/")
                except Exception as e:
                    return False, f"连接成功但 Share 不存在: {e}"
                base_path = nas_info.get('base_path', '')
                if base_path:
                    base_path = base_path.replace("\\", "/")
                    if base_path.startswith("/"): base_path = base_path[1:]
                    parts = base_path.split("/")
                    curr = ""
                    for p in parts:
                        if not p: continue
                        curr += "/" + p
                        try:
                            conn.listPath(nas_info.get('share'), curr)
                        except:
                            try:
                                conn.createDirectory(nas_info.get('share'), curr)
                            except Exception as create_err:
                                return False, f"无法访问或创建路径 '{curr}': {create_err}"
                conn.close()
                return True, "SMB 连接测试成功"
            except ImportError:
                return False, "缺少 pysmb 库"
            except Exception as e:
                return False, f"SMB 连接错误: {e}"
        return False, "未知模式"

Config.load_settings()
