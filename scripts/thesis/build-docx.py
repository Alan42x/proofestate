"""Synchronize the two Markdown manuscripts to editable Word documents.

Run with the managed document Python runtime in Codex. Dependencies: Pandoc,
python-docx. Existing Word files supply the style reference. Academic overrides
preserve Times New Roman and black headings: A4, 1-inch margins, 12pt body at
1.15 spacing, 20pt title, 16/13/12pt headings, 10pt tables/captions. Tables have
fixed page-width DXA geometry and repeated headers; images stay with captions.
Journal bibliography entries use 11pt to avoid a single-entry final page.
"""
from pathlib import Path
import importlib.util
import os
import re
import shutil
import subprocess
import sys
import tempfile

# The pnpm command may launch a system Python without document dependencies.
# Reuse the managed document runtime when available; never install packages here.
if importlib.util.find_spec("docx") is None:
    managed_python = Path.home() / ".cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python"
    if managed_python.is_file() and managed_python.resolve() != Path(sys.executable).resolve():
        os.execv(str(managed_python), [str(managed_python), *sys.argv])
    raise SystemExit("python-docx is required. Run this script with a Python environment containing python-docx, or with the Codex-managed document runtime.")

from docx import Document
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.opc.constants import RELATIONSHIP_TYPE as RT
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Inches, Mm, Pt, RGBColor, Twips

ROOT = Path(__file__).resolve().parents[2]
TITLE = "ProofEstate: Blockchain-Based Real Estate Lending Platform with ZK Compliance and Property Verification"
TARGETS = {"thesis.md": "ProofEstate_Thesis_Full_Version.docx", "jisa.md": "ProofEstate_JISA_Manuscript.docx"}


def child(parent, tag, attributes=None):
    element = parent.find(qn(tag))
    if element is None:
        element = OxmlElement(tag)
        parent.append(element)
    for key, value in (attributes or {}).items():
        element.set(qn(key), str(value))
    return element


def font(style, size, bold=None, mono=False):
    style.font.name = "Courier New" if mono else "Times New Roman"
    style.font.size = Pt(size)
    style.font.color.rgb = RGBColor(0, 0, 0)
    if bold is not None:
        style.font.bold = bold
    child(style.element.get_or_add_rPr(), "w:rFonts", {"w:ascii": style.font.name, "w:hAnsi": style.font.name, "w:eastAsia": style.font.name})


