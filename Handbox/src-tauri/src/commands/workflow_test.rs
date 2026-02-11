// 워크플로우 노드 테스트 모듈

#[cfg(test)]
mod tests {
    use super::super::workflow::*;
    use serde_json::json;

    // 헬퍼: 테스트용 노드 생성
    fn create_test_node(node_type: &str, config: serde_json::Value) -> WorkflowNode {
        WorkflowNode {
            id: format!("test_{}", node_type),
            node_type: node_type.to_string(),
            position: Position { x: 0.0, y: 0.0 },
            data: json!({
                "label": format!("Test {}", node_type),
                "config": config
            }),
        }
    }

    // ========================================
    // 입출력 노드 테스트
    // ========================================

    #[tokio::test]
    async fn test_input_node() {
        let node = create_test_node("input", json!({}));
        let input = json!({
            "text": "테스트 입력 텍스트입니다.",
            "query": "테스트 쿼리"
        });

        let result = execute_node_for_test(&node, &input).await;
        assert!(result.is_ok(), "input 노드 실행 실패: {:?}", result.err());

        let output = result.unwrap();
        assert_eq!(output.get("type").and_then(|v| v.as_str()), Some("input"));
        assert!(output.get("text").is_some(), "text 필드가 없음");
        println!("✅ input 노드 테스트 통과");
    }

    #[tokio::test]
    async fn test_output_node() {
        let node = create_test_node("output", json!({}));
        let input = json!({
            "response": "모델 응답 결과입니다.",
            "status": "executed"
        });

        let result = execute_node_for_test(&node, &input).await;
        assert!(result.is_ok(), "output 노드 실행 실패: {:?}", result.err());
        println!("✅ output 노드 테스트 통과");
    }

    #[tokio::test]
    async fn test_prompt_template_node() {
        let node = create_test_node("prompt-template", json!({
            "template": "다음 텍스트를 분석해주세요:\n\n{{input}}\n\n분석 결과를 JSON으로 출력하세요."
        }));
        let input = json!({
            "text": "건설신기술 제1234호 - 스마트 콘크리트 양생 시스템"
        });

        let result = execute_node_for_test(&node, &input).await;
        assert!(result.is_ok(), "prompt-template 노드 실행 실패: {:?}", result.err());

        let output = result.unwrap();
        let rendered = output.get("rendered").and_then(|v| v.as_str()).unwrap_or("");
        assert!(rendered.contains("건설신기술"), "템플릿 렌더링 실패: {}", rendered);
        assert!(rendered.contains("분석해주세요"), "템플릿이 렌더링되지 않음");
        println!("✅ prompt-template 노드 테스트 통과");
        println!("   렌더링 결과: {}...", &rendered[..rendered.len().min(100)]);
    }

    #[tokio::test]
    async fn test_merge_node() {
        let node = create_test_node("merge", json!({}));
        let input = json!({
            "branch1": {
                "service": "translate",
                "status": "executed",
                "translated_text": "Hello World"
            },
            "branch2": {
                "service": "comprehend",
                "status": "executed",
                "sentiment": "POSITIVE"
            }
        });

        let result = execute_node_for_test(&node, &input).await;
        assert!(result.is_ok(), "merge 노드 실행 실패: {:?}", result.err());

        let output = result.unwrap();
        assert_eq!(output.get("type").and_then(|v| v.as_str()), Some("merge"));
        assert!(output.get("results").is_some(), "results 필드가 없음");
        println!("✅ merge 노드 테스트 통과");
    }

    // ========================================
    // 데이터 처리 노드 테스트
    // ========================================

    #[tokio::test]
    async fn test_text_splitter_node() {
        let node = create_test_node("text-splitter", json!({
            "chunk_size": 100,
            "chunk_overlap": 20,
            "split_by": "paragraph"
        }));
        let input = json!({
            "text": "첫 번째 문단입니다. 이것은 테스트 텍스트입니다.\n\n두 번째 문단입니다. 텍스트 분할을 테스트합니다.\n\n세 번째 문단입니다. 청크가 제대로 생성되는지 확인합니다."
        });

        let result = execute_node_for_test(&node, &input).await;
        assert!(result.is_ok(), "text-splitter 노드 실행 실패: {:?}", result.err());

        let output = result.unwrap();
        let chunks = output.get("chunks").and_then(|v| v.as_array());
        assert!(chunks.is_some(), "chunks 필드가 없음");
        assert!(chunks.unwrap().len() > 0, "청크가 생성되지 않음");

        println!("✅ text-splitter 노드 테스트 통과");
        println!("   생성된 청크 수: {}", chunks.unwrap().len());
    }

