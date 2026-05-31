'use strict';

const GENRE_MAP = {
  // --- Professional Cinematic Adjectives ---
  'action': 'أكشن', 
  'adventure': 'مغامرة', 
  'animation': 'رسوم متحركة',
  'comedy': 'كوميديا', 
  'crime': 'جريمة', 
  'documentary': 'وثائقي',
  'drama': 'دراما', 
  'family': 'عائلي', 
  'fantasy': 'فانتازيا',
  'history': 'تاريخي', 
  'horror': 'رعب', 
  'music': 'موسيقي',
  'mystery': 'غموض', 
  'romance': 'رومانسي', 
  'science fiction': 'خيال علمي',
  'sci-fi': 'خيال علمي', 
  'tv movie': 'فيلم تلفزيوني', 
  'thriller': 'إثارة',
  'war': 'حربي', 
  'western': 'غرب أمريكي', 
  'biography': 'سيرة ذاتية',
  'sport': 'رياضي', 
  'sports': 'رياضي', 
  'short': 'قصير', 
  'musical': 'غنائي',
  'film-noir': 'فيلم نوار', 
  'suspense': 'تشويق',
  
  // --- TV & Broadcast Specific (Sonarr) ---
  'soap': 'دراما اجتماعية', 
  'talk show': 'برنامج حواري', 
  'talk': 'برنامج حواري',
  'news': 'إخباري', 
  'reality': 'واقعي', 
  'reality-tv': 'واقعي',
  'mini-series': 'مسلسل قصير', 
  'miniseries': 'مسلسل قصير',
  'game show': 'برنامج مسابقات', 
  'kids': 'أطفال', 
  'children': 'أطفال',
  'anime': 'أنمي', 
  'politics': 'سياسي', 
  
  // --- Compound Genres (TMDb / TVDB) ---
  'action & adventure': 'أكشن ومغامرة',
  'sci-fi & fantasy': 'خيال علمي وفانتازيا',
  'war & politics': 'حربي وسياسي'
};

const STATUS_MAP = {
  'ended':      'منتهي',
  'continuing': 'مستمر',
  'upcoming':   'قادم'
};

function translateGenres(genresArray) {
  if (!Array.isArray(genresArray)) return [];
  return genresArray.map(g => {
    if (!g) return g;
    const key = g.toLowerCase().trim();
    return GENRE_MAP[key] || g;
  });
}

function translateStatus(status) {
  if (!status) return null;
  const key = status.toLowerCase().trim();
  return STATUS_MAP[key] || status;
}

module.exports = { translateGenres, translateStatus };
