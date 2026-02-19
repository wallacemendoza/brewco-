// src/db.js
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

async function setupDatabase() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS menu (
        id           SERIAL PRIMARY KEY,
        category     VARCHAR(50) NOT NULL,
        name         VARCHAR(100) NOT NULL,
        description  TEXT,
        price        NUMERIC(6,2) NOT NULL,
        emoji        VARCHAR(10) DEFAULT '☕'
      );

      CREATE TABLE IF NOT EXISTS orders (
        id           SERIAL PRIMARY KEY,
        customer     VARCHAR(100) NOT NULL,
        note         TEXT,
        status       VARCHAR(20) DEFAULT 'pending',
        total        NUMERIC(8,2) NOT NULL,
        created_at   TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS order_items (
        id           SERIAL PRIMARY KEY,
        order_id     INT REFERENCES orders(id) ON DELETE CASCADE,
        menu_id      INT REFERENCES menu(id),
        name         VARCHAR(100) NOT NULL,
        price        NUMERIC(6,2) NOT NULL,
        quantity     INT NOT NULL
      );
    `);

    // Seed menu if empty
    const { rowCount } = await client.query('SELECT 1 FROM menu LIMIT 1');
    if (rowCount === 0) {
      await client.query(`
        INSERT INTO menu (category, name, description, price, emoji) VALUES
        ('Hot Coffee',  'Espresso',         'Double shot, bold and intense',          3.50, '☕'),
        ('Hot Coffee',  'Flat White',       'Espresso with velvety steamed milk',     4.50, '☕'),
        ('Hot Coffee',  'Cappuccino',       'Equal parts espresso, milk, foam',       4.50, '☕'),
        ('Hot Coffee',  'Latte',            'Smooth espresso with lots of milk',      5.00, '🥛'),
        ('Hot Coffee',  'Americano',        'Espresso with hot water',                4.00, '☕'),
        ('Cold Coffee', 'Iced Latte',       'Espresso over ice with cold milk',       5.50, '🧊'),
        ('Cold Coffee', 'Cold Brew',        'Steeped 18hrs, smooth and strong',       5.50, '🧊'),
        ('Cold Coffee', 'Iced Matcha',      'Ceremonial grade matcha over ice',       6.00, '🍵'),
        ('Cold Coffee', 'Frappuccino',      'Blended coffee with whipped cream',      6.50, '🥤'),
        ('Tea',         'Earl Grey',        'Classic bergamot black tea',             3.50, '🫖'),
        ('Tea',         'Chamomile',        'Soothing floral herbal tea',             3.50, '🫖'),
        ('Tea',         'Matcha Latte',     'Hot ceremonial matcha with oat milk',    5.50, '🍵'),
        ('Food',        'Butter Croissant', 'Flaky, golden, fresh baked daily',       4.00, '🥐'),
        ('Food',        'Avocado Toast',    'Sourdough with smashed avo & chili',     9.00, '🥑'),
        ('Food',        'Banana Bread',     'House-made, warming slice',              4.50, '🍌'),
        ('Food',        'Acai Bowl',        'Acai, granola, fresh fruit, honey',     11.00, '🫐'),
        ('Food',        'Egg Sandwich',     'Scrambled egg, cheese, brioche bun',     8.00, '🥚');
      `);
      console.log('✅ Menu seeded');
    }

    console.log('✅ Database ready');
  } finally {
    client.release();
  }
}

module.exports = { pool, setupDatabase };
