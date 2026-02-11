// 파일 시스템 명령어 모듈
// 실제 파일 읽기, 폴더 스캔 등

use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;

#[derive(Debug, Serialize, Deserialize)]
pub struct FileInfo {
    pub name: String,
    pub path: String,
    pub size: u64,
    pub size_formatted: String,
    pub extension: String,
    pub is_directory: bool,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct FolderScanResult {
    pub folder_path: String,
    pub total_files: usize,
    pub total_size: u64,
    pub total_size_formatted: String,
    pub files: Vec<FileInfo>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct FileReadResult {
    pub path: String,
    pub name: String,
    pub size: u64,
    pub size_formatted: String,
    pub content_preview: String,
    pub total_chars: usize,
}

// 바이트를 읽기 쉬운 형식으로 변환
fn format_size(bytes: u64) -> String {
    const KB: u64 = 1024;
    const MB: u64 = KB * 1024;
    const GB: u64 = MB * 1024;

    if bytes >= GB {
        format!("{:.2}GB", bytes as f64 / GB as f64)
    } else if bytes >= MB {
        format!("{:.2}MB", bytes as f64 / MB as f64)
    } else if bytes >= KB {
        format!("{:.2}KB", bytes as f64 / KB as f64)
    } else {
        format!("{}B", bytes)
    }
}

// 파일 정보 가져오기
#[tauri::command]
pub fn get_file_info(file_path: String) -> Result<FileInfo, String> {
    let path = Path::new(&file_path);

    if !path.exists() {
        return Err(format!("파일이 존재하지 않습니다: {}", file_path));
    }

    let metadata = fs::metadata(&path).map_err(|e| e.to_string())?;
    let size = metadata.len();

    // borrow 문제 해결을 위해 먼저 값 추출
    let name = path.file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_default();
    let extension = path.extension()
        .map(|e| e.to_string_lossy().to_string())
        .unwrap_or_default();
    let is_directory = metadata.is_dir();

    Ok(FileInfo {
        name,
        path: file_path,
        size,
        size_formatted: format_size(size),
        extension,
        is_directory,
    })
}

// 폴더 스캔 (파일 목록 및 크기)
#[tauri::command]
pub fn scan_folder(folder_path: String, extensions: Option<Vec<String>>) -> Result<FolderScanResult, String> {
    let path = Path::new(&folder_path);

    if !path.exists() {
        return Err(format!("폴더가 존재하지 않습니다: {}", folder_path));
    }

    if !path.is_dir() {
        return Err(format!("디렉토리가 아닙니다: {}", folder_path));
    }

    let mut files: Vec<FileInfo> = Vec::new();
    let mut total_size: u64 = 0;

    // 재귀적으로 폴더 스캔
    scan_directory_recursive(path, &mut files, &extensions)?;

    for file in &files {
        total_size += file.size;
    }

    Ok(FolderScanResult {
        folder_path,
        total_files: files.len(),
        total_size,
        total_size_formatted: format_size(total_size),
        files,
    })
}

fn scan_directory_recursive(
    dir: &Path,
    files: &mut Vec<FileInfo>,
    extensions: &Option<Vec<String>>,
) -> Result<(), String> {
    let entries = fs::read_dir(dir).map_err(|e| e.to_string())?;

    for entry in entries {
        let entry = entry.map_err(|e| e.to_string())?;
        let path = entry.path();

        if path.is_dir() {
            // 하위 폴더 재귀 스캔
            scan_directory_recursive(&path, files, extensions)?;
        } else if path.is_file() {
            let ext = path.extension()
                .map(|e| e.to_string_lossy().to_lowercase())
                .unwrap_or_default();

            // 확장자 필터 적용
            let should_include = match extensions {
                Some(exts) => exts.iter().any(|e| e.to_lowercase() == ext || e == "*"),
                None => true,
            };

            if should_include {
                let metadata = fs::metadata(&path).map_err(|e| e.to_string())?;
                let size = metadata.len();

                files.push(FileInfo {
                    name: path.file_name()
                        .map(|n| n.to_string_lossy().to_string())
                        .unwrap_or_default(),
                    path: path.to_string_lossy().to_string(),
                    size,
                    size_formatted: format_size(size),
                    extension: ext,
                    is_directory: false,
                });
            }
        }
    }

    Ok(())
}

// 파일 내용 읽기 (텍스트 파일)
#[tauri::command]
pub fn read_file_content(file_path: String, max_chars: Option<usize>) -> Result<FileReadResult, String> {
    let path = Path::new(&file_path);

    if !path.exists() {
        return Err(format!("파일이 존재하지 않습니다: {}", file_path));
    }

    let metadata = fs::metadata(&path).map_err(|e| e.to_string())?;
    let size = metadata.len();

    // borrow 문제 해결을 위해 먼저 이름 추출
    let name = path.file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_default();

    // 텍스트 파일 읽기 시도
    let content = fs::read_to_string(&path).unwrap_or_else(|_| {
        // 바이너리 파일인 경우
        format!("[바이너리 파일 - {}]", format_size(size))
    });

    let total_chars = content.len();
    let max = max_chars.unwrap_or(5000);
    let content_preview = if content.len() > max {
        format!("{}...(총 {}자)", &content[..max], total_chars)
    } else {
        content
    };

    Ok(FileReadResult {
        path: file_path,
        name,
        size,
        size_formatted: format_size(size),
        content_preview,
        total_chars,
    })
}

/// PDF 문서에서 텍스트 추출
#[tauri::command]
pub fn parse_pdf(file_path: String) -> Result<PdfParseResult, String> {
    let path = Path::new(&file_path);

    if !path.exists() {
        return Err(format!("파일을 찾을 수 없습니다: {}", file_path));
    }

    let bytes = fs::read(path)
        .map_err(|e| format!("PDF 파일 읽기 오류: {}", e))?;

    let text = pdf_extract::extract_text_from_mem(&bytes)
        .map_err(|e| format!("PDF 텍스트 추출 오류: {}", e))?;

    let pages = text.matches('\u{c}').count().max(1); // form feed로 페이지 구분
    let characters = text.len();

    Ok(PdfParseResult {
        text,
        pages,
        characters,
        file_path,
    })
}

#[derive(Debug, Serialize, Deserialize)]
pub struct PdfParseResult {
    pub text: String,
    pub pages: usize,
    pub characters: usize,
    pub file_path: String,
}

// 파일 선택 다이얼로그 (Tauri dialog 사용)
#[tauri::command]
pub async fn select_file(
    title: Option<String>,
    filters: Option<Vec<String>>,
) -> Result<Option<String>, String> {
    use tauri::api::dialog::FileDialogBuilder;
    use std::sync::mpsc;

    let (tx, rx) = mpsc::channel();

    let mut dialog = FileDialogBuilder::new();

    if let Some(t) = title {
        dialog = dialog.set_title(&t);
    }

    if let Some(f) = filters {
        let extensions: Vec<&str> = f.iter().map(|s| s.as_str()).collect();
        dialog = dialog.add_filter("Files", &extensions);
    }

    dialog.pick_file(move |path| {
        let _ = tx.send(path.map(|p| p.to_string_lossy().to_string()));
    });

    rx.recv().map_err(|e| e.to_string())
}

// 폴더 선택 다이얼로그
#[tauri::command]
pub async fn select_folder(title: Option<String>) -> Result<Option<String>, String> {
    use tauri::api::dialog::FileDialogBuilder;
    use std::sync::mpsc;

    let (tx, rx) = mpsc::channel();

    let mut dialog = FileDialogBuilder::new();

    if let Some(t) = title {
        dialog = dialog.set_title(&t);
    }

    dialog.pick_folder(move |path| {
        let _ = tx.send(path.map(|p| p.to_string_lossy().to_string()));
    });

    rx.recv().map_err(|e| e.to_string())
}
