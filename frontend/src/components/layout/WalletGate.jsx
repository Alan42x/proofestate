import { BadgeCheck, Building2, Check, LockKeyhole, ShieldCheck, Sparkles } from "lucide-react";
import { LanguageToggle, NetworkSelector, WalletButton } from "../common/Controls";

export function WalletGate({
  t,
  language,
  updateLanguage,
  network,
  setNetwork,
  readinessItems,
  readinessScore,
  networkLabel,
  connectors,
  connect,
  connecting,
  walletLabel
}) {
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
          <NetworkSelector network={network} setNetwork={setNetwork} t={t} />
          <LanguageToggle language={language} updateLanguage={updateLanguage} t={t} />
        </div>
      </header>

      <section className="gate-hero">
        <img src="/property-hero.png" alt="" />
        <div className="gate-copy">
          <p className="eyebrow">{networkLabel} · {readinessScore}/4 {t("readyStatus")}</p>
          <h1>{t("walletGateTitle")}</h1>
          <p>{t("walletGateCopy")}</p>
          <div className="gate-cta-row">
            <WalletButton
              isConnected={false}
              walletLabel={walletLabel}
              connecting={connecting}
              connectors={connectors}
              connect={connect}
              disconnect={() => {}}
              t={t}
              primary
            />
            <span><LockKeyhole size={16} />{t("walletGateSecurity")}</span>
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
            <ShieldCheck size={16} />
          </div>
          <div className="readiness-grid gate-grid">
            {readinessItems.map((item) => (
              <div className={`readiness-item ${item.ready ? "ready" : "missing"}`} key={item.label}>
                <Check size={16} />
                <span>{item.label}</span>
                <strong>{item.ready ? t("readyStatus") : t("missingStatus")}</strong>
                <small>{item.detail}</small>
              </div>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
