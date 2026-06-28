from processor import Processor
from pixiv_client import PixivClient
import json

def add_specific_illust(illust_id):
    p = Processor()
    api = p.get_main_api()
    if not api:
        print("认证失败")
        return

    # 获取作品详情
    res = p.client.wrap(api.illust_detail, illust_id)
    if not res or not hasattr(res, 'illust'):
        print(f"获取作品 {illust_id} 详情失败")
        return

    ill = res.illust
    aid = ill.user.id
    name = ill.user.name

    print(f"作品ID: {ill.id}")
    print(f"作者ID: {aid}")
    print(f"作者名: {name}")
    print(f"类型: {getattr(ill, 'type', 'unknown')}")
    print(f"标题: {ill.title}")

    # 确保作者在数据库中
    p.db.upsert_artist(aid, name)

    # 提取页面
    pages = p._extract_pages(ill)
    metadata = p._extract_illust_metadata(ill)

    for idx, url, media_type, meta in pages:
        illust_data = {
            'task_key': f"{ill.id}_{idx}",
            'illust_id': ill.id,
            'page_index': idx,
            'author_id': aid,
            'title': ill.title,
            'url': url,
            'media_type': media_type,
            'meta': meta,
            **metadata
        }
        p.db.save_illust(illust_data)
        print(f"已添加任务: {illust_data['task_key']}")

    print("作品添加完成")

if __name__ == "__main__":
    add_specific_illust(140822600)
