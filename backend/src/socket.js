const { pool } = require('./db');

const connectedUsers = new Map();

const setupSocket = (io) => {
    io.on('connection', (socket) => {
        console.log(`🔌 User connected: ${socket.id}`);

        socket.on('register', async (data) => {
            try {
                const { username, latitude, longitude } = data;

                const normalizedUsername = username.trim().toLowerCase();

                if (!normalizedUsername) {
                    socket.emit('error', { message: 'Invalid username' });
                    return;
                }

                const result = await pool.query(
                    'INSERT INTO users (username, is_online) VALUES ($1, true) ON CONFLICT (username) DO UPDATE SET is_online = true RETURNING id',
                    [normalizedUsername]
                );

                const userId = result.rows[0].id;

                if (latitude && longitude) {
                    await pool.query(
                        `INSERT INTO locations (user_id, latitude, longitude, location)
                 VALUES ($1, $2, $3, ST_SetSRID(ST_MakePoint($3, $2), 4326))`,
                        [userId, latitude, longitude]
                    );
                }

                connectedUsers.set(socket.id, { userId, username });

                socket.emit('registered', { userId });

                console.log(`✅ User registered: ${username} (ID: ${userId})`);

                const userConnectedData = {
                    userId,
                    username: normalizedUsername,
                    latitude,
                    longitude,
                    timestamp: new Date().toISOString(),
                };

                // Notificar a TODOS que este usuario se conectó
                socket.broadcast.emit('user_connected', userConnectedData);

                console.log(`📢 Broadcasted user_connected for: ${username}`);
            } catch (err) {
                console.error('❌ Registration error:', err);
                socket.emit('error', { message: 'Registration failed' });
            }
        });

        socket.on('location_update', async (data) => {
            try {
                const userInfo = connectedUsers.get(socket.id);

                if (!userInfo) {
                    socket.emit('error', { message: 'User not registered' });
                    return;
                }

                const { latitude, longitude } = data;

                await pool.query(
                    `INSERT INTO locations (user_id, latitude, longitude, location)
                     VALUES ($1, $2, $3, ST_SetSRID(ST_MakePoint($3, $2), 4326))`,
                    [userInfo.userId, latitude, longitude]
                );

                socket.broadcast.emit('user_location', {
                    userId: userInfo.userId,
                    username: userInfo.username,
                    latitude,
                    longitude,
                    timestamp: new Date().toISOString()
                });

                console.log(`📍 Location updated for user: ${userInfo.username} (${latitude}, ${longitude})`);
            } catch (err) {
                console.error('❌ Location update error:', err);
            }
        });

        socket.on('disconnect', async () => {
            const userInfo = connectedUsers.get(socket.id);
            if (userInfo) {

                try {
                    await pool.query(
                        'UPDATE users SET is_online = false WHERE id = $1',
                        [userInfo.userId]
                    );

                    socket.broadcast.emit('user_disconnected', {
                        userId: userInfo.userId,
                        username: userInfo.username,
                    });

                    console.log(`❌ User disconnected: ${userInfo.username}`);
                    connectedUsers.delete(socket.id);
                } catch (error) {
                    console.error('❌ Error updating user offline status:', err);
                }
            }
        });
    });
};

module.exports = setupSocket;