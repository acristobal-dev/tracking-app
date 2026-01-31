const { Pool } = require('pg');
const dns = require('dns');
dns.setDefaultResultOrder('ipv4first');
const fs = require('fs');
const path = require('path');

// Solo cargar dotenv si el archivo .env existe (desarrollo local)
const envPath = path.join(__dirname, '../.env');
if (fs.existsSync(envPath)) {
    require('dotenv').config();
}

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
    family: 4, // fuerza IPv4
    // Fallback para desarrollo local
    ...(!process.env.DATABASE_URL && {
        user: process.env.DB_USER,
        host: process.env.DB_HOST,
        database: process.env.DB_NAME,
        password: process.env.DB_PASSWORD,
        port: process.env.DB_PORT || 5432
    })
});

pool.on('connect', () => {
    console.log('✅ Connected to PostgreSQL');
});

pool.on('error', (err) => {
    console.error('❌ Error en PostgreSQL:', err);
});

const initDB = async () => {
    try {
        await pool.query('CREATE EXTENSION IF NOT EXISTS postgis;');

        await pool.query(`
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                username VARCHAR(100) UNIQUE NOT NULL,
                is_online BOOLEAN DEFAULT FALSE,
                created_at TIMESTAMP DEFAULT NOW()
            );
        `);

        await pool.query(`
            CREATE TABLE IF NOT EXISTS locations (
                id SERIAL PRIMARY KEY,
                user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                latitude DOUBLE PRECISION NOT NULL,
                longitude DOUBLE PRECISION NOT NULL,
                location GEOGRAPHY(POINT, 4326),
                timestamp TIMESTAMP DEFAULT NOW()
            );
        `);

        await pool.query(`
            CREATE INDEX IF NOT EXISTS idx_locations_geography
            ON locations USING GIST(location);
        `);

        console.log('✅ Database initialized');
    } catch (err) {
        console.error('❌ Error initializing DB:', err);
        throw err;
    }
};

module.exports = { pool, initDB };