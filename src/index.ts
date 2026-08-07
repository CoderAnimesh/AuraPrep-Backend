import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import authRoutes from './routes/auth.js';
import studyPlansRoutes from './routes/studyPlans.js';
import vocabRoutes from './routes/vocab.js';
import practiceRoutes from './routes/practice.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors({
  origin: ['http://localhost:5173', 'http://127.0.0.1:5173'],
  credentials: true
}));
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
