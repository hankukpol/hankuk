import { PreviewPage, type PreviewPageProps } from '@/components/exams/preview/PreviewPage';
export const dynamic = 'force-dynamic';
export default function Page(props:PreviewPageProps) { return <PreviewPage {...props} mode="student"/>; }
