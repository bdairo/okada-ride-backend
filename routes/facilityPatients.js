import express from 'express';
import { auth, authorize } from '../middleware/auth.js';
import { User } from '../models/User.js';
import { Ride } from '../models/Ride.js';
import { FacilityPatient } from '../models/FacilityPatient.js';
import { sendVerificationEmail } from '../utils/emailService.js';
import crypto from 'crypto';

const router = express.Router();

// Simple in-memory store for verification codes
// In a production app, this would be stored in Redis or a database
const verificationStore = {
    verifications: {},
    
    add(patientId, code) {
        const verificationId = crypto.randomBytes(16).toString('hex');
        this.verifications[verificationId] = {
            patientId,
            code,
            expiresAt: Date.now() + 30 * 60 * 1000, // 30 minutes
            verified: false
        };
        return verificationId;
    },
    
    get(verificationId) {
        return this.verifications[verificationId];
    },
    
    verify(verificationId) {
        if (this.verifications[verificationId]) {
            this.verifications[verificationId].verified = true;
            return true;
        }
        return false;
    },
    
    remove(verificationId) {
        delete this.verifications[verificationId];
    },
    
    cleanup() {
        // Remove expired verifications
        const now = Date.now();
        Object.keys(this.verifications).forEach(id => {
            if (this.verifications[id].expiresAt < now) {
                delete this.verifications[id];
            }
        });
    }
};

// Periodically clean up expired verifications
setInterval(() => verificationStore.cleanup(), 15 * 60 * 1000); // Every 15 minutes

// Get all patients for a facility
router.get('/patients', auth, authorize('FACILITY'), async (req, res) => {
    try {
        // Find all facility-patient relationships for this facility
        const facilityPatients = await FacilityPatient.find({ 
            facility: req.user._id 
        }).populate('patient', 'firstName lastName email phoneNumber address specialRequirements notes profileImage');
        
        // Extract patient data
        const patients = facilityPatients.map(fp => fp.patient);
        
        res.json(patients);
    } catch (error) {
        console.error('Error fetching facility patients:', error);
        res.status(500).json({ error: error.message });
    }
});

// Get a specific patient by ID
router.get('/patients/:patientId', auth, authorize('FACILITY'), async (req, res) => {
    try {
        // Check if this patient belongs to the facility
        const facilityPatient = await FacilityPatient.findOne({
            facility: req.user._id,
            patient: req.params.patientId
        }).populate('patient', 'firstName lastName email phoneNumber address specialRequirements notes profileImage');
        
        if (!facilityPatient) {
            return res.status(404).json({ error: 'Patient not found or not associated with this facility' });
        }
        
        res.json(facilityPatient.patient);
    } catch (error) {
        console.error('Error fetching patient:', error);
        res.status(500).json({ error: error.message });
    }
});

// Search for an existing patient by email
router.get('/patients/search', auth, authorize('FACILITY'), async (req, res) => {
    try {
        const { email } = req.query;
        
        if (!email) {
            return res.status(400).json({ error: 'Email is required' });
        }
        
        // Find the patient by email
        const patient = await User.findOne({ 
            email: email.toLowerCase(),
            userType: 'PATIENT'
        }).select('_id firstName lastName email phoneNumber profileImage');
        
        if (!patient) {
            return res.status(404).json({ error: 'Patient not found' });
        }
        
        // Check if patient is already associated with this facility
        const existingAssociation = await FacilityPatient.findOne({
            facility: req.user._id,
            patient: patient._id
        });
        
        if (existingAssociation) {
            return res.status(400).json({ error: 'Patient is already associated with this facility' });
        }
        
        res.json(patient);
    } catch (error) {
        console.error('Error searching for patient:', error);
        res.status(500).json({ error: error.message });
    }
});

// Send verification code to patient
router.post('/patients/send-verification', auth, authorize('FACILITY'), async (req, res) => {
    try {
        const { patientId } = req.body;
        
        if (!patientId) {
            return res.status(400).json({ error: 'Patient ID is required' });
        }
        
        // Find the patient
        const patient = await User.findOne({ 
            _id: patientId,
            userType: 'PATIENT'
        });
        
        if (!patient) {
            return res.status(404).json({ error: 'Patient not found' });
        }
        
        // Generate verification code
        const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();
        
        // Store verification data
        const verificationId = verificationStore.add(patientId, verificationCode);
        
        // Send verification email
        await sendVerificationEmail(
            patient.email,
            verificationCode,
            req.user.facilityName || 'Healthcare Facility',
            patient.firstName
        );
        
        res.json({ 
            message: 'Verification code sent successfully',
            verificationId
        });
    } catch (error) {
        console.error('Error sending verification code:', error);
        res.status(500).json({ error: error.message });
    }
});