    #[tokio::test]
    async fn test_text_splitter_sentence_mode() {
        let node = create_test_node("text-splitter", json!({
            "chunk_size": 50,
            "chunk_overlap": 10,
            "split_by": "sentence"
        }));
        let input = json!({
            "text": "첫 번째 문장입니다. 두 번째 문장입니다. 세 번째 문장입니다."
        });

        let result = execute_node_for_test(&node, &input).await;
        assert!(result.is_ok(), "text-splitter(sentence) 실행 실패");
        println!("✅ text-splitter (sentence mode) 테스트 통과");
    }

    // ========================================
    // 문서 파싱 노드 테스트
    // ========================================

    #[tokio::test]
    async fn test_doc_csv_parser_node() {
        let node = create_test_node("doc-csv-parser", json!({
            "delimiter": ",",
            "has_header": true
        }));
        let input = json!({
            "text": "이름,나이,도시\n홍길동,30,서울\n김철수,25,부산\n이영희,28,대전"
        });

        let result = execute_node_for_test(&node, &input).await;
        assert!(result.is_ok(), "doc-csv-parser 노드 실행 실패: {:?}", result.err());

        let output = result.unwrap();
        assert_eq!(output.get("status").and_then(|v| v.as_str()), Some("executed"));

        let headers = output.get("headers").and_then(|v| v.as_array());
        assert!(headers.is_some(), "headers 필드가 없음");
        assert_eq!(headers.unwrap().len(), 3, "헤더 수가 맞지 않음");

        let data = output.get("data").and_then(|v| v.as_array());
        assert!(data.is_some(), "data 필드가 없음");
        assert_eq!(data.unwrap().len(), 3, "데이터 행 수가 맞지 않음");

        println!("✅ doc-csv-parser 노드 테스트 통과");
        println!("   헤더: {:?}", headers.unwrap());
        println!("   행 수: {}", data.unwrap().len());
    }

    #[tokio::test]
    async fn test_doc_json_parser_node() {
        let node = create_test_node("doc-json-parser", json!({
            "json_path": "data.items"
        }));
        let input = json!({
            "text": r#"{"data": {"items": [{"id": 1, "name": "항목1"}, {"id": 2, "name": "항목2"}], "total": 2}}"#
        });

        let result = execute_node_for_test(&node, &input).await;
        assert!(result.is_ok(), "doc-json-parser 노드 실행 실패: {:?}", result.err());

        let output = result.unwrap();
        assert_eq!(output.get("status").and_then(|v| v.as_str()), Some("executed"));

        let data = output.get("data").and_then(|v| v.as_array());
        assert!(data.is_some(), "JSON 경로 추출 실패");
        assert_eq!(data.unwrap().len(), 2, "추출된 항목 수가 맞지 않음");

        println!("✅ doc-json-parser 노드 테스트 통과");
    }

    #[tokio::test]
    async fn test_doc_xml_parser_node() {
        let node = create_test_node("doc-xml-parser", json!({}));
        let input = json!({
            "text": "<?xml version=\"1.0\"?><root><item>테스트</item></root>"
        });

        let result = execute_node_for_test(&node, &input).await;
        assert!(result.is_ok(), "doc-xml-parser 노드 실행 실패: {:?}", result.err());

        let output = result.unwrap();
        assert_eq!(output.get("status").and_then(|v| v.as_str()), Some("executed"));
        println!("✅ doc-xml-parser 노드 테스트 통과");
    }

    // ========================================
    // 내보내기 노드 테스트
    // ========================================

    #[tokio::test]
    async fn test_export_csv_node() {
        let node = create_test_node("export-csv", json!({
            "delimiter": ","
        }));
        let input = json!({
            "data": [
                {"name": "항목1", "value": 100},
                {"name": "항목2", "value": 200}
            ]
        });

        let result = execute_node_for_test(&node, &input).await;
        assert!(result.is_ok(), "export-csv 노드 실행 실패: {:?}", result.err());

        let output = result.unwrap();
        assert_eq!(output.get("status").and_then(|v| v.as_str()), Some("executed"));

        let content = output.get("content").and_then(|v| v.as_str());
        assert!(content.is_some(), "CSV 내용이 없음");
        assert!(content.unwrap().contains("name"), "CSV 헤더가 없음");

        println!("✅ export-csv 노드 테스트 통과");
        println!("   CSV 내용:\n{}", content.unwrap());
    }

    #[tokio::test]
    async fn test_export_json_node() {
        let node = create_test_node("export-json", json!({
            "pretty": true
        }));
        let input = json!({
            "data": {"key": "value", "number": 42}
        });

        let result = execute_node_for_test(&node, &input).await;
        assert!(result.is_ok(), "export-json 노드 실행 실패: {:?}", result.err());

        let output = result.unwrap();
        assert_eq!(output.get("status").and_then(|v| v.as_str()), Some("executed"));
        println!("✅ export-json 노드 테스트 통과");
    }

