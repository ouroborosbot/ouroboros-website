import type { APIRoute, GetStaticPaths } from 'astro'
import satori from 'satori'
import { Resvg } from '@resvg/resvg-js'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const fontsDir = join(process.cwd(), 'src/og/fonts')
const cormorantItalic = readFileSync(join(fontsDir, 'CormorantGaramond-Italic.ttf'))
const cormorantSemiBoldItalic = readFileSync(join(fontsDir, 'CormorantGaramond-SemiBoldItalic.ttf'))
const outfit = readFileSync(join(fontsDir, 'Outfit-Regular.ttf'))

const pages: Record<string, { title: string; subtitle?: string; tag?: string }> = {
  'og-home': {
    title: 'What survives when the context window runs out?',
    subtitle: 'Identity. Relationships. Work in flight.',
  },
  'og-why': {
    title: 'Persistence is not enough.',
    subtitle: 'Why persistent agents need structured identity, automatic recall, and cross-session continuity.',
    tag: 'Why Ouroboros',
  },
  'og-story': {
    title: 'Code a model can use, not code that uses a model.',
    subtitle: 'How building an AI agent plugin led to building an agent harness from scratch.',
    tag: 'Origin Story',
  },
  'og-docs': {
    title: 'Docs for humans. Skills for agents.',
    subtitle: 'The website explains the what. Your agent fetches the how.',
    tag: 'Documentation',
  },
  'og-blog': {
    title: 'Dispatches from the serpent.',
    subtitle: 'Essays on agent ergonomics, persistent agents, and software shaped for the thing inside it.',
    tag: 'Blog',
  },
  'og-what-is-agent-experience': {
    title: 'What Is Agent Experience?',
    subtitle: 'The design surface that appears when an agent has to stay oriented inside the system it inhabits.',
    tag: 'Essay',
  },
  'og-stop-being-the-glue': {
    title: 'Stop Being the Glue',
    subtitle: 'How I stopped copy-pasting between AI tools and started collaborating.',
    tag: 'Essay',
  },
  'og-tutorial': {
    title: 'Build an AI Agent from Scratch',
    subtitle: 'A working AI agent in ~150 lines of TypeScript.',
    tag: 'Tutorial',
  },
}

export const getStaticPaths: GetStaticPaths = () => {
  return Object.keys(pages).map((slug) => ({ params: { slug } }))
}

export const GET: APIRoute = async ({ params }) => {
  const slug = params.slug as string
  const page = pages[slug]
  if (!page) return new Response('Not found', { status: 404 })

  const { title, subtitle, tag } = page

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
                fontSize: title.length > 40 ? '56px' : '72px',
                fontFamily: 'Cormorant Garamond',
                fontStyle: 'italic',
                fontWeight: 600,
                color: '#e8ede9',
                lineHeight: 1.1,
                maxWidth: '900px',
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
                {
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
                },
                {
                  type: 'div',
                  props: {
                    style: {
                      fontSize: '14px',
                      color: 'rgba(138,155,142,0.4)',
                      fontFamily: 'Outfit',
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

  const resvg = new Resvg(svg, { fitTo: { mode: 'width', value: 1200 } })
  const png = resvg.render()
  const pngBuffer = png.asPng()

  return new Response(pngBuffer, {
    headers: { 'Content-Type': 'image/png' },
  })
}
