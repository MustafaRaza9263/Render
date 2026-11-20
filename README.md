# The Seven

Vite + Three.js view of the Seven Towers compound.

```
npm install
npm run dev
```

The default scene loads the architect exterior and the road network in `src/data/road_network.json` (render backdrop for the nala and Lyari Expressway; `?backdrop=map` uses the map-true left side). `?procedural=1` builds the original procedural scene.

Camera presets: Aerial (default), Bird's eye (`?view=cam02`, the CAM02 angle), Rear, Top, plus the closer street / courtyard / skybridge views. `npm run build && npm run preview`, then `node shoot.mjs`, writes screenshots.
