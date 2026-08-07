import { Router } from 'express';
import { db } from '../db/client.js';
import { practiceQuestions, quizAttempts } from '../db/schema.js';
import { eq, desc } from 'drizzle-orm';
import { authenticateToken, AuthRequest } from '../middleware/auth.js';
import crypto from 'crypto';

const router = Router();

// Helper to decode OpenTDB HTML entities
function decodeHTML(html: string): string {
  if (!html) return '';
  return html
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&deg;/g, '°')
    .replace(/&plusmn;/g, '±')
    .replace(/&eacute;/g, 'é')
    .replace(/&micro;/g, 'µ');
}

// Procedural Question Synthesis Engine for Infinite Quant, Geometry, Data Analysis & Probability
function generateProceduralQuestion(idx: number, sectionFilter: string) {
  const seed = Date.now() + idx + Math.floor(Math.random() * 100000);
  const type = idx % 4;

  if (type === 0 || sectionFilter === 'quant') {
    // 1. Linear Algebra Equation: a*x + b = c
    const a = Math.floor(Math.random() * 8) + 2;
    const xVal = Math.floor(Math.random() * 15) + 1;
    const b = Math.floor(Math.random() * 20) + 1;
    const c = a * xVal + b;
    const mult = Math.floor(Math.random() * 3) + 2;
    const sub = Math.floor(Math.random() * 10) + 1;
    const targetVal = mult * a * xVal - sub;

    const options = Array.from(
      new Set([
        targetVal.toString(),
        (targetVal + 5).toString(),
        (targetVal - 3).toString(),
        (targetVal * 2).toString(),
      ])
    ).sort(() => 0.5 - Math.random());

    return {
      id: `proc-quant-${seed}`,
      questionText: `Quantitative Algebra: If ${a}x + ${b} = ${c}, what is the value of ${mult * a}x - ${sub}?`,
      options: JSON.stringify(options),
      correctAnswer: targetVal.toString(),
      section: 'quant',
      category: 'Algebra & Equations (Infinite Engine)',
      difficulty: 'medium',
      explanation: `${a}x + ${b} = ${c} => ${a}x = ${c - b} => x = ${xVal}. Thus ${mult * a}(${xVal}) - ${sub} = ${targetVal}.`,
    };
  } else if (type === 1) {
    // 2. Geometry Circle Area & Circumference
    const radius = Math.floor(Math.random() * 12) + 2;
    const area = radius * radius;
    const circ = 2 * radius;

    const options = Array.from(
      new Set([`${circ}π`, `${radius}π`, `${area}π`, `${circ * 2}π`])
    ).sort(() => 0.5 - Math.random());

    return {
      id: `proc-geom-${seed}`,
      questionText: `Geometry: A circle has an area of ${area}π square units. What is the circumference of the circle?`,
      options: JSON.stringify(options),
      correctAnswer: `${circ}π`,
      section: 'quant',
      category: 'Circle Geometry (Infinite Engine)',
      difficulty: 'medium',
      explanation: `Area = π*r^2 = ${area}π => r = ${radius}. Circumference = 2*π*r = ${circ}π.`,
    };
  } else if (type === 2 || sectionFilter === 'di') {
    // 3. Percent Change Data Interpretation
    const startVal = (Math.floor(Math.random() * 20) + 10) * 1000;
    const pct = (Math.floor(Math.random() * 8) + 2) * 5;
    const endVal = startVal + (startVal * pct) / 100;

    const options = Array.from(
      new Set([`${pct}%`, `${pct + 10}%`, `${pct / 2}%`, `${pct + 5}%`])
    ).sort(() => 0.5 - Math.random());

    return {
      id: `proc-di-${seed}`,
      questionText: `Data Analysis: A company's quarterly revenue grew from $${startVal.toLocaleString()} to $${endVal.toLocaleString()}. What was the percentage increase?`,
      options: JSON.stringify(options),
      correctAnswer: `${pct}%`,
      section: 'di',
      category: 'Data Analysis (Infinite Engine)',
      difficulty: 'medium',
      explanation: `Percent Change = ((${endVal} - ${startVal}) / ${startVal}) * 100 = ${pct}%.`,
    };
  } else {
    // 4. Probability Ratio
    const red = Math.floor(Math.random() * 6) + 2;
    const blue = Math.floor(Math.random() * 6) + 2;
    const green = Math.floor(Math.random() * 6) + 2;
    const total = red + blue + green;

    const options = Array.from(
      new Set([`${red}/${total}`, `${blue}/${total}`, `${green}/${total}`, `1/${total}`])
    ).sort(() => 0.5 - Math.random());

    return {
      id: `proc-prob-${seed}`,
      questionText: `Probability: A bag contains ${red} red marbles, ${blue} blue marbles, and ${green} green marbles. If one marble is drawn at random, what is the probability that it is red?`,
      options: JSON.stringify(options),
      correctAnswer: `${red}/${total}`,
      section: 'quant',
      category: 'Probability & Ratios (Infinite Engine)',
      difficulty: 'easy',
      explanation: `Total marbles = ${red} + ${blue} + ${green} = ${total}. Favorable red marbles = ${red}. Probability = ${red}/${total}.`,
    };
  }
}