// Verify code
router.post('/patients/verify-code', auth, authorize('FACILITY'), async (req, res) => {
    try {
        const { verificationId, code, patientId } = req.body;
        
        if (!verificationId || !code || !patientId) {
            return res.status(400).json({ error: 'Verification ID, code, and patient ID are required' });
        }
        
        // Check verification data
        const verification = verificationStore.get(verificationId);
        
        if (!verification) {
            return res.status(404).json({ error: 'Verification not found' });
        }
        
        if (verification.patientId !== patientId) {
            return res.status(400).json({ error: 'Invalid patient ID' });
        }
        
        if (verification.expiresAt < Date.now()) {
            verificationStore.remove(verificationId);
            return res.status(400).json({ error: 'Verification code has expired' });
        }
        
        if (verification.code !== code) {
            return res.status(400).json({ error: 'Invalid verification code' });
        }
        
        // Mark as verified
        verificationStore.verify(verificationId);
        
        res.json({ message: 'Verification successful' });
    } catch (error) {
        console.error('Error verifying code:', error);
        res.status(500).json({ error: error.message });
    }
});

// Add existing patient to facility
router.post('/patients/add-existing', auth, authorize('FACILITY'), async (req, res) => {
    try {
        const { patientId, verificationId } = req.body;
        
        if (!patientId || !verificationId) {
            return res.status(400).json({ error: 'Patient ID and verification ID are required' });
        }
        
        // Check verification data
        const verification = verificationStore.get(verificationId);
        
        if (!verification || !verification.verified) {
            return res.status(400).json({ error: 'Verification not completed' });
        }
        
        if (verification.patientId !== patientId) {
            return res.status(400).json({ error: 'Invalid patient ID' });
        }
        
        // Check if patient exists
        const patient = await User.findOne({ 
            _id: patientId,
            userType: 'PATIENT'
        });
        
        if (!patient) {
            return res.status(404).json({ error: 'Patient not found' });
        }
        
        // Check if association already exists
        const existingAssociation = await FacilityPatient.findOne({
            facility: req.user._id,
            patient: patientId
        });
        
        if (existingAssociation) {
            return res.status(400).json({ error: 'Patient is already associated with this facility' });
        }
        
        // Create association
        const facilityPatient = new FacilityPatient({
            facility: req.user._id,
            patient: patientId,
            addedAt: new Date()
        });
        
        await facilityPatient.save();
        
        // Clean up verification data
        verificationStore.remove(verificationId);
        
        res.status(201).json({ 
            message: 'Patient added to facility successfully',
            facilityPatient
        });
    } catch (error) {
        console.error('Error adding patient to facility:', error);
        res.status(500).json({ error: error.message });
    }
});

// Add a new patient
router.post('/patients', auth, authorize('FACILITY'), async (req, res) => {
    try {
        const { firstName, lastName, email, phoneNumber, address, specialRequirements, notes } = req.body;
        
        // Check if patient with this email already exists
        const existingUser = await User.findOne({ email: email.toLowerCase() });
        
        if (existingUser) {
            return res.status(400).json({ error: 'A user with this email already exists' });
        }
        
        // Create a new patient user
        const patient = new User({
            firstName,
            lastName,
            email: email.toLowerCase(),
            phoneNumber,
            address,
            userType: 'PATIENT',
            // Generate a random password (in a real app, you would send this to the patient)
            password: crypto.randomBytes(16).toString('hex')
        });
        
        await patient.save();
        
        // Create association with facility
        const facilityPatient = new FacilityPatient({
            facility: req.user._id,
            patient: patient._id,
            addedAt: new Date()
        });
        
        await facilityPatient.save();
        
        // Update patient with special requirements and notes
        if (specialRequirements || notes) {
            patient.specialRequirements = specialRequirements || [];
            patient.notes = notes || '';
            await patient.save();
        }
        
        res.status(201).json({ 
            message: 'Patient created and added to facility successfully',
            patient: {
                _id: patient._id,
                firstName: patient.firstName,
                lastName: patient.lastName,
                email: patient.email,
                phoneNumber: patient.phoneNumber,
                address: patient.address,
                specialRequirements: patient.specialRequirements,
                notes: patient.notes
            }
        });
    } catch (error) {
        console.error('Error creating patient:', error);
        res.status(500).json({ error: error.message });
    }
});

