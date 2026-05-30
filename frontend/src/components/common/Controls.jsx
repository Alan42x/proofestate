import { ChevronDown, Languages, Network, Wallet } from "lucide-react";

export function NetworkSelector({ network, setNetwork, t }) {
  return (
    <label className="select-shell">
      <Network size={17} />
      <select value={network} onChange={(event) => setNetwork(event.target.value)}>
        <option value="localhost">{t("local")}</option>
        <option value="sepolia">{t("sepolia")}</option>
      </select>
      <ChevronDown size={16} />
    </label>
  );
}

export function LanguageToggle({ language, updateLanguage, t, inline = false }) {
  return (
    <div className={`language-toggle ${inline ? "inline" : ""}`} aria-label={t("language")}>
      <Languages size={17} />
      <button className={language === "zh" ? "active" : ""} onClick={() => updateLanguage("zh")}>
        中文
      </button>
      <button className={language === "en" ? "active" : ""} onClick={() => updateLanguage("en")}>
        EN
      </button>
    </div>
  );
}

export function WalletButton({
  isConnected,
  walletLabel,
  connecting,
  connectors,
  connect,
  disconnect,
  t,
  primary = false
}) {
  if (isConnected) {
    return (
      <button className="wallet-button" onClick={() => disconnect()} title={t("disconnectWallet")}>
        <span className="wallet-avatar" />
        {walletLabel}
        <small>{t("connected")}</small>
        <ChevronDown size={16} />
      </button>
    );
  }

  return (
    <button
      className={`wallet-button ${primary ? "primary" : ""}`}
      onClick={() => connectors[0] && connect({ connector: connectors[0] })}
      disabled={connecting || !connectors[0]}
      title={t("connectWallet")}
    >
      <Wallet size={18} />
      {connecting ? t("connecting") : walletLabel}
    </button>
  );
}
