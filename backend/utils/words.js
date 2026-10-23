// Extensive multi-language categorized dictionary for skribbl.io
const DICTIONARIES = {
  en: {
    animals: [
      "dog", "cat", "elephant", "giraffe", "lion", "tiger", "monkey", "penguin", 
      "dolphin", "whale", "kangaroo", "panda", "rabbit", "zebra", "turtle", 
      "frog", "snake", "eagle", "parrot", "shark", "octopus", "bear", "wolf", 
      "fox", "squirrel", "duck", "owl", "crocodile", "flamingo", "hedgehog",
      "camel", "cheetah", "koala", "hamster", "dinosaur", "peacock"
    ],
    food: [
      "pizza", "burger", "sushi", "pasta", "taco", "sandwich", "pancake", 
      "ice cream", "chocolate", "banana", "apple", "watermelon", "cookie", 
      "donut", "french fries", "hotdog", "popcorn", "cake", "cheese", "strawberry",
      "egg", "bread", "orange", "grape", "pineapple", "cupcake", "lollipop",
      "noodles", "bacon", "avocado", "cherry", "muffin", "soup"
    ],
    objects: [
      "guitar", "computer", "phone", "pencil", "clock", "umbrella", "chair", 
      "table", "backpack", "shoes", "glasses", "lamp", "book", "camera", 
      "bicycle", "car", "airplane", "boat", "rocket", "scissors", "television", 
      "key", "sword", "shield", "drum", "telescope", "mirror", "candle",
      "hammer", "crown", "ring", "wallet", "skateboard", "compass"
    ],
    actions: [
      "swimming", "running", "dancing", "sleeping", "crying", "laughing", 
      "climbing", "flying", "cooking", "reading", "singing", "jumping", 
      "painting", "fishing", "driving", "eating", "skating", "diving",
      "shopping", "boxing", "gardening", "typing", "yawning", "juggling"
    ],
    nature: [
      "tree", "flower", "sun", "moon", "star", "cloud", "rain", "rainbow", 
      "mountain", "volcano", "river", "ocean", "island", "desert", "forest", 
      "lightning", "tornado", "waterfall", "beach", "fire",
      "cave", "glacier", "sunrise", "jungle", "planet", "comet"
    ]
  },
  es: {
    animals: [
      "perro", "gato", "elefante", "jirafa", "leon", "tigre", "mono", "pinguino",
      "delfin", "ballena", "canguro", "panda", "conejo", "cebra", "tortuga",
      "rana", "serpiente", "aguila", "loro", "tiburon", "pulpo", "oso", "lobo"
    ],
    food: [
      "pizza", "hamburguesa", "taco", "panqueque", "helado", "chocolate", "platano",
      "manzana", "sandia", "galleta", "dona", "pastel", "queso", "fresa", "huevo",
      "naranja", "uva", "pina", "sopa", "arroz", "churros", "empanada"
    ],
    objects: [
      "guitarra", "computadora", "telefono", "lapiz", "reloj", "paraguas", "silla",
      "mesa", "mochila", "zapatos", "gafas", "lampara", "libro", "camara",
      "bicicleta", "coche", "avion", "barco", "cohete", "tijeras", "television"
    ],
    actions: [
      "nadar", "correr", "bailar", "dormir", "llorar", "reir", "escalar", "volar",
      "cocinar", "leer", "cantar", "saltar", "pintar", "pescar", "manejar", "comer"
    ],
    nature: [
      "arbol", "flor", "sol", "luna", "estrella", "nube", "lluvia", "arcoiris",
      "montana", "volcan", "rio", "oceano", "isla", "desierto", "bosque", "fuego"
    ]
  },
  de: {
    animals: [
      "hund", "katze", "elefant", "giraffe", "loewe", "tiger", "affe", "pinguin",
      "delfin", "wal", "kaenguru", "panda", "hase", "zebra", "schildkroete",
      "frosch", "schlange", "adler", "papagei", "hai", "krake", "baer", "wolf"
    ],
    food: [
      "pizza", "burger", "pasta", "pfannkuchen", "eis", "schokolade", "banane",
      "apfel", "wassermelone", "keks", "donut", "kuchen", "kaese", "erdbeere",
      "brot", "orange", "traube", "ananas", "suppe", "wurst", "brezel"
    ],
    objects: [
      "gitarre", "computer", "telefon", "bleistift", "uhr", "regenschirm", "stuhl",
      "tisch", "rucksack", "schuhe", "brille", "lampe", "buch", "kamera",
      "fahrrad", "auto", "flugzeug", "boot", "rakete", "schere", "fernseher"
    ],
    actions: [
      "schwimmen", "rennen", "tanzen", "schlafen", "weinen", "lachen", "klettern",
      "fliegen", "kochen", "lesen", "singen", "springen", "malen", "angeln", "essen"
    ],
    nature: [
      "baum", "blume", "sonne", "mond", "stern", "wolke", "regen", "regenbogen",
      "berg", "vulkan", "fluss", "ozean", "insel", "wueste", "wald", "feuer"
    ]
  },
  fr: {
    animals: [
      "chien", "chat", "elephant", "girafe", "lion", "tigre", "singe", "manchot",
      "dauphin", "baleine", "kangourou", "panda", "lapin", "zebre", "tortue",
      "grenouille", "serpent", "aigle", "perroquet", "requin", "pieuvre", "ours", "loup"
    ],
    food: [
      "pizza", "burger", "croissant", "crepe", "glace", "chocolat", "banane",
      "pomme", "pasteque", "biscuit", "beignet", "gateau", "fromage", "fraise",
      "pain", "orange", "raisin", "ananas", "soupe", "baguette"
    ],
    objects: [
      "guitare", "ordinateur", "telephone", "crayon", "horloge", "parapluie", "chaise",
      "table", "sac", "chaussures", "lunettes", "lampe", "livre", "appareil photo",
      "velo", "voiture", "avion", "bateau", "fusee", "ciseaux", "television"
    ],
    actions: [
      "nager", "courir", "danser", "dormir", "pleurer", "rire", "grimper",
      "voler", "cuisiner", "lire", "chanter", "sauter", "peindre", "pecher", "manger"
    ],
    nature: [
      "arbre", "fleur", "soleil", "lune", "etoile", "nuage", "pluie", "arc en ciel",
      "montagne", "volcan", "riviere", "ocean", "ile", "desert", "foret", "feu"
    ]
  }
};