    #[tokio::test]
    async fn test_export_markdown_node() {
        let node = create_test_node("export-markdown", json!({}));
        let input = json!({
            "text": "# 제목\n\n본문 내용입니다.\n\n## 부제목\n\n- 항목 1\n- 항목 2"
        });

        let result = execute_node_for_test(&node, &input).await;
        assert!(result.is_ok(), "export-markdown 노드 실행 실패: {:?}", result.err());
        println!("✅ export-markdown 노드 테스트 통과");
    }

    // ========================================
    // 시각화 노드 테스트
    // ========================================

    #[tokio::test]
    async fn test_viz_diff_viewer_node() {
        let node = create_test_node("viz-diff-viewer", json!({
            "diff_mode": "line"
        }));
        let input = json!({
            "text_a": "첫 번째 줄\n두 번째 줄\n세 번째 줄",
            "text_b": "첫 번째 줄\n수정된 두 번째 줄\n세 번째 줄"
        });

        let result = execute_node_for_test(&node, &input).await;
        assert!(result.is_ok(), "viz-diff-viewer 노드 실행 실패: {:?}", result.err());

        let output = result.unwrap();
        assert_eq!(output.get("viz_type").and_then(|v| v.as_str()), Some("diff-viewer"));
        println!("✅ viz-diff-viewer 노드 테스트 통과");
    }

    #[tokio::test]
    async fn test_viz_flow_diagram_node() {
        let node = create_test_node("viz-flow-diagram", json!({
            "diagram_format": "mermaid",
            "direction": "TD"
        }));
        let input = json!({
            "text": "graph TD\n  A[시작] --> B{조건}\n  B -->|Yes| C[처리]\n  B -->|No| D[종료]"
        });

        let result = execute_node_for_test(&node, &input).await;
        assert!(result.is_ok(), "viz-flow-diagram 노드 실행 실패: {:?}", result.err());

        let output = result.unwrap();
        assert_eq!(output.get("viz_type").and_then(|v| v.as_str()), Some("flow-diagram"));
        println!("✅ viz-flow-diagram 노드 테스트 통과");
    }

    #[tokio::test]
    async fn test_viz_chart_node() {
        let node = create_test_node("viz-chart", json!({
            "chart_type": "bar"
        }));
        let input = json!({
            "data": [
                {"label": "1월", "value": 100},
                {"label": "2월", "value": 150},
                {"label": "3월", "value": 120}
            ]
        });

        let result = execute_node_for_test(&node, &input).await;
        assert!(result.is_ok(), "viz-chart 노드 실행 실패: {:?}", result.err());

        let output = result.unwrap();
        assert_eq!(output.get("viz_type").and_then(|v| v.as_str()), Some("chart"));
        println!("✅ viz-chart 노드 테스트 통과");
    }

    #[tokio::test]
    async fn test_viz_table_viewer_node() {
        let node = create_test_node("viz-table-viewer", json!({}));
        let input = json!({
            "data": [
                {"id": 1, "name": "항목1"},
                {"id": 2, "name": "항목2"}
            ]
        });

        let result = execute_node_for_test(&node, &input).await;
        assert!(result.is_ok(), "viz-table-viewer 노드 실행 실패: {:?}", result.err());
        println!("✅ viz-table-viewer 노드 테스트 통과");
    }

    #[tokio::test]
    async fn test_viz_json_viewer_node() {
        let node = create_test_node("viz-json-viewer", json!({
            "expand_depth": 2
        }));
        let input = json!({
            "data": {"nested": {"deep": {"value": 42}}}
        });

        let result = execute_node_for_test(&node, &input).await;
        assert!(result.is_ok(), "viz-json-viewer 노드 실행 실패: {:?}", result.err());
        println!("✅ viz-json-viewer 노드 테스트 통과");
    }

    #[tokio::test]
    async fn test_viz_markdown_viewer_node() {
        let node = create_test_node("viz-markdown-viewer", json!({}));
        let input = json!({
            "text": "# 제목\n\n**굵은 글씨**와 *기울임*"
        });

        let result = execute_node_for_test(&node, &input).await;
        assert!(result.is_ok(), "viz-markdown-viewer 노드 실행 실패: {:?}", result.err());
        println!("✅ viz-markdown-viewer 노드 테스트 통과");
    }

    // ========================================
    // 액션 노드 테스트
    // ========================================

    #[tokio::test]
    async fn test_notification_node() {
        let node = create_test_node("notification", json!({
            "title": "테스트 알림",
            "message": "이것은 테스트 메시지입니다."
        }));
        let input = json!({});

        let result = execute_node_for_test(&node, &input).await;
        assert!(result.is_ok(), "notification 노드 실행 실패: {:?}", result.err());

        let output = result.unwrap();
        assert_eq!(output.get("action_type").and_then(|v| v.as_str()), Some("notification"));
        println!("✅ notification 노드 테스트 통과");
    }

