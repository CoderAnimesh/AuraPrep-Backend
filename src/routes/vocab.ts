import { Router } from 'express';
import { db } from '../db/client.js';
import { vocabWords, userVocabProgress, users } from '../db/schema.js';
import { eq, and } from 'drizzle-orm';
import { authenticateToken, AuthRequest, extractOptionalUserId } from '../middleware/auth.js';
import crypto from 'crypto';

const router = Router();

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
        ));
      words = allGroup99Words.filter(w => wordIds.includes(w.id));
    } else {
      words = await db.select().from(vocabWords)
        .where(and(
          eq(vocabWords.groupNumber, parsedGroup),
          eq(vocabWords.language, targetLanguage)
        ));

      // Dynamic Free API Fetcher & DB Persistence if words in batch < 30
      if (words.length < 30) {
        const groupNum = parsedGroup;
        const wordsNeeded = 30 - words.length;
        const newBatchWords: any[] = [];

        // Collect existing words across DB to avoid duplicate words
        const allDbWords = await db.select({ word: vocabWords.word }).from(vocabWords);
        const existingWordSet = new Set(allDbWords.map(w => w.word.toLowerCase().trim()));

        if (targetLanguage === 'english') {
          // Distinct GRE & Academic topic seeds per group number
          const greTopics = [
            'gre,academic', 'rhetoric,literature', 'philosophy,logic', 'science,astronomy',
            'psychology,behavior', 'art,aesthetics', 'history,antiquity', 'law,jurisprudence',
            'linguistics,grammar', 'ethics,morality', 'economics,finance', 'sociology,culture',
            'politics,governance', 'biology,nature', 'mathematics,logic', 'medicine,health',
            'geology,earth', 'theology,religion', 'technology,innovation', 'architecture,design'
          ];
          const topicIndex = Math.abs((groupNum - 1)) % greTopics.length;
          const topic = greTopics[topicIndex];

          try {
            // Datamuse API with definitions (d) and parts-of-speech (p) metadata
            const apiUrl = `https://api.datamuse.com/words?ml=${encodeURIComponent(topic)}&md=d,p&max=100`;
            const apiRes = await fetch(apiUrl);
            if (apiRes.ok) {
              const apiData = (await apiRes.json()) as any[];
              for (const item of apiData) {
                if (newBatchWords.length >= wordsNeeded) break;
                const rawWord = item.word ? String(item.word).toLowerCase().trim() : '';

                // Filter invalid words, short terms, phrases, or duplicates
                if (!rawWord || rawWord.length < 3 || rawWord.includes(' ') || !/^[a-z]+$/i.test(rawWord) || existingWordSet.has(rawWord)) {
                  continue;
                }

                let pos = 'noun';
                let def = `Key academic term referring to ${rawWord}, essential for GRE analytical reading.`;

                if (item.defs && Array.isArray(item.defs) && item.defs.length > 0) {
                  const rawDef = String(item.defs[0]);
                  const parts = rawDef.split('\t');
                  if (parts.length >= 2) {
                    const tag = parts[0].trim();
                    def = parts[1].trim();
                    if (tag === 'n') pos = 'noun';
                    else if (tag === 'v') pos = 'verb';
                    else if (tag === 'adj') pos = 'adjective';
                    else if (tag === 'adv') pos = 'adverb';
                  }
                } else if (item.tags && Array.isArray(item.tags)) {
                  if (item.tags.includes('n')) pos = 'noun';
                  else if (item.tags.includes('v')) pos = 'verb';
                  else if (item.tags.includes('adj')) pos = 'adjective';
                  else if (item.tags.includes('adv')) pos = 'adverb';
                }

                def = def.charAt(0).toUpperCase() + def.slice(1);
                existingWordSet.add(rawWord);

                newBatchWords.push({
                  id: crypto.randomUUID(),
                  word: rawWord,
                  partOfSpeech: pos,
                  definition: def,
                  synonyms: `academic, gre, ${rawWord}`,
                  exampleSentence: `Understanding the concept of '${rawWord}' is essential for advanced critical analysis.`,
                  groupNumber: groupNum,
                  language: 'english'
                });
              }
            }
          } catch (e) {
            console.error(`Datamuse API fetch error for group ${groupNum}:`, e);
          }
        }

        // Multilingual Vocabulary Datasets with 30 Distinct Unique Words per Language
        // Array Format: [nativeWord, partOfSpeech, englishPron, hindiPron, englishMeaning, hindiMeaning, exampleSentence]
        const MULTILINGUAL_BANKS: Record<string, Array<[string, string, string, string, string, string, string]>> = {
          japanese: [
            ['桜 (さくら)', '名詞', 'Sakura', 'साकुरा', 'Cherry blossom; iconic spring flower of Japan.', 'चेरी का फूल; वसंत का सुंदर प्रतीक फूल।', '満開の桜の木の下で家族とお花見を楽しみました。'],
            ['希望 (きぼう)', '名詞', 'Kibou', 'किबोउ', 'Hope, wish, bright expectation for the future.', 'आशा, उम्मीद, भविष्य की कामना।', 'どんな困難な状況でも未来への希望を捨ててはいけません。'],
            ['平和 (へいわ)', '名詞', 'Heiwa', 'हेइवा', 'Peace, harmony, freedom from conflict.', 'शांति, अमन, सद्भाव।', '世界中の人々が平和で幸せな生活を望んでいます。'],
            ['情熱 (じょうねつ)', '名詞', 'Jounetsu', 'जौनेत्सु', 'Passion, intense enthusiasm, fervor.', 'जोश, जुनून, तीव्र भावना।', '彼女は音楽に対して並々ならぬ情熱を傾けています。'],
            ['絆 (きずな)', '名詞', 'Kizuna', 'किज़ुना', 'Emotional bond, ties of affection or unity.', 'बंधन, आत्मीयता, अटूट रिश्ता।', '災害を通じて地域の人々の絆がより一層深まりました。'],
            ['感謝 (かんしゃ)', '名詞', 'Kansha', 'कान्शा', 'Gratitude, thanks, deep appreciation.', 'कृतज्ञता, आभार, धन्यवाद।', 'これまで支えてくれた両親に心からの感謝を伝えます。'],
            ['挑戦 (ちょうせん)', '名詞/動詞', 'Chousen', 'चोउसेन', 'Challenge, daring attempt at a goal.', 'चुनौती, प्रयास, नया कदम।', '新しいビジネス分野への挑戦が彼の成長を促しました。'],
            ['誇り (ほこり)', '名詞', 'Hokori', 'होकोरी', 'Pride, self-respect, honor.', 'गर्व, स्वाभिमान, प्रतिष्ठा。', '日本の伝統文化を世界に発信することに誇りを感じます。'],
            ['誠実 (せいじつ)', '形容動詞', 'Seijitsu', 'सेईजित्सु', 'Sincerity, honesty, faithfulness.', 'सच्चाई, ईमानदारी, निष्ठा।', '彼の誠実な対応は多くの顧客から高い信頼を得ています。'],
            ['未来 (みらい)', '名詞', 'Mirai', 'मिराई', 'Future, time yet to come.', 'भविष्य, आने वाला समय।', '持続可能な未来を創るために環境保護に努めます。'],
            ['勇気 (ゆうき)', '名詞', 'Yuuki', 'यूउकी', 'Courage, bravery, fearless spirit.', 'साहस, हिम्मत, निडरता।', '自分の意見をはっきりと伝えるには少しの勇気が必要です。'],
            ['知恵 (ちえ)', '名詞', 'Chie', 'चिए', 'Wisdom, intelligence, sound judgment.', 'बुद्धिमत्ता, ज्ञान, समझ।', '先人たちの知恵を学び、現代の課題解決に活かします。'],
            ['伝統 (でんとう)', '名詞', 'Dentou', 'देन्तोउ', 'Tradition, long-standing heritage.', 'परंपरा, विरासत, संस्कृति।', '京都には数百年の歴史を持つ伝統工芸が多く残っています。'],
            ['調和 (ちょうわ)', '名詞', 'Chouwa', 'चおウわ', 'Harmony, balance, lack of conflict.', 'सामंजस्य, संतुलन, तालमेल।', '自然と人間社会の美しい調和を目指す必要があります。'],
            ['努力 (どりょく)', '名詞/動詞', 'Doryoku', 'दोर्योकु', 'Effort, hard work, persistence.', 'प्रयास, कठिन परिश्रम, मेहनत।', '毎日の積み重ねと努力が大きな成果に結びつきました。'],
            ['微笑み (ほほえみ)', '名詞', 'Hohoemi', 'होहोएमी', 'Gentle smile, warm expression.', 'मुस्कान, मंद हंसी।', '彼女の温かい微笑みは周囲の人々を和ませます。'],
            ['旅人 (たびびと)', '名詞', 'Tabibito', 'ताबीबीतो', 'Traveler, wayfarer.', 'यात्री, मुसाफ़िर।', '旅人は見知らぬ街の風景に心を奪われました。'],
            ['輝き (かがやき)', '名詞', 'Kagayaki', 'कागायाकी', 'Radiance, brilliant sparkle.', 'चमक, दमक, रोशनी।', '夜空に浮かぶ満月の輝きが夜道を照らしています。'],
            ['出逢い (であい)', '名詞', 'Deai', 'देआई', 'Encounter, meaningful meeting.', 'मुलाकात, मिलन, संगम।', '旅先での素晴らしい出逢いが私の人生観を変えました。'],
            ['景色 (けしき)', '名詞', 'Keshiki', 'केशिकी', 'Scenery, landscape view.', 'दृश्य, नजारा, परिदृश्य।', '山頂から見下ろす紅葉の景色は絶景でした。'],
            ['創造 (そうぞう)', '名詞/動詞', 'Souzou', 'सोउज़ोउ', 'Creation, inventive thought.', 'सृजन, रचना, निर्माण।', '最新技術を活用して画期的なサービスを創造します。'],
            ['成長 (せいちょう)', '名詞/動詞', 'Seichou', 'सेइचोउ', 'Growth, personal development.', 'विकास, प्रगति, वृद्धि।', '失敗を糧にすることで人間として大きく成長できます。'],
            ['自由 (じゆう)', '名詞', 'Jiyuu', 'जियूउ', 'Freedom, liberty, autonomy.', 'स्वतंत्रता, आजादी।', '表現の自由を守ることは民主主義の根幹です。'],
            ['閃き (ひらめき)', '名詞', 'Hirameki', 'हिरामेकी', 'Inspiration, sudden flash of genius.', 'प्रेरणा, सुझबुझ।', '散歩中に素晴らしいデザインの閃きがありました。'],
            ['夢 (ゆめ)', '名詞', 'Yume', 'युमे', 'Dream, vision, aspiration.', 'सपना, आकांक्षा, ध्येय।', '世界中を旅するという幼い頃からの夢を叶えました。'],
            ['真実 (しんじつ)', '名詞', 'Shinjitsu', 'शिंजित्सु', 'Truth, reality, authenticity.', 'सत्य, हकीकत, यथार्थ।', 'どんなに辛くても真実を受け止める強さが必要です。'],
            ['静寂 (せいじゃく)', '名詞', 'Seijaku', 'सेइजाकु', 'Silence, profound stillness.', 'शांतता, सन्नाटा, शांति।', '早朝の神社は深い静寂に包まれていました。'],
            ['温もり (ぬくもり)', '名詞', 'Nukumori', 'नुकुमोरी', 'Warmth, gentle affection.', 'गर्मी, आत्मीयता, संस्पर्श।', '手編みのマフラーから母の温もりが伝わってきます。'],
            ['理想 (りそう)', '名詞', 'Risou', 'रिसोउ', 'Ideal, noble vision.', 'आदर्श, श्रेष्ठ लक्ष्य।', '高い理想を掲げてチーム一丸となって前進します。'],
            ['奇跡 (きせき)', '名詞', 'Kiseki', 'किसेकी', 'Miracle, extraordinary event.', 'चमत्कार, अजूबा।', '厳しい状況からの逆転勝利はまさに奇跡でした。']
          ],
          spanish: [
            ['Esperanza', 'sustantivo', 'Es-pe-ran-za', 'एस्पेरांज़ा', 'Hope, desire for a positive outcome.', 'आशा, उम्मीद, भरोसा।', 'Nunca debemos perder la esperanza en los momentos más difíciles.'],
            ['Sabiduría', 'sustantivo', 'Sa-bi-du-rí-a', 'साबिक़ूरिया', 'Wisdom, deep knowledge and experience.', 'बुद्धिमत्ता, ज्ञान, तजुर्बा।', 'El anciano compartió su sabiduría con los jóvenes de la aldea.'],
            ['Valiente', 'adjetivo', 'Va-lien-te', 'बालिएन्ते', 'Brave, courageous, daring.', 'साहसी, बहादुर, निडर।', 'El bombero realizó un acto muy valiente para salvar a la familia.'],
            ['Libertad', 'sustantivo', 'Li-ber-tad', 'लिबेरताद', 'Freedom, liberty, independence.', 'स्वतंत्रता, आज़ादी, मुक्ति।', 'La libertad de expresión es un pilar fundamental de la democracia.'],
            ['Gratitud', 'sustantivo', 'Gra-ti-tud', 'ग्रातीतुद', 'Gratitude, thankfulness, appreciation.', 'कृतज्ञता, आभार, शुक्रिया।', 'Siento una profunda gratitud por todo el apoyo que me has brindado.'],
            ['Inspiración', 'sustantivo', 'Ins-pi-ra-ción', 'इन्सपिरासियोन', 'Inspiration, sudden lucidity.', 'प्रेरणा, रचनात्मक विचार।', 'La belleza de la naturaleza fue su principal fuente de inspiración.'],
            ['Paciencia', 'sustantivo', 'Pa-cien-cia', 'पासिएन्सिया', 'Patience, endurance under hardship.', 'धैर्य, सब्र, सहनशीलता।', 'La paciencia y la constancia son claves para alcanzar cualquier meta.'],
            ['Entusiasmo', 'sustantivo', 'En-tu-sias-mo', 'एन्तुसियास्मो', 'Enthusiasm, vibrant passion.', 'उत्साह, उमंग, जोश।', 'Inició su nuevo proyecto empresarial con un enorme entusiasmo.'],
            ['Resiliencia', 'sustantivo', 'Re-si-lien-cia', 'रेसिलिएन्सिया', 'Resilience, inner strength.', 'लचीलापन, जुझारूपन।', 'Su resiliencia le permitió salir adelante tras superar grandes dificultades.'],
            ['Armonía', 'sustantivo', 'Ar-mo-ní-a', 'आरमोनिया', 'Harmony, peaceful balance.', 'सामंजस्य, तालमेल, शांति।', 'En la reunión reinaba un ambiente de perfecta armonía y colaboración.'],
            ['Coraje', 'sustantivo', 'Co-ra-je', 'कोराहे', 'Courage, bravery of spirit.', 'साहस, हिम्मत, दिलेरी।', 'Demostró un gran coraje al defender sus principios frente a todos.'],
            ['Sinceridad', 'sustantivo', 'Sin-ce-ri-dad', 'सिन्सेरिदाद', 'Sincerity, honesty.', 'सच्चाई, ईमानदारी।', 'Aprecio mucho la sinceridad con la que siempre me hablas.'],
            ['Generosidad', 'sustantivo', 'Ge-ne-ro-si-dad', 'हेनेरोसिदाद', 'Generosity, nobility of heart.', 'उदारता, दरियादिली।', 'Su generosidad hacia los más necesitados es ejemplar.'],
            ['Tranquilidad', 'sustantivo', 'Tran-qui-li-dad', 'त्राँकिलिदाद', 'Tranquility, quiet peace.', 'शांति, सुकून, धीरज।', 'Pasear por el bosque me transmite una gran tranquilidad.'],
            ['Perseverancia', 'sustantivo', 'Per-se-ve-ran-cia', 'पेरसेबेराँसिया', 'Perseverance, persistence.', 'दृढ़ता, निरंतर प्रयास।', 'Gracias a su perseverancia logró culminar sus estudios con honores.'],
            ['Creatividad', 'sustantivo', 'Crea-ti-vi-dad', 'क्लेआतिबिदाद', 'Creativity, original thought.', 'रचनात्मकता, सृजनशीलता।', 'La creatividad es fundamental en el diseño de soluciones innovadoras.'],
            ['Honestidad', 'sustantivo', 'Ho-nes-ti-dad', 'ओनेस्तिदाद', 'Honesty, integrity.', 'सत्यनिष्ठा, ईमानदारी।', 'La honestidad es el pilar indispensable de cualquier relación humana.'],
            ['Optimismo', 'sustantivo', 'Op-ti-mis-mo', 'ओप्तिमिस्मो', 'Optimism, positive outlook.', 'आशावाद, सकारात्मक सोच।', 'Afronta cada nuevo reto con un contagioso optimismo.'],
            ['Comprensión', 'sustantivo', 'Com-pren-sión', 'कोम्प्रेन्सियोन', 'Understanding, empathy.', 'समझ, सहानुभूति।', 'Mostró una profunda comprensión hacia los problemas de sus compañeros.'],
            ['Valentía', 'sustantivo', 'Va-len-tí-a', 'बालेन्तिया', 'Valor, boldness.', 'वीरता, पराक्रम।', 'Se requiere mucha valentía para admitir los propios errores.'],
            ['Amistad', 'sustantivo', 'A-mis-tad', 'अमिस्ताद', 'Friendship, close bond.', 'मित्रता, दोस्ती, आत्मीयता।', 'Nuestra amistad se ha fortalecido con el paso de los años.'],
            ['Destino', 'sustantivo', 'Des-ti-no', 'देस्तिनो', 'Destiny, path of life.', 'भाग्य, नियति, मंज़िल।', 'Somos los arquitectos de nuestro propio destino.'],
            ['Ilusión', 'sustantivo', 'I-lu-sión', 'इलुसियोन', 'Enthusiastic hope, joy.', 'उम्मीद, खुशी, उत्साह।', 'Emprende este viaje con la ilusión de descubrir nuevas culturas.'],
            ['Humildad', 'sustantivo', 'Hu-mil-dad', 'उमिल्दाद', 'Humility, modesty.', 'विनम्रता, सादगी।', 'A pesar de sus grandes logros, conserva una destacada humildad.'],
            ['Lealtad', 'sustantivo', 'Leal-tad', 'लेअल्ताद', 'Loyalty, faithfulness.', 'वफ़ादारी, निष्ठा।', 'La lealtad de sus amigos fue su mayor apoyo durante la crisis.'],
            ['Respeto', 'sustantivo', 'Res-pe-to', 'रेस्पेतो', 'Respect, due regard.', 'सम्मान, आदर।', 'El respeto mutuo es esencial para el buen entendimiento social.'],
            ['Solidaridad', 'sustantivo', 'So-li-da-ri-dad', 'सोलिदारिदाद', 'Solidarity, mutual support.', 'एकता, परस्पर सहायता।', 'La respuesta solidaria del pueblo ante la emergencia fue inmediata.'],
            ['Ternura', 'sustantivo', 'Ter-nu-ra', 'तेरनुरा', 'Tenderness, affection.', 'कोमलता, स्नेह, ममता।', 'El abrazo del abuelo estaba lleno de ternura y cariño.'],
            ['Dignidad', 'sustantivo', 'Dig-ni-dad', 'दिग्निदाद', 'Dignity, self-respect.', 'प्रतिष्ठा, गरिमा, स्वाभिमान।', 'Defendió su posición con serenidad y dignidad.'],
            ['Serenidad', 'sustantivo', 'Se-re-ni-dad', 'सेरेनिदाद', 'Serenity, mental calm.', 'स्थिरता, चित्त की शांति।', 'Mantuvo la serenidad en medio de la tormenta.']
          ],
          french: [
            ['Sagesse', 'nom', 'Sa-gess', 'साझ़ेस', 'Wisdom, sound judgment.', 'बुद्धिमत्ता, समझदारी, ज्ञान।', 'Les conseils du vieux maître débordaient de sagesse.'],
            ['Bienveillance', 'nom', 'Bien-veill-ance', 'बियाँवेयाँस', 'Benevolence, kindness.', 'दयालुता, सद्भावना, आत्मीयता।', 'Elle accueille les nouveaux venus avec une grande bienveillance.'],
            ['Sérénité', 'nom', 'Sé-ré-ni-té', 'सेरेनिते', 'Serenity, peaceful calm.', 'शांतता, मानसिक शांति, स्थिरता।', 'La méditation quotidienne lui apporte une profonde sérénité.'],
            ['Persévérance', 'nom', 'Per-sé-vé-rance', 'पेरसेवेराँस', 'Perseverance, tenacity.', 'दृढ़ता, निरंतर प्रयास, लगन।', 'C\'est grâce à sa persévérance qu\'il a réussi cet examen difficile.'],
            ['Créativité', 'nom', 'Cré-a-ti-vi-té', 'कूरियातिविते', 'Creativity, inventive spirit.', 'रचनात्मकता, सृजनशीलता।', 'Ce projet artistique témoigne d\'une remarquable créativité.'],
            ['Émerveillement', 'nom', 'É-mer-veill-e-ment', 'एमेरवेयमाँ', 'Wonderment, awe.', 'आश्चर्य, विस्मय, आश्चर्यचकित होना।', 'Les yeux de l\'enfant brillaient d\'émerveillement devant le spectacle.'],
            ['Épanouissement', 'nom', 'É-pa-nouss-e-ment', 'एपानुईसमाँ', 'Fulfillment, blossoming.', 'आत्मसंतुष्टि, विकास, निखार।', 'Elle a trouvé un épanouissement complet dans son travail passionnant.'],
            ['Bien-être', 'nom', 'Bien-être', 'बियाँ-एत्र', 'Wellbeing, comfort.', 'कल्याण, तंदुरुस्ती, सुख।', 'Prendre soin de son corps contribue au bien-être de l\'esprit.'],
            ['Authenticité', 'nom', 'Au-then-ti-ci-té', 'ओताँतिसिते', 'Authenticity, genuineness.', 'सच्चाई, प्रामाणिकता।', 'L\'authenticité de sa démarche a séduit tout le public.'],
            ['Ténacité', 'nom', 'Té-na-ci-té', 'तेनासिते', 'Tenacity, stubborn persistence.', 'दृढ़ संकल्प, अडिगता।', 'Sa ténacité lui a permis de surmonter tous les obstacles.'],
            ['Espoir', 'nom', 'Es-poir', 'एस्पवार', 'Hope, positive belief.', 'उम्मीद, आशा, विश्वास।', 'Gardons l\'espoir d\'un avenir meilleur pour les générations futures.'],
            ['Liberté', 'nom', 'Li-ber-té', 'लिबेर्ते', 'Freedom, independence.', 'स्वतंत्रता, आज़ादी।', 'La liberté est une valeur inestimable protégée par les lois.'],
            ['Gratitude', 'nom', 'Gra-ti-tude', 'ग्रातीतूद', 'Gratitude, appreciation.', 'कृतज्ञता, शुक्रिया, आभार।', 'Il a exprimé sa vive gratitude envers toute son équipe.'],
            ['Courage', 'nom', 'Cou-rage', 'कुराज', 'Courage, bravery.', 'साहस, हिम्मत, वीरता।', 'Elle a affronté cette épreuve difficile avec un immense courage.'],
            ['Harmonie', 'nom', 'Har-mo-nie', 'आरमोनी', 'Harmony, concord.', 'सामंजस्य, संतुलन, लय।', 'Les couleurs du tableau créent une harmonie parfaite.'],
            ['Sincérité', 'nom', 'Sin-cé-ri-té', 'साँगसेरिते', 'Sincerity, truthfulness.', 'सच्चाई, निष्कपटता।', 'Sa sincérité ne fait aucun doute aux yeux de ses amis.'],
            ['Compassion', 'nom', 'Com-pas-sion', 'कोँपास्यों', 'Compassion, deep empathy.', 'करुणा, संवेदना, दया।', 'Elle a fait preuve d\'une grande compassion envers les sinistrés.'],
            ['Enthousiasme', 'nom', 'En-thou-siasme', 'आँतूज़्यास्म', 'Enthusiasm, passion.', 'उत्साह, जोश, उमंग।', 'L\'équipe a abordé le nouveau projet avec un enthousiasme débordant.'],
            ['Inspiration', 'nom', 'Ins-pi-ra-tion', 'अँस्पीरास्यों', 'Inspiration, creative impulse.', 'प्रेरणा, स्फूर्ति।', 'Le poète a pu trouver son inspiration dans la beauté du paysage.'],
            ['Générosité', 'nom', 'Gé-né-ro-si-té', 'जेनेरोसिते', 'Generosity, openhandedness.', 'उदारता, दानशीलता।', 'La générosité des donateurs a permis d\'aider des milliers de familles.'],
            ['Douceur', 'nom', 'Dou-ceur', 'दूसॉर', 'Sweetness, gentleness.', 'कोमलता, मिठास, नम्रता।', 'La douceur du printemps rend les journées particulièrement agréables.'],
            ['Clarté', 'nom', 'Clar-té', 'क्लार्ते', 'Clarity, lucidity.', 'स्पष्टता, स्वच्छता।', 'La clarté de son explication a permis à tous de comprendre.'],
            ['Fidélité', 'nom', 'Fi-dé-li-té', 'फिदेलिते', 'Fidelity, faithfulness.', 'निष्ठा, वफ़ादारी।', 'Sa fidélité envers ses idéaux est exemplaire.'],
            ['Luminosité', 'nom', 'Lu-mi-no-si-té', 'ल्यूमिनोज़िते', 'Luminosity, brightness.', 'रोशनी, चमक, दमक।', 'La grande verrière apporte une belle luminosité à la pièce.'],
            ['Équilibre', 'nom', 'É-qui-libre', 'एकीलीब्र', 'Balance, equilibrium.', 'संतुलन, साम्य।', 'Trouver un bon équilibre entre vie pro et perso est essentiel.'],
            ['Joie', 'nom', 'Joie', 'झ्वा', 'Joy, delight.', 'आनंद, हर्ष, खुशी।', 'Leurs rires résonnaient de joie dans toute la maison.'],
            ['Tendresse', 'nom', 'Ten-dresse', 'तॉँड्रेस', 'Tenderness, affection.', 'स्नेह, ममता, प्यार।', 'Elle l\'a regardé avec une tendresse infinie.'],
            ['Confiance', 'nom', 'Con-fiance', 'कोँफियाँस', 'Trust, confidence.', 'विश्वास, भरोसा, आत्मबल।', 'La confiance est le ciment de toute amitié solide.'],
            ['Noblesse', 'nom', 'No-blesse', 'नोब्लेस', 'Nobility, dignity.', 'श्रेष्ठता, बड़प्पन, गरिमा।', 'La noblesse de son cœur se traduit dans tous ses actes.'],
            ['Sublimité', 'nom', 'Su-bli-mi-té', 'सूब्लीमिते', 'Sublimity, grandeur.', 'भव्यता, श्रेष्ठता, अलौकिकता।', 'La sublimité des montagnes enneigées coupait le souffle.']
          ],
          german: [
            ['Geborgenheit', 'Nomen', 'Ge-bor-gen-heit', 'गेबोर्गेनहाइट', 'Sense of security, coziness.', 'सुरक्षा, आत्मीयता और सुकून।', 'Bei ihren Großeltern empfand sie stets eine tief empfundene Geborgenheit.'],
            ['Sehnsucht', 'Nomen', 'Sehn-sucht', 'ज़ेनज़ुख्त', 'Yearning, intense longing.', 'तीव्र लालसा, तड़प, इच्छा।', 'Er hatte eine große Sehnsucht nach den Bergen seiner Heimat.'],
            ['Erkenntnis', 'Nomen', 'Er-kennt-nis', 'एरकेन्तनिस', 'Insight, deep realization.', 'आत्मबोध, ज्ञान, समझ।', 'Diese neue wissenschaftliche Erkenntnis revolutioniert die Forschung.'],
            ['Fernweh', 'Nomen', 'Fern-weh', 'फेर्नवेह', 'Wanderlust, desire to travel.', 'यात्रा की तीव्र लालसा, देश-विदेश घूमने की चाह।', 'Im Frühling packt viele Menschen das unstillbare Fernweh.'],
            ['Gemütlichkeit', 'Nomen', 'Ge-müt-lich-keit', 'गेम्यूतलिख्काइट', 'Coziness, warm atmosphere.', 'सुखद वातावरण, आराम, सुकून।', 'Der Kaminofen verleiht dem Wohnzimmer eine wunderbare Gemütlichkeit.'],
            ['Gelassenheit', 'Nomen', 'Ge-las-sen-heit', 'गेलासेनहाइट', 'Serenity, composure.', 'शांतता, धीरज, मानसिक संतुलन।', 'Mit stoischer Gelassenheit begegnete er allen Herausforderungen.'],
            ['Dankbarkeit', 'Nomen', 'Dank-bar-keit', 'दाँकबारकाइट', 'Gratitude, thankfulness.', 'कृतज्ञता, आभार, धन्यवाद।', 'Sie empfindet eine tief empfundene Dankbarkeit für die Hilfe.'],
            ['Zuversicht', 'Nomen', 'Zu-ver-sicht', 'त्सूवेर्ज़िख्त', 'Optimism, confident hope.', 'आशावाद, विश्वास, सकारात्मकता।', 'Trotz aller Schicksalsschläge blickt sie mit Zuversicht in die Zukunft.'],
            ['Entschlossenheit', 'Nomen', 'Ent-schlos-sen-heit', 'एन्तश्लोसेनहाइट', 'Determination, resolve.', 'दृढ़ निश्चय, संकल्प।', 'Mit eiserner Entschlossenheit verfolgte er sein gestecktes Ziel.'],
            ['Aufrichtigkeit', 'Nomen', 'Auf-rich-tig-keit', 'औफरिश्तिश्काइट', 'Sincerity, truthfulness.', 'सच्चाई, निष्कपटता, ईमानदारी।', 'Ihre Aufrichtigkeit wird von allen Kollegen sehr geschätzt.'],
            ['Hoffnung', 'Nomen', 'Hoff-nung', 'हॉफनुँग', 'Hope, positive belief.', 'उम्मीद, आशा, विश्वास।', 'Die Hoffnung stirbt bekanntlich zuletzt.'],
            ['Weisheit', 'Nomen', 'Weis-heit', 'वाइसहाइट', 'Wisdom, sound judgment.', 'बुद्धिमत्ता, तत्वज्ञान, ज्ञान।', 'Ein alter Spruch birgt oft erstaunlich viel Weisheit.'],
            ['Freiheit', 'Nomen', 'Frei-heit', 'फ्राइहाइट', 'Freedom, liberty.', 'स्वतंत्रता, आज़ादी।', 'Die Freiheit des Denkens ist ein unschätzbares Gut.'],
            ['Mut', 'Nomen', 'Mut', 'मूत', 'Courage, bravery.', 'साहस, हिम्मत, निडरता।', 'Es erfordert viel Mut, zu seinen eigenen Fehlern zu stehen.'],
            ['Harmonie', 'Nomen', 'Har-mo-nie', 'हारमोनी', 'Harmony, concord.', 'सामंजस्य, तालमेल, शांति।', 'Im Chor fügen sich die Stimmen zu einer perfekten Harmonie.'],
            ['Geduld', 'Nomen', 'Ge-duld', 'गेदुल्द', 'Patience, forbearance.', 'धैर्य, सब्र, सहनशीलता।', 'Geduld ist der Schlüssel zur Überwindung schwieriger Zeiten.'],
            ['Mitgefühl', 'Nomen', 'Mit-ge-fühl', 'मितगेफ्यूल', 'Empathy, compassion.', 'सहानुभूति, करुणा, दया।', 'Sein tiefes Mitgefühl tröstete die Betroffenen in schweren Stunden.'],
            ['Begeisterung', 'Nomen', 'Be-geis-te-rung', 'बेगाइस्तेरुँग', 'Enthusiasm, excitement.', 'उत्साह, जोश, उमंग।', 'Das Publikum nahm den Vortrag mit großer Begeisterung auf.'],
            ['Nächstenliebe', 'Nomen', 'Nächst-en-lie-be', 'नेश्स्तेनलीबे', 'Charity, love for neighbor.', 'परोपकार, दयानिधि, बंधुत्व।', 'Wahre Nächstenliebe zeigt sich im selbstlosen Handeln.'],
            ['Beständigkeit', 'Nomen', 'Be-stän-dig-keit', 'बेश्तेन्दिश्काइट', 'Constancy, endurance.', 'स्थिरता, निरंतरता, टिकाऊपन।', 'In einer Welt des Wandels schätzen viele Menschen Beständigkeit.'],
            ['Barmherzigkeit', 'Nomen', 'Barm-her-zig-keit', 'बार्महेर्त्सिश्काइट', 'Mercy, compassion.', 'दया, करुणा, क्षमाशीलता।', 'Gnade und Barmherzigkeit prägen sein soziales Engagement.'],
            ['Besonnenheit', 'Nomen', 'Be-son-nen-heit', 'बेज़ोनेनहाइट', 'Prudence, levelheadedness.', 'विवेक, गंभीरता, समझदारी।', 'In brenzligen Situationen behielt er stets kühle Besonnenheit.'],
            ['Schöpferkraft', 'Nomen', 'Schöp-fer-kraft', 'श्यॉपफेरक्राफ्त', 'Creativity, inventive power.', 'सृजनशक्ति, रचनात्मकता।', 'Die künstlerische Schöpferkraft des Meisters beeindruckt bis heute.'],
            ['Verlässlichkeit', 'Nomen', 'Ver-läss-lich-keit', 'फेर्लैसलिख्काइट', 'Reliability, trustworthiness.', 'विश्वसनीयता, भरोसा।', 'Verlässlichkeit ist das wichtigste Fundament im Teamwork.'],
            ['Lebensfreude', 'Nomen', 'Le-bens-freu-de', 'लेबेन्सफ्रोयदे', 'Joy of living, vitality.', 'जीने की खुशी, ऊर्जा, उमंग।', 'Ihre mitreißende Lebensfreude steckte alle Anwesenden an.'],
            ['Feingefühl', 'Nomen', 'Fein-ge-fühl', 'फाइनगेफ्यूल', 'Tact, sensitivity.', 'संवेदनशीलता, सूझबूझ।', 'Mit großem diplomaten Feingefühl löste sie den Konflikt.'],
            ['Seelenruhe', 'Nomen', 'See-len-ru-he', 'ज़ेलैनरूहे', 'Peace of mind, tranquility.', 'आत्मशांति, आंतरिक सुकून।', 'Unbeeindruckt von der Hektik bewahrte er seine Seelenruhe.'],
            ['Herzlichkeit', 'Nomen', 'Herz-lich-keit', 'हेर्त्स्लिख्काइट', 'Warmth, cordiality.', 'आत्मीयता, सौहार्द, मिठास।', 'Der Gast wurde mit überwältigender Herzlichkeit empfangen.'],
            ['Hilfsbereitschaft', 'Nomen', 'Hilfs-be-reit-schaft', 'हिलफ्सबेराइटशाफ्त', 'Helpfulness, readiness.', 'मददगार स्वभाव, परोपकार।', 'Ihre unermüdliche Hilfsbereitschaft wird in der Nachbarschaft geschätzt.'],
            ['Eintracht', 'Nomen', 'Ein-tracht', 'आइनत्राख्त', 'Concord, unity.', 'एकता, सद्भाव, मेल-मिलाप।', 'Möge in diesem Hause stets Frieden und Eintracht herrschen.']
          ],
          hindi: [
            ['अहिंसा', 'संज्ञा', 'Ahimsa', 'अहिंसा', 'Non-violence, compassion for all living beings.', 'अहिंसा, किसी को दुख न पहुँचाना।', 'महात्मा गांधी ने अहिंसा के मार्ग पर चलकर भारत को स्वतंत्रता दिलाई।'],
            ['सत्य', 'संज्ञा', 'Satya', 'सत्य', 'Truthfulness, reality, sincerity.', 'सत्य, सच्चाई, निष्ठा।', 'सत्य की हमेशा विजय होती है।'],
            ['शांति', 'संज्ञा', 'Shanti', 'शांति', 'Peace, calm, tranquility.', 'शांति, सुख-चैन, मानसिक स्थिरता।', 'ध्यान और योग से मन में परम शांति मिलती है।'],
            ['सहानुभूति', 'संज्ञा', 'Sahanubhuti', 'सहानुभूति', 'Empathy, compassion.', 'सहानुभूति, दूसरों के दुख में आत्मीयता।', 'पीड़ित लोगों के प्रति सभी को सहानुभूति रखनी चाहिए।'],
            ['दृढ़ता', 'संज्ञा', 'Dridhta', 'दृढ़ता', 'Perseverance, determination, firmness.', 'दृढ़ता, संकल्प, मजबूती।', 'उसने अपनी दृढ़ता से हर कठिन लक्ष्य हासिल किया।'],
            ['समर्पण', 'संज्ञा', 'Samarpan', 'समर्पण', 'Dedication, devotion, commitment.', 'समर्पण, निष्ठा, त्याग।', 'देश के प्रति सैनिकों का समर्पण अनुकरणीय है।'],
            ['स्वाभिमान', 'संज्ञा', 'Swabhiman', 'स्वाभिमान', 'Self-respect, honor, dignity.', 'स्वाभिमान, आत्म-सम्मान, गौरव।', 'हमें कभी भी अपने स्वाभिमान से समझौता नहीं करना चाहिए।'],
            ['उत्साह', 'संज्ञा', 'Utsah', 'उत्साह', 'Enthusiasm, zeal, excitement.', 'उत्साह, जोश, उमंग।', 'बच्चों ने खेल प्रतियोगिता में बड़े उत्साह से भाग लिया।'],
            ['सद्भावना', 'संज्ञा', 'Sadbhavana', 'सद्भावना', 'Goodwill, harmony, benevolence.', 'सद्भावना, भलाई, आत्मीयता।', 'त्योहार समाज में भाईचारे और सद्भावना का संदेश देते हैं।'],
            ['ज्ञान', 'संज्ञा', 'Gyan', 'ज्ञान', 'Knowledge, wisdom, learning.', 'ज्ञान, विद्या, समझ।', 'सच्चा ज्ञान मनुष्य को विनम्र और विवेकशील बनाता है।'],
            ['मित्रता', 'संज्ञा', 'Mitrata', 'मित्रता', 'Friendship, fellowship.', 'मित्रता, दोस्ती, आत्मीयता।', 'सच्ची मित्रता जीवन की सबसे बड़ी संपत्ति है।'],
            ['धैर्य', 'संज्ञा', 'Dhairya', 'धैर्य', 'Patience, endurance.', 'धैर्य, सब्र, धीरता।', 'विपत्ति के समय धैर्य रखना ही सबसे बड़ा गुण है।'],
            ['रचनात्मकता', 'संज्ञा', 'Rachnatmakta', 'रचनात्मकता', 'Creativity, original thought.', 'रचनात्मकता, सृजनशीलता।', 'उसकी कला में अद्भुत रचनात्मकता दिखाई देती है।'],
            ['ईमानदारी', 'संज्ञा', 'Imandari', 'ईमानदारी', 'Honesty, integrity.', 'ईमानदारी, सत्यनिष्ठा।', 'ईमानदारी सर्वोत्तम नीति मानी जाती है।'],
            ['आशा', 'संज्ञा', 'Asha', 'आशा', 'Hope, expectation.', 'आशा, उम्मीद, भरोसा।', 'जीवन में कभी भी आशा की किरण नहीं छोड़नी चाहिए।'],
            ['करुणा', 'संज्ञा', 'Karuna', 'करुणा', 'Compassion, mercy.', 'करुणा, दया, संवेदना।', 'भगवान बुद्ध ने सभी जीवों पर करुणा करने का उपदेश दिया।'],
            ['प्रेरणा', 'संज्ञा', 'Prerna', 'प्रेरणा', 'Inspiration, motivation.', 'प्रेरणा, स्फूर्ति, सीख।', 'उनके विचार युवाओं के लिए महान प्रेरणा हैं।'],
            ['उदारता', 'संज्ञा', 'Udarata', 'उदारता', 'Generosity, magnanimity.', 'उदारता, दरियादिली।', 'उनकी उदारता से अनेक गरीबों को सहारा मिला।'],
            ['एकता', 'संज्ञा', 'Ekta', 'एकता', 'Unity, solidarity.', 'एकता, मेल-जोल।', 'अनेकताओं में एकता ही भारत की सबसे बड़ी पहचान है।'],
            ['विनम्रता', 'संज्ञा', 'Vinamrata', 'विनम्रता', 'Humility, modesty.', 'विनम्रता, सादगी।', 'सफलता मिलने पर भी मनुष्य को अपनी विनम्रता नहीं खोनी चाहिए।'],
            ['कर्तव्य', 'संज्ञा', 'Kartavya', 'कर्तव्य', 'Duty, obligation.', 'कर्तव्य, दायित्व, फर्ज़।', 'हर नागरिक को अपने कर्तव्यों का निष्ठापूर्वक पालन करना चाहिए।'],
            ['पराक्रम', 'संज्ञा', 'Parakram', 'पराक्रम', 'Valor, heroism.', 'पराक्रम, वीरता, शौर्य।', 'स्वतंत्रता सेनानियों के पराक्रम को देश हमेशा याद रखेगा।'],
            ['अनुशासन', 'संज्ञा', 'Anushasan', 'अनुशासन', 'Discipline, order.', 'अनुशासन, नियमबद्धता।', 'सफलता की राह में अनुशासन सबसे पहली सीढ़ी है।'],
            ['संतोष', 'संज्ञा', 'Santosh', 'संतोष', 'Contentment, satisfaction.', 'संतोष, तृप्ति, शांति।', 'संतोष ही सबसे बड़ा धन माना गया है।'],
            ['प्रतिष्ठा', 'संज्ञा', 'Pratishtha', 'प्रतिष्ठा', 'Prestige, honor.', 'प्रतिष्ठा, मान-सम्मान।', 'उनकी वर्षों की कड़ी मेहनत ने समाज में बड़ी प्रतिष्ठा दिलाई।'],
            ['संकल्प', 'संज्ञा', 'Sankalp', 'संकल्प', 'Pledge, resolution.', 'संकल्प, दृढ़ निश्चय।', 'उसने नववर्ष पर स्वास्थ्य सुधारने का दृढ़ संकल्प लिया।'],
            ['सौहार्द', 'संज्ञा', 'Sauharda', 'सौहार्द', 'Harmonious affection, friendship.', 'सौहार्द, भाईचारा, मिठास।', 'शहर में सभी धर्मों के लोग सौहार्द से रहते हैं।'],
            ['निष्ठा', 'संज्ञा', 'Nishtha', 'निष्ठा', 'Devotion, allegiance.', 'निष्ठा, वफ़ादारी, लगन।', 'उसने अपने कार्य के प्रति अटूट निष्ठा दिखाई।'],
            ['विवेक', 'संज्ञा', 'Vivek', 'विवेक', 'Discernment, wisdom.', 'विवेक, सही-गलत की समझ।', 'कठिन परिस्थितियों में अपने विवेक से काम लेना चाहिए।']
          ]
        };

        const bank = MULTILINGUAL_BANKS[targetLanguage] || MULTILINGUAL_BANKS['japanese'];

        if (newBatchWords.length < wordsNeeded) {
          const remaining = wordsNeeded - newBatchWords.length;
          for (let i = 0; i < remaining; i++) {
            const item = bank[i % bank.length];
            const displayWord = item[0];

            const engPron = item[2] || '';
            const hinPron = item[3] || '';
            const engMeaning = item[4] || '';
            const hinMeaning = item[5] || '';
            const exSentence = item[6] || '';

            const formattedDef = hinMeaning ? `English: ${engMeaning} | हिन्दी: ${hinMeaning}` : engMeaning;
            const formattedSyn = (engPron || hinPron) ? `Pronunciation: ${engPron} / ${hinPron}` : '';

            newBatchWords.push({
              id: crypto.randomUUID(),
              word: displayWord,
              partOfSpeech: item[1],
              definition: formattedDef,
              synonyms: formattedSyn,
              exampleSentence: exSentence,
              groupNumber: groupNum,
              language: targetLanguage
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
          // Re-query database to return complete persisted 30-word batch
          words = await db.select().from(vocabWords)
            .where(and(
              eq(vocabWords.groupNumber, groupNum),
              eq(vocabWords.language, targetLanguage)
            ));
        }
      }
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
