import { createConfig, http } from "wagmi";
import { injected } from "wagmi/connectors";
import { hardhat, sepolia } from "wagmi/chains";

const sepoliaRpcUrl = import.meta.env.VITE_SEPOLIA_RPC_URL;

export const config = createConfig({
  chains: [hardhat, sepolia],
  connectors: [injected()],
  transports: {
    [hardhat.id]: http(import.meta.env.VITE_LOCAL_RPC_URL || "http://127.0.0.1:8545"),
    [sepolia.id]: sepoliaRpcUrl ? http(sepoliaRpcUrl) : http()
  }
});
