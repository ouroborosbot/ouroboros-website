import satori from 'satori'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const fontsDir = join(__dirname, '..', 'src', 'og', 'fonts')

const cormorantItalic = readFileSync(join(fontsDir, 'CormorantGaramond-Italic.ttf'))
const cormorantSemiBoldItalic = readFileSync(join(fontsDir, 'CormorantGaramond-SemiBoldItalic.ttf'))
const outfit = readFileSync(join(fontsDir, 'Outfit-Regular.ttf'))

const pages = [
  {
    filename: 'og-home.png',
    title: 'ouroboros',
    subtitle: 'Build agents that know who they are.',
    tag: 'Alpha',
  },
  {
    filename: 'og-why.png',
    title: 'Born from OpenClaw.',
    subtitle: 'I built an agent on OpenClaw. I learned what works, what doesn\'t, and what needs to be redesigned from scratch.',
    tag: 'Why Ouroboros',
  },
  {
    filename: 'og-story.png',
    title: 'Code a model can use, not code that uses a model.',
    subtitle: 'The Ouroboros origin story.',
    tag: 'Origin Story',
  },
  {
    filename: 'og-blog.png',
    title: 'Dispatches from the serpent.',
    subtitle: 'Essays on agent architecture, framework design, and building software that knows itself.',
    tag: 'Blog',
  },
  {
    filename: 'og-tutorial.png',
    title: 'Build an AI Agent Loop From Scratch.',
    subtitle: '~150 lines of TypeScript. Five milestones. Then the handoff.',
    tag: 'Tutorial · 25 min read',
  },
  {
    filename: 'og-docs.png',
    title: 'Documentation',
    subtitle: 'Get started with ouroboros. Hatch your first agent.',
    tag: 'Docs',
  },
]

async function generateSvg(options: { title: string; subtitle?: string; tag?: string }) {
  const { title, subtitle, tag } = options
  const isHeroTitle = title === 'ouroboros'
  const titleSize = isHeroTitle ? 96 : title.length > 40 ? 52 : 64

  return await satori(
    {
      type: 'div',
      props: {
        style: {
          width: '1200px',
          height: '630px',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          padding: '80px',
          background: 'linear-gradient(135deg, #0a120b 0%, #101e13 50%, #0a120b 100%)',
          fontFamily: 'Outfit',
          position: 'relative',
          overflow: 'hidden',
        },
        children: [
          // Subtle glow
          {
            type: 'div',
            props: {
              style: {
                position: 'absolute',
                top: '-100px',
                right: '-100px',
                width: '500px',
                height: '500px',
                borderRadius: '50%',
                background: 'radial-gradient(circle, rgba(45,148,71,0.08) 0%, transparent 70%)',
              },
            },
          },
          // Tag
          ...(tag ? [{
            type: 'div',
            props: {
              style: {
                display: 'flex',
                marginBottom: '24px',
              },
              children: [{
                type: 'span',
                props: {
                  style: {
                    fontSize: '14px',
                    letterSpacing: '0.2em',
                    textTransform: 'uppercase' as const,
                    color: 'rgba(45,148,71,0.8)',
                    fontFamily: 'Outfit',
                  },
                  children: tag,
                },
              }],
            },
          }] : []),
          // Title
          {
            type: 'div',
            props: {
              style: {
                fontSize: `${titleSize}px`,
                fontFamily: 'Cormorant Garamond',
                fontStyle: 'italic',
                fontWeight: 600,
                color: '#e8ede9',
                lineHeight: 1.1,
                maxWidth: '1000px',
              },
              children: title,
            },
          },
          // Subtitle
          ...(subtitle ? [{
            type: 'div',
            props: {
              style: {
                fontSize: '22px',
                color: 'rgba(138,155,142,0.8)',
                marginTop: '20px',
                lineHeight: 1.5,
                maxWidth: '700px',
                fontFamily: 'Outfit',
              },
              children: subtitle,
            },
          }] : []),
          // Bottom bar
          {
            type: 'div',
            props: {
              style: {
                position: 'absolute',
                bottom: '60px',
                left: '80px',
                right: '80px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              },
              children: [
                ...(!isHeroTitle ? [{
                  type: 'div',
                  props: {
                    style: {
                      fontSize: '28px',
                      fontFamily: 'Cormorant Garamond',
                      fontStyle: 'italic',
                      color: 'rgba(232,237,233,0.5)',
                    },
                    children: 'ouroboros',
                  },
                }] : []),
                {
                  type: 'div',
                  props: {
                    style: {
                      fontSize: '14px',
                      color: 'rgba(138,155,142,0.4)',
                      fontFamily: 'Outfit',
                      marginLeft: 'auto',
                    },
                    children: 'ouroboros.bot',
                  },
                },
              ],
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
                height: '3px',
                background: 'linear-gradient(90deg, transparent 0%, rgba(45,148,71,0.6) 50%, transparent 100%)',
              },
            },
          },
        ],
      },
    },
    {
      width: 1200,
      height: 630,
      fonts: [
        { name: 'Cormorant Garamond', data: cormorantItalic, weight: 400, style: 'italic' as const },
        { name: 'Cormorant Garamond', data: cormorantSemiBoldItalic, weight: 600, style: 'italic' as const },
        { name: 'Outfit', data: outfit, weight: 400, style: 'normal' as const },
      ],
    }
  )
}

async function main() {
  // Use resvg-js (native, not wasm) for Node
  const { Resvg } = await import('@resvg/resvg-js').catch(async () => {
    // Fallback: save as SVG and convert with sharp
    return null as any
  })

  const outDir = join(__dirname, '..', 'public', 'og')
  mkdirSync(outDir, { recursive: true })

  for (const page of pages) {
    console.log(`Generating ${page.filename}...`)
    const svg = await generateSvg(page)

    if (Resvg) {
      const resvg = new Resvg(svg, { fitTo: { mode: 'width' as const, value: 1200 } })
      const png = resvg.render()
      writeFileSync(join(outDir, page.filename), png.asPng())
    } else {
      // Save SVG as fallback
      writeFileSync(join(outDir, page.filename.replace('.png', '.svg')), svg)
    }
  }

  console.log(`Done! Generated ${pages.length} OG images in public/og/`)
}

main().catch(console.error)
