import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const fontRegular = fs.readFileSync(path.join(__dirname, 'Roboto-Regular.ttf'));
const fontBold = fs.readFileSync(path.join(__dirname, 'Roboto-Bold.ttf'));
const logoData = 'data:image/jpeg;base64,' + fs.readFileSync(path.join(__dirname, 'blinkFlow.jpg')).toString('base64');
const outDir = 'C:\\Users\\Olena\\.gemini\\antigravity-ide\\brain\\0c37a29b-f317-4c38-8dbc-3d588fd60659\\.user_uploaded';

const generate = async (name, satoriConfig) => {
  const svg = await satori(satoriConfig, {
    width: 1200,
    height: 630,
    fonts: [
      { name: 'Roboto', data: fontRegular, weight: 400, style: 'normal' },
      { name: 'Roboto', data: fontBold, weight: 700, style: 'normal' },
    ],
  });
  const resvg = new Resvg(svg, { background: 'rgba(255, 255, 255, 1)' });
  const pngData = resvg.render();
  const pngBuffer = pngData.asPng();
  fs.writeFileSync(path.join(outDir, `${name}.png`), pngBuffer);
};

// Data
const title = 'Smart Contract Audit';
const amount = '2,500';
const status = 'Awaiting Funding';

// Concept 1: Dark Neon / Obsidian
await generate('concept1', {
  type: 'div',
  props: {
    style: {
      height: '100%',
      width: '100%',
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'space-between',
      backgroundImage: 'linear-gradient(135deg, #050505 0%, #150525 50%, #050505 100%)',
      padding: '80px',
      fontFamily: 'Roboto',
    },
    children: [
      // Top row
      {
        type: 'div',
        props: {
          style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' },
          children: [
            {
              type: 'div',
              props: {
                style: { display: 'flex', alignItems: 'center', gap: '20px' },
                children: [
                  {
                    type: 'div',
                    props: {
                      style: {
                        width: '140px', height: '140px', borderRadius: '50%', overflow: 'hidden', display: 'flex',
                        boxShadow: '0 0 60px 10px rgba(168, 85, 247, 0.4)'
                      },
                      children: [{ type: 'img', props: { src: logoData, style: { width: '100%', height: '100%', objectFit: 'cover' } } }]
                    }
                  },
                  {
                    type: 'span',
                    props: { style: { fontSize: '70px', color: '#fff', fontWeight: 700 }, children: 'BlinkFlow' }
                  }
                ]
              }
            },
            {
              type: 'div',
              props: {
                style: {
                  display: 'flex', alignItems: 'center', padding: '16px 32px', borderRadius: '40px',
                  backgroundColor: 'rgba(168, 85, 247, 0.15)', border: '2px solid rgba(168, 85, 247, 0.5)',
                  color: '#e9d5ff', fontSize: '32px', fontWeight: 700,
                },
                children: [
                  { type: 'div', props: { style: { marginRight: '16px', width: '16px', height: '16px', borderRadius: '50%', backgroundColor: '#c084fc' } } },
                  status
                ]
              }
            }
          ]
        }
      },
      // Middle
      {
        type: 'div',
        props: {
          style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', marginTop: '40px' },
          children: [
            {
              type: 'div',
              props: {
                style: { display: 'flex', flexDirection: 'column', maxWidth: '65%' },
                children: [
                  { type: 'span', props: { style: { color: '#a855f7', fontSize: '28px', fontWeight: 700, marginBottom: '16px', textTransform: 'uppercase', letterSpacing: '2px' }, children: 'Escrow Deal' } },
                  { type: 'span', props: { style: { fontSize: '64px', color: '#fff', fontWeight: 700, lineHeight: 1.1 }, children: title } },
                  { type: 'span', props: { style: { fontSize: '32px', color: '#6b7280', marginTop: '16px' }, children: 'ID: ESC-4821' } }
                ]
              }
            },
            {
              type: 'div',
              props: {
                style: { display: 'flex', flexDirection: 'column', alignItems: 'flex-end' },
                children: [
                  { type: 'span', props: { style: { fontSize: '32px', color: '#9ca3af', marginBottom: '8px' }, children: 'Amount' } },
                  { type: 'span', props: { style: { fontSize: '80px', color: '#c084fc', fontWeight: 700, lineHeight: 1 }, children: amount } },
                  { type: 'span', props: { style: { fontSize: '36px', color: '#e9d5ff', fontWeight: 400, marginTop: '8px' }, children: 'USDC' } }
                ]
              }
            }
          ]
        }
      },
      // Bottom
      {
        type: 'div',
        props: {
          style: { display: 'flex', justifyContent: 'center', width: '100%', borderTop: '2px solid rgba(168, 85, 247, 0.2)', paddingTop: '32px' },
          children: [
            { type: 'span', props: { style: { fontSize: '28px', color: '#9ca3af' }, children: 'Customer: 7xKX...sAsU  ->  Contractor: ABCD...WXYZ' } }
          ]
        }
      }
    ]
  }
});

