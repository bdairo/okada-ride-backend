const User = require('../models/User');
const jwt = require('jsonwebtoken');
const { registerValidation } = require('../middleware/validation');

const generateToken = (user) => {
    return jwt.sign(
        { _id: user._id, userType: user.userType },
        process.env.JWT_SECRET,
        { expiresIn: '24h' }
    );
};

exports.register = async (req, res, next) => {
    try {
        const { error } = registerValidation(req.body);
        if (error) {
            return res.status(400).json({ error: error.details[0].message });
        }

        const emailExists = await User.findOne({ email: req.body.email });
        if (emailExists) {
            return res.status(400).json({ error: 'Email already exists' });
        }

        const user = new User(req.body);
        await user.save();

        const token = generateToken(user);
        res.status(201).json({ user, token });
    } catch (error) {
        next(error);
    }
};

exports.login = async (req, res, next) => {
    try {
        const { email, password } = req.body;

        const user = await User.findOne({ email });
        if (!user) {
            return res.status(400).json({ error: 'Invalid email or password' });
        }

        const isValidPassword = await user.comparePassword(password);
        if (!isValidPassword) {
            return res.status(400).json({ error: 'Invalid email or password' });
        }

        const token = generateToken(user);
        res.json({ user, token });
    } catch (error) {
        next(error);
    }
}; 