import os
import io
import logging
from pathlib import Path, PurePosixPath
from threading import Lock
from config import Config

logger = logging.getLogger("PixivDownloader")


REMOTE_MODES = {"smb", "sftp", "ftp", "ftps", "webdav", "s3"}


class StorageAdapter:
    def __init__(self):
        self.mode = str(Config.STORAGE_MODE or "local").lower()
        self.smb_conn = None
        self.smb_lock = Lock()
        self._sftp_client = None
        self._sftp_transport = None
        self._ftp_conn = None
        self._s3_client = None
        if self.mode == "smb":
            self._connect_smb()

    def is_remote(self):
        return self.mode in REMOTE_MODES

    def _remote_base_path(self):
        return {
            "smb": Config.NAS_BASE_PATH,
            "sftp": getattr(Config, "SFTP_BASE_PATH", "PIXIV"),
            "ftp": getattr(Config, "FTP_BASE_PATH", "PIXIV"),
            "ftps": getattr(Config, "FTP_BASE_PATH", "PIXIV"),
            "webdav": getattr(Config, "WEBDAV_BASE_PATH", "PIXIV"),
            "s3": getattr(Config, "S3_PREFIX", "PIXIV"),
        }.get(self.mode, "")

    def _remote_path(self, rel_path):
        raw_base = str(self._remote_base_path() or "").replace("\\", "/")
        is_absolute = raw_base.startswith("/")
        base = raw_base.strip("/")
        rel = str(rel_path or "").replace("\\", "/").strip("/")
        path = str(PurePosixPath(base) / rel) if base and rel else base or rel
        return f"/{path}" if is_absolute and path else path

    def _connect_smb(self):
        try:
            from smb.SMBConnection import SMBConnection

            if self.smb_conn:
                try:
                    self.smb_conn.close()
                except Exception:
                    pass
                self.smb_conn = None

            self.smb_conn = SMBConnection(
                Config.NAS_USER, Config.NAS_PASS, "PixivClient", Config.NAS_REMOTE_NAME, use_ntlm_v2=True
            )

            if not self.smb_conn.connect(Config.NAS_IP, 445):
                raise Exception("无法连接到 SMB/CIFS 服务器")

            try:
                self.smb_conn.listPath(Config.NAS_SHARE, Config.NAS_BASE_PATH)
            except Exception:
                try:
                    self.smb_conn.createDirectory(Config.NAS_SHARE, Config.NAS_BASE_PATH)
                except Exception as dir_err:
                    logger.warning(f"创建 SMB/CIFS 基础目录失败: {dir_err}")

        except Exception as e:
            logger.error(f"SMB/CIFS 连接失败: {e}")
            raise

    def _connect_sftp(self):
        if self._sftp_client:
            return self._sftp_client
        try:
            import paramiko
        except ImportError as e:
            raise ImportError("缺少 paramiko，无法使用 SFTP。请安装: pip install paramiko") from e

        transport = paramiko.Transport((Config.SFTP_HOST, int(Config.SFTP_PORT)))
        kwargs = {}
        if getattr(Config, "SFTP_PRIVATE_KEY", ""):
            kwargs["pkey"] = paramiko.RSAKey.from_private_key_file(Config.SFTP_PRIVATE_KEY)
        else:
            kwargs["password"] = Config.SFTP_PASS
        transport.connect(username=Config.SFTP_USER, **kwargs)
        self._sftp_transport = transport
        self._sftp_client = paramiko.SFTPClient.from_transport(transport)
        return self._sftp_client

    def _connect_ftp(self):
        if self._ftp_conn:
            return self._ftp_conn
        from ftplib import FTP, FTP_TLS

        cls = FTP_TLS if getattr(Config, "FTP_TLS", False) or self.mode == "ftps" else FTP
        conn = cls()
        conn.connect(Config.FTP_HOST, int(Config.FTP_PORT), timeout=30)
        conn.login(Config.FTP_USER, Config.FTP_PASS)
        if isinstance(conn, FTP_TLS):
            conn.prot_p()
        self._ftp_conn = conn
        return conn

    def _s3(self):
        if self._s3_client:
            return self._s3_client
        try:
            import boto3
            from botocore.config import Config as BotoConfig
        except ImportError as e:
            raise ImportError("缺少 boto3，无法使用 S3。请安装: pip install boto3") from e

        s3_config = BotoConfig(s3={"addressing_style": "path" if Config.S3_FORCE_PATH_STYLE else "auto"})
        self._s3_client = boto3.client(
            "s3",
            endpoint_url=Config.S3_ENDPOINT or None,
            region_name=Config.S3_REGION or None,
            aws_access_key_id=Config.S3_ACCESS_KEY,
            aws_secret_access_key=Config.S3_SECRET_KEY,
            config=s3_config,
        )
        return self._s3_client

    def _webdav_url(self, rel_path):
        root = str(Config.WEBDAV_URL or "").rstrip("/")
        path = self._remote_path(rel_path).strip("/")
        return f"{root}/{path}" if path else root

    def _webdav_url_for_remote_path(self, remote_path):
        root = str(Config.WEBDAV_URL or "").rstrip("/")
        path = str(remote_path or "").replace("\\", "/").strip("/")
        return f"{root}/{path}" if path else root

    def exists(self, rel_path):
        if self.mode == "local":
            return (Path(Config.LOCAL_SAVE_PATH) / rel_path).exists()
        if self.mode == "smb":
            full_path = self._remote_path(rel_path)
            try:
                with self.smb_lock:
                    self.smb_conn.getAttributes(Config.NAS_SHARE, full_path)
                return True
            except Exception:
                return False
        if self.mode == "sftp":
            try:
                self._connect_sftp().stat(self._remote_path(rel_path))
                return True
            except Exception:
                return False
        if self.mode in ("ftp", "ftps"):
            try:
                conn = self._connect_ftp()
                size = conn.size(self._remote_path(rel_path))
                return size is not None
            except Exception:
                return False
        if self.mode == "webdav":
            import requests
            res = requests.request("HEAD", self._webdav_url(rel_path), auth=(Config.WEBDAV_USER, Config.WEBDAV_PASS), timeout=30)
            return res.status_code in (200, 204)
        if self.mode == "s3":
            try:
                self._s3().head_object(Bucket=Config.S3_BUCKET, Key=self._remote_path(rel_path))
                return True
            except Exception:
                return False
        return False

    def makedirs(self, rel_path):
        if self.mode == "local":
            (Path(Config.LOCAL_SAVE_PATH) / rel_path).mkdir(parents=True, exist_ok=True)
            return
        if self.mode == "smb":
            full_path = self._remote_path(rel_path)
            parts = full_path.split("/")
            current = ""
            with self.smb_lock:
                for part in parts:
                    if not part:
                        continue
                    current += "/" + part
                    try:
                        self.smb_conn.listPath(Config.NAS_SHARE, current)
                    except Exception:
                        self.smb_conn.createDirectory(Config.NAS_SHARE, current)
            return
        if self.mode == "sftp":
            client = self._connect_sftp()
            remote_path = self._remote_path(rel_path)
            current = "/" if remote_path.startswith("/") else ""
            for part in remote_path.split("/"):
                if not part:
                    continue
                current = f"/{part}" if current == "/" else part if not current else f"{current}/{part}"
                try:
                    client.stat(current)
                except Exception:
                    client.mkdir(current)
            return
        if self.mode in ("ftp", "ftps"):
            conn = self._connect_ftp()
            remote_path = self._remote_path(rel_path)
            current = "/" if remote_path.startswith("/") else ""
            for part in remote_path.split("/"):
                if not part:
                    continue
                current = f"/{part}" if current == "/" else part if not current else f"{current}/{part}"
                try:
                    conn.mkd(current)
                except Exception:
                    pass
            return
        if self.mode == "webdav":
            import requests
            current = ""
            for part in self._remote_path(rel_path).split("/"):
                if not part:
                    continue
                current = f"{current}/{part}".strip("/")
                requests.request("MKCOL", self._webdav_url_for_remote_path(current), auth=(Config.WEBDAV_USER, Config.WEBDAV_PASS), timeout=30)

    def save(self, rel_path, data_bytes):
        if self.mode == "local":
            full_path = Path(Config.LOCAL_SAVE_PATH) / rel_path
            full_path.parent.mkdir(parents=True, exist_ok=True)
            with open(full_path, "wb") as f:
                f.write(data_bytes)
        else:
            local_path = self._write_local_temp(rel_path, data_bytes)
            self.upload_remote(local_path, rel_path)

    def _write_local_temp(self, rel_path, data_bytes):
        full_path = Path(Config.LOCAL_TEMP_PATH) / rel_path
        full_path.parent.mkdir(parents=True, exist_ok=True)
        with open(full_path, "wb") as f:
            f.write(data_bytes)
        return str(full_path)

    def save_atomic(self, rel_path, data_bytes):
        if self.mode == "local":
            full_path = Path(Config.LOCAL_SAVE_PATH) / rel_path
        else:
            full_path = Path(Config.LOCAL_TEMP_PATH) / rel_path
        temp_path = Path(str(full_path) + ".tmp")

        try:
            full_path.parent.mkdir(parents=True, exist_ok=True)
            with open(temp_path, "wb") as f:
                f.write(data_bytes)

            file_stat = temp_path.stat()
            if file_stat.st_size < 100:
                temp_path.unlink(missing_ok=True)
                raise Exception(f"文件过小 ({file_stat.st_size} bytes)，可能被拦截")

            temp_path.replace(full_path)
            if self.mode == "local":
                return True, str(full_path.relative_to(Config.LOCAL_SAVE_PATH))
            return True, str(full_path)
        except Exception as e:
            try:
                temp_path.unlink(missing_ok=True)
            except Exception:
                pass
            logger.error(f"保存文件失败 {rel_path}: {e}")
            raise e

    def get_file_size(self, rel_path):
        if self.mode == "local":
            path = Path(Config.LOCAL_SAVE_PATH) / rel_path
            return path.stat().st_size if path.exists() else 0
        if self.mode == "smb":
            try:
                with self.smb_lock:
                    attrs = self.smb_conn.getAttributes(Config.NAS_SHARE, self._remote_path(rel_path))
                return attrs.file_size
            except Exception:
                return 0
        if self.mode == "sftp":
            try:
                return self._connect_sftp().stat(self._remote_path(rel_path)).st_size
            except Exception:
                return 0
        if self.mode in ("ftp", "ftps"):
            try:
                return int(self._connect_ftp().size(self._remote_path(rel_path)) or 0)
            except Exception:
                return 0
        if self.mode == "webdav":
            import requests
            res = requests.request("HEAD", self._webdav_url(rel_path), auth=(Config.WEBDAV_USER, Config.WEBDAV_PASS), timeout=30)
            return int(res.headers.get("Content-Length", "0")) if res.status_code in (200, 204) else 0
        if self.mode == "s3":
            try:
                return int(self._s3().head_object(Bucket=Config.S3_BUCKET, Key=self._remote_path(rel_path)).get("ContentLength", 0))
            except Exception:
                return 0
        return 0

    def get_artist_folder(self, aid, name):
        new_folder_name = Config.FOLDER_FORMAT.format(author_id=aid, author_name=name)

        if self.mode == "local":
            base = Path(Config.LOCAL_SAVE_PATH)
            base.mkdir(parents=True, exist_ok=True)
            for folder in base.iterdir():
                if folder.is_dir() and folder.name.startswith(f"[{aid}]"):
                    if folder.name != new_folder_name:
                        folder.rename(base / new_folder_name)
                    return new_folder_name
            return new_folder_name

        if self.mode == "smb":
            try:
                with self.smb_lock:
                    files = self.smb_conn.listPath(Config.NAS_SHARE, Config.NAS_BASE_PATH)
                    for f in files:
                        if f.isDirectory and f.filename.startswith(f"[{aid}]"):
                            if f.filename != new_folder_name:
                                old = f"{Config.NAS_BASE_PATH}/{f.filename}"
                                new = f"{Config.NAS_BASE_PATH}/{new_folder_name}"
                                self.smb_conn.rename(Config.NAS_SHARE, old, new)
                            return new_folder_name
            except Exception:
                pass
        return new_folder_name

    def upload_remote(self, local_file_path, rel_path):
        if self.mode == "local":
            return True
        if self.mode == "smb":
            return self.upload_to_smb(local_file_path, rel_path)

        remote_path = self._remote_path(rel_path)
        rel_dir = str(PurePosixPath(str(rel_path).replace("\\", "/")).parent)
        if rel_dir and rel_dir != ".":
            self.makedirs(rel_dir)

        if self.mode == "sftp":
            self._connect_sftp().put(local_file_path, remote_path)
            return True
        if self.mode in ("ftp", "ftps"):
            conn = self._connect_ftp()
            with open(local_file_path, "rb") as f:
                conn.storbinary(f"STOR {remote_path}", f)
            return True
        if self.mode == "webdav":
            import requests
            with open(local_file_path, "rb") as f:
                res = requests.put(self._webdav_url(rel_path), data=f, auth=(Config.WEBDAV_USER, Config.WEBDAV_PASS), timeout=120)
            if res.status_code not in (200, 201, 204):
                raise Exception(f"WebDAV 上传失败: HTTP {res.status_code} {res.text[:200]}")
            return True
        if self.mode == "s3":
            self._s3().upload_file(local_file_path, Config.S3_BUCKET, remote_path)
            return True
        raise Exception(f"未知存储协议: {self.mode}")

    def upload_to_smb(self, local_file_path, rel_path):
        if self.mode == "local":
            return True

        full_path = self._remote_path(rel_path)

        try:
            with open(local_file_path, "rb") as f:
                file_data = f.read()

            if len(file_data) < 100:
                raise Exception(f"本地文件过小 ({len(file_data)} bytes)")

            try:
                from interrupt import is_set as interrupt_is_set
                if interrupt_is_set():
                    raise Exception("上传被中断")
            except Exception:
                raise Exception("上传被中断")

            attempts = 0
            max_attempts = 3
            import time, socket
            while attempts < max_attempts:
                try:
                    file_obj = io.BytesIO(file_data)
                    with self.smb_lock:
                        try:
                            if not self.smb_conn:
                                self._connect_smb()
                            self.smb_conn.getAttributes(Config.NAS_SHARE, Config.NAS_BASE_PATH)
                        except Exception:
                            try:
                                self._connect_smb()
                            except Exception:
                                pass
                        self.smb_conn.storeFile(Config.NAS_SHARE, full_path, file_obj)
                    return True
                except Exception as e:
                    attempts += 1
                    error_msg = str(e).lower()

                    if 'transaction' in error_msg or 'commit' in error_msg or 'active' in error_msg:
                        try:
                            self._connect_smb()
                        except Exception:
                            pass
                    elif isinstance(e, socket.error) or 'connection' in error_msg or 'aborted' in error_msg:
                        try:
                            self._connect_smb()
                        except Exception:
                            pass

                    if attempts < max_attempts:
                        time.sleep(1 * attempts)
                        continue
                    raise Exception(f"SMB/CIFS 上传失败: {e}")

            raise Exception(f"SMB/CIFS 上传失败: 超过最大尝试次数 ({max_attempts})")
        except Exception as e:
            raise Exception(f"SMB/CIFS 上传失败: {e}")
