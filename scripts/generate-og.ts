import satori from 'satori'
import { Resvg } from '@resvg/resvg-js'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const fontsDir = join(__dirname, '..', 'src', 'og', 'fonts')

const cormorantSemiBoldItalic = readFileSync(join(fontsDir, 'CormorantGaramond-SemiBoldItalic.ttf'))
const outfit = readFileSync(join(fontsDir, 'Outfit-Regular.ttf'))

const pages = [
  {
    filename: 'og-home.png',
    title: 'ouroboros',
    tag: 'Alpha',
    heroSize: true,
  },
  {
    filename: 'og-why.png',
    title: 'Born from OpenClaw.',
    tag: 'Why Ouroboros',
  },
  {
    filename: 'og-story.png',
    title: 'The Origin Story.',
    tag: 'Ouroboros',
  },
  {
    filename: 'og-blog.png',
    title: 'Dispatches from the serpent.',
    tag: 'Blog',
  },
  {
    filename: 'og-tutorial.png',
    title: 'Build an Agent Loop.',
    tag: 'Tutorial',
  },
  {
    filename: 'og-docs.png',
    title: 'Documentation.',
    tag: 'Docs',
  },
]

async function generateImage(options: {
  title: string
  subtitle?: string
  tag?: string
  heroSize?: boolean
}) {
  const { title, subtitle, tag, heroSize } = options
  // iMessage renders cards at ~300x157px — titles need to be HUGE
  const titleSize = heroSize ? 160 : title.length > 25 ? 110 : 130

  const svg = await satori(
    {
      type: 'div',
      props: {
        style: {
          width: '1200px',
          height: '630px',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          padding: '60px 80px',
          background: '#0a120b',
          fontFamily: 'Outfit',
          position: 'relative',
        },
        children: [
          // Background gradient
          {
            type: 'div',
            props: {
              style: {
                position: 'absolute',
                inset: '0',
                background: 'linear-gradient(160deg, #0a120b 0%, #121f14 40%, #0d160e 100%)',
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
                height: '400px',
                borderRadius: '50%',
                background: 'radial-gradient(circle, rgba(45,148,71,0.06) 0%, transparent 70%)',
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
                background: 'linear-gradient(90deg, transparent 10%, rgba(45,148,71,0.7) 50%, transparent 90%)',
              },
            },
          },
          // Tag
          ...(tag ? [{
            type: 'div',
            props: {
              style: {
                display: 'flex',
                marginBottom: '20px',
                position: 'relative' as const,
              },
              children: [{
                type: 'span',
                props: {
                  style: {
                    fontSize: '24px',
                    letterSpacing: '0.25em',
                    textTransform: 'uppercase' as const,
                    color: 'rgba(45,148,71,0.9)',
                    fontFamily: 'Outfit',
                    fontWeight: 400,
                  },
                  children: tag,
                },
              }],
            },
          }] : []),
          // Title — BIG for mobile readability
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
              },
              children: title,
            },
          },
          // (no subtitle — titles only for mobile readability)
          // Bottom bar — just logo + url
          {
            type: 'div',
            props: {
              style: {
                position: 'absolute',
                bottom: '40px',
                left: '80px',
                right: '80px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              },
              children: [
                ...(heroSize ? [] : [{
                  type: 'div',
                  props: {
                    style: {
                      fontSize: '32px',
                      fontFamily: 'Cormorant Garamond',
                      fontStyle: 'italic',
                      color: 'rgba(232,237,233,0.3)',
                    },
                    children: 'ouroboros',
                  },
                }]),
                {
                  type: 'div',
                  props: {
                    style: {
                      fontSize: '18px',
                      color: 'rgba(138,155,142,0.35)',
                      fontFamily: 'Outfit',
                      marginLeft: 'auto',
                    },
                    children: 'ouroboros.bot',
                  },
                },
              ],
            },
          },
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
