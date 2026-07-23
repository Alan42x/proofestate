import {
  ArrowRight,
  BadgeCheck,
  Building2,
  CheckCircle2,
  CircleAlert,
  ShieldCheck,
  Sparkles
} from "lucide-react";
import { LanguageToggle, NetworkSelector, WalletButton } from "../common/Controls";

export function WalletGate({
  t,
  language,
  updateLanguage,
  network,
  setNetwork,
  networkOptions,
  readinessItems,
  readinessScore,
  networkLabel,
  connectors,
  connect,
  disconnect,
  connecting,
  isConnected,
  onEnter,
  walletLabel
}) {
  const readinessPercent = Math.round((readinessScore / Math.max(readinessItems.length, 1)) * 100);

  return (
    <main className="wallet-gate">
      <header className="gate-topbar">
        <div className="brand-lockup">
          <div className="brand-mark">
            <Building2 size={24} />
          </div>
          <strong>{t("appTitle")}</strong>
        </div>
        <div className="topbar-actions">
          <NetworkSelector network={network} setNetwork={setNetwork} t={t} options={networkOptions} />
          <LanguageToggle language={language} updateLanguage={updateLanguage} t={t} />
        </div>
      </header>

      <section className="gate-hero">
        <img src="/property-hero.png" alt="" />
        <div className="gate-hero-frame" aria-hidden="true" />
        <div className="gate-copy">
          <div className="gate-kicker">
            <span className={readinessScore === readinessItems.length ? "live-dot ready" : "live-dot"} />
            <span>{networkLabel}</span>
            <strong>{readinessScore}/{readinessItems.length} {t("readyStatus")}</strong>
          </div>
          <h1>{t("walletGateTitle")}</h1>
          <p>{t("walletGateCopy")}</p>
          <div className="gate-cta-card">
            <WalletButton
              isConnected={isConnected}
              walletLabel={walletLabel}
              connecting={connecting}
              connectors={connectors}
              connect={connect}
              disconnect={disconnect}
              t={t}
              primary
            />
            <button
              className="gate-enter-button"
              onClick={onEnter}
              disabled={!isConnected || connecting}
            >
              {connecting ? t("connecting") : t("enterWorkspace")}
              <ArrowRight size={17} />
            </button>
          </div>
          <div className="gate-value-grid">
            <div>
              <BadgeCheck size={18} />
              <strong>{t("gateValueVerification")}</strong>
              <span>{t("gateValueVerificationSub")}</span>
            </div>
            <div>
              <ShieldCheck size={18} />
              <strong>{t("gateValueProof")}</strong>
              <span>{t("gateValueProofSub")}</span>
            </div>
            <div>
              <Sparkles size={18} />
              <strong>{t("gateValueWorkflow")}</strong>
              <span>{t("gateValueWorkflowSub")}</span>
            </div>
          </div>
        </div>

        <div className="gate-readiness panel">
          <div className="panel-heading">
            <h2>{t("readinessTitle")}</h2>
            <span className="gate-score-pill">{readinessPercent}%</span>
          </div>
          <div className="gate-score-row">
            <div className="gate-score-ring" style={{ "--score": `${readinessPercent}%` }}>
              <strong>{readinessScore}/{readinessItems.length}</strong>
              <span>{t("readyStatus")}</span>
            </div>
            <div>
              <strong>{t("workspaceStatus")}</strong>
              <span>{t("roleViewer")}</span>
            </div>
          </div>
          <div className="readiness-grid gate-grid">
            {readinessItems.map((item) => {
              const StatusIcon = item.ready ? CheckCircle2 : CircleAlert;
              return (
                <div className={`readiness-item ${item.ready ? "ready" : "missing"}`} key={item.label}>
                  <StatusIcon size={16} />
                  <span>{item.label}</span>
                  <strong>{item.ready ? t("readyStatus") : t("missingStatus")}</strong>
                  <small>{item.detail}</small>
                </div>
              );
            })}
          </div>
        </div>
      </section>
    </main>
  );
}
