import hashlib
import secrets
import base64
import requests
import os
import json
from urllib.parse import urlencode, parse_qs, urlparse
from pathlib import Path
from typing import Dict, Optional
from datetime import datetime
import logging

logger = logging.getLogger(__name__)

# 禁用 requests 库发出的不安全请求警告
import urllib3
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

class PixivTokenManager:
    """封装了获取 Pixiv Token 所有必要逻辑的类。"""

    def __init__(self):
        self.client_id = "MOBrBDS8blbauoSck0ZfDbtuzpyT"
        self.client_secret = "lsACyCD94FhDUtGTXi3QzcFE2uU1hqtDaKeqrdwj"
        self.redirect_uri = 'https://app-api.pixiv.net/web/v1/users/auth/pixiv/callback'
        self.user_agent = 'PixivAndroidApp/5.0.234 (Android 11; Pixel 5)'

    def generate_pkce_challenge(self) -> tuple[str, str]:
        """生成并返回 PKCE 流程所需的 code_verifier 和 code_challenge。"""
        code_verifier = base64.urlsafe_b64encode(secrets.token_bytes(32)).decode('utf-8').rstrip('=')
        code_sha = hashlib.sha256(code_verifier.encode('utf-8')).digest()
        code_challenge = base64.urlsafe_b64encode(code_sha).decode('utf-8').rstrip('=')
        return code_verifier, code_challenge

    def get_auth_url(self, code_challenge: str) -> str:
        """根据生成的 code_challenge 构建 Pixiv 授权 URL。"""
        params = {
            'code_challenge': code_challenge,
            'code_challenge_method': 'S256',
            'client': 'pixiv-android',
        }
        return f"https://app-api.pixiv.net/web/v1/login?{urlencode(params)}"

    def _post_token_request(self, data: Dict) -> Dict:
        """发送Token请求的公共方法。"""
        headers = {'User-Agent': self.user_agent}
        response = None
        try:
            response = requests.post(
                'https://oauth.secure.pixiv.net/auth/token',
                data=data,
                headers=headers,
                verify=False,
                timeout=15
            )
            response.raise_for_status()
            return response.json()
        except requests.exceptions.RequestException as e:
            error_message = str(e)
            try:
                if response is not None:
                    error_details = response.json()
                    error_message = f"API Error: {error_details.get('error', {}).get('message', str(error_details))}"
            except (ValueError, AttributeError):
                pass
            return {'error': 'NetworkError', 'message': error_message}

    def exchange_code_for_token(self, code: str, code_verifier: str) -> dict:
        """使用授权码(code)和校验器(verifier)换取最终的 Token。"""
        data = {
            'client_id': self.client_id,
            'client_secret': self.client_secret,
            'code': code,
            'code_verifier': code_verifier,
            'grant_type': 'authorization_code',
            'include_policy': 'true',
            'redirect_uri': self.redirect_uri,
        }
        return self._post_token_request(data)

    def refresh_existing_token(self, refresh_token: str) -> dict:
        """使用一个已有的 Refresh Token 来获取一个新的。"""
        data = {
            'client_id': self.client_id,
            'client_secret': self.client_secret,
            'grant_type': 'refresh_token',
            'include_policy': 'true',
            'refresh_token': refresh_token,
        }
        return self._post_token_request(data)

