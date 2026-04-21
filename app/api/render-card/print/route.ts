import { handleRenderCardRoute } from '@/features/server-render-card/render-card-route-handler';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  return await handleRenderCardRoute(request, 'print');
}