    #[tokio::test]
    async fn test_timer_node() {
        let node = create_test_node("timer", json!({
            "interval_ms": 5000
        }));
        let input = json!({});

        let result = execute_node_for_test(&node, &input).await;
        assert!(result.is_ok(), "timer 노드 실행 실패: {:?}", result.err());

        let output = result.unwrap();
        assert_eq!(output.get("trigger_type").and_then(|v| v.as_str()), Some("timer"));
        println!("✅ timer 노드 테스트 통과");
    }

    #[tokio::test]
    async fn test_scheduler_node() {
        let node = create_test_node("scheduler", json!({
            "schedule": "0 9 * * 1-5"
        }));
        let input = json!({});

        let result = execute_node_for_test(&node, &input).await;
        assert!(result.is_ok(), "scheduler 노드 실행 실패: {:?}", result.err());
        println!("✅ scheduler 노드 테스트 통과");
    }

    #[tokio::test]
    async fn test_shell_command_node_safe() {
        // 안전한 명령어 테스트 (현재 디렉토리 출력)
        #[cfg(windows)]
        let command = "echo Hello World";
        #[cfg(not(windows))]
        let command = "echo 'Hello World'";

        let node = create_test_node("shell-command", json!({
            "command": command,
            "timeout_secs": 10
        }));
        let input = json!({});

        let result = execute_node_for_test(&node, &input).await;
        assert!(result.is_ok(), "shell-command 노드 실행 실패: {:?}", result.err());

        let output = result.unwrap();
        let stdout = output.get("stdout").and_then(|v| v.as_str()).unwrap_or("");
        assert!(stdout.contains("Hello"), "명령어 출력이 없음: {}", stdout);

        println!("✅ shell-command 노드 테스트 통과");
        println!("   출력: {}", stdout.trim());
    }

    #[tokio::test]
    async fn test_shell_command_dangerous_blocked() {
        // 위험한 명령어는 차단되어야 함
        let node = create_test_node("shell-command", json!({
            "command": "rm -rf /",
            "timeout_secs": 10
        }));
        let input = json!({});

        let result = execute_node_for_test(&node, &input).await;
        assert!(result.is_ok()); // 노드 자체는 실행됨

        let output = result.unwrap();
        assert_eq!(output.get("status").and_then(|v| v.as_str()), Some("error"));
        assert!(output.get("error").and_then(|v| v.as_str()).unwrap_or("").contains("차단"));

        println!("✅ shell-command 위험 명령어 차단 테스트 통과");
    }

    // ========================================
    // KB/벡터DB 노드 테스트
    // ========================================

    #[tokio::test]
    async fn test_kb_query_node() {
        let node = create_test_node("kb-query", json!({
            "knowledge_base_id": "TEST_KB_ID"
        }));
        let input = json!({
            "query": "건설신기술이란 무엇인가요?"
        });

        let result = execute_node_for_test(&node, &input).await;
        assert!(result.is_ok(), "kb-query 노드 실행 실패: {:?}", result.err());

        let output = result.unwrap();
        assert_eq!(output.get("operation").and_then(|v| v.as_str()), Some("query"));
        println!("✅ kb-query 노드 테스트 통과");
    }

    #[tokio::test]
    async fn test_kb_ingest_node() {
        let node = create_test_node("kb-ingest", json!({
            "knowledge_base_id": "TEST_KB_ID",
            "s3_uri": "s3://test-bucket/documents/"
        }));
        let input = json!({});

        let result = execute_node_for_test(&node, &input).await;
        assert!(result.is_ok(), "kb-ingest 노드 실행 실패: {:?}", result.err());
        println!("✅ kb-ingest 노드 테스트 통과");
    }

    #[tokio::test]
    async fn test_vector_pinecone_node() {
        let node = create_test_node("vector-pinecone", json!({
            "index_name": "test-index",
            "api_key": "test-key"
        }));
        let input = json!({});

        let result = execute_node_for_test(&node, &input).await;
        assert!(result.is_ok(), "vector-pinecone 노드 실행 실패: {:?}", result.err());

        let output = result.unwrap();
        assert_eq!(output.get("db_type").and_then(|v| v.as_str()), Some("pinecone"));
        println!("✅ vector-pinecone 노드 테스트 통과");
    }

    // ========================================
    // 이미지 생성 노드 테스트
    // ========================================

    #[tokio::test]
    async fn test_img_titan_gen_no_prompt() {
        // 프롬프트 없이 호출하면 에러
        let node = create_test_node("img-titan-gen", json!({
            "width": 512,
            "height": 512
        }));
        let input = json!({});

        let result = execute_node_for_test(&node, &input).await;
        assert!(result.is_ok());

        let output = result.unwrap();
        assert_eq!(output.get("status").and_then(|v| v.as_str()), Some("error"));
        assert!(output.get("error").and_then(|v| v.as_str()).unwrap_or("").contains("프롬프트"));

        println!("✅ img-titan-gen (프롬프트 없음) 테스트 통과");
    }

