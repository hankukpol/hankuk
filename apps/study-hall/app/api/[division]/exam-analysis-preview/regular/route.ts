import type { NextRequest } from 'next/server';
import { handleExamPreview } from '@/lib/exam-preview/route';
export const dynamic = 'force-dynamic';
export function GET(request: NextRequest, {params}: {params:{division:string}}) { return handleExamPreview(request, params.division, 'regular'); }
