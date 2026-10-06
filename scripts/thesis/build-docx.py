"""Synchronize the two Markdown manuscripts to editable Word documents.

Run with the managed document Python runtime in Codex. Dependencies: Pandoc,
python-docx; pypdf and LibreOffice for the capstone report. Existing Word files
supply the style reference. Academic overrides
preserve Times New Roman and black headings: A4, 1-inch margins, 12pt body at
1.15 spacing, 20pt title, 16/13/12pt headings, 10pt tables/captions. Tables have
fixed page-width DXA geometry and repeated headers; images stay with captions.
Journal bibliography entries use 11pt to avoid a single-entry final page.
The separate capstone report adds an editorial cover, roman-numbered front
matter and a populated Word TOC field to the thesis text. LibreOffice and pypdf
resolve its cached page numbers without modifying either manuscript.
"""
from pathlib import Path
from copy import deepcopy
import argparse
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
from docx.enum.style import WD_STYLE_TYPE
from docx.enum.section import WD_SECTION_START
from docx.enum.text import WD_ALIGN_PARAGRAPH, WD_TAB_ALIGNMENT, WD_TAB_LEADER
from docx.opc.constants import RELATIONSHIP_TYPE as RT
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Inches, Mm, Pt, RGBColor, Twips

ROOT = Path(__file__).resolve().parents[2]
TITLE = "ProofEstate: Blockchain-Based Real Estate Lending Platform with ZK Compliance and Property Verification"
TARGETS = {"thesis.md": "ProofEstate_Thesis_Full_Version.docx", "jisa.md": "ProofEstate_JISA_Manuscript.docx"}
COVER_KEYS = ("Author", "Student ID", "Course", "Supervisor", "Institution", "Submission date")
REPORT_FILENAME = "ProofEstate_FT5007_Capstone_Report.docx"
REPORT_REPOSITORY = "https://github.com/Alan42x/proofestate"
REPORT_COVER = {
    "Author": "ZHANG TIANYI",
    "Student ID": "A0329678H",
    "Course": "FT5007 Capstone",
    "Supervisor": "Nicholas Mac Gregor GARCIA",
    "Institution": "NUS School of Computing",
    "Submission date": "30 October 2026",
}


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


def field(paragraph, instruction, cached="", start=True, end=True):
    """Append a native Word field; TOC results can span multiple paragraphs."""
    run = paragraph.add_run()
    if start:
        child(run._r, "w:fldChar", {"w:fldCharType": "begin"})
        code = OxmlElement("w:instrText")
        code.set(qn("xml:space"), "preserve")
        code.text = instruction
        run._r.append(code)
        separator = OxmlElement("w:fldChar")
        separator.set(qn("w:fldCharType"), "separate")
        run._r.append(separator)
    if cached:
        run.add_text(cached)
    if end:
        closing = OxmlElement("w:fldChar")
        closing.set(qn("w:fldCharType"), "end")
        run._r.append(closing)


