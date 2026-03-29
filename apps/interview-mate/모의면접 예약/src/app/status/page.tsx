import { StatusFlow } from "@/components/status/status-flow";

type StatusPageProps = {
  searchParams?: {
    token?: string;
  };
};

export default function StatusPage({ searchParams }: StatusPageProps) {
  const token = searchParams?.token ?? "";

  return <StatusFlow token={token} />;
}