def get_new_token_flow(account_name=None) -> bool:
    """处理获取新 Token 的完整流程。"""
    from config import Config

    if account_name is None:
        pass

    manager = PixivTokenManager()
    attempt_count = 0
    max_attempts = 3

    while attempt_count < max_attempts:
        attempt_count += 1
        code_verifier, code_challenge = manager.generate_pkce_challenge()
        auth_url = manager.get_auth_url(code_challenge)

        print(f"\n{'='*20} 尝试 #{attempt_count}/{max_attempts} {'='*20}")
        print("请严格按照以下步骤操作：")
        print("-" * 50)
        print("1. 在你的浏览器中，先按 F12 打开开发者工具。")
        print("2. 在开发者工具中，切换到网络(Network)标签页。")
        print("3. 确保Preserve log或保留日志选项是勾选状态！")
        print("4. 我们将为您自动打开一个登录链接，请在页面中完成登录。")
        print("5. 登录后，回到开发者工具找到 `callback?...` 请求，并完整复制它的URL。")
        print("-" * 50)

        input("请仔细阅读以上步骤。准备好后，请按回车键，我们将为您打开浏览器...")

        try:
            import webbrowser
            webbrowser.open(auth_url)
            print("\n已在您的默认浏览器中打开登录链接。现在请在浏览器中完成操作。")
            print(f"   如果浏览器没有自动打开，请手动访问: {auth_url}")
        except Exception as e:
            print(f"自动打开浏览器失败: {e}。请手动复制下面的链接访问：")
            print(f"   {auth_url}")

        code = None
        while True:
            callback_url = input("\n请将您在浏览器中复制的完整 `callback` URL 粘贴到此处 (输入 'q' 退出): ").strip()
            if callback_url.lower() == 'q':
                print("操作已由用户手动取消。")
                return False

            if not callback_url:
                print("您没有输入任何内容，请重新粘贴。")
                continue

            try:
                query_params = parse_qs(urlparse(callback_url).query)
                extracted_code = query_params.get('code', [None])[0]

                if extracted_code:
                    print(f"\n成功提取授权码(code)！")
                    code = extracted_code
                    break
                else:
                    print("错误：您粘贴的URL中未能找到`code`参数。请重试。")
            except Exception:
                print("解析URL时发生错误，请确认您粘贴的是一个有效的URL。请重试。")

        print("正在用授权码换取最终的 Refresh Token...")
        token_response = manager.exchange_code_for_token(code, code_verifier)

        if 'refresh_token' in token_response:
            refresh_token = token_response['refresh_token']
            print(f"\n恭喜！成功获取 Refresh Token!")
            print(f"{refresh_token}")

            # 使用token获取用户信息
            print("\n正在获取账号信息...")
            user_info = test_token_validity(refresh_token)

            if user_info and user_info[0]:
                username = user_info[1]["username"]
                user_id = user_info[1]["user_id"]
                print(f"检测到账号: {username} (ID: {user_id})")

                remark = input("请输入账号备注 (可选，直接回车跳过): ").strip()

                default_name = username
                if remark:
                    default_name = f"{username}({remark})"

                if account_name is None:
                    suggested_name = default_name
                    custom_name = input(f"账号名称 [{suggested_name}]: ").strip()
                    account_name = custom_name if custom_name else suggested_name

                if account_name in Config.TOKENS:
                    confirm = input(f"账号 '{account_name}' 已存在，是否覆盖? (y/n): ").strip().lower()
                    if confirm != 'y':
                        print("操作已取消")
                        return False

                Config.add_token(account_name, refresh_token, username, user_id, True, remark)
                print(f"Token 已保存为账号 '{account_name}'")

            else:
                print("无法获取账号信息，请手动输入账号信息")
                username = input("请输入用户名: ").strip()
                user_id = input("请输入用户ID: ").strip()
                remark = input("请输入账号备注 (可选): ").strip()

                if account_name is None:
                    account_name = input("请输入账号名称: ").strip()
                    if not account_name:
                        account_name = username or "unknown"

                Config.add_token(account_name, refresh_token, username, user_id, False, remark)
                print(f"Token 已保存为账号 '{account_name}' (需要验证)")

            return True
        else:
            print("\n获取 Token 失败:")
            print(json.dumps(token_response, indent=2, ensure_ascii=False))
            print("\n" + "!"*20)
            print("失败原因通常是授权码已过期(操作太慢)、已被使用或网络连接问题。")

            if attempt_count < max_attempts:
                print(f"\n我们将进行第 {attempt_count+1}/{max_attempts} 次尝试...")
            else:
                print("\n已达到最大尝试次数，请检查网络后重试程序。")
                return False

    return False