def front_matter(doc, metadata, width):
    """Add the cover and two-level, clickable TOC without altering body content."""
    assert tuple(metadata) == COVER_KEYS, "Report cover metadata is incomplete"
    title = doc.paragraphs[0]
    assert title.text == TITLE
    title._p.getparent().remove(title._p)
    abstract = next(p for p in doc.paragraphs if p.text == "Abstract")
    introduction = next(p for p in doc.paragraphs if p.text == "1. Introduction")

    # Named additions to the existing A4 / Times New Roman academic styles.
    # The cover follows the editorial_cover pattern with no decorative rules.
    tokens = {
        "Cover Institution": (16, True, 30, 10),
        "Cover Course": (14, True, 0, 10),
        "Cover Report": (12, False, 0, 66),
        "Cover Title": (20, True, 0, 52),
        "Cover Author": (14, True, 0, 6),
        "Cover ID": (12, False, 0, 34),
        "Cover Label": (11, True, 0, 4),
        "Cover Supervisor": (14, False, 0, 44),
        "Cover Date": (12, False, 0, 0),
        "Cover Repository Label": (11, True, 24, 4),
        "Cover Repository": (11, False, 0, 0),
    }
    for name, (size, bold, before, after) in tokens.items():
        style = doc.styles[name] if name in doc.styles else doc.styles.add_style(name, WD_STYLE_TYPE.PARAGRAPH)
        style.base_style = doc.styles["Normal"]
        font(style, size, bold)
        p = style.paragraph_format
        p.alignment, p.line_spacing = WD_ALIGN_PARAGRAPH.CENTER, 1.15
        p.space_before, p.space_after = Pt(before), Pt(after)
        p.keep_together = p.keep_with_next = True
        p.page_break_before = False
        child(style.element.get_or_add_pPr(), "w:outlineLvl", {"w:val": 9})
    cover = [
        (metadata["Institution"], "Cover Institution"),
        (metadata["Course"], "Cover Course"),
        ("Capstone Project Report", "Cover Report"),
        (TITLE, "Cover Title"),
        (metadata["Author"], "Cover Author"),
        ("Student ID: " + metadata["Student ID"], "Cover ID"),
        ("Supervisor", "Cover Label"),
        (metadata["Supervisor"], "Cover Supervisor"),
        ("Submitted on " + metadata["Submission date"], "Cover Date"),
    ]
    for text, style in cover:
        if style == "Cover Title":
            # Balanced title lines preserve the exact words and capitalization.
            text = text.replace("ProofEstate: ", "ProofEstate:\n", 1).replace(" with ZK ", "\nwith ZK ", 1)
        abstract._p.addprevious(doc.add_paragraph(text, style)._p)

    abstract._p.addprevious(doc.add_paragraph("Project repository", "Cover Repository Label")._p)
    repository = doc.add_paragraph(style="Cover Repository")
    hyperlink = OxmlElement("w:hyperlink")
    hyperlink.set(qn("r:id"), repository.part.relate_to(REPORT_REPOSITORY, RT.HYPERLINK, is_external=True))
    run = OxmlElement("w:r")
    child(child(run, "w:rPr"), "w:u", {"w:val": "single"})
    child(run, "w:t").text = REPORT_REPOSITORY
    hyperlink.append(run)
    repository._p.append(hyperlink)
    abstract._p.addprevious(repository._p)

    # Section properties on a boundary paragraph describe the preceding section.
    # Separate footer parts prevent cover/front-matter numbering from leaking.
    for anchor in (abstract, introduction):
        boundary = doc.add_paragraph()
        boundary.paragraph_format.space_before = boundary.paragraph_format.space_after = Pt(0)
        boundary.paragraph_format.line_spacing = Pt(1)
        boundary.add_run().font.size = Pt(1)
        properties = deepcopy(doc.sections[-1]._sectPr)
        for reference in properties.xpath("w:headerReference | w:footerReference"):
            properties.remove(reference)
        boundary._p.get_or_add_pPr().append(properties)
        anchor._p.addprevious(boundary._p)
    introduction.paragraph_format.page_break_before = False

    headings = [p for p in doc.paragraphs if p.style.name in ("Heading 1", "Heading 2")]
    max_id = max((int(b.get(qn("w:id"))) for b in doc.element.xpath(".//w:bookmarkStart")), default=0)
    toc_styles = {}
    for level in (1, 2):
        name = f"TOC {level}"
        style = doc.styles[name] if name in doc.styles else doc.styles.add_style(name, WD_STYLE_TYPE.PARAGRAPH)
        style.base_style = doc.styles["Normal"]
        font(style, 11, level == 1)
        p = style.paragraph_format
        p.alignment, p.line_spacing = WD_ALIGN_PARAGRAPH.LEFT, 1.0
        p.space_before, p.space_after = Pt(5 if level == 1 else 0), Pt(2)
        p.left_indent, p.right_indent = Inches(0 if level == 1 else 0.24), Inches(0)
        p.first_line_indent = Inches(0)
        p.keep_together, p.keep_with_next = True, level == 1
        p.page_break_before = False
        p.tab_stops.clear_all()
        p.tab_stops.add_tab_stop(Twips(width), WD_TAB_ALIGNMENT.RIGHT, WD_TAB_LEADER.DOTS)
        child(style.element.get_or_add_pPr(), "w:outlineLvl", {"w:val": 9})
        toc_styles[level] = style
    name = "TOC Heading"
    toc_heading = doc.styles[name] if name in doc.styles else doc.styles.add_style(name, WD_STYLE_TYPE.PARAGRAPH)
    toc_heading.base_style = doc.styles["Normal"]
    font(toc_heading, 16, True)
    p = toc_heading.paragraph_format
    p.space_before, p.space_after, p.line_spacing = Pt(0), Pt(12), 1.15
    p.keep_with_next, p.page_break_before = True, True
    child(toc_heading.element.get_or_add_pPr(), "w:outlineLvl", {"w:val": 9})
    toc_anchor = introduction._p.getprevious()
    toc_anchor.addprevious(doc.add_paragraph("Table of Contents", toc_heading)._p)
    for index, heading in enumerate(headings):
        bookmark = f"peToc_{index + 1}"
        start = OxmlElement("w:bookmarkStart")
        start.set(qn("w:id"), str(max_id + index + 1))
        start.set(qn("w:name"), bookmark)
        heading._p.insert(1, start)
        end = OxmlElement("w:bookmarkEnd")
        end.set(qn("w:id"), str(max_id + index + 1))
        heading._p.append(end)
        level = int(heading.style.name[-1])
        entry = doc.add_paragraph(style=toc_styles[level])
        if index == 0:
            field(entry, ' TOC \\o "1-2" \\h \\z ', end=False)
        hyperlink = OxmlElement("w:hyperlink")
        hyperlink.set(qn("w:anchor"), bookmark)
        label_run = OxmlElement("w:r")
        label = OxmlElement("w:t")
        label.text = heading.text
        label_run.append(label)
        hyperlink.append(label_run)
        entry._p.append(hyperlink)
        entry.add_run("\t")
        field(entry, f" PAGEREF {bookmark} \\h ", cached="0")
        if index == len(headings) - 1:
            field(entry, "", start=False)
            entry.paragraph_format.keep_with_next = False
        toc_anchor.addprevious(entry._p)
    for index, section in enumerate(doc.sections):
        section.start_type = WD_SECTION_START.NEW_PAGE
        section.header.is_linked_to_previous = section.footer.is_linked_to_previous = False
        section.header.paragraphs[0].clear()
        footer = section.footer.paragraphs[0]
        footer.clear()
        footer.alignment = WD_ALIGN_PARAGRAPH.RIGHT
        child(section._sectPr, "w:pgNumType", {"w:start": 1, "w:fmt": "lowerRoman" if index == 1 else "decimal"})
        if index:
            field(footer, " PAGE ")
    # Contents page numbers are populated below. Let readers refresh the TOC
    # explicitly after editing; on-open updates trigger a Word confirmation.
    child(doc.settings.element, "w:updateFields", {"w:val": "false"})


