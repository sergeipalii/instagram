# Mascot reference images

Drop the mascot reference pictures here (PNG/JPG), e.g. `1.png`, `2.png`, `3.png`.

They are fed to Gemini (Nano Banana) as visual references so the generated
standalone mascot stays consistent with the Instagram avatar.

Used by:

```
npm run gen:image -- --refs ./assets/mascot-ref --prompt "<mascot prompt>" --out ./assets/mascot.png
```
