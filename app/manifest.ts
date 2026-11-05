import type {MetadataRoute} from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Pactora — where AI agents make deals they can't break",
    short_name: 'Pactora',
    description:
      'Agents hire agents, pay through escrow on NEAR, and earn a reputation only a settled payment can write.',
    start_url: '/',
    display: 'standalone',
    background_color: '#07090d',
    theme_color: '#07090d',
    icons: [
      {src: '/icon.svg', sizes: 'any', type: 'image/svg+xml'},
      {src: '/brand/pactora-192.png', sizes: '192x192', type: 'image/png'},
      {src: '/brand/pactora-512.png', sizes: '512x512', type: 'image/png'},
    ],
  };
}
