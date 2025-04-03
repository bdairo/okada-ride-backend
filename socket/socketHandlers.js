import { Message } from '../models/Message.js';

export const setupSocketHandlers = (io) => {
    // Store active users
    const activeUsers = new Map();

    io.on('connection', (socket) => {
        console.log('New socket connection:', {
            socketId: socket.id,
            userId: socket.user?._id,
            userType: socket.user?.userType
        });

        // Store user's socket
        if (socket.user) {
            activeUsers.set(socket.user._id.toString(), {
                socketId: socket.id,
                userType: socket.user.userType,
                lastActivity: Date.now()
            });
        }

        // Join user-specific room
        if (socket.user) {
            socket.join(`user:${socket.user._id}`);
            
            // Join driver room if applicable
            if (socket.user.userType === 'NEMT') {
                socket.join('drivers');
            }
        }

        // Handle joining a ride room
        socket.on('joinRide', ({ rideId }) => {
            if (!rideId) return;
            
            const roomName = `ride:${rideId}`;
            console.log('User joining ride room:', {
                userId: socket.user?._id,
                socketId: socket.id,
                room: roomName
            });
            
            socket.join(roomName);
        });

        // Handle leaving a ride room
        socket.on('leaveRide', ({ rideId }) => {
            if (!rideId) return;
            
            const roomName = `ride:${rideId}`;
            console.log('User leaving ride room:', {
                userId: socket.user?._id,
                socketId: socket.id,
                room: roomName
            });
            
            socket.leave(roomName);
        });

        // Handle ping
        socket.on('ping', () => {
            const userData = activeUsers.get(socket.user?._id.toString());
            if (userData) {
                userData.lastActivity = Date.now();
            }
            socket.emit('pong');
        });

        // Handle disconnection
        socket.on('disconnect', (reason) => {
            console.log('Socket disconnected:', {
                reason,
                socketId: socket.id,
                userId: socket.user?._id
            });
            
            if (socket.user) {
                activeUsers.delete(socket.user._id.toString());
            }
        });

        // Handle errors
        socket.on('error', (error) => {
            console.error('Socket error:', {
                error,
                socketId: socket.id,
                userId: socket.user?._id
            });
        });
    });

    // Cleanup inactive connections periodically
    setInterval(() => {
        const now = Date.now();
        for (const [userId, userData] of activeUsers.entries()) {
            if (now - userData.lastActivity > 120000) { // 2 minutes
                console.log('Cleaning up inactive user:', {
                    userId,
                    socketId: userData.socketId
                });
                const socket = io.sockets.sockets.get(userData.socketId);
                if (socket) {
                    socket.disconnect(true);
                }
                activeUsers.delete(userId);
            }
        }
    }, 60000); // Check every minute

    // Add function to emit ride rating events
    io.rideRated = (rideId, driverId, rating, comment) => {
        if (!rideId || !driverId) {
            console.log('Missing required parameters for rideRated event');
            return;
        }

        console.log('Emitting ride-rated event:', {
            rideId,
            driverId,
            rating,
            hasComment: !!comment
        });

        // Emit to the specific driver
        io.to(`user:${driverId}`).emit('ride-rated', {
            rideId,
            rating,
            comment
        });

        // Also emit to the ride room
        io.to(`ride:${rideId}`).emit('ride-rated', {
            rideId,
            rating,
            comment
        });
    };

    return io;
}; 