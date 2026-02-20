// 스마트 텍스트 청킹 엔진 — 플랫폼 핵심 도구 #4
// RAG 파이프라인의 입력 품질을 결정하는 핵심 모듈
//
// 지원 방법:
//   separator      - 지정 구분자로 분할 후 chunk_size 이내로 병합
//   tokens         - 토큰 수 기준 분할 (공백+구두점 근사)
//   sentences      - 문장 단위 분할 후 chunk_size 이내로 병합
//   sliding_window - 고정 크기 윈도우를 overlap만큼 슬라이딩
//   recursive      - 큰 구분자 → 작은 구분자 순으로 재귀 분할

use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Chunk {
    pub text: String,
    pub index: usize,
    pub start_char: usize,
    pub end_char: usize,
    pub token_count_approx: usize,
}

/// 토큰 수 근사 (공백+구두점 기반)
fn approx_token_count(text: &str) -> usize {
    // 영어: ~4 chars/token, 한국어: ~2 chars/token
    // 공백 분할 후 긴 단어는 추가 토큰으로 계산
    let words: Vec<&str> = text.split_whitespace().collect();
    let mut count = 0;
    for word in words {
        let char_count = word.chars().count();
        if char_count <= 4 {
            count += 1;
        } else {
            // 긴 단어는 4자당 1토큰으로 근사
            count += (char_count + 3) / 4;
        }
    }
    count.max(1)
}

/// 문장 분할 (한국어/영어 지원)
fn split_sentences(text: &str) -> Vec<String> {
    let mut sentences = Vec::new();
    let mut current = String::new();

    let chars: Vec<char> = text.chars().collect();
    let len = chars.len();

    for i in 0..len {
        current.push(chars[i]);

        // 문장 종결 판별
        let is_sentence_end = match chars[i] {
            '.' | '!' | '?' => {
                // 약어 구분: "Dr.", "Mr.", "3.14" 등은 문장 끝이 아님
                let next_is_space_or_end = i + 1 >= len
                    || chars[i + 1].is_whitespace()
                    || chars[i + 1] == '\n';
                let prev_is_letter = i > 0 && chars[i - 1].is_alphabetic();
                next_is_space_or_end && prev_is_letter && current.trim().len() > 10
            }
            '。' | '！' | '？' => true, // CJK 문장 부호
            '\n' => {
                // 빈 줄은 문단 구분
                i + 1 < len && chars[i + 1] == '\n'
            }
            _ => false,
        };

        if is_sentence_end {
            let trimmed = current.trim().to_string();
            if !trimmed.is_empty() {
                sentences.push(trimmed);
            }
            current.clear();
        }
    }

    // 남은 텍스트
    let trimmed = current.trim().to_string();
    if !trimmed.is_empty() {
        sentences.push(trimmed);
    }

    sentences
}

/// 구분자 기반 분할 + 청크 병합
pub fn chunk_by_separator(
    text: &str,
    separator: &str,
    chunk_size: usize,
    chunk_overlap: usize,
    preserve_sentences: bool,
) -> Vec<Chunk> {
    let sections: Vec<&str> = if separator.is_empty() {
        text.lines().collect()
    } else {
        text.split(separator).collect()
    };

    merge_into_chunks(&sections, chunk_size, chunk_overlap, text, preserve_sentences)
}

/// 토큰 기준 분할
pub fn chunk_by_tokens(
    text: &str,
    chunk_size: usize,
    chunk_overlap: usize,
    preserve_sentences: bool,
) -> Vec<Chunk> {
    if preserve_sentences {
        let sentences = split_sentences(text);
        let refs: Vec<&str> = sentences.iter().map(|s| s.as_str()).collect();
        merge_into_chunks_by_tokens(&refs, chunk_size, chunk_overlap, text)
    } else {
        // 단어 단위 분할
        let words: Vec<&str> = text.split_whitespace().collect();
        let mut chunks = Vec::new();
        let mut start_word = 0;

        while start_word < words.len() {
            let mut current_tokens = 0;
            let mut end_word = start_word;

            while end_word < words.len() && current_tokens < chunk_size {
                current_tokens += approx_token_count(words[end_word]);
                end_word += 1;
            }

            let chunk_text = words[start_word..end_word].join(" ");
            let start_char = text.find(&chunk_text).unwrap_or(0);

            chunks.push(Chunk {
                text: chunk_text.clone(),
                index: chunks.len(),
                start_char,
                end_char: start_char + chunk_text.len(),
                token_count_approx: approx_token_count(&chunk_text),
            });

            // overlap 만큼 되돌림
            let overlap_tokens = chunk_overlap;
            let mut back = 0;
            let mut back_count = 0;
            while back < end_word - start_word && back_count < overlap_tokens {
                back += 1;
                if end_word >= back {
                    back_count += approx_token_count(words[end_word - back]);
                }
            }

            start_word = if back < end_word - start_word {
                end_word - back
            } else {
                end_word
            };
        }

        chunks
    }
}

