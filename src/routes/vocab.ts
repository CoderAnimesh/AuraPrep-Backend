import { Router } from 'express';
import { db } from '../db/client.js';
import { vocabWords, userVocabProgress, users } from '../db/schema.js';
import { eq, and, asc } from 'drizzle-orm';
import { authenticateToken, AuthRequest, extractOptionalUserId } from '../middleware/auth.js';
import crypto from 'crypto';

const router = Router();

const MULTILINGUAL_API_CONFIG: Record<string, { code: string; label: string; native: string }> = {
  hindi: { code: 'hi', label: 'Hindi', native: 'हिन्दी' },
  spanish: { code: 'es', label: 'Spanish', native: 'Español' },
  french: { code: 'fr', label: 'French', native: 'Français' },
  german: { code: 'de', label: 'German', native: 'Deutsch' },
  japanese: { code: 'ja', label: 'Japanese', native: '日本語' },
};

async function translateViaAPI(text: string, langCode: string): Promise<{ translated: string; pronunciation: string }> {
  try {
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=${langCode}&dt=t&dt=rm&q=${encodeURIComponent(text)}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(4000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = (await res.json()) as any;
    const translated = data[0]?.[0]?.[0] || text;
    const pronunciation = data[0]?.[1]?.[2] || '';
    return { translated, pronunciation };
  } catch (e) {
    return { translated: text, pronunciation: '' };
  }
}

// Get words by group number (with optional user progress & subscription checks)
router.get('/groups/:groupNumber/words', async (req: AuthRequest, res) => {
  const groupNumberStr = req.params.groupNumber as string;
  const parsedGroup = parseInt(groupNumberStr, 10);
  if (isNaN(parsedGroup)) {
    res.status(400).json({ message: 'Invalid group number.' });
    return;
  }

  const { language } = req.query;
  const targetLanguage = ((language as string) || 'english').toLowerCase();
  const userId = extractOptionalUserId(req);

  // Check subscription access
  const isEnglish = targetLanguage === 'english';
  const isModule1 = parsedGroup === 1;

  // English Module 1 is FREE for all users
  if (!(isEnglish && isModule1)) {
    if (!userId) {
      res.status(403).json({
        message: !isEnglish
          ? `Access locked. Learning ${targetLanguage} requires an active subscription.`
          : 'Access locked. English Module 2+ requires an active subscription.',
      });
      return;
    }

    const userList = await db.select().from(users).where(eq(users.id, userId));
    const user = userList[0];

    // Parse user's unlocked languages map
    let unlockedMap: Record<string, { plan: string; expiresAt: string }> = {};
    try {
      if (user && user.unlockedLanguages) {
        unlockedMap = JSON.parse(user.unlockedLanguages);
      }
    } catch (e) {
      unlockedMap = {};
    }

    const langInfo = unlockedMap[targetLanguage];
    const isLangActive =
      langInfo &&
      langInfo.expiresAt &&
      new Date(langInfo.expiresAt).getTime() > Date.now();

    const isEnglishLegacyActive =
      isEnglish &&
      user &&
      user.vocabPlanType !== 'none' &&
      user.vocabExpiresAt &&
      new Date(user.vocabExpiresAt).getTime() > Date.now();

    if (!isLangActive && !isEnglishLegacyActive) {
      res.status(403).json({
        message: !isEnglish
          ? `Access locked. ${targetLanguage} is currently locked on your account. Unlock ${targetLanguage} with a plan (₹499/mo or ₹2499/yr).`
          : 'Access locked. English Module 2+ requires an active VocabHub plan (₹499/mo or ₹2499/yr).',
      });
      return;
    }

    // Check module access according to plan:
    // Monthly Plan: Modules 1 to 5
    // Yearly Plan: All Modules 1 to 10
    const activePlan = langInfo?.plan || (isEnglishLegacyActive ? user.vocabPlanType : 'monthly');
    if (activePlan === 'monthly' && parsedGroup > 5 && parsedGroup !== 99) {
      res.status(403).json({
        message: `Module ${parsedGroup} is locked on the Monthly Plan. Upgrade to the Yearly Plan to unlock Modules 6 to 10 for ${targetLanguage}.`,
      });
      return;
    }
  }


  try {
    let words;
    if (parsedGroup === 99) {
      if (!userId) {
        res.json([]);
        return;
      }
      const userProgress = await db.select().from(userVocabProgress)
        .where(eq(userVocabProgress.userId, userId));
      const wordIds = userProgress.map(p => p.wordId);
      if (wordIds.length === 0) {
        res.json([]);
        return;
      }
      const allGroup99Words = await db.select().from(vocabWords)
        .where(and(
          eq(vocabWords.groupNumber, 99),
          eq(vocabWords.language, targetLanguage)
        ))
        .orderBy(asc(vocabWords.id));
      words = allGroup99Words.filter(w => wordIds.includes(w.id));
    } else {
      // 1. Fetch permanent words from DB with stable deterministic sorting
      words = await db
        .select()
        .from(vocabWords)
        .where(and(
          eq(vocabWords.groupNumber, parsedGroup),
          eq(vocabWords.language, targetLanguage)
        ))
        .orderBy(asc(vocabWords.id));

      // 2. If group already has words in DB, NEVER call API.
      // Words remain 100% static, permanent, and consistent on every login.
      // Only if group is completely empty (0 words in DB) does it initialize once.
      if (words.length === 0) {
        const groupNum = parsedGroup;
        const wordsNeeded = 30;
        const newBatchWords: any[] = [];

        // Collect existing words in this language to avoid duplicate words in the same language
        const allLangDbWords = await db
          .select({ word: vocabWords.word })
          .from(vocabWords)
          .where(eq(vocabWords.language, targetLanguage));
        const existingWordSet = new Set(allLangDbWords.map((w) => w.word.toLowerCase().trim()));

        // Distinct GRE & Academic topic seeds per group number
        const greTopics = [
          'gre,academic', 'rhetoric,literature', 'philosophy,logic', 'science,astronomy',
          'psychology,behavior', 'art,aesthetics', 'history,antiquity', 'law,jurisprudence',
          'linguistics,grammar', 'ethics,morality', 'economics,finance', 'sociology,culture',
          'politics,governance', 'biology,nature', 'mathematics,logic', 'medicine,health',
          'geology,earth', 'theology,religion', 'technology,innovation', 'architecture,design'
        ];
        const topicIndex = Math.abs(groupNum - 1) % greTopics.length;
        const topic = greTopics[topicIndex];

        const candidateWords: Array<{ word: string; pos: string; def: string }> = [];

        try {
          // Datamuse API with definitions (d) and parts-of-speech (p) metadata
          const apiUrl = `https://api.datamuse.com/words?ml=${encodeURIComponent(topic)}&md=d,p&max=60`;
          const apiRes = await fetch(apiUrl, { signal: AbortSignal.timeout(4000) });
          if (apiRes.ok) {
            const apiData = (await apiRes.json()) as any[];
            for (const item of apiData) {
              const rawWord = item.word ? String(item.word).toLowerCase().trim() : '';
              if (!rawWord || rawWord.length < 3 || rawWord.includes(' ') || !/^[a-z]+$/i.test(rawWord)) {
                continue;
              }

              let pos = 'noun';
              let def = `Key academic term referring to ${rawWord}, essential for GRE analytical reading.`;

              if (item.defs && Array.isArray(item.defs) && item.defs.length > 0) {
                const parts = String(item.defs[0]).split('\t');
                if (parts.length >= 2) {
                  const tag = parts[0].trim();
                  def = parts[1].trim();
                  if (tag === 'n') pos = 'noun';
                  else if (tag === 'v') pos = 'verb';
                  else if (tag === 'adj') pos = 'adjective';
                  else if (tag === 'adv') pos = 'adverb';
                }
              }
              def = def.charAt(0).toUpperCase() + def.slice(1);
              candidateWords.push({ word: rawWord, pos, def });
            }
          }
        } catch (e) {
          console.error(`Datamuse API fetch error for group ${groupNum}:`, e);
        }

        const langMeta = MULTILINGUAL_API_CONFIG[targetLanguage];

        if (targetLanguage === 'english') {
          for (const item of candidateWords) {
            if (newBatchWords.length >= wordsNeeded) break;
            if (existingWordSet.has(item.word)) continue;
            existingWordSet.add(item.word);

            newBatchWords.push({
              id: crypto.randomUUID(),
              word: item.word,
              partOfSpeech: item.pos,
              definition: item.def,
              synonyms: `academic, gre, ${item.word}`,
              exampleSentence: `Understanding the concept of '${item.word}' is essential for advanced critical analysis.`,
              groupNumber: groupNum,
              language: 'english',
            });
          }
        } else if (langMeta) {
          // Multilingual translation via API
          for (const item of candidateWords) {
            if (newBatchWords.length >= wordsNeeded) break;

            const trWord = await translateViaAPI(item.word, langMeta.code);
            const nativeWord = trWord.translated || item.word;
            const pron = trWord.pronunciation || '';

            if (!nativeWord || existingWordSet.has(nativeWord.toLowerCase().trim())) continue;
            existingWordSet.add(nativeWord.toLowerCase().trim());

            const trDef = await translateViaAPI(item.def, langMeta.code);
            const nativeDef = trDef.translated || item.def;

            const formattedDef = `English: ${item.def} | ${langMeta.native}: ${nativeDef}`;
            const formattedSyn = pron
              ? `Pronunciation: ${pron} | Root: ${item.word} (${item.pos})`
              : `Root: ${item.word} (${item.pos})`;

            newBatchWords.push({
              id: crypto.randomUUID(),
              word: nativeWord,
              partOfSpeech: item.pos,
              definition: formattedDef,
              synonyms: formattedSyn,
              exampleSentence: `${nativeWord} - ${formattedDef}`,
              groupNumber: groupNum,
              language: targetLanguage,
            });
          }
        }

        // Save newly generated words permanently in DB
        if (newBatchWords.length > 0) {
          try {
            await db.insert(vocabWords).values(newBatchWords).onConflictDoNothing();
          } catch (insertErr) {
            console.log('Safe insertion skip on conflict:', insertErr);
          }
          // Re-query database to return complete persisted 30-word batch with stable order
          words = await db
            .select()
            .from(vocabWords)
            .where(and(eq(vocabWords.groupNumber, groupNum), eq(vocabWords.language, targetLanguage)))
            .orderBy(asc(vocabWords.id));
        }
      }

      // Guarantee exactly top 30 words in deterministic, stable order
      words = words.slice(0, 30);
    }

    const responseWords = [];
    const progressMap = new Map();

    if (userId && words.length > 0) {
      const userProgressList = await db.select().from(userVocabProgress)
        .where(eq(userVocabProgress.userId, userId));
      for (const p of userProgressList) {
        progressMap.set(p.wordId, p);
      }
    }

    for (const w of words) {
      const progress = progressMap.get(w.id);
      responseWords.push({
        ...w,
        status: progress ? progress.status : 'not_started',
        streak: progress ? progress.streak : 0
      });
    }

    res.json(responseWords);
  } catch (error) {
    console.error('Fetch vocab words error:', error);
    res.status(500).json({ message: 'Internal server error.' });
  }
});

// Update word study progress
router.post('/words/:wordId/status', authenticateToken, async (req: AuthRequest, res) => {
  const wordId = req.params.wordId as string;
  const { status, incrementStreak } = req.body; // status: 'learning' | 'mastered'
  const userId = req.userId!;

  if (status !== 'learning' && status !== 'mastered') {
    res.status(400).json({ message: 'Status must be learning or mastered.' });
    return;
  }

  try {
    const wordsList = await db.select().from(vocabWords).where(eq(vocabWords.id, wordId));
    const word = wordsList[0];
    if (!word) {
      res.status(404).json({ message: 'Word not found.' });
      return;
    }

    const progressList = await db.select().from(userVocabProgress)
      .where(and(
        eq(userVocabProgress.userId, userId),
        eq(userVocabProgress.wordId, wordId)
      ));
    const progress = progressList[0];

    if (progress) {
      let nextStreak = progress.streak;
      if (incrementStreak) {
        nextStreak += 1;
      } else if (status === 'learning') {
        nextStreak = 0; // reset streak if learning
      }

      await db.update(userVocabProgress)
        .set({
          status,
          streak: nextStreak,
          updatedAt: new Date().toISOString()
        })
        .where(eq(userVocabProgress.id, progress.id));

      res.json({ message: 'Word progress updated.', status, streak: nextStreak });
    } else {
      const progressId = crypto.randomUUID();
      const initialStreak = incrementStreak ? 1 : 0;
      await db.insert(userVocabProgress).values({
        id: progressId,
        userId,
        wordId,
        status,
        streak: initialStreak,
        updatedAt: new Date().toISOString()
      });

      res.json({ message: 'Word progress updated.', status, streak: initialStreak });
    }
  } catch (error) {
    console.error('Update word progress error:', error);
    res.status(500).json({ message: 'Internal server error.' });
  }
});

// Get overall vocab stats for dashboard
router.get('/stats', authenticateToken, async (req: AuthRequest, res) => {
  const userId = req.userId!;

  try {
    const progressList = await db.select().from(userVocabProgress)
      .where(eq(userVocabProgress.userId, userId));

    const stats = {
      totalPracticed: progressList.length,
      mastered: progressList.filter((p: any) => p.status === 'mastered').length,
      learning: progressList.filter((p: any) => p.status === 'learning').length,
      streakWordsCount: progressList.filter((p: any) => p.streak >= 3).length
    };

    res.json(stats);
  } catch (error) {
    console.error('Fetch vocab stats error:', error);
    res.status(500).json({ message: 'Internal server error.' });
  }
});

// Import a custom word (e.g. from Dictionary API)
router.post('/import', authenticateToken, async (req: AuthRequest, res) => {
  const { word, partOfSpeech, definition, synonyms, exampleSentence, language } = req.body;
  const userId = req.userId!;

  if (!word || !definition) {
    res.status(400).json({ message: 'Word and definition are required.' });
    return;
  }

  try {
    // Check if the word already exists in vocabWords
    let wordRecord = await db.select().from(vocabWords).where(eq(vocabWords.word, word.toLowerCase().trim()));
    let wordId = '';

    if (wordRecord.length === 0) {
      // Word doesn't exist, insert it into group 99 (imported words)
      wordId = crypto.randomUUID();
      await db.insert(vocabWords).values({
        id: wordId,
        word: word.toLowerCase().trim(),
        partOfSpeech: partOfSpeech || 'noun',
        definition: definition,
        synonyms: synonyms || '',
        exampleSentence: exampleSentence || '',
        groupNumber: 99, // 99 stands for imported/custom words
        language: language || 'english'
      });
    } else {
      wordId = wordRecord[0].id;
    }

    // Now check if user progress already exists for this word
    const progressList = await db.select().from(userVocabProgress)
      .where(and(
        eq(userVocabProgress.userId, userId),
        eq(userVocabProgress.wordId, wordId)
      ));

    if (progressList.length === 0) {
      // Insert initial progress
      await db.insert(userVocabProgress).values({
        id: crypto.randomUUID(),
        userId,
        wordId,
        status: 'learning', // Default to learning on import
        streak: 0,
        updatedAt: new Date().toISOString()
      });
    }

    res.json({ message: 'Word successfully imported to your deck!', wordId });
  } catch (error) {
    console.error('Import word error:', error);
    res.status(500).json({ message: 'Internal server error.' });
  }
});

export default router;
