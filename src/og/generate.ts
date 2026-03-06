import satori from 'satori'
import { Resvg } from '@resvg/resvg-wasm'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// Load fonts once
const fontsDir = join(import.meta.dirname, 'fonts')
const cormorantItalic = readFileSync(join(fontsDir, 'CormorantGaramond-Italic.ttf'))
const cormorantSemiBoldItalic = readFileSync(join(fontsDir, 'CormorantGaramond-SemiBoldItalic.ttf'))
const outfit = readFileSync(join(fontsDir, 'Outfit-Regular.ttf'))

let wasmInitialized = false

export async function generateOgImage(options: {
  title: string
  subtitle?: string
  tag?: string
}): Promise<Buffer> {
  const { title, subtitle, tag } = options

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
        { name: 'Cormorant Garamond', data: cormorantItalic, weight: 400, style: 'italic' },
        { name: 'Cormorant Garamond', data: cormorantSemiBoldItalic, weight: 600, style: 'italic' },
        { name: 'Outfit', data: outfit, weight: 400, style: 'normal' },
      ],
    }
  )

  if (!wasmInitialized) {
    // @ts-ignore - resvg-wasm needs init in Node
    const wasmModule = await import('@resvg/resvg-wasm/index_bg.wasm?module').catch(() => null)
    if (wasmModule) {
      // Already initialized or wasm module approach
    }
    wasmInitialized = true
  }

  const resvg = new Resvg(svg, { fitTo: { mode: 'width', value: 1200 } })
  const png = resvg.render()
  return Buffer.from(png.asPng())
}
