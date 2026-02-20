/**
 * Export/문서 생성 도구 노드 정의
 * DOCX, PPTX, PDF, Excel 문서 생성
 */
import { invoke } from '@tauri-apps/api/tauri'
import type { NodeDefinition } from '../registry/NodeDefinition'

export const ExportDocxDefinition: NodeDefinition = {
  type: 'export.docx',
  category: 'export',
  meta: {
    label: 'Word 문서 생성',
    description: 'Microsoft Word 문서(.docx)를 생성합니다. 텍스트, 표, 이미지 지원.',
    icon: 'Description',
    color: '#2563eb',
    tags: ['export', 'docx', 'word', 'document', 'office', '워드', '문서', '생성'],
  },
  ports: {
    inputs: [
      { name: 'content', type: 'text', required: false, description: '문서 내용 (Markdown 또는 일반 텍스트)' },
      { name: 'sections', type: 'json', required: false, description: '섹션 배열 [{title, content, type}]' },
      { name: 'tables', type: 'json', required: false, description: '표 데이터 배열' },
      { name: 'images', type: 'json', required: false, description: '이미지 경로 배열' },
    ],
    outputs: [
      { name: 'file_path', type: 'file-ref', required: true, description: '생성된 파일 경로' },
      { name: 'success', type: 'json', required: false, description: '성공 여부' },
    ],
  },
  configSchema: [
    { key: 'output_path', label: '출력 경로', type: 'file', required: true,
      description: '.docx 확장자로 저장' },
    { key: 'title', label: '문서 제목', type: 'text' },
    { key: 'author', label: '작성자', type: 'text' },
    { key: 'template', label: '템플릿', type: 'select', default: 'default',
      options: [
        { label: '기본', value: 'default' },
        { label: '보고서', value: 'report' },
        { label: '논문', value: 'academic' },
        { label: '레터', value: 'letter' },
        { label: '이력서', value: 'resume' },
      ] },
    { key: 'include_toc', label: '목차 포함', type: 'toggle', default: false },
    { key: 'page_size', label: '페이지 크기', type: 'select', default: 'A4',
      options: [
        { label: 'A4', value: 'A4' },
        { label: 'Letter', value: 'letter' },
        { label: 'Legal', value: 'legal' },
      ] },
    { key: 'margins', label: '여백 (mm)', type: 'text', default: '25,25,25,25',
      description: '상,우,하,좌' },
  ],
  runtime: 'tauri',
  executor: {
    async execute(input, config) {
      const code = `
import json
from docx import Document
from docx.shared import Inches, Pt, Mm
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.style import WD_STYLE_TYPE
import os

doc = Document()

# 문서 속성 설정
core_props = doc.core_properties
core_props.title = '${config.title || "Generated Document"}'
core_props.author = '${config.author || "Handbox"}'

# 페이지 설정
section = doc.sections[0]
margins = '${config.margins || "25,25,25,25"}'.split(',')
section.top_margin = Mm(int(margins[0]))
section.right_margin = Mm(int(margins[1]))
section.bottom_margin = Mm(int(margins[2]))
section.left_margin = Mm(int(margins[3]))

# 제목 추가
if '${config.title}':
    title_para = doc.add_heading('${config.title}', level=0)
    title_para.alignment = WD_ALIGN_PARAGRAPH.CENTER

# 컨텐츠 추가
content = '''${(input.content || '').replace(/'/g, "\\'")}'''
if content:
    for line in content.split('\\n'):
        if line.startswith('# '):
            doc.add_heading(line[2:], level=1)
        elif line.startswith('## '):
            doc.add_heading(line[3:], level=2)
        elif line.startswith('### '):
            doc.add_heading(line[4:], level=3)
        elif line.strip():
            doc.add_paragraph(line)

# 섹션 추가
sections = json.loads('''${JSON.stringify(input.sections || [])}''')
for section_data in sections:
    if section_data.get('title'):
        doc.add_heading(section_data['title'], level=1)
    if section_data.get('content'):
        doc.add_paragraph(section_data['content'])

# 표 추가
tables = json.loads('''${JSON.stringify(input.tables || [])}''')
for table_data in tables:
    if isinstance(table_data, list) and len(table_data) > 0:
        rows = len(table_data)
        cols = len(table_data[0]) if isinstance(table_data[0], list) else 1
        table = doc.add_table(rows=rows, cols=cols)
        table.style = 'Table Grid'
        for i, row_data in enumerate(table_data):
            row = table.rows[i]
            if isinstance(row_data, list):
                for j, cell_data in enumerate(row_data):
                    row.cells[j].text = str(cell_data)
            else:
                row.cells[0].text = str(row_data)

# 저장
output_path = '${config.output_path}'
if not output_path.endswith('.docx'):
    output_path += '.docx'
doc.save(output_path)

print(json.dumps({'file_path': output_path, 'success': True}))
`
      const result = await invoke('tool_code_eval', {
        code,
        language: 'python',
        timeoutMs: 30000,
        inputData: null,
      }) as any

      const parsed = JSON.parse(result.stdout || '{}')
      return {
        file_path: parsed.file_path || config.output_path,
        success: parsed.success || false,
      }
    },
  },
  requirements: { scriptRuntime: 'python3' },
}

