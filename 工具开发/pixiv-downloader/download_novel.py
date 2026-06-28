import sys
sys.path.append('.')
from processor import Processor
import json

# 初始化processor
p = Processor()

# 获取API
api = p.api
if not api:
    print("API认证失败")
    exit()

novel_id = 21370209

print(f"下载小说: {novel_id}")

try:
    # 获取小说文本
    plain = None
    html = None

    # 优先使用 novel_text 接口
    try:
        rest, err_text = p.client.wrap_with_error(api.novel_text, novel_id=novel_id)
        if rest:
            if hasattr(rest, 'novel_text'):
                v = getattr(rest, 'novel_text', None)
                if v and isinstance(v, str) and v.strip():
                    plain = v
            elif isinstance(rest, dict):
                v = rest.get('novel_text') or rest.get('text') or rest.get('body')
                if v and isinstance(v, str) and v.strip():
                    plain = v
        if err_text:
            print(f"小说正文获取失败: {err_text}")
    except Exception as e:
        print(f"小说正文获取异常: {e}")

    # 若未取到，从 novel_detail 获取
    if not plain:
        resn, err_detail = p.client.wrap_with_error(api.novel_detail, novel_id=novel_id)
        if not resn:
            print(f"无法获取小说信息: {err_detail}")
            exit()

        novel = resn.novel if hasattr(resn, 'novel') else resn.get('novel')
        if not novel:
            print("未能提取小说对象")
            exit()

        # 提取plain
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

        # 提取html
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

        # 从html提取plain
        if not plain and html:
            import re
            plain = re.sub(r'<[^>]+>', '\n', html)
            plain = '\n'.join(line.strip() for line in plain.split('\n') if line.strip())

    if not plain:
        print("未能提取到小说内容")
        exit()

    # 保存到test
    import os
    os.makedirs('test', exist_ok=True)

    txt_path = f'test/{novel_id}_p0.txt'
    with open(txt_path, 'w', encoding='utf-8') as f:
        f.write(plain)
    print(f"TXT保存到: {txt_path}")

    if html:
        html_path = f'test/{novel_id}_p0.html'
        with open(html_path, 'w', encoding='utf-8') as f:
            f.write(html)
        print(f"HTML保存到: {html_path}")

except Exception as e:
    print(f"错误: {e}")