// Concept 2: Solana Native
await generate('concept2', {
  type: 'div',
  props: {
    style: {
      height: '100%',
      width: '100%',
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'space-between',
      backgroundImage: 'linear-gradient(135deg, rgba(20,241,149,0.15) 0%, #000000 50%, rgba(153,69,255,0.2) 100%)',
      backgroundColor: '#000',
      padding: '80px',
      fontFamily: 'Roboto',
    },
    children: [
      // Top row
      {
        type: 'div',
        props: {
          style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' },
          children: [
            {
              type: 'div',
              props: {
                style: { display: 'flex', alignItems: 'center', gap: '20px' },
                children: [
                  {
                    type: 'div',
                    props: {
                      style: {
                        width: '140px', height: '140px', borderRadius: '50%', overflow: 'hidden', display: 'flex',
                        border: '4px solid #9945FF'
                      },
                      children: [{ type: 'img', props: { src: logoData, style: { width: '100%', height: '100%', objectFit: 'cover' } } }]
                    }
                  },
                  {
                    type: 'span',
                    props: { style: { fontSize: '70px', color: '#fff', fontWeight: 700 }, children: 'BlinkFlow' }
                  }
                ]
              }
            },
            {
              type: 'div',
              props: {
                style: {
                  display: 'flex', alignItems: 'center', padding: '16px 32px', borderRadius: '40px',
                  backgroundColor: 'rgba(153,69,255,0.2)', border: '2px solid #9945FF',
                  color: '#fff', fontSize: '32px', fontWeight: 700,
                },
                children: [
                  { type: 'div', props: { style: { marginRight: '16px', width: '16px', height: '16px', borderRadius: '50%', backgroundColor: '#14F195' } } },
                  status
                ]
              }
            }
          ]
        }
      },
      // Middle
      {
        type: 'div',
        props: {
          style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', marginTop: '40px' },
          children: [
            {
              type: 'div',
              props: {
                style: { display: 'flex', flexDirection: 'column', maxWidth: '65%' },
                children: [
                  { type: 'span', props: { style: { color: '#9945FF', fontSize: '28px', fontWeight: 700, marginBottom: '16px', textTransform: 'uppercase', letterSpacing: '2px' }, children: 'Escrow Deal' } },
                  { type: 'span', props: { style: { fontSize: '64px', color: '#fff', fontWeight: 700, lineHeight: 1.1 }, children: title } },
                  { type: 'span', props: { style: { fontSize: '32px', color: '#6b7280', marginTop: '16px' }, children: 'ID: ESC-4821' } }
                ]
              }
            },
            {
              type: 'div',
              props: {
                style: { display: 'flex', flexDirection: 'column', alignItems: 'flex-end' },
                children: [
                  { type: 'span', props: { style: { fontSize: '32px', color: '#9ca3af', marginBottom: '8px' }, children: 'Amount' } },
                  { type: 'span', props: { style: { fontSize: '80px', color: '#14F195', fontWeight: 700, lineHeight: 1 }, children: amount } },
                  { type: 'span', props: { style: { fontSize: '36px', color: '#fff', fontWeight: 400, marginTop: '8px' }, children: 'USDC' } }
                ]
              }
            }
          ]
        }
      },
      // Bottom
      {
        type: 'div',
        props: {
          style: { display: 'flex', justifyContent: 'center', width: '100%', borderTop: '2px solid rgba(153,69,255,0.3)', paddingTop: '32px' },
          children: [
            { type: 'span', props: { style: { fontSize: '28px', color: '#9ca3af' }, children: 'Customer: 7xKX...sAsU  ->  Contractor: ABCD...WXYZ' } }
          ]
        }
      }
    ]
  }
});