export const ExportPptxDefinition: NodeDefinition = {
  type: 'export.pptx',
  category: 'export',
  meta: {
    label: 'PowerPoint 생성',
    description: 'Microsoft PowerPoint 프레젠테이션(.pptx)을 생성합니다.',
    icon: 'Slideshow',
    color: '#dc2626',
    tags: ['export', 'pptx', 'powerpoint', 'presentation', 'office', '파워포인트', 'PPT'],
  },
  ports: {
    inputs: [
      { name: 'slides', type: 'json', required: true, description: '슬라이드 배열 [{title, content, layout, images}]' },
      { name: 'title', type: 'text', required: false, description: '프레젠테이션 제목' },
    ],
    outputs: [
      { name: 'file_path', type: 'file-ref', required: true, description: '생성된 파일 경로' },
      { name: 'slide_count', type: 'json', required: false, description: '슬라이드 수' },
    ],
  },
  configSchema: [
    { key: 'output_path', label: '출력 경로', type: 'file', required: true },
    { key: 'template', label: '템플릿', type: 'select', default: 'default',
      options: [
        { label: '기본', value: 'default' },
        { label: '비즈니스', value: 'business' },
        { label: '교육', value: 'education' },
        { label: '미니멀', value: 'minimal' },
      ] },
    { key: 'slide_width', label: '슬라이드 너비', type: 'select', default: '16:9',
      options: [
        { label: '16:9 (와이드)', value: '16:9' },
        { label: '4:3 (표준)', value: '4:3' },
      ] },
    { key: 'default_layout', label: '기본 레이아웃', type: 'select', default: 'title_content',
      options: [
        { label: '제목 + 내용', value: 'title_content' },
        { label: '제목만', value: 'title_only' },
        { label: '빈 슬라이드', value: 'blank' },
        { label: '비교 (좌우)', value: 'comparison' },
        { label: '제목 + 2열', value: 'two_content' },
      ] },
  ],
  runtime: 'tauri',
  executor: {
    async execute(input, config) {
      const code = `
import json
from pptx import Presentation
from pptx.util import Inches, Pt
from pptx.enum.text import PP_ALIGN
from pptx.dml.color import RgbColor

prs = Presentation()

# 슬라이드 크기 설정
if '${config.slide_width}' == '16:9':
    prs.slide_width = Inches(13.333)
    prs.slide_height = Inches(7.5)
else:
    prs.slide_width = Inches(10)
    prs.slide_height = Inches(7.5)

slides_data = json.loads('''${JSON.stringify(input.slides || [])}''')

# 제목 슬라이드 추가
if '${input.title || config.title || ''}':
    title_slide_layout = prs.slide_layouts[0]
    slide = prs.slides.add_slide(title_slide_layout)
    title = slide.shapes.title
    title.text = '${input.title || config.title || 'Presentation'}'

# 슬라이드 생성
for slide_data in slides_data:
    layout_idx = 1  # 기본: 제목 + 내용
    if slide_data.get('layout') == 'title_only':
        layout_idx = 5
    elif slide_data.get('layout') == 'blank':
        layout_idx = 6
    elif slide_data.get('layout') == 'two_content':
        layout_idx = 3

    slide_layout = prs.slide_layouts[layout_idx]
    slide = prs.slides.add_slide(slide_layout)

    if slide.shapes.title and slide_data.get('title'):
        slide.shapes.title.text = slide_data['title']

    # 내용 추가
    for shape in slide.shapes:
        if shape.has_text_frame and shape != slide.shapes.title:
            content = slide_data.get('content', '')
            if isinstance(content, list):
                content = '\\n'.join(['• ' + str(item) for item in content])
            shape.text_frame.text = str(content)
            break

# 저장
output_path = '${config.output_path}'
if not output_path.endswith('.pptx'):
    output_path += '.pptx'
prs.save(output_path)

print(json.dumps({'file_path': output_path, 'slide_count': len(prs.slides)}))
`
      const result = await invoke('tool_code_eval', {
        code,
        language: 'python',
        timeoutMs: 30000,
        inputData: null,
      }) as any

      const parsed = JSON.parse(result.stdout || '{}')
      return {
        file_path: parsed.file_path || config.output_path,
        slide_count: parsed.slide_count || 0,
      }
    },
  },
  requirements: { scriptRuntime: 'python3' },
}

