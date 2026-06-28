from pixivpy3 import AppPixivAPI
from config import Config
from interrupt import wait as interrupt_wait, is_set as interrupt_is_set

class PixivClient:
    def __init__(self):
        self.api = AppPixivAPI(proxies=Config.PROXIES)
        self.token = Config.REFRESH_TOKEN

    def auth(self):
        try:
            res = self.api.auth(refresh_token=self.token)
            if res and "error" not in res:
                return self.api
            else:
                # 尝试刷新token
                print("Token可能已过期，尝试刷新...")
                from token_manager import refresh_token_if_needed
                if refresh_token_if_needed(self.api):
                    # 重新尝试认证
                    res = self.api.auth(refresh_token=Config.REFRESH_TOKEN)
                    if res and "error" not in res:
                        print("Token刷新成功，继续使用")
                        return self.api
                print("Token刷新失败，请手动获取新token")
                return None
        except Exception as e:
            print(f"认证失败: {e}")
            return None

    def wrap(self, func, *args, **kwargs):
        for i in range(Config.MAX_RETRIES):
            try:
                # 如果全局收到中断，尽早退出
                if interrupt_is_set():
                    return None

                res = func(*args, **kwargs)
                if res and "error" not in res:
                    return res

                # 指数退避后重试；若中断发生则提前返回
                if interrupt_wait(i * 2 + 2):
                    return None
                self.auth()
            except Exception:
                # 捕获异常后等待固定时间再重试
                if interrupt_wait(5):
                    return None
        return None

    def wrap_with_error(self, func, *args, **kwargs):
        """与 wrap 类似，但返回 (result, error_message) 以便诊断 API 失败原因。"""
        last_error = None
        for i in range(Config.MAX_RETRIES):
            try:
                if interrupt_is_set():
                    return None, "interrupted"

                res = func(*args, **kwargs)
                if res and "error" not in res:
                    return res, None

                if isinstance(res, dict) and "error" in res:
                    last_error = str(res.get("error"))
                else:
                    last_error = "unknown api error"

                if interrupt_wait(i * 2 + 2):
                    return None, last_error
                self.auth()
            except Exception as e:
                last_error = str(e)
                if interrupt_wait(5):
                    return None, last_error
        return None, last_error
