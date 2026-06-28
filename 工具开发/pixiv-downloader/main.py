import os, sys, logging
from datetime import datetime
from processor import Processor
from config import Config

_cached_following_count = None

def setup_log():
    if not os.path.exists(Config.LOG_DIR): os.makedirs(Config.LOG_DIR)
    log_file = os.path.join(Config.LOG_DIR, f"{datetime.now().strftime('%Y%m%d_%H%M%S')}.log")
    logger = logging.getLogger("PixivDownloader")
    logger.setLevel(logging.INFO)
    if getattr(Config, 'LOG_JSON', False):
        class JSONFormatter(logging.Formatter):
            def format(self, record):
                import json
                rec = {"ts": datetime.now().strftime("%Y-%m-%dT%H:%M:%S.%fZ"), "level": record.levelname, "msg": record.getMessage()}
                if record.exc_info: rec["exc"] = self.formatException(record.exc_info)
                return json.dumps(rec, ensure_ascii=False)
        fmt = JSONFormatter()
        fh = logging.FileHandler(log_file, encoding="utf-8")
        fh.setFormatter(fmt)
        sh = logging.StreamHandler()
        sh.setFormatter(fmt)
    else:
        fh = logging.FileHandler(log_file, encoding="utf-8")
        fh.setFormatter(logging.Formatter('%(asctime)s [%(levelname)s] %(message)s'))
        sh = logging.StreamHandler()
        sh.setFormatter(logging.Formatter('%(message)s'))
    logger.addHandler(fh)
    logger.addHandler(sh)
    return logger

if __name__ == "__main__":
    logger = setup_log()
    Config.load_settings()

    if not Config.REFRESH_TOKEN or Config.REFRESH_TOKEN.strip() == "":
        if not Config.TOKENS:
            print("\n⚠️  检测到未设置 Pixiv Token，请先完成认证设置。")
            from token_manager import get_new_token_flow
            if not get_new_token_flow():
                print("\n❌ Token获取失败，程序退出。")
                sys.exit(1)
            print("\n✅ Token设置完成！")

    try:
        pro = Processor()
        if Config.TOKENS:
            print("🔍 正在测试账号可用性...")
            from token_manager import test_all_tokens
            test_all_tokens()
            print()
    except Exception as e:
        logger.error(f"启动失败: {e}")
        sys.exit(1)

    while True:
        print(f"\n{'='*60}")
        print(f"              Pixiv 下载管理器 v1.3.0")
        print(f"{'='*60}")
        if Config.STORAGE_MODE.lower() == 'smb':
            save_path = f"\\\\{Config.NAS_IP}\\{Config.NAS_SHARE}\\{Config.NAS_BASE_PATH}"
        elif Config.STORAGE_MODE.lower() == 'sftp':
            save_path = f"sftp://{Config.SFTP_HOST}/{Config.SFTP_BASE_PATH}"
        elif Config.STORAGE_MODE.lower() in ('ftp', 'ftps'):
            scheme = 'ftps' if getattr(Config, 'FTP_TLS', False) or Config.STORAGE_MODE.lower() == 'ftps' else 'ftp'
            save_path = f"{scheme}://{Config.FTP_HOST}/{Config.FTP_BASE_PATH}"
        elif Config.STORAGE_MODE.lower() == 'webdav':
            save_path = f"{Config.WEBDAV_URL.rstrip('/')}/{Config.WEBDAV_BASE_PATH.strip('/')}"
        elif Config.STORAGE_MODE.lower() == 's3':
            save_path = f"s3://{Config.S3_BUCKET}/{Config.S3_PREFIX}"
        else:
            save_path = Config.LOCAL_SAVE_PATH
        print(f" [模式] {Config.STORAGE_MODE.upper()}    [保存] {save_path}")

        print("\n 1. 全量同步 (深度扫描关注列表, 获取所有作品)")
        print(" 2. 增量同步 (快速扫描新作品)")
        print(" 3. 同步并自动下载 (组合操作)")
        print(" 4. 仅执行下载 (下载数据库中的待下载任务)")
        print(" 5. 指定画师同步 (仅获取特定画师的元数据)")
        print("-" * 30)
        print(" 6. 系统设置 (参数调整)")
        print(" 7. Token 管理")
        print(" 0. 退出程序")

        c = input("请输入序号选择: ").strip()

        try:
            if c == '1':
                print(">>> 开始全量同步...")
                pro.sync(deep=True)
            elif c == '2':
                print(">>> 开始增量同步...")
                pro.sync(deep=False)
            elif c == '3':
                mode = input("  同步模式 [1=全量 | 2=增量(默认)]: ").strip()
                deep = (mode == '1')
                pro.sync(deep=deep)
                pro.download()
            elif c == '4':
                limit = input("下载数量限制 [回车=无限制]: ").strip()
                pro.download(limit=int(limit) if limit.isdigit() else None)
            elif c == '5':
                pid = input("请输入画师PID: ")
                if pid: pro.sync(aid=int(pid), deep=True)
            elif c == '6':
                print("\n[系统设置已移至 UI 设置面板]")
                input("按回车键返回...")
            elif c == '7':
                from token_manager import get_new_token_flow
                get_new_token_flow()
            elif c == '0':
                print("Bye~")
                break
        except Exception as e:
            logger.error(f"运行出错: {e}")
            import traceback
            traceback.print_exc()