// Default Base Question Seed
const defaultExpandedQuestions = [
  // QUANT
  {
    id: 'q-quant-1',
    questionText: 'If 3x + 7 = 22, what is the value of 6x - 5?',
    options: JSON.stringify(['25', '27', '30', '35']),
    correctAnswer: '25',
    section: 'quant',
    category: 'Algebra',
    difficulty: 'easy',
    explanation: '3x + 7 = 22 => 3x = 15 => x = 5. Therefore 6x - 5 = 6(5) - 5 = 25.',
  },
  {
    id: 'q-quant-2',
    questionText: 'A circle has an area of 49π. What is the circumference of the circle?',
    options: JSON.stringify(['7π', '14π', '28π', '49π']),
    correctAnswer: '14π',
    section: 'quant',
    category: 'Geometry',
    difficulty: 'medium',
    explanation: 'Area = π*r^2 = 49π => r = 7. Circumference = 2*π*r = 14π.',
  },
  // VERBAL
  {
    id: 'q-verb-1',
    questionText: 'The researcher was remarkably ________, carefully noting every minute anomaly in the experimental dataset.',
    options: JSON.stringify(['fastidious', 'cursory', 'hasty', 'negligent']),
    correctAnswer: 'fastidious',
    section: 'verbal',
    category: 'Text Completion',
    difficulty: 'medium',
    explanation: '"Fastidious" means showing great attention to detail.',
  },
  // AWA
  {
    id: 'q-awa-1',
    questionText: 'Issue Task Prompt: "Governments should offer free university tuition to all citizens regardless of income." Evaluate the extent to which you agree or disagree.',
    options: JSON.stringify([
      'Option A: Strongly Agree - Higher education is a fundamental public good.',
      'Option B: Strongly Disagree - Universal free tuition burdens taxpayers.',
      'Option C: Qualify - Target free tuition based on income thresholds.',
      'Option D: Alternate - Focus funding on vocational training.',
    ]),
    correctAnswer: 'Option C: Qualify - Target free tuition based on income thresholds.',
    section: 'awa',
    category: 'Issue Task',
    difficulty: 'hard',
    explanation: 'Qualifying with targeted nuances shows top-tier GRE AWA analytical depth.',
  },
  // DI
  {
    id: 'q-di-1',
    questionText: 'Data Interpretation: Company revenue increased from $400,000 to $650,000. What was the percent increase?',
    options: JSON.stringify(['37.5%', '62.5%', '50.0%', '75.0%']),
    correctAnswer: '62.5%',
    section: 'di',
    category: 'Data Analysis',
    difficulty: 'medium',
    explanation: 'Percent Increase = ((650,000 - 400,000) / 400,000) * 100 = 62.5%.',
  },
];

// INFINITE QUESTION GENERATOR API ROUTE
router.get('/questions/infinite', async (req, res) => {
  const { amount = '10', section = 'all', page = '1' } = req.query;
  const count = parseInt(amount as string) || 10;
  const pageNum = parseInt(page as string) || 1;

  try {
    const categories = ['19', '18', '17', '10', '22', '23']; // OpenTDB categories
    const selectedCat = categories[(pageNum + Math.floor(Math.random() * categories.length)) % categories.length];

    // Try fetching from OpenTDB
    const openTdbRes = await fetch(
      `https://opentdb.com/api.php?amount=${Math.min(count, 10)}&category=${selectedCat}&type=multiple`
    );
    const apiData = await openTdbRes.json();

    const resultQuestions: any[] = [];

    if (apiData.response_code === 0 && apiData.results && apiData.results.length > 0) {
      apiData.results.forEach((item: any, idx: number) => {
        const correct = decodeHTML(item.correct_answer);
        const incorrect = item.incorrect_answers.map((ans: string) => decodeHTML(ans));
        const allOptions = [...incorrect, correct].sort(() => 0.5 - Math.random());

        resultQuestions.push({
          id: `infinite-api-p${pageNum}-${idx}-${Date.now()}`,
          questionText: decodeHTML(item.question),
          options: JSON.stringify(allOptions),
          correctAnswer: correct,
          section: 'trivia',
          category: `${decodeHTML(item.category)} (Infinite API)`,
          difficulty: item.difficulty || 'medium',
          explanation: `Correct Answer: "${correct}". Powered by OpenTDB Live API.`,
        });
      });
    }

    // Fill remaining slots with Procedural Infinite Math / GRE Questions
    while (resultQuestions.length < count) {
      const proc = generateProceduralQuestion(resultQuestions.length + pageNum * 10, section as string);
      resultQuestions.push(proc);
    }

    res.json(resultQuestions);
  } catch (error) {
    console.error('Error generating infinite questions:', error);

    // Fallback to procedurally generated batch
    const fallbacks = [];
    for (let i = 0; i < count; i++) {
      fallbacks.push(generateProceduralQuestion(i + pageNum * 10, section as string));
    }
    res.json(fallbacks);
  }
});