    // ========================================
    // 제어 노드 테스트
    // ========================================

    #[tokio::test]
    async fn test_conditional_node() {
        let node = create_test_node("conditional", json!({
            "condition": "result.score > 80"
        }));
        let input = json!({
            "result": {"score": 85}
        });

        let result = execute_node_for_test(&node, &input).await;
        assert!(result.is_ok(), "conditional 노드 실행 실패: {:?}", result.err());
        println!("✅ conditional 노드 테스트 통과");
    }

    #[tokio::test]
    async fn test_loop_node() {
        let node = create_test_node("loop", json!({
            "iterations": 3
        }));
        let input = json!({
            "items": ["a", "b", "c"]
        });

        let result = execute_node_for_test(&node, &input).await;
        assert!(result.is_ok(), "loop 노드 실행 실패: {:?}", result.err());
        println!("✅ loop 노드 테스트 통과");
    }

    // ========================================
    // 로컬 파일/폴더 노드 테스트
    // ========================================

    #[tokio::test]
    async fn test_local_file_no_path() {
        let node = create_test_node("local-file", json!({}));
        let input = json!({});

        let result = execute_node_for_test(&node, &input).await;
        assert!(result.is_ok());

        let output = result.unwrap();
        assert_eq!(output.get("status").and_then(|v| v.as_str()), Some("error"));
        println!("✅ local-file (경로 없음) 테스트 통과");
    }

    #[tokio::test]
    async fn test_local_folder_no_path() {
        let node = create_test_node("local-folder", json!({}));
        let input = json!({});

        let result = execute_node_for_test(&node, &input).await;
        assert!(result.is_ok());

        let output = result.unwrap();
        assert_eq!(output.get("status").and_then(|v| v.as_str()), Some("error"));
        println!("✅ local-folder (경로 없음) 테스트 통과");
    }

    // ========================================
    // AWS 서비스 노드 테스트 (API 호출 없이)
    // ========================================

    #[tokio::test]
    async fn test_aws_translate_no_text() {
        let node = create_test_node("aws-translate", json!({
            "source_lang": "ko",
            "target_lang": "en"
        }));
        let input = json!({});

        let result = execute_node_for_test(&node, &input).await;
        assert!(result.is_ok());

        let output = result.unwrap();
        assert_eq!(output.get("status").and_then(|v| v.as_str()), Some("error"));
        assert!(output.get("error").and_then(|v| v.as_str()).unwrap_or("").contains("텍스트"));
        println!("✅ aws-translate (텍스트 없음) 테스트 통과");
    }

    #[tokio::test]
    async fn test_aws_comprehend_no_text() {
        let node = create_test_node("aws-comprehend", json!({
            "languageCode": "ko",
            "features": ["SENTIMENT"]
        }));
        let input = json!({});

        let result = execute_node_for_test(&node, &input).await;
        assert!(result.is_ok());

        let output = result.unwrap();
        assert_eq!(output.get("status").and_then(|v| v.as_str()), Some("error"));
        println!("✅ aws-comprehend (텍스트 없음) 테스트 통과");
    }

    // ========================================
    // API 노드 테스트
    // ========================================

    #[tokio::test]
    async fn test_api_generic_no_url() {
        let node = create_test_node("api-generic", json!({
            "method": "GET"
        }));
        let input = json!({});

        let result = execute_node_for_test(&node, &input).await;
        assert!(result.is_ok());

        let output = result.unwrap();
        assert_eq!(output.get("status").and_then(|v| v.as_str()), Some("error"));
        assert!(output.get("error").and_then(|v| v.as_str()).unwrap_or("").contains("URL"));
        println!("✅ api-generic (URL 없음) 테스트 통과");
    }

    #[tokio::test]
    async fn test_api_kipris_no_key() {
        let node = create_test_node("api-kipris", json!({
            "search_type": "patent",
            "query": "건설"
        }));
        let input = json!({});

        let result = execute_node_for_test(&node, &input).await;
        assert!(result.is_ok());

        let output = result.unwrap();
        assert_eq!(output.get("status").and_then(|v| v.as_str()), Some("error"));
        assert!(output.get("error").and_then(|v| v.as_str()).unwrap_or("").contains("API 키"));
        println!("✅ api-kipris (API 키 없음) 테스트 통과");
    }

    // ========================================
    // MCP/BIM 노드 테스트
    // ========================================

