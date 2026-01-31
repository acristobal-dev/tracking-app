const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
require('dotenv').config();

const { pool, initDB } = require('./db');
const setupSocket = require('./socket');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: '*',
        methods: ['GET', 'POST']
    }
});

app.use(cors());
app.use(express.json());

app.get('/', (req, res) => {
    res.json({ message: '🚀 Tracking API funcionando' });
});

app.get('/api/locations/:userId', async (req, res) => {
    try {
        const { userId } = req.params;
        const result = await pool.query(
            'SELECT latitude, longitude, timestamp FROM locations WHERE user_id = $1 ORDER BY timestamp DESC LIMIT 100',
            [userId]
        );
        res.json(result.rows);
    } catch (err) {
        console.error('❌ Error fetching locations:', err);
        res.status(500).json({ error: 'Error fetching locations' });
    }
});

app.get('/api/nearby/:userId', async (req, res) => {
    try {
        const { userId } = req.params;
        const userLocation = await pool.query(
            `SELECT location FROM locations
             WHERE user_id = $1
             ORDER BY timestamp DESC
             LIMIT 1`,
            [userId]
        );

        if (userLocation.rows.length === 0) {
            return res.json([]);
        }

        const nearby = await pool.query(
            `SELECT DISTINCT ON (l.user_id) 
        u.id, u.username, l.latitude, l.longitude,
        ST_Distance($1::geography, l.location) / 1000 as distance_km
       FROM locations l
       JOIN users u ON l.user_id = u.id
       WHERE l.user_id != $2 
         AND ST_DWithin($1::geography, l.location, 5000)
       ORDER BY l.user_id, l.timestamp DESC`,
            [userLocation.rows[0].location, userId]
        );

        res.json(nearby.rows);
    } catch (err) {
        console.error('❌ Error fetching nearby users:', err);
        res.status(500).json({ error: 'Error fetching nearby users' });
    }
});

app.get('/api/users/locations', async (req, res) => {
    try {

        const usersResult = await pool.query(`
      SELECT id, username, is_online, created_at 
      FROM users 
      ORDER BY id
    `);

        const usersLocations = await Promise.all(
            usersResult.rows.map(async (user) => {
                const locationsResult = await pool.query(`
          SELECT latitude, longitude, timestamp 
          FROM locations 
          WHERE user_id = $1 
          ORDER BY timestamp DESC
        `, [user.id]);

                return {
                    id: user.id,
                    username: user.username,
                    is_online: user.is_online,
                    locations: locationsResult.rows,
                };
            })
        );

        res.json(usersLocations);
    } catch (err) {
        console.error('❌ Error fetching users locations:', err);
        res.status(500).json({ error: 'Error fetching users locations' });
    }
});

setupSocket(io);

const PORT = process.env.PORT || 3000;

const startServer = async () => {
    await initDB();
    server.listen(PORT, () => {
        console.log(`🚀 Server running on http://localhost:${PORT}`);
    });
};

startServer();