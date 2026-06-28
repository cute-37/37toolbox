import os
import re
import time
import random
import logging
import requests
import socket
from datetime import datetime
from pathlib import Path
from tqdm import tqdm
from concurrent.futures import ThreadPoolExecutor, as_completed
from threading import Lock, Event
import threading
from config import Config
from db_manager_v2 import Database
from pixiv_client import PixivClient
from storage import StorageAdapter

logger = logging.getLogger("PixivDownloader")

class Processor:
    def __init__(self):
        self.db = Database(Config.DB_PATH)
        self.client = PixivClient()
        self.api = self.client.auth()
        if self.api is None:
            logger.warning("Pixiv API认证失败，某些功能可能无法使用。请通过菜单设置Token。")

        # 初始化多token支持
        self.api_clients = {}  # {account_name: api_client}
        self._init_multi_token_clients()

        self.storage = StorageAdapter()
        # 启动时重置可能残留的 in-progress 状态，防止任务永久卡住
        try:
            with self.db._db_lock:
                self.db.conn.execute("BEGIN IMMEDIATE")
                self.db.conn.execute("UPDATE illusts SET status = 0 WHERE status = 2")
                self.db.conn.execute("COMMIT")
        except Exception:
            try:
                self.db.conn.execute("ROLLBACK")
            except:
                pass

        # 风控暂停标志：True 表示允许继续下载，False 表示暂停
        self.rate_limit_pause = Event()
        self.rate_limit_pause.set()  # 初始状态：未暂停

        # 停止事件：用于响应 Ctrl+C 迅速退出
        self.stop_event = Event()

        # 重新定义 Session 并添加重试适配器
        from requests.adapters import HTTPAdapter
        from urllib3.util.retry import Retry

        self.session = requests.Session()
        self.session.proxies = Config.PROXIES
        self.session.headers.update({
            'Referer': 'https://www.pixiv.net/',
            'User-Agent': Config.USER_AGENT,
            # 保持 Connection: close 可以避免连接被中间代理复用导致的一些问题，但若遇到频繁连接中断可考虑调整
            'Connection': 'close'
        })
        try:
            retries = Retry(
                total=getattr(Config, 'HTTP_MAX_RETRIES', 3),
                backoff_factor=getattr(Config, 'HTTP_BACKOFF_FACTOR', 0.5),
                status_forcelist=getattr(Config, 'HTTP_STATUS_FORCELIST', [429, 500, 502, 503, 504]),
                allowed_methods=frozenset(['GET', 'HEAD'])
            )
            adapter = HTTPAdapter(max_retries=retries)
            self.session.mount('https://', adapter)
            self.session.mount('http://', adapter)
        except Exception:
            pass

        # 主机并发控制：为每个 host 分配 Semaphore，数量由 Config.HOST_CONCURRENCY 或 DEFAULT_MAX_PER_HOST 决定
        self.host_semaphores = {}
        self.default_max_per_host = getattr(Config, 'DEFAULT_MAX_PER_HOST', 2)
        self.host_concurrency = getattr(Config, 'HOST_CONCURRENCY', {})

        if not self.api: raise Exception("认证失败")
        logger.debug(f"保存路径: {Config.LOCAL_SAVE_PATH}")

    def _init_multi_token_clients(self):
        """初始化多token API客户端"""
        from config import Config
        from pixiv_client import PixivClient

        if not Config.TOKENS:
            logger.info("未配置多token，将使用默认单token模式")
            return

        for account_name, token_info in Config.TOKENS.items():
            if token_info.get("is_valid", True):
                try:
                    # 创建一个临时的PixivClient实例并设置token
                    client = PixivClient()
                    client.token = token_info["token"]  # 直接设置token
                    api = client.auth()
                    if api:
                        self.api_clients[account_name] = api
                        logger.debug(f"初始化账号 '{account_name}' 的API客户端成功")
                    else:
                        logger.warning(f"❌ 初始化账号 '{account_name}' 的API客户端失败")
                except Exception as e:
                    logger.warning(f"❌ 初始化账号 '{account_name}' 的API客户端时出错: {e}")
            else:
                logger.info(f"⏭️ 跳过无效账号 '{account_name}'")

    def get_main_api(self):
        """获取主账号的API客户端"""
        from config import Config
        if Config.MAIN_ACCOUNT and Config.MAIN_ACCOUNT in self.api_clients:
            api = self.api_clients[Config.MAIN_ACCOUNT]
            if api is not None:
                return api
        # 不回退到默认API，当主账号无效时返回None，让调用者处理
        return None

    def get_backup_apis(self):
        """获取所有备份账号的API客户端列表"""
        from config import Config
        backup_apis = []
        for account_name, api_client in self.api_clients.items():
            if account_name != Config.MAIN_ACCOUNT:
                backup_apis.append((account_name, api_client))
        return backup_apis

    def get_all_valid_apis(self):
        """获取所有有效API客户端"""
        return list(self.api_clients.values())
        # 启动时重置可能残留的 in-progress 状态，防止任务永久卡住
        try:
            with self.db._db_lock:
                self.db.conn.execute("BEGIN IMMEDIATE")
                self.db.conn.execute("UPDATE illusts SET status = 0 WHERE status = 2")
                self.db.conn.execute("COMMIT")
        except Exception:
            try:
                self.db.conn.execute("ROLLBACK")
            except:
                pass

        # 风控暂停标志：True 表示允许继续下载，False 表示暂停
        self.rate_limit_pause = Event()
        self.rate_limit_pause.set()  # 初始状态：未暂停

        # 停止事件：用于响应 Ctrl+C 迅速退出
        self.stop_event = Event()

        # 重新定义 Session 并添加重试适配器
        from requests.adapters import HTTPAdapter
        from urllib3.util.retry import Retry

        self.session = requests.Session()
        self.session.proxies = Config.PROXIES
        self.session.headers.update({
            'Referer': 'https://www.pixiv.net/',
            'User-Agent': Config.USER_AGENT,
            # 保持 Connection: close 可以避免连接被中间代理复用导致的一些问题，但若遇到频繁连接中断可考虑调整
            'Connection': 'close'
        })
        try:
            retries = Retry(
                total=getattr(Config, 'HTTP_MAX_RETRIES', 3),
                backoff_factor=getattr(Config, 'HTTP_BACKOFF_FACTOR', 0.5),
                status_forcelist=getattr(Config, 'HTTP_STATUS_FORCELIST', [429, 500, 502, 503, 504]),
                allowed_methods=frozenset(['GET', 'HEAD'])
            )
            adapter = HTTPAdapter(max_retries=retries)
            self.session.mount('https://', adapter)
            self.session.mount('http://', adapter)
        except Exception:
            pass

        # 主机并发控制：为每个 host 分配 Semaphore，数量由 Config.HOST_CONCURRENCY 或 DEFAULT_MAX_PER_HOST 决定
        self.host_semaphores = {}
        self.default_max_per_host = getattr(Config, 'DEFAULT_MAX_PER_HOST', 2)
        self.host_concurrency = getattr(Config, 'HOST_CONCURRENCY', {})

        if not self.api: raise Exception("认证失败")
        print(f"[*] 保存路径: {Config.LOCAL_SAVE_PATH}")

    def _safe(self, s):
        return re.sub(r'[\\/:*?"<>|]', '_', str(s)).strip()

    def _get_host_semaphore(self, url):
        """根据 URL 返回对应主机的 Semaphore（按 Config 配置动态创建）"""
        from urllib.parse import urlparse
        parsed = urlparse(url if url else '')
        host = parsed.netloc or ''
        if not host:
            return None
        if host not in self.host_semaphores:
            maxv = self.host_concurrency.get(host, self.default_max_per_host)
            # 使用 threading.Semaphore
            self.host_semaphores[host] = threading.Semaphore(maxv)
        return self.host_semaphores[host]

    def sync(self, aid=None, deep=False):
        """阶段 A: 同步索引"""
        # 获取所有可用的API客户端进行多线程同步
        available_apis = [(Config.MAIN_ACCOUNT or "main", self.get_main_api())]

        # 过滤掉无效的API
        available_apis = [(name, api) for name, api in available_apis if api is not None]

        if not available_apis:
            logger.error("无法执行同步：未设置有效的账号Token。请先通过菜单设置Token。")
            return

        artists = []
        if aid:
            # 指定画师同步时，使用主账号
            sync_api = self.get_main_api()
            if sync_api is None:
                logger.error("无法执行同步：未设置有效的主账号Token。")
                return
            res = self.client.wrap(sync_api.user_detail, aid)
            if res: artists = [res.user]
            # For single artist, use only main api
            available_apis = [(Config.MAIN_ACCOUNT or "main", sync_api)]
        else:
            # 检查主账号状态
            sync_api = self.get_main_api()
            if sync_api is None:
                logger.error("主账号Token无效或未设置！")
                logger.error("请通过以下方式解决：")
                logger.error("1. 重新获取主账号Token")
                logger.error("2. 在settings.json中切换MAIN_ACCOUNT到有效的备份账号")
                logger.error("3. 或者选择从数据库同步所有已知画师（不删除现有数据）")

                # 提供选项：从数据库同步所有画师
                print("\n[紧急模式] 是否要从数据库同步所有已知画师？(y/N): ", end="")
                try:
                    choice = input().strip().lower()
                    if choice == 'y':
                        logger.info("进入数据库同步模式...")
                        # 从数据库获取所有画师进行同步
                        db_artists = self.db.get_all_artists()
                        if db_artists:
                            class MockUser:
                                def __init__(self, aid, name):
                                    self.id = aid
                                    self.name = name
                                    self._is_private_follow = False

                            artists = [MockUser(aid, name) for aid, name, _, _ in db_artists]
                            logger.info(f"从数据库加载了 {len(artists)} 位画师进行同步")
                        else:
                            logger.error("数据库中也没有画师数据")
                            return
                    else:
                        logger.info("同步已取消。请先解决主账号问题。")
                        return
                except EOFError:
                    # 在非交互环境中跳过输入
                    logger.info("非交互环境，跳过数据库同步模式。")
                    return
            else:
                # 主账号有效，继续正常同步流程
                backup_apis = self.get_backup_apis()
                available_apis.extend(backup_apis)
                try:
                    total_public = 0
                    total_private = 0
                    for restrict in ["public", "private"]:
                        next_qs = {"user_id": sync_api.user_id, "restrict": restrict}
                        page_count = 0
                        while next_qs:
                            res = self.client.wrap(sync_api.user_following, **next_qs)
                            if not res: break
                            page_count += 1
                            logger.debug(f"获取 {restrict} 关注第 {page_count} 页: {len(res.user_previews)} 个")
                            for user_preview in res.user_previews:
                                user_obj = user_preview.user
                                # 标记是否私密关注
                                user_obj._is_private_follow = (restrict == "private")
                                artists.append(user_obj)
                                if restrict == "public":
                                    total_public += 1
                                else:
                                    total_private += 1
                            next_qs = sync_api.parse_qs(res.next_url) if res.next_url else None
                        logger.info(f"{restrict} 关注获取完成: {total_public if restrict == 'public' else total_private} 个")

                    logger.info(f"总共获取关注者: 公开 {total_public} 个, 私密 {total_private} 个, 总计 {len(artists)} 个")

                    # 对于增量同步，添加之前失败的画师进行重试
                    if not deep:
                        try:
                            # 获取数据库中标记为已删除的画师（给予重试机会）
                            deleted_artists = self.db.get_all_artists(include_deleted=True)
                            deleted_artists = [da for da in deleted_artists if da[0] not in [a.id for a in artists]]

                            if deleted_artists:
                                logger.info(f"增量同步模式：添加 {len(deleted_artists)} 位之前失败的画师进行重试")
                                for aid, name, _, _ in deleted_artists:
                                    class MockUser:
                                        def __init__(self, aid, name):
                                            self.id = aid
                                            self.name = name
                                            self._is_private_follow = False

                                    artists.append(MockUser(aid, name))
                                logger.info(f"重试列表更新完成，总计 {len(artists)} 位画师")
                        except Exception as e:
                            logger.warning(f"获取重试画师列表失败: {e}")

                    # 如果没有获取到任何关注者，从数据库加载已同步的画师列表
                    if not artists:
                        logger.info("主账号未关注任何画师，将从数据库中获取已同步的画师列表")
                        db_artists = self.db.get_all_artists()
                        if db_artists:
                            # 创建模拟的用户对象
                            class MockUser:
                                def __init__(self, aid, name):
                                    self.id = aid
                                    self.name = name
                                    self._is_private_follow = False

                            artists = [MockUser(aid, name) for aid, name, _, _ in db_artists]
                            logger.info(f"从数据库加载了 {len(artists)} 位画师")
                        else:
                            logger.warning("数据库中也没有画师数据")
                except Exception as e:
                    logger.warning(f"获取关注列表失败: {e}，将从数据库中获取已同步的画师列表")
                    # 从数据库获取已有的画师列表
                    db_artists = self.db.get_all_artists()
                    if db_artists:
                        # 创建模拟的用户对象
                        class MockUser:
                            def __init__(self, aid, name):
                                self.id = aid
                                self.name = name
                                self._is_private_follow = False

                        artists = [MockUser(aid, name) for aid, name, _, _ in db_artists]
                        logger.info(f"从数据库加载了 {len(artists)} 位画师")
                    else:
                        logger.error("数据库中也没有画师数据")
                        return

        if not artists:
            logger.info("未发现关注画师。")
            return

        print(f"\n[同步模式] 正在拉取元数据，共计 {len(artists)} 位画师...")
        print(f"📋 使用 {len(available_apis)} 个账号进行并发同步: {[name for name, _ in available_apis]}")

        # 将画师分配给不同的账号
        from collections import defaultdict
        account_artists = defaultdict(list)
        # 使用偏移量来均匀分配新画师，避免第一个账号承担过多新同步压力
        offset = len(available_apis) - 1
        for i, artist in enumerate(artists):
            account_index = (i + offset) % len(available_apis)
            account_name, _ = available_apis[account_index]
            account_artists[account_name].append(artist)

        # 显示每个账号分配的任务数量
        for account_name, artist_list in account_artists.items():
            thread_count = getattr(Config, 'MAIN_ACCOUNT_SYNC_THREADS', 1) if account_name == Config.MAIN_ACCOUNT else getattr(Config, 'BACKUP_ACCOUNT_SYNC_THREADS', 2)
            print(f"  • {account_name}: {len(artist_list)} 位画师 (线程数: {thread_count})")

        # 使用线程池进行并发同步

        completed_count = 0
        total_count = len(artists)
        progress_lock = threading.Lock()

        # 创建每个账号的进度条
        account_pbars = {}
        position = 1
        for account_name in account_artists.keys():
            account_pbars[account_name] = tqdm(
                total=len(account_artists[account_name]),
                desc=f"[{account_name}]",
                unit="人",
                position=position,
                bar_format='{desc}: {percentage:3.0f}%|{bar}| {n}/{total} [{elapsed}<{remaining}, {rate_fmt}]'
            )
            position += 1

        # position=0 确保总进度占用第一行
        with tqdm(total=total_count, desc="【总进度】", unit="人", position=0) as pbar_main:

            def sync_worker(account_name, api_client, artist_list):
                """单个账号的同步工作线程"""
                nonlocal completed_count

                # 为每个账号线程创建独立的数据库连接，避免多线程事务冲突
                from db_manager_v2 import Database
                thread_db = Database(Config.DB_PATH)

                # 根据账号类型确定线程数
                if account_name == Config.MAIN_ACCOUNT:
                    max_workers = getattr(Config, 'MAIN_ACCOUNT_SYNC_THREADS', 1)
                else:
                    max_workers = getattr(Config, 'BACKUP_ACCOUNT_SYNC_THREADS', 2)

                account_completed = 0
                account_lock = threading.Lock()

                def process_artist(user):
                    nonlocal completed_count, account_completed
                    try:
                        # 显示当前账号正在同步的画师
                        account_pbars[account_name].set_postfix(current=f"[{user.id}] {user.name}")

                        # 使用线程专用的数据库连接
                        self._sync_artist_with_db(user, deep, api=api_client, db=thread_db)

                        with progress_lock:
                            completed_count += 1
                            pbar_main.update(1)
                        with account_lock:
                            account_completed += 1
                            account_pbars[account_name].update(1)
                    except Exception as e:
                        # 如果同步失败，标记为已删除
                        logger.warning(f"账号 {account_name} 同步 {user.name} (ID:{user.id}) 失败: {e}，标记为已删除")
                        try:
                            thread_db.upsert_artist(user.id, user.name, is_deleted=1)
                        except Exception as db_e:
                            logger.warning(f"标记画师 {user.id} 为已删除失败: {db_e}")
                        with progress_lock:
                            completed_count += 1
                            pbar_main.update(1)
                        with account_lock:
                            account_completed += 1
                            account_pbars[account_name].update(1)

                with ThreadPoolExecutor(max_workers=max_workers) as executor:
                    futures = [executor.submit(process_artist, user) for user in artist_list]
                    for future in as_completed(futures):
                        future.result()

                # 验证该账号的数据是否正确写入主数据库
                try:
                    # 使用主数据库连接验证，因为thread_db的数据可能还没完全同步
                    written_artists = self.db.conn.execute("SELECT COUNT(*) FROM artists WHERE author_id IN ({})".format(','.join('?' * len(artist_list))), [u.id for u in artist_list]).fetchone()[0]
                    logger.info(f"账号 {account_name} 同步验证: 处理 {len(artist_list)} 位画师，数据库中有 {written_artists} 位")
                    if written_artists < len(artist_list) * 0.8:  # 允许20%的失败率
                        logger.warning(f"账号 {account_name} 数据写入可能不完整，请检查数据库")
                except Exception as e:
                    logger.warning(f"账号 {account_name} 数据验证失败: {e}")
                finally:
                    # 确保线程数据库连接正确关闭
                    try:
                        thread_db.conn.close()
                    except:
                        pass

            # 启动所有账号的同步线程
            with ThreadPoolExecutor(max_workers=len(available_apis)) as executor:
                futures = []
                for account_name, api_client in available_apis:
                    artist_list = account_artists[account_name]
                    if artist_list:  # 只为有任务的账号创建线程
                        future = executor.submit(sync_worker, account_name, api_client, artist_list)
                        futures.append(future)

                # 等待所有任务完成
                for future in as_completed(futures):
                    try:
                        result = future.result()
                    except Exception as e:
                        logger.error(f"同步线程执行出错: {e}")

        # 关闭所有账号进度条
        for pbar in account_pbars.values():
            pbar.close()

        # 验证数据整合：检查总记录数是否正确
        try:
            final_artist_count = self.db.conn.execute("SELECT COUNT(*) FROM artists").fetchone()[0]
            final_illust_count = self.db.conn.execute("SELECT COUNT(*) FROM illust_metadata").fetchone()[0]
            final_task_count = self.db.conn.execute("SELECT COUNT(*) FROM illusts").fetchone()[0]
            logger.info(f"同步完成验证 - 作者: {final_artist_count}, 作品元数据: {final_illust_count}, 下载任务: {final_task_count}")
        except Exception as e:
            logger.warning(f"数据验证失败: {e}")

        logger.info("索引同步完成。")

    def _sync_artist(self, user, deep, pbar=None, use_sub_bar=False, api=None):
        """同步单个画师的作品"""
        if api is None:
            api = self.get_main_api()  # 默认使用主账号API
        aid, name = user.id, user.name
        is_temp_name = 0

        # 【修复】如果获取到的名字为空，尝试重新获取详情
        if not name or not str(name).strip():
            try:
                logger.info(f"检测到用户 {aid} 名字为空，尝试重新获取详情...")
                detail = self.client.wrap(api.user_detail, aid)
                if detail and hasattr(detail, 'user'):
                    user = detail.user # 更新 user 对象
                    name = user.name
            except Exception as e:
                logger.warning(f"重新获取用户 {aid} 详情失败: {e}")

            # 再次检查名字，如果还是空，则使用兜底名字并标记为临时
            if not name or not str(name).strip():
                name = f"User_{aid}" # 兜底名字
                is_temp_name = 1
                logger.warning(f"无法获取用户 {aid} 真实名字，使用临时名 User_{aid}")

        # 提取作者完整元数据
        profile_image = getattr(user, 'profile_image_urls', {}).get('medium') if hasattr(user, 'profile_image_urls') else None
        account = getattr(user, 'account', None)
        comment = getattr(user, 'comment', None)
        total_illusts = getattr(user, 'total_illusts', None)
        total_bookmarks = getattr(user, 'total_manga', None) or getattr(user, 'total_bookmarks_public', None)
        is_followed = 1 if getattr(user, 'is_followed', False) else 0
        is_private_follow = 1 if getattr(user, '_is_private_follow', False) else 0
        twitter = getattr(user, 'twitter_account', None)
        webpage = getattr(user, 'webpage', None)

        self.db.upsert_artist(
            aid, name,
            profile_image_url=profile_image,
            author_account=account,
            author_comment=comment,
            total_illusts=total_illusts,
            total_bookmarks=total_bookmarks,
            is_followed=is_followed,
            is_private_follow=is_private_follow,
            twitter_account=twitter,
            webpage=webpage,
            is_temp_name=is_temp_name
        )
        self.storage.get_artist_folder(aid, self._safe(name))

        _, _, watermark = self.db.get_artist(aid)
        if deep: watermark = 0

        curr_max = watermark
        # 分别同步不同类型作品
        for illust_type in ['illust', 'manga', 'ugoira']:
            next_qs = {"user_id": aid, "type": illust_type}
            # 平衡策略：即使遇到已同步的作品，也继续刷新最近 N 个作品的元数据
            # (这不会阻碍获取新作品，只有当遇到旧作 且 已扫描总数超过此限制时才停止)
            refresh_limit = getattr(Config, 'METADATA_REFRESH_LIMIT', 50)
            scanned_count = 0

            # Initialize sub-bar for artist details (Line 2)
            sub_bar = None
            if use_sub_bar:
                desc_str = f"Current: [{aid}] {name}"
                sub_bar = tqdm(total=0, position=1, bar_format='{desc}', leave=False)
                sub_bar.set_description_str(desc_str)

            while next_qs:
                if illust_type == 'ugoira':
                    res = api.user_illusts(**next_qs)
                else:
                    res = self.client.wrap(api.user_illusts, **next_qs)
                if not res or "illusts" not in res: break

                if illust_type == 'ugoira': print(f"Ugoira res: {res is not None}, illusts: {len(res.illusts) if res and hasattr(res, 'illusts') else 0}")

                for ill in res.illusts:
                    scanned_count += 1
                    if sub_bar:
                        sub_bar.set_description_str(f"Current: [{aid}] {name} (Scanned: {scanned_count})")
                    elif pbar:
                        pbar.set_postfix(scanned=scanned_count)
                    should_download = True

                    if ill.id <= watermark:
                        if scanned_count > refresh_limit:
                            next_qs = None; break
                        else:
                            # 仅更新元数据模式
                            should_download = False

                    if should_download:
                        curr_max = max(curr_max, ill.id)

                    # 支持多种媒体类型（image/ugoira/video/text/other）
                    pages = self._extract_pages(ill)
                    # 提取作品完整元数据
                    metadata = self._extract_illust_metadata(ill)
                    for idx, url, media_type, meta in pages:
                        # 合并元数据
                        illust_data = {
                            'task_key': f"{ill.id}_{idx}",
                            'illust_id': ill.id,
                            'page_index': idx,
                            'author_id': aid,
                            'title': ill.title,
                            'url': url,
                            'media_type': media_type,
                            'meta': meta,
                            **metadata  # 展开元数据
                        }
                        self.db.save_illust(illust_data)

                if not next_qs: break # 防止上面 break 后 next_qs 仍有值导致死循环逻辑错误（虽然上面已经 next_qs=None）

                if next_qs: # 只有没 break 才会继续翻页
                    next_qs = self.api.parse_qs(res.next_url) if getattr(res, 'next_url', None) else None
                    if not next_qs:
                        break
                    if self._sleep(random.uniform(*Config.DELAY_SYNC)):
                        break
        with self.db.conn:
            self.db.conn.execute(
                "UPDATE artists SET last_synced_id = ?, last_sync_time = ? WHERE author_id = ?",
                (curr_max, datetime.now().strftime("%Y-%m-%d %H:%M:%S"), aid)
        )

        # 同步小说（若 API 支持）
        try:
            n_qs = {"user_id": aid}
            while True:
                resn = self.client.wrap(self.api.user_novels, **n_qs)
                if not resn or "novels" not in resn:
                    break
                for novel in resn.novels:
                    meta = None
                    try:
                        import json
                        meta = json.dumps({"title": getattr(novel, 'title', ''), "series": getattr(novel, 'series', None)})
                    except Exception:
                        meta = None
                    self.db.save_illust((f"novel_{novel.id}_0", novel.id, 0, aid, getattr(novel, 'title', ''), f"novel://{novel.id}", 'novel', meta))
                n_qs = self.api.parse_qs(resn.next_url) if getattr(resn, 'next_url', None) else None
                if not n_qs:
                    break
                if self._sleep(random.uniform(*Config.DELAY_SYNC)):
                    break
        except Exception:
            logger.info("小说同步接口不可用或同步失败，已跳过小说同步。")
        finally:
            if sub_bar:
                sub_bar.close()

    def _sync_artist_with_db(self, user, deep, api=None, db=None):
        """同步单个画师的作品，使用指定的数据库连接"""
        if api is None:
            api = self.get_main_api()  # 默认使用主账号API
        if db is None:
            db = self.db
        aid, name = user.id, user.name
        is_temp_name = 0

        # 【修复】如果获取到的名字为空，尝试重新获取详情
        if not name or not str(name).strip():
            try:
                logger.info(f"检测到用户 {aid} 名字为空，尝试重新获取详情...")
                detail = self.client.wrap(api.user_detail, aid)
                if detail and hasattr(detail, 'user'):
                    user = detail.user # 更新 user 对象
                    name = user.name
            except Exception as e:
                logger.warning(f"重新获取用户 {aid} 详情失败: {e}")

            # 再次检查名字，如果还是空，则使用兜底名字并标记为临时
            if not name or not str(name).strip():
                name = f"User_{aid}" # 兜底名字
                is_temp_name = 1
                logger.warning(f"无法获取用户 {aid} 真实名字，使用临时名 User_{aid}")

        # 提取作者完整元数据
        profile_image = getattr(user, 'profile_image_urls', {}).get('medium') if hasattr(user, 'profile_image_urls') else None
        account = getattr(user, 'account', None)
        comment = getattr(user, 'comment', None)
        total_illusts = getattr(user, 'total_illusts', None)
        total_bookmarks = getattr(user, 'total_manga', None) or getattr(user, 'total_bookmarks_public', None)
        is_followed = 1 if getattr(user, 'is_followed', False) else 0
        is_private_follow = 1 if getattr(user, '_is_private_follow', False) else 0
        twitter = getattr(user, 'twitter_account', None)
        webpage = getattr(user, 'webpage', None)

        db.upsert_artist(
            aid, name,
            profile_image_url=profile_image,
            author_account=account,
            author_comment=comment,
            total_illusts=total_illusts,
            total_bookmarks=total_bookmarks,
            is_followed=is_followed,
            is_private_follow=is_private_follow,
            twitter_account=twitter,
            webpage=webpage,
            is_temp_name=is_temp_name
        )
        self.storage.get_artist_folder(aid, self._safe(name))

        _, _, watermark = db.get_artist(aid)
        if deep: watermark = 0

        curr_max = watermark
        next_qs = {"user_id": aid}
        # 平衡策略：即使遇到已同步的作品，也继续刷新最近 N 个作品的元数据
        # (这不会阻碍获取新作品，只有当遇到旧作 且 已扫描总数超过此限制时才停止)
        refresh_limit = getattr(Config, 'METADATA_REFRESH_LIMIT', 50)
        scanned_count = 0

        while next_qs:
            res = self.client.wrap(api.user_illusts, **next_qs)
            if not res or "illusts" not in res: break

            for ill in res.illusts:
                scanned_count += 1
                should_download = True

                if ill.id <= watermark:
                    if scanned_count > refresh_limit:
                        next_qs = None; break
                    else:
                        # 仅更新元数据模式
                        should_download = False

                if should_download:
                    curr_max = max(curr_max, ill.id)

                # 支持多种媒体类型（image/ugoira/video/text/other）
                pages = self._extract_pages(ill)
                # 提取作品完整元数据
                metadata = self._extract_illust_metadata(ill)
                for idx, url, media_type, meta in pages:
                    # 合并元数据
                    illust_data = {
                        'task_key': f"{ill.id}_{idx}",
                        'illust_id': ill.id,
                        'page_index': idx,
                        'author_id': aid,
                        'title': ill.title,
                        'url': url,
                        'media_type': media_type,
                        'meta': meta,
                        **metadata  # 展开元数据
                    }
                    db.save_illust(illust_data)

            if not next_qs: break # 防止上面 break 后 next_qs 仍有值导致死循环逻辑错误（虽然上面已经 next_qs=None）

            if next_qs: # 只有没 break 才会继续翻页
                next_qs = self.api.parse_qs(res.next_url) if getattr(res, 'next_url', None) else None
                if not next_qs:
                    break
                if self._sleep(random.uniform(*Config.DELAY_SYNC)):
                    break
            with db.conn:
                db.conn.execute(
                    "UPDATE artists SET last_synced_id = ?, last_sync_time = ? WHERE author_id = ?",
                    (curr_max, datetime.now().strftime("%Y-%m-%d %H:%M:%S"), aid)
                )

        # 同步小说（若 API 支持）
        try:
            n_qs = {"user_id": aid}
            while True:
                resn = self.client.wrap(self.api.user_novels, **n_qs)
                if not resn or "novels" not in resn:
                    break
                for novel in resn.novels:
                    meta = None
                    try:
                        import json
                        meta = json.dumps({"title": getattr(novel, 'title', ''), "series": getattr(novel, 'series', None)})
                    except Exception:
                        meta = None
                    db.save_illust((f"novel_{novel.id}_0", novel.id, 0, aid, getattr(novel, 'title', ''), f"novel://{novel.id}", 'novel', meta))
                n_qs = self.api.parse_qs(resn.next_url) if getattr(resn, 'next_url', None) else None
                if not n_qs:
                    break
                if self._sleep(random.uniform(*Config.DELAY_SYNC)):
                    break
        except Exception:
            logger.info("小说同步接口不可用或同步失败，已跳过小说同步。")

    def _format_size(self, size_bytes):
        """格式化文件大小"""
        for unit in ['B', 'KB', 'MB', 'GB']:
            if size_bytes < 1024:
                return f"{size_bytes:.1f}{unit}"
            size_bytes /= 1024
        return f"{size_bytes:.1f}TB"

    def _extract_illust_metadata(self, ill):
        """从Illust对象提取完整的元数据
        返回包含所有元数据字段的字典
        注意：不包括实时性强的字段（view_count, bookmark_count等）
        """
        import json
        metadata = {}

        try:
            # 基础热度数据
            if hasattr(ill, 'total_view'):
                metadata['total_view'] = ill.total_view
            if hasattr(ill, 'total_bookmarks'):
                metadata['total_bookmarks'] = ill.total_bookmarks
            if hasattr(ill, 'is_bookmarked'):
                metadata['is_bookmarked'] = 1 if ill.is_bookmarked else 0

            # AI 生成标识 (illust_ai_type: 1=non-AI, 2=AI-generated)
            if hasattr(ill, 'illust_ai_type'):
                metadata['ai_type'] = ill.illust_ai_type

            # 翻译标签
            if hasattr(ill, 'tags'):
                tags_list = []
                tags_translated_list = []
                for tag in ill.tags:
                    tag_name = getattr(tag, 'name', None)
                    tag_trans = getattr(tag, 'translated_name', None)
                    if tag_name:
                        tags_list.append(tag_name)
                    if tag_trans:
                        tags_translated_list.append(tag_trans)

                metadata['tags'] = json.dumps(tags_list, ensure_ascii=False)
                if tags_translated_list:
                    metadata['tags_translated'] = json.dumps(tags_translated_list, ensure_ascii=False)

            # 创建日期
            if hasattr(ill, 'create_date'):
                metadata['create_date'] = str(ill.create_date)

            # 标签（转为JSON数组）- 已在上面处理
            if 'tags' not in metadata and hasattr(ill, 'tags'):
                tags_list = []
                for tag in ill.tags:
                    tag_name = getattr(tag, 'name', None)
                    if tag_name:
                        tags_list.append(tag_name)
                metadata['tags'] = json.dumps(tags_list, ensure_ascii=False)

            # R18限制
            if hasattr(ill, 'x_restrict'):
                metadata['x_restrict'] = ill.x_restrict
                metadata['is_r18'] = 1 if ill.x_restrict >= 1 else 0
            elif hasattr(ill, 'sanity_level'):
                # 根据sanity_level推断R18（sanity_level >= 6通常是R18）
                metadata['is_r18'] = 1 if getattr(ill, 'sanity_level', 0) >= 6 else 0

            # 页数
            if hasattr(ill, 'page_count'):
                metadata['page_count'] = ill.page_count

            # 图片尺寸
            if hasattr(ill, 'width'):
                metadata['width'] = ill.width
            if hasattr(ill, 'height'):
                metadata['height'] = ill.height

            # 健康度级别
            if hasattr(ill, 'sanity_level'):
                metadata['sanity_level'] = ill.sanity_level

            # 作品类型（0=插画, 1=漫画, 2=动图）
            if hasattr(ill, 'type'):
                type_map = {'illust': 0, 'manga': 1, 'ugoira': 2}
                metadata['illust_type'] = type_map.get(ill.type, 0)

            # 系列信息
            if hasattr(ill, 'series') and ill.series:
                if hasattr(ill.series, 'id'):
                    metadata['series_id'] = ill.series.id
                if hasattr(ill.series, 'title'):
                    metadata['series_title'] = ill.series.title

            # 创作工具
            if hasattr(ill, 'tools') and ill.tools:
                metadata['tools'] = json.dumps(ill.tools, ensure_ascii=False)

            # 作品描述
            if hasattr(ill, 'caption'):
                metadata['caption'] = ill.caption

            # 5. 动图配置信息 (ugoira_data)
            # 如果是动图，尝试获取详细配置（帧延迟等）。列表接口通常不返回此信息，需单独获取。
            if getattr(ill, 'type', '') == 'ugoira':
                ugoira_meta = getattr(ill, 'ugoira_metadata', None)

                # 如果对象自带（极少见）或已挂载则直接用；否则尝试请求 API
                if not ugoira_meta and hasattr(self, 'api'):
                    try:
                        # 稍微延迟一下，避免短时间内并发请求过多（虽然是串行，但还是稳妥为妙）
                        self._sleep(random.uniform(0.5, 1.2))
                        # 调用 API 获取动图元数据
                        res_ugoira = self.client.wrap(self.api.ugoira_metadata, ill.id)
                        if res_ugoira and hasattr(res_ugoira, 'ugoira_metadata'):
                            ugoira_meta = res_ugoira.ugoira_metadata
                            # 【关键优化】将获取到的元数据挂载回 ill 对象
                            # 这样稍后的 _extract_pages 方法就能直接利用它提取 zip 下载地址，
                            # 而不需要 _extract_pages 自己再去猜或失败。
                            ill.ugoira_metadata = ugoira_meta
                    except Exception as e:
                        logger.warning(f"获取动图元数据失败 id={ill.id}: {e}")

                if ugoira_meta:
                    # 构造标准化的数据结构存储到数据库
                    ugoira_info = {}

                    # 提取 zip 地址
                    zip_urls = getattr(ugoira_meta, 'zip_urls', None)
                    if zip_urls:
                        # 优先 medium (通常就是原始包), 再 original
                        ugoira_info['zip_url'] = getattr(zip_urls, 'medium', None) or getattr(zip_urls, 'original', None)

                    # 提取帧信息
                    frames = getattr(ugoira_meta, 'frames', [])
                    # 确保 frames 是可序列化的列表
                    serializable_frames = []
                    for f in frames:
                        if isinstance(f, dict):
                            serializable_frames.append(f)
                        else:
                            # 假设是对象，尝试取属性
                            serializable_frames.append({
                                'file': getattr(f, 'file', ''),
                                'delay': getattr(f, 'delay', 0)
                            })
                    ugoira_info['frames'] = serializable_frames

                    metadata['ugoira_data'] = json.dumps(ugoira_info, ensure_ascii=False)

        except Exception as e:
            logger.warning(f"提取元数据时出错: {e}")

        return metadata

    def _extract_pages(self, ill):
        """从 Illust 对象提取可下载的页面/资源。
        返回列表： (index, url, media_type, metaJSON)
        尽量保持对现有图片逻辑的兼容性（图片仍使用 image_urls/original）
        """
        pages = []
        try:
            # 优先检查作品类型，如果是 ugoira，直接处理
            if getattr(ill, 'type', None) == 'ugoira' or getattr(ill, 'illust_type', None) == 2:
                meta = getattr(ill, 'ugoira_metadata', None)
                # 如果无 meta，尝试调用 API 获取
                if not meta:
                    try:
                        meta_res = self.api.ugoira_metadata(ill.id)
                        if meta_res and hasattr(meta_res, 'ugoira_metadata'):
                            meta = meta_res.ugoira_metadata
                    except Exception as e:
                        logger.warning(f"获取ugoira元数据失败 {ill.id}: {e}")
                # 获取 zip_url
                zip_url = None
                if meta:
                    if hasattr(meta, 'zip_urls'):
                        zip_url = getattr(meta.zip_urls, 'original', None) or getattr(meta.zip_urls, 'medium', None)
                    if not zip_url:
                        zip_url = getattr(meta, 'original_src', None) or getattr(meta, 'src', None)
                if not zip_url:
                    # 如果无法获取zip_url，使用占位符，在下载时获取
                    zip_url = f'ugoira://{ill.id}'
                    logger.warning(f"无法获取ugoira zip_url {ill.id}，使用占位符")
                import json
                return [(0, zip_url, 'ugoira', json.dumps(meta.__dict__ if meta and hasattr(meta, '__dict__') else (meta or {})))]

            # 多页图（漫画/多张图片）
                for i, p in enumerate(ill.meta_pages):
                    url = None
                    try:
                        url = p.image_urls.original
                    except Exception:
                        # 兜底尝试
                        url = getattr(p, 'original_image_url', None) or getattr(p, 'image_urls', {}).get('original') if hasattr(p, 'image_urls') else None
                    if url:
                        pages.append((i, url, 'image', None))
                if pages:
                    return pages

            # 单页图或常见图片字段
            if hasattr(ill, 'meta_single_page'):
                url = getattr(ill.meta_single_page, 'original_image_url', None)
                if url:
                    return [(0, url, 'image', None)]

            # 优先尝试常见 image_urls 字段
            if hasattr(ill, 'image_urls'):
                url = getattr(ill.image_urls, 'original', None)
                if url:
                    return [(0, url, 'image', None)]

            # Ugoira（动图）通常包含 ugoira_metadata，内含 zip 地址
            # 优先检查 type 字段（Pixiv API 中 illust.type 可能为 'ugoira'）
            if getattr(ill, 'type', None) == 'ugoira' or (hasattr(ill, 'ugoira_metadata') and ill.ugoira_metadata):
                meta = ill.ugoira_metadata if hasattr(ill, 'ugoira_metadata') else None
                # 如果 type 是 ugoira 但无 meta，尝试调用 API 获取
                if not meta and getattr(ill, 'type', None) == 'ugoira':
                    try:
                        meta_res = self.api.ugoira_metadata(ill.id)
                        if meta_res and hasattr(meta_res, 'ugoira_metadata'):
                            meta = meta_res.ugoira_metadata
                    except Exception as e:
                        logger.warning(f"获取ugoira元数据失败 {ill.id}: {e}")
                # 常见路径：meta.zip_urls.original 或 meta.original_src
                zip_url = None
                if meta:
                    if hasattr(meta, 'zip_urls'):
                        zip_url = getattr(meta.zip_urls, 'original', None)
                    if not zip_url:
                        zip_url = getattr(meta, 'original_src', None) or getattr(meta, 'src', None)
                # 如果有 type 但无 meta，尝试从其他字段获取
                if not zip_url:
                    for attr in ['original_url', 'original_src', 'src', 'url']:
                        zip_url = getattr(ill, attr, None)
                        if zip_url:
                            break
                if zip_url:
                    import json
                    return [(0, zip_url, 'ugoira', json.dumps(meta.__dict__ if meta and hasattr(meta, '__dict__') else (meta or {})))]

            # 尝试寻找视频或其他可下载字段（通用探索：查找带 original/zip/src 的属性）
            for attr in ['original_url', 'original_src', 'src', 'url']:
                url = getattr(ill, attr, None)
                if url:
                    return [(0, url, 'other', None)]

            # 兜底：如果 ill 包含任何可疑的 url 字段，尝试提取
            for key in dir(ill):
                if key.endswith('url') or 'src' in key or 'zip' in key:
                    try:
                        val = getattr(ill, key)
                        if isinstance(val, str) and val.startswith('http'):
                            return [(0, val, 'other', None)]
                    except Exception:
                        continue
        except Exception:
            pass
        # 如果都没有，返回空列表
        return []

    def _get_ext_from_content_type(self, content_type, url=None):
        """根据 Content-Type 推断扩展名，若无法识别则回退到 URL 后缀"""
        if not content_type:
            return url.split('.')[-1].split('?')[0] if url and '.' in url else 'bin'
        c = content_type.split(';')[0].strip().lower()
        mapping = {
            'image/jpeg': 'jpg',
            'image/jpg': 'jpg',
            'image/png': 'png',
            'image/webp': 'webp',
            'image/gif': 'gif',
            'video/mp4': 'mp4',
            'video/webm': 'webm',
            'application/zip': 'zip',
            'application/octet-stream': 'bin',
            'text/plain': 'txt',
            'text/html': 'html'
        }
        return mapping.get(c, url.split('.')[-1].split('?')[0] if url and '.' in url else 'bin')

    def _resolve_extension_for_non_image(self, url):
        """对非图片类型，发起 HEAD 请求以获取 Content-Type 来推断扩展名（网络优先）。"""
        try:
            resp = self.session.head(url, timeout=15, allow_redirects=True)
            # 有些站点不支持 HEAD，我们兜底做一个短时的 GET（只取 header 或少量）
            if resp.status_code != 200:
                resp = self.session.get(url, timeout=15, stream=True)
            ctype = resp.headers.get('content-type')
            ext = self._get_ext_from_content_type(ctype, url)
            # 若 Content-Disposition 提供了文件名，优先使用其后缀
            cd = resp.headers.get('content-disposition')
            if cd and 'filename=' in cd:
                fname = cd.split('filename=')[-1].strip('"\'')
                if '.' in fname:
                    return fname.split('.')[-1]
            return ext
        except Exception:
            # 回退到 URL 的后缀
            return url.split('.')[-1].split('?')[0] if url and '.' in url else 'bin'
    def _convert_ugoira(self, local_zip_path, meta_json, folder_name):
        """将 Ugoira zip + metadata 转换为 WebP，并保存ZIP到动图zip文件夹。
        返回本地 webp 路径。若失败，抛异常。
        """
        import zipfile, json, tempfile, os, shutil, subprocess
        tmp_base = None
        try:
            # 验证输入文件
            if not os.path.exists(local_zip_path):
                raise Exception(f"ZIP文件不存在: {local_zip_path}")

            file_size = os.path.getsize(local_zip_path)
            if file_size < 100:
                raise Exception(f"ZIP文件过小 ({file_size} bytes)，可能损坏")

            meta = meta_json if not isinstance(meta_json, str) else json.loads(meta_json)
            frames = meta.get('frames') if isinstance(meta, dict) else None

            # 使用项目的临时目录
            os.makedirs(Config.LOCAL_TEMP_PATH, exist_ok=True)
            tmp_base = tempfile.mkdtemp(prefix='ugoira_', dir=Config.LOCAL_TEMP_PATH)

            # 安全地解压ZIP文件
            try:
                with zipfile.ZipFile(local_zip_path, 'r') as z:
                    # 验证ZIP文件完整性
                    bad_file = z.testzip()
                    if bad_file:
                        raise Exception(f"ZIP文件损坏，损坏的文件: {bad_file}")

                    # 检查文件列表
                    file_list = z.namelist()
                    if not file_list:
                        raise Exception("ZIP文件为空")

                    z.extractall(tmp_base)
            except zipfile.BadZipFile as e:
                raise Exception(f"无效的ZIP文件: {e}")

            # 优先尝试 Pillow
            try:
                from PIL import Image
                use_pillow = True
            except Exception:
                use_pillow = False

            if use_pillow:
                images = []
                durations = []

                if frames:
                    # 使用metadata中的帧信息
                    for f in frames:
                        fname = f.get('file')
                        delay = f.get('delay', 100)
                        p = os.path.join(tmp_base, fname)

                        # 文件名匹配（处理编码问题）
                        if not os.path.exists(p):
                            matches = [x for x in os.listdir(tmp_base) if x.endswith(os.path.basename(fname))]
                            p = os.path.join(tmp_base, matches[0]) if matches else p

                        if not os.path.exists(p):
                            logger.warning(f"帧文件不存在: {fname} (尝试匹配: {matches})")
                            continue

                        try:
                            img = Image.open(p).convert('RGBA')
                            images.append(img)
                            durations.append(delay)
                        except Exception as img_err:
                            logger.warning(f"加载帧图片失败 {fname}: {img_err}")
                            continue
                else:
                    # 自动检测帧文件
                    files = sorted([x for x in os.listdir(tmp_base) if x.lower().endswith(('.png', '.jpg', '.jpeg'))])
                    for fn in files:
                        try:
                            img = Image.open(os.path.join(tmp_base, fn)).convert('RGBA')
                            images.append(img)
                            durations.append(100)
                        except Exception as img_err:
                            logger.warning(f"加载帧图片失败 {fn}: {img_err}")
                            continue

                if not images:
                    raise Exception('未能从 zip 中读取到有效的帧图片')

                # 生成WebP
                base = os.path.splitext(os.path.basename(local_zip_path))[0]
                webp_file = os.path.join(tmp_base, base + '.webp')

                try:
                    images[0].save(webp_file, format='WEBP', save_all=True, append_images=images[1:], duration=durations, loop=0)

                    # 验证生成的WebP文件
                    if not os.path.exists(webp_file) or os.path.getsize(webp_file) < 100:
                        raise Exception("WebP文件生成失败或过小")

                    # 成功生成 WebP，保留文件，不要在这里清理
                    # 调用方会负责移动/上传 WebP 后清理临时目录
                    return webp_file

                except Exception as webp_err:
                    raise Exception(f"WebP生成失败: {webp_err}")

            else:
                raise Exception('Pillow不可用，无法转换ugoira')
        except Exception as e:
            # 只在失败时清理临时目录
            if tmp_base and os.path.exists(tmp_base):
                try:
                    shutil.rmtree(tmp_base)
                except Exception as cleanup_err:
                    logger.warning(f"清理ugoira临时目录失败: {cleanup_err}")
            raise e

    def clean_temp(self, older_than_days=None):
        """清理本地临时目录（默认根据 Config.TEMP_CLEAN_DAYS），返回已删除文件数"""
        import os, time
        days = older_than_days if older_than_days is not None else getattr(Config, 'TEMP_CLEAN_DAYS', 7)
        cutoff = time.time() - days * 86400
        base = Config.LOCAL_TEMP_PATH
        removed = 0
        if not os.path.exists(base):
            return removed
        for root, dirs, files in os.walk(base, topdown=False):
            for f in files:
                fp = os.path.join(root, f)
                try:
                    if os.path.getmtime(fp) < cutoff:
                        os.remove(fp); removed += 1
                except Exception:
                    continue
            for d in dirs:
                dp = os.path.join(root, d)
                try:
                    if not os.listdir(dp):
                        os.rmdir(dp)
                except Exception:
                    continue
        logger.info(f"已清理临时文件: {removed} 个")
        return removed

    def reclaim_stuck_tasks(self):
        """检测并回收卡住的任务（status=2 超时者）"""
        try:
            hours = getattr(Config, 'IN_PROGRESS_TIMEOUT_HOURS', 6)
            res = self.db.reset_stuck_tasks(hours)
            reclaimed = res.get('reclaimed', 0) if isinstance(res, dict) else res
            permanent = res.get('permanent_failed', 0) if isinstance(res, dict) else 0
            logger.info(f"回收卡住任务: 已恢复 {reclaimed} 个, 永久失败 {permanent} 个 (阈值: {hours} 小时)")
            return res
        except Exception as e:
            logger.error(f"回收卡住任务失败: {e}")
            return {'reclaimed': 0, 'permanent_failed': 0}

    def list_failed_tasks(self, author_id=None, attempts_lt=None, limit=None):
        """返回失败任务清单（调用 DB 方法），便于展示或导出"""
        return self.db.get_failed_tasks(author_id, attempts_lt, limit)

    def export_failed_tasks(self, out_path=None):
        """导出失败任务为 CSV；若未指定路径，保存到当前目录 failures_YYYYMMDD.csv"""
        import os
        from datetime import datetime
        out = out_path or os.path.abspath(f"failures_{datetime.now().strftime('%Y%m%d_%H%M%S')}.csv")
        return self.db.export_failed_tasks_csv(out)

    def retry_failed_tasks(self):
        """将所有失败任务重置为待处理（status=0）并重置 attempts，返回重置数量"""
        return self.db.reset_failed_tasks_by_filter()

    def preview_pending(self, limit=20):
        """预览待处理任务（dry-run），返回任务元信息列表"""
        tasks = self.db.get_pending_tasks(limit=limit, max_attempts=Config.MAX_ATTEMPTS)
        out = []
        for t in tasks:
            t_key, iid, page, aid, title, url, media_type, meta = t
            out.append({
                'task_key': t_key,
                'illust_id': iid,
                'page': page,
                'author_id': aid,
                'title': title,
                'url': url,
                'media_type': media_type
            })
        return out

    def _sleep(self, seconds):
        """可中断的睡眠：委托到全局 `interrupt.wait`，确保全局一致性。"""
        from interrupt import wait, is_set
        # 如果外部已设置停止，立即返回 True
        if is_set():
            return True
        return wait(seconds)

    def download(self, aid=None, limit=None):
        """阶段 B: 下载执行（多账号并发下载）"""
        tasks = self.db.get_pending_tasks(aid, limit, max_attempts=Config.MAX_ATTEMPTS)
        if not tasks:
            logger.info("没有待处理任务")
            return

        # 获取可用于下载的API客户端
        backup_apis = self.get_backup_apis()
        available_apis = []

        # 总是尝试添加主账号，如果有效
        main_api = self.get_main_api()
        if main_api:
            available_apis.append((Config.MAIN_ACCOUNT or "main", main_api))

        # 添加备份账号
        available_apis.extend(backup_apis)

        if not available_apis or not any(api for _, api in available_apis):
            logger.error("没有可用的API客户端进行下载")
            return

        print(f"📋 使用 {len(available_apis)} 个账号进行并发下载: {[name for name, _ in available_apis]}")

        success_count = 0
        fail_count = 0
        total_bytes = 0
        active_tasks = {}  # {task_key: {'artist': name, 'illust_id': id, 'pbar': tqdm_obj, ...}}
        task_lock = Lock()
        downloaded_count = 0
        # 失败率检测用滑动窗口（记录 1=成功、0=失败）
        from collections import deque
        self.failure_window = deque(maxlen=getattr(Config, 'FAILURE_RATE_WINDOW', 20))
        self.auto_throttle_enabled = getattr(Config, 'AUTO_THROTTLE_ENABLED', True)

        # Prometheus 指标（可选）
        self.metrics = None
        if getattr(Config, 'PROMETHEUS_ENABLED', False):
            try:
                # type: ignore 因为 prometheus_client 是可选依赖
                from prometheus_client import start_http_server, Counter, Gauge, Histogram  # type: ignore
                start_http_server(getattr(Config, 'PROMETHEUS_PORT', 8000))
                self.metrics = {
                    'download_success_total': Counter('pixiv_download_success_total', 'Successfully downloaded files'),
                    'download_failure_total': Counter('pixiv_download_failure_total', 'Failed downloads'),
                    'download_latency_seconds': Histogram('pixiv_download_latency_seconds', 'Download latency in seconds'),
                    'queue_length': Gauge('pixiv_queue_length', 'Current pending queue length'),
                    'host_in_use': Gauge('pixiv_host_in_use', 'Current host concurrency in use')
                }
            except Exception as e:
                logger.warning(f"Prometheus 初始化失败: {e}")

        # 为每个账号分配独立的线程池
        account_executors = {}
        account_futures = {}
        account_positions = {}
        account_available_positions = {}
        account_position_locks = {}

        # 为每个账号创建独立的进度条位置空间
        base_position = 1  # position 0 是总体进度条
        for i, (api_name, api_client) in enumerate(available_apis):
            # 根据账号类型确定线程数
            if api_name == Config.MAIN_ACCOUNT:
                account_threads = getattr(Config, 'MAIN_ACCOUNT_DOWNLOAD_THREADS', 1)
            else:
                account_threads = getattr(Config, 'BACKUP_ACCOUNT_DOWNLOAD_THREADS', 2)

            positions = list(range(base_position, base_position + account_threads))
            account_positions[api_name] = positions
            account_available_positions[api_name] = positions.copy()
            account_position_locks[api_name] = Lock()
            account_executors[api_name] = ThreadPoolExecutor(max_workers=account_threads)
            account_futures[api_name] = set()
            base_position += account_threads

        print(f"\n[下载模式] 队列长度: {len(tasks)} | 总并发数: {Config.DOWNLOAD_THREADS}")
        print(f"{'='*100}")

        # 主进度条：显示整体进度
        with tqdm(total=len(tasks), desc="【总体进度】", unit="张",
                 position=0, dynamic_ncols=True, colour="green", leave=True) as pbar_main:

            # 创建任务队列
            from queue import Queue
            task_queue = Queue()
            for task in tasks:
                task_queue.put(task)

            # 为每个账号启动独立的下载协程
            def download_worker(api_name, api_client):
                """每个账号的下载工作线程"""
                nonlocal success_count, fail_count, total_bytes, downloaded_count

                # 为每个下载线程创建独立的数据库连接，避免多线程事务冲突
                from db_manager_v2 import Database
                thread_db = Database(Config.DB_PATH)

                while not self.stop_event.is_set():
                    try:
                        # 从队列获取任务
                        task = task_queue.get(timeout=1)
                    except:
                        # 队列为空，退出
                        break

                    try:
                        # 执行下载任务（使用线程独立的数据库连接）
                        result = self._down_task_with_db(
                            task, thread_db, task_lock, active_tasks,
                            account_position_locks[api_name],
                            account_available_positions[api_name],
                            (api_name, api_client)
                        )

                        with task_lock:
                            if result and result.get('success'):
                                success_count += 1
                                downloaded_count += 1
                                total_bytes += result.get('file_size', 0)
                                self.failure_window.append(1)
                                if self.metrics:
                                    try:
                                        self.metrics['download_success_total'].inc()
                                    except Exception:
                                        pass
                            else:
                                fail_count += 1
                                self.failure_window.append(0)
                                if self.metrics:
                                    try:
                                        self.metrics['download_failure_total'].inc()
                                    except Exception:
                                        pass

                        pbar_main.update(1)

                    except Exception as e:
                        with task_lock:
                            fail_count += 1
                            self.failure_window.append(0)
                        logger.exception(f"账号 {api_name} 下载任务失败: {e}")

                    finally:
                        task_queue.task_done()

            # 启动所有账号的下载线程
            for api_name, api_client in available_apis:
                for _ in range(len(account_positions[api_name])):
                    future = account_executors[api_name].submit(download_worker, api_name, api_client)
                    account_futures[api_name].add(future)

            try:
                # 等待所有任务完成
                task_queue.join()

                # 检查失败率并在必要时触发自动降速/暂停
                try:
                    if self.auto_throttle_enabled and len(self.failure_window) >= 5:
                        fail_rate = 1.0 - (sum(self.failure_window) / len(self.failure_window))
                        threshold = getattr(Config, 'FAILURE_RATE_THRESHOLD', 0.5)
                        if fail_rate >= threshold:
                            pause_s = getattr(Config, 'FAILURE_PAUSE_SECONDS', 10)
                            logger.warning(f"检测到高失败率 {fail_rate:.2%}，自动暂停 {pause_s} 秒以等待恢复")
                            # 暂停所有下载线程
                            self.rate_limit_pause.clear()
                            # 使用可中断睡眠
                            for remaining in range(pause_s - 1, 0, -1):
                                if self.stop_event.is_set():
                                    break
                                try:
                                    if self._sleep(1):
                                        break
                                except Exception:
                                    break
                            self.rate_limit_pause.set()
                except Exception:
                    pass

                # 构建活跃任务显示信息
                with task_lock:
                    active_info = []
                    for ak, av in list(active_tasks.items()):
                        speed_str = f"{av.get('speed', 0):.2f}MB/s" if av.get('speed', 0) > 0 else "检查中"
                        active_info.append(f"{av.get('artist', 'Unknown')[:12]}({av.get('illust_id', 0)}:{speed_str})")

                # 清理完成的活跃任务
                # with task_lock:
                #     active_tasks.pop(t_key, None)

                # 防风控
                wait_seconds = 0
                if getattr(Config, 'RATE_LIMIT_ENABLED', False):
                    rules = getattr(Config, 'RATE_LIMIT_RULES', {})
                    # 优先检查较大的阈值
                    for threshold in sorted(rules.keys(), reverse=True):
                        if downloaded_count > 0 and downloaded_count % threshold == 0:
                            wait_seconds = rules[threshold]
                            break

                # 构建进度条前缀
                if wait_seconds > 0:
                    active_desc = f"【风控休息】{wait_seconds}秒"
                else:
                    active_desc = "【总体进度】"

                # 动态展示统计
                postfix_dict = {
                    "成功": success_count,
                    "失败": fail_count,
                    "已下载": self._format_size(total_bytes),
                    "模式": Config.STORAGE_MODE.upper()
                }

                # 更新进度条
                pbar_main.set_description(active_desc)
                pbar_main.set_postfix(postfix_dict)

                # 风控倒计时
                if wait_seconds > 0:
                    self.rate_limit_pause.clear()  # *** 暂停所有下载线程 ***
                    # 倒计时期间允许用户暂停和中断；暂停时倒计时停止
                    for remaining in range(wait_seconds - 1, 0, -1):
                        if self.stop_event.is_set():
                            break
                        pbar_main.set_description(f"【风控休息】{remaining}秒")
                        pbar_main.set_postfix(postfix_dict)
                        if self._sleep(1):
                            break
                    self.rate_limit_pause.set()  # *** 恢复下载线程 ***
                    # 如果是外部中断，则提前退出主循环
                    if self.stop_event.is_set():
                        task_queue = Queue()  # 清空队列以停止所有worker

            except KeyboardInterrupt:
                logger.info("收到中断信号，正在停止下载任务...")
                self.stop_event.set()
                # 设置全局中断标志，其他模块（如 pixiv_client/storage）会检测到并尽快返回
                try:
                    from interrupt import set as _interrupt_set
                    _interrupt_set()
                except Exception:
                    pass
                # 尝试取消尚未开始的任务
                for api_name in account_futures:
                    for fut in list(account_futures[api_name]):
                        try:
                            fut.cancel()
                        except Exception:
                            pass
            finally:
                # 不等待线程完成以加快退出
                for executor in account_executors.values():
                    try:
                        executor.shutdown(wait=False)
                    except Exception:
                        pass

        print(f"{'='*100}")
        logger.info(f"下载阶段结束。成功: {success_count}, 失败: {fail_count}, 总大小: {self._format_size(total_bytes)}")
        # 根据配置决定是否自动清理临时目录
        try:
            if getattr(Config, 'AUTO_CLEAN_TEMP_AFTER_DOWNLOAD', False):
                self.clean_temp()
        except Exception as e:
            logger.warning(f"自动清理临时目录时发生错误: {e}")

    def _down_task(self, task, task_lock=None, active_tasks=None, position_lock=None, available_positions=None, api_info=None):
        """包含自动重试机制的单图下载任务（安全流程 + 多进度条支持）

        参数:
        - api_info: (api_name, api_client) 元组，用于指定使用哪个账号进行下载

        返回：{'success': bool, 'artist': str, 'illust_id': int, 'file_size': int, 'speed': float}
        """
        # *** 风控暂停点：等待暂停解除 ***
        self.rate_limit_pause.wait()

        # task is now: (task_key, illust_id, page_index, author_id, title, url, media_type, ...)
        # 使用 *others 忽略后续新增的字段（如 create_date, tags 等）
        t_key, iid, idx, aid, title, url, media_type, *others = task

        # 确保aid是有效的整数类型
        try:
            aid = int(aid) if aid is not None else 0
        except (ValueError, TypeError):
            logger.warning(f"无效的author_id: {aid}，使用默认值0")
            aid = 0

        # 获取艺术家信息，添加错误处理
        try:
            _, name, _ = self.db.get_artist(aid)
        except Exception as db_err:
            logger.warning(f"获取艺术家信息失败 {aid}: {db_err}，使用默认名称")
            name = f"Artist_{aid}"
        api_name = api_info[0] if api_info else "unknown"
        if media_type == 'ugoira':
            artist_folder = self.storage.get_artist_folder(aid, self._safe(name))
            folder_name = f"{artist_folder}/动图zip"
        else:
            folder_name = self.storage.get_artist_folder(aid, self._safe(name))

        # 获取ugoira的metadata（如果需要）
        meta = None
        if media_type == 'ugoira':
            try:
                meta = self.db.get_ugoira_data(iid)
            except Exception as e:
                logger.warning(f"获取ugoira元数据失败 {iid}: {e}")

        # 对图片类型保持原有的扩展推断逻辑，以保证与历史已保存图片路径一致
        if media_type == 'image':
            ext = url.split('.')[-1].split('?')[0]
        else:
            # 非图片类型优先通过 HEAD 获取 Content-Type 判断后缀
            ext = self._resolve_extension_for_non_image(url)
        fname = Config.FILENAME_FORMAT.format(illust_id=iid, index=idx, ext=ext, title=self._safe(title))
        rel_file_path = f"{folder_name}/{fname}"

        # 更新活跃任务状态
        if task_lock and active_tasks is not None:
            with task_lock:
                active_tasks[t_key] = {
                    'artist': name,
                    'illust_id': iid,
                    'page': idx,
                    'status': '检查中'
                }

        result = {
            'success': False,
            'artist': name,
            'illust_id': iid,
            'file_size': 0,
            'speed': 0.0
        }

        # 1. 检查最终文件是否已完整下载
        if self.storage.exists(rel_file_path):
            file_size = self.storage.get_file_size(rel_file_path)
            if file_size >= 100:  # 文件存在且大小正常
                # 确保数据库也标记为已下载，并补全文件大小信息
                # 即使状态已经是1，也更新文件大小（防止之前的记录为0）
                try:
                    self.db.mark_status(t_key, 1)
                    self.db.update_file_info(t_key, None, file_size)
                except Exception:
                    pass  # 数据库更新失败不影响已下载文件的成功状态

                result['success'] = True
                result['file_size'] = file_size
                result['speed'] = 0.0  # 跳过下载，速度为0
                return result
            else:
                # 文件存在但损坏，需要重新下载
                logger.warning(f"文件损坏 {rel_file_path} ({file_size} bytes)，将重新下载")

        self.storage.makedirs(folder_name)

        # 标记为正在下载（中间态，避免被并发的另一个实例重复拉取）
        try:
            self.db.mark_status(t_key, 2)
        except Exception:
            pass

        # 若为小说，使用 Pixiv API 获取并保存为 .txt/.html（无需走 HTTP GET）
        if media_type == 'novel':
            try:
                plain = None
                html = None

                # 优先使用 novel_text 接口获取正文（novel_detail 通常不包含完整正文）
                try:
                    rest, err_text = self.client.wrap_with_error(self.api.novel_text, novel_id=iid)
                    if rest:
                        if hasattr(rest, 'novel_text'):
                            v = getattr(rest, 'novel_text', None)
                            if v and isinstance(v, str) and v.strip():
                                plain = v
                        elif isinstance(rest, dict):
                            v = rest.get('novel_text') or rest.get('text') or rest.get('body')
                            if v and isinstance(v, str) and v.strip():
                                plain = v
                    elif err_text:
                        logger.warning(f"小说正文获取失败 {iid}: {err_text}")
                except Exception as e:
                    logger.warning(f"小说正文获取异常 {iid}: {e}")

                # 若 novel_text 未取到，再尝试 novel_detail 的字段
                resn, err_detail = self.client.wrap_with_error(self.api.novel_detail, novel_id=iid)
                if not resn:
                    raise Exception(f"无法获取小说信息：API 请求失败: {err_detail}")

                # 获取小说对象
                novel = None
                if hasattr(resn, 'novel') and resn.novel:
                    novel = resn.novel
                elif isinstance(resn, dict) and 'novel' in resn:
                    novel = resn['novel']

                if not novel:
                    raise Exception('未能从响应中提取小说对象')

                # 多层次的字段提取策略（仅在 plain 为空时执行）
                if not plain:
                    for plain_field in ('body_plain_text', 'plain_text', 'text', 'body', 'content'):
                        if hasattr(novel, plain_field):
                            v = getattr(novel, plain_field, None)
                            if v and isinstance(v, str) and v.strip():
                                plain = v
                                break
                        elif isinstance(novel, dict) and plain_field in novel:
                            v = novel.get(plain_field)
                            if v and isinstance(v, str) and v.strip():
                                plain = v
                                break

                # 尝试获取HTML字段
                for html_field in ('body', 'html', 'content_html', 'caption'):
                    if hasattr(novel, html_field):
                        v = getattr(novel, html_field, None)
                        if v and isinstance(v, str) and v.strip() and html_field != 'caption':
                            html = v
                            break
                    elif isinstance(novel, dict) and html_field in novel:
                        v = novel.get(html_field)
                        if v and isinstance(v, str) and v.strip() and html_field != 'caption':
                            html = v
                            break

                # 若没有纯文本，从HTML去标签
                if not plain and html:
                    try:
                        import re
                        # 更好的HTML标签去除（保留换行）
                        plain = re.sub(r'<[^>]+>', '\n', html)
                        plain = '\n'.join(line.strip() for line in plain.split('\n') if line.strip())
                    except Exception:
                        plain = html

                # 最后的验证：内容不能为空
                if not plain:
                    raise Exception('未能提取到小说内容（所有字段均为空）')

                # 保存为 txt
                txt_fname = Config.FILENAME_FORMAT.format(illust_id=iid, index=idx, ext='txt', title=self._safe(title))
                rel_txt = f"{folder_name}/{txt_fname}"
                txt_bytes = plain.encode('utf-8')
                try:
                    self.storage.save_atomic(rel_txt, txt_bytes)
                except Exception as save_err:
                    raise Exception(f"保存TXT文件失败: {save_err}")

                # 若有 html，额外保存一份 html
                if html:
                    try:
                        html_fname = Config.FILENAME_FORMAT.format(illust_id=iid, index=idx, ext='html', title=self._safe(title))
                        rel_html = f"{folder_name}/{html_fname}"
                        self.storage.save_atomic(rel_html, html.encode('utf-8'))
                    except Exception as html_err:
                        logger.warning(f"保存HTML文件失败 {iid}: {html_err}")

                # 标记为已下载
                try:
                    self.db.mark_status(t_key, 1)
                    self.db.update_file_info(t_key, None, len(txt_bytes))
                except Exception as db_err:
                    logger.warning(f"数据库更新失败 {iid}: {db_err}")

                result['success'] = True
                result['file_size'] = len(txt_bytes)
                result['speed'] = 0.0
                return result
            except Exception as e:
                logger.error(f"小说下载失败 {iid}: {e}")
                try:
                    self.db.mark_status(t_key, -1)
                except Exception:
                    pass
                return result

        # 申请一个进度条位置
        pbar_pos = None
        if position_lock and available_positions:
            with position_lock:
                if available_positions:
                    pbar_pos = available_positions.pop(0)

        # 创建该文件的下载进度条
        pbar_file = None
        if pbar_pos is not None:
            pbar_file = tqdm(total=0, desc=f"[{api_name[:5]}] [{name[:10]}] {iid}_p{idx}", unit="B", unit_scale=True,
                           position=pbar_pos, leave=False)

        # 2. 带重试的下载逻辑
        # 在进行实际下载前，尝试获取对应 host 的并发令牌以限制对同一 host 的并发请求
        host_sem = self._get_host_semaphore(url)
        if host_sem:
            acquired = host_sem.acquire(timeout=30)
            if not acquired:
                logger.warning(f"无法在合理时间内获得主机并发令牌，跳过 {url}")
                try:
                    self.db.mark_status(t_key, -1)
                except:
                    pass
                if pbar_file:
                    pbar_file.close()
                if position_lock and pbar_pos is not None:
                    with position_lock:
                        available_positions.append(pbar_pos)
                return result
        try:
            for attempt in range(Config.MAX_RETRIES):
                try:
                    # 更新状态：下载中
                    if task_lock and active_tasks is not None:
                        with task_lock:
                            active_tasks[t_key] = {
                                'artist': name,
                                'illust_id': iid,
                                'page': idx,
                                'status': f"下载中 (重试 {attempt+1}/{Config.MAX_RETRIES})",
                                'speed': 0.0,
                                'pbar': pbar_file
                            }

                    start_time = time.time()

                    # 处理ugoira占位符URL
                    if url.startswith('ugoira://'):
                        illust_id_from_url = url.split('://')[1]
                        try:
                            # 获取ugoira元数据
                            meta_res = self.api.ugoira_metadata(illust_id_from_url)
                            if meta_res and hasattr(meta_res, 'ugoira_metadata'):
                                meta = meta_res.ugoira_metadata
                                if meta and hasattr(meta, 'zip_urls'):
                                    zip_url = getattr(meta.zip_urls, 'original', None) or getattr(meta.zip_urls, 'medium', None)
                                    if zip_url:
                                        url = zip_url
                                        logger.info(f"获取到ugoira真实URL: {url}")
                                    else:
                                        raise Exception("无法获取zip_url")
                                else:
                                    raise Exception("无zip_urls")
                            else:
                                raise Exception("API返回无效")
                        except Exception as e:
                            logger.warning(f"获取ugoira真实URL失败 {illust_id_from_url}: {e}")
                            # 保持占位符URL，会导致下载失败，但至少记录了尝试

                    # 使用 stream=True 来支持分块下载和进度条
                    resp = self.session.get(url, timeout=20, stream=True)

                    # 如果不是 200，直接抛出异常以触发重试/失败逻辑
                    if resp.status_code != 200:
                        if pbar_file:
                            pbar_file.close()
                        raise Exception(f"HTTP {resp.status_code}")

                    # 获取文件总大小
                    total_size = int(resp.headers.get('content-length', 0))
                    if total_size > 0 and pbar_file:
                        pbar_file.total = total_size

                    # 分块下载，实时更新进度
                    downloaded = 0
                    chunks = []
                    for chunk in resp.iter_content(chunk_size=8192):
                        if chunk:
                            chunks.append(chunk)
                            downloaded += len(chunk)
                            # 更新文件进度条
                            if pbar_file:
                                pbar_file.update(len(chunk))

                    data_bytes = b''.join(chunks)

                    # 验证下载内容
                    if len(data_bytes) < 100:
                        raise Exception("下载文件过小（可能被拦截）")

                    # 计算文件哈希（用于校验和记录，不用于去重）
                    # 注意：单个文件哈希相同不代表作品相同，不能跳过下载
                    # 只有整个作品的所有图片都相同时才能跳过
                    import hashlib
                    file_hash = hashlib.sha256(data_bytes).hexdigest()

                    # 3. 原子保存
                    try:
                        success, local_file_path = self.storage.save_atomic(rel_file_path, data_bytes)
                        download_time = time.time() - start_time
                        file_size = len(data_bytes)
                        speed_mbps = (file_size / 1024 / 1024) / download_time if download_time > 0 else 0

                        # 更新活跃任务中的速度信息
                        if task_lock and active_tasks is not None:
                            with task_lock:
                                if t_key in active_tasks:
                                    active_tasks[t_key]['speed'] = speed_mbps

                        # 关闭文件进度条
                        if pbar_file:
                            pbar_file.close()

                        # 如果是 Ugoira，尝试在本地转换为 WebP（如果可用）
                        if media_type == 'ugoira':
                            # 增量恢复检查：如果WebP和ZIP都已存在，跳过整个转换过程
                            base_no_ext = Path(rel_file_path).stem
                            webp_rel = f"{artist_folder}/{base_no_ext}.webp"
                            zip_rel = f"{folder_name}/{base_no_ext}.zip"

                            webp_exists = self.storage.exists(webp_rel)
                            zip_exists = self.storage.exists(zip_rel)

                            if webp_exists and zip_exists:
                                # 两个文件都存在，检查大小
                                try:
                                    webp_size = self.storage.get_file_size(webp_rel)
                                    zip_size = self.storage.get_file_size(zip_rel)
                                    if webp_size >= 100 and zip_size >= 100:
                                        logger.info(f"Ugoira文件已完整存在，跳过转换: {webp_rel}")
                                        # 标记为已下载
                                        self.db.mark_status(t_key, 1)
                                        result['success'] = True
                                        result['file_size'] = webp_size + zip_size
                                        result['speed'] = 0.0
                                        return result
                                except Exception as check_err:
                                    logger.warning(f"检查ugoira文件大小时出错: {check_err}")
                                    # 继续执行转换流程

                            if url.startswith('ugoira://'):
                                illust_id = url.split('://')[1]
                                try:
                                    meta_res = self.api.ugoira_metadata(illust_id)
                                    if meta_res and hasattr(meta_res, 'ugoira_metadata'):
                                        meta_obj = meta_res.ugoira_metadata
                                        if hasattr(meta_obj, 'zip_urls'):
                                            url = getattr(meta_obj.zip_urls, 'original', None) or getattr(meta_obj.zip_urls, 'medium', None)
                                        if not url:
                                            url = getattr(meta_obj, 'original_src', None) or getattr(meta_obj, 'src', None)
                                        # 更新meta
                                        import json
                                        meta = json.dumps(meta_obj.__dict__ if hasattr(meta_obj, '__dict__') else meta_obj)
                                    else:
                                        raise Exception("无法获取ugoira_metadata")
                                except Exception as e:
                                    logger.error(f"获取ugoira zip_url失败 {illust_id}: {e}")
                                    try:
                                        self.db.mark_status(t_key, -1)
                                    except:
                                        pass
                                    return result
                            try:
                                # 修复路径构造：SMB模式下local_file_path已经是完整本地路径

                                # 判断是否为完整路径（SMB模式）还是相对路径（本地模式）
                                if isinstance(local_file_path, str) and os.path.isabs(local_file_path):
                                    # SMB模式：local_file_path是完整的本地临时文件路径
                                    local_zip = local_file_path
                                else:
                                    # 本地模式：local_file_path是相对路径
                                    local_zip = str(Path(Config.LOCAL_SAVE_PATH) / local_file_path)

                                # 确保ZIP文件存在且完整
                                if not os.path.exists(local_zip) or os.path.getsize(local_zip) < 100:
                                    raise Exception(f"ZIP文件不存在或不完整: {local_zip}")

                                # 创建ugoira转换的文件锁，防止并发冲突
                                ugoira_lock = threading.Lock()
                                with ugoira_lock:
                                    webp_local = self._convert_ugoira(local_zip, meta, folder_name)

                                    # 确保webp文件成功生成
                                    if not os.path.exists(webp_local) or os.path.getsize(webp_local) < 100:
                                        raise Exception(f"WebP转换失败或文件不完整: {webp_local}")

                                # webp 保存到目标目录
                                base_no_ext = Path(rel_file_path).stem
                                webp_rel = f"{artist_folder}/{base_no_ext}.webp"

                                # 分离WebP和ZIP的上传，允许部分失败
                                webp_success = False
                                zip_success = False

                                try:
                                    if self.storage.is_remote():
                                        self.storage.upload_remote(webp_local, webp_rel)
                                    else:
                                        # 本地模式：原子保存 webp
                                        with open(webp_local, 'rb') as gf:
                                            webp_bytes = gf.read()
                                        self.storage.save_atomic(webp_rel, webp_bytes)
                                    webp_success = True
                                    logger.info(f"Ugoira WebP已保存: {webp_rel}")
                                except Exception as webp_err:
                                    logger.error(f"WebP保存失败 {iid}: {webp_err}")
                                    # WebP失败时不立即返回，继续尝试ZIP

                                # 保存zip到动图zip文件夹
                                zip_rel = f"{folder_name}/{base_no_ext}.zip"
                                try:
                                    if self.storage.is_remote():
                                        # 再次检查ZIP文件是否存在（防止并发删除）
                                        if not os.path.exists(local_zip):
                                            raise Exception(f"ZIP文件在上传前被删除: {local_zip}")
                                        self.storage.upload_remote(local_zip, zip_rel)
                                    else:
                                        # 本地模式：复制zip
                                        zip_folder = os.path.join(Config.LOCAL_SAVE_PATH, folder_name)
                                        os.makedirs(zip_folder, exist_ok=True)
                                        zip_dest = os.path.join(zip_folder, base_no_ext + '.zip')
                                        import shutil
                                        shutil.copy(local_zip, zip_dest)
                                    zip_success = True
                                    logger.info(f"Ugoira ZIP已保存: {zip_rel}")
                                except Exception as zip_err:
                                    logger.error(f"ZIP保存失败 {iid}: {zip_err}")

                                # 根据上传结果决定任务状态
                                if webp_success and zip_success:
                                    logger.info(f"Ugoira 已完整转换并保存: {webp_rel}")
                                elif webp_success and not zip_success:
                                    logger.warning(f"Ugoira WebP保存成功但ZIP保存失败: {iid} - WebP: {webp_rel}")
                                    # 标记为部分成功，但允许重试（仍标记为失败以便重试ZIP）
                                else:
                                    raise Exception("WebP和ZIP都保存失败")

                                # 只有在完全成功时才删除临时文件
                                if webp_success and zip_success:
                                    try:
                                        # 获取 webp 所在的临时目录
                                        webp_temp_dir = os.path.dirname(webp_local)
                                        # 删除整个临时目录（包含解压的帧图片和生成的 webp）
                                        import shutil
                                        if os.path.exists(webp_temp_dir) and 'ugoira_' in webp_temp_dir:
                                            shutil.rmtree(webp_temp_dir)
                                        # 远端协议模式下还需要删除下载的 ZIP 本地缓存
                                        if self.storage.is_remote() and os.path.exists(local_zip):
                                            Path(local_zip).unlink(missing_ok=True)
                                    except Exception as cleanup_err:
                                        logger.warning(f"清理临时文件失败: {cleanup_err}")

                            except Exception as e:
                                logger.warning(f"Ugoira 转换失败或被跳过: {e}")
                                # 转换失败时仍继续到正常的远端上传逻辑

                        # 4. 如果是远端协议模式，上传本地缓存文件到目标存储
                        if self.storage.is_remote():
                            try:
                                # 更新状态：上传中
                                if task_lock and active_tasks is not None:
                                    with task_lock:
                                        if t_key in active_tasks:
                                            active_tasks[t_key]['status'] = '上传中'

                                self.storage.upload_remote(local_file_path, rel_file_path)

                                # 5. 远端上传成功后，先更新数据库再删除本地缓存
                                # 关键顺序：DB 更新 → 本地删除（这样即使删除失败，DB 已标记，下次扫描时会识别为缺失并重下）
                                self.db.mark_status(t_key, 1)

                                # 删除本地临时缓存文件
                                try:
                                    Path(local_file_path).unlink(missing_ok=True)
                                except:
                                    logger.warning(f"删除本地缓存失败: {local_file_path}")
                            except Exception as upload_e:
                                # 远端上传失败，保留本地文件以便重试，标记为失败状态
                                logger.error(f"远端上传失败 {iid}_p{idx}: {upload_e}")
                                self.db.mark_status(t_key, -1)
                                result['success'] = False
                                return result
                        else:
                            # 本地模式：直接标记为已下载
                            self.db.mark_status(t_key, 1)
                            if media_type == 'ugoira':
                                logger.info(f"动图(Ugoira)文件已保存（未转换）: {iid}_p{idx} -> {rel_file_path}")


                        # 更新结果
                        result['success'] = True
                        result['file_size'] = file_size
                        result['speed'] = speed_mbps

                        # 更新 DB 中的 file_hash 与 file_size
                        try:
                            self.db.update_file_info(t_key, file_hash, file_size)
                        except Exception:
                            pass

                        if Config.DOWNLOAD_THREADS == 1:
                            if self._sleep(random.uniform(*Config.DELAY_DOWNLOAD)):
                                return result

                        # 释放进度条位置
                        if position_lock and pbar_pos is not None:
                            with position_lock:
                                available_positions.append(pbar_pos)

                        return result
                    except Exception as save_e:
                        # 关闭进度条
                        if pbar_file:
                            pbar_file.close()
                        raise Exception(f"保存失败: {save_e}")
                    else:
                        # 关闭进度条
                        if pbar_file:
                            pbar_file.close()
                        raise Exception(f"HTTP {resp.status_code}")
                except Exception as e:
                    # 对于网络/连接类错误，在重试前加短时等待
                    import time, socket, requests
                    err_str = str(e).lower()
                    if ('10053' in err_str) or ('aborted' in err_str) or isinstance(e, (requests.exceptions.ConnectionError, requests.exceptions.ChunkedEncodingError, socket.error, OSError)):
                        back = min(8, pow(2, attempt))
                        logger.warning(f"网络错误检测到，等待 {back}s 再重试: {e}")
                        time.sleep(back)

                    if attempt == Config.MAX_RETRIES - 1:
                        logger.error(f"彻底失败 {iid}_p{idx} after {attempt+1} tries: {e}")
                        # 增加 attempts 计数
                        try:
                            new_attempts = self.db.increment_attempts(t_key)
                            logger.info(f"任务 {t_key} attempts 增加到 {new_attempts}")
                        except Exception:
                            pass
                        # 关闭进度条
                        if pbar_file:
                            pbar_file.close()
                        # 释放进度条位置
                        if position_lock and pbar_pos is not None:
                            with position_lock:
                                available_positions.append(pbar_pos)
                        # 失败后标记为 -1（失败状态），下次可重新尝试（或由回收逻辑判断永久失败）
                        self.db.mark_status(t_key, -1)
                        result['success'] = False
                        return result

                    if task_lock and active_tasks is not None:
                        with task_lock:
                            wait_time = pow(2, attempt)
                            active_tasks[t_key]['status'] = f"等待重试 ({wait_time}s)"
                    # 发生异常并重试时也可以记录尝试次数（选项）。当前仅在彻底失败时增加 attempts，以避免短暂网络波动导致快速达到上限。
                    if self._sleep(pow(2, attempt)):
                        return result

        finally:
            if host_sem:
                try:
                    host_sem.release()
                except Exception:
                    pass

        # 清理资源
        if pbar_file:
            pbar_file.close()
        if position_lock and pbar_pos is not None:
            with position_lock:
                available_positions.append(pbar_pos)

        return result

    def _down_task_with_db(self, task, db_conn, task_lock=None, active_tasks=None, position_lock=None, available_positions=None, api_info=None):
        """包含自动重试机制的单图下载任务（安全流程 + 多进度条支持）- 使用指定的数据库连接

        参数:
        - db_conn: 数据库连接实例
        - api_info: (api_name, api_client) 元组，用于指定使用哪个账号进行下载

        返回：{'success': bool, 'artist': str, 'illust_id': int, 'file_size': int, 'speed': float}
        """
        # *** 风控暂停点：等待暂停解除 ***
        self.rate_limit_pause.wait()

        # task is now: (task_key, illust_id, page_index, author_id, title, url, media_type, ...)
        # 使用 *others 忽略后续新增的字段（如 create_date, tags 等）
        t_key, iid, idx, aid, title, url, media_type, *others = task

        # 确保aid是有效的整数类型
        try:
            aid = int(aid) if aid is not None else 0
        except (ValueError, TypeError):
            logger.warning(f"无效的author_id: {aid}，使用默认值0")
            aid = 0

        # 获取艺术家信息，添加错误处理
        try:
            _, name, _ = db_conn.get_artist(aid)
        except Exception as db_err:
            logger.warning(f"获取艺术家信息失败 {aid}: {db_err}，使用默认名称")
            name = f"Artist_{aid}"
        api_name = api_info[0] if api_info else "unknown"
        if media_type == 'ugoira':
            artist_folder = self.storage.get_artist_folder(aid, self._safe(name))
            folder_name = f"{artist_folder}/动图zip"
        else:
            folder_name = self.storage.get_artist_folder(aid, self._safe(name))

        # 获取ugoira的metadata（如果需要）
        meta = None
        if media_type == 'ugoira':
            try:
                meta = db_conn.get_ugoira_data(iid)
            except Exception as e:
                logger.warning(f"获取ugoira元数据失败 {iid}: {e}")

        # 对图片类型保持原有的扩展推断逻辑，以保证与历史已保存图片路径一致
        if media_type == 'image':
            ext = url.split('.')[-1].split('?')[0]
        else:
            # 非图片类型优先通过 HEAD 获取 Content-Type 判断后缀
            ext = self._resolve_extension_for_non_image(url)
        fname = Config.FILENAME_FORMAT.format(illust_id=iid, index=idx, ext=ext, title=self._safe(title))
        rel_file_path = f"{folder_name}/{fname}"

        # 更新活跃任务状态
        if task_lock and active_tasks is not None:
            with task_lock:
                active_tasks[t_key] = {
                    'artist': name,
                    'illust_id': iid,
                    'page': idx,
                    'status': '检查中'
                }

        result = {
            'success': False,
            'artist': name,
            'illust_id': iid,
            'file_size': 0,
            'speed': 0.0
        }

        # 1. 检查最终文件是否已完整下载
        if self.storage.exists(rel_file_path):
            file_size = self.storage.get_file_size(rel_file_path)
            if file_size >= 100:  # 文件存在且大小正常
                # 确保数据库也标记为已下载，并补全文件大小信息
                # 即使状态已经是1，也更新文件大小（防止之前的记录为0）
                try:
                    db_conn.mark_status(t_key, 1)
                    db_conn.update_file_info(t_key, None, file_size)
                except Exception:
                    pass  # 数据库更新失败不影响已下载文件的成功状态

                result['success'] = True
                result['file_size'] = file_size
                result['speed'] = 0.0  # 跳过下载，速度为0
                return result
            else:
                # 文件存在但损坏，需要重新下载
                logger.warning(f"文件损坏 {rel_file_path} ({file_size} bytes)，将重新下载")

        self.storage.makedirs(folder_name)

        # 申请一个进度条位置
        pbar_pos = None
        if position_lock and available_positions:
            with position_lock:
                if available_positions:
                    pbar_pos = available_positions.pop(0)

        # 创建该文件的下载进度条
        pbar_file = None
        if pbar_pos is not None:
            pbar_file = tqdm(total=0, desc=f"[{api_name[:5]}] [{name[:10]}] {iid}_p{idx}", unit="B", unit_scale=True,
                           position=pbar_pos, leave=False)

        # 2. 带重试的下载逻辑
        # 在进行实际下载前，尝试获取对应 host 的并发令牌以限制对同一 host 的并发请求
        host_sem = self._get_host_semaphore(url)
        if host_sem:
            acquired = host_sem.acquire(timeout=30)
            if not acquired:
                logger.warning(f"获取host信号量超时: {url}")
                if pbar_file:
                    pbar_file.close()
                if position_lock and pbar_pos is not None:
                    with position_lock:
                        available_positions.append(pbar_pos)
                return result

        try:
            for attempt in range(Config.MAX_RETRIES):
                start_time = time.time()  # 记录下载开始时间
                try:
                    # 处理ugoira占位符URL
                    illust_id_from_url = None  # 初始化变量
                    if url.startswith('ugoira://'):
                        illust_id_from_url = url.split('://')[1]
                        try:
                            # 获取ugoira元数据
                            meta_res = self.api.ugoira_metadata(illust_id_from_url)
                            if meta_res and hasattr(meta_res, 'ugoira_metadata'):
                                meta = meta_res.ugoira_metadata
                                if meta and hasattr(meta, 'zip_urls'):
                                    zip_url = getattr(meta.zip_urls, 'original', None) or getattr(meta.zip_urls, 'medium', None)
                                    if zip_url:
                                        url = zip_url
                                        logger.info(f"获取到ugoira真实URL: {url}")
                                    else:
                                        raise Exception("无法获取zip_url")
                                else:
                                    raise Exception("无zip_urls")
                            else:
                                raise Exception("API返回无效")
                        except Exception as e:
                            logger.warning(f"获取ugoira真实URL失败 {illust_id_from_url}: {e}")
                            # 保持占位符URL，会导致下载失败，但至少记录了尝试

                    # 使用 stream=True 来支持分块下载和进度条
                    resp = self.session.get(url, timeout=20, stream=True)

                    # 如果不是 200，直接抛出异常以触发重试/失败逻辑
                    if resp.status_code != 200:
                        if pbar_file:
                            pbar_file.close()
                        raise Exception(f"HTTP {resp.status_code}")

                    # 获取文件总大小
                    total_size = int(resp.headers.get('content-length', 0))
                    if total_size > 0 and pbar_file:
                        pbar_file.total = total_size

                    # 分块下载，实时更新进度
                    downloaded = 0
                    chunks = []
                    for chunk in resp.iter_content(chunk_size=8192):
                        if chunk:
                            chunks.append(chunk)
                            downloaded += len(chunk)
                            # 更新文件进度条
                            if pbar_file:
                                pbar_file.update(len(chunk))

                    data_bytes = b''.join(chunks)

                    # 验证下载内容
                    if len(data_bytes) < 100:
                        raise Exception("下载文件过小（可能被拦截）")

                    # 计算文件哈希（用于校验和记录，不用于去重）
                    # 注意：单个文件哈希相同不代表作品相同，不能跳过下载
                    # 只有整个作品的所有图片都相同时才能跳过
                    import hashlib
                    file_hash = hashlib.sha256(data_bytes).hexdigest()

                    # 3. 原子保存
                    success, local_file_path = self.storage.save_atomic(rel_file_path, data_bytes)
                    download_time = time.time() - start_time
                    file_size = len(data_bytes)
                    speed_mbps = (file_size / 1024 / 1024) / download_time if download_time > 0 else 0

                    # 更新活跃任务中的速度信息
                    if task_lock and active_tasks is not None:
                        with task_lock:
                            active_tasks[t_key]['speed'] = speed_mbps

                    # 关闭文件进度条
                    if pbar_file:
                        pbar_file.close()

                    # 如果是 Ugoira，尝试在本地转换为 WebP（如果可用）
                    if media_type == 'ugoira':
                        # 增量恢复检查：如果WebP和ZIP都已存在，跳过整个转换过程
                        base_no_ext = Path(rel_file_path).stem
                        webp_rel = f"{artist_folder}/{base_no_ext}.webp"
                        zip_rel = f"{folder_name}/{base_no_ext}.zip"

                        webp_exists = self.storage.exists(webp_rel)
                        zip_exists = self.storage.exists(zip_rel)

                        if webp_exists and zip_exists:
                            # 两个文件都存在，检查大小
                            try:
                                webp_size = self.storage.get_file_size(webp_rel)
                                zip_size = self.storage.get_file_size(zip_rel)
                                if webp_size >= 100 and zip_size >= 100:
                                    logger.info(f"Ugoira文件已完整存在，跳过转换: {webp_rel}")
                                    # 标记为已下载
                                    db_conn.mark_status(t_key, 1)
                                    result['success'] = True
                                    result['file_size'] = webp_size + zip_size
                                    result['speed'] = 0.0
                                    return result
                            except Exception as check_err:
                                logger.warning(f"检查ugoira文件大小时出错: {check_err}")
                                # 继续执行转换流程

                        if url.startswith('ugoira://'):
                            illust_id = url.split('://')[1]
                            try:
                                meta_res = self.api.ugoira_metadata(illust_id)
                                if meta_res and hasattr(meta_res, 'ugoira_metadata'):
                                    meta_obj = meta_res.ugoira_metadata
                                    if hasattr(meta_obj, 'zip_urls'):
                                        zip_url = getattr(meta_obj.zip_urls, 'original', None) or getattr(meta_obj.zip_urls, 'medium', None)
                                        if zip_url:
                                            url = zip_url
                                            logger.info(f"获取到ugoira真实URL: {url}")
                                        else:
                                            raise Exception("无法获取zip_url")
                                    else:
                                        raise Exception("无zip_urls")
                                else:
                                    raise Exception("API返回无效")
                            except Exception as e:
                                logger.error(f"获取ugoira zip_url失败 {illust_id}: {e}")
                                try:
                                    db_conn.mark_status(t_key, -1)
                                except:
                                    pass
                                return result
                        try:
                            # 修复路径构造：SMB模式下local_file_path已经是完整本地路径

                            # 判断是否为完整路径（SMB模式）还是相对路径（本地模式）
                            if isinstance(local_file_path, str) and os.path.isabs(local_file_path):
                                # SMB模式：local_file_path是完整的本地临时文件路径
                                local_zip = local_file_path
                            else:
                                # 本地模式：local_file_path是相对路径
                                local_zip = str(Path(Config.LOCAL_SAVE_PATH) / local_file_path)

                            # 确保ZIP文件存在且完整
                            if not os.path.exists(local_zip) or os.path.getsize(local_zip) < 100:
                                raise Exception(f"ZIP文件不存在或不完整: {local_zip}")

                            # 创建ugoira转换的文件锁，防止并发冲突
                            ugoira_lock = threading.Lock()
                            with ugoira_lock:
                                webp_local = self._convert_ugoira(local_zip, meta, folder_name)

                                # 确保webp文件成功生成
                                if not os.path.exists(webp_local) or os.path.getsize(webp_local) < 100:
                                    raise Exception(f"WebP转换失败或文件不完整: {webp_local}")

                            # webp 保存到目标目录
                            base_no_ext = Path(rel_file_path).stem
                            webp_rel = f"{artist_folder}/{base_no_ext}.webp"

                            # 分离WebP和ZIP的上传，允许部分失败
                            webp_success = False
                            zip_success = False

                            try:
                                if self.storage.is_remote():
                                    self.storage.upload_remote(webp_local, webp_rel)
                                else:
                                    # 本地模式：原子保存 webp
                                    with open(webp_local, 'rb') as gf:
                                        webp_bytes = gf.read()
                                    self.storage.save_atomic(webp_rel, webp_bytes)
                                webp_success = True
                                logger.info(f"Ugoira WebP已保存: {webp_rel}")
                            except Exception as webp_err:
                                logger.error(f"WebP保存失败 {iid}: {webp_err}")
                                # WebP失败时不立即返回，继续尝试ZIP

                            # 保存zip到动图zip文件夹
                            zip_rel = f"{folder_name}/{base_no_ext}.zip"
                            try:
                                if self.storage.is_remote():
                                    # 再次检查ZIP文件是否存在（防止并发删除）
                                    if not os.path.exists(local_zip):
                                        raise Exception(f"ZIP文件在上传前被删除: {local_zip}")
                                    self.storage.upload_remote(local_zip, zip_rel)
                                else:
                                    # 本地模式：复制zip
                                    zip_folder = os.path.join(Config.LOCAL_SAVE_PATH, folder_name)
                                    os.makedirs(zip_folder, exist_ok=True)
                                    zip_dest = os.path.join(zip_folder, base_no_ext + '.zip')
                                    import shutil
                                    shutil.copy(local_zip, zip_dest)
                                zip_success = True
                                logger.info(f"Ugoira ZIP已保存: {zip_rel}")
                            except Exception as zip_err:
                                logger.error(f"ZIP保存失败 {iid}: {zip_err}")

                            # 根据上传结果决定任务状态
                            if webp_success and zip_success:
                                logger.info(f"Ugoira 已完整转换并保存: {webp_rel}")
                            elif webp_success and not zip_success:
                                logger.warning(f"Ugoira WebP保存成功但ZIP保存失败: {iid} - WebP: {webp_rel}")
                                # 标记为部分成功，但允许重试（仍标记为失败以便重试ZIP）
                            else:
                                raise Exception("WebP和ZIP都保存失败")

                            # 只有在完全成功时才删除临时文件
                            if webp_success and zip_success:
                                try:
                                    # 获取 webp 所在的临时目录
                                    webp_temp_dir = os.path.dirname(webp_local)
                                    # 删除整个临时目录（包含解压的帧图片和生成的 webp）
                                    import shutil
                                    if os.path.exists(webp_temp_dir) and 'ugoira_' in webp_temp_dir:
                                        shutil.rmtree(webp_temp_dir)
                                    # 远端协议模式下还需要删除下载的 ZIP 本地缓存
                                    if self.storage.is_remote() and os.path.exists(local_zip):
                                        Path(local_zip).unlink(missing_ok=True)
                                except Exception as cleanup_err:
                                    logger.warning(f"清理临时文件失败: {cleanup_err}")

                        except Exception as e:
                            logger.warning(f"Ugoira 转换失败或被跳过: {e}")
                            # 转换失败时仍继续到正常的远端上传逻辑

                    # 4. 如果是远端协议模式，上传本地缓存文件到目标存储
                    if self.storage.is_remote():
                        try:
                            # 更新状态：上传中
                            if task_lock and active_tasks is not None:
                                with task_lock:
                                    if t_key in active_tasks:
                                        active_tasks[t_key]['status'] = '上传中'

                            self.storage.upload_remote(local_file_path, rel_file_path)

                            # 5. 远端上传成功后，先更新数据库再删除本地缓存
                            # 关键顺序：DB 更新 → 本地删除（这样即使删除失败，DB 已标记，下次扫描时会识别为缺失并重下）
                            db_conn.mark_status(t_key, 1)

                            # 删除本地临时缓存文件
                            try:
                                Path(local_file_path).unlink(missing_ok=True)
                            except:
                                logger.warning(f"删除本地缓存失败: {local_file_path}")
                        except Exception as upload_e:
                            # 远端上传失败，保留本地文件以便重试，标记为失败状态
                            logger.error(f"远端上传失败 {iid}_p{idx}: {upload_e}")
                            db_conn.mark_status(t_key, -1)
                            result['success'] = False
                            return result
                    else:
                        # 本地模式：直接标记为已下载
                        db_conn.mark_status(t_key, 1)
                        if media_type == 'ugoira':
                            logger.info(f"动图(Ugoira)文件已保存（未转换）: {iid}_p{idx} -> {rel_file_path}")


                    # 更新结果
                    result['success'] = True
                    result['file_size'] = file_size
                    result['speed'] = speed_mbps

                    # 更新 DB 中的 file_hash 与 file_size
                    try:
                        db_conn.update_file_info(t_key, file_hash, file_size)
                    except Exception:
                        pass

                    if Config.DOWNLOAD_THREADS == 1:
                        if self._sleep(random.uniform(*Config.DELAY_DOWNLOAD)):
                            return result

                except Exception as e:
                    err_str = str(e)
                    if attempt < Config.MAX_RETRIES - 1:
                        # 网络相关错误重试
                        if ('10053' in err_str) or ('aborted' in err_str) or isinstance(e, (requests.exceptions.ConnectionError, requests.exceptions.ChunkedEncodingError, socket.error, OSError)):
                            back = min(8, pow(2, attempt))
                            logger.warning(f"网络错误检测到，等待 {back}s 再重试: {e}")
                            time.sleep(back)

                        if task_lock and active_tasks is not None:
                            with task_lock:
                                wait_time = pow(2, attempt)
                                active_tasks[t_key]['status'] = f"等待重试 ({wait_time}s)"
                        # 发生异常并重试时也可以记录尝试次数（选项）。当前仅在彻底失败时增加 attempts，以避免短暂网络波动导致快速达到上限。
                        if self._sleep(pow(2, attempt)):
                            return result
                    else:
                        logger.error(f"彻底失败 {iid}_p{idx} after {attempt+1} tries: {e}")
                        # 增加 attempts 计数
                        try:
                            new_attempts = db_conn.increment_attempts(t_key)
                            logger.info(f"任务 {t_key} attempts 增加到 {new_attempts}")
                        except Exception:
                            pass
                        # 关闭进度条
                        if pbar_file:
                            pbar_file.close()
                        # 释放进度条位置
                        if position_lock and pbar_pos is not None:
                            with position_lock:
                                available_positions.append(pbar_pos)
                        # 失败后标记为 -1（失败状态），下次可重新尝试（或由回收逻辑判断永久失败）
                        db_conn.mark_status(t_key, -1)
                        result['success'] = False
                        return result

                    if task_lock and active_tasks is not None:
                        with task_lock:
                            wait_time = pow(2, attempt)
                            active_tasks[t_key]['status'] = f"等待重试 ({wait_time}s)"
                    # 发生异常并重试时也可以记录尝试次数（选项）。当前仅在彻底失败时增加 attempts，以避免短暂网络波动导致快速达到上限。
                    if self._sleep(pow(2, attempt)):
                        return result

        finally:
            if host_sem:
                try:
                    host_sem.release()
                except Exception:
                    pass

        # 清理资源
        if pbar_file:
            pbar_file.close()
        if position_lock and pbar_pos is not None:
            with position_lock:
                available_positions.append(pbar_pos)

        return result

    def verify_storage(self):
        """核查模式：检查所有任务，双向验证数据库与存储一致性

        检查项：
        1. 数据库'已下载' 但 文件缺失/损坏 -> 重置为'待下载' (status=0)
        2. 数据库'未下载' 但 文件存在且正常 -> 标记为'已下载' (status=1)
        3. 文件损坏 (Size < 100B) -> 视为缺失处理
        """
        logger.info("开始核查文件系统与数据库一致性...")
        # 获取所有任务，不仅仅是已下载的
        all_tasks = self.db.get_storage_check_list()
        if not all_tasks:
            logger.info("数据库中无任务记录。")
            return

        missing_count = 0
        corrupted_count = 0
        restored_count = 0

        logger.info(f"正在扫描 {len(all_tasks)} 个任务对应文件的存续状态...")

        with tqdm(all_tasks, desc="一致性校验", unit="项") as pbar:
            for task in pbar:
                # Unpack: task_key, illust_id, page_index, author_id, title, url, media_type, status
                t_key, iid, idx, aid, title, url, media_type, status = task

                # 获取画师目录名
                _, name, _ = self.db.get_artist(aid)
                pbar.set_postfix_str(f"{name[:10]} {iid}_p{idx}")
                folder_name = self.storage.get_artist_folder(aid, self._safe(name))

                # 推断文件扩展名
                if media_type == 'image':
                    ext = url.split('.')[-1].split('?')[0] if url else 'jpg'
                else:
                    ext = self._resolve_extension_for_non_image(url) if url else 'zip'

                # 构造文件名
                safe_title = self._safe(str(title)) if title else str(iid)
                fname = Config.FILENAME_FORMAT.format(illust_id=iid, index=idx, ext=ext, title=safe_title)
                rel_file_path = f"{folder_name}/{fname}"

                # 检查物理文件
                try:
                    exists = self.storage.exists(rel_file_path)
                except Exception:
                    exists = False

                if exists:
                    # 文件存在 -> 检查大小
                    fsize = self.storage.get_file_size(rel_file_path)
                    if fsize < 100:
                        # 文件损坏
                        if status == 1:
                            self.db.mark_status(t_key, 0)
                            corrupted_count += 1
                            pbar.set_postfix_str(f"损坏重置: {iid}")
                    else:
                        # 文件正常
                        if status != 1:
                            # 意外发现文件 -> 标记为已下载
                            self.db.mark_status(t_key, 1)
                            restored_count += 1
                            pbar.set_postfix_str(f"找回恢复: {iid}")
                else:
                    # 文件不存在
                    if status == 1:
                        # 记录说有但实际没 -> 重置
                        self.db.mark_status(t_key, 0)
                        missing_count += 1
                        pbar.set_postfix_str(f"缺失重置: {iid}")

        summary = f"核查完成。缺失重置: {missing_count}, 损坏重置: {corrupted_count}, 找回恢复: {restored_count}"
        logger.info(summary)
        print(f"\n{summary}")

    # ==================== 画师信息补充功能 ====================

    def fetch_artist_detail(self, aid):
        """使用 user_detail API 获取画师的完整资料
        返回包含完整信息的字典，包括：
        - 基本信息：id, name, account, comment
        - 头像URL（多种尺寸）
        - 个人资料：gender, birth, region, job
        - 社交链接：twitter, pawoo, webpage
        - 统计数据：total_illusts, total_manga, total_novels, total_bookmarks
        - 背景图片 URL
        """
        if self.api is None:
            logger.error("无法获取画师详情：未设置有效的Pixiv Token")
            return None

        res = self.client.wrap(self.api.user_detail, aid)
        if not res:
            return None

        user = getattr(res, 'user', None)
        profile = getattr(res, 'profile', None)

        if not user:
            return None

        data = {
            'author_id': user.id,
            'author_name': user.name,
            'author_account': getattr(user, 'account', None),
            'author_comment': getattr(user, 'comment', None),
            'is_followed': 1 if getattr(user, 'is_followed', False) else 0,
        }

        # 头像 URL（取最大尺寸）
        profile_urls = getattr(user, 'profile_image_urls', {})
        if profile_urls:
            # 优先取 medium，如果有更大的取更大的
            data['profile_image_url'] = profile_urls.get('medium') or profile_urls.get('large') or list(profile_urls.values())[0]

        # 从 profile 对象获取更多信息
        if profile:
            data['webpage'] = getattr(profile, 'webpage', None)
            data['twitter_account'] = getattr(profile, 'twitter_account', None)
            data['gender'] = getattr(profile, 'gender', None)
            data['birth'] = getattr(profile, 'birth', None)
            data['region'] = getattr(profile, 'region', None)
            data['job'] = getattr(profile, 'job', None)
            data['pawoo_url'] = getattr(profile, 'pawoo_url', None)
            data['total_illusts'] = getattr(profile, 'total_illusts', None)
            data['total_manga'] = getattr(profile, 'total_manga', None)
            data['total_novels'] = getattr(profile, 'total_novels', None)
            data['total_bookmarks'] = getattr(profile, 'total_illust_bookmarks_public', None)
            data['background_image_url'] = getattr(profile, 'background_image_url', None)

        return data

    def download_artist_avatar(self, aid, profile_image_url):
        """下载画师头像并保存到本地 avatars 目录
        返回本地相对路径或 None
        """
        if not profile_image_url:
            return None

        # 创建 avatars 目录
        avatars_dir = Config.AVATARS_PATH
        if not os.path.exists(avatars_dir):
            os.makedirs(avatars_dir, exist_ok=True)

        # 从 URL 提取扩展名
        ext = profile_image_url.split('.')[-1].split('?')[0]
        if ext not in ['jpg', 'jpeg', 'png', 'gif', 'webp']:
            ext = 'jpg'

        # 文件名格式: {author_id}.{ext}
        filename = f"{aid}.{ext}"
        filepath = os.path.join(avatars_dir, filename)

        # 如果文件已存在且大于 100 字节，跳过
        if os.path.exists(filepath) and os.path.getsize(filepath) > 100:
            return f"avatars/{filename}"

        try:
            # 使用 session 下载（自带代理和 headers）
            response = self.session.get(profile_image_url, timeout=30)
            if response.status_code == 200:
                with open(filepath, 'wb') as f:
                    f.write(response.content)
                logger.info(f"已下载画师 {aid} 的头像")
                return f"avatars/{filename}"
            else:
                logger.warning(f"下载画师 {aid} 头像失败: HTTP {response.status_code}")
                return None
        except Exception as e:
            logger.warning(f"下载画师 {aid} 头像出错: {e}")
            return None

    def refresh_artist_profile(self, aid):
        """刷新单个画师的完整资料（包括下载头像）"""
        detail = self.fetch_artist_detail(aid)
        if not detail:
            logger.warning(f"获取画师 {aid} 资料失败")
            return False

        # 下载头像
        avatar_local = None
        if detail.get('profile_image_url'):
            avatar_local = self.download_artist_avatar(aid, detail['profile_image_url'])

        # 更新数据库
        self.db.upsert_artist(
            aid, detail['author_name'],
            profile_image_url=detail.get('profile_image_url'),
            profile_image_local=avatar_local,
            author_account=detail.get('author_account'),
            author_comment=detail.get('author_comment'),
            total_illusts=detail.get('total_illusts'),
            total_bookmarks=detail.get('total_bookmarks'),
            is_followed=detail.get('is_followed', 0),
            twitter_account=detail.get('twitter_account'),
            webpage=detail.get('webpage'),
            gender=detail.get('gender'),
            birth=detail.get('birth'),
            region=detail.get('region'),
            job=detail.get('job'),
            pawoo_url=detail.get('pawoo_url'),
            background_image_url=detail.get('background_image_url')
        )

        logger.info(f"已更新画师 {aid} ({detail['author_name']}) 的资料")
        return True

    def refresh_all_artist_profiles(self, only_missing=True, limit=None):
        """批量刷新画师资料

        参数:
        - only_missing: 是否只刷新缺少资料的画师
        - limit: 限制刷新数量

        返回: (success_count, fail_count)
        """
        if only_missing:
            # 获取缺少资料的画师
            artists = self.db.get_artists_without_profile(limit=limit)
        else:
            # 获取所有画师
            artists = self.db.get_all_artists()
            if limit:
                artists = artists[:limit]

        if not artists:
            print("没有需要更新的画师")
            return 0, 0

        success = 0
        fail = 0

        print(f"\n[补充画师资料] 共 {len(artists)} 位画师待处理...")
        with tqdm(artists, desc="获取画师资料", unit="人") as pbar:
            for artist in pbar:
                aid = artist[0]
                name = artist[1] if len(artist) > 1 else f"User_{aid}"
                pbar.set_postfix_str(f"{name}")

                try:
                    if self.refresh_artist_profile(aid):
                        success += 1
                    else:
                        fail += 1
                except Exception as e:
                    logger.warning(f"刷新画师 {aid} 资料失败: {e}")
                    fail += 1

                # 添加延迟避免触发风控
                if self._sleep(random.uniform(0.5, 1.5)):
                    break

        print(f"\n完成。成功: {success}, 失败: {fail}")
        return success, fail

    def download_missing_avatars(self, limit=None):
        """下载缺少本地头像的画师头像

        返回: (success_count, fail_count)
        """
        artists = self.db.get_artists_without_avatar(limit=limit)

        if not artists:
            print("所有画师都已有头像")
            return 0, 0

        success = 0
        fail = 0

        print(f"\n[下载画师头像] 共 {len(artists)} 位画师待下载...")
        with tqdm(artists, desc="下载头像", unit="个") as pbar:
            for artist in pbar:
                aid, name, profile_url = artist
                pbar.set_postfix_str(f"{name}")

                try:
                    local_path = self.download_artist_avatar(aid, profile_url)
                    if local_path:
                        # 更新数据库记录本地路径
                        self.db.upsert_artist(aid, name, profile_image_local=local_path)
                        success += 1
                    else:
                        fail += 1
                except Exception as e:
                    logger.warning(f"下载画师 {aid} 头像失败: {e}")
                    fail += 1

                # 添加延迟
                if self._sleep(random.uniform(0.3, 0.8)):
                    break

        print(f"\n完成。成功: {success}, 失败: {fail}")
        return success, fail

    def view_artist_profile(self, aid):
        """查看画师的完整资料"""
        artist = self.db.get_artist_full(aid)
        if not artist:
            print(f"未找到画师 {aid} 的信息")
            return None

        print(f"\n{'='*50}")
        print(f" 画师资料 - ID: {artist['author_id']}")
        print(f"{'='*50}")
        print(f" 昵称: {artist['author_name']}")
        print(f" 账号: {artist['author_account'] or '未知'}")
        print(f" 关注: {'是' if artist['is_followed'] else '否'} {'(悄悄关注)' if artist['is_private_follow'] else ''}")
        print(f" 状态: {'已注销' if artist['is_deleted'] else '正常'}")
        print(f"-" * 50)
        print(f" 作品数: {artist['total_illusts'] or '未知'}")
        print(f" 收藏数: {artist['total_bookmarks'] or '未知'}")
        print(f"-" * 50)
        if artist['author_comment']:
            comment = artist['author_comment'][:200] + "..." if len(artist['author_comment'] or '') > 200 else artist['author_comment']
            print(f" 简介: {comment}")
        else:
            print(f" 简介: (无)")
        print(f"-" * 50)
        print(f" 性别: {artist['gender'] or '未知'}")
        print(f" 生日: {artist['birth'] or '未知'}")
        print(f" 地区: {artist['region'] or '未知'}")
        print(f" 职业: {artist['job'] or '未知'}")
        print(f"-" * 50)
        print(f" Twitter: {artist['twitter_account'] or '无'}")
        print(f" 主页: {artist['webpage'] or '无'}")
        print(f" Pawoo: {artist['pawoo_url'] or '无'}")
        print(f"-" * 50)
        print(f" 头像URL: {artist['profile_image_url'] or '无'}")
        print(f" 本地头像: {artist['profile_image_local'] or '未下载'}")
        print(f" 背景图: {artist['background_image_url'] or '无'}")
        print(f"{'='*50}")

        return artist