def refresh_token_flow(account_name=None):
    """处理刷新已有 Token 的流程。"""
    from config import Config

    if account_name is None:
        if not Config.TOKENS:
            print("❌ 当前没有保存的账号，请先添加账号。")
            return

        print("\n当前保存的账号:")
        for i, (name, info) in enumerate(Config.TOKENS.items(), 1):
            status = "✅" if info.get("is_valid", True) else "❌"
            main_mark = " (主要)" if name == Config.MAIN_ACCOUNT else ""
            print(f"  {i}. {name}{main_mark} {status}")

        choice = input("\n请选择要刷新的账号序号 (输入 'q' 退出): ").strip()
        if choice.lower() == 'q':
            return

        try:
            idx = int(choice) - 1
            account_name = list(Config.TOKENS.keys())[idx]
        except (ValueError, IndexError):
            print("❌ 无效选择")
            return

    if account_name not in Config.TOKENS:
        print(f"❌ 找不到账号 '{account_name}'")
        return

    current_token = Config.TOKENS[account_name]["token"]
    print(f"✅ 将刷新账号 '{account_name}' 的 Token")

    manager = PixivTokenManager()
    print("\n⏳ 正在刷新 Token...")
    try:
        token_response = manager.refresh_existing_token(current_token)
        if 'refresh_token' in token_response:
            new_refresh_token = token_response['refresh_token']
            print(f"\n\U0001f389 成功刷新！这是您的新 Refresh Token:")
            print(f"\U0001f511 {new_refresh_token}")

            Config.TOKENS[account_name]["token"] = new_refresh_token
            Config.TOKENS[account_name]["last_tested"] = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            Config.save_settings()
            print(f"✅ 账号 '{account_name}' 的 Token 已更新")
        else:
            print("\n❌ 刷新 Token 失败:")
            print(json.dumps(token_response, indent=2, ensure_ascii=False))
            print("\n可能的原因: Token已过期或无效、网络问题。")
    except Exception as e:
        print(f"\n❌ 刷新过程中发生意外错误: {e}")

def test_token_validity(token):
    """测试token是否有效"""
    try:
        from pixivpy3 import AppPixivAPI
        api = AppPixivAPI()
        result = api.auth(refresh_token=token)
        if result and "error" not in result:
            user_info = api.user_detail(api.user_id)
            if user_info and "user" in user_info:
                user = user_info["user"]
                return True, {
                    "username": user.get("name", ""),
                    "user_id": str(user.get("id", ""))
                }
        return False, None
    except Exception as e:
        return False, str(e)

def test_all_tokens():
    """测试所有保存的token"""
    from config import Config

    if not Config.TOKENS:
        print("没有保存的token")
        return

    print("\n正在测试所有token...")
    for name, info in Config.TOKENS.items():
        print(f"\n测试账号 '{name}':")
        token = info["token"]

        is_valid, user_info = test_token_validity(token)

        if is_valid:
            print("Token有效")
            Config.TOKENS[name]["is_valid"] = True
            Config.TOKENS[name]["last_tested"] = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            if user_info:
                Config.TOKENS[name]["username"] = user_info["username"]
                Config.TOKENS[name]["user_id"] = user_info["user_id"]
                print(f"   用户: {user_info['username']} (ID: {user_info['user_id']})")
        else:
            print("Token无效")
            Config.TOKENS[name]["is_valid"] = False
            Config.TOKENS[name]["last_tested"] = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    Config.save_settings()
    print("\nToken测试完成，结果已保存")

def refresh_token_if_needed(api):
    """如果有token需要刷新，尝试刷新。返回是否成功。"""
    from config import Config
    manager = PixivTokenManager()
    if Config.REFRESH_TOKEN:
        try:
            result = manager.refresh_existing_token(Config.REFRESH_TOKEN)
            if 'refresh_token' in result:
                Config.REFRESH_TOKEN = result['refresh_token']
                Config.save_settings()
                return True
        except:
            pass
    return False
