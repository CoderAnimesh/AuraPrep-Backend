import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import authRoutes from './routes/auth.js';
import studyPlansRoutes from './routes/studyPlans.js';
import vocabRoutes from './routes/vocab.js';
import practiceRoutes from './routes/practice.js';
import paymentRoutes from './routes/payments.js';

const app = express();
const PORT = process.env.PORT || 5000;

app.set('trust proxy', 1);

// Strict Origin Whitelist: Only localhost, aurapre.netlify.app, auraprep.netlify.app, and auraprep.us.ci
const isAllowedOrigin = (origin: string): boolean => {
  if (!origin) return false;

  try {
    const parsed = new URL(origin);
    const host = parsed.hostname.toLowerCase();

    // 1. Localhost and local loopback
    if (host === 'localhost' || host === '127.0.0.1') {
      return true;
    }

    // 2. Netlify deployments
    if (
      host === 'aurapre.netlify.app' ||
      host === 'auraprep.netlify.app' ||
      host.endsWith('.aurapre.netlify.app') ||
      host.endsWith('.auraprep.netlify.app')
    ) {
      return true;
    }

    // 3. Custom domain
    if (
      host === 'auraprep.us.ci' ||
      host === 'www.auraprep.us.ci' ||
      host.endsWith('.auraprep.us.ci')
    ) {
      return true;
    }
  } catch {
    return false;
  }

  return false;
};

// CORS Middleware enforcing allowed origins
app.use((req, res, next) => {
  const origin = req.headers.origin;

  // Allow requests without Origin header (e.g. server-to-server, health checks, curl, mobile clients)
  if (!origin) {
    return next();
  }

  if (isAllowedOrigin(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, PATCH');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, Accept, Origin');

    if (req.method === 'OPTIONS') {
      res.status(204).end();
      return;
    }
    return next();
  }

  // Reject unauthorized origins
  console.warn(`[CORS Blocked] Request from unauthorized origin: ${origin}`);
  res.status(403).json({ message: 'CORS policy: Access denied for this origin.' });
});

app.use(express.json());

// Request logger middleware
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/study-plans', studyPlansRoutes);
app.use('/api/vocab', vocabRoutes);
app.use('/api/practice', practiceRoutes);
app.use('/api/payments', paymentRoutes);


// Health check (supports both /health and /api/health for keep-alive services like UptimeRobot, Render, etc.)
const healthHandler = (_req: express.Request, res: express.Response) => {
  res.status(200).json({
    status: 'ok',
    message: 'Server is active and healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
};

app.get('/health', healthHandler);
app.get('/api/health', healthHandler);
app.head('/health', healthHandler);
app.head('/api/health', healthHandler);

// Start Server
app.listen(PORT, () => {
  console.log(`AuraPrep API Server is running on http://localhost:${PORT}`);
});

// Gemini AI & VocabMentor copilot route active