    #[tokio::test]
    async fn test_mcp_server_node() {
        let node = create_test_node("mcp-server", json!({
            "endpoint": "localhost:8080"
        }));
        let input = json!({});

        let result = execute_node_for_test(&node, &input).await;
        assert!(result.is_ok(), "mcp-server 노드 실행 실패: {:?}", result.err());

        let output = result.unwrap();
        assert_eq!(output.get("mcp_type").and_then(|v| v.as_str()), Some("mcp-server"));
        println!("✅ mcp-server 노드 테스트 통과");
    }

    #[tokio::test]
    async fn test_ifc_parser_node() {
        let node = create_test_node("ifc-parser", json!({}));
        let input = json!({});

        let result = execute_node_for_test(&node, &input).await;
        assert!(result.is_ok(), "ifc-parser 노드 실행 실패: {:?}", result.err());

        let output = result.unwrap();
        assert_eq!(output.get("type").and_then(|v| v.as_str()), Some("bim"));
        println!("✅ ifc-parser 노드 테스트 통과");
    }

    // ========================================
    // 에이전트 노드 테스트
    // ========================================

    #[tokio::test]
    async fn test_custom_agent_node() {
        let node = create_test_node("custom-agent", json!({
            "model_id": "anthropic.claude-3-haiku-20240307-v1:0",
            "system_prompt": "당신은 도움이 되는 AI 어시스턴트입니다."
        }));
        let input = json!({
            "query": "안녕하세요"
        });

        let result = execute_node_for_test(&node, &input).await;
        assert!(result.is_ok(), "custom-agent 노드 실행 실패: {:?}", result.err());

        let output = result.unwrap();
        assert_eq!(output.get("agent_type").and_then(|v| v.as_str()), Some("custom-agent"));
        println!("✅ custom-agent 노드 테스트 통과");
    }

    #[tokio::test]
    async fn test_rag_agent_node() {
        let node = create_test_node("rag-agent", json!({
            "kb_id": "TEST_KB_ID"
        }));
        let input = json!({
            "query": "테스트 쿼리"
        });

        let result = execute_node_for_test(&node, &input).await;
        assert!(result.is_ok(), "rag-agent 노드 실행 실패: {:?}", result.err());
        println!("✅ rag-agent 노드 테스트 통과");
    }

    // ========================================
    // 모델 노드 테스트 (API 호출 없이 입력 검증)
    // ========================================

    #[tokio::test]
    async fn test_model_claude_no_input() {
        let node = create_test_node("model-claude-3-haiku", json!({
            "system_prompt": "테스트"
        }));
        let input = json!({});

        let result = execute_node_for_test(&node, &input).await;
        assert!(result.is_ok());

        let output = result.unwrap();
        assert_eq!(output.get("status").and_then(|v| v.as_str()), Some("error"));
        assert!(output.get("error").and_then(|v| v.as_str()).unwrap_or("").contains("입력 텍스트"));
        println!("✅ model-claude-3-haiku (입력 없음) 테스트 통과");
    }

    // ========================================
    // 알 수 없는 노드 타입 테스트
    // ========================================

    #[tokio::test]
    async fn test_unknown_node_type() {
        let node = create_test_node("unknown-node-type-xyz", json!({}));
        let input = json!({"data": "test"});

        let result = execute_node_for_test(&node, &input).await;
        assert!(result.is_ok(), "unknown 노드 실행 실패: {:?}", result.err());

        let output = result.unwrap();
        assert_eq!(output.get("type").and_then(|v| v.as_str()), Some("unknown"));
        assert_eq!(output.get("status").and_then(|v| v.as_str()), Some("passthrough"));
        println!("✅ unknown 노드 타입 테스트 통과 (passthrough)");
    }

    // ====== 문서 파싱 노드 테스트 ======

    #[tokio::test]
    async fn test_doc_pdf_parser_no_path() {
        let node = create_test_node("doc-pdf-parser", json!({}));
        let input = json!({});

        let result = execute_node_for_test(&node, &input).await;
        assert!(result.is_ok(), "PDF 파서 노드 실행 실패: {:?}", result.err());

        let output = result.unwrap();
        assert_eq!(output.get("format").and_then(|v| v.as_str()), Some("pdf"));
        assert_eq!(output.get("status").and_then(|v| v.as_str()), Some("error"));
        assert!(output.get("error").is_some(), "에러 메시지가 있어야 함");
        println!("✅ PDF 파서 노드 테스트 통과 (경로 미설정 에러)");
    }

    #[tokio::test]
    async fn test_doc_pdf_parser_file_not_found() {
        let node = create_test_node("doc-pdf-parser", json!({
            "file_path": "non_existent_file.pdf"
        }));
        let input = json!({});

        let result = execute_node_for_test(&node, &input).await;
        assert!(result.is_ok(), "PDF 파서 노드 실행 실패: {:?}", result.err());

        let output = result.unwrap();
        assert_eq!(output.get("status").and_then(|v| v.as_str()), Some("error"));
        println!("✅ PDF 파서 노드 테스트 통과 (파일 없음 에러)");
    }