/// 문장 기반 분할
pub fn chunk_by_sentences(
    text: &str,
    chunk_size: usize,
    chunk_overlap: usize,
) -> Vec<Chunk> {
    let sentences = split_sentences(text);
    let refs: Vec<&str> = sentences.iter().map(|s| s.as_str()).collect();
    merge_into_chunks(&refs, chunk_size, chunk_overlap, text, false)
}

/// 슬라이딩 윈도우 분할
pub fn chunk_by_sliding_window(
    text: &str,
    chunk_size: usize,
    chunk_overlap: usize,
) -> Vec<Chunk> {
    let chars: Vec<char> = text.chars().collect();
    let total = chars.len();
    let step = if chunk_size > chunk_overlap {
        chunk_size - chunk_overlap
    } else {
        1
    };

    let mut chunks = Vec::new();
    let mut pos = 0;

    while pos < total {
        let end = (pos + chunk_size).min(total);
        let chunk_text: String = chars[pos..end].iter().collect();

        chunks.push(Chunk {
            text: chunk_text.clone(),
            index: chunks.len(),
            start_char: pos,
            end_char: end,
            token_count_approx: approx_token_count(&chunk_text),
        });

        pos += step;
        if end >= total {
            break;
        }
    }

    chunks
}

/// 재귀 분할 (LangChain RecursiveCharacterTextSplitter 방식)
pub fn chunk_recursive(
    text: &str,
    chunk_size: usize,
    chunk_overlap: usize,
) -> Vec<Chunk> {
    let separators = ["\n\n\n", "\n\n", "\n", ". ", "。", " ", ""];

    fn recursive_split(
        text: &str,
        separators: &[&str],
        chunk_size: usize,
    ) -> Vec<String> {
        if text.len() <= chunk_size || separators.is_empty() {
            return vec![text.to_string()];
        }

        let sep = separators[0];
        let rest_seps = &separators[1..];

        if sep.is_empty() {
            // 문자 단위 분할
            let chars: Vec<char> = text.chars().collect();
            return chars
                .chunks(chunk_size)
                .map(|c| c.iter().collect::<String>())
                .collect();
        }

        let parts: Vec<&str> = text.split(sep).collect();

        if parts.len() <= 1 {
            // 이 구분자로 분할 불가 → 다음 구분자 시도
            return recursive_split(text, rest_seps, chunk_size);
        }

        let mut result = Vec::new();
        let mut current = String::new();

        for part in parts {
            let candidate = if current.is_empty() {
                part.to_string()
            } else {
                format!("{}{}{}", current, sep, part)
            };

            if candidate.len() <= chunk_size {
                current = candidate;
            } else {
                if !current.is_empty() {
                    result.push(current.clone());
                }
                if part.len() > chunk_size {
                    // 아직 너무 큼 → 더 작은 구분자로 재귀
                    let sub = recursive_split(part, rest_seps, chunk_size);
                    result.extend(sub);
                    current = String::new();
                } else {
                    current = part.to_string();
                }
            }
        }

        if !current.is_empty() {
            result.push(current);
        }

        result
    }

    let parts = recursive_split(text, &separators, chunk_size);

    // overlap 적용하면서 Chunk 생성
    let mut chunks = Vec::new();
    let mut char_pos = 0;

    for (i, part) in parts.iter().enumerate() {
        let mut chunk_text = part.clone();

        // overlap: 이전 청크 끝부분 추가 (UTF-8 문자 경계 존중)
        if i > 0 && chunk_overlap > 0 {
            let prev = &parts[i - 1];
            let prev_chars: Vec<char> = prev.chars().collect();
            let overlap_char_count = chunk_overlap.min(prev_chars.len());
            let overlap_start = prev_chars.len().saturating_sub(overlap_char_count);
            let overlap_text: String = prev_chars[overlap_start..].iter().collect();
            chunk_text = format!("{}{}", overlap_text, chunk_text);
        }

        let start = if char_pos > chunk_overlap { char_pos - chunk_overlap.min(char_pos) } else { 0 };

        chunks.push(Chunk {
            text: chunk_text.clone(),
            index: chunks.len(),
            start_char: start,
            end_char: start + chunk_text.chars().count(),
            token_count_approx: approx_token_count(&chunk_text),
        });

        char_pos += part.chars().count();
    }

    chunks
}

