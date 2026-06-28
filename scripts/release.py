"""一键发布: 打包 .37tool + 创建 GitHub Release + 上传文件。需要 GH_TOKEN 环境变量。"""
import json, os, sys, zipfile, hashlib, urllib.request, urllib.error

GH_USER = "cute-37"
GH_REPO = "37toolbox"
TOKEN = os.environ.get("GH_TOKEN", "") or os.environ.get("GITHUB_TOKEN", "")

if not TOKEN:
    print("❌ 请设置 GH_TOKEN 环境变量: GitHub → Settings → Developer settings → Tokens")
    sys.exit(1)

VERSION = "v0.5.0"
TOOLS = ["anime-tracker"]  # pixiv-downloader is builtin (needs Python bridge)

def pack(tool_id):
    src = os.path.join("packages", tool_id)
    out = os.path.join("release", f"{tool_id}-{VERSION}.37tool")
    os.makedirs("release", exist_ok=True)

    manifest_path = os.path.join(src, "manifest.json")
    if not os.path.isfile(manifest_path):
        print(f"  ⚠ {manifest_path} 不存在，跳过")
        return None

    with open(manifest_path, encoding="utf-8") as f:
        manifest = json.load(f)

    with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as z:
        for root, dirs, files in os.walk(src):
            for name in files:
                fpath = os.path.join(root, name)
                arcname = os.path.relpath(fpath, src).replace("\\", "/")
                z.write(fpath, arcname)

    size = os.path.getsize(out)
    sha = hashlib.sha256(open(out, "rb").read()).hexdigest()

    entry = manifest.get("entry", "index.js")
    with zipfile.ZipFile(out, "r") as z:
        names = [n.filename for n in z.filelist]
    if entry not in names:
        print(f"  ⚠ 入口文件 {entry} 不在包中！包内文件: {names}")
        return None

    print(f"  ✅ {tool_id} → {out} ({size:,} bytes, sha256={sha[:12]}...)")
    return {"path": out, "size": size, "sha256": sha}

def api(method, endpoint, data=None):
    url = f"https://api.github.com{endpoint}"
    req = urllib.request.Request(url, method=method)
    req.add_header("Authorization", f"Bearer {TOKEN}")
    req.add_header("Accept", "application/vnd.github+json")
    req.add_header("User-Agent", "37toolbox-release/1.0")
    if data:
        req.add_header("Content-Type", "application/json")
        req.data = json.dumps(data).encode("utf-8")
    try:
        with urllib.request.urlopen(req) as r:
            body = r.read().decode("utf-8").strip()
            return json.loads(body) if body else {"ok": True}
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8").strip()
        msg = str(e)
        try:
            if body:
                err = json.loads(body)
                msg = err.get("message", str(e))
        except:
            pass
        return {"error": True, "status": e.code, "message": msg}

def create_or_update_release(results):
    print(f"\n📦 创建/获取 GitHub Release {VERSION}...")

    # 先查是否已存在
    existing = api("GET", f"/repos/{GH_USER}/{GH_REPO}/releases/tags/{VERSION}")
    if existing.get("error"):
        # release 不存在，创建
        release = api("POST", f"/repos/{GH_USER}/{GH_REPO}/releases", {
            "tag_name": VERSION,
            "name": VERSION,
            "body": "自动发布",
            "draft": False,
            "prerelease": False,
        })
        if release.get("error"):
            print(f"  ❌ 创建 Release 失败: {release.get('message')}")
            return None
        print(f"  ✅ Release 已创建: {release.get('html_url')}")
    else:
        release = existing
        print(f"  ✅ Release 已存在: {release.get('html_url')}")

    # 上传文件
    for r in results:
        fname = os.path.basename(r["path"])
        # 删除旧文件（如果存在）
        for asset in release.get("assets", []) or []:
            if asset.get("name") == fname:
                api("DELETE", f"/repos/{GH_USER}/{GH_REPO}/releases/assets/{asset['id']}")
                print(f"  🗑 已删除旧文件: {fname}")

        print(f"  ⬆ 上传 {fname} ({r['size']:,} bytes)...")
        # 上传需要原生 HTTP
        upload_url = release["upload_url"].replace("{?name,label}", f"?name={fname}")
        upload_req = urllib.request.Request(upload_url, method="POST")
        upload_req.add_header("Authorization", f"Bearer {TOKEN}")
        upload_req.add_header("Accept", "application/vnd.github+json")
        upload_req.add_header("Content-Type", "application/zip")
        with open(r["path"], "rb") as f:
            upload_req.data = f.read()
        try:
            with urllib.request.urlopen(upload_req) as ur:
                result = json.load(ur)
                print(f"  ✅ 上传成功: {result.get('browser_download_url')}")
                r["download_url"] = result["browser_download_url"]
        except urllib.error.HTTPError as e:
            err = json.load(e)
            print(f"  ❌ 上传失败: {err.get('message')}")
            return None

    return release

def update_market_index(results):
    """更新 docs/market-index.json 中的 size_bytes 和 sha256"""
    index_path = os.path.join("docs", "market-index.json")
    with open(index_path, encoding="utf-8") as f:
        index = json.load(f)

    for tool in index["tools"]:
        for r in results:
            if tool["id"] in r.get("path", ""):
                tool["size_bytes"] = r["size"]
                tool["sha256"] = r.get("sha256", "")
                if r.get("download_url"):
                    tool["download_url"] = r["download_url"]

    with open(index_path, "w", encoding="utf-8") as f:
        json.dump(index, f, indent=2, ensure_ascii=False)
    print(f"\n📋 market-index.json 已更新（真实文件大小）")

if __name__ == "__main__":
    print("=" * 50)
    print("37toolbox Release 发布工具 v0.5")
    print("=" * 50)

    results = []
    for tool_id in TOOLS:
        r = pack(tool_id)
        if r:
            results.append(r)

    if not results:
        print("❌ 没有成功打包任何工具")
        sys.exit(1)

    release = create_or_update_release(results)
    if not release:
        print("❌ Release 创建/上传失败")
        sys.exit(1)

    update_market_index(results)

    print(f"\n✅ 发布完成！Release URL: {release.get('html_url')}")
    print("接下来: git add docs/market-index.json && git commit -m 'update sizes' && git push")