export const ExportPdfDefinition: NodeDefinition = {
  type: 'export.pdf',
  category: 'export',
  meta: {
    label: 'PDF 보고서 생성',
    description: 'PDF 문서를 생성합니다. 차트, 표, 이미지 포함 가능.',
    icon: 'PictureAsPdf',
    color: '#ef4444',
    tags: ['export', 'pdf', 'report', 'document', 'PDF', '보고서'],
  },
  ports: {
    inputs: [
      { name: 'content', type: 'text', required: false, description: '문서 내용 (Markdown)' },
      { name: 'sections', type: 'json', required: false, description: '섹션 배열' },
      { name: 'charts', type: 'json', required: false, description: '차트 데이터' },
      { name: 'tables', type: 'json', required: false, description: '표 데이터' },
    ],
    outputs: [
      { name: 'file_path', type: 'file-ref', required: true, description: '생성된 PDF 경로' },
      { name: 'page_count', type: 'json', required: false, description: '페이지 수' },
    ],
  },
  configSchema: [
    { key: 'output_path', label: '출력 경로', type: 'file', required: true },
    { key: 'title', label: '제목', type: 'text' },
    { key: 'subtitle', label: '부제목', type: 'text' },
    { key: 'author', label: '작성자', type: 'text' },
    { key: 'page_size', label: '페이지 크기', type: 'select', default: 'A4',
      options: [
        { label: 'A4', value: 'A4' },
        { label: 'Letter', value: 'letter' },
        { label: 'Legal', value: 'legal' },
      ] },
    { key: 'include_toc', label: '목차 포함', type: 'toggle', default: true },
    { key: 'include_page_numbers', label: '페이지 번호', type: 'toggle', default: true },
    { key: 'header_text', label: '머리글', type: 'text' },
    { key: 'footer_text', label: '바닥글', type: 'text' },
  ],
  runtime: 'tauri',
  executor: {
    async execute(input, config) {
      const code = `
import json
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4, letter, legal
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch, cm
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak
from reportlab.platypus.tableofcontents import TableOfContents

page_sizes = {'A4': A4, 'letter': letter, 'legal': legal}
page_size = page_sizes.get('${config.page_size}', A4)

output_path = '${config.output_path}'
if not output_path.endswith('.pdf'):
    output_path += '.pdf'

doc = SimpleDocTemplate(output_path, pagesize=page_size)
styles = getSampleStyleSheet()
story = []

# 제목 페이지
if '${config.title}':
    title_style = ParagraphStyle(
        'CustomTitle',
        parent=styles['Title'],
        fontSize=24,
        spaceAfter=30
    )
    story.append(Spacer(1, 2*inch))
    story.append(Paragraph('${config.title}', title_style))
    if '${config.subtitle}':
        story.append(Paragraph('${config.subtitle}', styles['Heading2']))
    if '${config.author}':
        story.append(Spacer(1, inch))
        story.append(Paragraph('작성자: ${config.author}', styles['Normal']))
    story.append(PageBreak())

# 내용 추가
content = '''${(input.content || '').replace(/'/g, "\\'")}'''
if content:
    for line in content.split('\\n'):
        if line.startswith('# '):
            story.append(Paragraph(line[2:], styles['Heading1']))
        elif line.startswith('## '):
            story.append(Paragraph(line[3:], styles['Heading2']))
        elif line.startswith('### '):
            story.append(Paragraph(line[4:], styles['Heading3']))
        elif line.strip():
            story.append(Paragraph(line, styles['Normal']))
            story.append(Spacer(1, 6))

# 섹션 추가
sections = json.loads('''${JSON.stringify(input.sections || [])}''')
for section in sections:
    if section.get('title'):
        story.append(Paragraph(section['title'], styles['Heading1']))
    if section.get('content'):
        story.append(Paragraph(section['content'], styles['Normal']))
    story.append(Spacer(1, 12))

# 표 추가
tables_data = json.loads('''${JSON.stringify(input.tables || [])}''')
for table_data in tables_data:
    if table_data:
        t = Table(table_data)
        t.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.grey),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
            ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('BOTTOMPADDING', (0, 0), (-1, 0), 12),
            ('BACKGROUND', (0, 1), (-1, -1), colors.beige),
            ('GRID', (0, 0), (-1, -1), 1, colors.black)
        ]))
        story.append(t)
        story.append(Spacer(1, 12))

doc.build(story)

print(json.dumps({'file_path': output_path, 'page_count': 1}))
`
      const result = await invoke('tool_code_eval', {
        code,
        language: 'python',
        timeoutMs: 30000,
        inputData: null,
      }) as any

      const parsed = JSON.parse(result.stdout || '{}')
      return {
        file_path: parsed.file_path || config.output_path,
        page_count: parsed.page_count || 1,
      }
    },
  },
  requirements: { scriptRuntime: 'python3' },
}

