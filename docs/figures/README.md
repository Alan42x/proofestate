# ProofEstate Figure Sources

This directory contains the diagram sources and PNG assets used by the project
README and manuscripts. PowerPoint uses native editable diagrams maintained
separately in [build-slides.mjs](../../scripts/thesis/build-slides.mjs).

Most files use Mermaid. Files `02-business-workflow.puml` and
`06-loan-state-machine.puml` use PlantUML for activity and state diagrams.

Figure usage (file numbers differ from manuscript figure numbers):

| Source | Full thesis and report | JISA manuscript |
| --- | --- | --- |
| 01 System architecture | Figure 1 | Figure 1 |
| 02 Business workflow | README only | Not included |
| 03 Technical architecture | README only | Not included |
| 04 ZK proof workflow | Figure 4 | Not included |
| 05 End-to-end sequence | Figure 2 | Figure 2 |
| 06 Loan state machine | Figure 3 | Not included |

All six figures are also embedded in the project README. The full thesis and
report use interface screenshots for Figures 5 and 6.

Run rendering commands from the repository root. The current PNGs were generated
with Mermaid CLI `11.16.0` and PlantUML `1.2026.6`, using Arial. These rendering
tools are separate from the application's pnpm dependencies. PlantUML's default
layout also requires Graphviz.

Mermaid rendering command for one figure:

```bash
npx --yes -p @mermaid-js/mermaid-cli@11.16.0 mmdc \
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
  npx --yes -p @mermaid-js/mermaid-cli@11.16.0 mmdc \
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

Mermaid CLI uses Puppeteer and needs a compatible Chrome/Chromium installation.
To use an existing browser, pass `-p /path/to/puppeteer.json` with an
`executablePath` setting. If installation skips the browser download with
`PUPPETEER_SKIP_DOWNLOAD=true`, ensure a compatible browser is already available
and specify its executable path when needed.

The architecture and proof-workflow files use ELK layout with linear connectors;
the end-to-end file uses Mermaid sequence-diagram syntax. Preserve each file's
diagram type and configuration when regenerating it.

Keep generated image files synchronized with these source files. If a contract, public signal, API route, or workflow state changes, update the relevant diagram here before copying it into another document.

Generated PNG files use a white background. Mermaid and the activity diagram
use scale 2; the state machine uses scale 3 for legible transition labels.

The architecture diagrams summarize communication between boundaries; the
end-to-end sequence expands cross-component calls, while the proof workflow
separates input preparation, proving, and on-chain verification. Component
tests run in jsdom, and loan ownership is enforced by `requestLoan`, not by
the unauthenticated registry API. In the state machine, failed verification
or absent/mismatched compliance at approval causes rejection; authorization and
loan-state errors revert without a transition.

The state machine places Rejected, Approved, and Cancelled on one row and
centers Requested–Approved–Repaid above a single final marker. Orthogonal
connectors and explicit spacing keep transitions clear of their labels.
The final marker indicates lifecycle completion, not an additional stored
loan state.

After regenerating images, synchronize the manuscripts and report:

```bash
pnpm thesis:check
pnpm thesis:docx
pnpm thesis:docx --only report
```

Word builds require Pandoc and `python-docx`; the report also requires `pypdf`
and LibreOffice. See the [project README](../../README.md#repository-structure)
for build dependencies and source-editing conventions.
