import sys
sys.path.append('.')
from processor import Processor
import os
import zipfile
import tempfile
import shutil
from PIL import Image
import json

# 初始化processor
p = Processor()

# 获取API
api = p.api
if not api:
    print("API认证失败")
    exit()

illust_id = 140822600

# 获取ugoira_metadata
meta_res = api.ugoira_metadata(illust_id)
if not meta_res or 'ugoira_metadata' not in meta_res:
    print("获取ugoira_metadata失败")
    exit()

meta = meta_res['ugoira_metadata']
zip_url = meta['zip_urls'].get('medium') or meta['zip_urls'].get('original')
if not zip_url:
    print("无zip URL")
    exit()

print(f"下载ZIP: {zip_url}")

# 下载ZIP
response = p.session.get(zip_url)
if response.status_code != 200:
    print(f"下载失败: {response.status_code}")
    exit()

zip_path = f'temp/{illust_id}.zip'
os.makedirs('temp', exist_ok=True)
with open(zip_path, 'wb') as f:
    f.write(response.content)

print("ZIP下载完成，开始转换")

# 转换
tmp_base = tempfile.mkdtemp(prefix='ugoira_', dir='temp')
with zipfile.ZipFile(zip_path, 'r') as z:
    z.extractall(tmp_base)

frames = meta.get('frames', [])
images = []
durations = []

for f in frames:
    fname = f.get('file')
    delay = f.get('delay', 100)
    pth = os.path.join(tmp_base, fname)
    if os.path.exists(pth):
        img = Image.open(pth).convert('RGBA')
        images.append(img)
        durations.append(delay)

if not images:
    print("无帧")
    exit()

# 保存不同格式到test
os.makedirs('test', exist_ok=True)

formats = [
    ('gif', lambda img, path: img.save(path, save_all=True, append_images=images[1:], duration=durations, loop=0, disposal=2)),
    ('png', lambda img, path: img.save(path, format='PNG', save_all=True, append_images=images[1:], duration=durations, loop=0)),
    ('webp', lambda img, path: img.save(path, format='WEBP', save_all=True, append_images=images[1:], duration=durations, loop=0))
]

for ext, save_func in formats:
    out_path = f'test/{illust_id}_p0.{ext}'
    save_func(images[0], out_path)
    print(f"{ext.upper()}保存到: {out_path}")

# 清理
shutil.rmtree(tmp_base)
os.remove(zip_path)
