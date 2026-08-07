import { Router } from 'express';
import { db } from '../db/client.js';
import { users, userVocabProgress, quizAttempts } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { authenticateToken, AuthRequest, getJwtSecret } from '../middleware/auth.js';
import crypto from 'crypto';

const router = Router();


// Helper to calculate prep level
async function getPreparationLevel(userId: string) {
  try {
    const vocabProgress = await db.select().from(userVocabProgress).where(eq(userVocabProgress.userId, userId));
    const masteredCount = vocabProgress.filter(p => p.status === 'mastered').length;
    const learningCount = vocabProgress.filter(p => p.status === 'learning').length;
    const vocabPoints = (masteredCount * 50) + (learningCount * 10);
    
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
      return user.loginStreak;
    }
    
    const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
    let newStreak = 1;
    
    if (lastLogin === yesterday) {
      newStreak = user.loginStreak + 1;
    }
    
    await db.update(users)
      .set({
        loginStreak: newStreak,
        lastLoginDate: today
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
      createdAt: new Date().toISOString()
    });

    const token = jwt.sign({ userId }, getJwtSecret(), { expiresIn: '7d' });
    res.status(201).json({
      token,
      user: { 
        id: userId, 
        email, 
        name, 
        themePreference: 'dark',
        loginStreak: 1,
        preparationLevel: 'Bronze',
        username: null,
        country: null,
        gender: null,
        profileCompleted: 0
      }
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ message: 'Internal server error.' });
  }
});

// Login
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    res.status(400).json({ message: 'Email and password are required.' });
    return;
  }

  try {
    const usersList = await db.select().from(users).where(eq(users.email, email));
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

    const currentStreak = await checkAndUpdateStreak(user);
    const prepLevel = await getPreparationLevel(user.id);
    const token = jwt.sign({ userId: user.id }, getJwtSecret(), { expiresIn: '7d' });
    res.json({
      token,
      user: { 
        id: user.id, 
        email: user.email, 
        name: user.name, 
        username: user.username,
        country: user.country,
        gender: user.gender,
        themePreference: user.themePreference,
        profileCompleted: user.profileCompleted,
        loginStreak: currentStreak,
        preparationLevel: prepLevel
      }
    });
  } catch (error) {
    console.error('Login error:', error);
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
    res.json({
      id: user.id,
      email: user.email,
      name: user.name,
      username: user.username,
      country: user.country,
      gender: user.gender,
      themePreference: user.themePreference,
      profileCompleted: user.profileCompleted,
      loginStreak: currentStreak,
      preparationLevel: prepLevel
    });
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
    await db.update(users)
      .set({ themePreference: theme })
      .where(eq(users.id, req.userId!));

    res.json({ message: 'Theme updated successfully.', theme });
  } catch (error) {
    console.error('Theme update error:', error);
    res.status(500).json({ message: 'Internal server error.' });
  }
});

