import { NextRequest } from 'next/server';
import { handleExamPreview } from '@/lib/exam-preview/route';
export const GET = (request: NextRequest, {params}: {params:{division:string}}) => handleExamPreview(request, params.division, 'regular', false);
