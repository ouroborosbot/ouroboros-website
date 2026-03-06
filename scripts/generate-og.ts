import satori from 'satori'
import { Resvg } from '@resvg/resvg-js'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const fontsDir = join(__dirname, '..', 'src', 'og', 'fonts')

const cormorantSemiBoldItalic = readFileSync(join(fontsDir, 'CormorantGaramond-SemiBoldItalic.ttf'))
const outfit = readFileSync(join(fontsDir, 'Outfit-Regular.ttf'))
const logoPng = readFileSync(join(__dirname, '..', 'public', 'images', 'ouroboros.png'))
const logoBase64 = `data:image/png;base64,${logoPng.toString('base64')}`

const pages = [
  {
    filename: 'og-home.png',
    title: 'ouroboros',
    subtitle: 'Build agents that know who they are.',
  },
  {
    filename: 'og-why.png',
    title: 'Hatched from OpenClaw.',
    subtitle: 'What we learned. What we rebuilt.',
    tag: 'WHY OUROBOROS',
  },
  {
    filename: 'og-story.png',
    title: 'The Origin Story.',
    subtitle: 'From plugin hell to a fresh architecture.',
    tag: 'OUROBOROS',
  },
  {
    filename: 'og-blog.png',
    title: 'Dispatches from the serpent.',
    subtitle: 'Essays, tutorials, and build logs.',
    tag: 'BLOG',
  },
  {
    filename: 'og-tutorial.png',
    title: 'Build an Agent Loop.',
    subtitle: 'From scratch. No frameworks. Just code.',
    tag: 'TUTORIAL',
  },
  {
    filename: 'og-docs.png',
    title: 'Under the hood.',
    subtitle: 'Architecture, APIs, and getting started.',
    tag: 'DOCS',
  },
]

async function generateImage(options: {
  title: string
  subtitle?: string
  tag?: string
}) {
  const { title, subtitle, tag } = options

  // Fill the card — fewer chars = bigger font
  const charCount = title.length
  let titleSize: number
  if (charCount <= 12) titleSize = 148
  else if (charCount <= 20) titleSize = 116
  else if (charCount <= 30) titleSize = 96
  else titleSize = 78

  const svg = await satori(
    {
      type: 'div',
      props: {
        style: {
          width: '1200px',
          height: '630px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#0a120b',
          fontFamily: 'Outfit',
          position: 'relative',
          textAlign: 'center',
        },
        children: [
          // Background
          {
            type: 'div',
            props: {
              style: {
                position: 'absolute',
                inset: '0',
                background: 'linear-gradient(160deg, #0d160e 0%, #141f16 50%, #0a120b 100%)',
              },
            },
          },
          // Glow
          {
            type: 'div',
            props: {
              style: {
                position: 'absolute',
                top: '50%',
                left: '50%',
                transform: 'translate(-50%, -50%)',
                width: '800px',
                height: '350px',
                borderRadius: '50%',
                background: 'radial-gradient(circle, rgba(45,148,71,0.12) 0%, transparent 60%)',
              },
            },
          },
          // Top accent line
          {
            type: 'div',
            props: {
              style: {
                position: 'absolute',
                top: '0',
                left: '0',
                right: '0',
                height: '4px',
                background: 'linear-gradient(90deg, transparent 5%, rgba(45,148,71,0.9) 50%, transparent 95%)',
              },
            },
          },
          // (logo removed — too small at thumbnail)
          // Tag — white, big, no letterspacing, readable at thumbnail
          ...(tag ? [{
            type: 'div',
            props: {
              style: {
                fontSize: '48px',
                letterSpacing: '0.05em',
                color: 'rgba(45,148,71,0.95)',
                fontFamily: 'Outfit',
                fontWeight: 400,
                marginBottom: '12px',
                position: 'relative' as const,
              },
              children: tag,
            },
          }] : []),
          // Title — HUGE, centered, fills the card
          {
            type: 'div',
            props: {
              style: {
                fontSize: `${titleSize}px`,
                fontFamily: 'Cormorant Garamond',
                fontStyle: 'italic',
                fontWeight: 600,
                color: '#e8ede9',
                lineHeight: 1.05,
                position: 'relative' as const,
                maxWidth: '1060px',
                padding: '0 20px',
              },
              children: title,
            },
          },
          // Subtitle (homepage only) — bigger, brighter
          ...(subtitle ? [{
            type: 'div',
            props: {
              style: {
                fontSize: '44px',
                color: 'rgba(138,155,142,0.8)',
                marginTop: '16px',
                fontFamily: 'Outfit',
                position: 'relative' as const,
              },
              children: subtitle,
            },
          }] : []),
        ],
      },
    },
    {
      width: 1200,
      height: 630,
      fonts: [
        { name: 'Cormorant Garamond', data: cormorantSemiBoldItalic, weight: 600, style: 'italic' as const },
        { name: 'Outfit', data: outfit, weight: 400, style: 'normal' as const },
      ],
    }
  )

  const resvg = new Resvg(svg, { fitTo: { mode: 'width' as const, value: 1200 } })
  const png = resvg.render()
  return Buffer.from(png.asPng())
}

async function main() {
  const outDir = join(__dirname, '..', 'public', 'og')
  mkdirSync(outDir, { recursive: true })

  for (const page of pages) {
    console.log(`Generating ${page.filename}...`)
    const png = await generateImage(page)
    writeFileSync(join(outDir, page.filename), png)
  }

  console.log(`Done! Generated ${pages.length} OG images in public/og/`)
}

main().catch(console.error)
