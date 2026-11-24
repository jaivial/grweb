# Brand fonts (BIZ-157)

Licensed font files are pending. Place them here with these exact names:

- `ITCAvantGardeGothicPro-Book.woff2` (weight 400)
- `ITCAvantGardeGothicPro-Bold.woff2` (weight 700)
- `MonsterBites.woff2`

`@font-face` rules live in `projects/public/src/styles.css`. Tailwind classes: `font-avant`
(«POWERED BY», clean headlines) and `font-monster` (impact headlines). Without files, the
fallbacks Inter / Contrail One render.