// ─────────────────────────────────────────────
// 내부 헬퍼
// ─────────────────────────────────────────────

fn merge_into_chunks(
    sections: &[&str],
    chunk_size: usize,
    chunk_overlap: usize,
    _original: &str,
    _preserve_sentences: bool,
) -> Vec<Chunk> {
    let mut chunks = Vec::new();
    let mut current = String::new();
    let mut current_start = 0;
    let mut char_pos: usize = 0;

    for section in sections {
        let candidate = if current.is_empty() {
            section.to_string()
        } else {
            format!("{}\n{}", current, section)
        };

        if candidate.chars().count() > chunk_size && !current.is_empty() {
            // 현재 청크 저장
            chunks.push(Chunk {
                text: current.clone(),
                index: chunks.len(),
                start_char: current_start,
                end_char: current_start + current.chars().count(),
                token_count_approx: approx_token_count(&current),
            });

            // overlap (UTF-8 문자 경계 존중)
            let current_chars: Vec<char> = current.chars().collect();
            if chunk_overlap > 0 && current_chars.len() > chunk_overlap {
                let overlap_start = current_chars.len().saturating_sub(chunk_overlap);
                let overlap: String = current_chars[overlap_start..].iter().collect();
                current = format!("{}\n{}", overlap, section);
                current_start = char_pos.saturating_sub(chunk_overlap);
            } else {
                current = section.to_string();
                current_start = char_pos;
            }
        } else {
            if current.is_empty() {
                current_start = char_pos;
            }
            current = candidate;
        }

        char_pos += section.len() + 1; // +1 for separator
    }

    // 남은 텍스트
    if !current.trim().is_empty() {
        chunks.push(Chunk {
            text: current.clone(),
            index: chunks.len(),
            start_char: current_start,
            end_char: current_start + current.chars().count(),
            token_count_approx: approx_token_count(&current),
        });
    }

    chunks
}

fn merge_into_chunks_by_tokens(
    sections: &[&str],
    chunk_size_tokens: usize,
    chunk_overlap_tokens: usize,
    _original: &str,
) -> Vec<Chunk> {
    let mut chunks = Vec::new();
    let mut current = String::new();
    let mut current_tokens = 0;
    let mut current_start = 0;
    let mut char_pos: usize = 0;

    for section in sections {
        let section_tokens = approx_token_count(section);

        if current_tokens + section_tokens > chunk_size_tokens && !current.is_empty() {
            chunks.push(Chunk {
                text: current.clone(),
                index: chunks.len(),
                start_char: current_start,
                end_char: current_start + current.len(),
                token_count_approx: current_tokens,
            });

            // overlap 처리 (간소화: 마지막 section 유지)
            if chunk_overlap_tokens > 0 {
                let words: Vec<&str> = current.split_whitespace().collect();
                let mut overlap_text = String::new();
                let mut overlap_tokens = 0;
                for w in words.iter().rev() {
                    overlap_tokens += approx_token_count(w);
                    if overlap_tokens > chunk_overlap_tokens {
                        break;
                    }
                    overlap_text = format!("{} {}", w, overlap_text);
                }
                current = format!("{} {}", overlap_text.trim(), section);
                current_tokens = approx_token_count(&current);
                current_start = char_pos.saturating_sub(overlap_text.len());
            } else {
                current = section.to_string();
                current_tokens = section_tokens;
                current_start = char_pos;
            }
        } else {
            if current.is_empty() {
                current_start = char_pos;
                current = section.to_string();
            } else {
                current = format!("{} {}", current, section);
            }
            current_tokens += section_tokens;
        }

        char_pos += section.len() + 1;
    }

    if !current.trim().is_empty() {
        chunks.push(Chunk {
            text: current.clone(),
            index: chunks.len(),
            start_char: current_start,
            end_char: current_start + current.len(),
            token_count_approx: current_tokens,
        });
    }

    chunks
}