// Live OpenTDB Free Questions Endpoint
router.get('/questions/live', async (req, res) => {
  const { amount = '5', category = '19' } = req.query;

  try {
    const apiRes = await fetch(
      `https://opentdb.com/api.php?amount=${amount}&category=${category}&type=multiple`
    );
    const data = await apiRes.json();

    if (data.response_code === 0 && data.results && data.results.length > 0) {
      const formatted = data.results.map((item: any, idx: number) => {
        const correct = decodeHTML(item.correct_answer);
        const incorrect = item.incorrect_answers.map((ans: string) => decodeHTML(ans));
        const allOptions = [...incorrect, correct].sort(() => 0.5 - Math.random());

        return {
          id: `live-opentdb-${Date.now()}-${idx}`,
          questionText: decodeHTML(item.question),
          options: JSON.stringify(allOptions),
          correctAnswer: correct,
          section: 'trivia',
          category: `${decodeHTML(item.category)} (Live API)`,
          difficulty: item.difficulty || 'medium',
          explanation: `Correct Answer: "${correct}". Powered live by OpenTDB Free Questions API.`,
        };
      });

      res.json(formatted);
      return;
    }

    res.json(defaultExpandedQuestions.filter((q) => q.section === 'quant'));
  } catch (error) {
    console.error('Error fetching OpenTDB live questions:', error);
    res.json(defaultExpandedQuestions.filter((q) => q.section === 'quant'));
  }
});

// Get practice questions
router.get('/questions', async (req, res) => {
  const { section, category, difficulty, infinite } = req.query;

  // If infinite requested, generate dynamic batch
  if (infinite === 'true') {
    const infiniteBatch = [];
    for (let i = 0; i < 10; i++) {
      infiniteBatch.push(generateProceduralQuestion(i, (section as string) || 'all'));
    }
    res.json(infiniteBatch);
    return;
  }

  try {
    let questionsList = await db.select().from(practiceQuestions);

    if (questionsList.length === 0) {
      questionsList = defaultExpandedQuestions as any;
    }

    if (section && section !== 'all') {
      questionsList = questionsList.filter((q: any) => q.section === section);
    }
    if (category && category !== 'all') {
      questionsList = questionsList.filter((q: any) => q.category === category);
    }
    if (difficulty && difficulty !== 'all') {
      questionsList = questionsList.filter((q: any) => q.difficulty === difficulty);
    }

    res.json(questionsList);
  } catch (error) {
    console.error('Fetch practice questions error:', error);
    res.json(defaultExpandedQuestions);
  }
});

// Submit quiz results
router.post('/quiz/submit', authenticateToken, async (req: AuthRequest, res) => {
  const { score, totalQuestions, section } = req.body;
  const userId = req.userId!;

  if (score === undefined || totalQuestions === undefined || !section) {
    res.status(400).json({ message: 'Score, totalQuestions, and section are required.' });
    return;
  }

  try {
    const attemptId = crypto.randomUUID();
    const attemptedAt = new Date().toISOString();

    await db.insert(quizAttempts).values({
      id: attemptId,
      userId,
      score: parseInt(score),
      totalQuestions: parseInt(totalQuestions),
      section: section as string,
      attemptedAt,
    });

    res.status(201).json({
      message: 'Quiz attempt saved successfully.',
      attempt: {
        id: attemptId,
        score,
        totalQuestions,
        section,
        attemptedAt,
      },
    });
  } catch (error) {
    console.error('Submit quiz attempt error:', error);
    res.status(500).json({ message: 'Internal server error.' });
  }
});

// Get user quiz attempts history
router.get('/quiz/history', authenticateToken, async (req: AuthRequest, res) => {
  const userId = req.userId!;

  try {
    const history = await db
      .select()
      .from(quizAttempts)
      .where(eq(quizAttempts.userId, userId))
      .orderBy(desc(quizAttempts.attemptedAt));

    res.json(history);
  } catch (error) {
    console.error('Fetch quiz history error:', error);
    res.status(500).json({ message: 'Internal server error.' });
  }
});

export default router;
