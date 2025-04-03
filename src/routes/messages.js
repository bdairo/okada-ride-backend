import express from 'express';
import { auth } from '../middleware/auth.js';
import { Message } from '../models/Message.js';
import { Ride } from '../models/Ride.js';
import mongoose from 'mongoose';

const router = express.Router();

// Get messages for a specific job
router.get('/:jobId/:recipientId', auth, async (req, res) => {
    try {
        const { jobId, recipientId } = req.params;
        const userId = req.user._id;

        const messages = await Message.find({
            jobId,
            $or: [
                { senderId: userId, recipientId },
                { senderId: recipientId, recipientId: userId }
            ]
        })
        .sort({ timestamp: 1 })
        .populate('senderId', 'firstName lastName')
        .populate('recipientId', 'firstName lastName');

        res.json(messages);
    } catch (error) {
        console.error('Error fetching messages:', error);
        res.status(500).json({ error: 'Failed to fetch messages' });
    }
});

// Mark messages as read
router.put('/:jobId/read', auth, async (req, res) => {
    try {
        const { jobId } = req.params;
        const userId = req.user._id;

        await Message.updateMany(
            {
                jobId,
                recipientId: userId,
                read: false
            },
            {
                $set: { read: true }
            }
        );

        res.json({ message: 'Messages marked as read' });
    } catch (error) {
        console.error('Error marking messages as read:', error);
        res.status(500).json({ error: 'Failed to mark messages as read' });
    }
});

// Get messages for a specific ride
router.get('/:rideId', auth, async (req, res) => {
    try {
        const { rideId } = req.params;

        if (!mongoose.Types.ObjectId.isValid(rideId)) {
            console.log('Invalid ride ID format:', rideId);
            return res.status(400).json({ error: 'Invalid ride ID format' });
        }

        console.log('GET /api/messages/:rideId - Request params:', {
            rideId: req.params.rideId,
            userId: req.user._id
        });

        const ride = await Ride.findById(req.params.rideId);
        
        if (!ride) {
            console.log('Ride not found:', req.params.rideId);
            return res.status(404).json({ error: 'Ride not found' });
        }

        console.log('Found ride:', {
            rideId: ride._id,
            patientId: ride.patient,
            driverId: ride.driver,
            status: ride.status
        });

        // Check if user is authorized to view messages
        if (ride.patient.toString() !== req.user._id.toString() && 
            ride.driver?.toString() !== req.user._id.toString()) {
            console.log('User not authorized:', {
                userId: req.user._id,
                patientId: ride.patient,
                driverId: ride.driver
            });
            return res.status(403).json({ error: 'Not authorized to view these messages' });
        }

        const messages = await Message.find({ rideId: req.params.rideId })
            .populate('sender', 'firstName lastName')
            .sort('timestamp');

        console.log('Found messages:', {
            count: messages.length,
            rideId: req.params.rideId
        });

        // Always return an array, even if empty
        res.json(messages || []);
    } catch (error) {
        console.error('Error in GET /api/messages/:rideId:', {
            error: error.message,
            stack: error.stack,
            rideId: req.params.rideId
        });
        res.status(500).json({ error: 'Failed to fetch messages' });
    }
});

// Send a new message
router.post('/', auth, async (req, res) => {
    try {
        console.log('POST /api/messages - Request body:', {
            ...req.body,
            userId: req.user._id
        });

        const { rideId, text } = req.body;

        if (!text || !text.trim()) {
            return res.status(400).json({ error: 'Message text is required' });
        }

        const ride = await Ride.findById(rideId);
        
        if (!ride) {
            console.log('Ride not found:', rideId);
            return res.status(404).json({ error: 'Ride not found' });
        }

        console.log('Found ride:', {
            rideId: ride._id,
            patientId: ride.patient,
            driverId: ride.driver,
            status: ride.status
        });

        // Check if user is authorized to send messages
        if (ride.patient.toString() !== req.user._id.toString() && 
            ride.driver?.toString() !== req.user._id.toString()) {
            console.log('User not authorized:', {
                userId: req.user._id,
                patientId: ride.patient,
                driverId: ride.driver
            });
            return res.status(403).json({ error: 'Not authorized to send messages for this ride' });
        }

        const message = new Message({
            rideId,
            sender: req.user._id,
            text: text.trim()
        });

        await message.save();

        const populatedMessage = await Message.findById(message._id)
            .populate('sender', 'firstName lastName');

        console.log('Created message:', {
            messageId: populatedMessage._id,
            rideId,
            sender: populatedMessage.sender,
            text: populatedMessage.text
        });

        res.status(201).json(populatedMessage);
    } catch (error) {
        console.error('Error in POST /api/messages:', {
            error: error.message,
            stack: error.stack,
            body: req.body
        });
        res.status(500).json({ error: 'Failed to send message' });
    }
});

export default router; 