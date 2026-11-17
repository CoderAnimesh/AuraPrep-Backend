import { Router } from 'express';
import { db } from '../db/client.js';
import { users, userVocabProgress, quizAttempts } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { authenticateToken, AuthRequest, getJwtSecret } from '../middleware/auth.js';
import crypto from 'crypto';
import { generateTOTPSecret, verifyTOTP, getOtpAuthUrl } from '../utils/totp.js';

const router = Router();

// Helper to format consistent user payload including subscription info
function formatUserResponse(user: any, streak: number = 1, prepLevel: string = 'Bronze') {
  let vocabPlanType = user.vocabPlanType || 'none';
  const vocabExpiresAt = user.vocabExpiresAt || null;

  // Auto-expire subscription if past expiry date
  if (vocabExpiresAt && new Date(vocabExpiresAt).getTime() < Date.now()) {
    vocabPlanType = 'none';
  }

  return {
    id: user.id,
    email: user.email,
    name: user.name,
    username: user.username || null,
    country: user.country || null,
    gender: user.gender || null,
    themePreference: user.themePreference || 'dark',
    profileCompleted: user.profileCompleted || 0,
    loginStreak: streak,
    preparationLevel: prepLevel,
    vocabPlanType,
    vocabExpiresAt,
    practiceAccess: user.practiceAccess || 0,
    autoRenew: user.autoRenew || 1,
    unlockedLanguages: user.unlockedLanguages || '{}',
    totpEnabled: user.totpEnabled === 1,
  };
}

// Helper to calculate prep level
async function getPreparationLevel(userId: string) {
  try {
    const vocabProgress = await db.select().from(userVocabProgress).where(eq(userVocabProgress.userId, userId));
    const masteredCount = vocabProgress.filter((p) => p.status === 'mastered').length;
    const learningCount = vocabProgress.filter((p) => p.status === 'learning').length;
    const vocabPoints = masteredCount * 50 + learningCount * 10;

    const attempts = await db.select().from(quizAttempts).where(eq(quizAttempts.userId, userId));
    const quizPoints = attempts.reduce((sum, a) => sum + Math.round((a.score / a.totalQuestions) * 100), 0);

    const totalPoints = vocabPoints + quizPoints;

    if (totalPoints >= 1500) {
      return 'GRE Legend';
    } else if (totalPoints >= 1000) {
      return 'Diamond';
    } else if (totalPoints >= 600) {
      return 'Platinum';
    } else if (totalPoints >= 300) {
      return 'Gold';
    } else if (totalPoints >= 100) {
      return 'Silver';
    }
  } catch (err) {
    console.error('Error calculating preparation level:', err);
  }
  return 'Bronze';
}

// Helper to update login streak
async function checkAndUpdateStreak(user: any) {
  try {
    const today = new Date().toISOString().split('T')[0];
    const lastLogin = user.lastLoginDate;

    if (lastLogin === today) {
      return user.loginStreak || 1;
    }

    const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
    let newStreak = 1;

    if (lastLogin === yesterday) {
      newStreak = (user.loginStreak || 0) + 1;
    }

    await db
      .update(users)
      .set({
        loginStreak: newStreak,
        lastLoginDate: today,
      })
      .where(eq(users.id, user.id));

    return newStreak;
  } catch (err) {
    console.error('Error checking and updating login streak:', err);
    return user.loginStreak || 1;
  }
}

