import { NextRequest } from 'next/server';
import { handleLearning } from '@/lib/exam-preview/learning-route';
const handle = (request: NextRequest, context: {params:{division:string}}) => handleLearning(request, context, true);
export const GET = handle;
export const POST = handle;
