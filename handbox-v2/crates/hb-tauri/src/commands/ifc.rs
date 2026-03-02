//! IFC Commands - IFC 4x3 file parsing and analysis
//!
//! Provides Tauri commands for reading, analyzing, and extracting
//! data from IFC (Industry Foundation Classes) files.

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::Path;
use tauri::command;

// ============================================================================
// Types
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IfcEntity {
    pub id: u64,
    pub entity_type: String,
    #[serde(rename = "GlobalId")]
    pub global_id: Option<String>,
    #[serde(rename = "Name")]
    pub name: Option<String>,
    #[serde(rename = "Description")]
    pub description: Option<String>,
    pub attributes: HashMap<String, serde_json::Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IfcModel {
    pub schema: String,
    pub file_description: Option<String>,
    pub file_name: Option<String>,
    pub entities: HashMap<String, IfcEntity>,
    pub entity_count: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IfcHierarchyNode {
    pub id: String,
    pub name: String,
    pub entity_type: String,
    pub children: Vec<IfcHierarchyNode>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IfcElementSummary {
    pub element_type: String,
    pub count: usize,
    pub instances: Vec<IfcEntityRef>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IfcEntityRef {
    pub id: String,
    pub name: Option<String>,
    pub global_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IfcProperty {
    pub name: String,
    pub value: serde_json::Value,
    pub property_type: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IfcPropertySet {
    pub name: String,
    pub properties: Vec<IfcProperty>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IfcQuantity {
    pub name: String,
    pub value: f64,
    pub unit: Option<String>,
    pub quantity_type: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IfcModelStatistics {
    pub schema: String,
    pub total_entities: usize,
    pub entity_types: HashMap<String, usize>,
    pub spatial_structure: Option<IfcHierarchyNode>,
    pub building_elements: HashMap<String, usize>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IfcReadResult {
    pub model: IfcModel,
    pub statistics: IfcModelStatistics,
}

// ============================================================================
// Commands - File I/O
// ============================================================================

/// Read and parse an IFC file
#[command]
pub async fn ifc_read_file(file_path: String) -> Result<IfcReadResult, String> {
    let path = Path::new(&file_path);

    if !path.exists() {
        return Err(format!("IFC file not found: {}", file_path));
    }

    let content = std::fs::read_to_string(path)
        .map_err(|e| format!("Failed to read file: {}", e))?;

    let model = parse_ifc_content(&content)?;
    let statistics = calculate_statistics(&model);

    Ok(IfcReadResult { model, statistics })
}

/// Parse IFC content from string
#[command]
pub async fn ifc_parse_content(content: String) -> Result<IfcReadResult, String> {
    let model = parse_ifc_content(&content)?;
    let statistics = calculate_statistics(&model);

    Ok(IfcReadResult { model, statistics })
}

// ============================================================================
// Commands - Analysis
// ============================================================================

/// Extract spatial hierarchy (Project > Site > Building > Storey > Space)
#[command]
pub async fn ifc_extract_hierarchy(model: IfcModel) -> Result<Option<IfcHierarchyNode>, String> {
    Ok(build_spatial_hierarchy(&model))
}

/// Get element summary by type
#[command]
pub async fn ifc_get_element_summary(model: IfcModel) -> Result<Vec<IfcElementSummary>, String> {
    let mut summaries: HashMap<String, Vec<IfcEntityRef>> = HashMap::new();

    for (id, entity) in &model.entities {
        // Filter to building elements
        if is_building_element(&entity.entity_type) {
            let refs = summaries.entry(entity.entity_type.clone()).or_default();
            refs.push(IfcEntityRef {
                id: id.clone(),
                name: entity.name.clone(),
                global_id: entity.global_id.clone().unwrap_or_default(),
            });
        }
    }

    Ok(summaries
        .into_iter()
        .map(|(element_type, instances)| IfcElementSummary {
            count: instances.len(),
            element_type,
            instances,
        })
        .collect())
}

/// Get properties for an entity
#[command]
pub async fn ifc_get_entity_properties(
    model: IfcModel,
    entity_id: String,
) -> Result<Vec<IfcPropertySet>, String> {
    let entity = model.entities.get(&entity_id)
        .ok_or_else(|| format!("Entity not found: {}", entity_id))?;

    // Extract property sets from the entity's attributes
    let mut property_sets = Vec::new();

    // Basic attributes as a property set
    let mut basic_props = Vec::new();

    if let Some(name) = &entity.name {
        basic_props.push(IfcProperty {
            name: "Name".to_string(),
            value: serde_json::Value::String(name.clone()),
            property_type: "IfcLabel".to_string(),
        });
    }

    if let Some(desc) = &entity.description {
        basic_props.push(IfcProperty {
            name: "Description".to_string(),
            value: serde_json::Value::String(desc.clone()),
            property_type: "IfcText".to_string(),
        });
    }

    if let Some(gid) = &entity.global_id {
        basic_props.push(IfcProperty {
            name: "GlobalId".to_string(),
            value: serde_json::Value::String(gid.clone()),
            property_type: "IfcGloballyUniqueId".to_string(),
        });
    }

    if !basic_props.is_empty() {
        property_sets.push(IfcPropertySet {
            name: "Basic Properties".to_string(),
            properties: basic_props,
        });
    }

    // Additional attributes
    let mut attr_props: Vec<IfcProperty> = entity.attributes
        .iter()
        .filter(|(k, _)| !["Name", "Description", "GlobalId"].contains(&k.as_str()))
        .map(|(k, v)| IfcProperty {
            name: k.clone(),
            value: v.clone(),
            property_type: "IfcValue".to_string(),
        })
        .collect();

    if !attr_props.is_empty() {
        property_sets.push(IfcPropertySet {
            name: "Attributes".to_string(),
            properties: attr_props,
        });
    }

    Ok(property_sets)
}

/// Get quantities for an entity
#[command]
pub async fn ifc_get_entity_quantities(
    model: IfcModel,
    entity_id: String,
) -> Result<Vec<IfcQuantity>, String> {
    let entity = model.entities.get(&entity_id)
        .ok_or_else(|| format!("Entity not found: {}", entity_id))?;

    // Extract quantities from attributes
    let mut quantities = Vec::new();

    for (key, value) in &entity.attributes {
        if key.contains("Length") || key.contains("Area") || key.contains("Volume") ||
           key.contains("Width") || key.contains("Height") || key.contains("Depth") {
            if let Some(num) = value.as_f64() {
                let unit = if key.contains("Area") {
                    Some("m²".to_string())
                } else if key.contains("Volume") {
                    Some("m³".to_string())
                } else {
                    Some("m".to_string())
                };

                quantities.push(IfcQuantity {
                    name: key.clone(),
                    value: num,
                    unit,
                    quantity_type: determine_quantity_type(key),
                });
            }
        }
    }

    Ok(quantities)
}

/// Search entities by type or name
#[command]
pub async fn ifc_search_entities(
    model: IfcModel,
    query: String,
    entity_type: Option<String>,
) -> Result<Vec<IfcEntityRef>, String> {
    let query_lower = query.to_lowercase();

    let results: Vec<IfcEntityRef> = model.entities
        .iter()
        .filter(|(_, entity)| {
            // Filter by type if specified
            if let Some(ref et) = entity_type {
                if !entity.entity_type.eq_ignore_ascii_case(et) {
                    return false;
                }
            }

            // Search in name, description, and global id
            let name_match = entity.name.as_ref()
                .map(|n| n.to_lowercase().contains(&query_lower))
                .unwrap_or(false);

            let desc_match = entity.description.as_ref()
                .map(|d| d.to_lowercase().contains(&query_lower))
                .unwrap_or(false);

            let gid_match = entity.global_id.as_ref()
                .map(|g| g.to_lowercase().contains(&query_lower))
                .unwrap_or(false);

            name_match || desc_match || gid_match
        })
        .map(|(id, entity)| IfcEntityRef {
            id: id.clone(),
            name: entity.name.clone(),
            global_id: entity.global_id.clone().unwrap_or_default(),
        })
        .collect();

    Ok(results)
}

/// Get model statistics
#[command]
pub async fn ifc_get_statistics(model: IfcModel) -> Result<IfcModelStatistics, String> {
    Ok(calculate_statistics(&model))
}

// ============================================================================
// Commands - Export
// ============================================================================

/// Export model summary as JSON
#[command]
pub async fn ifc_export_summary_json(
    model: IfcModel,
    output_path: String,
) -> Result<String, String> {
    let stats = calculate_statistics(&model);
    let json = serde_json::to_string_pretty(&stats)
        .map_err(|e| format!("Failed to serialize: {}", e))?;

    std::fs::write(&output_path, json)
        .map_err(|e| format!("Failed to write file: {}", e))?;

    Ok(output_path)
}

/// Export elements as CSV
#[command]
pub async fn ifc_export_elements_csv(
    model: IfcModel,
    output_path: String,
    element_types: Option<Vec<String>>,
) -> Result<String, String> {
    let mut csv = "GlobalId,Type,Name,Description\n".to_string();

    for (_, entity) in &model.entities {
        // Filter by type if specified
        if let Some(ref types) = element_types {
            if !types.iter().any(|t| entity.entity_type.eq_ignore_ascii_case(t)) {
                continue;
            }
        }

        if !is_building_element(&entity.entity_type) {
            continue;
        }

        let gid = entity.global_id.as_deref().unwrap_or("");
        let name = entity.name.as_deref().unwrap_or("");
        let desc = entity.description.as_deref().unwrap_or("");

        csv.push_str(&format!(
            "\"{}\",\"{}\",\"{}\",\"{}\"\n",
            gid, entity.entity_type, name, desc
        ));
    }

    std::fs::write(&output_path, csv)
        .map_err(|e| format!("Failed to write file: {}", e))?;

    Ok(output_path)
}

// ============================================================================
// Commands - Modification
// ============================================================================

/// Modify attributes of an existing entity
#[command]
pub async fn ifc_modify_entity(
    mut model: IfcModel,
    entity_id: String,
    updates: HashMap<String, serde_json::Value>,
) -> Result<IfcModel, String> {
    let entity = model.entities.get_mut(&entity_id)
        .ok_or_else(|| format!("Entity not found: {}", entity_id))?;

    for (key, value) in &updates {
        match key.as_str() {
            "Name" => entity.name = value.as_str().map(String::from),
            "Description" => entity.description = value.as_str().map(String::from),
            "GlobalId" => entity.global_id = value.as_str().map(String::from),
            _ => { entity.attributes.insert(key.clone(), value.clone()); }
        }
    }

    Ok(model)
}

/// Add a new entity to the model
#[command]
pub async fn ifc_add_entity(
    mut model: IfcModel,
    entity_type: String,
    name: Option<String>,
    description: Option<String>,
    attributes: Option<HashMap<String, serde_json::Value>>,
) -> Result<IfcModel, String> {
    // Generate a new entity ID (find max existing + 1)
    let max_id = model.entities.values()
        .map(|e| e.id)
        .max()
        .unwrap_or(0);
    let new_id = max_id + 1;

    let entity = IfcEntity {
        id: new_id,
        entity_type: entity_type.clone(),
        global_id: Some(generate_ifc_guid()),
        name,
        description,
        attributes: attributes.unwrap_or_default(),
    };

    model.entities.insert(format!("#{}", new_id), entity);
    model.entity_count = model.entities.len();

    Ok(model)
}

/// Remove an entity from the model
#[command]
pub async fn ifc_remove_entity(
    mut model: IfcModel,
    entity_id: String,
) -> Result<IfcModel, String> {
    model.entities.remove(&entity_id)
        .ok_or_else(|| format!("Entity not found: {}", entity_id))?;
    model.entity_count = model.entities.len();

    Ok(model)
}

/// Clone an entity (duplicate with new ID and GlobalId)
#[command]
pub async fn ifc_clone_entity(
    mut model: IfcModel,
    entity_id: String,
    new_name: Option<String>,
) -> Result<IfcModel, String> {
    let source = model.entities.get(&entity_id)
        .ok_or_else(|| format!("Entity not found: {}", entity_id))?
        .clone();

    let max_id = model.entities.values()
        .map(|e| e.id)
        .max()
        .unwrap_or(0);
    let new_id = max_id + 1;

    let new_entity = IfcEntity {
        id: new_id,
        entity_type: source.entity_type,
        global_id: Some(generate_ifc_guid()),
        name: new_name.or(source.name.map(|n| format!("{} (copy)", n))),
        description: source.description,
        attributes: source.attributes,
    };

    model.entities.insert(format!("#{}", new_id), new_entity);
    model.entity_count = model.entities.len();

    Ok(model)
}

// ============================================================================
// Commands - Write
// ============================================================================

/// Write IFC model back to STEP format file
#[command]
pub async fn ifc_write_file(
    model: IfcModel,
    output_path: String,
) -> Result<String, String> {
    let content = serialize_ifc_model(&model)?;

    std::fs::write(&output_path, &content)
        .map_err(|e| format!("Failed to write file: {}", e))?;

    Ok(format!("Wrote IFC file ({} entities, {} bytes) to {}",
        model.entity_count, content.len(), output_path))
}

/// Merge two IFC models
#[command]
pub async fn ifc_merge_models(
    mut base_model: IfcModel,
    merge_model: IfcModel,
) -> Result<IfcModel, String> {
    // Find max ID in base model
    let max_id = base_model.entities.values()
        .map(|e| e.id)
        .max()
        .unwrap_or(0);

    // Add entities from merge model with offset IDs
    let mut offset = 0u64;
    for (_, entity) in &merge_model.entities {
        offset += 1;
        let new_id = max_id + offset;
        let mut new_entity = entity.clone();
        new_entity.id = new_id;
        // Generate new GlobalId to avoid conflicts
        new_entity.global_id = Some(generate_ifc_guid());
        base_model.entities.insert(format!("#{}", new_id), new_entity);
    }

    base_model.entity_count = base_model.entities.len();

    Ok(base_model)
}

// ============================================================================
// Helper Functions
// ============================================================================

/// Generate a 22-character IFC GUID (base64-like encoding)
fn generate_ifc_guid() -> String {
    let uuid = uuid::Uuid::new_v4();
    let bytes = uuid.as_bytes();

    // IFC uses a custom base64 encoding for 22-char GUIDs
    const CHARS: &[u8] = b"0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz_$";
    let mut result = String::with_capacity(22);

    // Encode 16 bytes into 22 base64 characters (6 bits per char)
    let mut bits: u128 = 0;
    for b in bytes {
        bits = (bits << 8) | (*b as u128);
    }

    for _ in 0..22 {
        let idx = (bits & 0x3F) as usize;
        result.push(CHARS[idx] as char);
        bits >>= 6;
    }

    result
}

/// Serialize IFC model to STEP format string
fn serialize_ifc_model(model: &IfcModel) -> Result<String, String> {
    let mut output = String::new();

    // HEADER
    output.push_str("ISO-10303-21;\nHEADER;\n");
    output.push_str(&format!("FILE_DESCRIPTION(('{}'), '2;1');\n",
        model.file_description.as_deref().unwrap_or("Handbox Generated")));
    output.push_str(&format!("FILE_NAME('{}', '{}', (''), (''), '', 'Handbox v2', '');\n",
        model.file_name.as_deref().unwrap_or("output.ifc"),
        chrono::Utc::now().format("%Y-%m-%dT%H:%M:%S")));
    output.push_str(&format!("FILE_SCHEMA(('{}'));\n", model.schema));
    output.push_str("ENDSEC;\n\n");

    // DATA
    output.push_str("DATA;\n");

    // Sort entities by ID for consistent output
    let mut entities: Vec<(&String, &IfcEntity)> = model.entities.iter().collect();
    entities.sort_by_key(|(_, e)| e.id);

    for (_, entity) in &entities {
        let mut params = Vec::new();

        // GlobalId
        if let Some(ref gid) = entity.global_id {
            params.push(format!("'{}'", gid));
        } else {
            params.push("$".to_string());
        }

        // OwnerHistory (placeholder)
        params.push("$".to_string());

        // Name
        if let Some(ref name) = entity.name {
            params.push(format!("'{}'", name.replace('\'', "''")));
        } else {
            params.push("$".to_string());
        }

        // Description
        if let Some(ref desc) = entity.description {
            params.push(format!("'{}'", desc.replace('\'', "''")));
        } else {
            params.push("$".to_string());
        }

        // Additional attributes
        for (key, value) in &entity.attributes {
            if ["Name", "Description", "GlobalId"].contains(&key.as_str()) {
                continue;
            }
            match value {
                serde_json::Value::String(s) => params.push(format!("'{}'", s)),
                serde_json::Value::Number(n) => params.push(n.to_string()),
                serde_json::Value::Bool(b) => params.push(if *b { ".T.".to_string() } else { ".F.".to_string() }),
                serde_json::Value::Null => params.push("$".to_string()),
                other => params.push(format!("'{}'", other)),
            }
        }

        output.push_str(&format!("#{}={}({});\n",
            entity.id,
            entity.entity_type,
            params.join(",")
        ));
    }

    output.push_str("ENDSEC;\n");
    output.push_str("END-ISO-10303-21;\n");

    Ok(output)
}

fn parse_ifc_content(content: &str) -> Result<IfcModel, String> {
    let mut model = IfcModel {
        schema: "IFC4X3".to_string(),
        file_description: None,
        file_name: None,
        entities: HashMap::new(),
        entity_count: 0,
    };

    // Parse HEADER section
    if let Some(header_start) = content.find("HEADER;") {
        if let Some(header_end) = content.find("ENDSEC;") {
            let header = &content[header_start..header_end];

            // Extract FILE_DESCRIPTION
            if let Some(fd_start) = header.find("FILE_DESCRIPTION") {
                if let Some(fd_end) = header[fd_start..].find(");") {
                    model.file_description = Some(header[fd_start..fd_start+fd_end+2].to_string());
                }
            }

            // Extract FILE_SCHEMA to determine version
            if header.contains("IFC4X3") {
                model.schema = "IFC4X3".to_string();
            } else if header.contains("IFC4") {
                model.schema = "IFC4".to_string();
            } else if header.contains("IFC2X3") {
                model.schema = "IFC2X3".to_string();
            }
        }
    }

    // Parse DATA section
    if let Some(data_start) = content.find("DATA;") {
        if let Some(data_end) = content.rfind("ENDSEC;") {
            let data = &content[data_start+5..data_end];

            // Parse each entity line
            for line in data.lines() {
                let line = line.trim();

                // Skip empty lines and comments
                if line.is_empty() || line.starts_with("/*") {
                    continue;
                }

                // Parse entity: #123=IFCWALL(...)
                if let Some(eq_pos) = line.find('=') {
                    let id_str = line[1..eq_pos].trim();
                    if let Ok(id) = id_str.parse::<u64>() {
                        if let Some(paren_pos) = line.find('(') {
                            let entity_type = &line[eq_pos+1..paren_pos];

                            // Extract basic attributes
                            let entity = parse_entity(id, entity_type, line);
                            model.entities.insert(format!("#{}", id), entity);
                        }
                    }
                }
            }
        }
    }

    model.entity_count = model.entities.len();
    Ok(model)
}

fn parse_entity(id: u64, entity_type: &str, line: &str) -> IfcEntity {
    let mut entity = IfcEntity {
        id,
        entity_type: entity_type.to_string(),
        global_id: None,
        name: None,
        description: None,
        attributes: HashMap::new(),
    };

    // Extract content between parentheses
    if let Some(start) = line.find('(') {
        if let Some(end) = line.rfind(')') {
            let params = &line[start+1..end];
            let parts: Vec<&str> = split_ifc_params(params);

            // For most IFC entities, the order is:
            // GlobalId, OwnerHistory, Name, Description, ...
            if !parts.is_empty() && parts[0] != "$" && parts[0] != "*" {
                let gid = parts[0].trim_matches('\'');
                entity.global_id = Some(gid.to_string());
            }

            if parts.len() > 2 && parts[2] != "$" && parts[2] != "*" {
                let name = parts[2].trim_matches('\'');
                entity.name = Some(name.to_string());
            }

            if parts.len() > 3 && parts[3] != "$" && parts[3] != "*" {
                let desc = parts[3].trim_matches('\'');
                entity.description = Some(desc.to_string());
            }
        }
    }

    entity
}

fn split_ifc_params(params: &str) -> Vec<&str> {
    let mut parts = Vec::new();
    let mut depth = 0;
    let mut start = 0;

    for (i, c) in params.char_indices() {
        match c {
            '(' => depth += 1,
            ')' => depth -= 1,
            ',' if depth == 0 => {
                parts.push(params[start..i].trim());
                start = i + 1;
            }
            _ => {}
        }
    }

    if start < params.len() {
        parts.push(params[start..].trim());
    }

    parts
}

fn calculate_statistics(model: &IfcModel) -> IfcModelStatistics {
    let mut entity_types: HashMap<String, usize> = HashMap::new();
    let mut building_elements: HashMap<String, usize> = HashMap::new();

    for entity in model.entities.values() {
        *entity_types.entry(entity.entity_type.clone()).or_insert(0) += 1;

        if is_building_element(&entity.entity_type) {
            *building_elements.entry(entity.entity_type.clone()).or_insert(0) += 1;
        }
    }

    let spatial_structure = build_spatial_hierarchy(model);

    IfcModelStatistics {
        schema: model.schema.clone(),
        total_entities: model.entity_count,
        entity_types,
        spatial_structure,
        building_elements,
    }
}

fn build_spatial_hierarchy(model: &IfcModel) -> Option<IfcHierarchyNode> {
    // Find the project entity
    let project = model.entities.values()
        .find(|e| e.entity_type == "IFCPROJECT" || e.entity_type == "IfcProject")?;

    Some(IfcHierarchyNode {
        id: format!("#{}", project.id),
        name: project.name.clone().unwrap_or_else(|| "Project".to_string()),
        entity_type: project.entity_type.clone(),
        children: find_spatial_children(model, project.id),
    })
}

fn find_spatial_children(model: &IfcModel, _parent_id: u64) -> Vec<IfcHierarchyNode> {
    // In a full implementation, this would parse IfcRelAggregates relationships
    // For now, return a simple hierarchy based on entity types

    let spatial_types = ["IFCSITE", "IFCBUILDING", "IFCBUILDINGSTOREY", "IFCSPACE",
                        "IfcSite", "IfcBuilding", "IfcBuildingStorey", "IfcSpace"];

    model.entities.values()
        .filter(|e| spatial_types.contains(&e.entity_type.as_str()))
        .map(|e| IfcHierarchyNode {
            id: format!("#{}", e.id),
            name: e.name.clone().unwrap_or_else(|| e.entity_type.clone()),
            entity_type: e.entity_type.clone(),
            children: vec![],
        })
        .collect()
}

fn is_building_element(entity_type: &str) -> bool {
    let building_elements = [
        "IFCWALL", "IFCWALLSTANDARDCASE", "IFCSLAB", "IFCBEAM", "IFCCOLUMN",
        "IFCDOOR", "IFCWINDOW", "IFCROOF", "IFCSTAIR", "IFCRAILING",
        "IFCCURTAINWALL", "IFCBUILDINGELEMENTPROXY", "IFCFURNISHINGELEMENT",
        "IfcWall", "IfcWallStandardCase", "IfcSlab", "IfcBeam", "IfcColumn",
        "IfcDoor", "IfcWindow", "IfcRoof", "IfcStair", "IfcRailing",
        "IfcCurtainWall", "IfcBuildingElementProxy", "IfcFurnishingElement",
    ];

    building_elements.contains(&entity_type)
}

fn determine_quantity_type(key: &str) -> String {
    if key.contains("Length") { "IfcQuantityLength".to_string() }
    else if key.contains("Area") { "IfcQuantityArea".to_string() }
    else if key.contains("Volume") { "IfcQuantityVolume".to_string() }
    else if key.contains("Weight") { "IfcQuantityWeight".to_string() }
    else if key.contains("Count") { "IfcQuantityCount".to_string() }
    else { "IfcQuantityLength".to_string() }
}
