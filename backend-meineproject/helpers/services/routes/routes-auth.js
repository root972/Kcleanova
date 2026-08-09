const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

// Secret key used to sign and verify digital tokens (JWTs)
const JWT_SECRET = process.env.JWT_SECRET || 'super_secret_geofence_key_2026';

// In-memory user database (will store user records for this session)
const users = [];

/**
 * 1. REGISTRATION ENDPOINT
 * Route: POST /api/auth/register
 * Expects: { fullName, email, password, role }
 */
router.post('/register', async (req, res) => {
  try {
    const { fullName, email, password, role } = req.body;

    // Validation: Check for missing fields
    if (!email || !password || !fullName) {
      return res.status(400).json({ message: 'Full name, email, and password are required.' });
    }

    // Check if a user with this email already exists
    const existingUser = users.find(u => u.email === email.toLowerCase());
    if (existingUser) {
      return res.status(400).json({ message: 'User with this email already exists.' });
    }

    // Security: Hash the raw password before saving
    const hashedPassword = await bcrypt.hash(password, 10);

    // Build the user record
    const newUser = {
      id: users.length + 1,
      fullName,
      email: email.toLowerCase(),
      password: hashedPassword,
      role: role === 'ADMIN' ? 'ADMIN' : 'WORKER' // Default to WORKER if not specified
    };

    users.push(newUser);
    console.log(`👤 New user registered: ${newUser.email} [Role: ${newUser.role}]`);

    res.status(201).json({ message: 'User registered successfully.' });
  } catch (err) {
    console.error('Registration Error:', err);
    res.status(500).json({ message: 'Server error during registration.' });
  }
});

/**
 * 2. LOGIN ENDPOINT
 * Route: POST /api/auth/login
 * Expects: { email, password }
 */
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    // Find the user by email
    const user = users.find(u => u.email === (email || '').toLowerCase());
    if (!user) {
      return res.status(401).json({ message: 'Invalid email or password.' });
    }

    // Compare the submitted password with the stored hash
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ message: 'Invalid email or password.' });
    }

    // Generate JWT token containing key user information and role
    const token = jwt.sign(
      { 
        userId: user.id, 
        email: user.email, 
        role: user.role, 
        fullName: user.fullName 
      },
      JWT_SECRET,
      { expiresIn: '12h' }
    );

    console.log(`🔑 User logged in: ${user.email} [Role: ${user.role}]`);

    // Return token and non-sensitive user metadata to Angular
    res.json({
      token,
      user: {
        id: user.id,
        fullName: user.fullName,
        email: user.email,
        role: user.role
      }
    });
  } catch (err) {
    console.error('Login Error:', err);
    res.status(500).json({ message: 'Server error during login.' });
  }
});

module.exports = router;