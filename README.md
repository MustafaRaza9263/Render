# The Seven

Vite + Three.js view of the Seven Towers compound.

```
npm install
npm run dev
```

The default scene loads the architect exterior and the road network in `src/data/road_network.json` (render backdrop for the nala and Lyari Expressway; `?backdrop=map` uses the map-true left side). `?procedural=1` builds the original procedural scene.

Day lighting is a Karachi afternoon sun plus a CC0 clear-sky HDRI (see CREDITS.md). `?q=low` drops AO, SMAA and the shadow map for lighter machines; `?q=high` raises them. Camera presets: Aerial (default), Bird's eye (`?view=cam02`), Rear, Top, plus street / courtyard / skybridge. `npm run build && npm run preview`, then `node shoot.mjs`, writes screenshots.