// Register
router.post('/register', async (req, res) => {
  const { email, name, password } = req.body;
  if (!email || !name || !password) {
    res.status(400).json({ message: 'Email, name, and password are required.' });
    return;
  }
  if (password.length < 8) {
    res.status(400).json({ message: 'Password must be at least 8 characters long.' });
    return;
  }

  try {
    const usersList = await db.select().from(users).where(eq(users.email, email));
    const existing = usersList[0];
    if (existing) {
      res.status(400).json({ message: 'Email is already registered.' });
      return;
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const userId = crypto.randomUUID();

    await db.insert(users).values({
      id: userId,
      email,
      name,
      password: passwordHash,
      themePreference: 'dark',
      createdAt: new Date().toISOString(),
      vocabPlanType: 'none',
      practiceAccess: 0,
      autoRenew: 1,
    });

    const newUserList = await db.select().from(users).where(eq(users.id, userId));
    const newUser = newUserList[0];

    const token = jwt.sign({ userId }, getJwtSecret(), { expiresIn: '7d' });
    res.status(201).json({
      token,
      user: formatUserResponse(newUser, 1, 'Bronze'),
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ message: 'Internal server error.' });
  }
});

// Login
router.post('/login', async (req, res) => {
  const { email, password, totpCode } = req.body;
  if (!email || !password) {
    res.status(400).json({ message: 'Email and password are required.' });
    return;
  }

  const cleanEmail = email.trim().toLowerCase();

  try {
    const usersList = await db.select().from(users).where(eq(users.email, cleanEmail));
    const user = usersList[0];
    if (!user) {
      res.status(400).json({ message: 'Invalid email or password.' });
      return;
    }

    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      res.status(400).json({ message: 'Invalid email or password.' });
      return;
    }

    // Ensure user has a TOTP secret assigned
    let secret = user.totpSecret;
    if (!secret) {
      secret = generateTOTPSecret(20);
      await db.update(users).set({ totpSecret: secret }).where(eq(users.id, user.id));
    }

    // If TOTP code was not provided in this request, challenge the client
    if (!totpCode) {
      res.json({
        requiresTOTP: true,
        setupTOTP: user.totpEnabled !== 1,
        email: user.email,
        secret: user.totpEnabled !== 1 ? secret : undefined,
        otpauthUrl: user.totpEnabled !== 1 ? getOtpAuthUrl(user.email, secret) : undefined,
        message: user.totpEnabled === 1
          ? 'Enter the 6-digit code from your authenticator app.'
          : 'Please add the setup key to your authenticator app and enter the 6-digit code.'
      });
      return;
    }

    // TOTP code provided: verify it
    const isValidTOTP = verifyTOTP(totpCode, secret);
    if (!isValidTOTP) {
      res.status(400).json({ message: 'Invalid 6-digit authenticator code. Please check your authenticator app.' });
      return;
    }

    // If first-time verification, mark TOTP as enabled
    if (user.totpEnabled !== 1) {
      await db.update(users).set({ totpEnabled: 1 }).where(eq(users.id, user.id));
    }

    const currentStreak = await checkAndUpdateStreak(user);
    const prepLevel = await getPreparationLevel(user.id);
    const token = jwt.sign({ userId: user.id }, getJwtSecret(), { expiresIn: '7d' });
    res.json({
      token,
      user: formatUserResponse({ ...user, totpEnabled: 1 }, currentStreak, prepLevel),
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ message: 'Internal server error.' });
  }
});

// Setup TOTP (Authenticated)
router.post('/totp/setup', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const usersList = await db.select().from(users).where(eq(users.id, req.userId!));
    const user = usersList[0];
    if (!user) {
      res.status(404).json({ message: 'User not found.' });
      return;
    }

    let secret = user.totpSecret;
    if (!secret) {
      secret = generateTOTPSecret(20);
      await db.update(users).set({ totpSecret: secret }).where(eq(users.id, user.id));
    }

    res.json({
      secret,
      otpauthUrl: getOtpAuthUrl(user.email, secret),
      totpEnabled: user.totpEnabled === 1,
    });
  } catch (error) {
    console.error('TOTP setup error:', error);
    res.status(500).json({ message: 'Internal server error.' });
  }
});

// Verify TOTP (Authenticated)
router.post('/totp/verify', authenticateToken, async (req: AuthRequest, res) => {
  const { code } = req.body;
  if (!code) {
    res.status(400).json({ message: '6-digit verification code is required.' });
    return;
  }

  try {
    const usersList = await db.select().from(users).where(eq(users.id, req.userId!));
    const user = usersList[0];
    if (!user || !user.totpSecret) {
      res.status(400).json({ message: 'TOTP is not initialized for this account.' });
      return;
    }

    const isValid = verifyTOTP(code, user.totpSecret);
    if (!isValid) {
      res.status(400).json({ message: 'Invalid 6-digit code. Please try again.' });
      return;
    }

    await db.update(users).set({ totpEnabled: 1 }).where(eq(users.id, user.id));
    res.json({ message: 'Two-factor authentication successfully enabled.', totpEnabled: true });
  } catch (error) {
    console.error('TOTP verify error:', error);
    res.status(500).json({ message: 'Internal server error.' });
  }
});