def format_document(filename, kind):
    doc = Document(filename)
    caption_style = next(style for style in doc.styles if style.style_id == "Caption")
    section = doc.sections[0]
    section.page_width, section.page_height = Mm(210), Mm(297)
    for side in ("top_margin", "bottom_margin", "left_margin", "right_margin"):
        setattr(section, side, Inches(1))
    section.header_distance = section.footer_distance = Inches(0.492)
    width = round((section.page_width - section.left_margin - section.right_margin) / 635)

    for name in ("Normal", "Body Text", "First Paragraph"):
        if name not in doc.styles:
            continue
        style = doc.styles[name]
        font(style, 12)
        p = style.paragraph_format
        p.line_spacing, p.space_before, p.space_after = 1.15, Pt(0), Pt(6)
        p.widow_control = True
        p.alignment = WD_ALIGN_PARAGRAPH.LEFT
    font(doc.styles["Title"], 20, True)
    doc.styles["Title"].paragraph_format.space_after = Pt(12)
    doc.styles["Title"].paragraph_format.alignment = WD_ALIGN_PARAGRAPH.CENTER
    for level, size, before, after in ((1, 16, 14, 8), (2, 13, 10, 6), (3, 12, 8, 4)):
        style = doc.styles[f"Heading {level}"]
        font(style, size, True)
        p = style.paragraph_format
        p.space_before, p.space_after, p.line_spacing = Pt(before), Pt(after), 1.15
        p.keep_with_next = p.keep_together = True
    font(caption_style, 10)
    p = caption_style.paragraph_format
    p.space_before, p.space_after, p.line_spacing = Pt(4), Pt(4), 1.0
    for name in ("Verbatim Char", "Source Code"):
        if name in doc.styles:
            font(doc.styles[name], 9.5, mono=True)
    if "Source Code" in doc.styles:
        child(doc.styles["Source Code"].element.get_or_add_pPr(), "w:wordWrap", {"w:val": "1"})

    for paragraph in doc.paragraphs:
        text = paragraph.text.strip()
        if text.startswith("[") and text[1:2].isdigit():
            paragraph.paragraph_format.keep_together = True
            if kind == "jisa":
                for run in paragraph.runs:
                    run.font.size = Pt(11)
        if re.match(r"^(?:Figure|Table) \d+\.", text):
            paragraph.style = caption_style
            paragraph.paragraph_format.keep_together = True
            paragraph.paragraph_format.keep_with_next = text.startswith("Table ")
        if text.endswith(":") and len(text) <= 90 and paragraph.style.name != "Source Code":
            paragraph.paragraph_format.keep_with_next = True
        if paragraph._p.xpath(".//w:drawing"):
            paragraph.alignment = WD_ALIGN_PARAGRAPH.CENTER
            paragraph.paragraph_format.line_spacing = 1.0
            paragraph.paragraph_format.space_before = Pt(4)
            paragraph.paragraph_format.space_after = Pt(4)
            paragraph.paragraph_format.keep_with_next = True
        if kind == "thesis" and paragraph.style.name == "Heading 1" and text != "Abstract":
            paragraph.paragraph_format.page_break_before = True

    for image in doc.inline_shapes:
        max_width, max_height = Inches(6.2), Inches(7.9)
        ratio = min(1, max_width / image.width, max_height / image.height)
        image.width, image.height = round(image.width * ratio), round(image.height * ratio)

    for table in doc.tables:
        count = len(table.columns)
        # Explicit reusable patterns; numeric tables give the stage label more room.
        header = [cell.text for cell in table.rows[0].cells]
        if count == 2:
            weights = [0.33, 0.67]
        elif count == 3 and header[0] == "Asset":
            weights = [0.64, 0.18, 0.18]
        elif count == 3:
            weights = [0.24, 0.43, 0.33]
        elif count == 4:
            weights = [0.22, 0.28, 0.22, 0.28]
        elif count == 5 and header[0] == "Stage":
            weights = [0.36, 0.16, 0.16, 0.16, 0.16]
        elif count == 5 and header[0] == "Architecture":
            weights = [0.22, 0.23, 0.16, 0.23, 0.16]
        elif count == 5:
            weights = [0.18, 0.17, 0.12, 0.23, 0.30]
        elif count == 7:
            weights = [0.16, 0.20, 0.09, 0.09, 0.13, 0.13, 0.20] if header[0] == "Case" else [0.14, 0.10, 0.15, 0.15, 0.14, 0.17, 0.15]
        elif count == 9:
            weights = [0.27, 0.07, 0.08, 0.09, 0.10, 0.10, 0.10, 0.10, 0.09]
        else:
            weights = [1 / count] * count
        widths = [round(width * value) for value in weights]
        widths[-1] += width - sum(widths)
        table.autofit = False
        properties = table._tbl.tblPr
        child(properties, "w:tblW", {"w:w": width, "w:type": "dxa"})
        child(properties, "w:tblInd", {"w:w": 120, "w:type": "dxa"})
        child(properties, "w:tblLayout", {"w:type": "fixed"})
        grid = table._tbl.tblGrid
        for item in list(grid):
            grid.remove(item)
        for value in widths:
            child_item = OxmlElement("w:gridCol")
            child_item.set(qn("w:w"), str(value))
            grid.append(child_item)
        for row_index, row in enumerate(table.rows):
            child(row._tr.get_or_add_trPr(), "w:cantSplit")
            if row_index == 0:
                child(row._tr.get_or_add_trPr(), "w:tblHeader")
            for index, cell in enumerate(row.cells):
                cell.width = Twips(widths[index])
                tc_pr = cell._tc.get_or_add_tcPr()
                child(tc_pr, "w:tcW", {"w:w": widths[index], "w:type": "dxa"})
                margins = child(tc_pr, "w:tcMar")
                for side, value in {"top": 80, "bottom": 80, "start": 120, "end": 120}.items():
                    child(margins, f"w:{side}", {"w:w": value, "w:type": "dxa"})
                if row_index == 0:
                    child(tc_pr, "w:shd", {"w:fill": "F2F2F2"})
                for paragraph in cell.paragraphs:
                    p = paragraph.paragraph_format
                    p.space_before, p.space_after, p.line_spacing = Pt(0), Pt(3), 1.0
                    # Keep at least two data rows with the header and prevent
                    # a lone final row; a table's last row must not bind the
                    # following prose to the table.
                    p.keep_with_next = row_index < len(table.rows) - 1 and (
                        row_index <= 1 or row_index == len(table.rows) - 2
                    )
                    for run in paragraph.runs:
                        run.font.name, run.font.size = "Times New Roman", Pt(10)

    # Pandoc supplies real lists. Make their geometry explicit and consistent.
    for level in doc.part.numbering_part.element.xpath(".//w:lvl"):
        index = int(level.get(qn("w:ilvl"), "0"))
        properties = child(level, "w:pPr")
        child(properties, "w:ind", {"w:left": 540 + index * 360, "w:hanging": 270})

    header = section.header.paragraphs[0]
    header.clear()
    footer = section.footer.paragraphs[0]
    footer.clear()
    footer.alignment = WD_ALIGN_PARAGRAPH.RIGHT
    run = footer.add_run()
    for tag, value in (("w:fldChar", "begin"), ("w:instrText", " PAGE "), ("w:fldChar", "end")):
        field = OxmlElement(tag)
        if tag == "w:instrText":
            field.text = value
        else:
            field.set(qn("w:fldCharType"), value)
        run._r.append(field)
    doc.core_properties.title = TITLE
    doc.core_properties.author = "ZHANG TIANYI"
    doc.core_properties.subject = "Thesis" if kind == "thesis" else "Journal of Information Security and Applications manuscript"
    doc.core_properties.comments = ""
    doc.save(filename)
    for table in doc.tables:
        assert sum(int(c.get(qn("w:w"))) for c in table._tbl.tblGrid) == width
    print(f"{filename.relative_to(ROOT)}: {len(doc.tables)} fixed-width tables; {len(doc.inline_shapes)} figures")


