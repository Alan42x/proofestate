# ProofEstate Figure Sources

This directory is the source of truth for dissertation, README, and slide diagrams.

Recommended rendering command:

```bash
PUPPETEER_SKIP_DOWNLOAD=true npx --yes -p @mermaid-js/mermaid-cli mmdc \
  -i docs/figures/01-system-architecture.mmd \
  -o docs/figures/01-system-architecture.png \
  -b white \
  -s 2
```

Keep generated image files synchronized with these `.mmd` files. If a contract, public signal, API route, or workflow state changes, update the relevant diagram here before copying it into another document.

Generated PNG files use a white background and `scale=2` for dissertation and slide export. In `05-end-to-end-data-flow`, `PV`, `CV`, and `L` mean `PropertyVerification`, `ComplianceVerifier`, and `Lending`.