export const ExportExcelDefinition: NodeDefinition = {
  type: 'export.xlsx',
  category: 'export',
  meta: {
    label: 'Excel 생성',
    description: 'Microsoft Excel 파일(.xlsx)을 생성합니다. 여러 시트, 차트 지원.',
    icon: 'TableChart',
    color: '#16a34a',
    tags: ['export', 'xlsx', 'excel', 'spreadsheet', '엑셀', '스프레드시트'],
  },
  ports: {
    inputs: [
      { name: 'data', type: 'json', required: true, description: '데이터 (배열 또는 {시트명: 배열})' },
      { name: 'charts', type: 'json', required: false, description: '차트 설정' },
    ],
    outputs: [
      { name: 'file_path', type: 'file-ref', required: true, description: '생성된 파일 경로' },
      { name: 'sheet_count', type: 'json', required: false, description: '시트 수' },
    ],
  },
  configSchema: [
    { key: 'output_path', label: '출력 경로', type: 'file', required: true },
    { key: 'sheet_name', label: '시트 이름', type: 'text', default: 'Sheet1' },
    { key: 'include_header', label: '헤더 포함', type: 'toggle', default: true },
    { key: 'auto_width', label: '열 너비 자동 조절', type: 'toggle', default: true },
    { key: 'freeze_header', label: '헤더 고정', type: 'toggle', default: true },
    { key: 'add_filters', label: '필터 추가', type: 'toggle', default: false },
  ],
  runtime: 'tauri',
  executor: {
    async execute(input, config) {
      const code = `
import json
import pandas as pd
from openpyxl import Workbook
from openpyxl.utils.dataframe import dataframe_to_rows
from openpyxl.styles import Font, PatternFill, Alignment
from openpyxl.utils import get_column_letter

data = json.loads('''${JSON.stringify(input.data)}''')

output_path = '${config.output_path}'
if not output_path.endswith('.xlsx'):
    output_path += '.xlsx'

wb = Workbook()
ws = wb.active
ws.title = '${config.sheet_name || "Sheet1"}'

# 데이터가 딕셔너리면 여러 시트로
if isinstance(data, dict):
    first = True
    for sheet_name, sheet_data in data.items():
        if first:
            ws.title = sheet_name
            first = False
        else:
            ws = wb.create_sheet(title=sheet_name)

        df = pd.DataFrame(sheet_data)
        for r_idx, row in enumerate(dataframe_to_rows(df, index=False, header=${config.include_header ? 'True' : 'False'})):
            for c_idx, value in enumerate(row, 1):
                cell = ws.cell(row=r_idx+1, column=c_idx, value=value)
                if r_idx == 0 and ${config.include_header ? 'True' : 'False'}:
                    cell.font = Font(bold=True)
                    cell.fill = PatternFill(start_color='CCCCCC', end_color='CCCCCC', fill_type='solid')
else:
    df = pd.DataFrame(data)
    for r_idx, row in enumerate(dataframe_to_rows(df, index=False, header=${config.include_header ? 'True' : 'False'})):
        for c_idx, value in enumerate(row, 1):
            cell = ws.cell(row=r_idx+1, column=c_idx, value=value)
            if r_idx == 0 and ${config.include_header ? 'True' : 'False'}:
                cell.font = Font(bold=True)
                cell.fill = PatternFill(start_color='CCCCCC', end_color='CCCCCC', fill_type='solid')

# 열 너비 자동 조절
if ${config.auto_width ? 'True' : 'False'}:
    for sheet in wb.worksheets:
        for column in sheet.columns:
            max_length = 0
            column_letter = get_column_letter(column[0].column)
            for cell in column:
                try:
                    if len(str(cell.value)) > max_length:
                        max_length = len(str(cell.value))
                except:
                    pass
            sheet.column_dimensions[column_letter].width = min(max_length + 2, 50)

# 헤더 고정
if ${config.freeze_header ? 'True' : 'False'}:
    for sheet in wb.worksheets:
        sheet.freeze_panes = 'A2'

wb.save(output_path)

print(json.dumps({'file_path': output_path, 'sheet_count': len(wb.worksheets)}))
`
      const result = await invoke('tool_code_eval', {
        code,
        language: 'python',
        timeoutMs: 30000,
        inputData: null,
      }) as any

      const parsed = JSON.parse(result.stdout || '{}')
      return {
        file_path: parsed.file_path || config.output_path,
        sheet_count: parsed.sheet_count || 1,
      }
    },
  },
  requirements: { scriptRuntime: 'python3' },
}

export const EXPORT_DEFINITIONS: NodeDefinition[] = [
  ExportDocxDefinition,
  ExportPptxDefinition,
  ExportPdfDefinition,
  ExportExcelDefinition,
]
