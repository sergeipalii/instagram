cd /home/sergei/storage/Development/My/sepia.software/instagram
BASE="Using the reference image as the SAME character — keep the identical pearlescent pink-and-lavender baby cuttlefish: same big round dark glossy eyes, same proportions, same soft mantle and fins, tentacles natural and asymmetric with very subtle suckers. New pose/action: %s. The character is turned slightly and looks toward its right (the viewer's lower-left), as if reacting to text placed below-left. Pixar-style soft 3D cartoon, soft studio lighting, subtle glow, full body, centered with generous margin. CRITICAL: completely flat uniform solid chroma-key GREEN background pure #00FF00, edge to edge, no shadow on ground, no scenery, no text, only the props described."
ACT1="cheerfully WAVING hello with one tentacle raised, a warm welcoming smile"
ACT2="looking proud and confident with a small confident smile, one tentacle raised in a thumbs-up-like gesture"
ACT3="curious and amazed, holding up a small glowing star spark at the tip of one tentacle and gazing at it with wonder"
ACT4="puzzled and thinking, one tentacle touching the side of its head, head slightly tilted, a mildly confused expression"
ACT5="in a friendly teacher pose, one tentacle raised pointing upward as if explaining a lesson, an encouraging smile"
ACT6="holding a small cartoon wrench with one tentacle as if fixing something, a focused helpful expression"
ACT7="warmly inviting and beckoning with one tentacle, a big friendly open smile, as if inviting you to chat"
for i in 1 2 3 4 5 6 7; do
  eval A=\$ACT$i
  P=$(printf "$BASE" "$A")
  for v in 1 2 3; do
    npm run gen:image -- --model gemini-3-pro-image --refs ./assets/mascot.png --out ./assets/_poses-green/p$i-v$v.png --prompt "$P (variation $v)" 2>&1 | tail -1
  done
done
echo "ALL DONE"
