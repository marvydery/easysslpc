"use client";
import { useRouter } from "next/navigation";
import DashboardTable from "./DashboardTable";

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
}: {
  domains: DomainRow[];
  userTier: string;
  panelDomains: Record<string, string>;
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
      onDomainDeleted={handleDomainDeleted}
    />
  );
}
