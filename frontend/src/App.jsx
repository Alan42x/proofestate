import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  BadgeCheck,
  Building2,
  Check,
  ChevronDown,
  CircleDollarSign,
  Cpu,
  Database,
  FileCheck2,
  Home,
  Info,
  Languages,
  ListChecks,
  Loader2,
  LockKeyhole,
  Network,
  RefreshCw,
  Send,
  Settings,
  ShieldCheck,
  UserRoundCog,
  Wallet,
  XCircle,
  Zap
} from "lucide-react";
import {
  useAccount,
  useChainId,
  useConnect,
  useDisconnect,
  usePublicClient,
  useReadContract,
  useWriteContract
} from "wagmi";
import { hardhat, sepolia } from "wagmi/chains";
import { lendingAbi, propertyVerificationAbi } from "./contracts/abis";
import { getOracleHealth, getProperties, getPropertiesByOwner, postOracle } from "./lib/api";
import { formatRecord, propertyKey, roleKey, shortField, shortHash } from "./lib/chain";
import { detectInitialLanguage, LANG_STORAGE_KEY, translations } from "./lib/i18n";

const propertyVerificationAddress = import.meta.env.VITE_PROPERTY_VERIFICATION_ADDRESS;
const complianceVerifierAddress = import.meta.env.VITE_COMPLIANCE_VERIFIER_ADDRESS;
const lendingAddress = import.meta.env.VITE_LENDING_ADDRESS;
const configuredAdminAddress = import.meta.env.VITE_ADMIN_ADDRESS || "";
const configuredOracleAddress = import.meta.env.VITE_ORACLE_ADDRESS || "";
const configuredLoanOfficerAddress = import.meta.env.VITE_LOAN_OFFICER_ADDRESS || "";
const safePropertyVerificationAddress = isValidAddress(propertyVerificationAddress)
  ? propertyVerificationAddress
  : undefined;
const safeComplianceVerifierAddress = isValidAddress(complianceVerifierAddress)
  ? complianceVerifierAddress
  : undefined;
const safeLendingAddress = isValidAddress(lendingAddress) ? lendingAddress : undefined;
const defaultNetwork = import.meta.env.VITE_DEFAULT_NETWORK || "localhost";
const allowedRegions = new Set(["SG-CCR", "SG-RCR", "SG-OCR"]);
const minimumValuation = 200000;
const defaultAdminRole = "0x0000000000000000000000000000000000000000000000000000000000000000";
const oracleRole = roleKey("ORACLE_ROLE");
const loanOfficerRole = roleKey("LOAN_OFFICER_ROLE");

function chainIdFor(network) {
  return network === "sepolia" ? sepolia.id : hardhat.id;
}

function isValidAddress(value) {
  return /^0x[a-fA-F0-9]{40}$/.test(value || "");
}

function formatCurrency(value) {
  return `$${Number(value || 0).toLocaleString()}`;
}

function normalizeLoan(loan) {
  if (!loan) return null;
  return {
    borrower: loan.borrower ?? loan[0],
    propertyId: loan.propertyId ?? loan[1],
    principalCommitment: loan.principalCommitment ?? loan.principal ?? loan[2],
    interestRateBps: loan.interestRateBps ?? loan[3],
    termDays: loan.termDays ?? loan[4],
    state: Number(loan.state ?? loan[5]),
    requestedAt: loan.requestedAt ?? loan[6],
    approvedAt: loan.approvedAt ?? loan[7],
    repaidAt: loan.repaidAt ?? loan[8]
  };
}

function formatTimestamp(value) {
  const timestamp = Number(value || 0n);
  return timestamp ? new Date(timestamp * 1000).toLocaleString() : "-";
}

function passesVerificationRules(property) {
  return Boolean(
    property &&
      allowedRegions.has(property.region) &&
      Number(property.valuation || 0) >= minimumValuation &&
      property.noEncumbrance === true &&
      property.status === "ACTIVE"
  );
}

