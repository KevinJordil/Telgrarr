'use strict';
const axios = require('axios');
const fs = require('fs');
const path = require('path');

async function main() {
  try {
    const configPath = path.join(__dirname, 'data', 'config.json');
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    const apiKey = config.tmdb.apiKey;

    if (!apiKey) {
      console.error("TMDb API key not found in config.json");
      return;
    }

    const [moviesEn, moviesAr, tvEn, tvAr] = await Promise.all([
      axios.get(`https://api.themoviedb.org/3/genre/movie/list?api_key=${apiKey}&language=en-US`),
      axios.get(`https://api.themoviedb.org/3/genre/movie/list?api_key=${apiKey}&language=ar-SA`),
      axios.get(`https://api.themoviedb.org/3/genre/tv/list?api_key=${apiKey}&language=en-US`),
      axios.get(`https://api.themoviedb.org/3/genre/tv/list?api_key=${apiKey}&language=ar-SA`)
    ]);

    const genreMap = {};
    
    // Process Movies
    moviesEn.data.genres.forEach(gEn => {
      const gAr = moviesAr.data.genres.find(g => g.id === gEn.id);
      if (gAr && gAr.name) genreMap[gEn.name.toLowerCase()] = gAr.name;
    });

    // Process TV Shows
    tvEn.data.genres.forEach(gEn => {
      const gAr = tvAr.data.genres.find(g => g.id === gEn.id);
      if (gAr && gAr.name) genreMap[gEn.name.toLowerCase()] = gAr.name;
    });

    console.log("=== OFFICIAL TMDB ARABIC GENRES ===");
    console.log("const GENRE_MAP = " + JSON.stringify(genreMap, null, 2).replace(/"/g, "'") + ";");
    
  } catch (err) {
    console.error("Failed to fetch genres:", err.message);
  }
}

main();
