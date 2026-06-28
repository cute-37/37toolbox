import hashlib
import secrets
import base64
from pixivpy3 import AppPixivAPI

def generate_pkce():
    # 生成 PKCE 认证所需的验证码
    code_verifier = secrets.token_urlsafe(32)
    m = hashlib.sha256()
    m.update(code_verifier.encode('ascii'))
    code_challenge = base64.urlsafe_b64encode(m.digest()).decode('ascii').replace('=', '')
    return code_verifier, code_challenge

def main():
    cv, cc = generate_pkce()

    # 构造 Pixiv 官方登录 URL
    login_url = f"https://app-api.pixiv.net/web/v1/login?code_challenge={cc}&code_challenge_method=S256"

    print("1. 请在浏览器打开以下链接并登录：")
    print(login_url)
    print("\n2. 登录后，你会看到一个空白页，请复制浏览器地址栏以 'pixiv://' 开头的完整 URL。")

    code_url = input("\n请在这里粘贴 URL: ").strip()

    try:
        api = AppPixivAPI()
        # 提取 code 参数
        import urllib.parse as urlparse
        parsed = urlparse.urlparse(code_url)
        code = urlparse.parse_qs(parsed.query)['code'][0]

        # 使用 code 和之前生成的 verifier 换取 token
        print("\n正在向 Pixiv 申请 Token...")
        res = api.auth(code=code, code_verifier=cv)

        print("\n" + "="*30)
        print("你的 Refresh Token 是 (请妥善保存):")
        print(res.refresh_token)
        print("="*30)
    except Exception as e:
        print(f"\n提取失败: {e}")
        print("请确保你粘贴的是类似 pixiv://account/login?code=... 的完整链接")

if __name__ == "__main__":
    main()
