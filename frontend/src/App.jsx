import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  BadgeCheck,
  Building2,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleDollarSign,
  Cpu,
  Database,
  FileCheck2,
  Home,
  ListChecks,
  Loader2,
  LockKeyhole,
  Network,
  RefreshCw,
  Send,
  Settings,
  ShieldCheck,
  UserRoundCog,
  WalletCards,
  XCircle
} from "lucide-react";
import {
  useAccount,
  useChainId,
  useConnect,
  useDisconnect,
  usePublicClient,
  useReadContract,
  useSwitchChain,
  useWatchContractEvent,
  useWriteContract
} from "wagmi";
import { hardhat, sepolia } from "wagmi/chains";
import localhostDeployment from "../../deployments/localhost.json";
import sepoliaDeployment from "../../deployments/sepolia.json";
import { lendingAbi, propertyVerificationAbi } from "./contracts/abis";
import { getOracleHealth, getPropertiesByOwner, getPropertiesForRole, postOracle } from "./lib/api";
import { formatRecord, propertyKey, roleKey, shortField, shortHash } from "./lib/chain";
import { detectInitialLanguage, LANG_STORAGE_KEY, translations } from "./lib/i18n";
import { LanguageToggle, NetworkSelector, WalletButton } from "./components/common/Controls";
import { DetailList } from "./components/common/DataTable";
import { LoanLedger } from "./components/domain/LoanLedger";
import { WalletGate } from "./components/layout/WalletGate";

const deploymentByNetwork = {
  localhost: localhostDeployment,
  sepolia: sepoliaDeployment
};
const defaultNetwork = deploymentByNetwork[import.meta.env.VITE_DEFAULT_NETWORK]
  ? import.meta.env.VITE_DEFAULT_NETWORK
  : "localhost";
const allowedRegions = new Set(["SG-CCR", "SG-RCR", "SG-OCR"]);
const minimumValuation = 200000;
const defaultAdminRole = "0x0000000000000000000000000000000000000000000000000000000000000000";
const oracleRole = roleKey("ORACLE_ROLE");
const complianceRole = roleKey("COMPLIANCE_ROLE");
const loanOfficerRole = roleKey("LOAN_OFFICER_ROLE");

function chainIdFor(network) {
  return network === "sepolia" ? sepolia.id : hardhat.id;
}

function isValidAddress(value) {
  return /^0x[a-fA-F0-9]{40}$/.test(value || "");
}