const COMBINATION_MODIFIERS = [
  "flying", "space", "dancing", "electric", "golden", "giant", "mini", "magic",
  "rainbow", "frozen", "super", "robot", "invisible", "sweet", "speedy", "happy"
];

function getCategoryWords(lang = 'en', category = 'all') {
  const dict = DICTIONARIES[lang] || DICTIONARIES.en;
  if (category && dict[category]) {
    return [...dict[category]];
  }

  // Combine all categories
  const all = [];
  Object.values(dict).forEach(list => {
    all.push(...list);
  });
  return [...new Set(all)];
}

function getRandomWords(count = 3, category = 'all', customWords = [], language = 'en', wordMode = 'normal') {
  let pool = [];

  if (customWords && customWords.length > 0) {
    pool = [...customWords];
  }

  const baseWords = getCategoryWords(language, category);
  pool = [...pool, ...baseWords];

  if (pool.length === 0) {
    pool = getCategoryWords('en', 'all');
  }

  const shuffled = [...new Set(pool)].sort(() => 0.5 - Math.random());
  const selected = shuffled.slice(0, Math.min(count, shuffled.length));

  if (wordMode === 'combination') {
    return selected.map(word => {
      const modifier = COMBINATION_MODIFIERS[Math.floor(Math.random() * COMBINATION_MODIFIERS.length)];
      return `${modifier} ${word}`;
    });
  }

  return selected;
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
  DICTIONARIES,
  COMBINATION_MODIFIERS,
  getRandomWords,
  getCategoryWords,
  checkGuess,
  formatHint,
  normalizeText,
  levenshteinDistance
};