    #[tokio::test]
    async fn test_doc_excel_parser_no_path() {
        let node = create_test_node("doc-excel-parser", json!({}));
        let input = json!({});

        let result = execute_node_for_test(&node, &input).await;
        assert!(result.is_ok(), "Excel 파서 노드 실행 실패: {:?}", result.err());

        let output = result.unwrap();
        assert_eq!(output.get("format").and_then(|v| v.as_str()), Some("excel"));
        assert_eq!(output.get("status").and_then(|v| v.as_str()), Some("error"));
        println!("✅ Excel 파서 노드 테스트 통과 (경로 미설정 에러)");
    }

    #[tokio::test]
    async fn test_doc_excel_parser_file_not_found() {
        let node = create_test_node("doc-excel-parser", json!({
            "file_path": "non_existent_file.xlsx"
        }));
        let input = json!({});

        let result = execute_node_for_test(&node, &input).await;
        assert!(result.is_ok(), "Excel 파서 노드 실행 실패: {:?}", result.err());

        let output = result.unwrap();
        assert_eq!(output.get("status").and_then(|v| v.as_str()), Some("error"));
        println!("✅ Excel 파서 노드 테스트 통과 (파일 없음 에러)");
    }

    // ====== 문서 내보내기 노드 테스트 ======

    #[tokio::test]
    async fn test_export_pdf_no_path() {
        let node = create_test_node("export-pdf", json!({}));
        let input = json!({
            "text": "Hello World"
        });

        let result = execute_node_for_test(&node, &input).await;
        assert!(result.is_ok(), "PDF 내보내기 노드 실행 실패: {:?}", result.err());

        let output = result.unwrap();
        assert_eq!(output.get("format").and_then(|v| v.as_str()), Some("pdf"));
        assert_eq!(output.get("status").and_then(|v| v.as_str()), Some("error"));
        println!("✅ PDF 내보내기 노드 테스트 통과 (경로 미설정 에러)");
    }

    #[tokio::test]
    async fn test_export_excel_no_path() {
        let node = create_test_node("export-excel", json!({}));
        let input = json!({
            "data": [{"name": "test", "value": 123}]
        });

        let result = execute_node_for_test(&node, &input).await;
        assert!(result.is_ok(), "Excel 내보내기 노드 실행 실패: {:?}", result.err());

        let output = result.unwrap();
        assert_eq!(output.get("format").and_then(|v| v.as_str()), Some("excel"));
        assert_eq!(output.get("status").and_then(|v| v.as_str()), Some("error"));
        println!("✅ Excel 내보내기 노드 테스트 통과 (경로 미설정 에러)");
    }

    #[tokio::test]
    async fn test_export_word_no_path() {
        let node = create_test_node("export-word", json!({}));
        let input = json!({
            "text": "Hello World"
        });

        let result = execute_node_for_test(&node, &input).await;
        assert!(result.is_ok(), "Word 내보내기 노드 실행 실패: {:?}", result.err());

        let output = result.unwrap();
        assert_eq!(output.get("format").and_then(|v| v.as_str()), Some("word"));
        assert_eq!(output.get("status").and_then(|v| v.as_str()), Some("error"));
        println!("✅ Word 내보내기 노드 테스트 통과 (경로 미설정 에러)");
    }

    #[tokio::test]
    async fn test_export_pdf_with_temp_file() {
        use std::env;
        let temp_dir = env::temp_dir();
        let output_path = temp_dir.join("test_export.pdf");

        let node = create_test_node("export-pdf", json!({
            "output_path": output_path.to_str().unwrap(),
            "title": "Test Document"
        }));
        let input = json!({
            "text": "This is a test document.\nLine 2.\nLine 3."
        });

        let result = execute_node_for_test(&node, &input).await;
        assert!(result.is_ok(), "PDF 내보내기 노드 실행 실패: {:?}", result.err());

        let output = result.unwrap();
        assert_eq!(output.get("status").and_then(|v| v.as_str()), Some("executed"));
        assert_eq!(output.get("saved").and_then(|v| v.as_bool()), Some(true));

        // 파일이 생성되었는지 확인
        assert!(output_path.exists(), "PDF 파일이 생성되지 않음");

        // 테스트 후 정리
        let _ = std::fs::remove_file(&output_path);
        println!("✅ PDF 내보내기 노드 테스트 통과 (파일 생성 성공)");
    }