// Me
router.get('/me', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const usersList = await db.select().from(users).where(eq(users.id, req.userId!));
    const user = usersList[0];
    if (!user) {
      res.status(404).json({ message: 'User not found.' });
      return;
    }
    const currentStreak = await checkAndUpdateStreak(user);
    const prepLevel = await getPreparationLevel(user.id);
    res.json(formatUserResponse(user, currentStreak, prepLevel));
  } catch (error) {
    console.error('Fetch me error:', error);
    res.status(500).json({ message: 'Internal server error.' });
  }
});

// Update theme preference
router.put('/theme', authenticateToken, async (req: AuthRequest, res) => {
  const { theme } = req.body;
  if (theme !== 'light' && theme !== 'dark') {
    res.status(400).json({ message: 'Theme must be light or dark.' });
    return;
  }

  try {
    await db.update(users).set({ themePreference: theme }).where(eq(users.id, req.userId!));

    res.json({ message: 'Theme updated successfully.', theme });
  } catch (error) {
    console.error('Theme update error:', error);
    res.status(500).json({ message: 'Internal server error.' });
  }
});

// Universal TOTP Login Verification endpoint
router.post('/totp/verify-login', async (req, res) => {
  const { email, totpCode, secret: clientSecret } = req.body;
  if (!email || !totpCode) {
    res.status(400).json({ message: 'Email and 6-digit code are required.' });
    return;
  }

  try {
    const cleanEmail = email.trim().toLowerCase();
    const usersList = await db.select().from(users).where(eq(users.email, cleanEmail));
    let user = usersList[0];
    if (!user) {
      res.status(400).json({ message: 'Account not found. Please log in again.' });
      return;
    }

    let activeSecret: string = user.totpSecret || clientSecret || generateTOTPSecret(20);
    if (!user.totpSecret) {
      await db.update(users).set({ totpSecret: activeSecret }).where(eq(users.id, user.id));
      user.totpSecret = activeSecret;
    }

    // 1. First verify against active database secret
    let isValid = verifyTOTP(totpCode, activeSecret);

    // 2. If invalid and a clientSecret was supplied (e.g. fresh QR scan during setup or re-linking),
    // test against that secret. If valid, synchronize DB secret to match the user's authenticator!
    if (!isValid && clientSecret && clientSecret !== activeSecret) {
      if (verifyTOTP(totpCode, clientSecret)) {
        activeSecret = clientSecret;
        await db.update(users).set({ totpSecret: activeSecret, totpEnabled: 1 }).where(eq(users.id, user.id));
        isValid = true;
      }
    }

    if (!isValid) {
      res.status(400).json({ message: 'Invalid 6-digit authenticator code. Check that the code is current and your phone clock is accurate.' });
      return;
    }

    if (user.totpEnabled !== 1) {
      await db.update(users).set({ totpEnabled: 1 }).where(eq(users.id, user.id));
    }

    const currentStreak = await checkAndUpdateStreak(user);
    const prepLevel = await getPreparationLevel(user.id);
    const token = jwt.sign({ userId: user.id }, getJwtSecret(), { expiresIn: '7d' });

    res.json({
      token,
      user: formatUserResponse({ ...user, totpSecret: activeSecret, totpEnabled: 1 }, currentStreak, prepLevel),
    });
  } catch (error) {
    console.error('Verify login TOTP error:', error);
    res.status(500).json({ message: 'Internal server error.' });
  }
});

