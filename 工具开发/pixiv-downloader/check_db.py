import sqlite3

conn = sqlite3.connect('db/pixiv_manager.db')
cursor = conn.cursor()

# 检查画师
cursor.execute('SELECT * FROM artists WHERE author_id = 13005861')
artist = cursor.fetchone()
print('Artist:', artist)

# 检查作品数量
cursor.execute('SELECT COUNT(*) FROM illusts i JOIN illust_metadata m ON i.illust_id = m.illust_id WHERE m.author_id = 13005861')
count = cursor.fetchone()[0]
print('Total illusts:', count)

# 检查作品ID范围
cursor.execute('SELECT MIN(i.illust_id), MAX(i.illust_id) FROM illusts i JOIN illust_metadata m ON i.illust_id = m.illust_id WHERE m.author_id = 13005861')
min_max = cursor.fetchone()
print('Illust ID range:', min_max)

# 检查所有作品ID
cursor.execute('SELECT DISTINCT i.illust_id FROM illusts i JOIN illust_metadata m ON i.illust_id = m.illust_id WHERE m.author_id = 13005861 ORDER BY i.illust_id')
illust_ids = [row[0] for row in cursor.fetchall()]
print('Illust IDs:', illust_ids)

conn.close()
