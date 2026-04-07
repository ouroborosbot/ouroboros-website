/*
  Dynamic Open Graph image endpoint.

  HOW IT WORKS:
  - This endpoint is the SINGLE source of OG image rendering for the site.
  - It reads from src/data/og.ts (the page metadata manifest) and renders
    one PNG per entry at build time via getStaticPaths.
  - On every push to main, Cloudflare Pages runs `astro build`, which calls
    getStaticPaths() once and pre-renders every OG image to dist/og/og-*.png.
  - The result: OG images are always in sync with the latest copy in
    src/data/og.ts. Update copy in one place, push, done.
  - Manual regeneration scripts are NOT needed (and the old
    scripts/generate-og.ts has been removed).

  DESIGN RULES (matching the design system header at the top of global.css):
  - Sentence case for all titles
  - Cormorant Garamond REGULAR (not italic) for the title
  - Outfit for body / subtitle
  - JetBrains-style mono for the eyebrow tag (we use Outfit caps tracked-out
    here since Satori needs the actual font and we don't want to ship a
    third TTF for one element)
  - Centered layout for mobile-friendly previews on Twitter, Slack, iMessage
  - Atmospheric dark organic background matching the site palette
*/
import type { APIRoute, GetStaticPaths } from 'astro'
import satori from 'satori'
import { Resvg } from '@resvg/resvg-js'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { pageOg, slugFor, routePathForSlug } from '../../data/og'

const fontsDir = join(process.cwd(), 'src/og/fonts')
const cormorantRegular = readFileSync(join(fontsDir, 'CormorantGaramond-Regular.ttf'))
const outfit = readFileSync(join(fontsDir, 'Outfit-Regular.ttf'))

// Site colors — keep in sync with @theme block in src/styles/global.css
const COLOR = {
  void: '#050A07',
  deep: '#0D1F13',
  undergrowth: '#152A1C',
  canopy: '#1E3D28',
  scale: '#2D9447',
  glow: '#4AE36C',
  fang: '#D3483D',
  bone: '#EDF2EE',
  mist: '#9AAE9F',
  shadow: '#6A7E6F',
} as const

export const getStaticPaths: GetStaticPaths = () => {
  return Object.keys(pageOg).map((routePath) => ({
    params: { slug: slugFor(routePath) },
  }))
}

export const GET: APIRoute = async ({ params }) => {
  const slug = params.slug as string
  const routePath = routePathForSlug(slug)
  if (!routePath) return new Response('Not found', { status: 404 })

  const entry = pageOg[routePath]
  if (!entry) return new Response('Not found', { status: 404 })

  const { title, subtitle, tag } = entry

  // Title sizing — bigger when shorter so the card reads well on mobile
  // share previews (which shrink the 1200x630 image to ~200-400px wide).
  const titleSize =
    title.length > 60 ? 76 :
    title.length > 40 ? 92 :
    title.length > 25 ? 108 : 120

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
          alignItems: 'center',
          padding: '80px 100px',
          background: `linear-gradient(180deg, ${COLOR.deep} 0%, ${COLOR.void} 100%)`,
          fontFamily: 'Outfit',
          position: 'relative',
          overflow: 'hidden',
        },
        children: [
          // Atmospheric scale-tinted glow, top-left
          {
            type: 'div',
            props: {
              style: {
                position: 'absolute',
                top: '-200px',
                left: '-200px',
                width: '700px',
                height: '700px',
                borderRadius: '50%',
                background: `radial-gradient(circle, rgba(45,148,71,0.10) 0%, transparent 70%)`,
              },
            },
          },
          // Atmospheric scale-tinted glow, bottom-right
          {
            type: 'div',
            props: {
              style: {
                position: 'absolute',
                bottom: '-200px',
                right: '-200px',
                width: '600px',
                height: '600px',
                borderRadius: '50%',
                background: `radial-gradient(circle, rgba(45,148,71,0.07) 0%, transparent 70%)`,
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
                height: '3px',
                background: `linear-gradient(90deg, transparent 0%, rgba(45,148,71,0.6) 50%, transparent 100%)`,
              },
            },
          },
          // Eyebrow row: hairline + tag + hairline (matches HeroCover)
          ...(tag ? [{
            type: 'div',
            props: {
              style: {
                display: 'flex',
                alignItems: 'center',
                gap: '20px',
                marginBottom: '40px',
              },
              children: [
                {
                  type: 'div',
                  props: {
                    style: {
                      width: '60px',
                      height: '1px',
                      background: 'rgba(30,61,40,0.8)',
                    },
                  },
                },
                {
                  type: 'div',
                  props: {
                    style: {
                      fontSize: '20px',
                      letterSpacing: '0.28em',
                      textTransform: 'uppercase' as const,
                      color: COLOR.fang,
                      fontFamily: 'Outfit',
                      fontWeight: 500,
                    },
                    children: tag,
                  },
                },
                {
                  type: 'div',
                  props: {
                    style: {
                      width: '60px',
                      height: '1px',
                      background: 'rgba(30,61,40,0.8)',
                    },
                  },
                },
              ],
            },
          }] : []),
          // Title — non-italic Cormorant Regular, sized for mobile readability
          {
            type: 'div',
            props: {
              style: {
                fontSize: `${titleSize}px`,
                fontFamily: 'Cormorant Garamond',
                fontWeight: 400,
                color: COLOR.bone,
                lineHeight: 1.05,
                textAlign: 'center' as const,
                maxWidth: '1000px',
                letterSpacing: '-0.01em',
              },
              children: title,
            },
          },
          // Subtitle (optional)
          ...(subtitle ? [{
            type: 'div',
            props: {
              style: {
                fontSize: '28px',
                color: COLOR.mist,
                marginTop: '32px',
                lineHeight: 1.4,
                maxWidth: '900px',
                fontFamily: 'Outfit',
                textAlign: 'center' as const,
              },
              children: subtitle,
            },
          }] : []),
          // Bottom brand wordmark (centered) — just the wordmark, no URL.
          // The social platform shows the domain alongside the card already,
          // so repeating it here was redundant SaaS-y noise.
          {
            type: 'div',
            props: {
              style: {
                position: 'absolute',
                bottom: '50px',
                left: '0',
                right: '0',
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
              },
              children: [
                {
                  type: 'div',
                  props: {
                    style: {
                      fontSize: '36px',
                      fontFamily: 'Cormorant Garamond',
                      fontWeight: 400,
                      color: COLOR.bone,
                    },
                    children: 'ouroboros',
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
        { name: 'Cormorant Garamond', data: cormorantRegular, weight: 400, style: 'normal' as const },
        { name: 'Outfit', data: outfit, weight: 400, style: 'normal' as const },
        { name: 'Outfit', data: outfit, weight: 500, style: 'normal' as const },
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
