// Rebuild public/og-image.png, the link-preview card.
//
//   npm run og:image
//
// Needs ImageMagick 7 (`magick`) on PATH and the system Arial faces. Font paths
// are macOS ones; on Linux point BOLD/REG at any grotesque you have.
//
// The card shows all sixteen nations in their four groups, which is the clearest
// way to say "this is the World Cup" in a preview thumbnail, and it doubles as a
// readable summary of the draw.
//
// WHY THE WORDING IS NOT IN THE SVG. Two ImageMagick limits force it:
//
//   1. Its built-in SVG renderer has NO FONT STACK. Any <text> element fails
//      with "unable to read font" and the command ABORTS, leaving the PREVIOUS
//      og-image.png in place. The build looks like it succeeded while the card
//      silently still advertises whatever it said before, which is exactly how
//      this trap hides. Everything textual is drawn with -annotate against
//      explicit font FILES, which always resolve.
//   2. It paints a `fill="url(#gradient)"` reference PURE BLACK, so
//      public/og-image.svg uses flat fills only.
//
// Node built-ins only, like every other script here.

import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync, readFileSync, readdirSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { join, dirname } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const BOLD = '/System/Library/Fonts/Supplemental/Arial Bold.ttf'
const REG = '/System/Library/Fonts/Supplemental/Arial.ttf'

// ESPN's country flags, fetched by ISO slug.
//
// MALI IS FETCHED AS `mli`, NOT FROM ITS TEAM RECORD. ESPN's Mali team
// (id 83469) carries `abbreviation: "KOR"` AND `logo: .../countries/500/kor.png`,
// both of which belong to South Korea — the same bad record that forces the
// abbreviation override in scripts/fetch-tournament.mjs. The correct Mali flag
// does exist at the `mli` slug; only the team record points at the wrong one.
// Taking the URL from the feed would put South Korea's flag on Mali.
const FLAG_BASE = 'https://a.espncdn.com/i/teamlogos/countries/500'

// Groups in the order FIBA's schedule sheet lists them.
const GROUPS = [
  ['A', [['Japan', 'jpn'], ['Spain', 'esp'], ['Germany', 'ger'], ['Mali', 'mli']]],
  ['B', [['Hungary', 'hun'], ['South Korea', 'kor'], ['Nigeria', 'ngr'], ['France', 'fra']]],
  ['C', [['Belgium', 'bel'], ['Australia', 'aus'], ['Puerto Rico', 'pur'], ['Türkiye', 'tur']]],
  ['D', [['United States', 'usa'], ['Czechia', 'cze'], ['Italy', 'ita'], ['China', 'chn']]],
]

// Four columns 270px apart across the 60..1140 span; four rows 72px apart.
// These were MEASURED, not guessed: the title is 743px at 50pt against 940px of
// space, and the longest name ("United States") is 118px at 19pt against the
// 135px each name has beside its flag. The first version of this card overflowed
// its title off the right edge, which a thumbnail hides until someone shares it.
const CX = [195, 465, 735, 1005]
const ROW_Y = [262, 334, 406, 478]
const FLAG = 52

const magick = (args) => execFileSync('magick', args, { encoding: 'utf8' })

async function main() {
  const work = mkdtempSync(join(tmpdir(), 'og-'))
  try {
    // --- flags -------------------------------------------------------------
    const slugs = GROUPS.flatMap(([, teams]) => teams.map(([, slug]) => slug))
    for (const slug of slugs) {
      const res = await fetch(`${FLAG_BASE}/${slug}.png`)
      if (!res.ok) throw new Error(`flag ${slug}: HTTP ${res.status}`)
      writeFileSync(join(work, `${slug}.png`), Buffer.from(await res.arrayBuffer()))
    }

    // Every flag must be distinct. Two slugs returning identical bytes means one
    // of them is the wrong country, which is precisely the Mali/Korea failure.
    const seen = new Map()
    for (const slug of slugs) {
      const hash = createHash('sha1').update(readFileSync(join(work, `${slug}.png`))).digest('hex')
      if (seen.has(hash)) {
        throw new Error(`${slug}.png is byte-identical to ${seen.get(hash)}.png — one is the wrong country`)
      }
      seen.set(hash, slug)
    }

    // --- artwork layer -----------------------------------------------------
    const layer = join(work, 'layer.png')
    magick(['-background', 'none', join(ROOT, 'public/og-image.svg'), '-resize', '1200x630', layer])

    // --- flags, names, wording --------------------------------------------
    const args = [layer]
    GROUPS.forEach(([letter, teams], ci) => {
      const cx = CX[ci]
      teams.forEach(([name, slug], ri) => {
        args.push(
          '(', join(work, `${slug}.png`), '-resize', `${FLAG}x${FLAG}`, ')',
          '-geometry', `+${cx - 120}+${ROW_Y[ri]}`, '-composite',
          '-font', REG, '-pointsize', '19', '-fill', '#e6ebf3',
          '-annotate', `+${cx - 58}+${ROW_Y[ri] + 34}`, name,
        )
      })
      args.push(
        '-font', BOLD, '-pointsize', '22', '-fill', '#7f8aa0',
        '-annotate', `+${cx - 120}+238`, `GROUP ${letter}`,
      )
    })
    args.push(
      '-font', BOLD, '-pointsize', '50', '-fill', '#ffffff',
      '-annotate', '+200+118', 'FIBA Women’s World Cup 2026',
      '-font', REG, '-pointsize', '27', '-fill', '#f28a3c',
      '-annotate', '+202+166', 'Schedule Viewer · Berlin, Germany · 4–13 September 2026',
      '-font', REG, '-pointsize', '24', '-fill', '#aab4c5',
      '-annotate', '+60+606',
      '36 games · group standings · the final-phase bracket · in your timezone',
      join(ROOT, 'public/og-image.png'),
    )
    magick(args)

    // --- verify ------------------------------------------------------------
    // All three of these have caught a silently-broken card in this family.
    const out = magick([
      join(ROOT, 'public/og-image.png'),
      '-format', '%w %h %[pixel:p{600,300}] %[fx:standard_deviation]', 'info:',
    ]).trim()
    const [w, h, ground, sd] = out.split(' ')
    console.log(`og-image.png: ${w}x${h} ground=${ground} stddev=${sd}`)
    if (w !== '1200' || h !== '630') throw new Error(`wrong size ${w}x${h}`)
    if (!ground.includes('18,35,61')) {
      throw new Error(`ground is ${ground}, not #12233d — did a gradient rasterize to black?`)
    }
    if (Number(sd) < 0.02) throw new Error('image is nearly blank')
    console.log('OK')
  } finally {
    rmSync(work, { recursive: true, force: true })
  }
}

main().catch((err) => {
  console.error(err.message)
  process.exit(1)
})