function addressOrFallback(value, fallback) {
  return isValidAddress(value) ? value : fallback;
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
  const [ownedProperties, setOwnedProperties] = useState([]);
  const [privilegedProperties, setPrivilegedProperties] = useState([]);
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
  const [refreshNonce, setRefreshNonce] = useState(0);
  const [txPhase, setTxPhase] = useState("");
  const [chainRecords, setChainRecords] = useState({ loading: false, rows: [] });
  const [roleAudit, setRoleAudit] = useState({ loading: false, rows: [] });
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [workspaceEntered, setWorkspaceEntered] = useState(false);
  const [verificationDialog, setVerificationDialog] = useState(null);
  const [complianceDialog, setComplianceDialog] = useState(null);

  const { address, isConnected } = useAccount();
  const walletChainId = useChainId();
  const { connect, connectors, isPending: connecting } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChainAsync, isPending: switchingChain } = useSwitchChain();
  const { writeContractAsync, isPending: writing } = useWriteContract();
  const publicClient = usePublicClient({ chainId: chainIdFor(network) });
  const networkDeployment = deploymentByNetwork[network] || deploymentByNetwork[defaultNetwork];
  const useEnvDeployment = network === defaultNetwork;
  const propertyVerificationAddress = useEnvDeployment
    ? addressOrFallback(import.meta.env.VITE_PROPERTY_VERIFICATION_ADDRESS, networkDeployment.propertyVerification)
    : networkDeployment.propertyVerification;
  const complianceVerifierAddress = useEnvDeployment
    ? addressOrFallback(import.meta.env.VITE_COMPLIANCE_VERIFIER_ADDRESS, networkDeployment.complianceVerifier)
    : networkDeployment.complianceVerifier;
  const lendingAddress = useEnvDeployment
    ? addressOrFallback(import.meta.env.VITE_LENDING_ADDRESS, networkDeployment.lending)
    : networkDeployment.lending;
  const configuredAdminAddress = useEnvDeployment
    ? addressOrFallback(import.meta.env.VITE_ADMIN_ADDRESS, networkDeployment.adminAddress)
    : networkDeployment.adminAddress;
  const configuredOracleAddress = useEnvDeployment
    ? addressOrFallback(import.meta.env.VITE_ORACLE_ADDRESS, networkDeployment.oracleAddress)
    : networkDeployment.oracleAddress;
  const configuredLoanOfficerAddress = useEnvDeployment
    ? addressOrFallback(import.meta.env.VITE_LOAN_OFFICER_ADDRESS, networkDeployment.loanOfficerAddress)
    : networkDeployment.loanOfficerAddress;
  const safePropertyVerificationAddress = isValidAddress(propertyVerificationAddress)
    ? propertyVerificationAddress
    : undefined;
  const safeComplianceVerifierAddress = isValidAddress(complianceVerifierAddress)
    ? complianceVerifierAddress
    : undefined;
  const safeLendingAddress = isValidAddress(lendingAddress) ? lendingAddress : undefined;

  useEffect(() => {
    document.title = t("appTitle");
    document.documentElement.lang = language === "zh" ? "zh-CN" : "en";
  }, [language]);

  useEffect(() => {
    let mounted = true;
    if (!isConnected || !address) {
      setOwnedProperties([]);
      return () => {
        mounted = false;
      };
    }
    getPropertiesByOwner(address, network).then((items) => {
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
  }, [address, isConnected, refreshNonce, network]);

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

  const visibleProperties = useMemo(
    () => (isConnected ? ownedProperties : []),
    [isConnected, ownedProperties]
  );
  const selectedProperty = useMemo(
    () =>
      visibleProperties.find((property) => property.propertyId === selectedId) ||
      visibleProperties[0] ||
      null,
    [selectedId, visibleProperties]
  );
  const knownProperties = useMemo(() => {
    const byId = new Map();
    for (const property of [...ownedProperties, ...privilegedProperties]) {
      byId.set(property.propertyId, property);
    }
    return Array.from(byId.values());
  }, [ownedProperties, privilegedProperties]);
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
  const lendingReady = Boolean(contractHealth.lending?.deployed);
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

  const targetRole = roleTarget === "oracle" ? oracleRole : loanOfficerRole;
  const targetRoleContract = roleTarget === "oracle" ? safePropertyVerificationAddress : safeLendingAddress;
  const targetRoleAbi = roleTarget === "oracle" ? propertyVerificationAbi : lendingAbi;
  const { data: targetHasRole = false, refetch: refetchTargetRole } = useReadContract({
    address: targetRoleContract,
    abi: targetRoleAbi,
    functionName: "hasRole",
    args: isValidAddress(roleAddress) ? [targetRole, roleAddress] : undefined,
    chainId: chainIdFor(network),
    query: {
      enabled: Boolean(targetRoleContract && isValidAddress(roleAddress))
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
        const selected = activeLoanExists ? activeLoanId : null;
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
  }, [propertyLoanIds, publicClient, network, activeLoanExists, activeLoanId, refreshNonce]);

  const selectedLoan = useMemo(() => {
    const targetId = selectedLoanId ?? (activeLoanExists ? activeLoanId.toString() : null);
    if (targetId) {
      const portfolioLoan = loanPortfolio.loans.find((loan) => loan.id.toString() === targetId);
      if (portfolioLoan) return portfolioLoan;
      const propertyLoan = propertyLoanHistory.loans.find((loan) => loan.id.toString() === targetId);
      if (propertyLoan) return propertyLoan;
    }
    return null;
  }, [propertyLoanHistory.loans, selectedLoanId, activeLoanExists, activeLoanId, loanPortfolio.loans]);
  const currentLoan = selectedLoan;
  const selectedLoanProperty = currentLoan
    ? knownProperties.find((property) => propertyKey(property.propertyId) === currentLoan.propertyId)
    : selectedProperty;
  const currentLoanPropertyKey = currentLoan?.propertyId;

  const {
    data: loanRecord,
    refetch: refetchLoanRecord
  } = useReadContract({
    address: safePropertyVerificationAddress,
    abi: propertyVerificationAbi,
    functionName: "getRecord",
    args: currentLoanPropertyKey ? [currentLoanPropertyKey] : undefined,
    chainId: chainIdFor(network),
    query: {
      enabled: Boolean(safePropertyVerificationAddress && currentLoanPropertyKey)
    }
  });
  const formattedLoanRecord = currentLoan ? formatRecord(loanRecord) : formattedRecord;
  const loanCollateralLocked = currentLoan?.state === 0 || currentLoan?.state === 1;
  const collateralLockLabel = currentLoan
    ? loanCollateralLocked
      ? `#${currentLoan.id.toString()}`
      : t("none")
    : activeLoanExists
      ? `#${activeLoanId.toString()}`
      : t("none");

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
  }, [nextLoanId, publicClient, network, refreshNonce]);

  useEffect(() => {
    let mounted = true;

    async function loadChainRecords() {
      if (!safePropertyVerificationAddress || !publicClient || knownProperties.length === 0) {
        if (mounted) setChainRecords({ loading: false, rows: [] });
        return;
      }

      setChainRecords((current) => ({ ...current, loading: true }));
      try {
        const rows = await Promise.all(
          knownProperties.map(async (property) => {
            const key = propertyKey(property.propertyId);
            const data = await publicClient.readContract({
              address: safePropertyVerificationAddress,
              abi: propertyVerificationAbi,
              functionName: "getRecord",
              args: [key]
            });
            const formatted = formatRecord(data);
            return {
              property,
              propertyKey: key,
              record: formatted,
              updatedRaw: Number(data?.lastUpdated || 0n)
            };
          })
        );
        if (mounted) {
          setChainRecords({
            loading: false,
            rows: rows.sort((a, b) => b.updatedRaw - a.updatedRaw)
          });
        }
      } catch (_error) {
        if (mounted) setChainRecords({ loading: false, rows: [] });
      }
    }

    loadChainRecords();
    return () => {
      mounted = false;
    };
  }, [knownProperties, publicClient, network, refreshNonce]);

  useEffect(() => {
    let mounted = true;

    function roleName(role) {
      const normalized = String(role || "").toLowerCase();
      if (normalized === defaultAdminRole.toLowerCase()) return t("roleAdmin");
      if (normalized === oracleRole.toLowerCase()) return t("roleOracle");
      if (normalized === loanOfficerRole.toLowerCase()) return t("roleLoanOfficer");
      if (normalized === complianceRole.toLowerCase()) return "Compliance";
      return shortHash(role);
    }

    async function loadRoleAudit() {
      if (!publicClient) {
        if (mounted) setRoleAudit({ loading: false, rows: [] });
        return;
      }

      const sources = [
        safePropertyVerificationAddress
          ? { contract: t("propertyVerificationContract"), address: safePropertyVerificationAddress, abi: propertyVerificationAbi }
          : null,
        safeLendingAddress
          ? { contract: t("lendingContract"), address: safeLendingAddress, abi: lendingAbi }
          : null
      ].filter(Boolean);

      if (sources.length === 0) {
        if (mounted) setRoleAudit({ loading: false, rows: [] });
        return;
      }

      setRoleAudit((current) => ({ ...current, loading: true }));
      try {
        const eventGroups = await Promise.all(
          sources.flatMap((source) =>
            ["RoleGranted", "RoleRevoked"].map(async (eventName) => {
              const logs = await publicClient.getContractEvents({
                address: source.address,
                abi: source.abi,
                eventName,
                fromBlock: 0n
              });
              return logs.map((log) => ({
                id: `${source.address}-${eventName}-${log.transactionHash}-${log.logIndex}`,
                contract: source.contract,
                action: eventName === "RoleGranted" ? t("grantRole") : t("revokeRole"),
                role: roleName(log.args.role),
                account: log.args.account,
                sender: log.args.sender,
                blockNumber: log.blockNumber,
                tx: log.transactionHash
              }));
            })
          )
        );
        const rows = eventGroups
          .flat()
          .sort((a, b) => Number(b.blockNumber || 0n) - Number(a.blockNumber || 0n))
          .slice(0, 20);
        if (mounted) setRoleAudit({ loading: false, rows });
      } catch (_error) {
        if (mounted) setRoleAudit({ loading: false, rows: [] });
      }
    }

    loadRoleAudit();
    return () => {
      mounted = false;
    };
  }, [publicClient, network, refreshNonce, language]);

  const isVerified = Boolean(formattedRecord.verified);
  const isCompliant = Boolean(formattedRecord.compliant);
  const loanRecordVerified = Boolean(formattedLoanRecord.verified);
  const loanRecordCompliant = Boolean(formattedLoanRecord.compliant);
  const loanRecordPrincipalCommitment = BigInt(formattedLoanRecord.principalCommitmentRaw || 0n);
  const loanProofMatchesPrincipal = Boolean(
    currentLoan &&
      loanRecordCompliant &&
      loanRecordPrincipalCommitment === BigInt(currentLoan.principalCommitment || 0n)
  );
  const loanApprovalReady = Boolean(
    currentLoan &&
      loanRecordVerified &&
      loanProofMatchesPrincipal
  );
  const loanApprovalBlockReason = !currentLoan
    ? t("requestRequired")
    : !loanRecordVerified
      ? t("approvalBlockedVerification")
      : !loanRecordCompliant
        ? t("approvalBlockedCompliance")
        : !loanProofMatchesPrincipal
          ? t("approvalBlockedProofMismatch")
          : "";
  const targetChainId = chainIdFor(network);
  const walletNetworkReady = !isConnected || walletChainId === targetChainId;
  const rpcReady = chainHealth.ok;
  const networkLabel = network === "sepolia" ? t("sepolia") : t("local");
  const networkOptions = [
    { value: "localhost", label: t("local") },
    { value: "sepolia", label: t("sepolia") }
  ];
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
  const onChainPrincipalCommitmentAmount = BigInt(formattedRecord.principalCommitmentRaw || 0n);
  const effectivePrincipalCommitmentAmount = onChainPrincipalCommitmentAmount > 0n
    ? onChainPrincipalCommitmentAmount
    : principalCommitmentAmount;
  const proofPrincipalAmount = proofPrincipal ? BigInt(proofPrincipal) : 0n;
  const proofMatchesPrincipal =
    principalCommitmentAmount > 0n &&
    proofPrincipalAmount > 0n &&
    proofPropertyKey === selectedKey &&
    onChainPrincipalCommitmentAmount === principalCommitmentAmount;
  const hasOnChainProofBinding = Boolean(isCompliant && onChainPrincipalCommitmentAmount > 0n);
  const displayedProofBound = proofMatchesPrincipal || hasOnChainProofBinding;
  const principalNumber = Number(principal || 0);
  const propertyValue = Number(selectedProperty?.valuation || 0);
  const ltvPercent = propertyValue ? (principalNumber / propertyValue) * 100 : 0;
  const ltvSafe = principalAmount > 0n && ltvPercent <= 80;
  const maxPrincipal = Math.floor(propertyValue * 0.8);
  const borrowHeadroom = Math.max(0, maxPrincipal - principalNumber);
  const ltvRemaining = Math.max(0, 80 - ltvPercent);
  const latestProofAmountLabel = proofMatchesPrincipal
    ? formatCurrency(proofPrincipal)
    : hasOnChainProofBinding
      ? t("onChainProofBound")
      : t("noProofGenerated");
  const complianceProofAmountLabel = proofMatchesPrincipal
    ? formatCurrency(proofPrincipal)
    : hasOnChainProofBinding
      ? t("onChainProofBound")
      : t("proofRequiredForLoan");
  const latestProofMeta = effectivePrincipalCommitmentAmount > 0n
    ? `${
        proofMatchesPrincipal ? t("sessionProofAmount") : t("onChainProofAmountUnknown")
      }: ${shortField(effectivePrincipalCommitmentAmount)}`
    : t("proofRequiredForLoan");
  const proofReuseNote = hasOnChainProofBinding && !proofMatchesPrincipal
    ? t("onChainProofReuseHint")
    : t("loanWorkflowNote");
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
      displayedProofBound &&
      !activeLoanExists &&
      isSelectedOwned &&
      !writing
  );
  const canApproveLoan = Boolean(
    isConnected &&
      walletNetworkReady &&
      lendingReady &&
      isLoanOfficer &&
      currentLoan?.state === 0 &&
      loanApprovalReady &&
      !writing
  );
  const canRejectLoan = Boolean(
    isConnected &&
      walletNetworkReady &&
      lendingReady &&
      isLoanOfficer &&
      currentLoan?.state === 0 &&
      !writing
  );
  const canRepayLoan = Boolean(
    isConnected &&
      walletNetworkReady &&
      lendingReady &&
      currentLoan?.state === 1 &&
      currentLoan?.borrower?.toLowerCase() === address?.toLowerCase() &&
      !writing
  );
  const canCancelLoan = Boolean(
    isConnected &&
      walletNetworkReady &&
      lendingReady &&
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
  const readinessPercent = Math.round((readinessScore / Math.max(readinessItems.length, 1)) * 100);
  const isAdmin = Boolean(isOracleAdmin || isLendingAdmin);
  const isBorrower = Boolean(isConnected && ownedProperties.length > 0);

  useEffect(() => {
    let mounted = true;
    const role = isAdmin ? "admin" : isLoanOfficer ? "loanOfficer" : "";
    if (!isConnected || !role) {
      setPrivilegedProperties([]);
      return () => {
        mounted = false;
      };
    }

    getPropertiesForRole(network, role).then((items) => {
      if (mounted) setPrivilegedProperties(items);
    });

    return () => {
      mounted = false;
    };
  }, [isAdmin, isConnected, isLoanOfficer, network]);

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
    ...(isConnected
      ? [
          { id: "verification", icon: Building2, label: "navVerification", title: "verificationViewTitle" },
          { id: "compliance", icon: ShieldCheck, label: "navCompliance", title: "complianceViewTitle" },
          { id: "loan", icon: CircleDollarSign, label: "navLoan", title: "loanViewTitle" }
        ]
      : []),
    ...(isLoanOfficer
      ? [{ id: "approvals", icon: BadgeCheck, label: "navApprovals", title: "approvalViewTitle" }]
      : []),
    ...(isAdmin
      ? [{ id: "admin", icon: UserRoundCog, label: "navAdmin", title: "adminViewTitle" }]
      : []),
    ...(isAdmin ? [{ id: "operations", icon: Cpu, label: "navOperations", title: "operationsViewTitle" }] : []),
    ...(isAdmin ? [{ id: "settings", icon: Settings, label: "navSettings", title: "settingsViewTitle" }] : [])
  ];
  const navItems = baseNavItems;
  const activeNav = navItems.find((item) => item.id === activeView) || navItems[0];

  useEffect(() => {
    if (!isConnected) {
      setActiveView("overview");
      setWorkspaceEntered(false);
      setSelectedLoanId(null);
      setPrincipalCommitment("");
      setProofPrincipal("");
      setProofPropertyKey("");
    }
  }, [isConnected, address]);

  useEffect(() => {
    if (!navItems.some((item) => item.id === activeView)) {
      setActiveView(navItems[0]?.id || "settings");
    }
  }, [activeView, navItems]);

  useEffect(() => {
    setOwnedProperties([]);
    setPrivilegedProperties([]);
    setSelectedLoanId(null);
    setPrincipalCommitment("");
    setProofPrincipal("");
    setProofPropertyKey("");
    setContractHealth({});
    setChainRecords({ loading: false, rows: [] });
    setRoleAudit({ loading: false, rows: [] });
  }, [network]);

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
      state: currentLoan?.state === 1 || currentLoan?.state === 2 ? t("done") : currentLoan?.state === 3 ? t("rejected") : t("waiting"),
      active: Boolean(currentLoan?.state === 1 || currentLoan?.state === 2)
    },
    {
      icon: CircleDollarSign,
      title: t("stepRepayment"),
      subtitle: t("stepRepaymentSub"),
      state: currentLoan?.state === 2 ? t("done") : currentLoan?.state === 1 ? t("ready") : t("waiting"),
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

  const verificationPassRate = knownProperties.length
    ? Math.round((knownProperties.filter(passesVerificationRules).length / knownProperties.length) * 100)
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
      label: t("valuationCommitment"),
      value: formattedLoanRecord.valuationCommitment
    },
    {
      label: t("principalCommitment"),
      value: currentLoan ? shortField(currentLoan.principalCommitment) : shortField(effectivePrincipalCommitmentAmount)
    },
    { label: t("interestRate"), value: currentLoan ? `${Number(currentLoan.interestRateBps) / 100}%` : "6.5%" },
    { label: t("term"), value: currentLoan ? `${Number(currentLoan.termDays)} ${t("days")}` : t("termValue") },
    {
      label: t("activeCollateralLock"),
      value: collateralLockLabel
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
    const matchedProperty = knownProperties.find(
      (property) => propertyKey(property.propertyId) === loan.propertyId
    );
    if (matchedProperty) setSelectedId(matchedProperty.propertyId);
  }

  function actionText(defaultKey) {
    if (txPhase === "submitting") return t("submittingTx");
    if (txPhase === "confirming") return t("confirmingTx");
    if (txPhase === "confirmed") return t("confirmedTx");
    return t(defaultKey);
  }

  async function handleSwitchWalletNetwork() {
    if (!switchChainAsync) return;
    try {
      await switchChainAsync({ chainId: targetChainId });
      pushActivity("chain", t("walletNetworkSwitched"));
    } catch (error) {
      pushActivity("error", error.shortMessage || error.message);
    }
  }

  const refreshChainState = useCallback(async () => {
    await Promise.allSettled([
      refetchRecord(),
      refetchNextLoanId(),
      refetchActiveLoan(),
      refetchPropertyLoanIds(),
      refetchLoanRecord(),
      refetchOracleAdminRole(),
      refetchLendingAdminRole(),
      refetchLoanOfficerRole(),
      refetchOracleOperatorRole(),
      refetchTargetRole()
    ]);
  }, [
    refetchRecord,
    refetchNextLoanId,
    refetchActiveLoan,
    refetchPropertyLoanIds,
    refetchLoanRecord,
    refetchOracleAdminRole,
    refetchLendingAdminRole,
    refetchLoanOfficerRole,
    refetchOracleOperatorRole,
    refetchTargetRole
  ]);

  const refreshAppState = useCallback(async () => {
    setRefreshNonce((current) => current + 1);
    await refreshChainState();
  }, [refreshChainState]);

  useEffect(() => {
    if (activeView === "overview") {
      refreshAppState();
    }
  }, [activeView, refreshAppState]);

  const handleContractEvent = useCallback(() => {
    refreshAppState();
  }, [refreshAppState]);

  useWatchContractEvent({
    address: safeLendingAddress,
    abi: lendingAbi,
    chainId: chainIdFor(network),
    eventName: "LoanRequested",
    enabled: Boolean(safeLendingAddress),
    onLogs: handleContractEvent
  });
  useWatchContractEvent({
    address: safeLendingAddress,
    abi: lendingAbi,
    chainId: chainIdFor(network),
    eventName: "LoanApproved",
    enabled: Boolean(safeLendingAddress),
    onLogs: handleContractEvent
  });
  useWatchContractEvent({
    address: safeLendingAddress,
    abi: lendingAbi,
    chainId: chainIdFor(network),
    eventName: "LoanRejected",
    enabled: Boolean(safeLendingAddress),
    onLogs: handleContractEvent
  });
  useWatchContractEvent({
    address: safeLendingAddress,
    abi: lendingAbi,
    chainId: chainIdFor(network),
    eventName: "LoanRejectedDueToVerification",
    enabled: Boolean(safeLendingAddress),
    onLogs: handleContractEvent
  });
  useWatchContractEvent({
    address: safeLendingAddress,
    abi: lendingAbi,
    chainId: chainIdFor(network),
    eventName: "LoanRejectedDueToCompliance",
    enabled: Boolean(safeLendingAddress),
    onLogs: handleContractEvent
  });
  useWatchContractEvent({
    address: safeLendingAddress,
    abi: lendingAbi,
    chainId: chainIdFor(network),
    eventName: "LoanRejectedDueToProofMismatch",
    enabled: Boolean(safeLendingAddress),
    onLogs: handleContractEvent
  });
  useWatchContractEvent({
    address: safeLendingAddress,
    abi: lendingAbi,
    chainId: chainIdFor(network),
    eventName: "LoanRepaid",
    enabled: Boolean(safeLendingAddress),
    onLogs: handleContractEvent
  });
  useWatchContractEvent({
    address: safeLendingAddress,
    abi: lendingAbi,
    chainId: chainIdFor(network),
    eventName: "LoanCancelled",
    enabled: Boolean(safeLendingAddress),
    onLogs: handleContractEvent
  });
  useWatchContractEvent({
    address: safePropertyVerificationAddress,
    abi: propertyVerificationAbi,
    chainId: chainIdFor(network),
    eventName: "PropertyVerificationUpdated",
    enabled: Boolean(safePropertyVerificationAddress),
    onLogs: handleContractEvent
  });
  useWatchContractEvent({
    address: safePropertyVerificationAddress,
    abi: propertyVerificationAbi,
    chainId: chainIdFor(network),
    eventName: "PropertyComplianceUpdated",
    enabled: Boolean(safePropertyVerificationAddress),
    onLogs: handleContractEvent
  });

  async function waitForReceipt(hash) {
    if (!publicClient || !hash) return;
    setTxPhase("confirming");
    pushActivity("chain", t("waitingReceipt"), hash);
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    setTxPhase("confirmed");
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
      await refreshAppState();
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
    const result = await runOracle(
      "/verify",
      {
        propertyId: selectedProperty.propertyId,
        write: writeViaOracle,
        network
      },
      "Verification"
    );
    if (result) {
      setVerificationDialog({
        ok: Boolean(result.verified),
        propertyId: result.propertyId || selectedProperty.propertyId,
        reasons: result.evaluation?.reasons || result.reasons || [],
        txHash: result.txHash || ""
      });
    }
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
      if (!activeLoanExists) setSelectedLoanId(null);
    }
    if (result) {
      setComplianceDialog({
        ok: Boolean(result.compliant),
        propertyId: result.propertyId || selectedProperty.propertyId,
        ltvBps: result.ltvBps,
        maxPrincipal: result.maxPrincipal,
        principalCommitment: result.principalCommitment,
        reasons: result.reasons || result.evaluation?.reasons || [],
        txHash: result.txHash || ""
      });
    }
  }

  async function writeLoan(functionName, args, value = 0n) {
    if (!lendingReady) {
      pushActivity("error", t("contractsMissing"));
      return null;
    }
    setBusyAction(functionName);
    setTxPhase("submitting");
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
      await refreshAppState();
      return hash;
    } catch (error) {
      pushActivity("error", error.shortMessage || error.message);
      return null;
    } finally {
      setBusyAction("");
      window.setTimeout(() => setTxPhase(""), 1200);
    }
  }

  async function handleRequestLoan() {
    if (!canRequestLoan) {
      pushActivity(
        "error",
        principalAmount <= 0n && effectivePrincipalCommitmentAmount === 0n
          ? t("invalidPrincipal")
          : !isVerified
            ? t("verificationRequired")
            : !isCompliant
              ? t("complianceRequired")
                : effectivePrincipalCommitmentAmount === 0n
                  ? t("proofRequiredForLoan")
                : !displayedProofBound
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
    const hash = await writeLoan("requestLoan", [selectedKey, effectivePrincipalCommitmentAmount]);
    if (hash) setSelectedLoanId(requestedId.toString());
  }

  async function handleApproveLoan() {
    if (!canApproveLoan) {
      pushActivity("error", loanApprovalBlockReason || (currentLoan ? t("approvalUnavailable") : t("requestRequired")));
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
    const hash = await writeLoan("cancelLoan", [currentLoan.id]);
    if (hash) setSelectedLoanId(null);
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
    setTxPhase("submitting");
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
      await refreshAppState();
    } catch (error) {
      pushActivity("error", error.shortMessage || error.message);
    } finally {
      setBusyAction("");
      window.setTimeout(() => setTxPhase(""), 1200);
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
          <span>{selectedProperty?.propertyId || "-"}</span>
        </div>
        <div className="asset-copy">
          <div className="asset-title-row">
            <h2>{t("assetTitle")}</h2>
            <span className="mini-pill">{shortHash(selectedKey)}</span>
          </div>
          <p className="asset-address">
            <Home size={16} />
            {selectedProperty?.address || "-"}
          </p>
          <div className="asset-meta">
            <div>
              <Database size={24} />
              <span>{t("propertyId")}</span>
              <strong>{selectedProperty?.propertyId || "-"}</strong>
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
            <div>
              <ShieldCheck size={18} />
              <span>{t("registryStatus")}</span>
              <strong>{selectedProperty?.status || "-"}</strong>
            </div>
            <div>
              <LockKeyhole size={18} />
              <span>{t("titleClear")}</span>
              <strong>{selectedProperty?.noEncumbrance ? t("yes") : t("no")}</strong>
            </div>
            <div>
              <WalletCards size={18} />
              <span>{t("propertyOwner")}</span>
              <strong>{shortHash(selectedProperty?.ownerAddress)}</strong>
            </div>
          </div>
        </div>
      </section>
    );
  }

  function renderPropertySwitcher() {
    if (visibleProperties.length === 0) {
      return (
        <section className="property-switcher panel">
          <p className="helper-copy">{isConnected ? t("noOwnedProperties") : t("connectToSeeProperties")}</p>
        </section>
      );
    }

    return (
      <section className="property-switcher panel">
        <label className="property-select-control">
          <span>{t("chooseAsset")}</span>
          <div className="property-select-shell">
            <Building2 size={20} />
            <select value={selectedId} onChange={(event) => setSelectedId(event.target.value)}>
              {visibleProperties.map((property) => (
                <option value={property.propertyId} key={property.propertyId}>
                  {property.propertyId} · {property.address}
                </option>
              ))}
            </select>
            <ChevronDown size={18} />
          </div>
        </label>
      </section>
    );
  }

  function renderBorrowerFlowHeader({ switchable = false } = {}) {
    return (
      <section className="borrower-flow-header">
        {switchable && renderPropertySwitcher()}
        {renderAssetCard()}
        {renderStepsPanel()}
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
      <div className={`loan-action-grid ${className}`}>
        <button className="primary-action loan-command" onClick={handleRequestLoan} disabled={!canRequestLoan}>
          <Send size={17} />
          <span>{busyAction === "requestLoan" ? actionText("submitLoan") : t("submitLoan")}</span>
        </button>
        <button className="outline-action loan-command" onClick={handleRepay} disabled={!canRepayLoan}>
          <CircleDollarSign size={17} />
          <span>{busyAction === "repay" ? actionText("repayLoan") : t("repayLoan")}</span>
        </button>
        <button className="outline-action loan-command" onClick={handleCancelLoan} disabled={!canCancelLoan}>
          <XCircle size={17} />
          <span>{busyAction === "cancelLoan" ? actionText("cancelLoan") : t("cancelLoan")}</span>
        </button>
      </div>
    );
  }

  function renderComplianceWorkbench() {
    return (
      <article className="compliance-workbench panel">
        <div className="panel-heading">
          <h2>{t("complianceWorkbench")}</h2>
          <ShieldCheck size={16} />
        </div>
        <div className="proof-command-strip">
          <div className="proof-command-title">
            <span className="proof-command-icon">
              <LockKeyhole size={20} />
            </span>
            <div>
              <span>{t("latestProofAmount")}</span>
              <strong>{latestProofAmountLabel}</strong>
              <small>{latestProofMeta}</small>
            </div>
          </div>
          <div className={`proof-studio-status ${isCompliant ? "ok" : ltvSafe ? "ready" : ""}`}>
            <Check size={18} />
            <span>{displayedProofBound ? t("matched") : t("notMatched")}</span>
          </div>
        </div>
        <div className="proof-studio-grid">
          <div className="proof-risk-panel">
            <div className="risk-meter-compact">
              <span>{t("currentLtv")}</span>
              <strong className={ltvSafe ? "green-text" : "warn-text"}>{ltvPercent.toFixed(1)}%</strong>
            </div>
            <div className="risk-track">
              <span style={{ width: `${Math.min(100, ltvPercent)}%` }} />
              <i />
            </div>
            <small>{t("ltvRemaining")}: {ltvRemaining.toFixed(1)}%</small>
          </div>
          <div className="proof-metrics">
            <div>
              <span>{t("maxBorrow")}</span>
              <strong>{formatCurrency(maxPrincipal)}</strong>
            </div>
            <div>
              <span>{t("principal")}</span>
              <strong>{formatCurrency(principal)}</strong>
            </div>
            <div>
              <span>{t("borrowHeadroom")}</span>
              <strong className={ltvSafe ? "green-text" : "warn-text"}>{formatCurrency(borrowHeadroom)}</strong>
            </div>
            <div>
              <span>{t("proofBinding")}</span>
              <strong className={displayedProofBound ? "green-text" : "warn-text"}>
                {displayedProofBound ? t("matched") : t("notMatched")}
              </strong>
            </div>
          </div>
        </div>
        <div className="proof-input-row">
          <div className="proof-principal-field">
            <label htmlFor="principal-input">{t("principal")}</label>
            <input
              id="principal-input"
              value={principal}
              inputMode="numeric"
              onChange={(event) => setPrincipal(event.target.value.replace(/\D/g, ""))}
            />
          </div>
        </div>
        <div className="proof-action-row">
          <button
            className="primary-action"
            onClick={handleCompliance}
            disabled={!canComply || busyAction === "Compliance"}
          >
            {busyAction === "Compliance" ? <Loader2 className="spin" size={17} /> : <ShieldCheck size={17} />}
            {t("generateProof")}
          </button>
          <div className="proof-action-note">
            <strong>{t("publicResult")}</strong>
            <span>{t("complianceStudioCopy")}</span>
          </div>
        </div>
      </article>
    );
  }

  function renderLoanPanel(compact = false) {
    const activeLockLabel = activeLoanExists ? `#${activeLoanId.toString()}` : t("none");
    return (
      <article className={`loan-panel panel loan-request-console ${compact ? "compact-card" : ""}`}>
        <div className="panel-heading">
          <h2>{t("loanTitle")}</h2>
          <span className="status-chip amber">{approvalState}</span>
        </div>
        <div className="loan-command-strip">
          <div>
            <span>{t("propertyKey")}</span>
            <strong>{shortHash(selectedKey)}</strong>
          </div>
          <div>
            <span>{t("loanState")}</span>
            <strong>{loanStateLabel}</strong>
          </div>
          <div>
            <span>{t("proofBinding")}</span>
            <strong className={displayedProofBound ? "green-text" : "warn-text"}>
              {displayedProofBound ? t("matched") : t("notMatched")}
            </strong>
          </div>
        </div>
        <div className="loan-amount-board">
          <div>
            <span>{t("complianceProofAmount")}</span>
            <strong>{complianceProofAmountLabel}</strong>
            <small>{proofReuseNote}</small>
          </div>
          <CircleDollarSign size={34} />
        </div>
        <div className="loan-fields">
          <div>
            <span>{t("loanId")}</span>
            <strong>{currentLoan ? `#${currentLoan.id.toString()}` : t("systemAssignedLoanId")}</strong>
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
            <span>{t("activeCollateralLock")}</span>
            <strong>{activeLockLabel}</strong>
          </div>
        </div>
        {!displayedProofBound && (
          <p className="helper-copy compact-note warn-text">
            {t("regenerateProofHint")}
          </p>
        )}
        {activeLoanExists && (
          <p className="helper-copy compact-note warn-text">{t("activeLoanLockHint")}</p>
        )}
        {renderLoanActionButtons(compact ? "compact-actions" : "")}
      </article>
    );
  }

  function renderLoanDetailPanel() {
    const loanStatusTone =
      currentLoan?.state === 1 || currentLoan?.state === 2
        ? "green"
        : currentLoan?.state === 3 || currentLoan?.state === 4
          ? "muted"
          : currentLoan
            ? "amber"
            : "muted";
    const loanRecordSections = [
      {
        title: t("loanRecordIdentity"),
        icon: WalletCards,
        items: [
          { label: t("loanId"), value: currentLoan ? `#${currentLoan.id.toString()}` : t("systemAssignedLoanId") },
          { label: t("propertyId"), value: selectedLoanProperty?.propertyId || "-" },
          { label: t("loanProperty"), value: currentLoan ? shortHash(currentLoan.propertyId) : shortHash(selectedKey) },
          { label: t("borrower"), value: currentLoan ? shortHash(currentLoan.borrower) : walletLabel }
        ]
      },
      {
        title: t("loanRecordCommitments"),
        icon: Database,
        items: [
          { label: t("valuationCommitment"), value: formattedLoanRecord.valuationCommitment },
          {
            label: t("principalCommitment"),
            value: currentLoan ? shortField(currentLoan.principalCommitment) : shortField(effectivePrincipalCommitmentAmount)
          },
          { label: t("activeCollateralLock"), value: collateralLockLabel }
        ]
      },
      {
        title: t("loanRecordTerms"),
        icon: CircleDollarSign,
        items: [
          { label: t("loanState"), value: loanStateLabel },
          { label: t("interestRate"), value: currentLoan ? `${Number(currentLoan.interestRateBps) / 100}%` : "6.5%" },
          { label: t("term"), value: currentLoan ? `${Number(currentLoan.termDays)} ${t("days")}` : t("termValue") },
          { label: t("requestedAt"), value: currentLoan ? formatTimestamp(currentLoan.requestedAt) : "-" },
          { label: t("approvedAt"), value: currentLoan?.approvedAt ? formatTimestamp(currentLoan.approvedAt) : "-" },
          { label: t("repaidAt"), value: currentLoan?.repaidAt ? formatTimestamp(currentLoan.repaidAt) : "-" }
        ]
      }
    ];

    return (
      <article className="record-card panel loan-record-card">
        <div className="panel-heading">
          <h2>{t("loanDetails")}</h2>
          <CircleDollarSign size={16} />
        </div>
        <div className="record-summary-strip">
          <span className={`status-chip ${loanStatusTone}`}>
            <CircleDollarSign size={15} />
            {currentLoan ? loanStateLabel : t("loanDraft")}
          </span>
          <span className={`status-chip ${loanCollateralLocked || activeLoanExists ? "green" : "muted"}`}>
            <LockKeyhole size={15} />
            {loanCollateralLocked || activeLoanExists ? t("collateralLocked") : t("collateralUnlocked")}
          </span>
        </div>
        <div className="record-section-list">
          {loanRecordSections.map((section) => {
            const SectionIcon = section.icon;
            return (
              <section className="record-section" key={section.title}>
                <div className="record-section-title">
                  <SectionIcon size={16} />
                  <strong>{section.title}</strong>
                </div>
                <dl className="record-list">
                  {section.items.map((item) => (
                    <div key={item.label}>
                      <dt>{item.label}</dt>
                      <dd>{item.value}</dd>
                    </div>
                  ))}
                </dl>
              </section>
            );
          })}
        </div>
      </article>
    );
  }

  function renderActivityTable() {
    return (
      <section className="activity-panel panel">
        <div className="panel-heading">
          <h2>{t("contractActivity")}</h2>
          <button className="icon-only" onClick={() => refreshAppState()} title={t("refresh")}>
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
    const recordSections = [
      {
        title: t("recordAssetIdentity"),
        icon: Database,
        items: [
          { label: t("propertyKey"), value: shortHash(selectedKey) },
          { label: t("statusVerified"), value: isVerified ? t("yes") : t("no") },
          { label: t("statusCompliant"), value: isCompliant ? t("yes") : t("no") }
        ]
      },
      {
        title: t("recordVerificationProof"),
        icon: FileCheck2,
        items: [
          { label: t("registryEvidenceFingerprint"), value: formattedRecord.evidenceHash },
          { label: t("valuationCommitment"), value: formattedRecord.valuationCommitment }
        ]
      },
      {
        title: t("recordComplianceProof"),
        icon: ShieldCheck,
        items: [
          { label: t("zkProofFingerprint"), value: formattedRecord.complianceHash },
          { label: t("principalCommitment"), value: formattedRecord.principalCommitment },
          { label: t("updated"), value: formattedRecord.lastUpdated }
        ]
      }
    ];

    return (
      <article className="record-card panel onchain-record-card">
        <div className="panel-heading">
          <h2>{t("onChainRecord")}</h2>
          <Activity size={16} />
        </div>
        <div className="record-summary-strip">
          <span className={`status-chip ${isVerified ? "green" : "muted"}`}>
            <Check size={15} />
            {isVerified ? t("statusVerified") : t("statusUnverified")}
          </span>
          <span className={`status-chip ${isCompliant ? "green" : "muted"}`}>
            <ShieldCheck size={15} />
            {isCompliant ? t("statusCompliant") : t("statusPending")}
          </span>
        </div>
        <div className="record-section-list">
          {recordSections.map((section) => {
            const SectionIcon = section.icon;
            return (
              <section className="record-section" key={section.title}>
                <div className="record-section-title">
                  <SectionIcon size={16} />
                  <strong>{section.title}</strong>
                </div>
                <dl className="record-list">
                  {section.items.map((item) => (
                    <div key={item.label}>
                      <dt>{item.label}</dt>
                      <dd>{item.value}</dd>
                    </div>
                  ))}
                </dl>
              </section>
            );
          })}
        </div>
      </article>
    );
  }

  function renderChainRecordExplorer() {
    return (
      <article className="record-card panel">
        <div className="panel-heading">
          <h2>{t("chainRecordExplorer")}</h2>
          <Activity size={16} />
        </div>
        <div className="chain-record-table">
          <div className="chain-record-head">
            <span>{t("propertyId")}</span>
            <span>{t("propertyKey")}</span>
            <span>{t("statusVerified")}</span>
            <span>{t("statusCompliant")}</span>
            <span>{t("principalCommitment")}</span>
            <span>{t("updated")}</span>
          </div>
          {chainRecords.rows.length === 0 ? (
            <p className="helper-copy">{chainRecords.loading ? t("loading") : t("noChainRecords")}</p>
          ) : (
            chainRecords.rows.map((row) => (
              <button
                className={`chain-record-row ${selectedId === row.property.propertyId ? "active" : ""}`}
                key={row.property.propertyId}
                onClick={() => setSelectedId(row.property.propertyId)}
              >
                <strong>{row.property.propertyId}</strong>
                <span>{shortHash(row.propertyKey)}</span>
                <span>{row.record.verified ? t("yes") : t("no")}</span>
                <span>{row.record.compliant ? t("yes") : t("no")}</span>
                <span>{row.record.principalCommitment}</span>
                <span>{row.record.lastUpdated}</span>
              </button>
            ))
          )}
        </div>
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
      <LoanLedger
        t={t}
        title={t("loanBook")}
        loans={rows}
        loading={loanPortfolio.loading}
        emptyText={t("noLoan")}
        rowKey={(loan) => loan.id.toString()}
        columns={[
          { key: "id", label: t("loanId"), strong: true, render: (loan) => `#${loan.id.toString()}` },
          { key: "propertyId", label: t("loanProperty"), render: (loan) => shortHash(loan.propertyId) },
          { key: "borrower", label: t("borrower"), render: (loan) => shortHash(loan.borrower) },
          { key: "state", label: t("state"), render: (loan) => t(stateKeys[loan.state] || "loanReadError") },
          { key: "requestedAt", label: t("requestedAt"), render: (loan) => formatTimestamp(loan.requestedAt) }
        ]}
      />
    );
  }

  function renderMyLoanLedger() {
    const stateKeys = ["requested", "approved", "repaid", "rejected", "cancelled"];
    return (
      <LoanLedger
        t={t}
        title={t("myLoans")}
        loans={myLoans}
        loading={loanPortfolio.loading}
        emptyText={t("noBorrowerLoans")}
        rowKey={(loan) => loan.id.toString()}
        selectedLoanId={selectedLoanId}
        selectLoanRecord={selectLoanRecord}
        pageSize={5}
        columns={[
          { key: "id", label: t("loanId"), strong: true, render: (loan) => `#${loan.id.toString()}` },
          {
            key: "propertyCode",
            label: t("propertyId"),
            render: (loan) => knownProperties.find((property) => propertyKey(property.propertyId) === loan.propertyId)?.propertyId || "-"
          },
          { key: "propertyId", label: t("loanProperty"), render: (loan) => shortHash(loan.propertyId) },
          { key: "state", label: t("state"), render: (loan) => t(stateKeys[loan.state] || "loanReadError") },
          { key: "requestedAt", label: t("requestedAt"), render: (loan) => formatTimestamp(loan.requestedAt) },
          { key: "principalCommitment", label: t("principalCommitment"), render: (loan) => shortField(loan.principalCommitment) }
        ]}
      />
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
                  const matchedProperty = knownProperties.find(
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
            <DetailList items={loanDetailItems} />
            {currentLoan?.state === 0 ? (
              <>
                {!loanApprovalReady && (
                  <p className="helper-copy compact-note warn-text">{loanApprovalBlockReason}</p>
                )}
                <div className="view-actions-row">
                  <button className="gold-action" onClick={handleApproveLoan} disabled={!canApproveLoan}>
                    <BadgeCheck size={17} />
                    {busyAction === "approveLoan" ? actionText("approveLoan") : t("approveLoan")}
                  </button>
                  <button className="outline-action" onClick={() => handleRejectLoan()} disabled={!canRejectLoan}>
                    <XCircle size={17} />
                    {busyAction === "rejectLoan" ? actionText("rejectLoan") : t("rejectLoan")}
                  </button>
                </div>
              </>
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
                {busyAction === "Role" ? actionText("applyRoleChange") : t("applyRoleChange")}
              </button>
            </div>
          </article>
          <article className="operation-panel panel">
            <div className="panel-heading">
              <h2>{t("adminStatus")}</h2>
              <ShieldCheck size={16} />
            </div>
            <div className="role-status-grid">
              <div>
                <span>{t("currentWallet")}</span>
                <strong>{shortHash(address)}</strong>
                <small>{roleSummary.length ? roleSummary.join(" / ") : t("roleViewer")}</small>
              </div>
              <div>
                <span>{t("roleAdmin")}</span>
                <strong className={isAdmin ? "green-text" : "warn-text"}>
                  {isAdmin ? t("activeRole") : t("inactiveRole")}
                </strong>
                <small>{shortHash(configuredAdminAddress || address)}</small>
              </div>
              <div>
                <span>{t("roleOracle")}</span>
                <strong className={isOracleOperator ? "green-text" : "warn-text"}>
                  {isOracleOperator ? t("activeRole") : t("inactiveRole")}
                </strong>
                <small>{shortHash(address)}</small>
              </div>
              <div>
                <span>{t("roleLoanOfficer")}</span>
                <strong className={isLoanOfficer ? "green-text" : "warn-text"}>
                  {isLoanOfficer ? t("activeRole") : t("inactiveRole")}
                </strong>
                <small>{shortHash(address)}</small>
              </div>
              <div>
                <span>{t("selectedTargetRole")}</span>
                <strong className={targetHasRole ? "green-text" : "warn-text"}>
                  {isValidAddress(roleAddress)
                    ? targetHasRole
                      ? t("activeRole")
                      : t("inactiveRole")
                    : t("invalidRoleAddress")}
                </strong>
                <small>{isValidAddress(roleAddress) ? shortHash(roleAddress) : "-"}</small>
              </div>
            </div>
          </article>
        </section>
        <section className="operation-panel panel">
          <div className="panel-heading">
            <h2>{t("roleAuditTrail")}</h2>
            <UserRoundCog size={16} />
          </div>
          <div className="role-audit-table">
            <div className="role-audit-head">
              <span>{t("roleOperation")}</span>
              <span>{t("roleTarget")}</span>
              <span>{t("roleAddress")}</span>
              <span>{t("contract")}</span>
              <span>{t("latestBlock")}</span>
              <span>{t("latestTx")}</span>
            </div>
            {roleAudit.rows.length === 0 ? (
              <p className="helper-copy">{roleAudit.loading ? t("loading") : t("noRoleAudit")}</p>
            ) : (
              roleAudit.rows.map((row) => (
                <div className="role-audit-row" key={row.id}>
                  <strong>{row.action}</strong>
                  <span>{row.role}</span>
                  <span>{shortHash(row.account)}</span>
                  <span>{row.contract}</span>
                  <span>{row.blockNumber?.toString() || "-"}</span>
                  <span>{shortHash(row.tx)}</span>
                </div>
              ))
            )}
          </div>
        </section>
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
        {renderBorrowerFlowHeader({ switchable: true })}
        <section className="view-grid two-col verification-work-grid">
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
                {isVerified ? t("refreshVerification") : t("runVerification")}
              </button>
            </div>
          </article>
          {renderRecordCard()}
        </section>
      </div>
    );
  }

  function renderCompliance() {
    return (
      <div className="workspace-view view-scroll">
        {renderBorrowerFlowHeader()}
        <section className="view-grid two-col verification-work-grid compliance-work-grid">
          {renderComplianceWorkbench()}
          {renderRecordCard()}
        </section>
      </div>
    );
  }

  function renderLoan() {
    return (
      <div className="workspace-view view-scroll">
        {renderBorrowerFlowHeader()}
        <section className="view-grid two-col loan-work-grid">
          {renderLoanPanel()}
          {renderLoanDetailPanel()}
        </section>
        {renderMyLoanLedger()}
      </div>
    );
  }

  function renderOperations() {
    return (
      <div className="workspace-view view-scroll">
        {renderReadinessPanel()}
        <section className="view-grid two-col">
          <article className="operation-panel panel">
            <div className="panel-heading">
              <h2>{t("contractAddresses")}</h2>
              <Cpu size={16} />
            </div>
            <div className="ops-address-grid">
              {contractRows.slice(0, 3).map((row) => (
                <div className="ops-address-row" key={row.name}>
                  <span>{row.name}</span>
                  <strong>{shortHash(row.address)}</strong>
                  <small>{row.address}</small>
                </div>
              ))}
            </div>
          </article>
          {renderRecordCard()}
        </section>
        {renderActivityTable()}
        {renderActivityFeed(8)}
      </div>
    );
  }

  function renderSettings() {
    return (
      <div className="workspace-view view-scroll">
        <section className="view-grid two-col">
          <article className="operation-panel panel settings-card">
            <div className="panel-heading">
              <h2>{t("settingsViewTitle")}</h2>
              <Settings size={16} />
            </div>
            <div className="settings-list">
              <label>
                <span>{t("languagePreference")}</span>
                <LanguageToggle language={language} updateLanguage={updateLanguage} t={t} inline />
              </label>
              <label>
                <span>{t("networkPreference")}</span>
                <select
                  value={network}
                  onChange={(event) => setNetwork(event.target.value)}
                >
                  {networkOptions.map((option) => (
                    <option value={option.value} disabled={option.disabled} key={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <p className="settings-note">{t("networkRuntimeLocked")}</p>
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
          <article className="operation-panel panel settings-card">
            <div className="panel-heading">
              <h2>{t("workspacePreferences")}</h2>
              <ListChecks size={16} />
            </div>
            <div className="settings-summary-grid">
              <div>
                <span>{t("currentWallet")}</span>
                <strong>{walletLabel}</strong>
              </div>
              <div>
                <span>{t("workspaceStatus")}</span>
                <strong>{roleSummary.length ? roleSummary.join(" / ") : t("roleViewer")}</strong>
              </div>
              <div>
                <span>{t("roleAdmin")}</span>
                <strong className={isAdmin ? "green-text" : "warn-text"}>
                  {isAdmin ? t("activeRole") : t("inactiveRole")}
                </strong>
              </div>
              <div>
                <span>{t("roleLoanOfficer")}</span>
                <strong className={isLoanOfficer ? "green-text" : "warn-text"}>
                  {isLoanOfficer ? t("activeRole") : t("inactiveRole")}
                </strong>
              </div>
              <div>
                <span>{t("proofBinding")}</span>
                <strong className={displayedProofBound ? "green-text" : "warn-text"}>
                  {displayedProofBound ? t("matched") : t("notMatched")}
                </strong>
              </div>
              <div>
                <span>{t("readinessTitle")}</span>
                <strong>{readinessScore}/4 {t("readyStatus")}</strong>
              </div>
            </div>
            <p className="helper-copy">{t("settingsProductNote")}</p>
          </article>
        </section>
      </div>
    );
  }

  function renderActiveView() {
    if (activeView === "verification") return renderVerification();
    if (activeView === "compliance") return renderCompliance();
    if (activeView === "loan") return renderLoan();
    if (activeView === "approvals") return renderApprovals();
    if (activeView === "admin") return renderAdmin();
    if (activeView === "operations") return renderOperations();
    if (activeView === "settings") return renderSettings();
    return renderOverview();
  }

  if (!isConnected || !workspaceEntered) {
    return (
      <WalletGate
        t={t}
        language={language}
        updateLanguage={updateLanguage}
        network={network}
        setNetwork={setNetwork}
        networkOptions={networkOptions}
        readinessItems={readinessItems}
        readinessScore={readinessScore}
        networkLabel={networkLabel}
        connectors={connectors}
        connect={connect}
        disconnect={disconnect}
        connecting={connecting}
        isConnected={isConnected}
        walletLabel={walletLabel}
        onEnter={() => setWorkspaceEntered(true)}
      />
    );
  }

  return (
    <main className={`dashboard-shell active-${activeView} ${sidebarOpen ? "" : "sidebar-collapsed"}`}>
      <aside className="sidebar">
        <div className="sidebar-head">
          <div className="brand-lockup">
            <div className="brand-mark">
              <Building2 size={24} />
            </div>
            <strong>{t("appTitle")}</strong>
          </div>
          <button
            className="sidebar-toggle"
            onClick={() => setSidebarOpen((current) => !current)}
            title={sidebarOpen ? t("collapseSidebar") : t("expandSidebar")}
          >
            {sidebarOpen ? <ChevronLeft size={18} /> : <ChevronRight size={18} />}
          </button>
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
          <div className="sidebar-readiness">
            <div className="sidebar-readiness-score">
              <div>
                <span>{t("workspaceStatus")}</span>
                <strong>{readinessPercent}%</strong>
              </div>
              <small>{readinessScore}/4 {t("readyStatus")}</small>
            </div>
            <div className="sidebar-readiness-list">
              {readinessItems.map((item) => {
                const StatusIcon = item.ready ? Check : XCircle;
                return (
                  <div className={item.ready ? "ready" : "missing"} key={item.label}>
                    <StatusIcon size={14} />
                    <span>{item.label}</span>
                    <small>{item.detail}</small>
                  </div>
                );
              })}
            </div>
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
            <NetworkSelector
              network={network}
              setNetwork={setNetwork}
              t={t}
              options={networkOptions}
            />
            {isConnected && !walletNetworkReady && (
              <button
                className="network-sync-button"
                onClick={handleSwitchWalletNetwork}
                disabled={switchingChain}
                title={t("walletNetworkMismatchHint")}
              >
                {switchingChain ? <Loader2 className="spin" size={16} /> : <Network size={16} />}
                <span>{switchingChain ? t("switchingNetwork") : t("syncWalletNetwork")}</span>
              </button>
            )}
            <LanguageToggle language={language} updateLanguage={updateLanguage} t={t} />
            <WalletButton
              isConnected={isConnected}
              walletLabel={walletLabel}
              connecting={connecting}
              connectors={connectors}
              connect={connect}
              disconnect={disconnect}
              t={t}
            />
          </div>
        </header>

        {renderActiveView()}
      </section>
      {verificationDialog && (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setVerificationDialog(null)}>
          <section
            className={`result-dialog panel ${verificationDialog.ok ? "success" : "fail"}`}
            role="dialog"
            aria-modal="true"
            aria-labelledby="verification-result-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="result-dialog-icon">
              {verificationDialog.ok ? <Check size={28} /> : <XCircle size={28} />}
            </div>
            <div>
              <h2 id="verification-result-title">
                {verificationDialog.ok ? t("verificationPassedTitle") : t("verificationFailedTitle")}
              </h2>
              <p>
                {verificationDialog.ok
                  ? t("verificationPassedCopy")
                  : `${t("verificationFailedCopy")}: ${
                      verificationDialog.reasons.length ? verificationDialog.reasons.join(", ") : "-"
                    }`}
              </p>
              <div className="result-dialog-meta">
                <span>{t("propertyId")}</span>
                <strong>{verificationDialog.propertyId}</strong>
                {verificationDialog.txHash && (
                  <>
                    <span>{t("latestTx")}</span>
                    <strong>{shortHash(verificationDialog.txHash)}</strong>
                  </>
                )}
              </div>
              <button className="primary-action" onClick={() => setVerificationDialog(null)}>
                {t("close")}
              </button>
            </div>
          </section>
        </div>
      )}
      {complianceDialog && (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setComplianceDialog(null)}>
          <section
            className={`result-dialog panel ${complianceDialog.ok ? "success" : "fail"}`}
            role="dialog"
            aria-modal="true"
            aria-labelledby="compliance-result-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="result-dialog-icon">
              {complianceDialog.ok ? <Check size={28} /> : <XCircle size={28} />}
            </div>
            <div>
              <h2 id="compliance-result-title">
                {complianceDialog.ok ? t("compliancePassedTitle") : t("complianceFailedTitle")}
              </h2>
              <p>
                {complianceDialog.ok
                  ? t("compliancePassedCopy")
                  : `${t("complianceFailedCopy")}: ${
                      complianceDialog.reasons.length ? complianceDialog.reasons.join(", ") : "-"
                    }`}
              </p>
              <div className="result-dialog-meta">
                <span>{t("propertyId")}</span>
                <strong>{complianceDialog.propertyId}</strong>
                <span>{t("currentLtv")}</span>
                <strong>
                  {complianceDialog.ltvBps !== undefined
                    ? `${(Number(complianceDialog.ltvBps) / 100).toFixed(1)}%`
                    : `${ltvPercent.toFixed(1)}%`}
                </strong>
                <span>{t("principalCommitment")}</span>
                <strong>{shortField(complianceDialog.principalCommitment)}</strong>
                {complianceDialog.txHash && (
                  <>
                    <span>{t("latestTx")}</span>
                    <strong>{shortHash(complianceDialog.txHash)}</strong>
                  </>
                )}
              </div>
              <button className="primary-action" onClick={() => setComplianceDialog(null)}>
                {t("close")}
              </button>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}

export default App;
