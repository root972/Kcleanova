const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { PrismaClient } = require('@prisma/client');
// resend application for sending emails
const { Resend } = require('resend');
const resend = new Resend(process.env.RESEND_API_KEY);
// Secret key used to sign and verify digital tokens (JWTs)
const JWT_SECRET = process.env.JWT_SECRET || 'super_secret_geofence_key_2026';

// Use Prisma for persistent user storage
const prisma = new PrismaClient();

/**
 * 1. REGISTRATION ENDPOINT
 * Route: POST /api/auth/register
 * Expects: { fullName, email, password }
 * Note: role is enforced server-side to 'WORKER' for all public registrations
 */
router.post('/register', async (req, res) => {
  try {
    const { fullName, email, password } = req.body;

    // Validation: Check for missing fields
    if (!email || !password || !fullName) {
      return res.status(400).json({ message: 'Full name, email, and password are required.' });
    }

    const normalizedEmail = email.toLowerCase();

    // Check if a user with this email already exists
    const existingUser = await prisma.user.findUnique({ where: { email: normalizedEmail } });
    if (existingUser) {
      return res.status(400).json({ message: 'User with this email already exists.' });
    }

    // Security: Hash the raw password before saving
    const hashedPassword = await bcrypt.hash(password, 10);

    // Force role to WORKER for public registration
    const created = await prisma.user.create({
      data: {
        name: fullName,
        email: normalizedEmail,
        password: hashedPassword,
        role: 'WORKER',
        worker: {
          create: {
            status: 'active'
          }
        }
      },
      include: { worker: true }
    });

    console.log(`👤 New WORKER registered: ${created.email} [id:${created.id}]`);

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

    const normalizedEmail = (email || '').toLowerCase();

    // Find the user by email (include worker relation)
    const user = await prisma.user.findUnique({ where: { email: normalizedEmail }, include: { worker: true } });
    if (!user) {
      return res.status(401).json({ message: 'Invalid email or password.' });
    }

    // Compare the submitted password with the stored hash
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ message: 'Invalid email or password.' });
    }

    // Construct worker object if role is WORKER
    const workerData = user.role === 'WORKER' ? (user.worker || { id: user.id, userId: user.id, status: 'active' }) : undefined;

    // Generate JWT token containing key user information and role
    const token = jwt.sign(
      { 
        userId: user.id, 
        email: user.email, 
        role: user.role, 
        fullName: user.name,
        workerId: workerData?.id
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
        fullName: user.name,
        email: user.email,
        role: user.role,
        worker: workerData // Attaches worker object so Angular can read user.worker.id
      }
    });
  } catch (err) {
    console.error('Login Error:', err);
    res.status(500).json({ message: 'Server error during login.' });
  }
});






// ---------------------------
// FORGOT / RESET PASSWORD
// ---------------------------
const crypto = require('crypto');

// POST /api/auth/forgot-password
router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ message: 'Email is required.' });

    const normalizedEmail = (email || '').toLowerCase();
    const user = await prisma.user.findUnique({ where: { email: normalizedEmail } });

    // Always respond success to avoid user enumeration
    if (!user) {
      console.log(`Password reset requested for unknown email: ${normalizedEmail}`);
      return res.json({ message: 'If an account exists for that email, a reset link was sent.' });
    }

    const token = crypto.randomBytes(32).toString('hex');
    const expires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    await prisma.user.update({ 
      where: { id: user.id }, 
      data: { resetPasswordToken: token, resetPasswordExpires: expires } 
    });

    const frontendHost = process.env.FRONTEND_URL || 'http://localhost:4200';
    const resetUrl = `${frontendHost}/reset-password?token=${token}`;

    try {
      await resend.emails.send({
        from: 'onboarding@resend.dev',
        to: user.email,
        subject: 'Kcleanova Password Reset Request',
        html: `
          <div style="font-family: Arial, sans-serif; padding: 20px;">
            <h2>Password Reset</h2>
            <p>You requested a password reset. Click the link below to reset your password (valid for 1 hour):</p>
            <a href="${resetUrl}" style="background-color: #2563eb; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block;">Reset Password</a>
            <p style="margin-top: 20px; color: #666;">If you didn't request this, you can safely ignore this email.</p>
          </div>
        `
      });
      console.log(`Password reset email sent via Resend to ${user.email}`);
    } catch (mailErr) {
      console.error('Failed to send reset email via Resend:', mailErr);
      console.log('Fallback Reset link:', resetUrl);
    }

    return res.json({ message: 'If an account exists for that email, a reset link was sent.' });
  } catch (err) {
    console.error('Forgot Password Error:', err);
    return res.status(500).json({ message: 'Server error.' });
  }
});

// POST /api/auth/reset-password
router.post('/reset-password', async (req, res) => {
  try {
    const { token, newPassword } = req.body;
    if (!token || !newPassword) return res.status(400).json({ message: 'Token and newPassword are required.' });

    const user = await prisma.user.findFirst({ 
      where: { 
        resetPasswordToken: token, 
        resetPasswordExpires: { gt: new Date() } 
      } 
    });
    
    if (!user) {
      return res.status(400).json({ message: 'Invalid or expired token.' });
    }

    const hashed = await bcrypt.hash(newPassword, 10);
    await prisma.user.update({ 
      where: { id: user.id }, 
      data: { password: hashed, resetPasswordToken: null, resetPasswordExpires: null } 
    });

    return res.json({ message: 'Password has been reset successfully.' });
  } catch (err) {
    console.error('Reset Password Error:', err);
    return res.status(500).json({ message: 'Server error.' });
  }
});

module.exports = router;