// Social Login (Google / Neon Auth bridge)
router.post('/social-login', async (req, res) => {
  const { email, name, totpCode } = req.body;
  if (!email) {
    res.status(400).json({ message: 'Email is required.' });
    return;
  }

  const cleanEmail = email.trim().toLowerCase();

  try {
    const usersList = await db.select().from(users).where(eq(users.email, cleanEmail));
    let user = usersList[0];

    if (!user) {
      const userId = crypto.randomUUID();
      const dummyPassword = await bcrypt.hash(crypto.randomBytes(16).toString('hex'), 10);

      await db.insert(users).values({
        id: userId,
        email: cleanEmail,
        name: name || cleanEmail.split('@')[0],
        password: dummyPassword,
        themePreference: 'dark',
        createdAt: new Date().toISOString(),
        vocabPlanType: 'none',
        practiceAccess: 0,
        autoRenew: 1,
      });

      const updatedList = await db.select().from(users).where(eq(users.id, userId));
      user = updatedList[0];
    }

    let secret = user.totpSecret;
    if (!secret) {
      secret = generateTOTPSecret(20);
      await db.update(users).set({ totpSecret: secret }).where(eq(users.id, user.id));
      user.totpSecret = secret;
    }

    // If TOTP code not provided yet, challenge client
    if (!totpCode) {
      res.json({
        requiresTOTP: true,
        setupTOTP: user.totpEnabled !== 1,
        email: user.email,
        name: user.name,
        // Only return secret & QR on first-time setup!
        secret: user.totpEnabled !== 1 ? secret : undefined,
        otpauthUrl: user.totpEnabled !== 1 ? getOtpAuthUrl(user.email, secret) : undefined,
        message: user.totpEnabled === 1
          ? 'Enter the 6-digit code from your authenticator app.'
          : 'Scan the QR code to link your authenticator app, then enter the 6-digit code.'
      });
      return;
    }

    // Verify TOTP code against DB secret
    const isValid = verifyTOTP(totpCode, secret);
    if (!isValid) {
      res.status(400).json({ message: 'Invalid 6-digit authenticator code. Please check your authenticator app.' });
      return;
    }

    if (user.totpEnabled !== 1) {
      await db.update(users).set({ totpEnabled: 1 }).where(eq(users.id, user.id));
    }

    const currentStreak = await checkAndUpdateStreak(user);
    const prepLevel = await getPreparationLevel(user.id);
    const token = jwt.sign({ userId: user.id }, getJwtSecret(), { expiresIn: '7d' });

    res.json({
      token,
      user: formatUserResponse({ ...user, totpEnabled: 1 }, currentStreak, prepLevel),
    });
  } catch (error) {
    console.error('Social login error:', error);
    res.status(500).json({ message: 'Internal server error.' });
  }
});

// Get Leaderboard
router.get('/leaderboard', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const allUsers = await db.select().from(users);
    const allProgress = await db.select().from(userVocabProgress);
    const allAttempts = await db.select().from(quizAttempts);

    const progressByUser = new Map();
    for (const p of allProgress) {
      if (!progressByUser.has(p.userId)) {
        progressByUser.set(p.userId, []);
      }
      progressByUser.get(p.userId).push(p);
    }

    const attemptsByUser = new Map();
    for (const a of allAttempts) {
      if (!attemptsByUser.has(a.userId)) {
        attemptsByUser.set(a.userId, []);
      }
      attemptsByUser.get(a.userId).push(a);
    }

    const leaderboard = [];

    for (const u of allUsers) {
      const vocabProgress = progressByUser.get(u.id) || [];
      const masteredCount = vocabProgress.filter((p: any) => p.status === 'mastered').length;
      const learningCount = vocabProgress.filter((p: any) => p.status === 'learning').length;
      const vocabPoints = masteredCount * 50 + learningCount * 10;

      const attempts = attemptsByUser.get(u.id) || [];
      const quizPoints = attempts.reduce((sum: number, a: any) => sum + Math.round((a.score / a.totalQuestions) * 100), 0);

      const totalPoints = vocabPoints + quizPoints;

      let gameLevel = 'Bronze';
      if (totalPoints >= 1500) {
        gameLevel = 'GRE Legend';
      } else if (totalPoints >= 1000) {
        gameLevel = 'Diamond';
      } else if (totalPoints >= 600) {
        gameLevel = 'Platinum';
      } else if (totalPoints >= 300) {
        gameLevel = 'Gold';
      } else if (totalPoints >= 100) {
        gameLevel = 'Silver';
      }

      leaderboard.push({
        id: u.id,
        name: u.name,
        username: u.username,
        points: totalPoints,
        level: gameLevel,
        loginStreak: u.loginStreak,
      });
    }

    leaderboard.sort((a, b) => b.points - a.points);
    res.json(leaderboard);
  } catch (error) {
    console.error('Fetch leaderboard error:', error);
    res.status(500).json({ message: 'Internal server error.' });
  }
});