// Concept 3: Fintech Minimal
await generate('concept3', {
  type: 'div',
  props: {
    style: {
      height: '100%',
      width: '100%',
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'space-between',
      backgroundImage: 'linear-gradient(135deg, #0F172A 0%, #020617 100%)',
      padding: '80px',
      fontFamily: 'Roboto',
    },
    children: [
      // Top row
      {
        type: 'div',
        props: {
          style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' },
          children: [
            {
              type: 'div',
              props: {
                style: { display: 'flex', alignItems: 'center', gap: '20px' },
                children: [
                  {
                    type: 'div',
                    props: {
                      style: {
                        width: '140px', height: '140px', borderRadius: '50%', overflow: 'hidden', display: 'flex',
                        border: '2px solid rgba(255,255,255,0.15)'
                      },
                      children: [{ type: 'img', props: { src: logoData, style: { width: '100%', height: '100%', objectFit: 'cover' } } }]
                    }
                  },
                  {
                    type: 'span',
                    props: { style: { fontSize: '70px', color: '#fff', fontWeight: 700 }, children: 'BlinkFlow' }
                  }
                ]
              }
            },
            {
              type: 'div',
              props: {
                style: {
                  display: 'flex', alignItems: 'center', padding: '16px 32px', borderRadius: '40px',
                  border: '2px solid rgba(255,255,255,0.15)',
                  color: '#fff', fontSize: '32px', fontWeight: 700,
                },
                children: [
                  { type: 'div', props: { style: { marginRight: '16px', width: '16px', height: '16px', borderRadius: '50%', backgroundColor: '#fff' } } },
                  status
                ]
              }
            }
          ]
        }
      },
      // Middle
      {
        type: 'div',
        props: {
          style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', marginTop: '40px' },
          children: [
            {
              type: 'div',
              props: {
                style: { display: 'flex', flexDirection: 'column', maxWidth: '65%' },
                children: [
                  { type: 'span', props: { style: { color: '#94a3b8', fontSize: '28px', fontWeight: 700, marginBottom: '16px', textTransform: 'uppercase', letterSpacing: '2px' }, children: 'Escrow Deal' } },
                  { type: 'span', props: { style: { fontSize: '64px', color: '#f8fafc', fontWeight: 700, lineHeight: 1.1 }, children: title } },
                  { type: 'span', props: { style: { fontSize: '32px', color: '#64748b', marginTop: '16px' }, children: 'ID: ESC-4821' } }
                ]
              }
            },
            {
              type: 'div',
              props: {
                style: { display: 'flex', flexDirection: 'column', alignItems: 'flex-end' },
                children: [
                  { type: 'span', props: { style: { fontSize: '32px', color: '#94a3b8', marginBottom: '8px' }, children: 'Amount' } },
                  { type: 'span', props: { style: { fontSize: '80px', color: '#38bdf8', fontWeight: 700, lineHeight: 1 }, children: amount } },
                  { type: 'span', props: { style: { fontSize: '36px', color: '#e0f2fe', fontWeight: 400, marginTop: '8px' }, children: 'USDC' } }
                ]
              }
            }
          ]
        }
      },
      // Bottom
      {
        type: 'div',
        props: {
          style: { display: 'flex', justifyContent: 'center', width: '100%', borderTop: '2px solid rgba(255,255,255,0.1)', paddingTop: '32px' },
          children: [
            { type: 'span', props: { style: { fontSize: '28px', color: '#94a3b8' }, children: 'Customer: 7xKX...sAsU  ->  Contractor: ABCD...WXYZ' } }
          ]
        }
      }
    ]
  }
});