function App() {
  const [language, setLanguage] = useState(detectInitialLanguage);
  const t = (key) => translations[language][key] || translations.en[key] || key;

  const [activeView, setActiveView] = useState("overview");
  const [properties, setProperties] = useState([]);
  const [ownedProperties, setOwnedProperties] = useState([]);
  const [selectedId, setSelectedId] = useState("PROP-001");
  const [principal, setPrincipal] = useState("750000");
  const [principalCommitment, setPrincipalCommitment] = useState("");
  const [proofPrincipal, setProofPrincipal] = useState("");
  const [proofPropertyKey, setProofPropertyKey] = useState("");
  const [selectedLoanId, setSelectedLoanId] = useState(null);
  const [approvalFilter, setApprovalFilter] = useState("requested");
  const [network, setNetwork] = useState(defaultNetwork);
  const [writeViaOracle, setWriteViaOracle] = useState(true);
  const [activity, setActivity] = useState([]);
  const [busyAction, setBusyAction] = useState("");
  const [roleAddress, setRoleAddress] = useState("");
  const [roleTarget, setRoleTarget] = useState("loanOfficer");
  const [roleOperation, setRoleOperation] = useState("grant");
  const [oracleHealth, setOracleHealth] = useState({ ok: false, checked: false });
  const [chainHealth, setChainHealth] = useState({ ok: false, checked: false, blockNumber: null });
  const [contractHealth, setContractHealth] = useState({});
  const [loanPortfolio, setLoanPortfolio] = useState({ loading: false, loans: [] });
  const [propertyLoanHistory, setPropertyLoanHistory] = useState({ loading: false, loans: [] });
  const [proofLatencySamples, setProofLatencySamples] = useState([]);
  const [gasSamples, setGasSamples] = useState([]);

  const { address, isConnected } = useAccount();
  const walletChainId = useChainId();
  const { connect, connectors, isPending: connecting } = useConnect();
  const { disconnect } = useDisconnect();
  const { writeContractAsync, isPending: writing } = useWriteContract();
  const publicClient = usePublicClient({ chainId: chainIdFor(network) });

  useEffect(() => {
    document.title = t("appTitle");
    document.documentElement.lang = language === "zh" ? "zh-CN" : "en";
  }, [language]);

  useEffect(() => {
    let mounted = true;
    getProperties().then((items) => {
      if (!mounted) return;
      setProperties(items);
      setSelectedId((current) =>
        items.length && !items.find((item) => item.propertyId === current)
          ? items[0].propertyId
          : current
      );
    });

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    let mounted = true;
    getPropertiesByOwner(address).then((items) => {
      if (!mounted) return;
      setOwnedProperties(items);
      if (isConnected && items.length) {
        setSelectedId((current) =>
          items.find((item) => item.propertyId === current) ? current : items[0].propertyId
        );
      }
    });

    return () => {
      mounted = false;
    };
  }, [address, isConnected]);

  useEffect(() => {
    let mounted = true;
    getOracleHealth()
      .then((health) => {
        if (mounted) setOracleHealth({ ok: Boolean(health.ok), checked: true });
      })
      .catch(() => {
        if (mounted) setOracleHealth({ ok: false, checked: true });
      });

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    let mounted = true;
    setChainHealth((current) => ({ ...current, checked: false }));

    async function checkChain() {
      try {
        const blockNumber = await publicClient.getBlockNumber();
        if (mounted) setChainHealth({ ok: true, checked: true, blockNumber });
      } catch (_error) {
        if (mounted) setChainHealth({ ok: false, checked: true, blockNumber: null });
      }
    }

    checkChain();
    const interval = window.setInterval(checkChain, 5000);
    return () => {
      mounted = false;
      window.clearInterval(interval);
    };
  }, [network, publicClient]);

  useEffect(() => {
    let mounted = true;
    const contracts = {
      propertyVerification: safePropertyVerificationAddress,
      complianceVerifier: safeComplianceVerifierAddress,
      lending: safeLendingAddress
    };

    async function checkContracts() {
      const entries = await Promise.all(
        Object.entries(contracts).map(async ([key, addressValue]) => {
          if (!addressValue) return [key, { status: "missing", deployed: false, address: "" }];
          try {
            const bytecode = await publicClient.getBytecode({ address: addressValue });
            return [
              key,
              {
                status: bytecode && bytecode !== "0x" ? "deployed" : "configured",
                deployed: Boolean(bytecode && bytecode !== "0x"),
                address: addressValue
              }
            ];
          } catch (_error) {
            return [key, { status: "unreachable", deployed: false, address: addressValue }];
          }
        })
      );
      if (mounted) setContractHealth(Object.fromEntries(entries));
    }

    checkContracts();
    const interval = window.setInterval(checkContracts, 5000);
    return () => {
      mounted = false;
      window.clearInterval(interval);
    };
  }, [network, publicClient]);

  const selectedProperty = useMemo(
    () => properties.find((property) => property.propertyId === selectedId) || properties[0],
    [properties, selectedId]
  );
  const visibleProperties = useMemo(
    () => (isConnected && ownedProperties.length ? ownedProperties : properties),
    [isConnected, ownedProperties, properties]
  );
  const isSelectedOwned = Boolean(
    address &&
      selectedProperty?.ownerAddress &&
      selectedProperty.ownerAddress.toLowerCase() === address.toLowerCase()
  );
  const selectedKey = selectedProperty ? propertyKey(selectedProperty.propertyId) : undefined;

  useEffect(() => {
    setPrincipalCommitment("");
    setProofPrincipal("");
    setProofPropertyKey("");
  }, [principal, selectedId]);

  const contractsDeployed = Boolean(
    contractHealth.propertyVerification?.deployed &&
      contractHealth.complianceVerifier?.deployed &&
      contractHealth.lending?.deployed
  );
  const contractsReady = Boolean(
    contractHealth.propertyVerification?.deployed &&
      contractHealth.lending?.deployed &&
      selectedKey
  );
  const fullContractsReady = Boolean(
    contractsDeployed
  );
  const oracleWriteReady = Boolean(
    contractHealth.propertyVerification?.deployed &&
      contractHealth.complianceVerifier?.deployed &&
      selectedKey
  );

  const {
    data: record,
    refetch: refetchRecord,
    isFetching: fetchingRecord
  } = useReadContract({
    address: safePropertyVerificationAddress,
    abi: propertyVerificationAbi,
    functionName: "getRecord",
    args: selectedKey ? [selectedKey] : undefined,
    chainId: chainIdFor(network),
    query: {
      enabled: Boolean(safePropertyVerificationAddress && selectedKey)
    }
  });

  const { data: nextLoanId, refetch: refetchNextLoanId } = useReadContract({
    address: safeLendingAddress,
    abi: lendingAbi,
    functionName: "nextLoanId",
    chainId: chainIdFor(network),
    query: {
      enabled: Boolean(safeLendingAddress)
    }
  });

  const { data: activeLoanData, refetch: refetchActiveLoan } = useReadContract({
    address: safeLendingAddress,
    abi: lendingAbi,
    functionName: "activeLoanIdOf",
    args: selectedKey ? [selectedKey] : undefined,
    chainId: chainIdFor(network),
    query: {
      enabled: Boolean(safeLendingAddress && selectedKey)
    }
  });

  const { data: propertyLoanIds, refetch: refetchPropertyLoanIds } = useReadContract({
    address: safeLendingAddress,
    abi: lendingAbi,
    functionName: "loanIdsOfProperty",
    args: selectedKey ? [selectedKey] : undefined,
    chainId: chainIdFor(network),
    query: {
      enabled: Boolean(safeLendingAddress && selectedKey)
    }
  });

  const { data: isOracleAdmin = false, refetch: refetchOracleAdminRole } = useReadContract({
    address: safePropertyVerificationAddress,
    abi: propertyVerificationAbi,
    functionName: "hasRole",
    args: address ? [defaultAdminRole, address] : undefined,
    chainId: chainIdFor(network),
    query: {
      enabled: Boolean(safePropertyVerificationAddress && address)
    }
  });

  const { data: isLendingAdmin = false, refetch: refetchLendingAdminRole } = useReadContract({
    address: safeLendingAddress,
    abi: lendingAbi,
    functionName: "hasRole",
    args: address ? [defaultAdminRole, address] : undefined,
    chainId: chainIdFor(network),
    query: {
      enabled: Boolean(safeLendingAddress && address)
    }
  });

  const { data: isLoanOfficer = false, refetch: refetchLoanOfficerRole } = useReadContract({
    address: safeLendingAddress,
    abi: lendingAbi,
    functionName: "hasRole",
    args: address ? [loanOfficerRole, address] : undefined,
    chainId: chainIdFor(network),
    query: {
      enabled: Boolean(safeLendingAddress && address)
    }
  });

  const { data: isOracleOperator = false, refetch: refetchOracleOperatorRole } = useReadContract({
    address: safePropertyVerificationAddress,
    abi: propertyVerificationAbi,
    functionName: "hasRole",
    args: address ? [oracleRole, address] : undefined,
    chainId: chainIdFor(network),
    query: {
      enabled: Boolean(safePropertyVerificationAddress && address)
    }
  });

  const formattedRecord = formatRecord(record);
  const activeLoanId = activeLoanData
    ? activeLoanData.loanId ?? activeLoanData[0]
    : 0n;
  const activeLoanExists = Boolean(
    activeLoanData ? activeLoanData.exists ?? activeLoanData[1] : false
  );

  useEffect(() => {
    let mounted = true;

    async function loadPropertyLoanHistory() {
      if (!safeLendingAddress || !publicClient || !propertyLoanIds) {
        if (mounted) setPropertyLoanHistory({ loading: false, loans: [] });
        return;
      }

      setPropertyLoanHistory((current) => ({ ...current, loading: true }));
      try {
        const loans = await Promise.all(
          propertyLoanIds.map(async (id) => {
            const data = await publicClient.readContract({
              address: safeLendingAddress,
              abi: lendingAbi,
              functionName: "getLoan",
              args: [id]
            });
            return { id, ...normalizeLoan(data) };
          })
        );
        if (!mounted) return;
        setPropertyLoanHistory({ loading: false, loans });
        const selected = activeLoanExists
          ? activeLoanId
          : loans.length
            ? loans[loans.length - 1].id
            : null;
        setSelectedLoanId((current) => {
          if (current && loans.some((loan) => loan.id.toString() === current)) return current;
          return selected === null ? null : selected.toString();
        });
      } catch (_error) {
        if (mounted) setPropertyLoanHistory({ loading: false, loans: [] });
      }
    }

    loadPropertyLoanHistory();
    return () => {
      mounted = false;
    };
  }, [propertyLoanIds, publicClient, network, activeLoanExists, activeLoanId]);

  const selectedLoan = useMemo(() => {
    const targetId = selectedLoanId ?? (activeLoanExists ? activeLoanId.toString() : null);
    if (targetId) {
      const portfolioLoan = loanPortfolio.loans.find((loan) => loan.id.toString() === targetId);
      if (portfolioLoan) return portfolioLoan;
      const propertyLoan = propertyLoanHistory.loans.find((loan) => loan.id.toString() === targetId);
      if (propertyLoan) return propertyLoan;
    }
    if (propertyLoanHistory.loans.length) return propertyLoanHistory.loans[propertyLoanHistory.loans.length - 1];
    return null;
  }, [propertyLoanHistory.loans, selectedLoanId, activeLoanExists, activeLoanId, loanPortfolio.loans]);
  const currentLoan = selectedLoan;
  const hasLoan = Boolean(currentLoan);

  useEffect(() => {
    let mounted = true;

    async function loadLoanPortfolio() {
      if (!safeLendingAddress || nextLoanId === undefined || !publicClient) {
        if (mounted) setLoanPortfolio({ loading: false, loans: [] });
        return;
      }

      setLoanPortfolio((current) => ({ ...current, loading: true }));
      try {
        const count = Number(nextLoanId);
        const ids = Array.from({ length: count }, (_, index) => BigInt(index));
        const loans = await Promise.all(
          ids.map(async (id) => {
            const data = await publicClient.readContract({
              address: safeLendingAddress,
              abi: lendingAbi,
              functionName: "getLoan",
              args: [id]
            });
            return { id, ...normalizeLoan(data) };
          })
        );
        if (mounted) setLoanPortfolio({ loading: false, loans });
      } catch (_error) {
        if (mounted) setLoanPortfolio({ loading: false, loans: [] });
      }
    }

    loadLoanPortfolio();
    return () => {
      mounted = false;
    };
  }, [nextLoanId, publicClient, network]);

  const isVerified = Boolean(formattedRecord.verified);
  const isCompliant = Boolean(formattedRecord.compliant);
  const targetChainId = chainIdFor(network);
  const walletNetworkReady = !isConnected || walletChainId === targetChainId;
  const rpcReady = chainHealth.ok;
  const networkLabel = network === "sepolia" ? t("sepolia") : t("local");
  const walletLabel = isConnected && address
    ? `${address.slice(0, 6)}...${address.slice(-4)}`
    : t("connectWallet");
  const loanStateKey = currentLoan
    ? ["requested", "approved", "repaid", "rejected", "cancelled"][currentLoan.state] || "loanReadError"
    : "noLoan";
  const loanStateLabel = t(loanStateKey);
  const approvalState = currentLoan
    ? loanStateLabel
    : isVerified && isCompliant
      ? t("ready")
      : isVerified
        ? t("inProgress")
        : t("blocked");
  const principalAmount = BigInt(principal || "0");
  const principalCommitmentAmount = principalCommitment ? BigInt(principalCommitment) : 0n;
  const proofPrincipalAmount = proofPrincipal ? BigInt(proofPrincipal) : 0n;
  const proofMatchesPrincipal =
    principalCommitmentAmount > 0n &&
    proofPrincipalAmount > 0n &&
    proofPropertyKey === selectedKey &&
    BigInt(formattedRecord.principalCommitmentRaw || 0n) === principalCommitmentAmount;
  const principalNumber = Number(principal || 0);
  const propertyValue = Number(selectedProperty?.valuation || 0);
  const ltvPercent = propertyValue ? (principalNumber / propertyValue) * 100 : 0;
  const ltvSafe = principalAmount > 0n && ltvPercent <= 80;
  const maxPrincipal = Math.floor(propertyValue * 0.8);
  const canVerify = Boolean(
    selectedProperty &&
      oracleHealth.ok &&
      (!writeViaOracle || contractHealth.propertyVerification?.deployed)
  );
  const canComply = Boolean(
    selectedProperty &&
      isVerified &&
      principalAmount > 0n &&
      oracleHealth.ok &&
      (!writeViaOracle || oracleWriteReady)
  );
  const canRequestLoan = Boolean(
    isConnected &&
      walletNetworkReady &&
      contractsReady &&
      isVerified &&
      isCompliant &&
      proofMatchesPrincipal &&
      principalCommitmentAmount > 0n &&
      !activeLoanExists &&
      isSelectedOwned &&
      !writing
  );
  const canApproveLoan = Boolean(
    isConnected &&
      walletNetworkReady &&
      contractsReady &&
      isLoanOfficer &&
      currentLoan?.state === 0 &&
      !writing
  );
  const canRejectLoan = Boolean(
    isConnected &&
      walletNetworkReady &&
      contractsReady &&
      isLoanOfficer &&
      currentLoan?.state === 0 &&
      !writing
  );
  const canRepayLoan = Boolean(
    isConnected &&
      walletNetworkReady &&
      contractsReady &&
      currentLoan?.state === 1 &&
      currentLoan?.borrower?.toLowerCase() === address?.toLowerCase() &&
      !writing
  );
  const canCancelLoan = Boolean(
    isConnected &&
      walletNetworkReady &&
      contractsReady &&
      currentLoan?.state === 0 &&
      currentLoan?.borrower?.toLowerCase() === address?.toLowerCase() &&
      !writing
  );
  const myLoans = useMemo(
    () =>
      address
        ? loanPortfolio.loans.filter((loan) => loan.borrower?.toLowerCase() === address.toLowerCase())
        : [],
    [loanPortfolio.loans, address]
  );
  const selectedLoanProperty = currentLoan
    ? properties.find((property) => propertyKey(property.propertyId) === currentLoan.propertyId)
    : selectedProperty;
  const approvalTabs = [
    { id: "requested", state: 0, label: "requested" },
    { id: "approved", state: 1, label: "approved" },
    { id: "repaid", state: 2, label: "repaid" },
    { id: "rejected", state: 3, label: "rejected" },
    { id: "cancelled", state: 4, label: "cancelled" },
    { id: "all", state: null, label: "allLoans" }
  ];

  const deployedContractCount = ["propertyVerification", "complianceVerifier", "lending"].filter(
    (key) => contractHealth[key]?.deployed
  ).length;
  const readinessItems = [
    {
      label: t("rpcReady"),
      ready: rpcReady,
      detail: chainHealth.blockNumber !== null ? `block ${chainHealth.blockNumber.toString()}` : networkLabel
    },
    { label: t("oracleReady"), ready: oracleHealth.ok, detail: oracleHealth.checked ? "8787" : "..." },
    {
      label: t("contractsReadyLabel"),
      ready: fullContractsReady,
      detail: `${deployedContractCount}/3 ${t("deployedStatus")}`
    },
    {
      label: t("walletNetwork"),
      ready: isConnected && walletNetworkReady,
      detail: !isConnected ? t("noWallet") : walletNetworkReady ? networkLabel : t("wrongNetwork")
    }
  ];
  const readinessScore = readinessItems.filter((item) => item.ready).length;
  const isAdmin = Boolean(isOracleAdmin || isLendingAdmin);
  const isBorrower = Boolean(isConnected && ownedProperties.length > 0 && !isLoanOfficer && !isAdmin);
  const roleSummary = [
    isBorrower ? t("roleBorrower") : null,
    isOracleOperator ? t("roleOracle") : null,
    isLoanOfficer ? t("roleLoanOfficer") : null,
    isAdmin ? t("roleAdmin") : null
  ].filter(Boolean);

  const baseNavItems = [
    ...(isAdmin || !isConnected
      ? [{ id: "overview", icon: Home, label: "navOverview", title: "consoleTitle" }]
      : []),
    ...(isBorrower
      ? [
          { id: "properties", icon: Building2, label: "navMyProperties", title: "myPropertiesViewTitle" },
          { id: "verification", icon: Building2, label: "navVerification", title: "verificationViewTitle" },
          { id: "compliance", icon: ShieldCheck, label: "navCompliance", title: "complianceViewTitle" },
          { id: "loan", icon: CircleDollarSign, label: "navLoan", title: "loanViewTitle" }
        ]
      : []),
    ...(isLoanOfficer && !isAdmin
      ? [{ id: "approvals", icon: BadgeCheck, label: "navApprovals", title: "approvalViewTitle" }]
      : []),
    ...(isAdmin
      ? [{ id: "admin", icon: UserRoundCog, label: "navAdmin", title: "adminViewTitle" }]
      : []),
    ...(isAdmin ? [{ id: "contracts", icon: Cpu, label: "navContracts", title: "contractsViewTitle" }] : []),
    ...(isAdmin ? [{ id: "records", icon: ListChecks, label: "navRecords", title: "recordsViewTitle" }] : []),
    { id: "settings", icon: Settings, label: "navSettings", title: "settingsViewTitle" }
  ];
  const navItems = baseNavItems;
  const activeNav = navItems.find((item) => item.id === activeView) || navItems[0];

  useEffect(() => {
    if (!navItems.some((item) => item.id === activeView)) {
      setActiveView(navItems[0]?.id || "settings");
    }
  }, [activeView, navItems]);

  const stepItems = [
    {
      icon: Check,
      title: t("stepVerification"),
      subtitle: t("stepVerificationSub"),
      state: isVerified ? t("done") : busyAction === "Verification" ? t("inProgress") : t("waiting"),
      active: isVerified || busyAction === "Verification"
    },
    {
      icon: Check,
      title: t("stepCompliance"),
      subtitle: t("stepComplianceSub"),
      state: isCompliant ? t("done") : isVerified ? t("inProgress") : t("waiting"),
      active: isCompliant || isVerified
    },
    {
      icon: Send,
      title: t("stepLoan"),
      subtitle: t("stepLoanSub"),
      state: currentLoan ? loanStateLabel : isCompliant ? t("ready") : t("waiting"),
      active: Boolean(currentLoan || isCompliant)
    },
    {
      icon: BadgeCheck,
      title: t("stepApproval"),
      subtitle: t("stepApprovalSub"),
      state: currentLoan?.state === 2 ? t("done") : currentLoan?.state === 1 ? t("approved") : t("waiting"),
      active: Boolean(currentLoan?.state === 1 || currentLoan?.state === 2)
    }
  ];

  const latestOracleActivity = activity.find((item) => item.kind === "oracle");
  const latestChainActivity = activity.find((item) => item.kind === "chain");
  const statusLabels = {
    deployed: t("deployedStatus"),
    configured: t("configuredStatus"),
    unreachable: t("unreachableStatus"),
    missing: t("missingStatus")
  };
  const statusClass = {
    deployed: "success-text",
    configured: "warn-text",
    unreachable: "danger-text",
    missing: "warn-text"
  };
  const contractRows = [
    {
      name: t("propertyVerificationContract"),
      type: t("onChain"),
      status: contractHealth.propertyVerification?.status || (safePropertyVerificationAddress ? "configured" : "missing"),
      address: safePropertyVerificationAddress || "-",
      block: latestOracleActivity?.time || (chainHealth.blockNumber !== null ? chainHealth.blockNumber.toString() : "-"),
      tx: latestOracleActivity?.hash || "-"
    },
    {
      name: t("complianceVerifierContract"),
      type: t("onChain"),
      status: contractHealth.complianceVerifier?.status || (safeComplianceVerifierAddress ? "configured" : "missing"),
      address: safeComplianceVerifierAddress || "-",
      block: latestOracleActivity?.time || (chainHealth.blockNumber !== null ? chainHealth.blockNumber.toString() : "-"),
      tx: latestOracleActivity?.hash || "-"
    },
    {
      name: t("lendingContract"),
      type: t("onChain"),
      status: contractHealth.lending?.status || (safeLendingAddress ? "configured" : "missing"),
      address: safeLendingAddress || "-",
      block: latestChainActivity?.time || (chainHealth.blockNumber !== null ? chainHealth.blockNumber.toString() : "-"),
      tx: latestChainActivity?.hash || "-"
    },
    {
      name: t("oracleUpdate"),
      type: t("oracle"),
      status: oracleHealth.ok ? "deployed" : oracleHealth.checked ? "unreachable" : "missing",
      address: import.meta.env.VITE_ORACLE_API_URL || "http://localhost:8787",
      block: latestOracleActivity?.time || "-",
      tx: latestOracleActivity?.hash || "-"
    }
  ];

  const propertyChecks = [
    {
      label: t("registryMatch"),
      detail: selectedProperty?.propertyId || "-",
      ok: Boolean(selectedProperty)
    },
    {
      label: t("regionAllowed"),
      detail: selectedProperty?.region || "-",
      ok: allowedRegions.has(selectedProperty?.region)
    },
    {
      label: t("valuationAboveMinimum"),
      detail: formatCurrency(selectedProperty?.valuation),
      ok: propertyValue >= minimumValuation
    },
    {
      label: t("titleClear"),
      detail: selectedProperty?.noEncumbrance ? t("yes") : t("no"),
      ok: selectedProperty?.noEncumbrance === true
    },
    {
      label: t("activeRegistryStatus"),
      detail: selectedProperty?.status || "-",
      ok: selectedProperty?.status === "ACTIVE"
    }
  ];

  const verificationPassRate = properties.length
    ? Math.round((properties.filter(passesVerificationRules).length / properties.length) * 100)
    : 0;
  const loanStats = loanPortfolio.loans.reduce(
    (stats, loan) => {
      if (loan.state === 0) stats.requested += 1;
      if (loan.state === 1) stats.approved += 1;
      if (loan.state === 2) stats.repaid += 1;
      if (loan.state === 3) stats.rejected += 1;
      if (loan.state === 4) stats.cancelled += 1;
      if (loan.state === 0 || loan.state === 1) stats.activeProperties.add(loan.propertyId);
      return stats;
    },
    { requested: 0, approved: 0, repaid: 0, rejected: 0, cancelled: 0, activeProperties: new Set() }
  );
  const averageProofLatency = proofLatencySamples.length
    ? proofLatencySamples.reduce((sum, value) => sum + value, 0) / proofLatencySamples.length
    : 0;
  const averageGas = gasSamples.length
    ? gasSamples.reduce((sum, sample) => sum + Number(sample.gasUsed), 0) / gasSamples.length
    : 0;
  const latestGas = gasSamples[0]?.gasUsed;

  const loanDetailItems = [
    { label: t("loanId"), value: currentLoan ? `#${currentLoan.id.toString()}` : t("systemAssignedLoanId") },
    { label: t("propertyId"), value: selectedLoanProperty?.propertyId || "-" },
    { label: t("loanProperty"), value: currentLoan ? shortHash(currentLoan.propertyId) : shortHash(selectedKey) },
    { label: t("borrower"), value: currentLoan ? shortHash(currentLoan.borrower) : walletLabel },
    {
      label: t("proofAmount"),
      value: currentLoan ? t("hiddenOnChain") : proofPrincipal ? formatCurrency(proofPrincipal) : t("proofRequiredForLoan")
    },
    {
      label: t("principalCommitment"),
      value: currentLoan ? shortField(currentLoan.principalCommitment) : shortField(principalCommitment)
    },
    { label: t("interestRate"), value: currentLoan ? `${Number(currentLoan.interestRateBps) / 100}%` : "6.5%" },
    { label: t("term"), value: currentLoan ? `${Number(currentLoan.termDays)} ${t("days")}` : t("termValue") },
    {
      label: t("activeCollateralLock"),
      value: activeLoanExists ? `#${activeLoanId.toString()}` : t("none")
    },
    {
      label: t("proofBinding"),
      value: proofMatchesPrincipal ? t("matched") : t("notMatched")
    },
    { label: t("requestedAt"), value: currentLoan ? formatTimestamp(currentLoan.requestedAt) : "-" },
    { label: t("approvedAt"), value: currentLoan?.approvedAt ? formatTimestamp(currentLoan.approvedAt) : "-" },
    { label: t("repaidAt"), value: currentLoan?.repaidAt ? formatTimestamp(currentLoan.repaidAt) : "-" }
  ];

  function updateLanguage(nextLanguage) {
    setLanguage(nextLanguage);
    window.localStorage.setItem(LANG_STORAGE_KEY, nextLanguage);
  }

  function pushActivity(kind, message, hash) {
    setActivity((current) =>
      [
        {
          kind,
          message,
          hash,
          time: new Date().toLocaleTimeString()
        },
        ...current
      ].slice(0, 12)
    );
  }

  function recordGas(action, receipt) {
    if (!receipt?.gasUsed) return;
    setGasSamples((current) =>
      [
        {
          action,
          gasUsed: receipt.gasUsed,
          time: new Date().toLocaleTimeString()
        },
        ...current
      ].slice(0, 12)
    );
  }

  function selectLoanRecord(loan) {
    setSelectedLoanId(loan.id.toString());
    const matchedProperty = properties.find(
      (property) => propertyKey(property.propertyId) === loan.propertyId
    );
    if (matchedProperty) setSelectedId(matchedProperty.propertyId);
  }

  async function refreshChainState() {
    await Promise.allSettled([
      refetchRecord(),
      refetchNextLoanId(),
      refetchActiveLoan(),
      refetchPropertyLoanIds(),
      refetchOracleAdminRole(),
      refetchLendingAdminRole(),
      refetchLoanOfficerRole(),
      refetchOracleOperatorRole()
    ]);
  }

  useEffect(() => {
    if (activeView === "overview") {
      refreshChainState();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeView]);

  async function waitForReceipt(hash) {
    if (!publicClient || !hash) return;
    pushActivity("chain", t("waitingReceipt"), hash);
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    pushActivity("chain", t("transactionConfirmed"), hash);
    return receipt;
  }

  async function runOracle(path, payload, actionLabel) {
    setBusyAction(actionLabel);
    const startedAt = performance.now();
    try {
      const result = await postOracle(path, payload);
      if (actionLabel === "Compliance") {
        setProofLatencySamples((current) => [performance.now() - startedAt, ...current].slice(0, 12));
      }
      pushActivity(
        "oracle",
        actionLabel === "Verification" ? t("verificationCompleted") : t("complianceCompleted"),
        result.txHash
      );
      if (result.txHash && publicClient) {
        try {
          const receipt = await publicClient.getTransactionReceipt({ hash: result.txHash });
          recordGas(actionLabel, receipt);
        } catch (_error) {
          // The oracle already waited for the transaction server-side; missing receipts are non-blocking here.
        }
      }
      await refreshChainState();
      return result;
    } catch (error) {
      pushActivity("error", error.message);
      return null;
    } finally {
      setBusyAction("");
    }
  }

  async function handleVerification() {
    if (!canVerify) {
      pushActivity(
        "error",
        writeViaOracle && !contractHealth.propertyVerification?.deployed ? t("contractsMissing") : t("configHint")
      );
      return;
    }
    await runOracle(
      "/verify",
      {
        propertyId: selectedProperty.propertyId,
        write: writeViaOracle,
        network
      },
      "Verification"
    );
  }

  async function handleCompliance() {
    if (!canComply) {
      pushActivity(
        "error",
        !isVerified
          ? t("verificationRequired")
          : principalAmount <= 0n
            ? t("invalidPrincipal")
            : t("configHint")
      );
      return;
    }
    const result = await runOracle(
      "/compliance",
      {
        propertyId: selectedProperty.propertyId,
        loanPrincipal: principal,
        write: writeViaOracle,
        network
      },
      "Compliance"
    );
    if (result?.principalCommitment) {
      setPrincipalCommitment(result.principalCommitment);
      setProofPrincipal(principal);
      setProofPropertyKey(selectedKey || "");
    }
  }

  async function writeLoan(functionName, args, value = 0n) {
    if (!contractsReady) {
      pushActivity("error", t("contractsMissing"));
      return null;
    }
    setBusyAction(functionName);
    try {
      const hash = await writeContractAsync({
        address: safeLendingAddress,
        abi: lendingAbi,
        functionName,
        args,
        value,
        chainId: chainIdFor(network)
      });
      pushActivity("chain", `${functionName} ${t("txSubmitted")}`, hash);
      const receipt = await waitForReceipt(hash);
      recordGas(functionName, receipt);
      await refreshChainState();
      return hash;
    } catch (error) {
      pushActivity("error", error.shortMessage || error.message);
      return null;
    } finally {
      setBusyAction("");
    }
  }

  async function handleRequestLoan() {
    if (!canRequestLoan) {
      pushActivity(
        "error",
        principalAmount <= 0n
          ? t("invalidPrincipal")
          : !isVerified
            ? t("verificationRequired")
            : !isCompliant
              ? t("complianceRequired")
              : principalCommitmentAmount === 0n
                ? t("proofRequiredForLoan")
                : !proofMatchesPrincipal
                ? t("proofMismatch")
                  : activeLoanExists
                    ? t("activeLoanExists")
                    : !isSelectedOwned
                      ? t("notPropertyOwner")
                : t("walletHint")
      );
      return;
    }
    const requestedId = nextLoanId ?? 0n;
    const hash = await writeLoan("requestLoan", [selectedKey, principalCommitmentAmount]);
    if (hash) setSelectedLoanId(requestedId.toString());
  }

  async function handleApproveLoan() {
    if (!canApproveLoan) {
      pushActivity("error", currentLoan ? t("approvalUnavailable") : t("requestRequired"));
      return;
    }
    await writeLoan("approveLoan", [currentLoan.id]);
  }

  async function handleRejectLoan(loan = currentLoan) {
    if (!loan || !isLoanOfficer) {
      pushActivity("error", loan ? t("approvalUnavailable") : t("requestRequired"));
      return;
    }
    await writeLoan("rejectLoan", [loan.id]);
  }

  async function handleRepay() {
    if (!canRepayLoan) {
      pushActivity("error", currentLoan ? t("repayUnavailable") : t("requestRequired"));
      return;
    }
    await writeLoan("repay", [currentLoan.id]);
  }

  async function handleCancelLoan() {
    if (!canCancelLoan) {
      pushActivity("error", currentLoan ? t("cancelUnavailable") : t("requestRequired"));
      return;
    }
    await writeLoan("cancelLoan", [currentLoan.id]);
  }

  async function handleRoleUpdate() {
    if (!isValidAddress(roleAddress) || !isAdmin) {
      pushActivity("error", isAdmin ? t("invalidRoleAddress") : t("adminRequired"));
      return;
    }
    const isOracleTarget = roleTarget === "oracle";
    const targetContract = isOracleTarget ? safePropertyVerificationAddress : safeLendingAddress;
    const targetAbi = isOracleTarget ? propertyVerificationAbi : lendingAbi;
    const targetRole = isOracleTarget ? oracleRole : loanOfficerRole;

    if (!targetContract) {
      pushActivity("error", t("contractsMissing"));
      return;
    }

    setBusyAction("Role");
    try {
      const functionName = roleOperation === "grant" ? "grantRole" : "revokeRole";
      const hash = await writeContractAsync({
        address: targetContract,
        abi: targetAbi,
        functionName,
        args: [targetRole, roleAddress],
        chainId: chainIdFor(network)
      });
      pushActivity("chain", `${functionName} ${t("txSubmitted")}`, hash);
      const receipt = await waitForReceipt(hash);
      recordGas(functionName, receipt);
      await refreshChainState();
    } catch (error) {
      pushActivity("error", error.shortMessage || error.message);
    } finally {
      setBusyAction("");
    }
  }

  function renderReadinessPanel(compact = false) {
    return (
      <section className={`readiness-panel panel ${compact ? "compact" : ""}`}>
        <div>
          <strong>{t("readinessTitle")}</strong>
          <span>{compact ? `${readinessScore}/4 ${t("readyStatus")}` : t("walletHint")}</span>
        </div>
        <div className="readiness-grid">
          {readinessItems.map((item) => (
            <div className={`readiness-item ${item.ready ? "ready" : "missing"}`} key={item.label}>
              <Check size={16} />
              <span>{item.label}</span>
              <strong>{item.ready ? t("readyStatus") : t("missingStatus")}</strong>
              <small>{item.detail}</small>
            </div>
          ))}
        </div>
      </section>
    );
  }

  function renderAssetCard(compact = false) {
    return (
      <section className={`asset-card panel ${compact ? "compact" : ""}`}>
        <div className="asset-visual">
          <img src="/property-hero.png" alt="" />
          <span>{selectedProperty?.propertyId || "PROP-001"}</span>
        </div>
        <div className="asset-copy">
          <div className="asset-title-row">
            <h2>{t("assetTitle")}</h2>
            <label className="asset-select">
              <span>{t("chooseAsset")}</span>
              <select value={selectedId} onChange={(event) => setSelectedId(event.target.value)}>
                {visibleProperties.map((property) => (
                  <option value={property.propertyId} key={property.propertyId}>
                    {property.propertyId} · {property.address}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="asset-meta">
            <div>
              <Database size={24} />
              <span>{t("propertyId")}</span>
              <strong>{selectedProperty?.propertyId || "-"}</strong>
            </div>
            <div>
              <Network size={24} />
              <span>{t("propertyKey")}</span>
              <strong>{shortHash(selectedKey)}</strong>
            </div>
            <div>
              <Network size={24} />
              <span>{t("region")}</span>
              <strong>{selectedProperty?.region || "-"}</strong>
            </div>
            <div>
              <CircleDollarSign size={24} />
              <span>{t("valuation")}</span>
              <strong>{formatCurrency(selectedProperty?.valuation)}</strong>
            </div>
          </div>
          {!compact && (
            <p className="asset-address">
              {selectedProperty?.address || "-"} · {t("registryStatus")}: {selectedProperty?.status || "-"}
            </p>
          )}
          <div className="asset-status-row">
            <span className={`status-chip ${isVerified ? "green" : "muted"}`}>
              <ShieldCheck size={18} />
              {isVerified ? t("statusVerified") : t("statusUnverified")}
            </span>
            <span className={`status-chip ${isCompliant ? "green" : "muted"}`}>
              <Check size={18} />
              {isCompliant ? t("statusCompliant") : t("statusPending")}
            </span>
            <span className={`status-chip ${isVerified && isCompliant ? "blue" : "muted"}`}>
              <Zap size={18} />
              {t("loanEligible")}
            </span>
          </div>
        </div>
      </section>
    );
  }

  function renderStepsPanel(compact = false) {
    return (
      <section className={`steps-panel panel ${compact ? "compact" : ""}`}>
        {stepItems.map((step, index) => {
          const StepIcon = step.icon;
          return (
            <div className={`step-node ${step.active ? "active" : ""}`} key={step.title}>
              <div className="step-orb">
                <StepIcon size={compact ? 18 : 22} />
              </div>
              <div>
                <strong>{step.title}</strong>
                <span>{step.state}</span>
                {!compact && <small>{step.subtitle}</small>}
              </div>
              {index < stepItems.length - 1 && <i />}
            </div>
          );
        })}
      </section>
    );
  }

  function renderLoanActionButtons(className = "") {
    return (
      <div className={`button-grid ${className}`}>
        <button className="primary-action" onClick={handleRequestLoan} disabled={!canRequestLoan}>
          <Send size={17} />
          {t("submitLoan")}
        </button>
        <button className="outline-action wide" onClick={handleRepay} disabled={!canRepayLoan}>
          <CircleDollarSign size={17} />
          {t("repayLoan")}
        </button>
        <button className="outline-action wide" onClick={handleCancelLoan} disabled={!canCancelLoan}>
          <XCircle size={17} />
          {t("cancelLoan")}
        </button>
      </div>
    );
  }

  function renderProofPanel(compact = false) {
    return (
      <article className={`proof-panel panel ${compact ? "compact-card" : ""}`}>
        <div className="panel-heading">
          <h2>{t("complianceTitle")}</h2>
          <Info size={16} />
        </div>
        <div className="proof-content">
          <div className="shield-orbit">
            <LockKeyhole size={compact ? 32 : 42} />
          </div>
          <div className="proof-copy">
            <span>{t("ruleLabel")}</span>
            <strong>LTV ≤ 80%</strong>
            <small>{t("publicResult")}</small>
            <div className={`proof-status ${isCompliant ? "ok" : ""}`}>
              {isCompliant ? t("proofVerified") : t("statusPending")}
              <Check size={18} />
            </div>
            {!compact && (
              <>
                <small>{t("privateFields")}</small>
                <div className="private-fields">
                  <span>
                    <LockKeyhole size={15} />
                    {t("propertyValue")} ******
                  </span>
                  <span>
                    <LockKeyhole size={15} />
                    {t("loanAmount")} ******
                  </span>
                </div>
              </>
            )}
          </div>
        </div>
        {!compact && (
          <div className="privacy-note">
            <LockKeyhole size={16} />
            {t("privacyNote")}
          </div>
        )}
      </article>
    );
  }

  function renderLoanPanel(compact = false) {
    const activeLockLabel = activeLoanExists ? `#${activeLoanId.toString()}` : t("none");
    return (
      <article className={`loan-panel panel ${compact ? "compact-card" : ""}`}>
        <div className="panel-heading">
          <h2>{t("loanTitle")}</h2>
          <span className="status-chip amber">{approvalState}</span>
        </div>
        <div className="loan-fields">
          <div>
            <span>{t("proofAmount")}</span>
            <strong>{proofPrincipal ? formatCurrency(proofPrincipal) : t("proofRequiredForLoan")}</strong>
          </div>
          <div>
            <span>{t("loanId")}</span>
            <strong>{currentLoan ? `#${currentLoan.id.toString()}` : t("systemAssignedLoanId")}</strong>
          </div>
          <div>
            <span>{t("proofBinding")}</span>
            <strong className={proofMatchesPrincipal ? "green-text" : "warn-text"}>
              {proofMatchesPrincipal ? t("matched") : t("notMatched")}
            </strong>
          </div>
          <div>
            <span>{t("propertyKey")}</span>
            <strong>{shortHash(selectedKey)}</strong>
          </div>
          <div>
            <span>{t("interestRate")}</span>
            <strong>6.5%</strong>
          </div>
          <div>
            <span>{t("term")}</span>
            <strong>{t("termValue")}</strong>
          </div>
          <div>
            <span>{t("loanState")}</span>
            <strong>{loanStateLabel}</strong>
          </div>
          <div>
            <span>{t("currentLoan")}</span>
            <strong>{currentLoan ? formatTimestamp(currentLoan.requestedAt) : "-"}</strong>
          </div>
          <div>
            <span>{t("activeCollateralLock")}</span>
            <strong>{activeLockLabel}</strong>
          </div>
        </div>
        {!proofMatchesPrincipal && (
          <p className="helper-copy compact-note warn-text">{t("regenerateProofHint")}</p>
        )}
        {activeLoanExists && (
          <p className="helper-copy compact-note warn-text">{t("activeLoanLockHint")}</p>
        )}
        {!compact && <p className="helper-copy compact-note">{t("loanWorkflowNote")}</p>}
        {renderLoanActionButtons(compact ? "compact-actions" : "")}
      </article>
    );
  }

  function renderActivityTable() {
    return (
      <section className="activity-panel panel">
        <div className="panel-heading">
          <h2>{t("contractActivity")}</h2>
          <button className="icon-only" onClick={() => refreshChainState()} title={t("refresh")}>
            {fetchingRecord ? <Loader2 className="spin" size={17} /> : <RefreshCw size={17} />}
          </button>
        </div>
        <div className="activity-table">
          <div className="table-head">
            <span>{t("contract")}</span>
            <span>{t("type")}</span>
            <span>{t("network")}</span>
            <span>{t("state")}</span>
            <span>{t("latestBlock")}</span>
            <span>{t("latestTx")}</span>
          </div>
          {contractRows.map((row) => (
            <div className="table-row" key={row.name}>
              <strong>{row.name}</strong>
              <span className="mini-pill">{row.type}</span>
              <span>{networkLabel}</span>
              <span className={statusClass[row.status] || "warn-text"}>
                {statusLabels[row.status] || row.status}
              </span>
              <span>{row.block}</span>
              <span>{shortHash(row.tx)}</span>
            </div>
          ))}
        </div>
      </section>
    );
  }

  function renderRecordCard() {
    return (
      <article className="record-card panel">
        <div className="panel-heading">
          <h2>{t("onChainRecord")}</h2>
          <Activity size={16} />
        </div>
        <dl className="record-list">
          <div>
            <dt>{t("propertyKey")}</dt>
            <dd>{shortHash(selectedKey)}</dd>
          </div>
          <div>
            <dt>{t("statusVerified")}</dt>
            <dd>{isVerified ? t("yes") : t("no")}</dd>
          </div>
          <div>
            <dt>{t("statusCompliant")}</dt>
            <dd>{isCompliant ? t("yes") : t("no")}</dd>
          </div>
          <div>
            <dt>{t("evidence")}</dt>
            <dd>{formattedRecord.evidenceHash}</dd>
          </div>
          <div>
            <dt>{t("valuationCommitment")}</dt>
            <dd>{formattedRecord.valuationCommitment}</dd>
          </div>
          <div>
            <dt>{t("principalCommitment")}</dt>
            <dd>{formattedRecord.principalCommitment}</dd>
          </div>
          <div>
            <dt>{t("proof")}</dt>
            <dd>{formattedRecord.complianceHash}</dd>
          </div>
          <div>
            <dt>{t("updated")}</dt>
            <dd>{formattedRecord.lastUpdated}</dd>
          </div>
        </dl>
      </article>
    );
  }

  function renderActivityFeed(limit = 6) {
    return (
      <article className="activity-feed-card panel">
        <div className="panel-heading">
          <h2>{t("activityFeed")}</h2>
          <Activity size={16} />
        </div>
        <div className="activity-feed">
          {activity.length === 0 ? (
            <p>{t("noActivity")}</p>
          ) : (
            activity.slice(0, limit).map((item, index) => (
              <div className={`feed-item ${item.kind}`} key={`${item.time}-${index}`}>
                <span>{item.time}</span>
                <strong>{item.message}</strong>
                {item.hash && <small>{shortHash(item.hash)}</small>}
              </div>
            ))
          )}
        </div>
      </article>
    );
  }

  function renderLoanTable(limit = 8) {
    const rows = loanPortfolio.loans.slice(0, limit);
    const stateKeys = ["requested", "approved", "repaid", "rejected", "cancelled"];

    return (
      <article className="loan-table-card panel">
        <div className="panel-heading">
          <h2>{t("loanBook")}</h2>
          <CircleDollarSign size={16} />
        </div>
        <div className="loan-table">
          <div className="loan-table-head">
            <span>{t("loanId")}</span>
            <span>{t("loanProperty")}</span>
            <span>{t("borrower")}</span>
            <span>{t("state")}</span>
            <span>{t("requestedAt")}</span>
          </div>
          {rows.length === 0 ? (
            <p>{loanPortfolio.loading ? t("loading") : t("noLoan")}</p>
          ) : (
            rows.map((loan) => (
              <div className="loan-table-row" key={loan.id.toString()}>
                <strong>#{loan.id.toString()}</strong>
                <span>{shortHash(loan.propertyId)}</span>
                <span>{shortHash(loan.borrower)}</span>
                <span>{t(stateKeys[loan.state] || "loanReadError")}</span>
                <span>{formatTimestamp(loan.requestedAt)}</span>
              </div>
            ))
          )}
        </div>
      </article>
    );
  }

  function renderMyProperties() {
    const rows = visibleProperties;
    return (
      <div className="workspace-view view-scroll">
        <section className="view-grid two-col">
          {renderAssetCard()}
          <article className="operation-panel panel">
            <div className="panel-heading">
              <h2>{t("myProperties")}</h2>
              <Building2 size={16} />
            </div>
            <div className="property-list">
              {rows.length === 0 ? (
                <p className="helper-copy">{isConnected ? t("noOwnedProperties") : t("connectToSeeProperties")}</p>
              ) : (
                rows.map((property) => {
                  const key = propertyKey(property.propertyId);
                  return (
                    <button
                      className={`property-row ${selectedId === property.propertyId ? "active" : ""}`}
                      key={property.propertyId}
                      onClick={() => setSelectedId(property.propertyId)}
                    >
                      <strong>{property.propertyId}</strong>
                      <span>{property.address}</span>
                      <small>{t("propertyKey")}: {shortHash(key)}</small>
                    </button>
                  );
                })
              )}
            </div>
          </article>
        </section>
        <section className="view-grid two-col lower">
          {renderRecordCard()}
          {renderMyLoanLedger()}
        </section>
      </div>
    );
  }

  function renderMyLoanLedger() {
    const stateKeys = ["requested", "approved", "repaid", "rejected", "cancelled"];
    return (
      <article className="loan-table-card panel">
        <div className="panel-heading">
          <h2>{t("myLoans")}</h2>
          <CircleDollarSign size={16} />
        </div>
        <div className="loan-table my-loan-table">
          <div className="loan-table-head my-loan-row">
            <span>{t("loanId")}</span>
            <span>{t("propertyId")}</span>
            <span>{t("loanProperty")}</span>
            <span>{t("state")}</span>
            <span>{t("requestedAt")}</span>
            <span>{t("principalCommitment")}</span>
          </div>
          {myLoans.length === 0 ? (
            <p>{loanPortfolio.loading ? t("loading") : t("noBorrowerLoans")}</p>
          ) : (
            myLoans.map((loan) => {
              const ledgerProperty = properties.find((property) => propertyKey(property.propertyId) === loan.propertyId);
              return (
              <button
                className={`loan-table-row my-loan-row selectable ${selectedLoanId === loan.id.toString() ? "active" : ""}`}
                key={loan.id.toString()}
                onClick={() => selectLoanRecord(loan)}
              >
                <strong>#{loan.id.toString()}</strong>
                <span>{ledgerProperty?.propertyId || "-"}</span>
                <span>{shortHash(loan.propertyId)}</span>
                <span>{t(stateKeys[loan.state] || "loanReadError")}</span>
                <span>{formatTimestamp(loan.requestedAt)}</span>
                <span>{shortField(loan.principalCommitment)}</span>
              </button>
              );
            })
          )}
        </div>
      </article>
    );
  }

  function renderApprovals() {
    const activeTab = approvalTabs.find((tab) => tab.id === approvalFilter) || approvalTabs[0];
    const filteredLoans = activeTab.state === null
      ? loanPortfolio.loans
      : loanPortfolio.loans.filter((loan) => loan.state === activeTab.state);
    const stateKeys = ["requested", "approved", "repaid", "rejected", "cancelled"];
    return (
      <div className="workspace-view view-scroll">
        <section className="view-grid two-col">
          <article className="loan-table-card panel">
            <div className="panel-heading">
              <h2>{t("loanOfficerWorkbench")}</h2>
              <BadgeCheck size={16} />
            </div>
            <div className="approval-tabs">
              {approvalTabs.map((tab) => (
                <button
                  className={approvalFilter === tab.id ? "active" : ""}
                  key={tab.id}
                  onClick={() => setApprovalFilter(tab.id)}
                >
                  {t(tab.label)}
                </button>
              ))}
            </div>
            <div className="approval-list">
              {filteredLoans.length === 0 ? (
                <p className="helper-copy">{loanPortfolio.loading ? t("loading") : t("noLoansForStatus")}</p>
              ) : (
                filteredLoans.map((loan) => {
                  const matchedProperty = properties.find(
                    (property) => propertyKey(property.propertyId) === loan.propertyId
                  );
                  return (
                  <button
                    className={`approval-row ${selectedLoanId === loan.id.toString() ? "active" : ""}`}
                    key={loan.id.toString()}
                    onClick={() => selectLoanRecord(loan)}
                  >
                    <strong>#{loan.id.toString()}</strong>
                    <span>{matchedProperty?.propertyId || "-"} · {t(stateKeys[loan.state] || "loanReadError")}</span>
                    <span>{t("loanProperty")}: {shortHash(loan.propertyId)}</span>
                    <small>{t("borrower")}: {shortHash(loan.borrower)}</small>
                  </button>
                  );
                })
              )}
            </div>
          </article>
          <article className="operation-panel panel">
            <div className="panel-heading">
              <h2>{t("approvalDecision")}</h2>
              <CircleDollarSign size={16} />
            </div>
            <dl className="detail-list">
              {loanDetailItems.map((item) => (
                <div key={item.label}>
                  <dt>{item.label}</dt>
                  <dd>{item.value}</dd>
                </div>
              ))}
            </dl>
            {currentLoan?.state === 0 ? (
              <div className="view-actions-row">
                <button className="gold-action" onClick={handleApproveLoan} disabled={!canApproveLoan}>
                  <BadgeCheck size={17} />
                  {t("approveLoan")}
                </button>
                <button className="outline-action" onClick={() => handleRejectLoan()} disabled={!canRejectLoan}>
                  <XCircle size={17} />
                  {t("rejectLoan")}
                </button>
              </div>
            ) : (
              <p className="helper-copy">{t("readOnlyLoanStatus")}</p>
            )}
          </article>
        </section>
        {renderActivityFeed(8)}
      </div>
    );
  }

  function renderAdmin() {
    return (
      <div className="workspace-view view-scroll">
        <section className="view-grid two-col">
          <article className="operation-panel panel">
            <div className="panel-heading">
              <h2>{t("roleManagement")}</h2>
              <UserRoundCog size={16} />
            </div>
            <div className="settings-list">
              <label>
                <span>{t("roleTarget")}</span>
                <select value={roleTarget} onChange={(event) => setRoleTarget(event.target.value)}>
                  <option value="loanOfficer">{t("roleLoanOfficer")}</option>
                  <option value="oracle">{t("roleOracle")}</option>
                </select>
              </label>
              <label>
                <span>{t("roleOperation")}</span>
                <select value={roleOperation} onChange={(event) => setRoleOperation(event.target.value)}>
                  <option value="grant">{t("grantRole")}</option>
                  <option value="revoke">{t("revokeRole")}</option>
                </select>
              </label>
              <label className="full-row">
                <span>{t("roleAddress")}</span>
                <input value={roleAddress} onChange={(event) => setRoleAddress(event.target.value)} />
              </label>
            </div>
            <div className="view-actions-row">
              <button className="primary-action" onClick={handleRoleUpdate} disabled={!isAdmin || busyAction === "Role"}>
                {busyAction === "Role" ? <Loader2 className="spin" size={17} /> : <UserRoundCog size={17} />}
                {t("applyRoleChange")}
              </button>
            </div>
          </article>
          <article className="operation-panel panel">
            <div className="panel-heading">
              <h2>{t("adminStatus")}</h2>
              <ShieldCheck size={16} />
            </div>
            <dl className="detail-list">
              <div>
                <dt>{t("currentWallet")}</dt>
                <dd>{address || "-"}</dd>
              </div>
              <div>
                <dt>{t("roleAdmin")}</dt>
                <dd>{configuredAdminAddress || (isAdmin ? t("yes") : t("no"))}</dd>
              </div>
              <div>
                <dt>{t("roleOracle")}</dt>
                <dd>{configuredOracleAddress || "-"}</dd>
              </div>
              <div>
                <dt>{t("roleLoanOfficer")}</dt>
                <dd>{configuredLoanOfficerAddress || (isLoanOfficer ? t("yes") : t("no"))}</dd>
              </div>
              <div>
                <dt>{t("propertyVerificationContract")}</dt>
                <dd>{safePropertyVerificationAddress || "-"}</dd>
              </div>
              <div>
                <dt>{t("lendingContract")}</dt>
                <dd>{safeLendingAddress || "-"}</dd>
              </div>
            </dl>
          </article>
        </section>
        {renderActivityTable()}
      </div>
    );
  }

  function renderOverview() {
    return (
      <div className="workspace-view overview-view">
        {renderReadinessPanel()}
        <section className="overview-kpi-grid">
          <article className="metric-card panel">
            <div className="panel-heading">
              <h2>{t("portfolioStatus")}</h2>
              <Activity size={16} />
            </div>
            <strong className="big-number">{readinessScore}/4</strong>
            <span>{t("runtimeChecks")}</span>
          </article>
          <article className="metric-card panel">
            <div className="panel-heading">
              <h2>{t("requestedLoans")}</h2>
              <Send size={16} />
            </div>
            <strong className="big-number">{loanStats.requested}</strong>
            <span>{t("currentlyPending")}</span>
          </article>
          <article className="metric-card panel blue">
            <div className="panel-heading">
              <h2>{t("issuedLoans")}</h2>
              <BadgeCheck size={16} />
            </div>
            <strong className="big-number">{loanStats.approved}</strong>
            <span>{t("activeApproved")}</span>
          </article>
          <article className="metric-card panel">
            <div className="panel-heading">
              <h2>{t("activeCollateral")}</h2>
              <Building2 size={16} />
            </div>
            <strong className="big-number">{loanStats.activeProperties.size}</strong>
            <span>{t("lockedAssets")}</span>
          </article>
          <article className="metric-card panel">
            <div className="panel-heading">
              <h2>{t("verificationPassRate")}</h2>
              <ShieldCheck size={16} />
            </div>
            <strong className="big-number">{verificationPassRate}%</strong>
            <span>{t("mockRegistry")}</span>
          </article>
          <article className="metric-card panel purple">
            <div className="panel-heading">
              <h2>{t("proofLatency")}</h2>
              <ShieldCheck size={16} />
            </div>
            <strong className="big-number">
              {averageProofLatency ? `${(averageProofLatency / 1000).toFixed(2)}s` : "-"}
            </strong>
            <span>{t("sessionAverage")}</span>
          </article>
          <article className="metric-card panel blue">
            <div className="panel-heading">
              <h2>{t("gasUsed")}</h2>
              <Cpu size={16} />
            </div>
            <strong className="big-number">{latestGas ? `${Number(latestGas).toLocaleString()}` : "-"}</strong>
            <span>{averageGas ? `${t("avgGas")} ${Math.round(averageGas).toLocaleString()}` : t("sessionMetric")}</span>
          </article>
          <article className="metric-card panel">
            <div className="panel-heading">
              <h2>{t("closedLoans")}</h2>
              <ListChecks size={16} />
            </div>
            <strong className="big-number">{loanStats.repaid + loanStats.rejected + loanStats.cancelled}</strong>
            <span>{t("repaidRejectedCancelled")}</span>
          </article>
        </section>
        <section className="view-grid two-col lower">
          {renderLoanTable(6)}
          {renderActivityFeed(6)}
        </section>
      </div>
    );
  }

  function renderVerification() {
    return (
      <div className="workspace-view view-scroll">
        <section className="view-grid two-col">
          {renderAssetCard()}
          <article className="operation-panel panel">
            <div className="panel-heading">
              <h2>{t("verificationRules")}</h2>
              <FileCheck2 size={16} />
            </div>
            <div className="check-list">
              {propertyChecks.map((check) => (
                <div className={check.ok ? "pass" : "fail"} key={check.label}>
                  <Check size={17} />
                  <span>{check.label}</span>
                  <strong>{check.detail}</strong>
                </div>
              ))}
            </div>
            <div className="view-actions-row">
              <button
                className="primary-action"
                onClick={handleVerification}
                disabled={!canVerify || busyAction === "Verification"}
              >
                {busyAction === "Verification" ? <Loader2 className="spin" size={17} /> : <FileCheck2 size={17} />}
                {t("runVerification")}
              </button>
              <button className="outline-action" onClick={() => refreshChainState()}>
                <RefreshCw size={17} />
                {t("refresh")}
              </button>
            </div>
          </article>
        </section>
        <section className="view-grid two-col lower">
          {renderRecordCard()}
          {renderActivityFeed()}
        </section>
      </div>
    );
  }

  function renderCompliance() {
    return (
      <div className="workspace-view view-scroll">
        <section className="view-grid two-col">
          {renderProofPanel()}
          <article className="operation-panel panel">
            <div className="panel-heading">
              <h2>{t("complianceCalculator")}</h2>
              <ShieldCheck size={16} />
            </div>
            <div className="ltv-meter">
              <div>
                <span>{t("currentLtv")}</span>
                <strong className={ltvSafe ? "green-text" : "warn-text"}>{ltvPercent.toFixed(1)}%</strong>
              </div>
              <div className="meter-track">
                <span style={{ width: `${Math.min(100, ltvPercent)}%` }} />
              </div>
              <small>{t("maxBorrow")}: {formatCurrency(maxPrincipal)}</small>
            </div>
            <div className="loan-fields single">
              <label>
                <span>{t("principal")}</span>
                <input
                  value={principal}
                  inputMode="numeric"
                  onChange={(event) => setPrincipal(event.target.value.replace(/\D/g, "") || "0")}
                />
              </label>
              <label className="toggle-row">
                <input
                  type="checkbox"
                  checked={writeViaOracle}
                  onChange={(event) => setWriteViaOracle(event.target.checked)}
                />
                <span>{t("oracleWrites")}</span>
              </label>
            </div>
            <div className="view-actions-row">
              <button
                className="primary-action"
                onClick={handleCompliance}
                disabled={!canComply || busyAction === "Compliance"}
              >
                {busyAction === "Compliance" ? <Loader2 className="spin" size={17} /> : <ShieldCheck size={17} />}
                {t("generateProof")}
              </button>
            </div>
          </article>
        </section>
        <section className="view-grid two-col lower">
          {renderRecordCard()}
          {renderActivityFeed()}
        </section>
      </div>
    );
  }

  function renderLoan() {
    return (
      <div className="workspace-view view-scroll">
        <section className="view-grid two-col">
          {renderAssetCard()}
          {renderLoanPanel()}
        </section>
        <section className="view-grid two-col lower">
          <article className="operation-panel panel">
            <div className="panel-heading">
              <h2>{t("loanDetails")}</h2>
              <CircleDollarSign size={16} />
            </div>
            <dl className="detail-list">
              {loanDetailItems.map((item) => (
                <div key={item.label}>
                  <dt>{item.label}</dt>
                  <dd>{item.value}</dd>
                </div>
              ))}
            </dl>
          </article>
          {renderMyLoanLedger()}
        </section>
        {renderStepsPanel()}
      </div>
    );
  }

  function renderContracts() {
    return (
      <div className="workspace-view view-scroll">
        {renderReadinessPanel()}
        <section className="view-grid three-col">
          {contractRows.slice(0, 3).map((row) => (
            <article className="address-card panel" key={row.name}>
              <div className="panel-heading">
                <h2>{row.name}</h2>
                <Cpu size={16} />
              </div>
              <span className={statusClass[row.status] || "warn-text"}>
                {statusLabels[row.status] || row.status}
              </span>
              <strong>{shortHash(row.address)}</strong>
              <small>{row.address}</small>
            </article>
          ))}
        </section>
        {renderActivityTable()}
      </div>
    );
  }

  function renderRecords() {
    return (
      <div className="workspace-view view-scroll">
        <section className="view-grid two-col">
          {renderRecordCard()}
          {renderLoanTable(10)}
        </section>
        {renderActivityFeed(8)}
        {renderActivityTable()}
      </div>
    );
  }

  function renderSettings() {
    return (
      <div className="workspace-view view-scroll">
        <section className="view-grid two-col">
          <article className="operation-panel panel">
            <div className="panel-heading">
              <h2>{t("settingsViewTitle")}</h2>
              <Settings size={16} />
            </div>
            <div className="settings-list">
              <label>
                <span>{t("languagePreference")}</span>
                <div className="language-toggle inline">
                  <Languages size={17} />
                  <button className={language === "zh" ? "active" : ""} onClick={() => updateLanguage("zh")}>
                    中文
                  </button>
                  <button className={language === "en" ? "active" : ""} onClick={() => updateLanguage("en")}>
                    EN
                  </button>
                </div>
              </label>
              <label>
                <span>{t("networkPreference")}</span>
                <select value={network} onChange={(event) => setNetwork(event.target.value)}>
                  <option value="localhost">{t("local")}</option>
                  <option value="sepolia">{t("sepolia")}</option>
                </select>
              </label>
              <label className="toggle-row setting-toggle">
                <input
                  type="checkbox"
                  checked={writeViaOracle}
                  onChange={(event) => setWriteViaOracle(event.target.checked)}
                />
                <span>{t("oracleWrites")}</span>
              </label>
            </div>
          </article>
          <article className="operation-panel panel">
            <div className="panel-heading">
              <h2>{t("demoSetup")}</h2>
              <ListChecks size={16} />
            </div>
            <div className="command-list">
              <code>pnpm chain:local</code>
              <code>pnpm demo:deploy</code>
              <code>pnpm oracle:api</code>
              <code>pnpm frontend:dev</code>
              <code>pnpm demo:check</code>
            </div>
            <p className="helper-copy">{t("walletHint")}</p>
          </article>
        </section>
        {renderReadinessPanel()}
      </div>
    );
  }

  function renderActiveView() {
    if (activeView === "properties") return renderMyProperties();
    if (activeView === "verification") return renderVerification();
    if (activeView === "compliance") return renderCompliance();
    if (activeView === "loan") return renderLoan();
    if (activeView === "approvals") return renderApprovals();
    if (activeView === "admin") return renderAdmin();
    if (activeView === "contracts") return renderContracts();
    if (activeView === "records") return renderRecords();
    if (activeView === "settings") return renderSettings();
    return renderOverview();
  }

  return (
    <main className={`dashboard-shell active-${activeView}`}>
      <aside className="sidebar">
        <div className="brand-lockup">
          <div className="brand-mark">
            <Building2 size={24} />
          </div>
          <strong>{t("appTitle")}</strong>
        </div>

        <nav className="side-nav" aria-label="Dashboard navigation">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <button
                className={`nav-item ${activeView === item.id ? "active" : ""}`}
                key={item.id}
                onClick={() => setActiveView(item.id)}
              >
                <Icon size={20} />
                <span>{t(item.label)}</span>
              </button>
            );
          })}
        </nav>

        <div className="sidebar-card">
          <div className="sidebar-card-title">
            <ShieldCheck size={17} />
            <strong>{t("workspaceStatus")}</strong>
          </div>
          <p>{roleSummary.length ? roleSummary.join(" · ") : t("roleViewer")}</p>
          <p>{isConnected ? walletLabel : t("connectWallet")}</p>
          <div className="network-pill">
            <Network size={16} />
            {networkLabel}
            <span />
          </div>
        </div>
      </aside>

      <section className="main-stage">
        <header className="topbar">
          <div>
            <p className="eyebrow">{t("appTitle")} · {t(activeNav.label)}</p>
            <h1>{t(activeNav.title)}</h1>
          </div>
          <div className="topbar-actions">
            <label className="select-shell">
              <Network size={17} />
              <select value={network} onChange={(event) => setNetwork(event.target.value)}>
                <option value="localhost">{t("local")}</option>
                <option value="sepolia">{t("sepolia")}</option>
              </select>
              <ChevronDown size={16} />
            </label>
            <div className="language-toggle" aria-label={t("language")}>
              <Languages size={17} />
              <button className={language === "zh" ? "active" : ""} onClick={() => updateLanguage("zh")}>
                中文
              </button>
              <button className={language === "en" ? "active" : ""} onClick={() => updateLanguage("en")}>
                EN
              </button>
            </div>
            {isConnected ? (
              <button className="wallet-button" onClick={() => disconnect()} title={t("disconnectWallet")}>
                <span className="wallet-avatar" />
                {walletLabel}
                <small>{t("connected")}</small>
                <ChevronDown size={16} />
              </button>
            ) : (
              <button
                className="wallet-button primary"
                onClick={() => connectors[0] && connect({ connector: connectors[0] })}
                disabled={connecting || !connectors[0]}
                title={t("connectWallet")}
              >
                <Wallet size={18} />
                {connecting ? t("connecting") : walletLabel}
              </button>
            )}
          </div>
        </header>

        {renderActiveView()}
      </section>
    </main>
  );
}

export default App;
