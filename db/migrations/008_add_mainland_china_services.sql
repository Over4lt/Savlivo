INSERT INTO services (slug, name) VALUES
  ('tencent-video', 'Tencent Video'),
  ('iqiyi', 'iQIYI'),
  ('mango-tv', 'Mango TV'),
  ('youku', 'Youku'),
  ('bilibili', 'Bilibili'),
  ('qq-music', 'QQ Music'),
  ('netease-cloud-music', 'NetEase Cloud Music'),
  ('kugou-music', 'Kugou Music'),
  ('baidu-netdisk', 'Baidu Netdisk'),
  ('wps', 'WPS Office')
ON CONFLICT (slug)
DO UPDATE SET
  name = EXCLUDED.name;
