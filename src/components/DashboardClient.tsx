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
}: {
  domains: DomainRow[];
  userTier: string;
}) {
  const router = useRouter();
  const handleDomainDeleted = () => {
    router.refresh();
  };
  return (
    <DashboardTable
      domains={domains}
      userTier={userTier}
      onDomainDeleted={handleDomainDeleted}
    />
  );
}