// Update a patient
router.put('/patients/:patientId', auth, authorize('FACILITY'), async (req, res) => {
    try {
        const { firstName, lastName, phoneNumber, address, specialRequirements, notes } = req.body;
        
        // Check if this patient belongs to the facility
        const facilityPatient = await FacilityPatient.findOne({
            facility: req.user._id,
            patient: req.params.patientId
        });
        
        if (!facilityPatient) {
            return res.status(404).json({ error: 'Patient not found or not associated with this facility' });
        }
        
        // Update patient
        const patient = await User.findById(req.params.patientId);
        
        if (!patient) {
            return res.status(404).json({ error: 'Patient not found' });
        }
        
        // Update fields
        patient.firstName = firstName || patient.firstName;
        patient.lastName = lastName || patient.lastName;
        patient.phoneNumber = phoneNumber || patient.phoneNumber;
        patient.address = address || patient.address;
        patient.specialRequirements = specialRequirements || patient.specialRequirements;
        patient.notes = notes || patient.notes;
        
        await patient.save();
        
        res.json({ 
            message: 'Patient updated successfully',
            patient: {
                _id: patient._id,
                firstName: patient.firstName,
                lastName: patient.lastName,
                email: patient.email,
                phoneNumber: patient.phoneNumber,
                address: patient.address,
                specialRequirements: patient.specialRequirements,
                notes: patient.notes
            }
        });
    } catch (error) {
        console.error('Error updating patient:', error);
        res.status(500).json({ error: error.message });
    }
});

// Remove a patient from facility
router.delete('/patients/:patientId', auth, authorize('FACILITY'), async (req, res) => {
    try {
        // Check if this patient belongs to the facility
        const facilityPatient = await FacilityPatient.findOne({
            facility: req.user._id,
            patient: req.params.patientId
        });
        
        if (!facilityPatient) {
            return res.status(404).json({ error: 'Patient not found or not associated with this facility' });
        }
        
        // Remove association
        await FacilityPatient.findByIdAndDelete(facilityPatient._id);
        
        res.json({ message: 'Patient removed from facility successfully' });
    } catch (error) {
        console.error('Error removing patient from facility:', error);
        res.status(500).json({ error: error.message });
    }
});

// Get patient ride history
router.get('/patients/:patientId/rides', auth, authorize('FACILITY'), async (req, res) => {
    try {
        const { page = 1, limit = 10, status, sortBy = 'date', sortOrder = 'desc' } = req.query;
        
        // Check if this patient belongs to the facility
        const facilityPatient = await FacilityPatient.findOne({
            facility: req.user._id,
            patient: req.params.patientId
        });
        
        if (!facilityPatient) {
            return res.status(404).json({ error: 'Patient not found or not associated with this facility' });
        }
        
        // Build query
        let query = { patient: req.params.patientId };
        
        if (status && status !== 'all') {
            query.status = status;
        }
        
        // Build sort
        let sort = {};
        
        if (sortBy === 'date') {
            sort.scheduledTime = sortOrder === 'asc' ? 1 : -1;
        } else if (sortBy === 'status') {
            sort.status = sortOrder === 'asc' ? 1 : -1;
        }
        
        // Pagination
        const skip = (parseInt(page) - 1) * parseInt(limit);
        
        // Get rides
        const rides = await Ride.find(query)
            .sort(sort)
            .skip(skip)
            .limit(parseInt(limit))
            .populate('driver', 'firstName lastName profileImage')
            .populate('patient', 'firstName lastName');
        
        // Get total count
        const totalRides = await Ride.countDocuments(query);
        
        res.json({
            rides,
            totalPages: Math.ceil(totalRides / parseInt(limit)),
            currentPage: parseInt(page),
            totalRides
        });
    } catch (error) {
        console.error('Error fetching patient ride history:', error);
        res.status(500).json({ error: error.message });
    }
});

export default router; 