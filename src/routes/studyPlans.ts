import { Router } from 'express';
import { db } from '../db/client.js';
import { studyPlans, studyDays, studyTasks, userTaskProgress } from '../db/schema.js';
import { eq, and, inArray } from 'drizzle-orm';
import { authenticateToken, AuthRequest, extractOptionalUserId } from '../middleware/auth.js';

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

export default router;