// Social Login (Google / Neon Auth bridge)
router.post('/social-login', async (req, res) => {
  const { email, name } = req.body;
  if (!email) {
    res.status(400).json({ message: 'Email is required.' });
    return;
  }

  try {
    const usersList = await db.select().from(users).where(eq(users.email, email));
    let user = usersList[0];

    if (!user) {
      const userId = crypto.randomUUID();
      const dummyPassword = await bcrypt.hash(crypto.randomBytes(16).toString('hex'), 10);
      
      await db.insert(users).values({
        id: userId,
        email,
        name: name || email.split('@')[0],
        password: dummyPassword,
        themePreference: 'dark',
        createdAt: new Date().toISOString()
      });

      const updatedList = await db.select().from(users).where(eq(users.id, userId));
      user = updatedList[0];
    }

    const currentStreak = await checkAndUpdateStreak(user);
    const prepLevel = await getPreparationLevel(user.id);
    const token = jwt.sign({ userId: user.id }, getJwtSecret(), { expiresIn: '7d' });
    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        username: user.username,
        country: user.country,
        gender: user.gender,
        themePreference: user.themePreference,
        profileCompleted: user.profileCompleted,
        loginStreak: currentStreak,
        preparationLevel: prepLevel
      }
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
      const vocabPoints = (masteredCount * 50) + (learningCount * 10);

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
        loginStreak: u.loginStreak
      });
    }

    // Sort descending by points
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

  // Regex: only alphabets, underscores (_), and periods (.)
  const usernameRegex = /^[a-zA-Z._]+$/;
  if (!usernameRegex.test(username)) {
    res.status(400).json({ message: 'Username can only contain alphabets, underscores (_), and periods (.).' });
    return;
  }

  try {
    // Check uniqueness
    const existing = await db.select().from(users).where(eq(users.username, username.toLowerCase().trim()));
    if (existing.length > 0 && existing[0].id !== userId) {
      res.status(400).json({ message: 'Username is already taken.' });
      return;
    }

    await db.update(users)
      .set({
        username: username.toLowerCase().trim(),
        country,
        gender,
        profileCompleted: 1
      })
      .where(eq(users.id, userId));

    const updated = await db.select().from(users).where(eq(users.id, userId));
    const user = updated[0];
    const currentStreak = await checkAndUpdateStreak(user);
    const prepLevel = await getPreparationLevel(user.id);

    res.json({
      message: 'Profile completed successfully.',
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        username: user.username,
        country: user.country,
        gender: user.gender,
        themePreference: user.themePreference,
        profileCompleted: user.profileCompleted,
        loginStreak: currentStreak,
        preparationLevel: prepLevel
      }
    });
  } catch (error) {
    console.error('Setup profile error:', error);
    res.status(500).json({ message: 'Internal server error.' });
  }
});

// Update username (once a month limit)
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

    // Check if they changed username in the last 30 days
    if (user.lastUsernameChangedAt) {
      const lastChanged = new Date(user.lastUsernameChangedAt);
      const nextAllowed = new Date(lastChanged.getTime() + 30 * 24 * 60 * 60 * 1000); // 30 days
      if (new Date() < nextAllowed) {
        const daysLeft = Math.ceil((nextAllowed.getTime() - new Date().getTime()) / (24 * 60 * 60 * 1000));
        res.status(400).json({ message: `Username can only be changed once a month. Try again in ${daysLeft} day(s).` });
        return;
      }
    }

    // Check uniqueness
    const existing = await db.select().from(users).where(eq(users.username, username.toLowerCase().trim()));
    if (existing.length > 0 && existing[0].id !== userId) {
      res.status(400).json({ message: 'Username is already taken.' });
      return;
    }

    await db.update(users)
      .set({
        username: username.toLowerCase().trim(),
        lastUsernameChangedAt: new Date().toISOString()
      })
      .where(eq(users.id, userId));

    const updated = await db.select().from(users).where(eq(users.id, userId));
    const updatedUser = updated[0];
    const currentStreak = await checkAndUpdateStreak(updatedUser);
    const prepLevel = await getPreparationLevel(updatedUser.id);

    res.json({
      message: 'Username updated successfully.',
      user: {
        id: updatedUser.id,
        email: updatedUser.email,
        name: updatedUser.name,
        username: updatedUser.username,
        country: updatedUser.country,
        gender: updatedUser.gender,
        themePreference: updatedUser.themePreference,
        profileCompleted: updatedUser.profileCompleted,
        loginStreak: currentStreak,
        preparationLevel: prepLevel
      }
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
    await db.update(users)
      .set({ country, gender })
      .where(eq(users.id, userId));

    const updated = await db.select().from(users).where(eq(users.id, userId));
    const user = updated[0];
    const currentStreak = await checkAndUpdateStreak(user);
    const prepLevel = await getPreparationLevel(user.id);

    res.json({
      message: 'Profile updated successfully.',
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        username: user.username,
        country: user.country,
        gender: user.gender,
        themePreference: user.themePreference,
        profileCompleted: user.profileCompleted,
        loginStreak: currentStreak,
        preparationLevel: prepLevel
      }
    });
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({ message: 'Internal server error.' });
  }
});

export default router;
