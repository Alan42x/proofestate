import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  Leaf,
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
import { complianceVerifierAbi, lendingAbi, propertyVerificationAbi, roleAdminManagerAbi } from "./contracts/abis";
import { getOracleHealth, getPropertiesByOwner, getPropertiesForRole, postOracle } from "./lib/api";
import { formatRecord, propertyKey, roleKey, shortField, shortHash } from "./lib/chain";
import { detectInitialLanguage, LANG_STORAGE_KEY, translations } from "./lib/i18n";
import { LanguageToggle, NetworkSelector, WalletButton } from "./components/common/Controls";
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
const sepoliaEventLookbackBlocks = 250000n;

function chainIdFor(network) {
  return network === "sepolia" ? sepolia.id : hardhat.id;
}

function isValidAddress(value) {
  return /^0x[a-fA-F0-9]{40}$/.test(value || "");
}

function addressOrFallback(value, fallback) {
  return isValidAddress(value) ? value : fallback;
}

function addressesMatch(left, right) {
  return isValidAddress(left) && isValidAddress(right) && left.toLowerCase() === right.toLowerCase();
}

function blockNumberOrUndefined(value) {
  if (value === undefined || value === null || value === "") return undefined;
  try {
    return BigInt(value);
  } catch (_error) {
    return undefined;
  }
}

function eventStartBlockFor(network, latestBlock, deployment = {}) {
  const configuredBlock = blockNumberOrUndefined(
    deployment.eventStartBlock ?? deployment.startBlock ?? deployment.deployedBlock ?? deployment.blockNumber
  );
  if (configuredBlock !== undefined) return configuredBlock;
  if (network !== "sepolia") return 0n;

  const latest = blockNumberOrUndefined(latestBlock);
  if (latest === undefined) return undefined;
  if (latest <= sepoliaEventLookbackBlocks) return 0n;
  return latest - sepoliaEventLookbackBlocks;
}

function formatCurrency(value) {
  return `$${Number(value || 0).toLocaleString()}`;
}

