import pg from "pg";

const { Pool } = pg;

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30_000
});

export async function healthcheckDb() {
  const result = await pool.query("select now() as now");
  return result.rows[0];
}

export async function ensureMainlandChinaServices() {
  await pool.query(`
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
    ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name
  `);
}
