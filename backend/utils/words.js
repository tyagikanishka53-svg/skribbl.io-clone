// Extensive categorized dictionary for skribbl.io
const CATEGORIES = {
  animals: [
    "dog", "cat", "elephant", "giraffe", "lion", "tiger", "monkey", "penguin", 
    "dolphin", "whale", "kangaroo", "panda", "rabbit", "zebra", "turtle", 
    "frog", "snake", "eagle", "parrot", "shark", "octopus", "bear", "wolf", 
    "fox", "squirrel", "duck", "owl", "crocodile", "flamingo", "hedgehog"
  ],
  food: [
    "pizza", "burger", "sushi", "pasta", "taco", "sandwich", "pancake", 
    "ice cream", "chocolate", "banana", "apple", "watermelon", "cookie", 
    "donut", "french fries", "hotdog", "popcorn", "cake", "cheese", "strawberry",
    "egg", "bread", "orange", "grape", "pineapple", "cupcake", "lollipop"
  ],
  objects: [
    "guitar", "computer", "phone", "pencil", "clock", "umbrella", "chair", 
    "table", "backpack", "shoes", "glasses", "lamp", "book", "camera", 
    "bicycle", "car", "airplane", "boat", "rocket", "scissors", "television", 
    "key", "sword", "shield", "drum", "telescope", "mirror", "candle"
  ],
  actions: [
    "swimming", "running", "dancing", "sleeping", "crying", "laughing", 
    "climbing", "flying", "cooking", "reading", "singing", "jumping", 
    "painting", "fishing", "driving", "eating", "skating", "diving"
  ],
  nature: [
    "tree", "flower", "sun", "moon", "star", "cloud", "rain", "rainbow", 
    "mountain", "volcano", "river", "ocean", "island", "desert", "forest", 
    "lightning", "tornado", "waterfall", "beach", "fire"
  ]
};

const ALL_WORDS = [
  ...new Set([
    ...CATEGORIES.animals,
    ...CATEGORIES.food,
    ...CATEGORIES.objects,
    ...CATEGORIES.actions,
    ...CATEGORIES.nature
  ])
];

function getRandomWords(count = 3, category = 'all', customWords = []) {
  let pool = [];

  if (customWords && customWords.length > 0) {
    // If custom words are provided, combine or prioritize them
    pool = [...customWords];
  }

  if (category && CATEGORIES[category]) {
    pool = [...pool, ...CATEGORIES[category]];
  } else if (!customWords || customWords.length === 0) {
    pool = [...ALL_WORDS];
  }

  if (pool.length === 0) {
    pool = [...ALL_WORDS];
  }

  // Shuffle pool
  const shuffled = [...new Set(pool)].sort(() => 0.5 - Math.random());
  return shuffled.slice(0, Math.min(count, shuffled.length));
}

// Compute Levenshtein distance for close-guess notifications
function levenshteinDistance(a, b) {
  const matrix = [];
  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          Math.min(
            matrix[i][j - 1] + 1,     // insertion
            matrix[i - 1][j] + 1      // deletion
          )
        );
      }
    }
  }
  return matrix[b.length][a.length];
}

// Normalize strings for fair comparison
function normalizeText(text) {
  return (text || '').trim().toLowerCase().replace(/[^a-z0-9 ]/gi, '');
}

function checkGuess(guess, targetWord) {
  const normGuess = normalizeText(guess);
  const normTarget = normalizeText(targetWord);

  if (!normGuess || !normTarget) {
    return { isCorrect: false, isClose: false };
  }

  if (normGuess === normTarget) {
    return { isCorrect: true, isClose: false };
  }

  // Check close guess:
  // e.g. distance is 1 (or 2 for words with length > 6)
  const dist = levenshteinDistance(normGuess, normTarget);
  const threshold = normTarget.length > 6 ? 2 : 1;
  const isClose = dist <= threshold && Math.abs(normGuess.length - normTarget.length) <= 2;

  return { isCorrect: false, isClose };
}

// Generate masked hint representation for clients
// revealedIndices is a Set of indices in targetWord that have been revealed
function formatHint(targetWord, revealedIndices = new Set(), wordMode = 'normal') {
  if (wordMode === 'hidden') {
    return '???';
  }

  const result = [];
  for (let i = 0; i < targetWord.length; i++) {
    const char = targetWord[i];
    if (char === ' ') {
      result.push('  ');
    } else if (char === '-' || char === '\'') {
      result.push(char + ' ');
    } else if (revealedIndices.has(i)) {
      result.push(char.toUpperCase() + ' ');
    } else {
      result.push('_ ');
    }
  }
  return result.join('').trimEnd();
}

module.exports = {
  CATEGORIES,
  ALL_WORDS,
  getRandomWords,
  checkGuess,
  formatHint,
  normalizeText,
  levenshteinDistance
};