def populate_contents(filename, temp):
    """Cache real page numbers while retaining the editable Word TOC field."""
    try:
        from pypdf import PdfReader
    except ImportError:
        raise SystemExit("pypdf is required for the report contents; use the Codex-managed document Python runtime") from None
    bundled_bin = Path.home() / ".cache/codex-runtimes/codex-primary-runtime/dependencies/bin"
    soffice = shutil.which("soffice")
    if not soffice and (bundled_bin / "soffice").is_file():
        soffice = str(bundled_bin / "soffice")
    if not soffice:
        raise SystemExit("LibreOffice is required to populate the report table of contents")
    profile = temp / "lo-profile"
    profile.mkdir()
    env = os.environ.copy()
    env.update(TMPDIR="/private/tmp" if sys.platform == "darwin" else tempfile.gettempdir(),
               XDG_CONFIG_HOME=str(profile / "config"), XDG_CACHE_HOME=str(profile / "cache"))
    previous = None
    for attempt in range(3):
        pdf_dir = temp / f"contents-{attempt}"
        pdf_dir.mkdir()
        subprocess.run([soffice, "-env:UserInstallation=" + profile.as_uri(), "--headless", "--norestore",
                        "--convert-to", "pdf", "--outdir", str(pdf_dir), str(filename)],
                       env=env, check=True, capture_output=True, timeout=120)
        pdf = PdfReader(pdf_dir / (filename.stem + ".pdf"))
        locations = {}

        def visit(items):
            for item in items:
                if isinstance(item, list):
                    visit(item)
                else:
                    locations[str(item.title)] = pdf.get_destination_page_number(item)

        visit(pdf.outline)
        main_start = locations["1. Introduction"]
        doc = Document(filename)
        headings = [p.text for p in doc.paragraphs if p.style.name in ("Heading 1", "Heading 2")]
        assert all(title in locations for title in headings), "Missing PDF heading destinations"
        pages = ["i" if title == "Abstract" else str(locations[title] - main_start + 1) for title in headings]
        if pages == previous:
            print(f"Report contents: {len(headings)} entries, page numbers verified ({len(pdf.pages)} pages)")
            return
        entries = [p for p in doc.paragraphs if p.style.name in ("TOC 1", "TOC 2")]
        assert len(entries) == len(pages)
        for entry, page in zip(entries, pages):
            cached = entry._p.xpath("w:r/w:t")[-1]
            cached.text = page
        doc.save(filename)
        previous = pages
    raise RuntimeError("Report TOC pagination did not stabilize")


