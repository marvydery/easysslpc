"use client";
import { useRouter } from "next/navigation";
import DashboardTable from "./DashboardTable";
import type { LiveScan } from "@/lib/live-scan";

type Domain = {
  id: string;
  domainName: string;
  autoRenewEnabled: boolean;
  challengeToken: string | null;
  bridgeSecret: string | null;
};

type Certificate = {
  expiryDate: Date;
} | null;

type DomainRow = {
  domain: Domain;
  certificate: Certificate;
};

export default function DashboardClient({
  domains,
  userTier,
  panelDomains,
  liveScans,
}: {
  domains: DomainRow[];
  userTier: string;
  panelDomains: Record<string, string>;
  liveScans: Record<string, LiveScan>;
}) {
  const router = useRouter();
  const handleDomainDeleted = () => {
    router.refresh();
  };
  return (
    <DashboardTable
      domains={domains}
      userTier={userTier}
      panelDomains={panelDomains}
      liveScans={liveScans}
      onDomainDeleted={handleDomainDeleted}
    />
  );
}