function fullCommitment(value) {
  if (value === undefined || value === null || value === "" || value === 0 || value === 0n || value === "-") {
    return "-";
  }
  try {
    return `0x${BigInt(value).toString(16).padStart(64, "0")}`;
  } catch (_error) {
    return String(value);
  }
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

  const [activeView, setActiveView] = useState("verification");
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
  const [roleTarget, setRoleTarget] = useState("admin");
  const [roleDirectoryTarget, setRoleDirectoryTarget] = useState("admin");
  const [roleOperation, setRoleOperation] = useState("grant");
  const [roleDirectoryPage, setRoleDirectoryPage] = useState(1);
  const [roleAuditPage, setRoleAuditPage] = useState(1);
  const [expandedRoleAuditId, setExpandedRoleAuditId] = useState("");
  const [loanAuditPage, setLoanAuditPage] = useState(1);
  const [chainRecordPage, setChainRecordPage] = useState(1);
  const [selectedChainRecordId, setSelectedChainRecordId] = useState("");
  const [onchainAuditPage, setOnchainAuditPage] = useState(1);
  const [selectedOnchainAuditId, setSelectedOnchainAuditId] = useState("");
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
  const [chainEventAudit, setChainEventAudit] = useState({ loading: false, rows: [] });
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [workspaceEntered, setWorkspaceEntered] = useState(false);
  const [verificationDialog, setVerificationDialog] = useState(null);
  const [complianceDialog, setComplianceDialog] = useState(null);
  const [roleDialog, setRoleDialog] = useState(null);
  const chainFailureCountRef = useRef(0);
  const contractFailureCountRef = useRef({});

  const { address, isConnected } = useAccount();
  const walletChainId = useChainId();
  const { connect, connectors, isPending: connecting } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChainAsync, isPending: switchingChain } = useSwitchChain();
  const { writeContractAsync, isPending: writing } = useWriteContract();
  const targetChainId = chainIdFor(network);
  const publicClient = usePublicClient({ chainId: targetChainId });
  const networkDeployment = deploymentByNetwork[network] || deploymentByNetwork[defaultNetwork];
  const useEnvDeployment = network === defaultNetwork;
  const propertyVerificationAddress = useEnvDeployment
    ? addressOrFallback(import.meta.env.VITE_PROPERTY_VERIFICATION_ADDRESS, networkDeployment.propertyVerification)
    : networkDeployment.propertyVerification;
  const complianceVerifierAddress = useEnvDeployment
    ? addressOrFallback(import.meta.env.VITE_COMPLIANCE_VERIFIER_ADDRESS, networkDeployment.complianceVerifier)
    : networkDeployment.complianceVerifier;
  const ltvGroth16VerifierAddress = useEnvDeployment
    ? addressOrFallback(import.meta.env.VITE_LTV_GROTH16_VERIFIER_ADDRESS, networkDeployment.ltvGroth16Verifier)
    : networkDeployment.ltvGroth16Verifier;
  const lendingAddress = useEnvDeployment
    ? addressOrFallback(import.meta.env.VITE_LENDING_ADDRESS, networkDeployment.lending)
    : networkDeployment.lending;
  const roleAdminManagerAddress = useEnvDeployment
    ? addressOrFallback(import.meta.env.VITE_ROLE_ADMIN_MANAGER_ADDRESS, networkDeployment.roleAdminManager)
    : networkDeployment.roleAdminManager;
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
  const safeLtvGroth16VerifierAddress = isValidAddress(ltvGroth16VerifierAddress)
    ? ltvGroth16VerifierAddress
    : undefined;
  const safeLendingAddress = isValidAddress(lendingAddress) ? lendingAddress : undefined;
  const safeRoleAdminManagerAddress = isValidAddress(roleAdminManagerAddress)
    ? roleAdminManagerAddress
    : undefined;

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
    let checking = false;
    const targetNetwork = network;
    chainFailureCountRef.current = 0;
    setChainHealth({ ok: false, checked: false, blockNumber: null, network: targetNetwork });

    async function checkChain() {
      if (checking) return;
      checking = true;
      try {
        const blockNumber = await publicClient.getBlockNumber();
        chainFailureCountRef.current = 0;
        if (mounted) setChainHealth({ ok: true, checked: true, blockNumber, network: targetNetwork });
      } catch (_error) {
        chainFailureCountRef.current += 1;
        if (!mounted) return;
        setChainHealth((current) => {
          if (current.network && current.network !== targetNetwork) return current;
          if (chainFailureCountRef.current < 3) return { ...current, checked: true };
          return { ok: false, checked: true, blockNumber: null, network: targetNetwork };
        });
      } finally {
        checking = false;
      }
    }

    checkChain();
    const interval = window.setInterval(checkChain, 12000);
    return () => {
      mounted = false;
      window.clearInterval(interval);
    };
  }, [network, targetChainId]);

  useEffect(() => {
    let mounted = true;
    let checking = false;
    const contracts = {
      propertyVerification: safePropertyVerificationAddress,
      complianceVerifier: safeComplianceVerifierAddress,
      ltvGroth16Verifier: safeLtvGroth16VerifierAddress,
      lending: safeLendingAddress,
      roleAdminManager: safeRoleAdminManagerAddress
    };
    contractFailureCountRef.current = {};
    setContractHealth(
      Object.fromEntries(
        Object.entries(contracts).map(([key, addressValue]) => [
          key,
          addressValue
            ? { status: "checking", deployed: false, address: addressValue }
            : { status: "missing", deployed: false, address: "" }
        ])
      )
    );

    async function checkContracts() {
      if (checking) return;
      checking = true;
      try {
        const entries = await Promise.all(
          Object.entries(contracts).map(async ([key, addressValue]) => {
            if (!addressValue) return { key, next: { status: "missing", deployed: false, address: "" } };
            try {
              const bytecode = await publicClient.getBytecode({ address: addressValue });
              contractFailureCountRef.current[key] = 0;
              return {
                key,
                next: {
                  status: bytecode && bytecode !== "0x" ? "deployed" : "configured",
                  deployed: Boolean(bytecode && bytecode !== "0x"),
                  address: addressValue
                }
              };
            } catch (_error) {
              contractFailureCountRef.current[key] = (contractFailureCountRef.current[key] || 0) + 1;
              return { key, failed: true, address: addressValue };
            }
          })
        );
        if (!mounted) return;
        setContractHealth((current) => {
          const nextState = { ...current };
          entries.forEach((entry) => {
            if (entry.next) {
              nextState[entry.key] = entry.next;
              return;
            }
            const previous = current[entry.key];
            const sameAddress = addressesMatch(previous?.address, entry.address);
            if (entry.failed && contractFailureCountRef.current[entry.key] < 3 && sameAddress) {
              nextState[entry.key] = previous;
              return;
            }
            nextState[entry.key] = { status: "unreachable", deployed: false, address: entry.address };
          });
          return nextState;
        });
      } finally {
        checking = false;
      }
    }

    checkContracts();
    const interval = window.setInterval(checkContracts, 12000);
    return () => {
      mounted = false;
      window.clearInterval(interval);
    };
  }, [
    network,
    targetChainId,
    safePropertyVerificationAddress,
    safeComplianceVerifierAddress,
    safeLtvGroth16VerifierAddress,
    safeLendingAddress,
    safeRoleAdminManagerAddress
  ]);

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
      contractHealth.ltvGroth16Verifier?.deployed &&
      contractHealth.lending?.deployed &&
      contractHealth.roleAdminManager?.deployed
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

  const { data: protocolAdminStatus, refetch: refetchProtocolAdminStatus } = useReadContract({
    address: safeRoleAdminManagerAddress,
    abi: roleAdminManagerAbi,
    functionName: "hasProtocolAdmin",
    args: address ? [address] : undefined,
    chainId: chainIdFor(network),
    query: {
      enabled: Boolean(safeRoleAdminManagerAddress && address)
    }
  });

  const selectedRoleConfig = managedRoleConfigFor(roleTarget);
  const targetRoleContract = selectedRoleConfig.readContract;
  const targetRoleAbi = selectedRoleConfig.readAbi;
  const targetRoleReadArgs = isValidAddress(roleAddress)
    ? selectedRoleConfig.readFunctionName === "hasProtocolAdmin"
      ? [roleAddress]
      : [selectedRoleConfig.roleKey, roleAddress]
    : undefined;
  const {
    data: targetHasRole,
    refetch: refetchTargetRole,
    isFetching: fetchingTargetRole
  } = useReadContract({
    address: targetRoleContract,
    abi: targetRoleAbi,
    functionName: selectedRoleConfig.readFunctionName,
    args: targetRoleReadArgs,
    chainId: chainIdFor(network),
    query: {
      enabled: Boolean(targetRoleContract && targetRoleAbi && isValidAddress(roleAddress))
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
              rawRecord: {
                owner: data?.owner || "-",
                evidenceHash: data?.evidenceHash || "-",
                complianceHash: data?.complianceHash || "-",
                valuationCommitment: fullCommitment(data?.valuationCommitment),
                principalCommitment: fullCommitment(data?.principalCommitment),
                lastUpdated: formatted.lastUpdated
              },
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
      if (normalized === complianceRole.toLowerCase()) return t("complianceVerifierRole");
      return shortHash(role);
    }

    async function loadRoleAudit() {
      if (!publicClient) {
        if (mounted) setRoleAudit({ loading: false, rows: [] });
        return;
      }

      const sources = [
        safeRoleAdminManagerAddress
          ? { contract: t("roleAdminManagerContract"), address: safeRoleAdminManagerAddress, abi: roleAdminManagerAbi }
          : null,
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

      const eventStartBlock = eventStartBlockFor(network, chainHealth.blockNumber, networkDeployment);
      if (eventStartBlock === undefined) {
        if (mounted) setRoleAudit({ loading: false, rows: [] });
        return;
      }

      setRoleAudit((current) => ({ ...current, loading: true }));
      try {
        const eventGroups = await Promise.allSettled(
          sources.flatMap((source) =>
            ["RoleGranted", "RoleRevoked"].map(async (eventName) => {
              const logs = await publicClient.getContractEvents({
                  address: source.address,
                  abi: source.abi,
                  eventName,
                  fromBlock: eventStartBlock
                });
                return logs.map((log) => ({
                  id: `${source.address}-${eventName}-${log.transactionHash}-${log.logIndex}`,
                  contract: source.contract,
                  contractAddress: source.address,
                  action: eventName === "RoleGranted" ? t("grantRole") : t("revokeRole"),
                  actionType: eventName === "RoleGranted" ? "grant" : "revoke",
                  roleId: String(log.args.role || ""),
                  role: roleName(log.args.role),
                  account: log.args.account,
                  sender: log.args.sender,
                  blockNumber: log.blockNumber,
                  logIndex: Number(log.logIndex || 0),
                  tx: log.transactionHash
                }));
              })
            )
          );
          const rows = eventGroups
            .filter((result) => result.status === "fulfilled")
            .flatMap((result) => result.value)
            .sort((a, b) =>
              Number(b.blockNumber || 0n) - Number(a.blockNumber || 0n) ||
              Number(b.logIndex || 0) - Number(a.logIndex || 0)
            );
        if (mounted) setRoleAudit({ loading: false, rows });
      } catch (_error) {
        if (mounted) setRoleAudit({ loading: false, rows: [] });
      }
    }

    loadRoleAudit();
    return () => {
      mounted = false;
    };
  }, [
    publicClient,
    network,
    refreshNonce,
    language,
    chainHealth.blockNumber,
    networkDeployment,
    safeRoleAdminManagerAddress,
    safePropertyVerificationAddress,
    safeLendingAddress
  ]);

  useEffect(() => {
    let mounted = true;

    function loanEventLabel(eventName) {
      const labels = {
        LoanRequested: t("loanRequestedEvent"),
        LoanApproved: t("loanApprovedEvent"),
        LoanRejected: t("loanRejectedEvent"),
        LoanRejectedDueToVerification: t("loanRejectedVerificationEvent"),
        LoanRejectedDueToCompliance: t("loanRejectedComplianceEvent"),
        LoanRejectedDueToProofMismatch: t("loanRejectedProofMismatchEvent"),
        LoanRepaid: t("loanRepaidEvent"),
        LoanCancelled: t("loanCancelledEvent")
      };
      return labels[eventName] || eventName;
    }

    async function loadChainEventAudit() {
      if (!publicClient) {
        if (mounted) setChainEventAudit({ loading: false, rows: [] });
        return;
      }

      const eventSources = [
        safePropertyVerificationAddress
          ? [
              {
                source: t("propertyVerificationContract"),
                address: safePropertyVerificationAddress,
                abi: propertyVerificationAbi,
                eventName: "PropertyVerificationUpdated"
              },
              {
                source: t("propertyVerificationContract"),
                address: safePropertyVerificationAddress,
                abi: propertyVerificationAbi,
                eventName: "PropertyComplianceUpdated"
              }
            ]
          : [],
        safeComplianceVerifierAddress
          ? [
              {
                source: t("complianceVerifierContract"),
                address: safeComplianceVerifierAddress,
                abi: complianceVerifierAbi,
                eventName: "ComplianceProofVerified"
              }
            ]
          : [],
        safeLendingAddress
          ? [
              "LoanRequested",
              "LoanApproved",
              "LoanRejected",
              "LoanRejectedDueToVerification",
              "LoanRejectedDueToCompliance",
              "LoanRejectedDueToProofMismatch",
              "LoanRepaid",
              "LoanCancelled"
            ].map((eventName) => ({
              source: t("lendingContract"),
              address: safeLendingAddress,
              abi: lendingAbi,
              eventName
            }))
          : []
      ].flat();

      if (eventSources.length === 0) {
        if (mounted) setChainEventAudit({ loading: false, rows: [] });
        return;
      }

      const eventStartBlock = eventStartBlockFor(network, chainHealth.blockNumber, networkDeployment);
      if (eventStartBlock === undefined) {
        if (mounted) setChainEventAudit({ loading: false, rows: [] });
        return;
      }

      setChainEventAudit((current) => ({ ...current, loading: true }));
      try {
        const eventGroups = await Promise.allSettled(
          eventSources.map(async (source) => {
            const logs = await publicClient.getContractEvents({
              address: source.address,
              abi: source.abi,
              eventName: source.eventName,
              fromBlock: eventStartBlock
            });
            return Promise.all(logs.map(async (log) => {
              let transactionFrom = "-";
              try {
                const transaction = await publicClient.getTransaction({ hash: log.transactionHash });
                transactionFrom = transaction?.from || "-";
              } catch (_error) {
                transactionFrom = "-";
              }
              const args = log.args || {};
              const loanId = args.loanId !== undefined ? `#${args.loanId.toString()}` : "-";
              const propertyId = args.propertyId || "-";
              const isPropertyVerificationEvent = source.eventName === "PropertyVerificationUpdated";
              const isProofEvent = source.eventName === "PropertyComplianceUpdated" || source.eventName === "ComplianceProofVerified";
              const isLoanEvent = source.eventName.startsWith("Loan");
              const action =
                source.eventName === "ComplianceProofVerified"
                  ? t("complianceProofVerifiedEvent")
                  : isPropertyVerificationEvent
                  ? t("propertyVerificationEvent")
                  : isProofEvent
                    ? t("complianceProofEvent")
                    : loanEventLabel(source.eventName);
              const category = isLoanEvent ? t("loanEvent") : isProofEvent ? t("proofEvent") : t("assetEvent");
              const target = isLoanEvent ? loanId : propertyId;
              return {
                id: `${source.eventName}-${log.transactionHash}-${log.logIndex}`,
                category,
                categoryTone: isLoanEvent ? "amber" : isProofEvent ? "green" : "blue",
                source: source.source,
                eventName: source.eventName,
                action,
                contract: source.source,
                contractAddress: source.address,
                loanId,
                propertyId,
                target,
                operator: transactionFrom !== "-" ? transactionFrom : args.borrower || args.owner || "-",
                block: log.blockNumber?.toString() || "-",
                logIndex: Number(log.logIndex || 0),
                tx: log.transactionHash,
                fields: [
                  isLoanEvent && loanId !== "-" ? { label: t("loanId"), value: loanId } : null,
                  propertyId !== "-" ? { label: t("propertyKey"), value: propertyId, variant: "hash" } : null,
                  args.borrower ? { label: t("borrower"), value: args.borrower, variant: "hash" } : null,
                  args.owner ? { label: t("owner"), value: args.owner, variant: "hash" } : null,
                  args.verified !== undefined ? { label: t("statusVerified"), value: args.verified ? t("yes") : t("no") } : null,
                  args.compliant !== undefined ? { label: t("statusCompliant"), value: args.compliant ? t("yes") : t("no") } : null,
                  args.evidenceHash ? { label: t("registryEvidenceFingerprint"), value: args.evidenceHash, variant: "hash" } : null,
                  args.proofHash ? { label: t("zkProofFingerprint"), value: args.proofHash, variant: "hash" } : null,
                  args.valuationCommitment !== undefined
                    ? { label: t("valuationCommitment"), value: fullCommitment(args.valuationCommitment), variant: "hash" }
                    : null,
                  args.principalCommitment !== undefined
                    ? { label: t("principalCommitment"), value: fullCommitment(args.principalCommitment), variant: "hash" }
                    : null
                ].filter(Boolean),
                detail: []
              };
            }));
          })
        );
        const rows = eventGroups
          .filter((result) => result.status === "fulfilled")
          .flatMap((result) => result.value)
          .sort((a, b) =>
            Number(b.block === "-" ? 0 : b.block || 0) - Number(a.block === "-" ? 0 : a.block || 0) ||
            Number(b.logIndex || 0) - Number(a.logIndex || 0)
          );
        if (mounted) setChainEventAudit({ loading: false, rows });
      } catch (_error) {
        if (mounted) setChainEventAudit({ loading: false, rows: [] });
      }
    }

    loadChainEventAudit();
    return () => {
      mounted = false;
    };
  }, [
    publicClient,
    network,
    refreshNonce,
    language,
    safePropertyVerificationAddress,
    safeComplianceVerifierAddress,
    safeLendingAddress,
    chainHealth.blockNumber,
    networkDeployment
  ]);

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
  const protocolAdminComplete = Boolean(protocolAdminStatus?.complete ?? protocolAdminStatus?.[3]);
  const legacyAdmin = Boolean(isOracleAdmin || isLendingAdmin);
  const isAdmin = Boolean(
    safeRoleAdminManagerAddress ? protocolAdminComplete : legacyAdmin
  );
  const roleOracleOperatorActive = Boolean(isOracleOperator);
  const roleLoanOfficerActive = Boolean(isLoanOfficer);
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
      ltvSafe &&
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
      roleLoanOfficerActive &&
      currentLoan?.state === 0 &&
      loanApprovalReady &&
      !writing
  );
  const canRejectLoan = Boolean(
      isConnected &&
      walletNetworkReady &&
      lendingReady &&
      roleLoanOfficerActive &&
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

  const coreContractKeys = [
    "propertyVerification",
    "ltvGroth16Verifier",
    "complianceVerifier",
    "lending",
    "roleAdminManager"
  ];
  const deployedContractCount = coreContractKeys.filter(
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
      detail: `${deployedContractCount}/${coreContractKeys.length} ${t("deployedStatus")}`
    },
    {
      label: t("walletNetwork"),
      ready: isConnected && walletNetworkReady,
      detail: !isConnected ? t("noWallet") : walletNetworkReady ? networkLabel : t("wrongNetwork")
    }
  ];
  const readinessScore = readinessItems.filter((item) => item.ready).length;
  const readinessPercent = Math.round((readinessScore / Math.max(readinessItems.length, 1)) * 100);
  const isBorrower = Boolean(isConnected && ownedProperties.length > 0);

  useEffect(() => {
    let mounted = true;
    const activePropertyRoles = [
      isAdmin ? "admin" : null,
      roleLoanOfficerActive ? "loanOfficer" : null,
      roleOracleOperatorActive ? "oracle" : null
    ].filter(Boolean);
    if (!isConnected || activePropertyRoles.length === 0) {
      setPrivilegedProperties([]);
      return () => {
        mounted = false;
      };
    }

    Promise.all(activePropertyRoles.map((role) => getPropertiesForRole(network, role))).then((groups) => {
      if (!mounted) return;
      const byId = new Map();
      for (const property of groups.flat()) byId.set(property.propertyId, property);
      setPrivilegedProperties(Array.from(byId.values()));
    });

    return () => {
      mounted = false;
    };
  }, [isAdmin, isConnected, roleLoanOfficerActive, roleOracleOperatorActive, network]);

  const roleSummary = [
    isBorrower ? t("roleBorrower") : null,
    roleOracleOperatorActive ? t("roleOracle") : null,
    roleLoanOfficerActive ? t("roleLoanOfficer") : null,
    isAdmin ? t("roleAdmin") : null
  ].filter(Boolean);

  useEffect(() => {
    setRoleDirectoryPage(1);
  }, [roleDirectoryTarget]);

  useEffect(() => {
    setExpandedRoleAuditId("");
  }, [roleAuditPage]);

  useEffect(() => {
    setLoanAuditPage(1);
    setChainRecordPage(1);
    setSelectedChainRecordId("");
    setOnchainAuditPage(1);
    setSelectedOnchainAuditId("");
  }, [network]);

  function roleLabelFor(roleId) {
    if (roleId === "admin") return t("roleAdmin");
    if (roleId === "oracle") return t("roleOracle");
    return t("roleLoanOfficer");
  }

  function managedRoleConfigFor(roleId = roleTarget) {
    if (roleId === "admin") {
      if (!safeRoleAdminManagerAddress) {
        return {
          contracts: [safePropertyVerificationAddress, safeLendingAddress].filter(Boolean),
          readContract: safePropertyVerificationAddress,
          readAbi: propertyVerificationAbi,
          readFunctionName: "hasRole",
          writeContract: safePropertyVerificationAddress,
          writeAbi: propertyVerificationAbi,
          writeTargets: [
            { contract: safePropertyVerificationAddress, abi: propertyVerificationAbi },
            { contract: safeLendingAddress, abi: lendingAbi }
          ].filter((target) => target.contract),
          grantFunctionName: "grantRole",
          revokeFunctionName: "revokeRole",
          configuredAddresses: [configuredAdminAddress],
          roleKey: defaultAdminRole
        };
      }
      return {
        contracts: [safeRoleAdminManagerAddress],
        readContract: safeRoleAdminManagerAddress,
        readAbi: roleAdminManagerAbi,
        readFunctionName: "hasProtocolAdmin",
        writeContract: safeRoleAdminManagerAddress,
        writeAbi: roleAdminManagerAbi,
        writeTargets: [{ contract: safeRoleAdminManagerAddress, abi: roleAdminManagerAbi }],
        grantFunctionName: "grantProtocolAdmin",
        revokeFunctionName: "revokeProtocolAdmin",
        configuredAddresses: [configuredAdminAddress],
        roleKey: defaultAdminRole
      };
    }
    if (roleId === "oracle") {
      return {
        contracts: [safePropertyVerificationAddress].filter(Boolean),
        readContract: safePropertyVerificationAddress,
        readAbi: propertyVerificationAbi,
        readFunctionName: "hasRole",
        writeContract: safePropertyVerificationAddress,
        writeAbi: propertyVerificationAbi,
        writeTargets: [{ contract: safePropertyVerificationAddress, abi: propertyVerificationAbi }].filter((target) => target.contract),
        grantFunctionName: "grantRole",
        revokeFunctionName: "revokeRole",
        configuredAddresses: [configuredOracleAddress],
        roleKey: oracleRole
      };
    }
    return {
      contracts: [safeLendingAddress].filter(Boolean),
      readContract: safeLendingAddress,
      readAbi: lendingAbi,
      readFunctionName: "hasRole",
      writeContract: safeLendingAddress,
      writeAbi: lendingAbi,
      writeTargets: [{ contract: safeLendingAddress, abi: lendingAbi }].filter((target) => target.contract),
      grantFunctionName: "grantRole",
      revokeFunctionName: "revokeRole",
      configuredAddresses: [configuredLoanOfficerAddress],
      roleKey: loanOfficerRole
    };
  }

  function buildManagedRoleMembers(roleConfig) {
    const contractSet = new Set((roleConfig.contracts || []).map((item) => String(item || "").toLowerCase()));
    const members = new Map();
    const addContract = (account, contractAddress) => {
      if (!isValidAddress(account) || !isValidAddress(contractAddress)) return;
      const normalized = account.toLowerCase();
      const existing = members.get(normalized) || { address: account, contracts: new Set() };
      existing.contracts.add(contractAddress.toLowerCase());
      members.set(normalized, existing);
    };
    const removeContract = (account, contractAddress) => {
      const normalized = String(account || "").toLowerCase();
      const existing = members.get(normalized);
      if (!existing || !isValidAddress(contractAddress)) return;
      existing.contracts.delete(contractAddress.toLowerCase());
      if (existing.contracts.size === 0) members.delete(normalized);
    };

    for (const configuredAddress of roleConfig.configuredAddresses || []) {
      for (const contractAddress of roleConfig.contracts || []) addContract(configuredAddress, contractAddress);
    }

    roleAudit.rows
      .slice()
      .sort((a, b) =>
        Number(a.blockNumber || 0n) - Number(b.blockNumber || 0n) ||
        Number(a.logIndex || 0) - Number(b.logIndex || 0)
      )
      .forEach((row) => {
        if (String(row.roleId || "").toLowerCase() !== String(roleConfig.roleKey || "").toLowerCase()) return;
        if (!contractSet.has(String(row.contractAddress || "").toLowerCase())) return;
        if (row.actionType === "grant") addContract(row.account, row.contractAddress);
        if (row.actionType === "revoke") removeContract(row.account, row.contractAddress);
      });

    return Array.from(members.values()).sort((a, b) => a.address.localeCompare(b.address));
  }

  function addressHasManagedRole(roleId, targetAddress) {
    if (!isValidAddress(targetAddress)) return false;
    return buildManagedRoleMembers(managedRoleConfigFor(roleId)).some((member) => addressesMatch(member.address, targetAddress));
  }

  function addressHasCompleteManagedRole(roleConfig, targetAddress) {
    if (!isValidAddress(targetAddress)) return false;
    const contracts = roleConfig.contracts || [];
    const member = buildManagedRoleMembers(roleConfig).find((item) => addressesMatch(item.address, targetAddress));
    return Boolean(member && contracts.every((contractAddress) => member.contracts.has(String(contractAddress).toLowerCase())));
  }

  function normalizeRoleCheckResult(value, roleConfig = selectedRoleConfig) {
    if (roleConfig.readFunctionName === "hasProtocolAdmin") {
      return Boolean(value?.complete ?? value?.[3]);
    }
    return Boolean(value);
  }

  function operatorRoleLabelFor(targetAddress) {
    if (!isValidAddress(targetAddress)) return t("unknownActor");
    const labels = [];
    const coreContracts = [
      safePropertyVerificationAddress,
      safeComplianceVerifierAddress,
      safeLendingAddress,
      safeRoleAdminManagerAddress
    ].filter(Boolean);
    if (coreContracts.some((contractAddress) => addressesMatch(contractAddress, targetAddress))) {
      labels.push(t("contractActor"));
    }
    [
      ["admin", t("roleAdmin")],
      ["oracle", t("roleOracle")],
      ["loanOfficer", t("roleLoanOfficer")]
    ].forEach(([roleId, label]) => {
      if (addressHasManagedRole(roleId, targetAddress)) labels.push(label);
    });
    if (loanPortfolio.loans.some((loan) => addressesMatch(loan.borrower, targetAddress))) {
      labels.push(t("roleBorrower"));
    }
    return labels.length ? Array.from(new Set(labels)).join(" / ") : t("standardUserPermission");
  }

  function roleOperationBlockReason(roleId = roleTarget, targetAddress = roleAddress, operation = roleOperation) {
    if (!isValidAddress(targetAddress)) return t("invalidRoleAddress");
    const roleLabel = roleLabelFor(roleId);
    const roleConfig = managedRoleConfigFor(roleId);
    if ((roleConfig.contracts || []).length === 0 || (roleConfig.writeTargets || []).length === 0) return t("contractsMissing");
    const isCurrentRoleCheck = roleId === roleTarget && addressesMatch(targetAddress, roleAddress);
    const canUseLiveRoleCheck = Boolean(isCurrentRoleCheck && roleConfig.readContract);
    if (canUseLiveRoleCheck && (fetchingTargetRole || targetHasRole === undefined)) return t("checkingStatus");
    const liveHasRole = canUseLiveRoleCheck ? normalizeRoleCheckResult(targetHasRole, roleConfig) : false;
    const hasCompleteRole = isCurrentRoleCheck && (roleConfig.writeTargets || []).length === 1
      ? liveHasRole
      : addressHasCompleteManagedRole(roleConfig, targetAddress);
    const hasAnyRole = isCurrentRoleCheck && (roleConfig.writeTargets || []).length === 1
      ? liveHasRole
      : liveHasRole || addressHasManagedRole(roleId, targetAddress);
    if (operation === "grant" && hasCompleteRole) return `${t("duplicateGrantPrefix")}${roleLabel}${t("duplicateGrantSuffix")}`;
    if (operation === "revoke" && !hasAnyRole) return `${t("missingRevokePrefix")}${roleLabel}${t("missingRevokeSuffix")}`;
    if (operation === "revoke") {
      const roleMembers = buildManagedRoleMembers(roleConfig);
      const replacementMembers = roleId === "admin"
        ? roleMembers.filter((member) => !addressesMatch(member.address, safeRoleAdminManagerAddress))
        : roleMembers;
      const protectedContracts = roleConfig.contracts || [];
      const targetContracts = roleMembers.find((member) => addressesMatch(member.address, targetAddress))?.contracts || new Set();
      const wouldBreakRequiredRole = protectedContracts.some((contractAddress) => {
        const normalizedContract = String(contractAddress || "").toLowerCase();
        if (!targetContracts.has(normalizedContract)) return false;
        return !replacementMembers.some(
          (member) => !addressesMatch(member.address, targetAddress) && member.contracts.has(normalizedContract)
        );
      });
      if (wouldBreakRequiredRole) return t("minimumRoleRevokeBlocked");
    }
    return "";
  }

  const showBorrowerWorkflow = isConnected && !isAdmin && !roleLoanOfficerActive;
  const baseNavItems = [
    ...(showBorrowerWorkflow
      ? [
          { id: "verification", icon: Building2, label: "navVerification", title: "verificationViewTitle" },
          { id: "compliance", icon: ShieldCheck, label: "navCompliance", title: "complianceViewTitle" },
          { id: "loan", icon: CircleDollarSign, label: "navLoan", title: "loanViewTitle" }
        ]
      : []),
    ...(roleLoanOfficerActive
      ? [{ id: "approvals", icon: BadgeCheck, label: "navApprovals", title: "approvalViewTitle" }]
      : []),
    ...(isAdmin
      ? [
          { id: "admin-roles", icon: UserRoundCog, label: "navAdminRoles", title: "roleAccessManagement" },
          { id: "admin-ops", icon: Cpu, label: "navAdminOps", title: "contractNetworkOps" },
          { id: "admin-audit", icon: ListChecks, label: "navAdminAudit", title: "auditLogs" }
        ]
      : [])
  ];
  const navItems = baseNavItems;
  const activeNav = navItems.find((item) => item.id === activeView) || navItems[0];
  const activeViewId = activeNav?.id || activeView;

  useEffect(() => {
    if (!isConnected) {
      setActiveView("verification");
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
    setChainEventAudit({ loading: false, rows: [] });
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
    missing: t("missingStatus"),
    checking: t("checkingStatus")
  };
  const statusClass = {
    deployed: "success-text",
    configured: "warn-text",
    unreachable: "danger-text",
    missing: "warn-text",
    checking: "warn-text"
  };
  const contractRows = [
    {
      name: t("propertyVerificationContract"),
      type: t("onChain"),
      description: t("propertyVerificationOpsHint"),
      icon: Database,
      tone: "blue",
      status: contractHealth.propertyVerification?.status || (safePropertyVerificationAddress ? "configured" : "missing"),
      address: safePropertyVerificationAddress || "-",
      block: latestOracleActivity?.time || (chainHealth.blockNumber !== null ? chainHealth.blockNumber.toString() : "-"),
      tx: latestOracleActivity?.hash || "-"
    },
    {
      name: t("ltvGroth16VerifierContract"),
      type: t("onChain"),
      description: t("ltvGroth16VerifierOpsHint"),
      icon: LockKeyhole,
      tone: "green",
      status: contractHealth.ltvGroth16Verifier?.status || (safeLtvGroth16VerifierAddress ? "configured" : "missing"),
      address: safeLtvGroth16VerifierAddress || "-",
      block: latestOracleActivity?.time || (chainHealth.blockNumber !== null ? chainHealth.blockNumber.toString() : "-"),
      tx: latestOracleActivity?.hash || "-"
    },
    {
      name: t("complianceVerifierContract"),
      type: t("onChain"),
      description: t("complianceVerifierOpsHint"),
      icon: ShieldCheck,
      tone: "green",
      status: contractHealth.complianceVerifier?.status || (safeComplianceVerifierAddress ? "configured" : "missing"),
      address: safeComplianceVerifierAddress || "-",
      block: latestOracleActivity?.time || (chainHealth.blockNumber !== null ? chainHealth.blockNumber.toString() : "-"),
      tx: latestOracleActivity?.hash || "-"
    },
    {
      name: t("lendingContract"),
      type: t("onChain"),
      description: t("lendingOpsHint"),
      icon: CircleDollarSign,
      tone: "amber",
      status: contractHealth.lending?.status || (safeLendingAddress ? "configured" : "missing"),
      address: safeLendingAddress || "-",
      block: latestChainActivity?.time || (chainHealth.blockNumber !== null ? chainHealth.blockNumber.toString() : "-"),
      tx: latestChainActivity?.hash || "-"
    },
    {
      name: t("roleAdminManagerContract"),
      type: t("onChain"),
      description: t("roleAdminManagerOpsHint"),
      icon: UserRoundCog,
      tone: "blue",
      status: contractHealth.roleAdminManager?.status || (safeRoleAdminManagerAddress ? "configured" : "missing"),
      address: safeRoleAdminManagerAddress || "-",
      block: latestChainActivity?.time || (chainHealth.blockNumber !== null ? chainHealth.blockNumber.toString() : "-"),
      tx: latestChainActivity?.hash || "-"
    },
    {
      name: t("oracleUpdate"),
      type: t("oracle"),
      description: t("oracleApiOpsHint"),
      icon: Network,
      tone: "blue",
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
      refetchProtocolAdminStatus(),
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
    refetchProtocolAdminStatus,
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
  useWatchContractEvent({
    address: safeComplianceVerifierAddress,
    abi: complianceVerifierAbi,
    chainId: chainIdFor(network),
    eventName: "ComplianceProofVerified",
    enabled: Boolean(safeComplianceVerifierAddress),
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
            : !ltvSafe
              ? t("principalExceedsLimit")
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
    if (!loan || !roleLoanOfficerActive) {
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
      const message = isAdmin ? t("invalidRoleAddress") : t("adminRequired");
      pushActivity("error", message);
      setRoleDialog({ ok: false, message, role: roleLabelFor(roleTarget), operation: t(roleOperation === "grant" ? "grantRole" : "revokeRole"), address: roleAddress });
      return;
    }
    const blockedReason = roleOperationBlockReason();
    if (blockedReason) {
      pushActivity("error", blockedReason);
      setRoleDialog({ ok: false, message: blockedReason, role: roleLabelFor(roleTarget), operation: t(roleOperation === "grant" ? "grantRole" : "revokeRole"), address: roleAddress });
      return;
    }
    const writeTargets = selectedRoleConfig.writeTargets || [];

    if (writeTargets.length === 0) {
      pushActivity("error", t("contractsMissing"));
      setRoleDialog({
        ok: false,
        message: t("contractsMissing"),
        role: roleLabelFor(roleTarget),
        operation: t(roleOperation === "grant" ? "grantRole" : "revokeRole"),
        address: roleAddress
      });
      return;
    }

    setBusyAction("Role");
    setTxPhase("submitting");
    try {
      const functionName = roleOperation === "grant"
        ? selectedRoleConfig.grantFunctionName
        : selectedRoleConfig.revokeFunctionName;
      const args = selectedRoleConfig.readFunctionName === "hasProtocolAdmin"
        ? [roleAddress]
        : [selectedRoleConfig.roleKey, roleAddress];
      const hashes = [];
      for (const target of writeTargets) {
        const hash = await writeContractAsync({
          address: target.contract,
          abi: target.abi,
          functionName,
          args,
          chainId: chainIdFor(network)
        });
        hashes.push(hash);
        pushActivity("chain", `${functionName} ${t("txSubmitted")}`, hash);
        const receipt = await waitForReceipt(hash);
        recordGas(functionName, receipt);
      }
      await refreshAppState();
      setRoleDialog({
        ok: true,
        message: t("roleChangeSuccessCopy"),
        role: roleLabelFor(roleTarget),
        operation: t(roleOperation === "grant" ? "grantRole" : "revokeRole"),
        address: roleAddress,
        txHash: hashes.at(-1),
        contractCount: hashes.length
      });
    } catch (error) {
      await refreshAppState();
      const message = error.shortMessage || error.message;
      pushActivity("error", message);
      setRoleDialog({
        ok: false,
        message,
        role: roleLabelFor(roleTarget),
        operation: t(roleOperation === "grant" ? "grantRole" : "revokeRole"),
        address: roleAddress
      });
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
          </div>
          <div className="asset-identity-row">
            <div>
              <Database size={24} />
              <span>{t("propertyId")}</span>
              <strong>{selectedProperty?.propertyId || "-"}</strong>
            </div>
            <div>
              <Home size={24} />
              <span>{t("assetAddress")}</span>
              <strong>{selectedProperty?.address || "-"}</strong>
            </div>
          </div>
          <div className="asset-meta">
            <div>
              <Leaf size={24} />
              <span>{t("esgScore")}</span>
              <strong>{selectedProperty?.esgScore ?? "-"}</strong>
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
              <span>{t("loanAsset")}</span>
              <strong>{shortHash(selectedKey)}</strong>
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
                <strong className={index === 2 ? "step-title-loan" : ""}>{step.title}</strong>
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

  function updatePrincipalFromInput(nextValue) {
    const digits = nextValue.replace(/\D/g, "");
    if (!digits) {
      setPrincipal("");
      return;
    }
    const normalized = digits.replace(/^0+(?=\d)/, "");
    const maxAmount = BigInt(Math.max(0, maxPrincipal));
    const requestedAmount = BigInt(normalized);
    setPrincipal(String(maxAmount > 0n && requestedAmount > maxAmount ? maxAmount : requestedAmount));
  }

  function applyMaxPrincipal() {
    if (maxPrincipal > 0) setPrincipal(String(maxPrincipal));
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
            <div className="proof-principal-header">
              <label htmlFor="principal-input">{t("principal")}</label>
            </div>
            <div className="proof-principal-control">
              <input
                id="principal-input"
                name="proof-principal-current"
                value={principal}
                inputMode="numeric"
                autoComplete="off"
                onChange={(event) => updatePrincipalFromInput(event.target.value)}
              />
              <button type="button" onClick={applyMaxPrincipal} disabled={!maxPrincipal}>
                {t("maxAmountAction")}
              </button>
            </div>
          </div>
        </div>
        <div className="proof-action-row">
          <button
            className="primary-action workflow-action"
            onClick={handleCompliance}
            disabled={!canComply || busyAction === "Compliance"}
          >
            {busyAction === "Compliance" ? <Loader2 className="spin" size={17} /> : <ShieldCheck size={17} />}
            {t("generateProof")}
          </button>
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
            <span>{t("propertyId")}</span>
            <strong>{selectedProperty?.propertyId || "-"}</strong>
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
          { label: t("loanProperty"), value: currentLoan?.propertyId || selectedKey || "-", variant: "hash" },
          { label: t("borrower"), value: currentLoan?.borrower || address || "-", variant: "hash" }
        ]
      },
      {
        title: t("loanRecordCommitments"),
        className: "commitment-section",
        icon: Database,
        items: [
          { label: t("valuationCommitment"), value: fullCommitment(loanRecord?.valuationCommitment || record?.valuationCommitment), variant: "hash" },
          {
            label: t("principalCommitment"),
            value: fullCommitment(currentLoan ? currentLoan.principalCommitment : effectivePrincipalCommitmentAmount),
            variant: "hash"
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
              <section className={`record-section ${section.className || ""}`} key={section.title}>
                <div className="record-section-title">
                  <SectionIcon size={16} />
                  <strong>{section.title}</strong>
                </div>
                <dl className="record-list">
                  {section.items.map((item) => (
                    <div key={item.label}>
                      <dt>{item.label}</dt>
                      <dd className={item.variant === "hash" ? "full-hash-value" : ""}>{item.value}</dd>
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
          { label: t("propertyKey"), value: selectedKey || "-", variant: "hash" },
          { label: t("statusVerified"), value: isVerified ? t("yes") : t("no") },
          { label: t("statusCompliant"), value: isCompliant ? t("yes") : t("no") }
        ]
      },
      {
        title: t("recordVerificationProof"),
        icon: FileCheck2,
        items: [
          { label: t("registryEvidenceFingerprint"), value: record?.evidenceHash || "-", variant: "hash" },
          { label: t("valuationCommitment"), value: fullCommitment(record?.valuationCommitment), variant: "hash" }
        ]
      },
      {
        title: t("recordComplianceProof"),
        icon: ShieldCheck,
        items: [
          { label: t("zkProofFingerprint"), value: record?.complianceHash || "-", variant: "hash" },
          { label: t("principalCommitment"), value: fullCommitment(record?.principalCommitment), variant: "hash" },
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
                      <dd className={item.variant === "hash" ? "full-hash-value" : ""}>{item.value}</dd>
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

  function renderPropertyRecordAudit({
    rows = chainRecords.rows,
    selectedRow = null,
    page = 1,
    pageCount = 1,
    onPrevious,
    onNext,
    onSelect
  } = {}) {
    return (
      <article className="record-card panel admin-chain-record-panel">
        <div className="panel-heading">
          <h2>{t("propertyRecordAudit")}</h2>
          <Activity size={16} />
        </div>
        <div className="chain-record-table">
          <div className="chain-record-head">
            <span>{t("propertyId")}</span>
            <span>{t("propertyKey")}</span>
            <span>{t("statusVerified")}</span>
            <span>{t("statusCompliant")}</span>
            <span>{t("updated")}</span>
          </div>
          {chainRecords.rows.length === 0 ? (
            <p className="helper-copy">{chainRecords.loading ? t("loading") : t("noChainRecords")}</p>
          ) : (
            rows.map((row) => (
              <button
                className={`chain-record-row ${selectedRow?.property.propertyId === row.property.propertyId ? "active" : ""}`}
                key={row.property.propertyId}
                onClick={() => {
                  setSelectedId(row.property.propertyId);
                  onSelect?.(row.property.propertyId);
                }}
              >
                <strong>{row.property.propertyId}</strong>
                <span>{shortHash(row.propertyKey)}</span>
                <span>{row.record.verified ? t("yes") : t("no")}</span>
                <span>{row.record.compliant ? t("yes") : t("no")}</span>
                <span>{row.record.lastUpdated}</span>
              </button>
            ))
          )}
        </div>
        <div className="ledger-pagination">
          <span>{page} / {pageCount}</span>
          <button
            className="icon-only"
            onClick={onPrevious}
            disabled={page <= 1}
            aria-label={t("previousPage")}
          >
            <ChevronLeft size={16} />
          </button>
          <button
            className="icon-only"
            onClick={onNext}
            disabled={page >= pageCount}
            aria-label={t("nextPage")}
          >
            <ChevronRight size={16} />
          </button>
        </div>
        {selectedRow ? (
          <dl className="admin-role-change-detail audit-detail-grid audit-chain-detail">
            <div>
              <dt>{t("propertyId")}</dt>
              <dd>{selectedRow.property.propertyId}</dd>
            </div>
            <div>
              <dt>{t("assetAddress")}</dt>
              <dd>{selectedRow.property.address || "-"}</dd>
            </div>
            <div>
              <dt>{t("propertyKey")}</dt>
              <dd>{selectedRow.propertyKey}</dd>
            </div>
            <div>
              <dt>{t("registryEvidenceFingerprint")}</dt>
              <dd>{selectedRow.rawRecord?.evidenceHash || selectedRow.record.evidenceHash || "-"}</dd>
            </div>
            <div>
              <dt>{t("valuationCommitment")}</dt>
              <dd>{selectedRow.rawRecord?.valuationCommitment || selectedRow.record.valuationCommitment || "-"}</dd>
            </div>
            <div>
              <dt>{t("zkProofFingerprint")}</dt>
              <dd>{selectedRow.rawRecord?.complianceHash || selectedRow.record.complianceHash || "-"}</dd>
            </div>
            <div>
              <dt>{t("principalCommitment")}</dt>
              <dd>{selectedRow.rawRecord?.principalCommitment || selectedRow.record.principalCommitment || "-"}</dd>
            </div>
            <div>
              <dt>{t("updated")}</dt>
              <dd>{selectedRow.record.lastUpdated}</dd>
            </div>
          </dl>
        ) : (
          <p className="helper-copy">{chainRecords.loading ? t("loading") : t("selectPropertyRecord")}</p>
        )}
      </article>
    );
  }

  function renderLoanLedgerAudit({
    rows = [],
    selectedRow = null,
    loading = false,
    page = 1,
    pageCount = 1,
    totalCount = 0,
    onPrevious,
    onNext
  } = {}) {
    const stateKeys = ["requested", "approved", "repaid", "rejected", "cancelled"];
    const selectedLoanPropertyForAudit = selectedRow
      ? knownProperties.find((property) => propertyKey(property.propertyId) === selectedRow.propertyId)
      : null;
    const selectedLoanRecordForAudit = selectedRow
      ? chainRecords.rows.find((row) => String(row.propertyKey).toLowerCase() === String(selectedRow.propertyId).toLowerCase())
      : null;
    const selectedLoanState = selectedRow ? t(stateKeys[selectedRow.state] || "loanReadError") : "-";
    const selectedLoanSections = selectedRow
      ? [
          {
            title: t("loanRecordIdentity"),
            icon: WalletCards,
            items: [
              { label: t("loanId"), value: `#${selectedRow.id.toString()}` },
              { label: t("loanState"), value: selectedLoanState },
              { label: t("propertyId"), value: selectedLoanPropertyForAudit?.propertyId || "-" },
              { label: t("borrower"), value: selectedRow.borrower || "-", variant: "hash" }
            ]
          },
          {
            title: t("loanRecordCommitments"),
            icon: Database,
            items: [
              { label: t("loanProperty"), value: selectedRow.propertyId || "-", variant: "hash" },
              {
                label: t("valuationCommitment"),
                value: selectedLoanRecordForAudit?.rawRecord?.valuationCommitment || "-",
                variant: "hash"
              },
              { label: t("principalCommitment"), value: fullCommitment(selectedRow.principalCommitment), variant: "hash" }
            ]
          },
          {
            title: t("loanRecordTerms"),
            icon: CircleDollarSign,
            items: [
              { label: t("interestRate"), value: `${Number(selectedRow.interestRateBps || 0) / 100}%` },
              { label: t("term"), value: `${Number(selectedRow.termDays || 0)} ${t("days")}` },
              { label: t("requestedAt"), value: formatTimestamp(selectedRow.requestedAt) },
              { label: t("approvedAt"), value: selectedRow.approvedAt ? formatTimestamp(selectedRow.approvedAt) : "-" },
              { label: t("repaidAt"), value: selectedRow.repaidAt ? formatTimestamp(selectedRow.repaidAt) : "-" }
            ]
          }
        ]
      : [];

    return (
      <article className="record-card panel admin-loan-audit-panel">
        <div className="panel-heading">
          <h2>{t("loanLedgerAudit")}</h2>
          <CircleDollarSign size={16} />
        </div>
        <div className="chain-record-table admin-loan-audit-table">
          <div className="chain-record-head">
            <span>{t("loanId")}</span>
            <span>{t("propertyId")}</span>
            <span>{t("borrower")}</span>
            <span>{t("state")}</span>
            <span>{t("requestedAt")}</span>
          </div>
          {totalCount === 0 ? (
            <p className="helper-copy">{loading ? t("loading") : t("noLoanAuditRecords")}</p>
          ) : (
            rows.map((loan) => (
              <button
                className={`chain-record-row ${selectedRow?.id?.toString() === loan.id.toString() ? "active" : ""}`}
                key={loan.id.toString()}
                onClick={() => selectLoanRecord(loan)}
              >
                <strong>{`#${loan.id.toString()}`}</strong>
                <span>{knownProperties.find((property) => propertyKey(property.propertyId) === loan.propertyId)?.propertyId || "-"}</span>
                <span>{shortHash(loan.borrower)}</span>
                <span>{t(stateKeys[loan.state] || "loanReadError")}</span>
                <span>{formatTimestamp(loan.requestedAt)}</span>
              </button>
            ))
          )}
        </div>
        <div className="ledger-pagination">
          <span>{page} / {pageCount}</span>
          <button
            className="icon-only"
            onClick={onPrevious}
            disabled={page <= 1}
            aria-label={t("previousPage")}
          >
            <ChevronLeft size={16} />
          </button>
          <button
            className="icon-only"
            onClick={onNext}
            disabled={page >= pageCount}
            aria-label={t("nextPage")}
          >
            <ChevronRight size={16} />
          </button>
        </div>
        {selectedRow ? (
          <div className="record-section-list admin-loan-audit-detail">
            {selectedLoanSections.map((section) => {
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
                        <dd className={item.variant === "hash" ? "full-hash-value" : ""}>{item.value}</dd>
                      </div>
                    ))}
                  </dl>
                </section>
              );
            })}
          </div>
        ) : (
          <p className="helper-copy">{loading ? t("loading") : t("selectLoanAuditRecord")}</p>
        )}
      </article>
    );
  }

  function renderOnchainAuditDetail(row) {
    if (!row) return <p className="helper-copy">{t("selectOnchainAuditRecord")}</p>;
    const eventFields = row.fields && row.fields.length ? row.fields : [{ label: t("eventTarget"), value: row.target || "-" }];
    const metadataFields = [
      { label: t("eventName"), value: row.eventName },
      { label: t("operatorRole"), value: operatorRoleLabelFor(row.operator) },
      { label: t("changedBy"), value: row.operator || "-", variant: "hash" },
      { label: t("contract"), value: row.contract },
      { label: t("contractAddress"), value: row.contractAddress, variant: "hash" },
      { label: t("latestBlock"), value: row.block },
      { label: t("latestTx"), value: row.tx, variant: "hash" }
    ];

    return (
      <div className="onchain-event-detail">
        <div className="onchain-event-summary">
          <span className={`event-type-pill ${row.categoryTone || "blue"}`}>{row.category}</span>
          <div>
            <strong>{row.action}</strong>
            <small>{row.target || "-"}</small>
          </div>
        </div>
        <section className="record-section">
          <div className="record-section-title">
            <ListChecks size={16} />
            <strong>{t("eventPayload")}</strong>
          </div>
          <dl className="record-list onchain-event-fields">
            {eventFields.map((item) => (
              <div key={item.label}>
                <dt>{item.label}</dt>
                <dd className={item.variant === "hash" ? "full-hash-value" : ""}>{item.value}</dd>
              </div>
            ))}
          </dl>
        </section>
        <section className="record-section">
          <div className="record-section-title">
            <Activity size={16} />
            <strong>{t("eventMetadata")}</strong>
          </div>
          <dl className="record-list onchain-event-fields">
            {metadataFields.map((item) => (
              <div key={item.label}>
                <dt>{item.label}</dt>
                <dd className={item.variant === "hash" ? "full-hash-value" : ""}>{item.value}</dd>
              </div>
            ))}
          </dl>
        </section>
      </div>
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
    const stateTones = ["amber", "green", "muted", "danger", "muted"];
    const currentLoanTone = currentLoan ? stateTones[currentLoan.state] || "muted" : "muted";
    const closedLoanCount = loanStats.repaid + loanStats.rejected + loanStats.cancelled;
    const approvalOverviewCards = [
      {
        label: t("pendingApprovals"),
        value: loanStats.requested,
        detail: t("currentlyPending"),
        icon: Send,
        tone: "amber"
      },
      {
        label: t("issuedLoans"),
        value: loanStats.approved,
        detail: t("activeApproved"),
        icon: BadgeCheck,
        tone: "green"
      },
      {
        label: t("activeCollateral"),
        value: loanStats.activeProperties.size,
        detail: t("lockedAssets"),
        icon: Building2,
        tone: "blue"
      },
      {
        label: t("closedLoans"),
        value: closedLoanCount,
        detail: t("repaidRejectedCancelled"),
        icon: ListChecks,
        tone: "muted"
      }
    ];
    const approvalDecisionSections = [
      {
        title: t("loanRecordIdentity"),
        icon: WalletCards,
        items: [
          { label: t("loanId"), value: currentLoan ? `#${currentLoan.id.toString()}` : t("selectLoanToReview") },
          { label: t("loanState"), value: currentLoan ? loanStateLabel : "-" },
          { label: t("propertyId"), value: selectedLoanProperty?.propertyId || "-" },
          { label: t("loanProperty"), value: currentLoan?.propertyId || "-", variant: "hash" },
          { label: t("borrower"), value: currentLoan?.borrower || "-", variant: "hash" }
        ]
      },
      {
        title: t("loanRecordCommitments"),
        icon: Database,
        items: [
          { label: t("valuationCommitment"), value: currentLoan ? fullCommitment(loanRecord?.valuationCommitment) : "-", variant: "hash" },
          { label: t("principalCommitment"), value: currentLoan ? fullCommitment(currentLoan.principalCommitment) : "-", variant: "hash" },
          { label: t("proofBinding"), value: currentLoan ? (loanProofMatchesPrincipal ? t("matched") : t("notMatched")) : "-" },
          { label: t("activeCollateralLock"), value: currentLoan ? collateralLockLabel : "-" }
        ]
      },
      {
        title: t("loanRecordTerms"),
        icon: CircleDollarSign,
        items: [
          { label: t("interestRate"), value: currentLoan ? `${Number(currentLoan.interestRateBps) / 100}%` : "-" },
          { label: t("term"), value: currentLoan ? `${Number(currentLoan.termDays)} ${t("days")}` : "-" },
          { label: t("requestedAt"), value: currentLoan ? formatTimestamp(currentLoan.requestedAt) : "-" },
          { label: t("approvedAt"), value: currentLoan?.approvedAt ? formatTimestamp(currentLoan.approvedAt) : "-" },
          { label: t("repaidAt"), value: currentLoan?.repaidAt ? formatTimestamp(currentLoan.repaidAt) : "-" }
        ]
      }
    ];

    return (
      <div className="workspace-view view-scroll approval-view">
        <section className="approval-overview-grid">
          {approvalOverviewCards.map((card) => {
            const CardIcon = card.icon;
            return (
              <article className={`approval-overview-card panel ${card.tone}`} key={card.label}>
                <div>
                  <span>{card.label}</span>
                  <strong>{card.value}</strong>
                  <small>{card.detail}</small>
                </div>
                <CardIcon size={20} />
              </article>
            );
          })}
        </section>

        <section className="approval-ledger-shell">
          <div className="panel-heading">
            <h2>{t("loanOfficerWorkbench")}</h2>
            <span className="status-chip blue">{filteredLoans.length} {t("record")}</span>
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
          <LoanLedger
            t={t}
            title={t("loanBook")}
            loans={filteredLoans}
            loading={loanPortfolio.loading}
            emptyText={t("noLoansForStatus")}
            rowKey={(loan) => loan.id.toString()}
            selectedLoanId={selectedLoanId}
            selectLoanRecord={selectLoanRecord}
            pageSize={5}
            columns={[
              { key: "id", label: t("loanId"), strong: true, render: (loan) => `#${loan.id.toString()}` },
              {
                key: "propertyCode",
                label: t("propertyId"),
                render: (loan) =>
                  knownProperties.find((property) => propertyKey(property.propertyId) === loan.propertyId)?.propertyId || "-"
              },
              { key: "borrower", label: t("borrower"), render: (loan) => shortHash(loan.borrower) },
              { key: "state", label: t("state"), render: (loan) => t(stateKeys[loan.state] || "loanReadError") },
              { key: "requestedAt", label: t("requestedAt"), render: (loan) => formatTimestamp(loan.requestedAt) },
              { key: "principalCommitment", label: t("principalCommitment"), render: (loan) => shortField(loan.principalCommitment) }
            ]}
          />
        </section>

        <article className="approval-decision-full panel">
          <div className="panel-heading">
            <h2>{t("approvalDecision")}</h2>
            <span className={`status-chip ${currentLoanTone}`}>
              {currentLoan ? loanStateLabel : t("selectLoanToReview")}
            </span>
          </div>
          <div className="approval-decision-layout">
            <div className="approval-detail-sections">
              {approvalDecisionSections.map((section) => {
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
                          <dd className={item.variant === "hash" ? "full-hash-value" : ""}>{item.value}</dd>
                        </div>
                      ))}
                    </dl>
                  </section>
                );
              })}
            </div>
            <div className="approval-decision-actions">
              <button
                className="approval-approve-button"
                onClick={handleApproveLoan}
                disabled={!canApproveLoan}
              >
                <BadgeCheck size={18} />
                {busyAction === "approveLoan" ? actionText("approveLoan") : t("approveLoan")}
              </button>
              <button
                className="approval-reject-button"
                onClick={() => handleRejectLoan()}
                disabled={!canRejectLoan}
              >
                <XCircle size={18} />
                {busyAction === "rejectLoan" ? actionText("rejectLoan") : t("rejectLoan")}
              </button>
            </div>
          </div>
        </article>
      </div>
    );
  }

  function renderAdmin(section = "roles") {
    const opsOverviewCards = [
      {
        label: t("proofLatency"),
        value: averageProofLatency ? `${(averageProofLatency / 1000).toFixed(2)}s` : "-",
        detail: averageProofLatency ? t("sessionAverage") : t("sessionMetric"),
        icon: Activity,
        tone: averageProofLatency ? "green" : "muted"
      },
      {
        label: t("gasCost"),
        value: latestGas ? Number(latestGas).toLocaleString() : "-",
        detail: averageGas ? `${t("avgGas")} ${Math.round(averageGas).toLocaleString()}` : t("latestGasUsed"),
        icon: CircleDollarSign,
        tone: latestGas ? "blue" : "muted"
      },
      {
        label: t("rpcStatus"),
        value: rpcReady ? t("readyStatus") : t("unreachableStatus"),
        detail: chainHealth.blockNumber !== null ? `${t("blockHeight")} ${chainHealth.blockNumber.toString()}` : networkLabel,
        icon: Network,
        tone: rpcReady ? "green" : "amber"
      },
      {
        label: t("contractCoverage"),
        value: `${deployedContractCount}/${coreContractKeys.length}`,
        detail: fullContractsReady ? t("allCoreContractsOnline") : t("contractAttentionNeeded"),
        icon: Cpu,
        tone: fullContractsReady ? "green" : "amber"
      },
      {
        label: t("oracleService"),
        value: oracleHealth.ok ? t("readyStatus") : oracleHealth.checked ? t("unreachableStatus") : t("missingStatus"),
        detail: import.meta.env.VITE_ORACLE_API_URL || "http://localhost:8787",
        icon: Database,
        tone: oracleHealth.ok ? "green" : "amber"
      },
      {
        label: t("onchainEventIndex"),
        value: chainEventAudit.rows.length + roleAudit.rows.length,
        detail: t("onchainEventIndexDetail"),
        icon: ListChecks,
        tone: chainEventAudit.rows.length + roleAudit.rows.length ? "blue" : "muted"
      }
    ];
    const manageableRoleCards = [
      {
        id: "admin",
        label: t("roleAdmin"),
        description: t("adminRoleDescription"),
        ...managedRoleConfigFor("admin"),
        icon: ShieldCheck
      },
      {
        id: "oracle",
        label: t("roleOracle"),
        description: t("oracleRoleDescription"),
        ...managedRoleConfigFor("oracle"),
        icon: Database
      },
      {
        id: "loanOfficer",
        label: t("roleLoanOfficer"),
        description: t("loanOfficerRoleDescription"),
        ...managedRoleConfigFor("loanOfficer"),
        icon: BadgeCheck
      }
    ];
    const selectedRoleCard = manageableRoleCards.find((item) => item.id === roleTarget) || manageableRoleCards[0];
    const roleDirectoryCards = manageableRoleCards.map((roleCard) => ({
      ...roleCard,
      members: buildManagedRoleMembers(roleCard)
    }));
    const roleDirectoryPageSize = 4;
    const roleAuditPageSize = 5;
    const selectedDirectoryRole = roleDirectoryCards.find((item) => item.id === roleDirectoryTarget) || roleDirectoryCards[0];
    const roleMemberPageCount = Math.max(1, Math.ceil(selectedDirectoryRole.members.length / roleDirectoryPageSize));
    const currentRoleDirectoryPage = Math.min(roleDirectoryPage, roleMemberPageCount);
    const visibleRoleMembers = selectedDirectoryRole.members.slice(
      (currentRoleDirectoryPage - 1) * roleDirectoryPageSize,
      currentRoleDirectoryPage * roleDirectoryPageSize
    );
    const currentTargetRoleLabel = !isValidAddress(roleAddress)
      ? t("invalidRoleAddress")
      : fetchingTargetRole || targetHasRole === undefined
        ? t("checkingStatus")
        : normalizeRoleCheckResult(targetHasRole)
          ? selectedRoleCard.label
          : t("standardUserPermission");
    const managedRoleIds = new Set(manageableRoleCards.map((item) => String(item.roleKey || "").toLowerCase()));
    const initialConfiguredGrantIds = new Set();
    const seenConfiguredGrants = new Set();
    roleAudit.rows
      .slice()
      .sort((a, b) =>
        Number(a.blockNumber || 0n) - Number(b.blockNumber || 0n) ||
        Number(a.logIndex || 0) - Number(b.logIndex || 0)
      )
      .forEach((row) => {
        if (row.actionType !== "grant") return;
        const roleCard = manageableRoleCards.find((item) =>
          String(row.roleId || "").toLowerCase() === String(item.roleKey || "").toLowerCase()
        );
        if (!roleCard || !(roleCard.configuredAddresses || []).some((configuredAddress) => addressesMatch(configuredAddress, row.account))) {
          return;
        }
        const baselineKey = [
          String(row.roleId || "").toLowerCase(),
          String(row.contractAddress || "").toLowerCase(),
          String(row.account || "").toLowerCase()
        ].join(":");
        if (seenConfiguredGrants.has(baselineKey)) return;
        seenConfiguredGrants.add(baselineKey);
        initialConfiguredGrantIds.add(row.id);
      });
    const roleChangeRows = roleAudit.rows.filter((row) =>
      managedRoleIds.has(String(row.roleId || "").toLowerCase()) &&
      manageableRoleCards.some((item) =>
        String(row.roleId || "").toLowerCase() === String(item.roleKey || "").toLowerCase() &&
        (item.contracts || []).some((contractAddress) => addressesMatch(contractAddress, row.contractAddress))
      ) &&
      !initialConfiguredGrantIds.has(row.id)
    );
    const roleAuditPageCount = Math.max(1, Math.ceil(roleChangeRows.length / roleAuditPageSize));
    const currentRoleAuditPage = Math.min(roleAuditPage, roleAuditPageCount);
    const visibleRoleAuditRows = roleChangeRows.slice(
      (currentRoleAuditPage - 1) * roleAuditPageSize,
      currentRoleAuditPage * roleAuditPageSize
    );
    const expandedRoleAuditRow = visibleRoleAuditRows.find((row) => row.id === expandedRoleAuditId);
    const loanAuditPageSize = 5;
    const loanAuditPageCount = Math.max(1, Math.ceil(loanPortfolio.loans.length / loanAuditPageSize));
    const currentLoanAuditPage = Math.min(loanAuditPage, loanAuditPageCount);
    const visibleLoanAuditRows = loanPortfolio.loans.slice(
      (currentLoanAuditPage - 1) * loanAuditPageSize,
      currentLoanAuditPage * loanAuditPageSize
    );
    const selectedLoanAuditRow =
      visibleLoanAuditRows.find((loan) => loan.id.toString() === selectedLoanId) ||
      visibleLoanAuditRows[0] ||
      null;
    const chainRecordPageSize = 5;
    const chainRecordPageCount = Math.max(1, Math.ceil(chainRecords.rows.length / chainRecordPageSize));
    const currentChainRecordPage = Math.min(chainRecordPage, chainRecordPageCount);
    const visibleChainRecordRows = chainRecords.rows.slice(
      (currentChainRecordPage - 1) * chainRecordPageSize,
      currentChainRecordPage * chainRecordPageSize
    );
    const selectedChainRecord =
      visibleChainRecordRows.find((row) => row.property.propertyId === selectedChainRecordId) ||
      visibleChainRecordRows[0] ||
      null;
    const roleOnchainRows = roleChangeRows.map((row) => ({
      id: `role-${row.id}`,
      category: t("permissionEvent"),
      categoryTone: row.actionType === "grant" ? "green" : "muted",
      source: t("roleAuditTrail"),
      eventName: row.actionType === "grant" ? "RoleGranted" : "RoleRevoked",
      action: row.action,
      contract: row.contract,
      contractAddress: row.contractAddress,
      loanId: "-",
      propertyId: "-",
      target: row.account,
      operator: row.sender,
      block: row.blockNumber?.toString() || "-",
      logIndex: row.logIndex || 0,
      tx: row.tx,
      fields: [
        { label: t("roleTarget"), value: row.role },
        { label: t("roleAddress"), value: row.account, variant: "hash" },
        { label: t("changedBy"), value: row.sender, variant: "hash" }
      ],
      detail: []
    }));
    const onchainAuditRows = [...chainEventAudit.rows, ...roleOnchainRows].sort((a, b) =>
      Number(b.block === "-" ? 0 : b.block || 0) - Number(a.block === "-" ? 0 : a.block || 0) ||
      Number(b.logIndex || 0) - Number(a.logIndex || 0)
    );
    const onchainAuditPageSize = 5;
    const onchainAuditPageCount = Math.max(1, Math.ceil(onchainAuditRows.length / onchainAuditPageSize));
    const currentOnchainAuditPage = Math.min(onchainAuditPage, onchainAuditPageCount);
    const visibleOnchainAuditRows = onchainAuditRows.slice(
      (currentOnchainAuditPage - 1) * onchainAuditPageSize,
      currentOnchainAuditPage * onchainAuditPageSize
    );
    const selectedOnchainAuditRow =
      visibleOnchainAuditRows.find((row) => row.id === selectedOnchainAuditId) ||
      visibleOnchainAuditRows[0] ||
      null;
    const loanAuditEventCount = onchainAuditRows.filter((row) => String(row.eventName || "").startsWith("Loan")).length;
    const proofAuditEventCount = onchainAuditRows.filter((row) =>
      ["PropertyComplianceUpdated", "ComplianceProofVerified"].includes(row.eventName)
    ).length;
    const assetAuditEventCount = onchainAuditRows.filter((row) => row.eventName === "PropertyVerificationUpdated").length;
    const permissionAuditEventCount = onchainAuditRows.filter((row) =>
      ["RoleGranted", "RoleRevoked"].includes(row.eventName)
    ).length;
    const auditSummaryCards = [
      {
        label: t("auditPortfolioSnapshot"),
        value: loanPortfolio.loans.length,
        detail: `${loanStats.requested} ${t("requested")} / ${loanStats.approved} ${t("approved")}`,
        icon: ListChecks,
        tone: loanPortfolio.loans.length ? "blue" : "muted"
      },
      {
        label: t("auditPendingReview"),
        value: loanStats.requested,
        detail: t("auditPendingReviewDetail"),
        icon: Send,
        tone: loanStats.requested ? "amber" : "muted"
      },
      {
        label: t("auditIssuedExposure"),
        value: loanStats.approved,
        detail: `${loanStats.activeProperties.size} ${t("auditLockedAssets")}`,
        icon: BadgeCheck,
        tone: loanStats.approved ? "green" : "muted"
      },
      {
        label: t("auditOnchainActivity"),
        value: onchainAuditRows.length,
        detail: `${loanAuditEventCount} ${t("loanEvent")} / ${proofAuditEventCount} ${t("proofEvent")}`,
        icon: Database,
        tone: onchainAuditRows.length ? "green" : "muted"
      },
      {
        label: t("auditAssetProofCoverage"),
        value: proofAuditEventCount,
        detail: `${assetAuditEventCount} ${t("assetEvent")}`,
        icon: ShieldCheck,
        tone: proofAuditEventCount ? "green" : assetAuditEventCount ? "blue" : "muted"
      },
      {
        label: t("auditPermissionChanges"),
        value: permissionAuditEventCount,
        detail: t("auditPermissionChangesDetail"),
        icon: UserRoundCog,
        tone: permissionAuditEventCount ? "blue" : "muted"
      }
    ];
    const targetOperationBlockReason = roleOperationBlockReason();
    const targetOperationBlocked = Boolean(targetOperationBlockReason);
    const targetOperationStatus = !isValidAddress(roleAddress)
      ? t("waitingForAddress")
      : targetOperationBlockReason === t("checkingStatus")
        ? t("checkingStatus")
      : targetOperationBlocked
        ? t("cannotSubmit")
        : t("canSubmit");
    const targetImpactLabel = !isValidAddress(roleAddress)
      ? t("invalidRoleAddress")
      : targetOperationBlockReason || (roleOperation === "grant"
        ? `${t("addRoleAction")}${selectedRoleCard.label}${t("roleSuffix")}`
        : `${t("removeRoleAction")}${selectedRoleCard.label}${t("roleSuffix")}`);

    return (
      <div className="workspace-view view-scroll admin-console-view">
        {section === "roles" && (
        <section className="admin-section admin-role-page admin-page-panel">
          <article className="admin-role-directory-panel panel">
            <div className="panel-heading">
              <h2>{t("permissionAddressDirectory")}</h2>
              <UserRoundCog size={16} />
            </div>
            <div className="admin-role-directory-shell">
              <div className="admin-role-directory-nav">
                {roleDirectoryCards.map((item) => {
                  const RoleIcon = item.icon;
                  return (
                    <button
                      className={roleDirectoryTarget === item.id ? "active" : ""}
                      key={item.id}
                      onClick={() => {
                        setRoleDirectoryTarget(item.id);
                        setRoleDirectoryPage(1);
                      }}
                    >
                      <RoleIcon size={18} />
                      <span>{item.label}</span>
                      <strong>{item.members.length}</strong>
                    </button>
                  );
                })}
              </div>
              <div className="admin-role-address-book">
                <div className="admin-address-list">
                  {selectedDirectoryRole.members.length === 0 ? (
                    <p className="helper-copy">{t("noRoleMembers")}</p>
                  ) : (
                    visibleRoleMembers.map((member) => (
                      <div className="admin-address-row" key={member.address}>
                        <span>{member.address}</span>
                      </div>
                    ))
                  )}
                </div>
                <div className="ledger-pagination admin-address-pagination">
                  <span>{currentRoleDirectoryPage} / {roleMemberPageCount}</span>
                  <button
                    className="icon-only"
                    onClick={() => setRoleDirectoryPage((page) => Math.max(1, page - 1))}
                    disabled={currentRoleDirectoryPage <= 1}
                    aria-label={t("previousPage")}
                  >
                    <ChevronLeft size={16} />
                  </button>
                  <button
                    className="icon-only"
                    onClick={() => setRoleDirectoryPage((page) => Math.min(roleMemberPageCount, page + 1))}
                    disabled={currentRoleDirectoryPage >= roleMemberPageCount}
                    aria-label={t("nextPage")}
                  >
                    <ChevronRight size={16} />
                  </button>
                </div>
              </div>
            </div>
          </article>

          <div className="admin-role-main-grid">
            <article className="admin-control-panel admin-role-command panel">
              <div className="panel-heading">
                <h2>{t("roleCommandCenter")}</h2>
                <UserRoundCog size={16} />
              </div>
              <div className="admin-field-group">
                <span>{t("roleTarget")}</span>
                <div className="admin-role-selector">
                  {manageableRoleCards.map((item) => {
                    const RoleIcon = item.icon;
                    return (
                      <button
                        className={roleTarget === item.id ? "active" : ""}
                        key={item.id}
                        onClick={() => {
                          setRoleTarget(item.id);
                          setRoleDirectoryPage(1);
                        }}
                      >
                        <RoleIcon size={17} />
                        <div>
                          <strong>{item.label}</strong>
                          <small>{item.description}</small>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="admin-field-group">
                <span>{t("roleOperation")}</span>
                <div className="admin-operation-toggle">
                  <button
                    className={roleOperation === "grant" ? "active grant" : ""}
                    onClick={() => setRoleOperation("grant")}
                  >
                    <BadgeCheck size={17} />
                    {t("grantRole")}
                  </button>
                  <button
                    className={roleOperation === "revoke" ? "active revoke" : ""}
                    onClick={() => setRoleOperation("revoke")}
                  >
                    <XCircle size={17} />
                    {t("revokeRole")}
                  </button>
                </div>
              </div>
              <label className="admin-field-group admin-address-field">
                <span>{t("roleAddress")}</span>
                <input
                  value={roleAddress}
                  onChange={(event) => setRoleAddress(event.target.value)}
                  placeholder="0x..."
                />
              </label>
              <button
                className="admin-role-submit"
                onClick={handleRoleUpdate}
                disabled={!isAdmin || busyAction === "Role" || targetOperationBlocked}
              >
                {busyAction === "Role" ? <Loader2 className="spin" size={17} /> : <UserRoundCog size={17} />}
                {busyAction === "Role" ? actionText("applyRoleChange") : t("applyRoleChange")}
              </button>
            </article>

            <article className="admin-target-panel panel">
              <div className="panel-heading">
                <h2>{t("targetInspector")}</h2>
                <ShieldCheck size={16} />
              </div>
              <dl className="admin-target-list">
                <div>
                  <dt>{t("roleAddress")}</dt>
                  <dd className="admin-full-address">{isValidAddress(roleAddress) ? roleAddress : "-"}</dd>
                </div>
                <div>
                  <dt>{t("selectedTargetRole")}</dt>
                  <dd>{currentTargetRoleLabel}</dd>
                </div>
                <div>
                  <dt>{t("operationImpact")}</dt>
                  <dd>{targetImpactLabel}</dd>
                </div>
                <div className={targetOperationBlocked ? "blocked" : "ready"}>
                  <dt>{t("operationStatus")}</dt>
                  <dd>{targetOperationStatus}</dd>
                </div>
              </dl>
            </article>
          </div>

          <article className="admin-control-panel admin-role-history panel">
            <div className="panel-heading">
              <h2>{t("roleChangeRecords")}</h2>
              <ListChecks size={16} />
            </div>
            <div className="role-audit-table admin-role-history-table">
              <div className="role-audit-head">
                <span>{t("roleOperation")}</span>
                <span>{t("roleTarget")}</span>
                <span>{t("roleAddress")}</span>
              </div>
              {roleChangeRows.length === 0 ? (
                <p className="helper-copy">{roleAudit.loading ? t("loading") : t("noRoleAudit")}</p>
              ) : (
                visibleRoleAuditRows.map((row) => (
                  <button
                    className={`role-audit-row ${expandedRoleAuditId === row.id ? "active" : ""}`}
                    key={row.id}
                    onClick={() => setExpandedRoleAuditId((current) => (current === row.id ? "" : row.id))}
                  >
                    <strong>{row.action}</strong>
                    <span>{row.role}</span>
                    <span className="admin-full-address">{row.account}</span>
                  </button>
                ))
              )}
            </div>
            <div className="ledger-pagination">
              <span>{currentRoleAuditPage} / {roleAuditPageCount}</span>
              <button
                className="icon-only"
                onClick={() => setRoleAuditPage((page) => Math.max(1, page - 1))}
                disabled={currentRoleAuditPage <= 1}
                aria-label={t("previousPage")}
              >
                <ChevronLeft size={16} />
              </button>
              <button
                className="icon-only"
                onClick={() => setRoleAuditPage((page) => Math.min(roleAuditPageCount, page + 1))}
                disabled={currentRoleAuditPage >= roleAuditPageCount}
                aria-label={t("nextPage")}
              >
                <ChevronRight size={16} />
              </button>
            </div>
            {expandedRoleAuditRow && (
              <dl className="admin-role-change-detail">
                <div>
                  <dt>{t("roleAddress")}</dt>
                  <dd>{expandedRoleAuditRow.account}</dd>
                </div>
                <div>
                  <dt>{t("changedBy")}</dt>
                  <dd>{expandedRoleAuditRow.sender}</dd>
                </div>
                <div>
                  <dt>{t("contract")}</dt>
                  <dd>{expandedRoleAuditRow.contract}</dd>
                </div>
                <div>
                  <dt>{t("contractAddress")}</dt>
                  <dd>{expandedRoleAuditRow.contractAddress}</dd>
                </div>
                <div>
                  <dt>{t("latestBlock")}</dt>
                  <dd>{expandedRoleAuditRow.blockNumber?.toString() || "-"}</dd>
                </div>
                <div>
                  <dt>{t("latestTx")}</dt>
                  <dd>{expandedRoleAuditRow.tx}</dd>
                </div>
              </dl>
            )}
          </article>
        </section>
        )}

        {section === "ops" && (
        <section className="admin-section admin-ops-page admin-page-panel">
          <div className="admin-ops-hero panel">
            <div className="panel-heading admin-section-heading">
              <h2>{t("systemMetricsOverview")}</h2>
              <button className="icon-only" onClick={() => refreshAppState()} title={t("refresh")}>
                {fetchingRecord ? <Loader2 className="spin" size={17} /> : <RefreshCw size={17} />}
              </button>
            </div>
            <div className="admin-ops-grid">
              {opsOverviewCards.map((card) => {
                const CardIcon = card.icon;
                return (
                  <article className={`admin-ops-kpi ${card.tone}`} key={card.label}>
                    <div>
                      <span>{card.label}</span>
                      <strong>{card.value}</strong>
                      <small>{card.detail}</small>
                    </div>
                    <CardIcon size={18} />
                  </article>
                );
              })}
            </div>
          </div>

          <div className="panel-heading admin-section-heading admin-contract-matrix-heading">
            <h2>{t("contractMatrix")}</h2>
            <Cpu size={16} />
          </div>
          <div className="admin-contract-matrix">
            {contractRows.map((row) => {
              const ContractIcon = row.icon || Cpu;
              return (
                <article className={`admin-contract-card panel ${row.tone}`} key={row.name}>
                  <div className="admin-contract-card-head">
                    <ContractIcon size={18} />
                    <div>
                      <span>{row.type}</span>
                      <strong>{row.name}</strong>
                      <small>{row.description}</small>
                    </div>
                    <em className={statusClass[row.status] || "warn-text"}>{statusLabels[row.status] || row.status}</em>
                  </div>
                  <dl className="admin-contract-detail-grid">
                    <div>
                      <dt>{t("contractAddress")}</dt>
                      <dd className="admin-full-address">{row.address}</dd>
                    </div>
                    <div>
                      <dt>{t("network")}</dt>
                      <dd>{networkLabel}</dd>
                    </div>
                    <div>
                      <dt>{t("latestBlock")}</dt>
                      <dd>{row.block}</dd>
                    </div>
                    <div>
                      <dt>{t("latestTx")}</dt>
                      <dd>{shortHash(row.tx)}</dd>
                    </div>
                  </dl>
                </article>
              );
            })}
          </div>
        </section>
        )}

        {section === "audit" && (
        <section className="admin-section admin-audit-page admin-page-panel">
          <div className="panel-heading admin-section-heading">
            <h2>{t("auditOverview")}</h2>
            <Activity size={16} />
          </div>
          <div className="admin-audit-summary-grid">
            {auditSummaryCards.map((card) => {
              const CardIcon = card.icon;
              return (
                <article className={`admin-audit-summary-card panel ${card.tone}`} key={card.label}>
                  <div>
                    <span>{card.label}</span>
                    <strong>{card.value}</strong>
                    <small>{card.detail}</small>
                  </div>
                  <CardIcon size={18} />
                </article>
              );
            })}
          </div>
          <div className="admin-audit-stack">
            {renderLoanLedgerAudit({
              rows: visibleLoanAuditRows,
              selectedRow: selectedLoanAuditRow,
              loading: loanPortfolio.loading,
              page: currentLoanAuditPage,
              pageCount: loanAuditPageCount,
              totalCount: loanPortfolio.loans.length,
              onPrevious: () => setLoanAuditPage((page) => Math.max(1, page - 1)),
              onNext: () => setLoanAuditPage((page) => Math.min(loanAuditPageCount, page + 1))
            })}
            <article className="record-card panel admin-onchain-audit-panel">
              <div className="panel-heading">
                <h2>{t("onchainAuditTrail")}</h2>
                <Activity size={16} />
              </div>
              <div className="chain-record-table admin-onchain-audit-table">
                <div className="chain-record-head">
                  <span>{t("eventType")}</span>
                  <span>{t("eventAction")}</span>
                  <span>{t("eventTarget")}</span>
                </div>
                {onchainAuditRows.length === 0 ? (
                  <p className="helper-copy">{chainEventAudit.loading || roleAudit.loading ? t("loading") : t("noOnchainAudit")}</p>
                ) : (
                  visibleOnchainAuditRows.map((row) => (
                    <button
                      className={`chain-record-row ${selectedOnchainAuditRow?.id === row.id ? "active" : ""}`}
                      key={row.id}
                      onClick={() => setSelectedOnchainAuditId(row.id)}
                    >
                      <strong>
                        <span className={`event-type-pill ${row.categoryTone || "blue"}`}>{row.category}</span>
                      </strong>
                      <span>{row.action}</span>
                      <span className="event-target-value">{row.target}</span>
                    </button>
                  ))
                )}
              </div>
              <div className="ledger-pagination">
                <span>{currentOnchainAuditPage} / {onchainAuditPageCount}</span>
                <button
                  className="icon-only"
                  onClick={() => setOnchainAuditPage((page) => Math.max(1, page - 1))}
                  disabled={currentOnchainAuditPage <= 1}
                  aria-label={t("previousPage")}
                >
                  <ChevronLeft size={16} />
                </button>
                <button
                  className="icon-only"
                  onClick={() => setOnchainAuditPage((page) => Math.min(onchainAuditPageCount, page + 1))}
                  disabled={currentOnchainAuditPage >= onchainAuditPageCount}
                  aria-label={t("nextPage")}
                >
                  <ChevronRight size={16} />
                </button>
              </div>
              {renderOnchainAuditDetail(selectedOnchainAuditRow)}
            </article>
          </div>
        </section>
        )}
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
                className="primary-action workflow-action"
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
              {contractRows.filter((row) => row.type === t("onChain")).map((row) => (
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
                <strong className={roleLoanOfficerActive ? "green-text" : "warn-text"}>
                  {roleLoanOfficerActive ? t("activeRole") : t("inactiveRole")}
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
    if (activeViewId === "verification") return renderVerification();
    if (activeViewId === "compliance") return renderCompliance();
    if (activeViewId === "loan") return renderLoan();
    if (activeViewId === "approvals") return renderApprovals();
    if (activeViewId === "admin-roles") return renderAdmin("roles");
    if (activeViewId === "admin-ops") return renderAdmin("ops");
    if (activeViewId === "admin-audit") return renderAdmin("audit");
    if (activeViewId === "operations") return renderOperations();
    if (activeViewId === "settings") return renderSettings();
    return renderVerification();
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
    <main className={`dashboard-shell active-${activeViewId} ${sidebarOpen ? "" : "sidebar-collapsed"}`}>
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
                className={`nav-item ${activeViewId === item.id ? "active" : ""}`}
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
          <p className="sidebar-role-label">{roleSummary.length ? roleSummary.join(" · ") : t("roleViewer")}</p>
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
      {roleDialog && (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setRoleDialog(null)}>
          <section
            className={`result-dialog panel ${roleDialog.ok ? "success" : "fail"}`}
            role="dialog"
            aria-modal="true"
            aria-labelledby="role-result-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="result-dialog-icon">
              {roleDialog.ok ? <Check size={28} /> : <XCircle size={28} />}
            </div>
            <div>
              <h2 id="role-result-title">
                {roleDialog.ok ? t("roleChangeSuccessTitle") : t("roleChangeFailedTitle")}
              </h2>
              <p>{roleDialog.message}</p>
              <div className="result-dialog-meta">
                <span>{t("roleOperation")}</span>
                <strong>{roleDialog.operation}</strong>
                <span>{t("roleTarget")}</span>
                <strong>{roleDialog.role}</strong>
                <span>{t("roleAddress")}</span>
                <strong>{roleDialog.address || "-"}</strong>
                {roleDialog.contractCount && (
                  <>
                    <span>{t("affectedContracts")}</span>
                    <strong>{roleDialog.contractCount}</strong>
                  </>
                )}
                {roleDialog.txHash && (
                  <>
                    <span>{t("latestTx")}</span>
                    <strong>{shortHash(roleDialog.txHash)}</strong>
                  </>
                )}
              </div>
              <button className="primary-action" onClick={() => setRoleDialog(null)}>
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
