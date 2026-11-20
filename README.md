# The Seven

Vite + Three.js view of the Seven Towers compound.

```
npm install
npm run dev
```

The default scene loads the architect exterior (`public/models/seven/`) and the site roads, gate apron and masjid from `src/data/site.json`. `?procedural=1` builds the original procedural towers and the old road network instead.

Camera presets: Aerial (default), Bird's eye (`?view=cam02`, the CAM02 angle), Rear, Top, plus the closer street / courtyard / skybridge views. `npm run build && npm run preview`, then `node shoot.mjs`, writes screenshots.