    #[tokio::test]
    async fn test_export_excel_with_temp_file() {
        use std::env;
        let temp_dir = env::temp_dir();
        let output_path = temp_dir.join("test_export.xlsx");

        let node = create_test_node("export-excel", json!({
            "output_path": output_path.to_str().unwrap(),
            "sheet_name": "TestSheet"
        }));
        let input = json!({
            "data": [
                {"name": "Alice", "age": 30, "city": "Seoul"},
                {"name": "Bob", "age": 25, "city": "Busan"}
            ]
        });

        let result = execute_node_for_test(&node, &input).await;
        assert!(result.is_ok(), "Excel 내보내기 노드 실행 실패: {:?}", result.err());

        let output = result.unwrap();
        assert_eq!(output.get("status").and_then(|v| v.as_str()), Some("executed"));
        assert_eq!(output.get("saved").and_then(|v| v.as_bool()), Some(true));

        // 파일이 생성되었는지 확인
        assert!(output_path.exists(), "Excel 파일이 생성되지 않음");

        // 테스트 후 정리
        let _ = std::fs::remove_file(&output_path);
        println!("✅ Excel 내보내기 노드 테스트 통과 (파일 생성 성공)");
    }

    #[tokio::test]
    async fn test_export_word_with_temp_file() {
        use std::env;
        let temp_dir = env::temp_dir();
        let output_path = temp_dir.join("test_export.docx");

        let node = create_test_node("export-word", json!({
            "output_path": output_path.to_str().unwrap(),
            "title": "Test Document"
        }));
        let input = json!({
            "text": "This is a test document.\n\nSecond paragraph.\n\nThird paragraph."
        });

        let result = execute_node_for_test(&node, &input).await;
        assert!(result.is_ok(), "Word 내보내기 노드 실행 실패: {:?}", result.err());

        let output = result.unwrap();
        assert_eq!(output.get("status").and_then(|v| v.as_str()), Some("executed"));
        assert_eq!(output.get("saved").and_then(|v| v.as_bool()), Some(true));

        // 파일이 생성되었는지 확인
        assert!(output_path.exists(), "Word 파일이 생성되지 않음");

        // 테스트 후 정리
        let _ = std::fs::remove_file(&output_path);
        println!("✅ Word 내보내기 노드 테스트 통과 (파일 생성 성공)");
    }

    #[tokio::test]
    async fn test_doc_hwp_parser_unsupported() {
        let node = create_test_node("doc-hwp-parser", json!({
            "file_path": "test.hwp"
        }));
        let input = json!({});

        let result = execute_node_for_test(&node, &input).await;
        assert!(result.is_ok(), "HWP 파서 노드 실행 실패: {:?}", result.err());

        let output = result.unwrap();
        assert_eq!(output.get("format").and_then(|v| v.as_str()), Some("hwp"));
        assert_eq!(output.get("status").and_then(|v| v.as_str()), Some("pending"));
        assert!(output.get("suggestion").is_some(), "AWS Textract 권장 메시지가 있어야 함");
        println!("✅ HWP 파서 노드 테스트 통과 (AWS Textract 권장)");
    }

    #[tokio::test]
    async fn test_export_ppt_no_path() {
        let node = create_test_node("export-ppt", json!({}));
        let input = json!({
            "text": "Hello World"
        });

        let result = execute_node_for_test(&node, &input).await;
        assert!(result.is_ok(), "PPT 내보내기 노드 실행 실패: {:?}", result.err());

        let output = result.unwrap();
        assert_eq!(output.get("format").and_then(|v| v.as_str()), Some("ppt"));
        assert_eq!(output.get("status").and_then(|v| v.as_str()), Some("error"));
        println!("✅ PPT 내보내기 노드 테스트 통과 (경로 미설정 에러)");
    }

    #[tokio::test]
    async fn test_export_ppt_with_temp_file() {
        use std::env;
        let temp_dir = env::temp_dir();
        let output_path = temp_dir.join("test_export.pptx");

        let node = create_test_node("export-ppt", json!({
            "output_path": output_path.to_str().unwrap(),
            "title": "Test Presentation"
        }));
        let input = json!({
            "text": "This is slide 1 content.\n\nThis is slide 2 content.\n\nThis is slide 3 content."
        });

        let result = execute_node_for_test(&node, &input).await;
        assert!(result.is_ok(), "PPT 내보내기 노드 실행 실패: {:?}", result.err());

        let output = result.unwrap();
        assert_eq!(output.get("status").and_then(|v| v.as_str()), Some("executed"));
        assert_eq!(output.get("saved").and_then(|v| v.as_bool()), Some(true));

        // 파일이 생성되었는지 확인
        assert!(output_path.exists(), "PPT 파일이 생성되지 않음");

        // 테스트 후 정리
        let _ = std::fs::remove_file(&output_path);
        println!("✅ PPT 내보내기 노드 테스트 통과 (파일 생성 성공)");
    }

    // 테스트용 execute_node 래퍼
    async fn execute_node_for_test(
        node: &WorkflowNode,
        input: &serde_json::Value,
    ) -> Result<serde_json::Value, String> {
        execute_node(node, input).await
    }
}
