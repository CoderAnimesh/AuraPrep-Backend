import 'dotenv/config';
import { db } from './client.js';
import * as schema from './schema.js';
import crypto from 'crypto';

async function seed() {
  try {
    console.log('Seeding database...');

    // 1. Clear existing table entries safely
    console.log('Clearing existing data...');
    await db.delete(schema.userVocabProgress);
    await db.delete(schema.vocabWords);
    await db.delete(schema.practiceQuestions);
    await db.delete(schema.studyTasks);
    await db.delete(schema.studyDays);
    await db.delete(schema.studyPlans);

    // 2. Insert Vocab Words
    console.log('Inserting vocabulary words...');
    const allVocabWords: any[] = [];

    // English Words Seed
    const englishWords = [
      ['aberrant', 'adjective', 'deviating from what is normal or expected.', 'deviant, abnormal, anomalous', 'The behavior of the stock market was aberrant, defying all standard projections.', 1, 'english'],
      ['anomaly', 'noun', 'something that deviates from what is standard, normal, or expected.', 'deviation, oddity, exception', 'A cold day in mid-summer is a weather anomaly.', 1, 'english'],
      ['audacious', 'adjective', 'showing a willingness to take surprisingly bold risks.', 'bold, daring, fearless', 'The entrepreneur made an audacious decision to invest all his savings in a new venture.', 1, 'english'],
      ['capricious', 'adjective', 'given to sudden and unaccountable changes of mood or behavior.', 'fickle, volatile, erratic', 'The administration of justice was capricious, depending on the mood of the local ruler.', 1, 'english'],
      ['corroborate', 'verb', 'confirm or give support to (a statement, theory, or finding).', 'confirm, verify, validate', 'The witness was able to corroborate the suspect\'s alibi.', 1, 'english'],
      ['desiccate', 'verb', 'remove the moisture from (something, especially food).', 'dehydrate, dry out, wither', 'The hot desert wind will desiccate any unprotected vegetation in a matter of hours.', 1, 'english'],
      ['equivocal', 'adjective', 'open to more than one interpretation; ambiguous.', 'ambiguous, vague, unclear', 'The politician gave an equivocal answer, avoiding a direct response.', 1, 'english'],
      ['erudite', 'adjective', 'having or showing great knowledge or learning.', 'learned, scholarly, wise', 'The professor delivered an erudite lecture on medieval literature.', 1, 'english'],
      ['fervid', 'adjective', 'intensely enthusiastic or passionate.', 'passionate, intense, ardent', 'A fervid believer in environmentalism, she spent her weekends cleaning the beach.', 1, 'english'],
      ['gullible', 'adjective', 'easily persuaded to believe something; credulous.', 'credulous, naive, trustful', 'Scammers target gullible consumers with false promises of quick wealth.', 1, 'english']
    ];

    for (const w of englishWords) {
      allVocabWords.push({
        id: crypto.randomUUID(),
        word: w[0],
        partOfSpeech: w[1],
        definition: w[2],
        synonyms: w[3],
        exampleSentence: w[4],
        groupNumber: w[5],
        language: w[6]
      });
    }

    // Multilingual Vocab Seed (Japanese, Spanish, French, German, Hindi)
    const SEED_MULTILINGUAL: Record<string, Array<[string, string, string, string, string, string, string]>> = {
      japanese: [
        ['桜 (さくら)', '名詞', 'Sakura', 'साकुरा', 'Cherry blossom; iconic spring flower of Japan.', 'चेरी का फूल; वसंत का सुंदर प्रतीक फूल।', '満開の桜の木の下で家族とお花見を楽しみました。'],
        ['希望 (きぼう)', '名詞', 'Kibou', 'किबोउ', 'Hope, wish, bright expectation for the future.', 'आशा, उम्मीद, भविष्य की कामना।', 'どんな困難な状況でも未来への希望を捨ててはいけません。'],
        ['平和 (へいわ)', '名詞', 'Heiwa', 'हेइवा', 'Peace, harmony, freedom from conflict.', 'शांति, अमन, सद्भाव।', '世界中の人々が平和で幸せな生活を望んでいます。'],
        ['情熱 (じょうねつ)', '名詞', 'Jounetsu', 'जौनेत्सु', 'Passion, intense enthusiasm, fervor.', 'जोश, जुनून, तीव्र भावना।', '彼女は音楽に対して並々ならぬ情熱を傾けています。'],
        ['絆 (きずな)', '名詞', 'Kizuna', 'किज़ुナ', 'Emotional bond, ties of affection or unity.', 'बंधन, आत्मीयता, अटूट रिश्ता।', '災害を通じて地域の人々の絆がより一層深まりました。'],
        ['感謝 (かんしゃ)', '名詞', 'Kansha', 'कान्शा', 'Gratitude, thanks, deep appreciation.', 'कृतज्ञता, आभार, धन्यवाद।', 'これまで支えてくれた両親に心からの感謝を伝えます。'],
        ['挑戦 (ちょうせん)', '名詞/動詞', 'Chousen', 'चोउसेन', 'Challenge, daring attempt at a goal.', 'चुनौती, प्रयास, नया कदम।', '新しいビジネス分野への挑戦が彼の成長を促しました。'],
        ['誇り (ほこり)', '名詞', 'Hokori', 'होकोरी', 'Pride, self-respect, honor.', 'गर्व, स्वाभिमान, प्रतिष्ठा।', '日本の伝統文化を世界に発信することに誇りを感じます。'],
        ['誠実 (せいじつ)', '形容動詞', 'Seijitsu', 'सेईजित्सु', 'Sincerity, honesty, faithfulness.', 'सच्चाई, ईमानदारी, निष्ठा।', '彼の誠実な対応は多くの顧客から高い信頼を得ています。'],
        ['未来 (みらい)', '名詞', 'Mirai', 'मिराई', 'Future, time yet to come.', 'भविष्य, आने वाला समय।', '持続可能な未来を創るために環境保護に努めます。']
      ],
      spanish: [
        ['Esperanza', 'sustantivo', 'Es-pe-ran-za', 'एस्पेरांज़ा', 'Hope, desire for a positive outcome.', 'आशा, उम्मीद, भरोसा।', 'Nunca debemos perder la esperanza en los momentos más difíciles.'],
        ['Sabiduría', 'sustantivo', 'Sa-bi-du-rí-a', 'साबिक़ूरिया', 'Wisdom, deep knowledge and experience.', 'बुद्धिमत्ता, ज्ञान, तजुर्बा।', 'El anciano compartió su sabiduría con los jóvenes de la aldea.'],
        ['Valiente', 'adjetivo', 'Va-lien-te', 'बालिएन्ते', 'Brave, courageous, daring.', 'साहसी, बहादुर, निडर।', 'El bombero realizó un acto muy valiente para salvar a la familia.'],
        ['Libertad', 'sustantivo', 'Li-ber-tad', 'लिबेरताद', 'Freedom, liberty, independence.', 'स्वतंत्रता, आज़ादी, मुक्ति।', 'La libertad de expresión es un pilar fundamental de la democracia.'],
        ['Gratitud', 'sustantivo', 'Gra-ti-tud', 'ग्रातीतुद', 'Gratitude, thankfulness, appreciation.', 'कृतज्ञता, आभार, शुक्रिया।', 'Siento una profunda gratitud por todo el apoyo que me has brindado.']
      ],
      french: [
        ['Sagesse', 'nom', 'Sa-gess', 'साझ़ेस', 'Wisdom, soundness of judgment.', 'बुद्धिमत्ता, समझदारी, ज्ञान।', 'Les conseils du vieux maître débordaient de sagesse.'],
        ['Bienveillance', 'nom', 'Bien-veill-ance', 'बियाँवेयाँस', 'Benevolence, kindness, goodwill.', 'दयालुता, सद्भावना, आत्मीयता।', 'Elle accueille les nouveaux venus avec une grande bienveillance.'],
        ['Sérénité', 'nom', 'Sé-ré-ni-té', 'सेरेनिते', 'Serenity, state of being calm and peaceful.', 'शांतता, मानसिक शांति, स्थिरता।', 'La méditation quotidienne lui apporte une profonde sérénité.']
      ],
      german: [
        ['Geborgenheit', 'Nomen', 'Ge-bor-gen-heit', 'गेबोर्गेनहाइट', 'Sense of security, coziness and warmth.', 'सुरक्षा, आत्मीयता और सुकून।', 'Bei ihren Großeltern empfand sie stets eine tief empfundene Geborgenheit.'],
        ['Sehnsucht', 'Nomen', 'Sehn-sucht', 'ज़ेनज़ुख्त', 'Yearning, intense longing, deep desire.', 'तीव्र लालसा, तड़प, इच्छा।', 'Er hatte eine große Sehnsucht nach den Bergen seiner Heimat.']
      ],
      hindi: [
        ['अहिंसा', 'संज्ञा', 'Ahimsa', 'अहिंसा', 'Non-violence, compassion for all living beings.', 'अहिंसा, किसी को दुख न पहुँचाना।', 'महात्मा गांधी ने अहिंसा के मार्ग पर चलकर भारत को स्वतंत्रता दिलाई।'],
        ['सत्य', 'संज्ञा', 'Satya', 'सत्य', 'Truthfulness, reality, sincerity.', 'सत्य, सच्चाई, निष्ठा।', 'सत्य की हमेशा विजय होती है।'],
        ['शांति', 'संज्ञा', 'Shanti', 'शांति', 'Peace, calm, tranquility.', 'शांति, सुख-चैन, मानसिक स्थिरता।', 'ध्यान और योग से मन में परम शांति मिलती है।']
      ]
    };

    const langFills = ['spanish', 'french', 'german', 'japanese', 'hindi'];
    for (const lang of langFills) {
      const bank = SEED_MULTILINGUAL[lang] || SEED_MULTILINGUAL['japanese'];
      for (let i = 0; i < bank.length; i++) {
        const item = bank[i];
        const engPron = item[2] || '';
        const hinPron = item[3] || '';
        const engMeaning = item[4] || '';
        const hinMeaning = item[5] || '';
        const exSentence = item[6] || '';

        const formattedDef = hinMeaning ? `English: ${engMeaning} | हिन्दी: ${hinMeaning}` : engMeaning;
        const formattedSyn = (engPron || hinPron) ? `Pronunciation: ${engPron} / ${hinPron}` : '';

        allVocabWords.push({
          id: crypto.randomUUID(),
          word: item[0],
          partOfSpeech: item[1],
          definition: formattedDef,
          synonyms: formattedSyn,
          exampleSentence: exSentence,
          groupNumber: 1,
          language: lang
        });
      }
    }

    if (allVocabWords.length > 0) {
      await db.insert(schema.vocabWords).values(allVocabWords).onConflictDoNothing();
    }
    console.log(`Successfully seeded ${allVocabWords.length} vocabulary words.`);

    console.log('Database seeded successfully!');
  } catch (error) {
    console.error('Error seeding database:', error);
    process.exit(1);
  }
}

seed();
