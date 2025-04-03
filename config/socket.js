import { Server } from 'socket.io';
import jwt from 'jsonwebtoken';
import { User } from '../models/User.js';
import { Message } from '../models/Message.js';

export const setupSocket = (server, corsOptions) => {
    console.log('Setting up Socket.IO server with CORS:', corsOptions);
    
    const io = new Server(server, {
        cors: corsOptions,
        pingTimeout: 60000,
        pingInterval: 25000,
        transports: ['polling', 'websocket'],
        allowEIO3: true,
        path: '/socket.io/',
        serveClient: false,
        cookie: {
            name: "io",
            httpOnly: true,
            sameSite: "lax"
        },
        connectTimeout: 45000,
        maxHttpBufferSize: 1e6
    });

    // Authentication middleware
    io.use(async (socket, next) => {
        try {
            const auth = socket.handshake.auth;
            const headers = socket.handshake.headers;

            console.log('Socket authentication attempt:', {
                id: socket.id,
                transport: socket.conn.transport.name,
                headers,
                auth
            });

            // Try to get token from auth object first, then headers
            let token = auth.token;
            if (!token && headers.authorization) {
                const authHeader = headers.authorization;
                if (authHeader.startsWith('Bearer ')) {
                    token = authHeader.substring(7);
                }
            }

            if (!token) {
                console.log('No token provided in socket connection');
                return next(new Error('Authentication error: No token provided'));
            }

            let decoded;
            try {
                decoded = jwt.verify(token, process.env.JWT_SECRET);
                console.log('Token verified for socket connection:', {
                    userId: decoded.userId,
                    socketId: socket.id
                });
            } catch (err) {
                console.log('Invalid token in socket connection:', {
                    error: err.message,
                    token: token.substring(0, 10) + '...'
                });
                return next(new Error('Authentication error: Invalid token'));
            }

            const user = await User.findById(decoded.userId)
                .select('_id email userType firstName lastName');
                
            if (!user) {
                console.log('User not found for socket connection:', decoded.userId);
                return next(new Error('Authentication error: User not found'));
            }

            console.log('Socket authenticated successfully:', {
                userId: user._id,
                userType: user.userType,
                socketId: socket.id,
                email: user.email
            });

            // Attach user to socket
            socket.user = user;
            next();
        } catch (error) {
            console.error('Socket authentication error:', {
                error: error.message,
                stack: error.stack,
                socketId: socket.id
            });
            next(new Error('Authentication error: ' + error.message));
        }
    });

    // Store active users with room tracking
    const activeUsers = new Map();

    io.on('connection', (socket) => {
        console.log('New socket connection:', {
            socketId: socket.id,
            userId: socket.user._id,
            userType: socket.user.userType,
            transport: socket.conn.transport.name
        });
        
        // Store user's socket and rooms
        const userData = {
            socketId: socket.id,
            rooms: new Set(),
            user: {
                _id: socket.user._id,
                userType: socket.user.userType,
                email: socket.user.email
            },
            lastActivity: Date.now()
        };
        activeUsers.set(socket.user._id.toString(), userData);

        // Join user-specific room
        socket.join(`user:${socket.user._id}`);
        userData.rooms.add(`user:${socket.user._id}`);
        
        // Join driver room if applicable
        if (socket.user.userType === 'NEMT') {
            socket.join('drivers');
            userData.rooms.add('drivers');
            console.log('Driver joined drivers room:', {
                userId: socket.user._id,
                socketId: socket.id
            });
        }

        // Handle ping
        socket.on('ping', () => {
            const userData = activeUsers.get(socket.user._id.toString());
            if (userData) {
                userData.lastActivity = Date.now();
            }
            console.log('Received ping from client:', {
                userId: socket.user._id,
                socketId: socket.id,
                lastActivity: userData?.lastActivity
            });
            socket.emit('pong');
        });

        // Handle joining a ride room
        socket.on('joinRide', ({ rideId }) => {
            if (!rideId) return;
            
            const roomName = `ride:${rideId}`;
            console.log('User joining ride room:', {
                userId: socket.user._id,
                socketId: socket.id,
                room: roomName
            });
            
            socket.join(roomName);
            const userData = activeUsers.get(socket.user._id.toString());
            if (userData) {
                userData.rooms.add(roomName);
                userData.lastActivity = Date.now();
            }
        });

        // Handle leaving a ride room
        socket.on('leaveRide', ({ rideId }) => {
            if (!rideId) return;
            
            const roomName = `ride:${rideId}`;
            console.log('User leaving ride room:', {
                userId: socket.user._id,
                socketId: socket.id,
                room: roomName
            });
            
            socket.leave(roomName);
            const userData = activeUsers.get(socket.user._id.toString());
            if (userData) {
                userData.rooms.delete(roomName);
                userData.lastActivity = Date.now();
            }
        });

        // Handle disconnection
        socket.on('disconnect', (reason) => {
            const userData = activeUsers.get(socket.user._id.toString());
            console.log('Socket disconnected:', {
                reason,
                socketId: socket.id,
                userId: socket.user._id,
                userType: socket.user.userType,
                rooms: Array.from(userData?.rooms || []),
                lastActivity: userData?.lastActivity
            });
            activeUsers.delete(socket.user._id.toString());
        });

        // Handle errors
        socket.on('error', (error) => {
            console.error('Socket error:', {
                error,
                socketId: socket.id,
                userId: socket.user._id,
                userType: socket.user.userType
            });
        });
    });

    // Expose methods to emit ride updates
    io.rideUpdate = (rideId, update) => {
        if (!rideId || !update) return;
        console.log('Emitting ride update:', { rideId, update });
        io.to(`ride:${rideId}`).emit('rideUpdate', update);
        io.to('drivers').emit('rideUpdate', update); // Also notify all drivers
    };

    io.newRide = (ride) => {
        if (!ride) return;
        console.log('Broadcasting new ride to drivers:', { rideId: ride._id });
        io.to('drivers').emit('newRide', ride);
    };

    io.rideStatusChange = (rideId, status, userId) => {
        if (!rideId || !status) return;
        
        console.log('Emitting ride status change:', { rideId, status, userId });
        
        io.to(`ride:${rideId}`).emit('rideStatusChange', { rideId, status });
        io.to('drivers').emit('rideStatusChange', { rideId, status }); // Also notify all drivers
        
        const userData = activeUsers.get(userId);
        if (userData) {
            console.log('Sending direct status update to user:', {
                userId,
                socketId: userData.socketId
            });
            io.to(userData.socketId).emit('rideStatusChange', { rideId, status });
        }
    };

    // Cleanup inactive connections periodically
    setInterval(() => {
        const now = Date.now();
        for (const [userId, userData] of activeUsers.entries()) {
            if (now - userData.lastActivity > 120000) { // 2 minutes
                console.log('Cleaning up inactive user:', {
                    userId,
                    socketId: userData.socketId,
                    lastActivity: userData.lastActivity
                });
                const socket = io.sockets.sockets.get(userData.socketId);
                if (socket) {
                    socket.disconnect(true);
                }
                activeUsers.delete(userId);
            }
        }
    }, 60000); // Check every minute

    console.log('Socket.IO server setup complete');
    return io;
}; 