def main():
    if not shutil.which("pandoc"):
        raise SystemExit("Pandoc is required")
    with tempfile.TemporaryDirectory(prefix="proofestate-docx-") as temp:
        temp = Path(temp)
        for source_name, target_name in TARGETS.items():
            source = ROOT / "thesis" / source_name
            target = ROOT / "thesis" / "docx" / target_name
            markdown = source.read_text()
            assert markdown.splitlines()[0] == f"# {TITLE}"
            body = temp / source_name
            body.write_text(markdown.split("\n", 1)[1])
            reference = temp / target_name
            # Pandoc imports reference-document media relationships as well as
            # styles. Keep a blank reference, or each rebuild accumulates copies
            # of every previous figure in the resulting Word package.
            reference_doc = Document(target)
            for element in list(reference_doc.element.body):
                if element.tag != qn("w:sectPr"):
                    reference_doc.element.body.remove(element)
            for rel_id, relation in list(reference_doc.part.rels.items()):
                if relation.reltype == RT.IMAGE:
                    reference_doc.part.drop_rel(rel_id)
            reference_doc.save(reference)
            subprocess.run(["pandoc", str(body), "--from=markdown-implicit_figures", "--to=docx", "--standalone",
                            "--shift-heading-level-by=-1", "--resource-path=" + str(ROOT / "thesis"),
                            "--metadata=title:" + TITLE, "--metadata=lang:en-US",
                            "--reference-doc=" + str(reference), "--output=" + str(target)],
                           cwd=ROOT, check=True)
            format_document(target, source.stem)


if __name__ == "__main__":
    main()
