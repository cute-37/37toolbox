"""将 packages/ 下的工具目录打包为 .37tool (ZIP)"""
import zipfile, os, sys, json

def pack(tool_id):
    src = os.path.join("packages", tool_id)
    out = os.path.join("release", f"{tool_id}.37tool")
    os.makedirs("release", exist_ok=True)

    if not os.path.isfile(os.path.join(src, "manifest.json")):
        print(f"ERROR: {src}/manifest.json 不存在"); return

    with open(os.path.join(src, "manifest.json"), "r", encoding="utf-8") as f:
        manifest = json.load(f)

    with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as z:
        for root, _dirs, files in os.walk(src):
            for name in files:
                fpath = os.path.join(root, name)
                # ⚠️ 必须用 / 分隔，否则 marketHandlers 的 normalizeZipPath 匹配不上
                arcname = os.path.relpath(fpath, src).replace("\\", "/")
                z.write(fpath, arcname)
                print(f"    + {arcname}")

    size = os.path.getsize(out)
    entry = manifest.get("entry", "index.js")
    if not any(f.filename == entry for f in zipfile.ZipFile(out).filelist):
        print(f"WARN: 入口文件 {entry} 不在包中")

    print(f"OK: {out} ({size} bytes)")
    return out, size

if __name__ == "__main__":
    if len(sys.argv) > 1:
        pack(sys.argv[1])
    else:
        pack("anime-tracker")
