import { Router } from 'express';
import { db } from '../db/client.js';
import { studyPlans, studyDays, studyTasks, userTaskProgress } from '../db/schema.js';
import { eq, and, inArray } from 'drizzle-orm';
import { authenticateToken, AuthRequest, extractOptionalUserId } from '../middleware/auth.js';
import crypto from 'crypto';

const router = Router();

// Get study plans
router.get('/', async (req, res) => {
  try {
    const plans = await db.select().from(studyPlans);
    res.json(plans);
  } catch (error) {
    console.error('Fetch study plans error:', error);
    res.status(500).json({ message: 'Internal server error.' });
  }
});

// Get detailed days & tasks for a plan (with optional user progress)
router.get('/:planId/days', async (req: AuthRequest, res) => {
  const planId = req.params.planId as string;
  const userId = extractOptionalUserId(req);

  try {
    const plansList = await db.select().from(studyPlans).where(eq(studyPlans.id, planId));
    const plan = plansList[0];
    if (!plan) {
      res.status(404).json({ message: 'Study plan not found.' });
      return;
    }

    const days = await db.select().from(studyDays).where(eq(studyDays.planId, planId));
    
    const dayIds = days.map(d => d.id);
    let allTasks: any[] = [];
    if (dayIds.length > 0) {
      allTasks = await db.select().from(studyTasks).where(inArray(studyTasks.dayId, dayIds));
    }

    const progressMap = new Map();
    if (userId && allTasks.length > 0) {
      const userProgressList = await db.select().from(userTaskProgress)
        .where(eq(userTaskProgress.userId, userId));
      for (const p of userProgressList) {
        progressMap.set(p.taskId, p.completed === 1);
      }
    }

    const tasksByDay = new Map();
    for (const task of allTasks) {
      if (!tasksByDay.has(task.dayId)) {
        tasksByDay.set(task.dayId, []);
      }
      const completed = progressMap.get(task.id) || false;
      tasksByDay.get(task.dayId).push({
        ...task,
        completed
      });
    }

    const responseDays = days.map(day => ({
      ...day,
      tasks: tasksByDay.get(day.id) || []
    }));

    res.json({ plan, days: responseDays });
  } catch (error) {
    console.error('Fetch study plan details error:', error);
    res.status(500).json({ message: 'Internal server error.' });
  }
});

// Toggle task completion
router.post('/tasks/:taskId/toggle', authenticateToken, async (req: AuthRequest, res) => {
  const taskId = req.params.taskId as string;
  const userId = req.userId!;

  try {
    const tasksList = await db.select().from(studyTasks).where(eq(studyTasks.id, taskId));
    const task = tasksList[0];
    if (!task) {
      res.status(404).json({ message: 'Task not found.' });
      return;
    }

    const progressList = await db.select().from(userTaskProgress)
      .where(and(
        eq(userTaskProgress.userId, userId),
        eq(userTaskProgress.taskId, taskId)
      ));
    const progress = progressList[0];

    if (progress) {
      // Toggle
      const newStatus = progress.completed === 1 ? 0 : 1;
      await db.update(userTaskProgress)
        .set({ completed: newStatus, completedAt: newStatus === 1 ? new Date().toISOString() : null })
        .where(eq(userTaskProgress.id, progress.id));
      
      res.json({ message: 'Task status updated.', completed: newStatus === 1 });
    } else {
      // Create new completion entry
      const progressId = crypto.randomUUID();
      await db.insert(userTaskProgress).values({
        id: progressId,
        userId,
        taskId,
        completed: 1,
        completedAt: new Date().toISOString()
      });

      res.json({ message: 'Task status updated.', completed: true });
    }
  } catch (error) {
    console.error('Toggle task progress error:', error);
    res.status(500).json({ message: 'Internal server error.' });
  }
});

// AI Chat Endpoint with Gemini API Integration
router.post('/ai-chat', async (req, res) => {
  const { message, history, context } = req.body;
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey || apiKey === 'your_gemini_api_key_here') {
    res.json({
      success: false,
      isConfigured: false,
      message: 'GEMINI_API_KEY is not configured in backend/.env',
    });
    return;
  }

  try {
    const systemPrompt = `You are "VocabMentor AI", a premier GRE Verbal & Quantitative reasoning tutor designed for the AuraPrep platform (Gregmat mastery curriculum).
Your primary role is to help students with:
1. Reading, defining, and pronouncing high-frequency GRE vocabulary with phonetics, concise definitions, and memorable visual mnemonics.
2. Breaking down Sentence Equivalence & Text Completion contrast clues, pivot words (Although, However, Far from, Paradoxically, Despite), and matching synonymous pairs.
3. Explaining Reading Comprehension passages: tone, primary purpose, and eliminating deceptive ETS answer choices.
4. Answering questions about Quant concepts (Prime factorization, exponents, triangles, geometry, data interpretation).

Formatting guidelines:
- Keep explanations structured, energetic, clear, and encouraging.
- When explaining words, include: Phonetics, Part of speech, Definition, Pairing Synonyms, Antonyms, Mnemonic hook, and GRE example sentence.
- Use bolding and concise bullet points.`;

    const contents = [];

    // Add conversation history if provided
    if (Array.isArray(history)) {
      for (const h of history) {
        if (h.sender && h.text) {
          contents.push({
            role: h.sender === 'user' ? 'user' : 'model',
            parts: [{ text: h.text }],
          });
        }
      }
    }

    // Add current user message
    contents.push({
      role: 'user',
      parts: [
        {
          text: context
            ? `[Context: ${context}]\n\nUser Question: ${message}`
            : message,
        },
      ],
    });

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents,
          systemInstruction: {
            parts: [{ text: systemPrompt }],
          },
          generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 1000,
          },
        }),
      }
    );

    const data: any = await response.json();

    if (!response.ok) {
      console.error('Gemini API Error:', data);
      res.status(500).json({
        success: false,
        isConfigured: true,
        error: data.error?.message || 'Failed to call Gemini API',
      });
      return;
    }

    const replyText =
      data.candidates?.[0]?.content?.parts?.[0]?.text ||
      'No response generated from Gemini.';

    res.json({
      success: true,
      isConfigured: true,
      reply: replyText,
    });
  } catch (error: any) {
    console.error('Error invoking Gemini API:', error);
    res.status(500).json({
      success: false,
      isConfigured: true,
      error: error.message || 'Internal server error while calling Gemini API',
    });
  }
});

export default router;

