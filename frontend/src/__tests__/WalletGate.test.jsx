import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { WalletGate } from "../components/layout/WalletGate";

const translations = {
  appTitle: "ProofEstate",
  language: "Language",
  local: "Localhost",
  sepolia: "Ethereum Sepolia",
  readyStatus: "Ready",
  missingStatus: "Missing",
  readinessTitle: "Runtime Readiness",
  walletGateTitle: "Connect your wallet to enter the workspace",
  walletGateCopy: "After connection, ProofEstate routes the address into the workspace.",
  connectWallet: "Connect wallet",
  connecting: "Connecting"
};

function t(key) {
  return translations[key] || key;
}

function renderGate(overrides = {}) {
  const props = {
    t,
    language: "en",
    updateLanguage: vi.fn(),
    network: "localhost",
    setNetwork: vi.fn(),
    readinessItems: [
      { label: "Local Chain", ready: true, detail: "block 1" },
      { label: "Contracts", ready: false, detail: "2/3 deployed" }
    ],
    readinessScore: 1,
    networkLabel: "Localhost",
    connectors: [{ id: "injected" }],
    connect: vi.fn(),
    connecting: false,
    walletLabel: "Connect wallet",
    ...overrides
  };
  render(<WalletGate {...props} />);
  return props;
}

describe("WalletGate", () => {
  it("renders the professional wallet entry instead of the dashboard shell", () => {
    renderGate();

    expect(screen.getByRole("heading", { name: /connect your wallet/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /connect wallet/i })).toBeInTheDocument();
    expect(screen.queryByLabelText(/dashboard navigation/i)).not.toBeInTheDocument();
  });

  it("connects through the first configured connector", async () => {
    const user = userEvent.setup();
    const props = renderGate();

    await user.click(screen.getByRole("button", { name: /connect wallet/i }));

    expect(props.connect).toHaveBeenCalledWith({ connector: props.connectors[0] });
  });

  it("keeps language and network controls available before connection", async () => {
    const user = userEvent.setup();
    const props = renderGate();

    await user.selectOptions(screen.getByRole("combobox"), "sepolia");
    await user.click(screen.getByRole("button", { name: "中文" }));

    expect(props.setNetwork).toHaveBeenCalled();
    expect(props.updateLanguage).toHaveBeenCalledWith("zh");
  });
});