def format_document(filename, kind, metadata=None):
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
        if kind in ("thesis", "report") and paragraph.style.name == "Heading 1" and text != "Abstract":
            paragraph.paragraph_format.page_break_before = True

    for image in doc.inline_shapes:
        max_width, max_height = Inches(6.2), Inches(7.9)
        ratio = min(1, max_width / image.width, max_height / image.height)
        image.width, image.height = round(image.width * ratio), round(image.height * ratio)

    for table in doc.tables:
        count = len(table.columns)
        keep_table_together = kind in ("thesis", "report") and len(table.rows) <= 8
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
                        keep_table_together or row_index <= 1 or row_index == len(table.rows) - 2
                    )
                    for run in paragraph.runs:
                        run.font.name, run.font.size = "Times New Roman", Pt(10)

    if kind in ("thesis", "report"):
        # Keep a short table's introducing paragraph with its caption and rows.
        # Long evidence tables can flow across pages with repeated headers.
        for paragraph in doc.paragraphs:
            caption = paragraph._p.getnext()
            if caption is None or caption.tag != qn("w:p"):
                continue
            caption_text = "".join(caption.xpath(".//w:t/text()"))
            table = caption.getnext()
            if (re.match(r"^Table \d+\.", caption_text) and table is not None
                    and table.tag == qn("w:tbl") and len(table.xpath("w:tr")) <= 8):
                paragraph.paragraph_format.keep_with_next = True

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
    if kind == "report":
        front_matter(doc, metadata, width)
        doc.core_properties.subject = metadata["Course"] + " project report"
    doc.save(filename)
    for table in doc.tables:
        assert sum(int(c.get(qn("w:w"))) for c in table._tbl.tblGrid) == width
    print(f"{filename.relative_to(ROOT)}: {len(doc.tables)} fixed-width tables; {len(doc.inline_shapes)} figures")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--only", choices=("thesis", "jisa", "report"), help="Rebuild a manuscript or create the separate capstone report")
    args = parser.parse_args()
    if not shutil.which("pandoc"):
        raise SystemExit("Pandoc is required")
    with tempfile.TemporaryDirectory(prefix="proofestate-docx-") as temp:
        temp = Path(temp)
        targets = {"thesis.md": REPORT_FILENAME} if args.only == "report" else TARGETS
        for source_name, target_name in targets.items():
            if args.only in ("thesis", "jisa") and source_name != args.only + ".md":
                continue
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
            reference_doc = Document(ROOT / "thesis" / "docx" / TARGETS[source_name] if args.only == "report" else target)
            for element in list(reference_doc.element.body):
                if element.tag != qn("w:sectPr"):
                    reference_doc.element.body.remove(element)
            for rel_id, relation in list(reference_doc.part.rels.items()):
                if relation.reltype == RT.IMAGE or (args.only == "report" and relation.reltype in (RT.HEADER, RT.FOOTER)):
                    reference_doc.part.drop_rel(rel_id)
            if args.only == "report":
                for item in reference_doc.element.body.sectPr.xpath("w:headerReference | w:footerReference | w:pgNumType | w:titlePg"):
                    reference_doc.element.body.sectPr.remove(item)
            reference_doc.save(reference)
            subprocess.run(["pandoc", str(body), "--from=markdown-implicit_figures", "--to=docx", "--standalone",
                            "--shift-heading-level-by=-1", "--resource-path=" + str(ROOT / "thesis"),
                            "--metadata=title:" + TITLE, "--metadata=lang:en-US",
                            "--reference-doc=" + str(reference), "--output=" + str(target)],
                           cwd=ROOT, check=True)
            kind = "report" if args.only == "report" else source.stem
            format_document(target, kind, REPORT_COVER if kind == "report" else None)
            if kind == "report":
                populate_contents(target, temp)


if __name__ == "__main__":
    main()
