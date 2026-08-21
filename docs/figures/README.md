# ProofEstate Figure Sources

This directory is the source of truth for dissertation, README, and slide diagrams.

Most figures use Mermaid. Figures 2 and 6 use PlantUML as their only source
format because PlantUML gives stricter UML Activity Diagram and State Machine
Diagram semantics.

Recommended Mermaid rendering command for one figure:

```bash
PUPPETEER_SKIP_DOWNLOAD=true npx --yes -p @mermaid-js/mermaid-cli mmdc \
  -i docs/figures/01-system-architecture.mmd \
  -o docs/figures/01-system-architecture.png \
  -b white \
  -s 2
```

Mermaid refresh:

```bash
for diagram in \
  docs/figures/01-system-architecture.mmd \
  docs/figures/03-technical-architecture.mmd \
  docs/figures/04-zk-proof-workflow.mmd \
  docs/figures/05-end-to-end-data-flow.mmd; do
  PUPPETEER_SKIP_DOWNLOAD=true npx --yes -p @mermaid-js/mermaid-cli mmdc \
    -i "$diagram" \
    -o "${diagram%.mmd}.png" \
    -b white \
    -s 2
done
```

PlantUML refresh for the formal UML diagrams:

```bash
plantuml -tpng docs/figures/02-business-workflow.puml
plantuml -tpng docs/figures/06-loan-state-machine.puml
```

Some Mermaid figures use the ELK renderer plus linear connector curves to keep large architecture and pipeline diagrams orthogonal and reduce edge crossings. Use Mermaid 9.4 or newer when regenerating these files.

Keep generated image files synchronized with these source files. If a contract, public signal, API route, or workflow state changes, update the relevant diagram here before copying it into another document.

Generated PNG files use a white background and `scale=2` for dissertation and slide export.