// Setup profile onboarding
router.post('/setup-profile', authenticateToken, async (req: AuthRequest, res) => {
  const { username, country, gender } = req.body;
  const userId = req.userId!;

  if (!username || !country || !gender) {
    res.status(400).json({ message: 'Username, country, and gender are required.' });
    return;
  }

  const usernameRegex = /^[a-zA-Z._]+$/;
  if (!usernameRegex.test(username)) {
    res.status(400).json({ message: 'Username can only contain alphabets, underscores (_), and periods (.).' });
    return;
  }

  try {
    const existing = await db.select().from(users).where(eq(users.username, username.toLowerCase().trim()));
    if (existing.length > 0 && existing[0].id !== userId) {
      res.status(400).json({ message: 'Username is already taken.' });
      return;
    }

    await db
      .update(users)
      .set({
        username: username.toLowerCase().trim(),
        country,
        gender,
        profileCompleted: 1,
      })
      .where(eq(users.id, userId));

    const updated = await db.select().from(users).where(eq(users.id, userId));
    const user = updated[0];
    const currentStreak = await checkAndUpdateStreak(user);
    const prepLevel = await getPreparationLevel(user.id);

    res.json({
      message: 'Profile setup completed.',
      user: formatUserResponse(user, currentStreak, prepLevel),
    });
  } catch (error) {
    console.error('Setup profile error:', error);
    res.status(500).json({ message: 'Internal server error.' });
  }
});

// Update username
router.put('/update-username', authenticateToken, async (req: AuthRequest, res) => {
  const { username } = req.body;
  const userId = req.userId!;

  if (!username) {
    res.status(400).json({ message: 'Username is required.' });
    return;
  }

  const usernameRegex = /^[a-zA-Z._]+$/;
  if (!usernameRegex.test(username)) {
    res.status(400).json({ message: 'Username can only contain alphabets, underscores (_), and periods (.).' });
    return;
  }

  try {
    const usersList = await db.select().from(users).where(eq(users.id, userId));
    const user = usersList[0];
    if (!user) {
      res.status(404).json({ message: 'User not found.' });
      return;
    }

    if (user.lastUsernameChangedAt) {
      const lastChanged = new Date(user.lastUsernameChangedAt);
      const nextAllowed = new Date(lastChanged.getTime() + 30 * 24 * 60 * 60 * 1000);
      if (new Date() < nextAllowed) {
        const daysLeft = Math.ceil((nextAllowed.getTime() - new Date().getTime()) / (24 * 60 * 60 * 1000));
        res.status(400).json({ message: `Username can only be changed once a month. Try again in ${daysLeft} day(s).` });
        return;
      }
    }

    const existing = await db.select().from(users).where(eq(users.username, username.toLowerCase().trim()));
    if (existing.length > 0 && existing[0].id !== userId) {
      res.status(400).json({ message: 'Username is already taken.' });
      return;
    }

    await db
      .update(users)
      .set({
        username: username.toLowerCase().trim(),
        lastUsernameChangedAt: new Date().toISOString(),
      })
      .where(eq(users.id, userId));

    const updated = await db.select().from(users).where(eq(users.id, userId));
    const updatedUser = updated[0];
    const currentStreak = await checkAndUpdateStreak(updatedUser);
    const prepLevel = await getPreparationLevel(updatedUser.id);

    res.json({
      message: 'Username updated successfully.',
      user: formatUserResponse(updatedUser, currentStreak, prepLevel),
    });
  } catch (error) {
    console.error('Update username error:', error);
    res.status(500).json({ message: 'Internal server error.' });
  }
});

// Update profile country/gender
router.put('/update-profile', authenticateToken, async (req: AuthRequest, res) => {
  const { country, gender } = req.body;
  const userId = req.userId!;

  if (!country || !gender) {
    res.status(400).json({ message: 'Country and gender are required.' });
    return;
  }

  try {
    await db
      .update(users)
      .set({ country, gender })
      .where(eq(users.id, userId));

    const updated = await db.select().from(users).where(eq(users.id, userId));
    const user = updated[0];
    const currentStreak = await checkAndUpdateStreak(user);
    const prepLevel = await getPreparationLevel(user.id);

    res.json({
      message: 'Profile updated successfully.',
      user: formatUserResponse(user, currentStreak, prepLevel),
    });
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({ message: 'Internal server error.' });
  }
});

export default router;
